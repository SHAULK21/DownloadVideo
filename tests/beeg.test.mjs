import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { DownloadManager } from "../desktop/manager.mjs";

test("Beeg: decimal API ID, metadata variants, HLS headers, real download and missing source", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "omnigrab-beeg-"));
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
    "-g",
    "10",
    "-pix_fmt",
    "yuv420p",
    path.join(temp, "fixture.mp4"),
  ]);
  assert.equal(made.status, 0, made.stderr?.toString());
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
  let mediaRequests = 0,
    externalRequests = 0;
  const server = http.createServer((req, res) => {
    const requested = new URL(req.url, "http://localhost");
    const name = requested.pathname.slice(1);
    if (!["fixture.mp4", "index.m3u8", "index0.ts"].includes(name)) {
      externalRequests++;
      res.writeHead(400).end();
      return;
    }
    if (
      req.headers.origin !== "https://beeg.com" ||
      req.headers.referer !== "https://beeg.com/"
    ) {
      res.writeHead(403).end();
      return;
    }
    mediaRequests++;
    const body = fs.readFileSync(path.join(temp, name));
    res
      .writeHead(200, {
        "Content-Type": name.endsWith("m3u8")
          ? "application/vnd.apple.mpegurl"
          : "video/mp4",
        "Content-Length": body.length,
      })
      .end(body);
  });
  // Loaded API fixtures are the only external responses allowed by this test.
  server.on("connect", (_req, socket) => {
    externalRequests++;
    socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = "http://localhost:" + server.address().port;
  const id = "0001234567890";
  const dump = path.join(
    temp,
    `${id}_https_-_store.externulls.com_facts_file_1234567890.dump`,
  );
  const manager = new DownloadManager({ dataDir: path.join(temp, "state") });
  const run = (extra = [], url = `https://beeg.com/${id}`) =>
    new Promise((resolve, reject) => {
      const child = spawn(
        process.env.OMNIGRAB_YTDLP || "yt-dlp",
        [
          "--ignore-config",
          ...manager.headerArgs({}),
          "--load-pages",
          "--proxy",
          base,
          "--socket-timeout",
          "3",
          "--no-warnings",
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
      const timer = setTimeout(() => {
        child.kill();
        reject(Error("Beeg fixture timeout"));
      }, 30000);
      child.stdout.on("data", (b) => (stdout += b));
      child.stderr.on("data", (b) => (stderr += b));
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ code, stdout, stderr });
      });
    });
  const write = (data) => fs.writeFileSync(dump, JSON.stringify(data));
  const analyze = async (url) => {
    const result = await run(["--skip-download", "--dump-single-json"], url);
    assert.equal(result.code, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  try {
    // Current metadata, absent resources in the first fact, streams in a later fact.
    write({
      file: {
        data: [{ cd_column: "sf_name", cd_value: "Fixture" }],
        fl_duration: 1,
      },
      fc_facts: [
        { id: 1 },
        { id: 2, hls_resources: { fl_cdn_90: base + "/index.m3u8" } },
      ],
    });
    for (const suffix of [
      id,
      "-" + id,
      "video/" + id,
      "video/-" + id + "?t=0-1",
    ]) {
      const info = await analyze("https://beeg.com/" + suffix);
      assert.equal(info.extractor, "omnigrab:beeg");
      assert.equal(info.id, id);
      assert.equal(info.title, "Fixture");
      assert.equal(info.formats[0].http_headers.Origin, "https://beeg.com");
      assert.equal(info.formats[0].height, 90);
    }
    const download = await run(["-o", "downloaded.%(ext)s"]);
    assert.equal(download.code, 0, download.stderr);
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
    // Legacy metadata and a direct file; null facts must not crash extraction.
    write({
      file: {
        stuff: { sf_name: "Legacy" },
        resources: { fl_cdn_90: base + "/fixture.mp4", set_id: 1 },
      },
      fc_facts: null,
    });
    assert.equal((await analyze()).title, "Legacy");
    const direct = await run(["-o", "direct.mp4"]);
    assert.equal(direct.code, 0, direct.stderr);
    const hash = (name) =>
      createHash("sha256")
        .update(fs.readFileSync(path.join(temp, name)))
        .digest("hex");
    assert.equal(hash("direct.mp4"), hash("fixture.mp4"));
    // Relative resources use the current CDN, with headers retained.
    write({ file: { resources: { fl_cdn_90: "fixture/video.mp4" } } });
    const relative = await analyze();
    assert.equal(
      relative.formats[0].url,
      "https://video.externulls.com/fixture/video.mp4",
    );
    assert.equal(relative.title, "Beeg " + id);
    for (const facts of [null, [], [null, { id: 1 }]]) {
      write({ file: { data: [] }, fc_facts: facts });
      const missing = await run(["--skip-download", "--dump-single-json"]);
      assert.notEqual(missing.code, 0);
      assert.match(missing.stderr, /Beeg не вернул доступный поток/);
      assert.doesNotMatch(missing.stderr, /TypeError|AttributeError/);
    }
    assert.equal(externalRequests, 0);
    assert.ok(mediaRequests >= 8);
  } finally {
    await manager.shutdown();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
