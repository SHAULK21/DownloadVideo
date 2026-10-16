import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import { DownloadManager } from "../desktop/manager.mjs";
import { createServer } from "../desktop/server.mjs";
import { api, until } from "./desktop-fixture.mjs";

test("arbitrary files: exact ZIP/PDF/EXE bytes, safe names, Range/restart, changed sources, failures and transactional browser handoff", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "omnigrab-files-"));
  const zip = new JSZip();
  const payload = Buffer.alloc(2 * 1024 * 1024);
  for (let i = 0; i < payload.length; i++) payload[i] = i % 251;
  zip.file("данные.bin", payload);
  const bytes = await zip.generateAsync({
    type: "nodebuffer",
    compression: "STORE",
  });
  const changed = Buffer.from(bytes);
  changed[1234] ^= 1;
  let ranges = 0,
    version = 1,
    broken = true;
  const source = http.createServer((req, res) => {
    const route = new URL(req.url, "http://localhost").pathname;
    if (route === "/redirect") {
      res.writeHead(302, { Location: "/download" });
      res.end();
      return;
    }
    if (route === "/missing") {
      res.writeHead(404);
      res.end();
      return;
    }
    if (route === "/login") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<html>Login</html>");
      return;
    }
    const data =
      route === "/empty"
        ? Buffer.alloc(0)
        : route === "/changed.zip" && version === 2
          ? changed
          : bytes;
    const etag = '"v' + (route === "/changed.zip" ? version : 1) + '"';
    let start = Number(req.headers.range?.match(/bytes=(\d+)-/)?.[1]) || 0;
    let end = req.headers.range?.match(/bytes=\d+-(\d+)/)?.[1];
    if (req.headers["if-range"] && req.headers["if-range"] !== etag) start = 0;
    if (start) ranges++;
    const ranged =
      !!req.headers.range &&
      (!req.headers["if-range"] || req.headers["if-range"] === etag);
    end = end === undefined ? data.length - 1 : Number(end);
    const headers = {
      "Content-Type": route.endsWith(".pdf")
        ? "application/pdf"
        : "application/octet-stream",
      ETag: etag,
      "Content-Disposition":
        "attachment; filename*=UTF-8''%D0%B0%D1%80%D1%85%D0%B8%D0%B2.zip",
      ...(route === "/chunked"
        ? {}
        : { "Content-Length": Math.max(0, end - start + 1) }),
      ...(ranged
        ? { "Content-Range": `bytes ${start}-${end}/${data.length}` }
        : {}),
    };
    res.writeHead(ranged ? 206 : 200, headers);
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    if (route === "/truncated" && broken) {
      res.write(data.subarray(0, 1024));
      setTimeout(() => res.destroy(), 20);
      return;
    }
    if (["/slow.zip", "/changed.zip"].includes(route)) {
      let index = start;
      const timer = setInterval(() => {
        res.write(data.subarray(index, Math.min(index + 16384, end + 1)));
        index += 16384;
        if (index > end) {
          clearInterval(timer);
          res.end();
        }
      }, 5);
      res.on("close", () => clearInterval(timer));
    } else res.end(data.subarray(start, end + 1));
  });
  await new Promise((r) => source.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + source.address().port;
  let manager = new DownloadManager({ dataDir: path.join(temp, "state") });
  manager.updateSettings({
    defaultDownloadDir: path.join(temp, "Готовые файлы"),
  });
  let server;
  const task = (id) => manager.tasks.find((t) => t.id === id);
  const complete = async (id) =>
    until(() => {
      assert.notEqual(task(id)?.status, "error", task(id)?.errorMsg);
      return task(id)?.status === "completed" && task(id);
    });
  const hash = (b) => createHash("sha256").update(b).digest("hex");
  try {
    const streams = await manager.analyze(base + "/download?id=abc");
    assert.equal(streams[0].id, "file");
    for (const url of [
      "/redirect",
      "/something.pdf",
      "/setup.exe",
      "/chunked",
    ]) {
      const [id] = manager.add([{ url: base + url, kind: "file" }]);
      const t = await complete(id);
      assert.equal(hash(fs.readFileSync(t.outputPath)), hash(bytes));
      assert.equal(path.extname(t.outputPath), ".zip");
    }
    assert.equal(
      fs
        .readdirSync(manager.settings.defaultDownloadDir)
        .filter((n) => n.endsWith(".zip")).length,
      4,
      "Never overwrite existing downloads",
    );
    const [slow] = manager.add([{ url: base + "/slow.zip" }]);
    await until(() => task(slow).downloadedBytes > 100000);
    manager.control(slow, "pause");
    await until(() => task(slow).status === "paused");
    await manager.shutdown();
    manager = new DownloadManager({ dataDir: path.join(temp, "state") });
    manager.control(slow, "resume");
    assert.equal(
      hash(fs.readFileSync((await complete(slow)).outputPath)),
      hash(bytes),
    );
    assert.ok(ranges > 0, "Resume must send Range with a validator");
    const [mutating] = manager.add([{ url: base + "/changed.zip" }]);
    await until(() => task(mutating).downloadedBytes > 100000);
    manager.control(mutating, "pause");
    await until(() => task(mutating).status === "paused");
    version = 2;
    manager.control(mutating, "resume");
    assert.equal(
      hash(fs.readFileSync((await complete(mutating)).outputPath)),
      hash(changed),
    );
    const [empty] = manager.add([{ url: base + "/empty", kind: "file" }]);
    assert.equal((await complete(empty)).totalBytes, 0);
    const [truncated] = manager.add([
      { url: base + "/truncated", kind: "file" },
    ]);
    await until(() => task(truncated).status === "error");
    assert.equal(task(truncated).outputPath, null);
    broken = false;
    manager.control(truncated, "resume");
    assert.equal(
      hash(fs.readFileSync((await complete(truncated)).outputPath)),
      hash(bytes),
    );
    server = createServer(manager, { port: 0, token: "a".repeat(64) });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const call = api(
      "http://127.0.0.1:" + server.address().port,
      "a".repeat(64),
    );
    const input = {
      key: "test:browser:123",
      url: base + "/download",
      mime: "application/zip",
    };
    const imported = await call("/api/import-download", "POST", input);
    assert.equal(task(imported.id).status, "paused");
    assert.equal(task(imported.id).handoffPending, true);
    assert.equal(
      (await call("/api/import-download", "POST", input)).id,
      imported.id,
    );
    await call("/api/confirm-download", "POST", { key: input.key });
    await call("/api/confirm-download", "POST", { key: input.key });
    assert.equal(
      hash(fs.readFileSync((await complete(imported.id)).outputPath)),
      hash(bytes),
    );
    const rollback = await call("/api/import-download", "POST", {
      ...input,
      key: "abort:1",
    });
    await call("/api/abort-download", "POST", { key: "abort:1" });
    assert.equal(task(rollback.id), undefined);
    await assert.rejects(
      () =>
        call("/api/import-download", "POST", {
          ...input,
          key: "login:1",
          url: base + "/login",
        }),
      /страницу входа/,
    );
    await assert.rejects(
      () =>
        call("/api/import-download", "POST", {
          ...input,
          key: "missing:1",
          url: base + "/missing",
        }),
      /404/,
    );
  } finally {
    await manager.shutdown();
    if (server) await new Promise((r) => server.close(r));
    await new Promise((r) => source.close(r));
    fs.rmSync(temp, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  }
});
