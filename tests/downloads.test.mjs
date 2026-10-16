import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  DownloadManager,
  httpUrl,
  category,
  safeName,
} from "../desktop/manager.mjs";
import { createServer } from "../desktop/server.mjs";
import { allVisibleSelected, expandBatch } from "../src/lib/helpers.ts";
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "omnigrab-test-"));
let fixture, server, base;
const managers = [];
let ranges = 0;
const ytDlp = process.env.OMNIGRAB_YTDLP || "yt-dlp";
before(async () => {
  const result = spawnSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc=size=160x90:rate=10",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440",
    "-t",
    "2",
    "-c:v",
    "libx264",
    "-g",
    "10",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    path.join(temp, "fixture.mp4"),
  ]);
  assert.equal(result.status, 0, result.stderr?.toString());
  fixture = fs.readFileSync(path.join(temp, "fixture.mp4"));
  fs.mkdirSync(path.join(temp, "hls"));
  const hls = spawnSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    path.join(temp, "fixture.mp4"),
    "-c",
    "copy",
    "-hls_time",
    "1",
    "-hls_playlist_type",
    "vod",
    path.join(temp, "hls", "index.m3u8"),
  ]);
  assert.equal(hls.status, 0, hls.stderr?.toString());
  fs.mkdirSync(path.join(temp, "dash"));
  const dash = spawnSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    path.join(temp, "fixture.mp4"),
    "-c",
    "copy",
    "-f",
    "dash",
    path.join(temp, "dash", "index.mpd"),
  ]);
  assert.equal(dash.status, 0, dash.stderr?.toString());
  server = http.createServer((req, res) => {
    if (/^\/(hls|dash)\/[\w.-]+$/.test(req.url)) {
      const file = path.join(temp, req.url.slice(1));
      if (!fs.existsSync(file)) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, {
        "Content-Type": req.url.endsWith(".m3u8")
          ? "application/vnd.apple.mpegurl"
          : req.url.endsWith(".mpd")
            ? "application/dash+xml"
            : "video/mp2t",
      });
      res.end(fs.readFileSync(file));
      return;
    }
    if (req.url === "/404.mp4") {
      res.writeHead(404);
      res.end();
      return;
    }
    if (req.url === "/page") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        '<html><title>Тест видео</title><video controls src="/fixture.mp4"></video></html>',
      );
      return;
    }
    const slow = req.url === "/slow.mp4";
    const payload = slow
      ? Buffer.concat(Array.from({ length: 80 }, () => fixture))
      : fixture;
    const match = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    let start = 0,
      end = payload.length - 1;
    if (match) {
      ranges++;
      start = Number(match[1]);
      end = match[2] ? Number(match[2]) : end;
      if (start >= payload.length) {
        res.writeHead(416, { "Content-Range": `bytes */${payload.length}` });
        res.end();
        return;
      }
    }
    res.writeHead(match ? 206 : 200, {
      "Content-Type": "video/mp4",
      "Content-Length": end - start + 1,
      "Accept-Ranges": "bytes",
      ...(match
        ? { "Content-Range": `bytes ${start}-${end}/${payload.length}` }
        : {}),
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    if (!slow) {
      res.end(payload.subarray(start, end + 1));
      return;
    }
    let offset = start;
    const timer = setInterval(() => {
      if (offset > end) {
        clearInterval(timer);
        res.end();
        return;
      }
      const next = Math.min(offset + 8192, end + 1);
      res.write(payload.subarray(offset, next));
      offset = next;
    }, 25);
    res.on("close", () => clearInterval(timer));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = "http://127.0.0.1:" + server.address().port;
});
after(async () => {
  for (const m of managers) await m.shutdown();
  await new Promise((r) => server.close(r));
  fs.rmSync(temp, { recursive: true, force: true });
});
function manager(name) {
  const dir = path.join(temp, name),
    m = new DownloadManager({ dataDir: dir, ytDlp, ffmpeg: "ffmpeg" });
  m.updateSettings({
    defaultDownloadDir: path.join(dir, "downloads"),
    maxConcurrentDownloads: 2,
    maxThreads: 2,
  });
  managers.push(m);
  return m;
}
async function until(fn, timeout = 20000) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeout) throw Error("Timeout");
    await new Promise((r) => setTimeout(r, 30));
  }
}
const hash = (b) => createHash("sha256").update(b).digest("hex");
test("URL, exact categories, safe filenames, batch bounds and visible selection", () => {
  assert.throws(() => httpUrl("not a URL"));
  assert.throws(() => httpUrl("file:///tmp/x"));
  assert.equal(category("https://assets.example/manual.pdf"), "documents");
  assert.equal(category("https://example.com/v.mp4?file=.mp3"), "video");
  assert.equal(safeName("../bad:name.mp4"), ".._bad_name.mp4");
  assert.deepEqual(expandBatch("https://test/v_[03-01].mp4"), [
    "https://test/v_03.mp4",
    "https://test/v_02.mp4",
    "https://test/v_01.mp4",
  ]);
  assert.throws(() => expandBatch("https://test/v_[1-200].mp4"));
  assert.equal(allVisibleSelected(["video"], ["audio"]), false);
});
test("real URL analysis returns actual formats and rejects 404", async () => {
  const m = manager("analysis");
  const streams = await m.analyze(base + "/fixture.mp4");
  assert.ok(streams.length >= 3);
  assert.ok(streams.every((s) => !s.quality.includes("2160p")));
  assert.ok(streams.some((s) => s.id === "auto"));
  await assert.rejects(m.analyze(base + "/404.mp4"));
  await assert.rejects(m.analyze("invalid"));
});
test("four real files finish with correct hashes and no concurrency overflow", async () => {
  const m = manager("batch");
  let peak = 0;
  m.on("change", () => {
    peak = Math.max(peak, m.running.size);
  });
  m.add(Array.from({ length: 4 }, () => ({ url: base + "/fixture.mp4" })));
  await until(() =>
    m.tasks.every((t) => ["completed", "error"].includes(t.status)),
  );
  assert.deepEqual(
    m.tasks.map((t) => t.status),
    Array(4).fill("completed"),
    JSON.stringify(m.tasks.map((t) => t.errorMsg)),
  );
  assert.ok(peak <= 2);
  for (const t of m.tasks) {
    assert.equal(hash(fs.readFileSync(t.outputPath)), hash(fixture));
    assert.equal(t.totalBytes, fixture.length);
    assert.equal(t.downloadedBytes, fixture.length);
  }
  const restored = new DownloadManager({ dataDir: m.dataDir, ytDlp });
  assert.equal(restored.tasks.length, 4);
  assert.ok(restored.tasks.every((t) => t.status === "completed"));
  assert.equal(restored.settings.maxConcurrentDownloads, 2);
});
test("pause and resume uses Range and preserves all bytes; deletion keeps file", async () => {
  const m = manager("resume");
  const [id] = m.add([{ url: base + "/slow.mp4" }]);
  const task = m.tasks[0];
  await until(() => task.downloadedBytes > 20000, 30000);
  m.control(id, "pause");
  await until(() => task.status === "paused");
  const before = task.downloadedBytes;
  m.control(id, "resume");
  await until(() => ["completed", "error"].includes(task.status), 30000);
  assert.equal(task.status, "completed", task.errorMsg);
  assert.ok(ranges > 0);
  assert.ok(before > 0);
  assert.equal(
    hash(fs.readFileSync(task.outputPath)),
    hash(Buffer.concat(Array.from({ length: 80 }, () => fixture))),
  );
  const output = task.outputPath;
  m.control(id, "delete");
  assert.ok(fs.existsSync(output));
  assert.equal(m.tasks.length, 0);
});
test("shutdown and restart preserve unfinished task and output template", async () => {
  const m = manager("restart");
  m.add([{ url: base + "/slow.mp4" }]);
  await until(() => m.tasks[0].downloadedBytes > 10000, 30000);
  const template = m.tasks[0].outputTemplate;
  await m.shutdown();
  const restored = new DownloadManager({ dataDir: m.dataDir, ytDlp });
  managers.push(restored);
  assert.equal(restored.tasks.length, 1);
  assert.equal(restored.tasks[0].status, "paused");
  assert.equal(restored.tasks[0].outputTemplate, template);
  restored.control(restored.tasks[0].id, "resume");
  await until(
    () => ["completed", "error"].includes(restored.tasks[0].status),
    30000,
  );
  assert.equal(
    restored.tasks[0].status,
    "completed",
    restored.tasks[0].errorMsg,
  );
});
test("real HLS fragments are downloaded and MP3 extraction produces an audio file", async () => {
  const m = manager("hls-audio");
  const formats = await m.analyze(base + "/hls/index.m3u8");
  assert.ok(formats.length > 2);
  m.add([
    { url: base + "/hls/index.m3u8" },
    { url: base + "/dash/index.mpd" },
    { url: base + "/fixture.mp4", formatId: "audio", category: "audio" },
  ]);
  await until(
    () => m.tasks.every((t) => ["completed", "error"].includes(t.status)),
    30000,
  );
  assert.ok(
    m.tasks.every((t) => t.status === "completed"),
    JSON.stringify(m.tasks.map((t) => t.errorMsg)),
  );
  const audio = m.tasks.find((t) => t.formatId === "audio");
  assert.equal(path.extname(audio.outputPath), ".mp3");
  const probe = spawnSync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "stream=codec_type",
    "-of",
    "json",
    audio.outputPath,
  ]);
  assert.equal(probe.status, 0);
  assert.deepEqual(
    JSON.parse(probe.stdout).streams.map((s) => s.codec_type),
    ["audio"],
  );
});
test("settings affect queued state, concurrency budget and corrupt-state recovery", async () => {
  const m = manager("settings");
  m.updateSettings({
    autoStartOnDetect: false,
    speedLimitKbps: 1024,
    maxConcurrentDownloads: 2,
    maxThreads: 4,
  });
  const [id] = m.add([{ url: base + "/slow.mp4" }]);
  assert.equal(m.tasks[0].status, "paused");
  m.control(id, "resume");
  const args = m.running.get(id).child.spawnargs;
  assert.equal(args[args.indexOf("--limit-rate") + 1], "131072");
  m.control(id, "pause");
  await until(() => m.tasks[0].status === "paused");
  m.save();
  fs.writeFileSync(m.statePath, "{broken");
  const restored = new DownloadManager({ dataDir: m.dataDir, ytDlp });
  assert.equal(restored.tasks.length, 1);
  assert.equal(restored.settings.speedLimitKbps, 1024);
  assert.ok(restored.loadWarning.includes("резервной"));
});
test("failed download never becomes completed and empty initial state", async () => {
  const m = manager("errors");
  assert.equal(m.tasks.length, 0);
  m.add([{ url: base + "/404.mp4" }]);
  await until(() => m.tasks[0].status === "error");
  assert.match(m.tasks[0].errorMsg, /404/);
  assert.equal(m.tasks[0].completedAt, undefined);
});
test("loopback API enforces authentication, pairing, origin and completed-file Range", async () => {
  const m = manager("api");
  m.updateSettings({ autoStartOnDetect: false });
  const token = "a".repeat(64),
    app = createServer(m, {
      port: 0,
      token,
      readAsset: () => Buffer.from("<html>app</html>"),
    });
  await new Promise((r) => app.listen(0, "127.0.0.1", r));
  const url = "http://127.0.0.1:" + app.address().port;
  try {
    assert.equal((await fetch(url + "/api/state")).status, 401);
    assert.equal(
      (
        await fetch(url + "/api/state", {
          headers: {
            Authorization: "Bearer " + token,
            Origin: "https://evil.test",
          },
        })
      ).status,
      403,
    );
    const state = await (
      await fetch(url + "/api/state", {
        headers: { Authorization: "Bearer " + token },
      })
    ).json();
    const paired = await fetch(url + "/api/pair", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "chrome-extension://" + "a".repeat(32),
      },
      body: JSON.stringify({ code: state.pairing.code }),
    });
    assert.equal(paired.status, 200);
    assert.equal((await paired.json()).token, token);
    const add = await fetch(url + "/api/tasks", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ items: [{ url: base + "/fixture.mp4" }] }),
    });
    assert.equal(add.status, 201);
    assert.equal(m.tasks[0].status, "paused");
    m.control(m.tasks[0].id, "resume");
    await until(() => ["completed", "error"].includes(m.tasks[0].status));
    assert.equal(m.tasks[0].status, "completed", m.tasks[0].errorMsg);
    const response = await fetch(
      url + "/api/tasks/" + m.tasks[0].id + "/file?token=" + token,
      { headers: { Range: "bytes=0-9" } },
    );
    assert.equal(response.status, 206);
    assert.deepEqual(
      Buffer.from(await response.arrayBuffer()),
      fixture.subarray(0, 10),
    );
  } finally {
    await new Promise((r) => app.close(r));
  }
});
