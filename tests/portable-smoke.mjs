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
const dataDir = path.join(temp, "state");
const media = await fixture(temp);
const port = await freePort();
const base = "http://127.0.0.1:" + port;
const child = spawn(executable, ["--disable-gpu"], {
  env: {
    ...process.env,
    OMNIGRAB_DATA_DIR: dataDir,
    OMNIGRAB_PORT: String(port),
  },
  windowsHide: true,
  stdio: "ignore",
});
child.on("error", (error) => {
  throw error;
});
try {
  await until(async () => {
    try {
      return (await fetch(base + "/api/health")).ok;
    } catch {
      return false;
    }
  }, 120000);
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
  await call("/api/app", "POST", { action: "quit" });
  await until(() => child.exitCode !== null);
  assert.equal(child.exitCode, 0);
  console.log(
    "Portable EXE smoke passed: no console subsystem, real Windows window, embedded tools, actual download SHA256 and clean exit.",
  );
} finally {
  if (child.exitCode === null)
    spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
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
