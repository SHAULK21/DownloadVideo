import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

test("Lulu packed player: plugin loading, HLS Referer, real download and download-page URL", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "omnigrab-lulu-"));
  const page = "https://luluvido.com/e/abc123def456";
  const fixture = spawnSync(
    "ffmpeg",
    [
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
      "-g",
      "10",
      "-pix_fmt",
      "yuv420p",
      "fixture.mp4",
    ],
    { cwd: temp },
  );
  assert.equal(fixture.status, 0, fixture.stderr?.toString());
  const hls = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      "fixture.mp4",
      "-c",
      "copy",
      "-hls_time",
      "1",
      "-hls_playlist_type",
      "vod",
      "index.m3u8",
    ],
    { cwd: temp },
  );
  assert.equal(hls.status, 0, hls.stderr?.toString());
  let requests = 0;
  const server = http.createServer((req, res) => {
    if (req.headers.referer !== page) {
      res.writeHead(403);
      res.end();
      return;
    }
    const name = new URL(req.url, "http://localhost").pathname.slice(1);
    if (!["index.m3u8", "index0.ts", "fixture.mp4"].includes(name)) {
      res.writeHead(404);
      res.end();
      return;
    }
    requests++;
    const bytes = fs.readFileSync(path.join(temp, name));
    res.writeHead(200, {
      "Content-Type": name.endsWith("m3u8")
        ? "application/vnd.apple.mpegurl"
        : name.endsWith("mp4")
          ? "video/mp4"
          : "video/mp2t",
      "Content-Length": bytes.length,
    });
    res.end(bytes);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = "http://localhost:" + server.address().port;
  const dump = path.join(
    temp,
    "abc123def456_https_-_luluvido.com_e_abc123def456.dump",
  );
  const writePage = (src) =>
    fs.writeFileSync(
      dump,
      `<html><script>eval(function(p,a,c,k,e,d){return p}('0("1").2({3:[{4:"${src}"}],5:"Fixture",duration:1e0})',36,6,'jwplayer|vplayer|setup|sources|file|title'.split('|')))</script></html>`,
    );
  const run = (extra, url = page) =>
    new Promise((resolve, reject) => {
      const child = spawn(
        process.env.OMNIGRAB_YTDLP || "yt-dlp",
        [
          "--ignore-config",
          "--encoding",
          "utf-8",
          "--no-plugin-dirs",
          "--plugin-dirs",
          path.resolve("plugins"),
          "--load-pages",
          "--no-warnings",
          "--socket-timeout",
          "5",
          ...extra,
          "--",
          url,
        ],
        {
          cwd: temp,
          windowsHide: true,
          env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
        },
      );
      let stdout = "",
        stderr = "";
      const timeout = setTimeout(() => {
        child.kill();
        reject(Error("Lulu fixture timeout"));
      }, 30000);
      child.stdout.on("data", (b) => (stdout += b));
      child.stderr.on("data", (b) => (stderr += b));
      child.on("error", (e) => {
        clearTimeout(timeout);
        reject(e);
      });
      child.on("close", (code) => {
        clearTimeout(timeout);
        resolve({ code, stdout, stderr });
      });
    });
  try {
    writePage(base + "/index.m3u8");
    const analyzed = await run(["--skip-download", "--dump-single-json"]);
    assert.equal(analyzed.code, 0, analyzed.stderr);
    const info = JSON.parse(analyzed.stdout);
    assert.equal(info.extractor, "omnigrab:lulu");
    assert.equal(info.title, "Fixture");
    assert.equal(info.duration, 1);
    assert.ok(info.formats.some((f) => f.protocol === "m3u8_native"));
    assert.equal(info.formats[0].http_headers.Referer, page);
    const downloaded = await run([
      "-o",
      "downloaded.%(ext)s",
      "--print",
      "after_move:%(filepath)s",
      "--no-simulate",
    ]);
    assert.equal(downloaded.code, 0, downloaded.stderr);
    const probe = spawnSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "json",
      path.join(temp, "downloaded.mp4"),
    ]);
    assert.equal(probe.status, 0, probe.stderr?.toString());
    assert.ok(Number(JSON.parse(probe.stdout).format.duration) >= 1);
    assert.ok(requests >= 3);
    writePage(base + "/fixture.mp4");
    const direct = await run(
      [
        "-o",
        "direct.mp4",
        "--print",
        "after_move:%(filepath)s",
        "--no-simulate",
      ],
      "https://luluvido.com/d/abc123def456",
    );
    assert.equal(direct.code, 0, direct.stderr);
    const hash = (name) =>
      createHash("sha256")
        .update(fs.readFileSync(path.join(temp, name)))
        .digest("hex");
    assert.equal(hash("direct.mp4"), hash("fixture.mp4"));
    fs.writeFileSync(dump, "<html><title>No player</title></html>");
    const missing = await run(["--skip-download", "--dump-single-json"]);
    assert.notEqual(missing.code, 0);
    assert.match(missing.stderr, /Не найден источник LuluStream/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
