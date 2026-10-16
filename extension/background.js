const BASE = "http://127.0.0.1:17893";
const DEFAULTS = {
  showFloatingButton: true,
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
let registryQueue = Promise.resolve();
const requestHeaders = new Map();
function httpUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (details.tabId < 0 || details.url.startsWith(BASE)) return;
    const headers = {};
    for (const h of details.requestHeaders || []) {
      const key = {
        referer: "Referer",
        origin: "Origin",
        "user-agent": "User-Agent",
      }[h.name.toLowerCase()];
      if (key && h.value) headers[key] = h.value;
    }
    requestHeaders.set(details.requestId, headers);
    if (requestHeaders.size > 1000)
      requestHeaders.delete(requestHeaders.keys().next().value);
  },
  { urls: ["<all_urls>"] },
  ["requestHeaders", "extraHeaders"],
);
chrome.webRequest.onErrorOccurred.addListener(
  (details) => requestHeaders.delete(details.requestId),
  { urls: ["<all_urls>"] },
);
async function local(path, method = "GET", body) {
  const { token } = await chrome.storage.local.get("token");
  let response;
  try {
    response = await fetch(BASE + path, {
      method,
      headers: {
        Authorization: "Bearer " + (token || ""),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw Error("Запустите OmniGrab.exe на этом ПК.");
  }
  const result = await response.json();
  if (!response.ok) throw Error(result.error || "Ошибка соединения.");
  return result;
}
async function settings() {
  try {
    const state = await local("/api/state");
    await chrome.storage.local.set({ settings: state.settings });
    return state.settings;
  } catch {
    const saved = await chrome.storage.local.get("settings");
    return { ...DEFAULTS, ...saved.settings };
  }
}
async function record(details) {
  const headers = requestHeaders.get(details.requestId) || {};
  requestHeaders.delete(details.requestId);
  if (details.tabId < 0 || details.url.startsWith(BASE)) return;
  const h = (name) =>
    (details.responseHeaders || []).find((h) => h.name.toLowerCase() === name)
      ?.value || "";
  const mime = h("content-type").toLowerCase();
  let ext;
  try {
    ext = new URL(details.url).pathname.split(".").pop().toLowerCase();
  } catch {
    return;
  }
  // Individual segments are not complete videos. Keep the manifest instead.
  if (["ts", "m4s", "cmfv", "cmfa"].includes(ext)) return;
  const types = {
    "application/vnd.apple.mpegurl": "m3u8",
    "application/x-mpegurl": "m3u8",
    "application/dash+xml": "mpd",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/ogg": "ogg",
  };
  ext = types[mime.split(";")[0]] || ext;
  const { settings: saved } = await chrome.storage.local.get("settings");
  const cfg = { ...DEFAULTS, ...saved };
  if (!cfg.interceptVideoTypes.includes(ext)) return;
  const rangeTotal = h("content-range").match(/\/(\d+)$/)?.[1];
  const size = Number(rangeTotal) || Number(h("content-length")) || 0;
  if (
    size &&
    size < cfg.minFileSizeToCatchKb * 1024 &&
    !["m3u8", "mpd"].includes(ext)
  )
    return;
  const key = "media_" + details.tabId;
  const data = await chrome.storage.session.get(key);
  let list = data[key] || [];
  list = list.filter((x) => x.url !== details.url);
  list.push({
    url: details.url,
    mime,
    ext,
    size,
    headers,
    frameId: details.frameId ?? 0,
    timestamp: Date.now(),
  });
  list = list.slice(-80);
  await chrome.storage.session.set({ [key]: list });
  try {
    await chrome.action.setBadgeText({
      tabId: details.tabId,
      text: String(list.length),
    });
    await chrome.action.setBadgeBackgroundColor({
      tabId: details.tabId,
      color: "#0891b2",
    });
  } catch {}
}
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    registryQueue = registryQueue.then(() => record(details)).catch(() => {});
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"],
);
function clearTab(tabId) {
  registryQueue = registryQueue
    .then(async () => {
      await chrome.storage.session.remove("media_" + tabId);
      try {
        await chrome.action.setBadgeText({ tabId, text: "" });
      } catch {}
    })
    .catch(() => {});
}
chrome.tabs.onRemoved.addListener(clearTab);
chrome.tabs.onUpdated.addListener((id, change) => {
  if (change.status === "loading") clearTab(id);
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  (async () => {
    if (message.action === "PAIR") {
      const r = await local("/api/pair", "POST", {
        code: String(message.code || ""),
      });
      await chrome.storage.local.set({ token: r.token, settings: r.settings });
      return { ok: true };
    }
    if (message.action === "GET_SETTINGS")
      return { settings: await settings() };
    if (message.action === "GET_TAB_MEDIA") {
      await registryQueue;
      const id = sender.tab?.id ?? message.tabId;
      const r = await chrome.storage.session.get("media_" + id);
      return { media: r["media_" + id] || [] };
    }
    if (["DOWNLOAD", "DOWNLOAD_VIDEO"].includes(message.action)) {
      await registryQueue;
      const page =
        httpUrl(sender.url) ||
        httpUrl(message.pageUrl) ||
        httpUrl(sender.tab?.url);
      const tabId = sender.tab?.id ?? message.tabId;
      const saved = await chrome.storage.session.get("media_" + tabId);
      const media = saved["media_" + tabId] || [];
      let raw = httpUrl(message.url);
      let captured = media.find((x) => x.url === raw);
      if (message.action === "DOWNLOAD_VIDEO" && !raw) {
        const inFrame = media.filter(
          (x) => x.frameId === (sender.frameId ?? 0),
        );
        const manifests = inFrame.filter((x) =>
          ["m3u8", "mpd"].includes(x.ext),
        );
        const masters = manifests.filter((x) =>
          /\/(master|playlist)\.(m3u8|mpd)(?:\?|$)/i.test(x.url),
        );
        const candidates = masters.length
          ? masters
          : manifests.length
            ? manifests
            : inFrame;
        // Multiple players/ads must not silently select an unrelated video.
        if (candidates.length === 1) captured = candidates[0];
        raw = captured?.url || page;
      }
      if (!raw)
        throw Error(
          "Не найден HTTP(S) источник. Включите видео и обновите список потоков.",
        );
      const url = new URL(raw);
      const r = await local("/api/tasks", "POST", {
        items: [
          {
            url: url.href,
            title: message.title || sender.tab?.title,
            headers: {
              ...(page ? { Referer: page } : {}),
              "User-Agent": navigator.userAgent,
              ...captured?.headers,
            },
          },
        ],
      });
      return { ok: true, id: r.ids[0] };
    }
    if (message.action === "OPEN_APP") {
      await local("/api/app", "POST", { action: "show" });
      return { ok: true };
    }
    throw Error("Неизвестное действие.");
  })()
    .then(respond)
    .catch((e) => respond({ error: e.message }));
  return true;
});
