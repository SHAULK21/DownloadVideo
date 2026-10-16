import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { DownloadManager } from "../desktop/manager.mjs";

test("domain labels do not reject a playable source: real analysis and download through local fixture proxy", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "omnigrab-domains-"));
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
    path.join(temp, "fixture.mp4"),
  ]);
  assert.equal(made.status, 0, made.stderr?.toString());
  const bytes = fs.readFileSync(path.join(temp, "fixture.mp4"));
  let requests = 0,
    base;
  const server = http.createServer((req, res) => {
    requests++;
    const media = req.url.endsWith("fixture.mp4");
    const body = media
      ? bytes
      : Buffer.from(
          `<html><title>Fixture</title><video src="${base}/fixture.mp4"></video></html>`,
        );
    res.writeHead(200, {
      "Content-Type": media ? "video/mp4" : "text/html",
      "Content-Length": body.length,
    });
    res.end(body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = "http://127.0.0.1:" + server.address().port;
  const manager = new DownloadManager({ dataDir: temp });
  const run = (args, url) =>
    new Promise((resolve, reject) => {
      const child = spawn(
        process.env.OMNIGRAB_YTDLP || "yt-dlp",
        [
          "--ignore-config",
          "--no-warnings",
          "--proxy",
          base,
          "--socket-timeout",
          "5",
          ...args,
          "--",
          url,
        ],
        { windowsHide: true },
      );
      let stdout = "",
        stderr = "";
      const timer = setTimeout(() => {
        child.kill();
        reject(Error("Domain fixture timeout"));
      }, 30000);
      child.stdout.on("data", (b) => (stdout += b));
      child.stderr.on("data", (b) => (stderr += b));
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ code, stdout, stderr });
      });
    });
  try {
    // This control reproduces the exact upstream refusal without contacting any site.
    const control = await run(
      ["--skip-download", "--dump-single-json"],
      "http://gofile.io/omnigrab-fixture",
    );
    assert.notEqual(control.code, 0);
    assert.match(control.stderr, /primarily used for piracy/);
    assert.equal(requests, 0);
    for (const host of ["gofile.io", "udio.com", "primevideo.com"]) {
      const analyzed = await run(
        [...manager.headerArgs({}), "--skip-download", "--dump-single-json"],
        "http://" + host + "/omnigrab-fixture",
      );
      assert.equal(analyzed.code, 0, analyzed.stderr);
      assert.ok(analyzed.stdout.includes(base + "/fixture.mp4"));
    }
    const downloaded = await run(
      [
        ...manager.headerArgs({}),
        "--no-playlist",
        "-o",
        path.join(temp, "downloaded.%(ext)s"),
      ],
      "http://gofile.io/omnigrab-fixture",
    );
    assert.equal(downloaded.code, 0, downloaded.stderr);
    const hash = (b) => createHash("sha256").update(b).digest("hex");
    assert.equal(
      hash(fs.readFileSync(path.join(temp, "downloaded.mp4"))),
      hash(bytes),
    );
    assert.ok(requests >= 5);
  } finally {
    await manager.shutdown();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
