import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { _electron as electron } from "playwright-core";
import {
  fixture,
  freePort,
  api,
  until,
  assertGUI,
} from "./desktop-fixture.mjs";
const executablePath = path.resolve(process.argv[2]);
assertGUI(executablePath);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "omnigrab-desktop-"));
const dataDir = path.join(temp, "state");
const media = await fixture(temp);
const port = await freePort();
const base = "http://127.0.0.1:" + port;
const env = {
  ...process.env,
  OMNIGRAB_DATA_DIR: dataDir,
  OMNIGRAB_PORT: String(port),
};
let application;
let nativeProcess;
const hash = (value) => createHash("sha256").update(value).digest("hex");
try {
  application = await electron.launch({
    executablePath,
    env,
    args: ["--disable-gpu"],
    timeout: 90000,
  });
  nativeProcess = application.process();
  const page = await application.firstWindow();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.getByRole("heading", { name: "Готов к загрузке" }).waitFor();
  const token = fs.readFileSync(path.join(dataDir, "access-token"), "utf8");
  const call = api(base, token);
  const state = await call("/api/state");
  assert.equal(state.desktop, true);
  assert.equal(state.version, "3.1.0");
  const security = await application.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    const p = w.webContents.getLastWebPreferences();
    return {
      title: w.getTitle(),
      visible: w.isVisible(),
      node: p.nodeIntegration,
      sandbox: p.sandbox,
      isolation: p.contextIsolation,
    };
  });
  assert.deepEqual(security, {
    title: "OmniGrab",
    visible: true,
    node: false,
    sandbox: true,
    isolation: true,
  });
  assert.equal(await page.evaluate(() => typeof window.require), "undefined");
  assert.equal(await page.evaluate(() => typeof window.process), "undefined");
  await page.screenshot({ path: "release/desktop-smoke.png" });
  // Native folder picker is reached through the same UI API.
  const folder = path.join(temp, "downloads");
  fs.mkdirSync(folder);
  await application.evaluate(({ dialog }, chosen) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [chosen],
    });
  }, folder);
  assert.equal((await call("/api/choose-folder", "POST", {})).path, folder);
  await call("/api/settings", "PUT", { defaultDownloadDir: folder });
  await page
    .getByRole("button", { name: "Добавить ссылку", exact: true })
    .first()
    .click();
  await page.getByPlaceholder("https://…").fill(media.base + "/test.mp4");
  await page
    .getByRole("button", { name: "Начать скачивание", exact: true })
    .click();
  const completed = await until(async () => {
    const t = (await call("/api/state")).tasks[0];
    assert.notEqual(t?.status, "error", t?.errorMsg);
    return t?.status === "completed" && t;
  });
  assert.equal(hash(fs.readFileSync(completed.outputPath)), hash(media.bytes));
  // Pairing remains available for the browser extension.
  const pair = await fetch(base + "/api/pair", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "chrome-extension://" + "a".repeat(32),
    },
    body: JSON.stringify({ code: state.pairing.code }),
  });
  assert.equal(pair.status, 200);
  assert.equal((await pair.json()).token, token);
  await call("/api/tasks", "POST", {
    items: [{ url: media.base + "/slow.mp4" }],
  });
  await until(
    async () => (await call("/api/state")).tasks[0].downloadedBytes > 0,
  );
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].close(),
  );
  assert.equal(
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isVisible(),
    ),
    false,
    "Close must hide the window in the tray",
  );
  const hiddenDownload = await until(async () => {
    const t = (await call("/api/state")).tasks[0];
    assert.notEqual(t.status, "error", t.errorMsg);
    return t.status === "completed" && t;
  });
  assert.equal(
    hash(fs.readFileSync(hiddenDownload.outputPath)),
    hash(media.slow),
  );
  await call("/api/app", "POST", { action: "show" });
  assert.equal(
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isVisible(),
    ),
    true,
  );
  // The extension ZIP opens a native Save As dialog and is copied intact.
  const zip = path.join(temp, "extension.zip");
  await application.evaluate(({ dialog }, selected) => {
    dialog.showSaveDialog = async () => ({
      canceled: false,
      filePath: selected,
    });
  }, zip);
  await page.getByRole("button", { name: "Расширение", exact: true }).click();
  await page.getByRole("link", { name: "Скачать расширение ZIP" }).click();
  await until(() => fs.existsSync(zip));
  assert.equal(
    hash(fs.readFileSync(zip)),
    hash(fs.readFileSync("release/OmniGrab-Extension.zip")),
  );
  await call("/api/app", "POST", { action: "hide" });
  const second = spawn(executablePath, ["--disable-gpu"], {
    env,
    windowsHide: true,
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      second.kill();
      reject(Error("Second instance did not exit"));
    }, 15000);
    second.once("error", reject);
    second.once("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(Error("Second instance exit: " + code));
    });
  });
  await until(() =>
    application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isVisible(),
    ),
  );
  assert.equal((await call("/api/state")).tasks.length, 2);
  assert.equal(errors.length, 0, errors.join("\n"));
  // Exit pauses the current process, saves it and really exits the app.
  await call("/api/tasks", "POST", {
    items: [{ url: media.base + "/slow.mp4" }],
  });
  await until(
    async () => (await call("/api/state")).tasks[0].downloadedBytes > 0,
  );
  await call("/api/app", "POST", { action: "quit" });
  await until(() => nativeProcess.exitCode !== null);
  const saved = JSON.parse(
    fs.readFileSync(path.join(dataDir, "state.json"), "utf8"),
  );
  assert.equal(saved.tasks[0].status, "paused");
  application = await electron.launch({
    executablePath,
    env,
    args: ["--disable-gpu"],
    timeout: 90000,
  });
  nativeProcess = application.process();
  await (
    await application.firstWindow()
  )
    .getByRole("heading", { name: "Менеджер загрузок" })
    .waitFor();
  const restored = await call("/api/state");
  assert.equal(restored.tasks.length, 3);
  assert.equal(restored.tasks[0].status, "paused");
  assert.equal(restored.settings.defaultDownloadDir, folder);
  await call("/api/app", "POST", { action: "quit" });
  await until(() => nativeProcess.exitCode !== null);
  application = null;
  console.log(
    "Desktop smoke passed: GUI executable, actual window, renderer isolation, native dialogs, real downloads, tray close/background download, extension pairing, second instance, graceful exit and restart.",
  );
} catch (error) {
  const log = path.join(dataDir, "error.log");
  if (fs.existsSync(log))
    console.error(
      fs
        .readFileSync(log, "utf8")
        .replace(/#token=[a-f0-9]+/g, "#token=[redacted]"),
    );
  throw error;
} finally {
  await application?.close().catch(() => {});
  await new Promise((resolve) => media.server.close(resolve));
  fs.rmSync(temp, {
    recursive: true,
    force: true,
    maxRetries: 20,
    retryDelay: 250,
  });
}
