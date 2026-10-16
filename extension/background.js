const BASE = "http://127.0.0.1:17893";
const DEFAULTS = {
  showFloatingButton: true,
  captureAllFiles: true,
  interceptBrowserDownloads: true,
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
  minFileSizeToCatchKb: 0,
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
    requestHeaders.set(details.requestId, {
      headers,
      method: details.method || "GET",
    });
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
  const request = requestHeaders.get(details.requestId) || {};
  const headers = request.headers || {};
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
  const attachment = /attachment/i.test(h("content-disposition"));
  if (
    !attachment &&
    (["ts", "m4s", "cmfv", "cmfa"].includes(ext) ||
      /(?:mp2t|iso.segment)/.test(mime))
  )
    return;
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
  const contentType = mime.split(";")[0].trim();
  ext =
    types[contentType] ||
    (/^[a-z0-9]{1,12}$/.test(ext)
      ? ext
      : contentType.split("/")[1]?.replace(/^x-/, "").split("+")[0] || "file");
  const { settings: saved } = await chrome.storage.local.get("settings");
  const cfg = { ...DEFAULTS, ...saved };
  const media =
    /^(?:video|audio)\//.test(mime) ||
    details.type === "media" ||
    [
      "mp4",
      "webm",
      "m3u8",
      "mpd",
      "mp3",
      "m4a",
      "ogg",
      "mov",
      "mkv",
      "flv",
      "avi",
      "wmv",
      "aac",
      "flac",
      "wav",
      "opus",
    ].includes(ext);
  const file =
    attachment ||
    /^image\//.test(mime) ||
    (contentType.startsWith("application/") &&
      !/(?:json|javascript|xml|mpegurl)/.test(contentType)) ||
    [
      "zip",
      "7z",
      "rar",
      "pdf",
      "exe",
      "msi",
      "iso",
      "apk",
      "docx",
      "xlsx",
      "pptx",
      "epub",
    ].includes(ext);
  if (
    cfg.captureAllFiles
      ? !media && !file
      : !cfg.interceptVideoTypes.includes(ext)
  )
    return;
  const rangeTotal = h("content-range").match(/\/(\d+)$/)?.[1];
  const size = Number(rangeTotal) || Number(h("content-length")) || 0;
  if (
    !cfg.captureAllFiles &&
    size &&
    size < cfg.minFileSizeToCatchKb * 1024 &&
    !["m3u8", "mpd"].includes(ext)
  )
    return;
  const key = "media_" + details.tabId;
  const data = await chrome.storage.session.get(key);
  let list = data[key] || [];
  list = list.filter((x) => x.url !== details.url);
  const item = {
    url: details.url,
    mime,
    ext,
    size,
    headers,
    frameId: details.frameId ?? 0,
    timestamp: Date.now(),
    kind: media && !attachment ? "media" : "file",
    method: request.method || "GET",
  };
  list.push(item);
  list = list.slice(-500);
  await chrome.storage.session.set({ [key]: list });
  const candidates =
    (await chrome.storage.session.get("fileCandidates")).fileCandidates || [];
  await chrome.storage.session.set({
    fileCandidates: [
      ...candidates.filter((x) => x.url !== item.url),
      item,
    ].slice(-500),
  });
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
const activeTransfers = new Set();
async function handoffDownload(item, saved) {
  if (activeTransfers.has(item.id)) return;
  const url = httpUrl(item.finalUrl || item.url);
  if (!url || url.startsWith(BASE)) return;
  const { token, settings: cfg } = await chrome.storage.local.get([
    "token",
    "settings",
  ]);
  if (
    !saved &&
    (!token ||
      cfg?.interceptBrowserDownloads === false ||
      (item.danger &&
        !["safe", "accepted", "allowlistedByPolicy"].includes(item.danger)))
  )
    return;
  activeTransfers.add(item.id);
  const storageKey = "handoff_" + item.id;
  let marker = saved,
    paused = false;
  try {
    await registryQueue;
    const candidates =
      (await chrome.storage.session.get("fileCandidates")).fileCandidates || [];
    const captured = candidates.find(
      (x) => x.url === url || x.url === item.url,
    );
    if (!saved && captured?.method && captured.method !== "GET") return;
    marker ||= {
      id: item.id,
      key: `${chrome.runtime.id}:${item.id}:${item.startTime || ""}`,
      url,
      filename: (item.filename || "").replaceAll("\\", "/").split("/").pop(),
      mime: item.mime,
      headers: {
        ...(httpUrl(item.referrer) ? { Referer: item.referrer } : {}),
        "User-Agent": navigator.userAgent,
        ...captured?.headers,
      },
    };
    await chrome.storage.local.set({ [storageKey]: marker });
    const [current] = await chrome.downloads.search({ id: item.id });
    if (
      !current ||
      current.state === "complete" ||
      (current.state === "interrupted" && !marker.cancelStarted)
    ) {
      if (marker.prepared)
        await local("/api/abort-download", "POST", { key: marker.key });
      await chrome.storage.local.remove(storageKey);
      return;
    }
    if (current.state === "in_progress") {
      if (!current.paused) await chrome.downloads.pause(item.id);
      paused = true;
    }
    if (!marker.prepared) {
      await local("/api/import-download", "POST", marker);
      marker.prepared = true;
      await chrome.storage.local.set({ [storageKey]: marker });
    }
    marker.cancelStarted = true;
    await chrome.storage.local.set({ [storageKey]: marker });
    if (current.state === "in_progress") await chrome.downloads.cancel(item.id);
    await local("/api/confirm-download", "POST", { key: marker.key });
    await chrome.storage.local.remove(storageKey);
    await chrome.storage.local.set({ lastInterceptionError: "" });
  } catch (error) {
    if (!marker?.cancelStarted) {
      // A request may have reached the app before the response was lost.
      if (marker)
        await local("/api/abort-download", "POST", { key: marker.key }).catch(
          () => {},
        );
      if (paused) await chrome.downloads.resume(item.id).catch(() => {});
      await chrome.storage.local.remove(storageKey);
    }
    await chrome.storage.local.set({ lastInterceptionError: error.message });
  } finally {
    activeTransfers.delete(item.id);
  }
}
async function recoverTransfers() {
  const saved = await chrome.storage.local.get(null);
  for (const [name, marker] of Object.entries(saved))
    if (name.startsWith("handoff_") && marker?.id !== undefined)
      await handoffDownload(marker, marker);
}
chrome.downloads?.onCreated.addListener((item) => {
  void handoffDownload(item).catch(() => {});
});
chrome.downloads?.onChanged?.addListener((change) => {
  if (
    ["safe", "accepted", "allowlistedByPolicy"].includes(change.danger?.current)
  )
    void chrome.downloads
      .search({ id: change.id })
      .then(([item]) => {
        if (item?.state === "in_progress") return handoffDownload(item);
      })
      .catch(() => {});
});
chrome.alarms?.onAlarm.addListener((alarm) => {
  if (alarm.name === "omnigrab-handoffs")
    void recoverTransfers().catch(() => {});
});
chrome.alarms?.create("omnigrab-handoffs", { periodInMinutes: 1 });
void recoverTransfers().catch(() => {});
function createMenus() {
  chrome.contextMenus?.removeAll(() => {
    for (const [id, title, contexts] of [
      [
        "omnigrab-file",
        "Скачать файл в OmniGrab",
        ["link", "image", "audio", "video"],
      ],
      [
        "omnigrab-video",
        "Скачать видео со страницы в OmniGrab",
        ["page", "link", "video"],
      ],
    ])
      chrome.contextMenus.create({ id, title, contexts });
  });
}
chrome.runtime.onInstalled?.addListener(createMenus);
chrome.runtime.onStartup?.addListener(createMenus);
chrome.contextMenus?.onClicked.addListener((info, tab) => {
  const url = httpUrl(info.linkUrl || info.srcUrl || info.pageUrl || tab?.url);
  if (!url) return;
  void local("/api/tasks", "POST", {
    items: [
      {
        url,
        kind: info.menuItemId === "omnigrab-file" ? "file" : "media",
        headers: {
          Referer: info.pageUrl || tab?.url || url,
          "User-Agent": navigator.userAgent,
        },
      },
    ],
  })
    .then(() => chrome.storage.local.set({ lastInterceptionError: "" }))
    .catch((error) =>
      chrome.storage.local.set({ lastInterceptionError: error.message }),
    );
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
    if (message.action === "UPDATE_SETTINGS") {
      const next = await local("/api/settings", "PUT", {
        interceptBrowserDownloads:
          !!message.settings?.interceptBrowserDownloads,
      });
      await chrome.storage.local.set({ settings: next });
      return { settings: next };
    }
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
          (x) => x.kind !== "file" && x.frameId === (sender.frameId ?? 0),
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
            kind: message.kind || captured?.kind,
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
