import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import { until } from "./desktop-fixture.mjs";
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
test("browser downloads hand off transactionally, recover after worker restart, and resume on app failure", async () => {
  const saved = {
      token: "test",
      settings: { interceptBrowserDownloads: true },
    },
    session = {};
  const events = [],
    downloads = new Map();
  let onCreated,
    onAlarm,
    fail = false,
    message;
  const storage = (obj) => ({
    async get(key) {
      return key === null
        ? { ...obj }
        : Object.fromEntries(
            (Array.isArray(key) ? key : [key]).map((k) => [k, obj[k]]),
          );
    },
    async set(value) {
      Object.assign(obj, value);
    },
    async remove(key) {
      delete obj[key];
    },
  });
  const chrome = {
    runtime: {
      id: "extension-id",
      onMessage: {
        addListener(fn) {
          message = fn;
        },
      },
    },
    storage: { local: storage(saved), session: storage(session) },
    webRequest: {
      onBeforeSendHeaders: { addListener() {} },
      onErrorOccurred: { addListener() {} },
      onHeadersReceived: { addListener() {} },
    },
    tabs: { onRemoved: { addListener() {} }, onUpdated: { addListener() {} } },
    action: { async setBadgeText() {}, async setBadgeBackgroundColor() {} },
    downloads: {
      onCreated: {
        addListener(fn) {
          onCreated = fn;
        },
      },
      async search({ id }) {
        return downloads.has(id) ? [downloads.get(id)] : [];
      },
      async pause(id) {
        events.push("pause:" + id);
        downloads.get(id).paused = true;
      },
      async cancel(id) {
        events.push("cancel:" + id);
        Object.assign(downloads.get(id), {
          state: "interrupted",
          error: "USER_CANCELED",
        });
      },
      async resume(id) {
        events.push("resume:" + id);
        downloads.get(id).paused = false;
      },
    },
    alarms: {
      onAlarm: {
        addListener(fn) {
          onAlarm = fn;
        },
      },
      create() {},
    },
  };
  const source = fs.readFileSync("extension/background.js", "utf8");
  const run = () =>
    vm.runInNewContext(source, {
      chrome,
      URL,
      console,
      AbortSignal,
      navigator: { userAgent: "test" },
      fetch: async (url, init) => {
        const endpoint = new URL(url).pathname;
        events.push(endpoint);
        if (fail && endpoint === "/api/import-download") throw Error("offline");
        return {
          ok: true,
          async json() {
            return endpoint === "/api/import-download"
              ? { id: "native-file" }
              : {};
          },
        };
      },
    });
  run();
  const item = (id) => ({
    id,
    url: "https://files.test/archive.zip",
    filename: "C:\\Downloads\\archive.zip",
    mime: "application/zip",
    state: "in_progress",
    danger: "safe",
    startTime: "time" + id,
    referrer: "https://page.test/",
  });
  downloads.set(1, item(1));
  onCreated(downloads.get(1));
  await until(
    () => events.includes("/api/confirm-download") && !saved.handoff_1,
  );
  assert.ok(events.indexOf("pause:1") < events.indexOf("/api/import-download"));
  assert.ok(
    events.indexOf("/api/import-download") < events.indexOf("cancel:1"),
  );
  assert.ok(
    events.indexOf("cancel:1") < events.indexOf("/api/confirm-download"),
  );
  fail = true;
  events.length = 0;
  downloads.set(2, item(2));
  onCreated(downloads.get(2));
  await until(() => events.includes("resume:2"));
  assert.equal(events.includes("cancel:2"), false);
  fail = false;
  events.length = 0;
  saved.handoff_3 = {
    id: 3,
    key: "saved:3",
    url: "https://files.test/third.pdf",
    prepared: true,
    cancelStarted: true,
  };
  downloads.set(3, {
    ...item(3),
    state: "interrupted",
    error: "USER_CANCELED",
  });
  run();
  await until(
    () => events.includes("/api/confirm-download") && !saved.handoff_3,
  );
  assert.equal(
    events.includes("/api/import-download"),
    false,
    "Recover confirmation without duplicating task",
  );
  saved.settings.interceptBrowserDownloads = false;
  events.length = 0;
  downloads.set(4, item(4));
  onCreated(downloads.get(4));
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(events.length, 0);
});
test("floating button follows the source, fades/hides, drags without downloading and remembers position", async () => {
  const dom = new JSDOM("<html><body><video></video></body></html>", {
    url: "https://page.test/watch",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window;
  const messages = [];
  const shadows = [];
  let idle, storageChanged;
  const stored = {};
  const realTimeout = w.setTimeout.bind(w);
  w.setTimeout = (fn, delay, ...args) => {
    if (delay === 2200) {
      idle = fn;
      return -1;
    }
    return realTimeout(fn, delay, ...args);
  };
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
    storage: {
      local: {
        async get() {
          return stored;
        },
        async set(value) {
          Object.assign(stored, value);
        },
      },
      onChanged: {
        addListener(fn) {
          storageChanged = fn;
        },
      },
    },
  };
  w.eval(fs.readFileSync("extension/content.js", "utf8"));
  const v = w.document.querySelector("video");
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(shadows.length, 0);
  v.src = "https://cdn.test/first.mp4";
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(shadows.length, 1);
  v.src = "https://cdn.test/second.mp4";
  shadows[0].querySelector(".download").click();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(
    messages.find((m) => m.action === "DOWNLOAD_VIDEO").url,
    "https://cdn.test/second.mp4",
  );
  const host = w.document.querySelector("[data-omnigrab-button]");
  const pointer = (target, type, x, y) => {
    const event = new w.MouseEvent(type, {
      bubbles: true,
      composed: true,
      button: 0,
      clientX: x,
      clientY: y,
    });
    Object.defineProperty(event, "pointerId", { value: 1 });
    target.dispatchEvent(event);
  };
  let paused = false;
  Object.defineProperty(v, "paused", { get: () => paused });
  v.dispatchEvent(new w.Event("play"));
  idle();
  assert.equal(host.style.opacity, "0");
  assert.equal(
    host.style.pointerEvents,
    "none",
    "hidden overlay must not intercept player clicks",
  );
  pointer(w.document, "pointermove", 300, 200);
  assert.ok(Number(host.style.opacity) > 0);
  host.dispatchEvent(new w.Event("pointerenter"));
  idle();
  assert.equal(host.style.opacity, "1");
  host.dispatchEvent(new w.Event("pointerleave"));
  idle();
  assert.equal(host.style.opacity, "0");
  paused = true;
  v.dispatchEvent(new w.Event("pause"));
  idle();
  assert.ok(Number(host.style.opacity) > 0 && Number(host.style.opacity) < 0.4);
  const handle = shadows[0].querySelector(".drag");
  pointer(handle, "pointerdown", 10, 10);
  pointer(w.document, "pointermove", 600, 300);
  pointer(w.document, "pointerup", 600, 300);
  assert.ok(stored.floatingButtonPosition.x > 0.5);
  assert.ok(stored.floatingButtonPosition.y > 0.5);
  assert.equal(messages.filter((m) => m.action === "DOWNLOAD_VIDEO").length, 1);
  handle.dispatchEvent(
    new w.KeyboardEvent("keydown", { key: "Home", bubbles: true }),
  );
  assert.equal(stored.floatingButtonPosition.x, 0);
  storageChanged({ floatingButtonPosition: { newValue: { x: 1, y: 1 } } });
  w.innerWidth = 320;
  w.innerHeight = 200;
  w.dispatchEvent(new w.Event("resize"));
  await new Promise((r) => setTimeout(r, 40));
  assert.ok(
    parseFloat(host.style.left) >= 4 && parseFloat(host.style.left) <= 56,
  );
  assert.ok(
    parseFloat(host.style.top) >= 4 && parseFloat(host.style.top) <= 162,
  );
  Object.defineProperty(w.document, "fullscreenElement", {
    value: w.document.body,
    configurable: true,
  });
  w.document.dispatchEvent(new w.Event("fullscreenchange"));
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(host.parentNode, w.document.body);
  shadows[0].querySelector(".hide").click();
  w.dispatchEvent(new w.Event("resize"));
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(host.style.display, "none");
  v.remove();
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(host.isConnected, false);
  dom.window.close();
});
