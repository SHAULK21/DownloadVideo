import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import readline from "node:readline";

export const DEFAULTS = {
  maxThreads: 4,
  maxConcurrentDownloads: 2,
  speedLimitKbps: 0,
  autoStartOnDetect: true,
  showFloatingButton: true,
  defaultDownloadDir: path.join(os.homedir(), "Downloads", "OmniGrab"),
  soundOnComplete: true,
  interceptVideoTypes: [
    "mp4",
    "webm",
    "m3u8",
    "mpd",
    "mp3",
    "m4a",
    "ogg",
    "mov",
    "mkv",
  ],
  minFileSizeToCatchKb: 512,
};
export function httpUrl(value) {
  if (typeof value !== "string" || value.length > 16384)
    throw new Error("Введите корректную HTTP(S) ссылку.");
  let u;
  try {
    u = new URL(value.trim());
  } catch {
    throw new Error("Введите корректную HTTP(S) ссылку.");
  }
  if (!["http:", "https:"].includes(u.protocol) || u.username || u.password)
    throw new Error(
      "Поддерживаются только HTTP(S) ссылки без пароля в адресе.",
    );
  return u.href;
}
export function safeName(value) {
  return (
    String(value || "video")
      .normalize("NFC")
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
      .replace(/[. ]+$/g, "")
      .replace(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?=\.|$)/i, "_$1")
      .slice(0, 160) || "video"
  );
}
export function category(value) {
  let ext;
  try {
    ext = new URL(value).pathname.split(".").pop().toLowerCase();
  } catch {
    ext = String(value).toLowerCase().replace(/^\./, "");
  }
  if (["mp3", "m4a", "aac", "flac", "wav", "ogg", "opus"].includes(ext))
    return "audio";
  if (["zip", "rar", "7z", "gz", "tar"].includes(ext)) return "compressed";
  if (["exe", "msi", "dmg", "apk", "iso"].includes(ext)) return "programs";
  if (
    [
      "pdf",
      "doc",
      "docx",
      "xls",
      "xlsx",
      "ppt",
      "pptx",
      "txt",
      "epub",
    ].includes(ext)
  )
    return "documents";
  return "video";
}
function cleanHeaders(input = {}) {
  const result = {};
  for (const [k, v] of Object.entries(input)) {
    if (
      ["referer", "user-agent", "origin"].includes(k.toLowerCase()) &&
      typeof v === "string" &&
      v.length < 16384 &&
      !/[\r\n]/.test(v)
    )
      result[k] = v;
  }
  return result;
}
function settingsFrom(input, previous = DEFAULTS) {
  const n = (k, min, max) => {
    const v = Number(input[k] ?? previous[k]);
    if (!Number.isFinite(v) || !Number.isInteger(v) || v < min || v > max)
      throw Error("Неверное значение " + k);
    return v;
  };
  const dir = input.defaultDownloadDir ?? previous.defaultDownloadDir;
  if (typeof dir !== "string" || !path.isAbsolute(dir) || dir.includes("\0"))
    throw Error("Укажите полный путь к папке.");
  return {
    ...previous,
    maxThreads: n("maxThreads", 1, 32),
    maxConcurrentDownloads: n("maxConcurrentDownloads", 1, 10),
    speedLimitKbps: n("speedLimitKbps", 0, 1048576),
    minFileSizeToCatchKb: n("minFileSizeToCatchKb", 0, 1048576),
    defaultDownloadDir: dir,
    ...Object.fromEntries(
      ["autoStartOnDetect", "showFloatingButton", "soundOnComplete"].map(
        (k) => [k, typeof input[k] === "boolean" ? input[k] : previous[k]],
      ),
    ),
    interceptVideoTypes: Array.isArray(input.interceptVideoTypes)
      ? [
          ...new Set(
            input.interceptVideoTypes
              .map((s) => String(s).toLowerCase().replace(/^\./, ""))
              .filter((s) => /^[a-z0-9]{1,8}$/.test(s)),
          ),
        ]
      : previous.interceptVideoTypes,
  };
}

