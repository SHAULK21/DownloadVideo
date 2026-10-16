import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const executable = path.resolve(process.argv[2] || "release/OmniGrab.exe");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "omnigrab-sea-"));
const made = spawnSync("ffmpeg", [
  "-hide_banner",
  "-loglevel",
  "error",
  "-f",
  "lavfi",
  "-i",
  "color=c=blue:size=160x90:rate=10",
  "-t",
  "1",
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  path.join(temp, "test.mp4"),
]);
assert.equal(made.status, 0, made.stderr?.toString());
const original = fs.readFileSync(path.join(temp, "test.mp4"));
const fixture = http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "video/mp4",
    "Content-Length": original.length,
  });
  res.end(original);
});
await new Promise((r) => fixture.listen(0, "127.0.0.1", r));
const free = http.createServer();
await new Promise((r) => free.listen(0, "127.0.0.1", r));
const port = free.address().port;
await new Promise((r) => free.close(r));
const child = spawn(executable, [], {
  env: {
    ...process.env,
    OMNIGRAB_DATA_DIR: path.join(temp, "state"),
    OMNIGRAB_NO_BROWSER: "1",
    OMNIGRAB_PORT: String(port),
  },
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
child.stdout.on("data", (b) => (log += b));
child.stderr.on("data", (b) => (log += b));
const base = "http://127.0.0.1:" + port;
async function until(fn, timeout = 90000) {
  const start = Date.now();
  while (true) {
    try {
      const result = await fn();
      if (result) return result;
    } catch {}
    if (child.exitCode !== null)
      throw Error(
        "Executable exited: " + log.replace(/#token=\w+/g, "#token=[redacted]"),
      );
    if (Date.now() - start > timeout) throw Error("SEA timeout");
    await new Promise((r) => setTimeout(r, 200));
  }
}
try {
  await until(async () => {
    const r = await fetch(base + "/api/health");
    return r.ok;
  });
  const token = fs.readFileSync(
    path.join(temp, "state", "access-token"),
    "utf8",
  );
  const call = async (route, method = "GET", data) => {
    const r = await fetch(base + route, {
      method,
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    const value = await r.json();
    assert.ok(r.ok, JSON.stringify(value));
    return value;
  };
  assert.equal((await fetch(base + "/")).status, 200);
  assert.equal((await fetch(base + "/extension.zip")).status, 200);
  assert.equal((await fetch(base + "/THIRD_PARTY_NOTICES.txt")).status, 200);
  await call("/api/settings", "PUT", {
    defaultDownloadDir: path.join(temp, "downloads"),
  });
  await call("/api/tasks", "POST", {
    items: [
      { url: "http://127.0.0.1:" + fixture.address().port + "/test.mp4" },
    ],
  });
  const task = await until(async () => {
    const state = await call("/api/state");
    const t = state.tasks[0];
    if (t?.status === "error") throw Error(t.errorMsg);
    return t?.status === "completed" && t;
  }, 60000);
  const result = fs.readFileSync(task.outputPath);
  assert.equal(
    createHash("sha256").update(result).digest("hex"),
    createHash("sha256").update(original).digest("hex"),
  );
  console.log(
    "SEA executable smoke passed: embedded UI, extension, licenses, actual download and SHA256.",
  );
} finally {
  child.kill();
  await new Promise((r) => {
    if (child.exitCode !== null) r();
    else {
      child.once("close", r);
      setTimeout(r, 5000).unref();
    }
  });
  await new Promise((r) => fixture.close(r));
  fs.rmSync(temp, { recursive: true, force: true });
}
