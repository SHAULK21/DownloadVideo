import assert from "node:assert/strict";

// Runs the ZIP's real content script in Chromium, with only Chrome messaging and
// media playback state substituted. Mouse input, layout and hit testing are real.
export async function checkFloatingButton(page, source) {
  await page.evaluate(() => {
    window.overlayMessages = [];
    window.overlaySaved = {};
    window.chrome = {
      runtime: {
        sendMessage(message, callback) {
          window.overlayMessages.push(message);
          callback(
            message.action === "GET_SETTINGS"
              ? { settings: { showFloatingButton: true } }
              : { ok: true },
          );
        },
      },
      storage: {
        local: {
          async get() {
            return {};
          },
          async set(value) {
            Object.assign(window.overlaySaved, value);
          },
        },
        onChanged: { addListener() {} },
      },
    };
    const attach = HTMLElement.prototype.attachShadow;
    HTMLElement.prototype.attachShadow = function (options) {
      const shadow = attach.call(this, options);
      window.overlayShadow = shadow;
      return shadow;
    };
    const video = document.querySelector("video");
    Object.defineProperty(video, "paused", {
      configurable: true,
      get: () => !window.overlayPlaying,
    });
  });
  await page.evaluate((source) => {
    (0, eval)(source);
  }, source);
  const overlay = page.locator("[data-omnigrab-button]");
  await overlay.waitFor();
  assert.equal(
    await page.evaluate(
      () =>
        getComputedStyle(window.overlayShadow.querySelector("small")).display,
    ),
    "none",
  );
  await page.evaluate(() => {
    window.overlayPlaying = true;
    document.querySelector("video").dispatchEvent(new Event("play"));
  });
  await page.mouse.move(10, 10);
  await page.waitForFunction(
    () =>
      document.querySelector("[data-omnigrab-button]").style.opacity === "0",
  );
  assert.equal(
    await overlay.evaluate((el) => getComputedStyle(el).pointerEvents),
    "none",
  );
  const first = await overlay.boundingBox();
  assert.equal(
    await page.evaluate(
      ({ x, y }) =>
        document.elementFromPoint(x, y)?.closest("[data-omnigrab-button]") ===
        null,
      { x: first.x + 20, y: first.y + 15 },
    ),
    true,
  );
  await page.mouse.move(400, 300);
  await page.waitForFunction(
    () =>
      Number(document.querySelector("[data-omnigrab-button]").style.opacity) >
      0,
  );
  const handle = await page.evaluate(() => {
    const r = window.overlayShadow
      .querySelector(".drag")
      .getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(handle.x + 210, handle.y + 160, { steps: 8 });
  await page.mouse.up();
  const moved = await overlay.boundingBox();
  assert.ok(
    moved.x > first.x + 150 && moved.y > first.y + 100,
    JSON.stringify({ first, moved }),
  );
  assert.ok(
    await page.evaluate(() => window.overlaySaved.floatingButtonPosition.x > 0),
  );
  assert.equal(
    await page.evaluate(
      () =>
        window.overlayMessages.filter((m) => m.action === "DOWNLOAD_VIDEO")
          .length,
    ),
    0,
  );
  const download = await page.evaluate(() => {
    const r = window.overlayShadow
      .querySelector(".download")
      .getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(download.x, download.y);
  await page.waitForFunction(() =>
    window.overlayMessages.some((m) => m.action === "DOWNLOAD_VIDEO"),
  );
  await page.mouse.move(10, 10);
  await page.waitForFunction(
    () =>
      document.querySelector("[data-omnigrab-button]").style.opacity === "0",
  );
  await page.mouse.move(400, 300);
  const close = await page.evaluate(() => {
    const r = window.overlayShadow
      .querySelector(".hide")
      .getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(close.x, close.y);
  assert.equal(await overlay.isVisible(), false);
  assert.equal(
    await page.evaluate(
      () =>
        window.overlayMessages.filter((m) => m.action === "DOWNLOAD_VIDEO")
          .length,
    ),
    1,
  );
}

export const overlayHTML = `<html><body style="margin:0;background:#171b24"><video preload="none" src="https://cdn.invalid/fixture.mp4" style="display:block;position:absolute;left:80px;top:80px;width:640px;height:360px;background:black"></video></body></html>`;