export class DownloadManager extends EventEmitter {
  constructor({
    dataDir,
    ytDlp = "yt-dlp",
    ffmpeg = "ffmpeg",
    pluginDir = path.resolve("plugins"),
    spawnProcess = spawn,
  } = {}) {
    super();
    this.dataDir = dataDir || path.join(os.homedir(), ".omnigrab");
    this.ytDlp = ytDlp;
    this.ffmpeg = ffmpeg && path.isAbsolute(ffmpeg) ? ffmpeg : null;
    this.spawnProcess = spawnProcess;
    this.pluginDir = pluginDir;
    this.running = new Map();
    this.analyzers = new Set();
    this.closing = false;
    this.lastSave = 0;
    this.sequence = 0;
    fs.mkdirSync(this.dataDir, { recursive: true });
    this.statePath = path.join(this.dataDir, "state.json");
    this.settings = { ...DEFAULTS };
    this.tasks = [];
    this.load();
  }
  load() {
    if (!fs.existsSync(this.statePath)) return;
    let data;
    try {
      data = JSON.parse(fs.readFileSync(this.statePath, "utf8"));
    } catch (e) {
      const damaged = this.statePath + ".invalid-" + Date.now();
      fs.copyFileSync(this.statePath, damaged);
      try {
        data = JSON.parse(fs.readFileSync(this.statePath + ".bak", "utf8"));
        this.loadWarning =
          "Очередь восстановлена из резервной копии. Повреждённый файл: " +
          damaged;
        fs.copyFileSync(this.statePath + ".bak", this.statePath);
      } catch {
        this.loadWarning =
          "Не удалось прочитать очередь. Исходный файл сохранён: " + damaged;
        return;
      }
    }
    try {
      this.settings = settingsFrom(data.settings || {});
      this.tasks = (Array.isArray(data.tasks) ? data.tasks : [])
        .filter(
          (t) => t && typeof t.id === "string" && typeof t.url === "string",
        )
        .map((t) => ({
          ...t,
          status: ["downloading", "merging", "queued"].includes(t.status)
            ? "paused"
            : t.status,
          speed: 0,
          eta: 0,
          errorMsg: ["downloading", "merging", "queued"].includes(t.status)
            ? "Восстановлено после закрытия. Нажмите «Продолжить»."
            : t.errorMsg,
        }));
    } catch (e) {
      const backup = this.statePath + ".invalid-" + Date.now();
      fs.copyFileSync(this.statePath, backup);
      this.loadWarning =
        "Повреждённое состояние сохранено в " + backup + ". " + e.message;
    }
  }
  save() {
    const temp = this.statePath + ".tmp";
    const old = this.statePath + ".bak";
    fs.writeFileSync(
      temp,
      JSON.stringify(
        { version: 1, settings: this.settings, tasks: this.tasks },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    if (fs.existsSync(this.statePath)) fs.copyFileSync(this.statePath, old);
    fs.renameSync(temp, this.statePath);
    this.lastSave = Date.now();
  }
  changed(force = false) {
    if (force || Date.now() - this.lastSave > 1500) this.save();
    this.emit("change");
  }
  publicState() {
    return {
      version: "3.0.1",
      settings: this.settings,
      tasks: this.tasks.map(({ headers, ...t }) => t),
      warning: this.loadWarning || null,
    };
  }
  async analyze(url, headers = {}, playlist = false, signal) {
    url = httpUrl(url);
    if (this.analyzers.size >= 3)
      throw Error("Уже идёт анализ других ссылок. Дождитесь результата.");
    const args = [
      "--ignore-config",
      "--no-warnings",
      "--skip-download",
      "--dump-single-json",
      "--socket-timeout",
      "20",
      "--retries",
      "2",
      ...(playlist
        ? ["--flat-playlist", "--playlist-end", "100"]
        : ["--no-playlist"]),
      ...this.headerArgs(headers),
      "--",
      url,
    ];
    const result = await this.capture(args, signal);
    let info;
    try {
      info = JSON.parse(result);
    } catch {
      throw Error("Источник вернул некорректные метаданные.");
    }
    if (playlist) {
      const entries = info.entries || [info];
      return entries
        .map((e, i) => {
          let source = e.webpage_url || e.original_url || e.url;
          if (source && !/^https?:/i.test(source) && e.ie_key === "Youtube")
            source = "https://www.youtube.com/watch?v=" + e.id;
          try {
            source = httpUrl(source);
          } catch {
            return null;
          }
          return {
            id: String(e.id || i),
            url: source,
            title: e.title || "Видео " + (i + 1),
            format: "auto",
            category: "video",
            quality: "Лучшее доступное",
            filesize: e.filesize || 0,
            mimeType: "",
            hasAudio: true,
            hasVideo: true,
          };
        })
        .filter(Boolean);
    }
    const source = info.webpage_url || info.original_url || url;
    const formats = (info.formats || [info]).filter(
      (f) =>
        (f.format_id && f.url && !f.has_drm && f.vcodec !== "none") ||
        (f.format_id && f.url && !f.has_drm && f.acodec !== "none"),
    );
    const streams = formats.map((f) => ({
      id: String(f.format_id),
      url: source,
      title: info.title || safeName(new URL(url).pathname.split("/").pop()),
      format: f.ext || "mp4",
      category: f.vcodec === "none" ? "audio" : "video",
      quality: [
        f.height ? f.height + "p" : f.resolution || "",
        f.fps ? f.fps + " fps" : "",
        f.format_note || "",
        f.vcodec === "none"
          ? "Аудио"
          : f.acodec === "none"
            ? "Видео + отдельный звук"
            : "Видео со звуком",
      ]
        .filter(Boolean)
        .join(" · "),
      resolution: f.resolution,
      fps: f.fps,
      filesize: f.filesize || f.filesize_approx || 0,
      approximate: !f.filesize,
      mimeType: "",
      thumbnail: info.thumbnail,
      hasAudio: f.acodec !== "none",
      hasVideo: f.vcodec !== "none",
      codec: [f.vcodec, f.acodec].filter((c) => c && c !== "none").join(" / "),
    }));
    return [
      {
        id: "auto",
        url: source,
        title: info.title || "Видео",
        format: "auto",
        category: "video",
        quality: "Лучшее доступное видео со звуком",
        filesize: 0,
        mimeType: "",
        thumbnail: info.thumbnail,
        hasAudio: true,
        hasVideo: true,
      },
      {
        id: "audio",
        url: source,
        title: info.title || "Аудио",
        format: "mp3",
        category: "audio",
        quality: "Извлечь аудио в MP3",
        filesize: 0,
        mimeType: "",
        thumbnail: info.thumbnail,
        hasAudio: true,
        hasVideo: false,
      },
      ...streams.reverse(),
    ];
  }
  headerArgs(headers) {
    return [
      "--no-plugin-dirs",
      "--plugin-dirs",
      this.pluginDir,
      "--js-runtimes",
      process.platform === "win32" && path.isAbsolute(this.ytDlp)
        ? "node:" + path.join(path.dirname(this.ytDlp), "node.exe")
        : "node",
      ...Object.entries(cleanHeaders(headers)).flatMap(([k, v]) => [
        "--add-headers",
        k + ":" + v,
      ]),
    ];
  }
  stopProcess(child) {
    if (!child.pid) return;
    if (process.platform === "win32") {
      // PyInstaller and FFmpeg may be descendants of the spawned process.
      const killer = spawn(
        "taskkill.exe",
        ["/PID", String(child.pid), "/T", "/F"],
        { windowsHide: true, stdio: "ignore" },
      );
      killer.on("error", () => child.kill());
    } else {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        child.kill();
      }
    }
  }
  capture(args, signal) {
    return new Promise((resolve, reject) => {
      let out = "",
        err = "",
        settled = false;
      const child = this.spawnProcess(this.ytDlp, args, {
        windowsHide: true,
        detached: process.platform !== "win32",
        env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
        stdio: ["ignore", "pipe", "pipe"],
      });
      this.analyzers.add(child);
      const finish = (e) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);
        this.analyzers.delete(child);
        e ? reject(e) : resolve(out);
      };
      const abort = () => {
        this.stopProcess(child);
        finish(Error("Анализ отменён."));
      };
      const timeout = setTimeout(() => {
        this.stopProcess(child);
        finish(Error("Превышено время ожидания анализа."));
      }, 120000);
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
      child.stdout.on("data", (b) => {
        out += b.toString();
        if (out.length > 24 * 1024 * 1024) {
          this.stopProcess(child);
          finish(Error("Ответ источника слишком большой."));
        }
      });
      child.stderr.on("data", (b) => {
        err = (err + b.toString()).slice(-5000);
      });
      child.on("error", (e) =>
        finish(Error("Не удалось запустить yt-dlp: " + e.message)),
      );
      child.on("close", (code) =>
        finish(
          code === 0
            ? null
            : Error(err.trim() || "Не удалось распознать источник."),
        ),
      );
    });
  }
  add(items) {
    if (!Array.isArray(items) || !items.length || items.length > 100)
      throw Error("Добавьте от 1 до 100 ссылок.");
    const prepared = items.map((item) => {
      const url = httpUrl(item.url);
      const formatId = item.formatId || "auto";
      if (!/^[\w.-]{1,100}$/.test(formatId))
        throw Error("Неверный идентификатор формата.");
      const dir = item.saveFolder || this.settings.defaultDownloadDir;
      if (!path.isAbsolute(dir)) throw Error("Укажите полный путь к папке.");
      return {
        id: randomUUID(),
        url,
        title: safeName(item.title || ""),
        filename: item.title
          ? safeName(item.title)
          : "Определяется при скачивании",
        format: item.format || "AUTO",
        quality: item.quality || "Лучшее доступное",
        formatId,
        hasAudio: item.hasAudio !== false,
        hasVideo: item.hasVideo !== false,
        category: item.category || category(url),
        totalBytes: Number(item.filesize) || 0,
        downloadedBytes: 0,
        speed: 0,
        eta: 0,
        status: this.settings.autoStartOnDetect ? "queued" : "paused",
        threads: this.settings.maxThreads,
        segments: [],
        saveFolder: dir,
        headers: cleanHeaders(item.headers),
        addedAt: Date.now(),
        priority: "normal",
        outputTemplate: null,
        outputPath: null,
        fragmentIndex: 0,
        fragmentCount: 0,
      };
    });
    this.tasks.unshift(...prepared);
    this.changed(true);
    this.schedule();
    return prepared.map((t) => t.id);
  }
  schedule() {
    if (this.closing) return;
    while (this.running.size < this.settings.maxConcurrentDownloads) {
      const task = this.tasks
        .filter((t) => t.status === "queued")
        .sort(
          (a, b) =>
            ({ high: 0, normal: 1, low: 2 })[a.priority] -
              { high: 0, normal: 1, low: 2 }[b.priority] ||
            a.addedAt - b.addedAt,
        )[0];
      if (!task) break;
      this.start(task);
    }
  }
  start(t) {
    t.status = "downloading";
    t.errorMsg = undefined;
    t.speed = 0;
    t.completedAt = undefined;
    t.threads = this.settings.maxThreads;
    try {
      fs.mkdirSync(t.saveFolder, { recursive: true });
    } catch (e) {
      t.status = "error";
      t.errorMsg = "Не удалось создать папку: " + e.message;
      this.changed(true);
      return;
    }
    if (!t.outputTemplate)
      t.outputTemplate = path.join(
        t.saveFolder.replaceAll("%", "%%"),
        `%(title).120B [${t.id.slice(0, 8)}].%(ext)s`,
      );
    let format =
      t.formatId === "auto"
        ? "bv*+ba/b"
        : t.formatId === "audio"
          ? "ba/b"
          : t.hasVideo && !t.hasAudio
            ? t.formatId + "+ba/" + t.formatId
            : t.formatId;
    const args = [
      "--ignore-config",
      "--no-playlist",
      "--no-warnings",
      "--newline",
      "--progress",
      "--progress-delta",
      "0.5",
      "--progress-template",
      "download:OG_PROGRESS:%(progress)j",
      "--print",
      "after_move:OG_FILE:%(filepath)j",
      "--no-simulate",
      "--continue",
      "--no-overwrites",
      "--windows-filenames",
      "--socket-timeout",
      "20",
      "--retries",
      "5",
      "--fragment-retries",
      "5",
      "--concurrent-fragments",
      String(t.threads),
      ...(this.ffmpeg ? ["--ffmpeg-location", this.ffmpeg] : []),
      "-f",
      format,
      "--merge-output-format",
      "mp4/mkv",
      ...(t.formatId === "audio"
        ? ["--extract-audio", "--audio-format", "mp3"]
        : []),
      "-o",
      t.outputTemplate,
      ...this.headerArgs(t.headers),
    ];
    if (this.settings.speedLimitKbps > 0)
      args.push(
        "--limit-rate",
        String(
          Math.max(
            1,
            Math.floor(
              (this.settings.speedLimitKbps * 1024) /
                this.settings.maxConcurrentDownloads /
                t.threads,
            ),
          ),
        ),
      );
    args.push("--", t.url);
    let child;
    try {
      child = this.spawnProcess(this.ytDlp, args, {
        windowsHide: true,
        detached: process.platform !== "win32",
        env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (e) {
      t.status = "error";
      t.errorMsg = e.message;
      this.changed(true);
      queueMicrotask(() => this.schedule());
      return;
    }
    const run = {
      child,
      stopping: false,
      requeue: false,
      stderr: "",
      lastSample: 0,
      lastBytes: 0,
      downloadedMax: 0,
    };
    this.running.set(t.id, run);
    const lines = readline.createInterface({ input: child.stdout });
    lines.on("line", (line) => this.handleLine(t, line, run));
    child.stderr.on("data", (b) => {
      run.stderr = (run.stderr + b.toString()).slice(-6000);
    });
    child.on("error", (e) => {
      run.stderr = e.message;
    });
    child.on("close", (code) => {
      lines.close();
      this.running.delete(t.id);
      t.speed = 0;
      t.eta = 0;
      if (run.deleted) {
        this.changed(true);
        this.schedule();
        return;
      }
      if (run.stopping) t.status = run.requeue ? "queued" : "paused";
      else if (code === 0 && t.outputPath && fs.existsSync(t.outputPath)) {
        const size = fs.statSync(t.outputPath).size;
        if (size <= 0) {
          t.status = "error";
          t.errorMsg = "Источник создал пустой файл.";
        } else {
          t.status = "completed";
          t.totalBytes = size;
          t.downloadedBytes = size;
          t.completedAt = Date.now();
        }
      } else {
        t.status = "error";
        t.errorMsg = run.stderr.trim() || "Загрузка не создала готовый файл.";
      }
      this.changed(true);
      this.schedule();
    });
    this.changed(true);
  }
  handleLine(t, line, run) {
    if (line.startsWith("OG_PROGRESS:")) {
      try {
        const p = JSON.parse(line.slice(12));
        if (p.status === "finished") {
          t.status = "merging";
          t.speed = 0;
        } else {
          t.status = "downloading";
          t.speed = Number(p.speed) || 0;
        }
        t.progressParts ||= {};
        const key = p.filename || "stream";
        t.progressParts[key] = {
          downloaded: Number(p.downloaded_bytes) || 0,
          total: Number(p.total_bytes) || Number(p.total_bytes_estimate) || 0,
          estimated: !p.total_bytes,
        };
        const parts = Object.values(t.progressParts);
        t.downloadedBytes = parts.reduce(
          (sum, part) => sum + part.downloaded,
          0,
        );
        t.totalBytes = parts.some((part) => !part.total)
          ? 0
          : parts.reduce((sum, part) => sum + part.total, 0);
        t.estimated = parts.some((part) => part.estimated);
        t.eta = Number(p.eta) || 0;
        t.fragmentIndex = Number(p.fragment_index) || 0;
        t.fragmentCount = Number(p.fragment_count) || 0;
        this.changed();
      } catch {}
    } else if (line.startsWith("OG_FILE:")) {
      try {
        t.outputPath = JSON.parse(line.slice(8));
        t.filename = path.basename(t.outputPath);
        this.changed();
      } catch {}
    }
  }
  control(id, action) {
    const t = this.tasks.find((t) => t.id === id);
    if (!t) throw Error("Задача не найдена.");
    const run = this.running.get(id);
    if (action === "pause") {
      if (run) {
        run.stopping = true;
        run.requeue = false;
        this.stopProcess(run.child);
      } else if (t.status === "queued") t.status = "paused";
    } else if (action === "resume") {
      if (run) {
        if (run.stopping) run.requeue = true;
      } else if (t.status !== "completed") {
        t.status = "queued";
        t.errorMsg = undefined;
      }
    } else if (action === "delete") {
      if (run) {
        run.deleted = true;
        run.stopping = true;
        this.stopProcess(run.child);
      }
      this.tasks = this.tasks.filter((x) => x.id !== id);
    } else throw Error("Неизвестное действие.");
    this.changed(true);
    this.schedule();
  }
  updateSettings(input) {
    const next = settingsFrom(input, this.settings);
    fs.mkdirSync(next.defaultDownloadDir, { recursive: true });
    const restart = [
      "maxThreads",
      "maxConcurrentDownloads",
      "speedLimitKbps",
    ].some((k) => next[k] !== this.settings[k]);
    this.settings = next;
    if (restart)
      for (const run of this.running.values()) {
        if (!run.stopping) {
          run.stopping = true;
          run.requeue = true;
          this.stopProcess(run.child);
        }
      }
    this.changed(true);
    this.schedule();
    return this.settings;
  }
  async shutdown() {
    this.closing = true;
    for (const child of this.analyzers) this.stopProcess(child);
    const closed = [...this.running.values()].map(
      (run) =>
        new Promise((r) => {
          run.stopping = true;
          run.requeue = false;
          run.child.once("close", r);
          this.stopProcess(run.child);
        }),
    );
    await Promise.all(closed);
    this.save();
  }
}
