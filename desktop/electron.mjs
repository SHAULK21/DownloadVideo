import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  nativeTheme,
  dialog,
  shell,
  screen,
  powerMonitor,
} from "electron";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DownloadManager } from "./manager.mjs";
import { createServer, persistentToken } from "./server.mjs";

app.setName("OmniGrab");
app.setAppUserModelId("com.omnigrab.desktop");
const dataDir =
  process.env.OMNIGRAB_DATA_DIR ||
  (process.platform === "win32"
    ? path.join(process.env.LOCALAPPDATA || os.homedir(), "OmniGrab")
    : path.join(os.homedir(), ".omnigrab"));
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(path.join(dataDir, "desktop"), { recursive: true });
app.setPath("userData", path.join(dataDir, "desktop"));
let window,
  tray,
  manager,
  server,
  ready,
  quitting = false,
  stopped = false;
const root = app.getAppPath();
const resources = app.isPackaged
  ? process.resourcesPath
  : path.join(root, "release", "desktop-resources");
const port = Number(process.env.OMNIGRAB_PORT) || 17893;
const origin = `http://127.0.0.1:${port}`;
const windowStatePath = path.join(dataDir, "window.json");
function logError(error) {
  try {
    fs.appendFileSync(
      path.join(dataDir, "error.log"),
      new Date().toISOString() + " " + (error.stack || error) + "\n",
    );
  } catch {}
}
function showWindow() {
  if (!window || window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}
function saveWindow() {
  if (!window || window.isDestroyed()) return;
  try {
    fs.writeFileSync(
      windowStatePath,
      JSON.stringify({
        ...window.getNormalBounds(),
        maximized: window.isMaximized(),
      }),
    );
  } catch {}
}
function readWindow() {
  try {
    const saved = JSON.parse(fs.readFileSync(windowStatePath, "utf8"));
    const bounds = Object.fromEntries(
      ["x", "y", "width", "height"].map((k) => [k, saved[k]]),
    );
    if (
      !Object.values(bounds).every(Number.isFinite) ||
      bounds.width < 850 ||
      bounds.height < 580
    )
      return {};
    const visible = screen
      .getAllDisplays()
      .some(
        ({ workArea: a }) =>
          bounds.x + bounds.width > a.x + 80 &&
          bounds.y + bounds.height > a.y + 80 &&
          bounds.x < a.x + a.width - 80 &&
          bounds.y < a.y + a.height - 80,
      );
    return visible ? { ...bounds, maximized: saved.maximized === true } : {};
  } catch {
    return {};
  }
}
function openLicenses() {
  const licenses = new BrowserWindow({
    width: 820,
    height: 650,
    parent: window,
    title: "OmniGrab — лицензии",
    backgroundColor: "#101520",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  licenses.setMenu(null);
  licenses.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  licenses.webContents.on("will-navigate", (event, url) => {
    if (url !== origin + "/THIRD_PARTY_NOTICES.txt") event.preventDefault();
  });
  void licenses.loadURL(origin + "/THIRD_PARTY_NOTICES.txt");
}
async function openFolder(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const error = await shell.openPath(dir);
  if (error) throw Error(error);
}
async function chooseFolder(dir) {
  const result = await dialog.showOpenDialog(window, {
    title: "Куда сохранять загрузки",
    defaultPath: dir,
    properties: ["openDirectory", "createDirectory"],
  });
  return result.canceled ? "" : result.filePaths[0];
}
function updateTray() {
  if (!tray || tray.isDestroyed()) return;
  const active =
    manager?.tasks.filter((t) =>
      ["queued", "downloading", "merging"].includes(t.status),
    ).length || 0;
  tray.setToolTip(
    "OmniGrab" + (active ? ` — загрузок: ${active}` : " — готов к загрузке"),
  );
  if (window && !window.isDestroyed()) {
    const tasks =
      manager?.tasks.filter((t) =>
        ["downloading", "merging"].includes(t.status),
      ) || [];
    const total = tasks.reduce((sum, t) => sum + t.totalBytes, 0);
    window.setProgressBar(
      tasks.length
        ? total
          ? Math.min(
              0.99,
              tasks.reduce((sum, t) => sum + t.downloadedBytes, 0) / total,
            )
          : 2
        : -1,
    );
  }
}
async function quit() {
  if (quitting) return;
  quitting = true;
  saveWindow();
  try {
    if (server?.listening) await manager?.shutdown();
  } catch (e) {
    logError(e);
  }
  if (server?.listening) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  tray?.destroy();
  stopped = true;
  app.quit();
}
async function start() {
  await app.whenReady();
  nativeTheme.themeSource = "dark";
  const tools = app.isPackaged
    ? path.join(resources, "tools")
    : path.join(root, "release");
  manager = new DownloadManager({
    dataDir,
    ytDlp:
      process.env.OMNIGRAB_YTDLP ||
      (process.platform === "win32"
        ? path.join(tools, "yt-dlp.exe")
        : "yt-dlp"),
    ffmpeg:
      process.env.OMNIGRAB_FFMPEG ||
      (process.platform === "win32"
        ? path.join(tools, "ffmpeg.exe")
        : "ffmpeg"),
    pluginDir: app.isPackaged
      ? path.join(resources, "plugins")
      : path.join(root, "plugins"),
  });
  const token = persistentToken(dataDir);
  server = createServer(manager, {
    port,
    token,
    readAsset: (name) => fs.readFileSync(path.join(root, "dist", name)),
    openFolder,
    chooseFolder,
    desktop: {
      show: showWindow,
      hide: () => window?.hide(),
      quit: () => setImmediate(() => app.quit()),
    },
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const saved = readWindow();
  const icon = nativeImage.createFromPath(
    path.join(root, "desktop", "assets", "icon.png"),
  );
  window = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 850,
    minHeight: 580,
    ...saved,
    show: false,
    title: "OmniGrab",
    icon,
    backgroundColor: "#0b1019",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged,
      spellcheck: false,
    },
  });
  if (saved.maximized) window.maximize();
  window.setMenu(null);
  window.webContents.on("page-title-updated", (event) =>
    event.preventDefault(),
  );
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url === origin + "/THIRD_PARTY_NOTICES.txt") openLicenses();
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== origin || new URL(url).pathname !== "/")
      event.preventDefault();
  });
  window.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );
  const session = window.webContents.session;
  session.setPermissionRequestHandler((contents, permission, callback) =>
    callback(
      contents === window.webContents &&
        contents.getURL().startsWith(origin + "/") &&
        permission === "clipboard-sanitized-write",
    ),
  );
  session.setPermissionCheckHandler(
    (contents, permission) =>
      contents === window.webContents &&
      contents.getURL().startsWith(origin + "/") &&
      permission === "clipboard-sanitized-write",
  );
  session.on("will-download", (event, item) => {
    event.preventDefault();
    if (item.getURL() !== origin + "/extension.zip") return;
    void (async () => {
      const result = await dialog.showSaveDialog(window, {
        title: "Сохранить расширение",
        defaultPath: path.join(
          app.getPath("downloads"),
          "OmniGrab-Extension.zip",
        ),
        filters: [{ name: "ZIP архив", extensions: ["zip"] }],
      });
      if (!result.canceled && result.filePath)
        fs.writeFileSync(
          result.filePath,
          fs.readFileSync(path.join(root, "dist", "extension.zip")),
        );
    })().catch((e) => {
      logError(e);
      dialog.showErrorBox("Не удалось сохранить расширение", e.message);
    });
  });
  try {
    tray = new Tray(icon.resize({ width: 24, height: 24 }));
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Открыть OmniGrab", click: showWindow },
        {
          label: "Папка загрузок",
          click: () =>
            void openFolder(manager.settings.defaultDownloadDir).catch(
              logError,
            ),
        },
        { type: "separator" },
        {
          label: "Приостановить все",
          click: () => {
            for (const t of [...manager.tasks])
              if (["queued", "downloading", "merging"].includes(t.status))
                manager.control(t.id, "pause");
          },
        },
        {
          label: "Продолжить все",
          click: () => {
            for (const t of [...manager.tasks])
              if (t.status === "paused") manager.control(t.id, "resume");
          },
        },
        { type: "separator" },
        {
          label: "О программе",
          click: () =>
            void dialog.showMessageBox(window, {
              title: "OmniGrab",
              message: "OmniGrab " + app.getVersion(),
              detail:
                "Загрузчик видео и аудио для Windows.\nЗакрытие окна сворачивает программу в трей. Для завершения выберите «Выход».",
            }),
        },
        { label: "Выход", click: () => app.quit() },
      ]),
    );
    tray.on("click", showWindow);
    tray.on("double-click", showWindow);
  } catch (e) {
    logError(e);
  }
  window.on("close", (event) => {
    saveWindow();
    if (!quitting && tray && !tray.isDestroyed()) {
      event.preventDefault();
      window.hide();
    } else if (!quitting) {
      event.preventDefault();
      app.quit();
    }
  });
  window.on("session-end", () => manager.save());
  window.webContents.on("render-process-gone", (_event, details) => {
    logError(Error("Renderer stopped: " + details.reason));
    if (!quitting)
      void dialog
        .showMessageBox(window, {
          type: "error",
          title: "OmniGrab",
          message: "Окно программы остановилось. Загрузки продолжаются.",
          buttons: ["Открыть снова", "Выход"],
        })
        .then((r) =>
          r.response === 0
            ? window.loadURL(origin + "/#token=" + token)
            : app.quit(),
        );
  });
  manager.on("change", updateTray);
  powerMonitor.on("shutdown", () => manager.save());
  updateTray();
  await window.loadURL(origin + "/#token=" + token);
  showWindow();
  ready = true;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (ready) showWindow();
    else void app.whenReady().then(showWindow);
  });
  app.on("activate", showWindow);
  app.on("window-all-closed", () => {});
  app.on("before-quit", (event) => {
    if (!stopped) {
      event.preventDefault();
      void quit();
    }
  });
  process.on("uncaughtException", (e) => {
    logError(e);
    manager?.save();
    if (app.isReady()) dialog.showErrorBox("OmniGrab", e.message);
  });
  process.on("unhandledRejection", logError);
  void start().catch((e) => {
    logError(e);
    dialog.showErrorBox(
      "Не удалось запустить OmniGrab",
      e.code === "EADDRINUSE"
        ? "Предыдущая версия OmniGrab уже работает. Закройте её консоль через Ctrl+C и снова запустите новое приложение."
        : e.message,
    );
    void quit();
  });
}
