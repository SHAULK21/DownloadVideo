import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { DownloadManager } from "../desktop/manager.mjs";
import { createServer } from "../desktop/server.mjs";
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "omnigrab-browser-"));
const manager = new DownloadManager({
  dataDir: temp,
  ytDlp: process.env.OMNIGRAB_YTDLP || "yt-dlp",
});
manager.updateSettings({ defaultDownloadDir: path.join(temp, "Downloads") });
const token = "b".repeat(64);
const server = createServer(manager, {
  port: 0,
  token,
  readAsset: (name) => fs.readFileSync(path.join("dist", name)),
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = "http://127.0.0.1:" + server.address().port;
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH,
    headless: true,
    args: [
      "--no-sandbox",
      "--single-process",
      "--no-zygote",
      "--disable-gpu",
      "--disable-dev-shm-usage",
    ],
  });
  const page = await browser.newPage({
    viewport: { width: 1366, height: 900 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/#token=" + token);
  await page.getByRole("heading", { name: "Готов к загрузке" }).waitFor();
  await page.screenshot({
    path: process.env.OG_SCREENSHOTS
      ? path.join(process.env.OG_SCREENSHOTS, "desktop.png")
      : path.join(temp, "desktop.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Добавить ссылку", exact: true })
    .first()
    .click();
  await page.getByPlaceholder("https://…").fill("https://first.test/video.mp4");
  await page.route("**/api/analyze", (route) =>
    route.fulfill({
      json: {
        streams: [
          {
            id: "720p",
            url: "https://first.test/video.mp4",
            title: "first",
            format: "mp4",
            quality: "720p",
            category: "video",
            filesize: 1000,
            hasAudio: true,
            hasVideo: true,
          },
        ],
      },
    }),
  );
  await page.getByRole("button", { name: "Распознать", exact: true }).click();
  await page.getByText("720p", { exact: true }).waitFor();
  await page
    .getByPlaceholder("https://…")
    .fill("https://second.test/video.mp4");
  assert.equal(await page.locator(".stream-list").count(), 0);
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page.getByLabel("Одновременно файлов").fill("3");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector("[role=dialog]"));
  assert.equal(manager.settings.maxConcurrentDownloads, 3);
  await page.getByRole("button", { name: "Расширение", exact: true }).click();
  await page
    .getByRole("heading", { name: "Заберите видео из браузера" })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Меню", exact: true }).click();
  await page.getByRole("button", { name: "Загрузки", exact: true }).click();
  await page.getByRole("heading", { name: "Менеджер загрузок" }).waitFor();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: process.env.OG_SCREENSHOTS
      ? path.join(process.env.OG_SCREENSHOTS, "mobile.png")
      : path.join(temp, "mobile.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Добавить ссылку", exact: true })
    .first()
    .click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    "Browser smoke passed: desktop/mobile, dialogs, settings, stale URL, navigation, no JS errors.",
  );
} finally {
  await browser?.close();
  await manager.shutdown();
  await new Promise((r) => server.close(r));
  fs.rmSync(temp, { recursive: true, force: true });
}
