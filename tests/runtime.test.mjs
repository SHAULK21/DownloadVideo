import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileHash, prepareRuntime } from "../desktop/runtime.mjs";

test("portable tools survive extraction cleanup and restore missing/corrupt components", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "omnigrab-runtime-"));
  try {
    const sourceDir = path.join(temp, "extracted");
    const dataDir = path.join(temp, "Данные пользователя");
    const content = {
      "tools/yt-dlp.exe": "downloader",
      "tools/node.exe": "javascript runtime",
      "tools/ffmpeg.exe": "media converter",
      "tools/ffprobe.exe": "media probe",
      "plugins/omnigrab/yt_dlp_plugins/extractor/omnigrab_lulu.py": "plugin",
    };
    const manifest = {};
    for (const [name, bytes] of Object.entries(content)) {
      fs.mkdirSync(path.dirname(path.join(sourceDir, name)), {
        recursive: true,
      });
      fs.writeFileSync(path.join(sourceDir, name), bytes);
      manifest[name] = fileHash(path.join(sourceDir, name));
    }
    const options = { sourceDir, dataDir, manifest };
    const runtime = prepareRuntime(options);
    fs.rmSync(sourceDir, { recursive: true });
    assert.deepEqual(prepareRuntime(options), runtime);
    assert.equal(
      fs.readFileSync(path.join(runtime.tools, "yt-dlp.exe"), "utf8"),
      "downloader",
    );
    fs.mkdirSync(path.join(sourceDir, "tools"), { recursive: true });
    fs.writeFileSync(
      path.join(sourceDir, "tools/yt-dlp.exe"),
      content["tools/yt-dlp.exe"],
    );
    fs.writeFileSync(
      path.join(sourceDir, "tools/ffmpeg.exe"),
      content["tools/ffmpeg.exe"],
    );
    fs.rmSync(path.join(runtime.tools, "yt-dlp.exe"));
    fs.writeFileSync(path.join(runtime.tools, "ffmpeg.exe"), "corrupt");
    prepareRuntime(options);
    assert.equal(
      fileHash(path.join(runtime.tools, "yt-dlp.exe")),
      manifest["tools/yt-dlp.exe"],
    );
    assert.equal(
      fileHash(path.join(runtime.tools, "ffmpeg.exe")),
      manifest["tools/ffmpeg.exe"],
    );
    fs.rmSync(path.join(runtime.tools, "yt-dlp.exe"));
    fs.writeFileSync(
      path.join(sourceDir, "tools/yt-dlp.exe"),
      "corrupt source",
    );
    assert.throws(
      () => prepareRuntime(options),
      /Не удалось восстановить компонент yt-dlp.exe/,
    );
    assert.equal(fs.existsSync(path.join(runtime.tools, "yt-dlp.exe")), false);
    assert.equal(
      fs.readdirSync(runtime.tools).some((name) => name.endsWith(".tmp")),
      false,
    );
    assert.throws(
      () =>
        prepareRuntime({
          ...options,
          manifest: { "tools/../../escape": "a".repeat(64) },
        }),
      /Некорректный/,
    );
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
