import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  fixture,
  freePort,
  api,
  until,
  assertGUI,
} from "./desktop-fixture.mjs";
const executable = path.resolve(process.argv[2]);
assertGUI(executable);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "omnigrab-portable-"));
const dataDir = path.join(temp, "Данные пользователя");
const media = await fixture(temp);
const port = await freePort();
const base = "http://127.0.0.1:" + port;
const children = [];
function launch() {
  const child = spawn(executable, ["--disable-gpu"], {
    env: {
      ...process.env,
      OMNIGRAB_DATA_DIR: dataDir,
      OMNIGRAB_PORT: String(port),
    },
    stdio: "ignore",
    cwd: temp,
  });
  child.on("error", (error) => {
    throw error;
  });
  children.push(child);
  return child;
}
let child = launch();
async function healthy() {
  await until(async () => {
    try {
      return (await fetch(base + "/api/health")).ok;
    } catch {
      return false;
    }
  }, 120000);
}
try {
  await healthy();
  const token = fs.readFileSync(path.join(dataDir, "access-token"), "utf8");
  const call = api(base, token);
  assert.equal((await call("/api/state")).desktop, true);
  const handles = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Get-Process -Name OmniGrab | Where-Object { $_.MainWindowTitle -eq 'OmniGrab' -and $_.MainWindowHandle -ne 0 } | Select-Object -ExpandProperty Id",
    ],
    { encoding: "utf8", windowsHide: true },
  );
  assert.equal(handles.status, 0, handles.stderr);
  assert.match(
    handles.stdout,
    /\d+/,
    "Portable EXE must create a real desktop window",
  );
  await call("/api/settings", "PUT", {
    defaultDownloadDir: path.join(temp, "downloads"),
  });
  await call("/api/tasks", "POST", {
    items: [{ url: media.base + "/test.mp4" }],
  });
  const task = await until(async () => {
    const t = (await call("/api/state")).tasks[0];
    assert.notEqual(t?.status, "error", t?.errorMsg);
    return t?.status === "completed" && t;
  });
  const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
  assert.equal(hash(fs.readFileSync(task.outputPath)), hash(media.bytes));

  // Reproduce the old failure: a second portable launcher cleaned up the first
  // instance's extraction directory. Test tools both during and after its exit.
  await call("/api/tasks", "POST", {
    items: [{ url: media.base + "/slow.mp4" }],
  });
  await until(async () =>
    (await call("/api/state")).tasks.some((t) => t.status === "downloading"),
  );
  const second = launch();
  await until(() => second.exitCode !== null, 120000);
  assert.equal(second.exitCode, 0);
  const slow = await until(async () => {
    const t = (await call("/api/state")).tasks.find((t) =>
      t.url.endsWith("/slow.mp4"),
    );
    assert.notEqual(t?.status, "error", t?.errorMsg);
    return t?.status === "completed" && t;
  });
  assert.equal(hash(fs.readFileSync(slow.outputPath)), hash(media.slow));
  const analysis = await call("/api/analyze", "POST", {
    url: media.base + "/after-second.mp4",
  });
  assert.ok(analysis.streams.length > 0);
  await call("/api/tasks", "POST", {
    items: [{ url: media.base + "/after-second.mp4" }],
  });
  const afterSecond = await until(async () => {
    const t = (await call("/api/state")).tasks.find((t) =>
      t.url.endsWith("/after-second.mp4"),
    );
    assert.notEqual(t?.status, "error", t?.errorMsg);
    return t?.status === "completed" && t;
  });
  assert.equal(
    hash(fs.readFileSync(afterSecond.outputPath)),
    hash(media.bytes),
  );
  await call("/api/app", "POST", { action: "quit" });
  await until(() => child.exitCode !== null);
  assert.equal(child.exitCode, 0);

  const versions = fs.readdirSync(path.join(dataDir, "runtime"));
  assert.equal(versions.length, 1);
  const tools = path.join(dataDir, "runtime", versions[0], "tools");
  const expected = hash(fs.readFileSync(path.join(tools, "ffmpeg.exe")));
  fs.rmSync(path.join(tools, "yt-dlp.exe"));
  fs.writeFileSync(path.join(tools, "ffmpeg.exe"), "broken");
  child = launch();
  await healthy();
  assert.equal(hash(fs.readFileSync(path.join(tools, "ffmpeg.exe"))), expected);
  const restored = await call("/api/analyze", "POST", {
    url: media.base + "/restored.mp4",
  });
  assert.ok(restored.streams.length > 0);
  assert.equal((await call("/api/state")).tasks.length, 3);
  await call("/api/app", "POST", { action: "quit" });
  await until(() => child.exitCode !== null);
  assert.equal(child.exitCode, 0);
  console.log(
    "Portable EXE smoke passed: native window, Unicode data path, background download across second portable launch, analysis and new download after launcher cleanup, missing/corrupt tools restored, queue preserved, SHA256 and clean exit.",
  );
} catch (error) {
  const log = path.join(dataDir, "error.log");
  if (fs.existsSync(log))
    console.error(
      fs
        .readFileSync(log, "utf8")
        .replace(/#token=[a-f0-9]+/g, "#token=[redacted]"),
    );
  throw error;
} finally {
  for (const running of children)
    if (running.exitCode === null)
      spawnSync("taskkill.exe", ["/PID", String(running.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
  await new Promise((resolve) => media.server.close(resolve));
  fs.rmSync(temp, {
    recursive: true,
    force: true,
    maxRetries: 20,
    retryDelay: 250,
  });
}
