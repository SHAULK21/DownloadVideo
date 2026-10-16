import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { JSDOM } from "jsdom";
test("extension registry survives worker restart and clears only the navigated tab", async () => {
  const session = {},
    local = {
      token: "test",
      settings: { minFileSizeToCatchKb: 0, interceptVideoTypes: ["mp4"] },
    };
  let headers, message, updated, removed;
  const storage = (obj) => ({
    async get(key) {
      return Object.fromEntries(
        (Array.isArray(key) ? key : [key]).map((k) => [k, obj[k]]),
      );
    },
    async set(values) {
      Object.assign(obj, values);
    },
    async remove(key) {
      delete obj[key];
    },
  });
  const chrome = {
    storage: { local: storage(local), session: storage(session) },
    webRequest: {
      onHeadersReceived: {
        addListener(fn) {
          headers = fn;
        },
      },
    },
    runtime: {
      onMessage: {
        addListener(fn) {
          message = fn;
        },
      },
    },
    tabs: {
      onUpdated: {
        addListener(fn) {
          updated = fn;
        },
      },
      onRemoved: {
        addListener(fn) {
          removed = fn;
        },
      },
    },
    action: { async setBadgeText() {}, async setBadgeBackgroundColor() {} },
  };
  const source = fs.readFileSync("extension/background.js", "utf8");
  const run = () =>
    vm.runInNewContext(source, {
      chrome,
      URL,
      console,
      AbortSignal,
      navigator: { userAgent: "test" },
      fetch: async () => {
        throw Error("offline");
      },
    });
  const send = (m) => new Promise((r) => message(m, {}, r));
  run();
  headers({
    tabId: 7,
    url: "https://cdn.test/first.mp4",
    responseHeaders: [{ name: "Content-Type", value: "video/mp4" }],
  });
  assert.equal(
    (await send({ action: "GET_TAB_MEDIA", tabId: 7 })).media.length,
    1,
  );
  run();
  assert.equal(
    (await send({ action: "GET_TAB_MEDIA", tabId: 7 })).media.length,
    1,
  );
  updated(8, { status: "loading" });
  assert.equal(
    (await send({ action: "GET_TAB_MEDIA", tabId: 7 })).media.length,
    1,
  );
  updated(7, { status: "loading" });
  assert.equal(
    (await send({ action: "GET_TAB_MEDIA", tabId: 7 })).media.length,
    0,
  );
  const result = await send({
    action: "DOWNLOAD",
    url: "https://cdn.test/v.mp4",
  });
  assert.ok(result.error);
  assert.equal(result.ok, undefined);
  removed(7);
});
test("floating button attaches to late source and sends the current source", async () => {
  const dom = new JSDOM("<html><body><video></video></body></html>", {
    url: "https://page.test/watch",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window;
  const messages = [];
  const shadows = [];
  const original = w.HTMLElement.prototype.attachShadow;
  w.HTMLElement.prototype.attachShadow = function (options) {
    const shadow = original.call(this, options);
    shadows.push(shadow);
    return shadow;
  };
  w.HTMLElement.prototype.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 640,
    bottom: 360,
    width: 640,
    height: 360,
  });
  w.chrome = {
    runtime: {
      sendMessage(m, cb) {
        messages.push(m);
        cb(
          m.action === "GET_SETTINGS"
            ? { settings: { showFloatingButton: true } }
            : { ok: true, id: "real-id" },
        );
      },
    },
    storage: { onChanged: { addListener() {} } },
  };
  w.eval(fs.readFileSync("extension/content.js", "utf8"));
  const v = w.document.querySelector("video");
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(shadows.length, 0);
  v.src = "https://cdn.test/first.mp4";
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(shadows.length, 1);
  v.src = "https://cdn.test/second.mp4";
  shadows[0].querySelector("button").click();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(
    messages.find((m) => m.action === "DOWNLOAD").url,
    "https://cdn.test/second.mp4",
  );
  dom.window.close();
});
