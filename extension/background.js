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
  if (
    !mime.startsWith("video/") &&
    !mime.startsWith("audio/") &&
    !["m3u8", "mpd"].includes(ext)
  )
    return;
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
  if (list.some((x) => x.url === details.url)) return;
  list.push({ url: details.url, mime, ext, size, timestamp: Date.now() });
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
    if (message.action === "DOWNLOAD") {
      const raw = String(message.url || "");
      const url = new URL(raw);
      if (!["http:", "https:"].includes(url.protocol))
        throw Error("Отправьте страницу видео вместо blob-потока.");
      const page = sender.url || sender.tab?.url || message.pageUrl;
      const r = await local("/api/tasks", "POST", {
        items: [
          {
            url: url.href,
            title: message.title || sender.tab?.title,
            headers: {
              ...(page ? { Referer: page } : {}),
              "User-Agent": navigator.userAgent,
            },
          },
        ],
      });
      return { ok: true, id: r.ids[0] };
    }
    if (message.action === "OPEN_APP") {
      await chrome.tabs.create({ url: BASE });
      return { ok: true };
    }
    throw Error("Неизвестное действие.");
  })()
    .then(respond)
    .catch((e) => respond({ error: e.message }));
  return true;
});
