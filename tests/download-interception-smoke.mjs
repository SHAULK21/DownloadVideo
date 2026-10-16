import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chromium } from "playwright-core";
import JSZip from "jszip";
import { DownloadManager } from "../desktop/manager.mjs";
import { createServer } from "../desktop/server.mjs";
import { until } from "./desktop-fixture.mjs";

const temp = fs.mkdtempSync(
  path.join(os.tmpdir(), "omnigrab-browser-download-"),
);
const zip = new JSZip();
zip.file("payload.bin", Buffer.alloc(2 * 1024 * 1024, 42));
const bytes = await zip.generateAsync({
  type: "nodebuffer",
  compression: "STORE",
});
let sourceBase;
const source = http.createServer((req, res) => {
  if (req.url === "/watch") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(
      '<html><a id="first" href="/archive.zip">Download</a><a id="offline" href="/offline.zip">Offline fallback</a></html>',
    );
    return;
  }
  if (req.headers.referer !== sourceBase + "/watch") {
    res.writeHead(403);
    res.end();
    return;
  }
  const start = Number(req.headers.range?.match(/bytes=(\d+)-/)?.[1]) || 0;
  const end = Math.min(
    bytes.length - 1,
    Number(req.headers.range?.match(/bytes=\d+-(\d+)/)?.[1]) ||
      bytes.length - 1,
  );
  const ranged = !!req.headers.range;
  res.writeHead(ranged ? 206 : 200, {
    "Content-Type": "application/zip",
    "Content-Disposition": 'attachment; filename="archive.zip"',
    ETag: '"fixture"',
    "Content-Length": end - start + 1,
    ...(ranged
      ? { "Content-Range": `bytes ${start}-${end}/${bytes.length}` }
      : {}),
  });
  let offset = start;
  const timer = setInterval(() => {
    res.write(bytes.subarray(offset, Math.min(end + 1, offset + 32768)));
    offset += 32768;
    if (offset > end) {
      clearInterval(timer);
      res.end();
    }
  }, 20);
  res.on("close", () => clearInterval(timer));
});
await new Promise((r) => source.listen(0, "127.0.0.1", r));
sourceBase = "http://127.0.0.1:" + source.address().port;
const manager = new DownloadManager({ dataDir: path.join(temp, "state") });
manager.updateSettings({ defaultDownloadDir: path.join(temp, "native-files") });
const token = "c".repeat(64);
const server = createServer(manager, { port: 17893, token });
await new Promise((r) => server.listen(17893, "127.0.0.1", r));
let context,
  serverClosed = false;
try {
  const extension = path.resolve("extension");
  context = await chromium.launchPersistentContext(path.join(temp, "profile"), {
    channel: "chromium",
    headless: false,
    acceptDownloads: true,
    args: [
      "--disable-extensions-except=" + extension,
      "--load-extension=" + extension,
    ],
  });
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker"));
  await worker.evaluate(
    ({ token, settings }) => chrome.storage.local.set({ token, settings }),
    { token, settings: manager.settings },
  );
  const page = await context.newPage();
  await page.goto(sourceBase + "/watch");
  const firstDownload = page.waitForEvent("download");
  await page.locator("#first").click();
  const intercepted = await firstDownload;
  const task = await until(() => {
    const t = manager.tasks[0];
    assert.notEqual(t?.status, "error", t?.errorMsg);
    return t?.status === "completed" && t;
  });
  const hash = (b) => createHash("sha256").update(b).digest("hex");
  assert.equal(hash(fs.readFileSync(task.outputPath)), hash(bytes));
  assert.equal(manager.tasks.length, 1);
  assert.ok(
    await intercepted.failure(),
    "Browser's original download must be cancelled after native preparation",
  );
  const chromeState = await worker.evaluate(() => chrome.downloads.search({}));
  assert.ok(
    chromeState.some(
      (d) => d.state === "interrupted" && d.error === "USER_CANCELED",
    ),
  );
  assert.equal(
    Object.keys(
      await worker.evaluate(() => chrome.storage.local.get(null)),
    ).some((k) => k.startsWith("handoff_")),
    false,
  );
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  serverClosed = true;
  const fallbackDownload = page.waitForEvent("download");
  await page.locator("#offline").click();
  const fallback = await fallbackDownload;
  assert.equal(await fallback.failure(), null);
  assert.equal(hash(fs.readFileSync(await fallback.path())), hash(bytes));
  assert.equal(
    manager.tasks.length,
    1,
    "Offline fallback must not enqueue another native task",
  );
  console.log(
    "Real Chromium extension smoke passed: browser download paused, prepared, cancelled and transferred with exact SHA256 and Referer; app offline resumes browser download with exact SHA256.",
  );
} finally {
  await context?.close();
  await manager.shutdown();
  if (!serverClosed) {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
  await new Promise((r) => source.close(r));
  fs.rmSync(temp, {
    recursive: true,
    force: true,
    maxRetries: 20,
    retryDelay: 250,
  });
}
