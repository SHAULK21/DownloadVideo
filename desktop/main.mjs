import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { isSea, getAsset, getAssetKeys } from "node:sea";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { DownloadManager } from "./manager.mjs";
import {
  createServer,
  persistentToken,
  openBrowser,
  windowsFolder,
  windowsChooseFolder,
} from "./server.mjs";
const sea = isSea();
const base = sea ? path.dirname(process.execPath) : process.cwd();
const dataDir =
  process.env.OMNIGRAB_DATA_DIR ||
  (process.platform === "win32"
    ? path.join(process.env.LOCALAPPDATA || os.homedir(), "OmniGrab")
    : path.join(os.homedir(), ".omnigrab"));
fs.mkdirSync(dataDir, { recursive: true });
let tools = path.join(base, "tools");
if (sea) {
  tools = path.join(dataDir, "tools", "3.0.0");
  fs.mkdirSync(tools, { recursive: true });
  for (const key of getAssetKeys().filter((k) => k.startsWith("tools/"))) {
    const destination = path.join(
      tools,
      path.basename(key).replace(/\.gz$/, ""),
    );
    const bytes = gunzipSync(Buffer.from(getAsset(key)));
    let valid = false;
    try {
      valid =
        createHash("sha256")
          .update(fs.readFileSync(destination))
          .digest("hex") === createHash("sha256").update(bytes).digest("hex");
    } catch {}
    if (!valid) {
      fs.writeFileSync(destination + ".tmp", bytes, { mode: 0o700 });
      fs.renameSync(destination + ".tmp", destination);
    }
  }
}
const ytDlp =
  process.env.OMNIGRAB_YTDLP ||
  (process.platform === "win32" ? path.join(tools, "yt-dlp.exe") : "yt-dlp");
const ffmpeg =
  process.env.OMNIGRAB_FFMPEG ||
  (process.platform === "win32" ? path.join(tools, "ffmpeg.exe") : "ffmpeg");
const manager = new DownloadManager({ dataDir, ytDlp, ffmpeg });
const token = persistentToken(dataDir);
const port = Number(process.env.OMNIGRAB_PORT) || 17893;
const address = `http://127.0.0.1:${port}/#token=${token}`;
const readAsset = (name) =>
  sea
    ? Buffer.from(getAsset("web/" + name))
    : fs.readFileSync(path.join(base, "dist", name));
const server = createServer(manager, {
  port,
  token,
  readAsset,
  ...(process.platform === "win32"
    ? { openFolder: windowsFolder, chooseFolder: windowsChooseFolder }
    : {}),
});
server.on("error", async (error) => {
  if (error.code === "EADDRINUSE") {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`);
      if ((await r.json()).app === "OmniGrab") {
        openBrowser(address);
        process.exit(0);
      }
    } catch {}
  }
  console.error("Не удалось запустить OmniGrab:", error.message);
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () => {
  console.log("OmniGrab 3.0 — загрузчик запущен.");
  console.log("Интерфейс: " + address);
  console.log("Файлы: " + manager.settings.defaultDownloadDir);
  console.log(
    "Не закрывайте это окно во время скачивания. Ctrl+C — сохранить очередь и выйти.",
  );
  if (!process.env.OMNIGRAB_NO_BROWSER) openBrowser(address);
});
let shutting = false;
async function shutdown() {
  if (shutting) return;
  shutting = true;
  await manager.shutdown();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("uncaughtException", (error) => {
  console.error(error);
  try {
    fs.appendFileSync(
      path.join(dataDir, "error.log"),
      new Date().toISOString() + " " + error.stack + "\n",
    );
    manager.save();
  } catch {}
  process.exit(1);
});
