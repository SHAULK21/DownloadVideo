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
  let headers, message, updated, removed, outgoing;
  let offline = true;
  const posted = [];
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
      onBeforeSendHeaders: {
        addListener(fn) {
          outgoing = fn;
        },
      },
      onErrorOccurred: { addListener() {} },
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
      fetch: async (_url, init) => {
        if (offline) throw Error("offline");
        posted.push(JSON.parse(init.body));
        return {
          ok: true,
          async json() {
            return { ids: ["task-id"] };
          },
        };
      },
    });
  const send = (m, sender = {}) => new Promise((r) => message(m, sender, r));
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
  offline = false;
  // A popup's sender.url is chrome-extension://, never the media Referer.
  await send(
    {
      action: "DOWNLOAD",
      url: "https://cdn.test/file.mp4",
      pageUrl: "https://page.test/watch",
      tabId: 7,
    },
    { url: "chrome-extension://test/popup.html" },
  );
  assert.equal(
    posted.at(-1).items[0].headers.Referer,
    "https://page.test/watch",
  );
  // A range response with a generic MIME must still be captured.
  headers({
    tabId: 7,
    frameId: 2,
    requestId: "range",
    url: "https://cdn.test/file.mp4",
    responseHeaders: [
      { name: "Content-Type", value: "application/octet-stream" },
      { name: "Content-Length", value: "10" },
      { name: "Content-Range", value: "bytes 0-9/5000000" },
    ],
  });
  assert.equal(
    (await send({ action: "GET_TAB_MEDIA", tabId: 7 })).media.length,
    1,
  );
  local.settings.interceptVideoTypes.push("m3u8");
  outgoing({
    tabId: 7,
    requestId: "hls",
    url: "https://cdn.test/master.m3u8",
    requestHeaders: [
      { name: "Referer", value: "https://player.test/e/video" },
      { name: "Origin", value: "https://player.test" },
      { name: "Cookie", value: "must-not-be-copied" },
    ],
  });
  headers({
    tabId: 7,
    frameId: 2,
    requestId: "hls",
    url: "https://cdn.test/master.m3u8",
    responseHeaders: [
      { name: "Content-Type", value: "application/vnd.apple.mpegurl" },
    ],
  });
  headers({
    tabId: 7,
    frameId: 2,
    url: "https://cdn.test/chunk.m4s",
    responseHeaders: [{ name: "Content-Type", value: "video/mp4" }],
  });
  const blob = await send(
    {
      action: "DOWNLOAD_VIDEO",
      url: "blob:https://player.test/id",
      pageUrl: "https://player.test/e/video",
    },
    {
      tab: { id: 7, url: "https://top.test/" },
      url: "https://player.test/e/video",
      frameId: 2,
    },
  );
  assert.equal(blob.ok, true);
  assert.equal(posted.at(-1).items[0].url, "https://cdn.test/master.m3u8");
  assert.equal(
    posted.at(-1).items[0].headers.Referer,
    "https://player.test/e/video",
  );
  assert.equal(posted.at(-1).items[0].headers.Origin, "https://player.test");
  assert.equal(posted.at(-1).items[0].headers.Cookie, undefined);
  assert.equal(
    (await send({ action: "GET_TAB_MEDIA", tabId: 7 })).media.length,
    2,
  );
  // Popup downloads must also use the captured iframe headers.
  await send(
    {
      action: "DOWNLOAD",
      url: "https://cdn.test/master.m3u8",
      pageUrl: "https://top.test/",
      tabId: 7,
    },
    { url: "chrome-extension://test/popup.html" },
  );
  assert.equal(
    posted.at(-1).items[0].headers.Referer,
    "https://player.test/e/video",
  );
  // Another frame must not inherit a player's stream.
  await send(
    {
      action: "DOWNLOAD_VIDEO",
      url: "blob:https://other.test/id",
      pageUrl: "https://other.test/watch",
    },
    { tab: { id: 7 }, url: "https://other.test/watch", frameId: 3 },
  );
  assert.equal(posted.at(-1).items[0].url, "https://other.test/watch");
  removed(7);
  assert.equal((await send({ action: "OPEN_APP" })).ok, true);
  assert.equal(posted.at(-1).action, "show");
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
    messages.find((m) => m.action === "DOWNLOAD_VIDEO").url,
    "https://cdn.test/second.mp4",
  );
  dom.window.close();
});
