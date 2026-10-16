const $ = (id) => document.getElementById(id);
let tab;
function send(message) {
  return new Promise((resolve) =>
    chrome.runtime.sendMessage(message, (r) =>
      resolve(
        r || {
          error: chrome.runtime.lastError?.message || "Расширение недоступно.",
        },
      ),
    ),
  );
}
function status(text, error = false) {
  $("status").textContent = text;
  $("status").style.color = error ? "#f4a5b6" : "#6edab4";
}
async function download(url, button) {
  button.disabled = true;
  const r = await send({
    action: "DOWNLOAD",
    url,
    title: tab?.title,
    pageUrl: tab?.url,
    tabId: tab?.id,
  });
  button.disabled = false;
  status(r.error || "Задача добавлена в OmniGrab.", !!r.error);
  if (r.error && /код|подключ|EXE|exe/.test(r.error)) $("pair").hidden = false;
}
async function refresh() {
  const [active] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  tab = active;
  const { token } = await chrome.storage.local.get("token");
  $("pair").hidden = !!token;
  try {
    const r = await fetch("http://127.0.0.1:17893/api/state", {
      headers: { Authorization: "Bearer " + (token || "") },
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) {
      $("pair").hidden = false;
      status("Введите код из программы.", true);
    } else {
      const state = await r.json();
      $("intercept").checked =
        state.settings.interceptBrowserDownloads !== false;
      await chrome.storage.local.set({ settings: state.settings });
      status("Подключено к загрузчику на этом ПК.");
    }
  } catch {
    status("Запустите OmniGrab.exe на этом ПК.", true);
  }
  const result = await send({ action: "GET_TAB_MEDIA", tabId: tab?.id });
  $("list").replaceChildren();
  if (!result.media?.length) {
    const p = document.createElement("p");
    p.textContent =
      "Файлы пока не найдены. Начните загрузку в браузере, включите видео или используйте меню ссылки.";
    $("list").append(p);
  }
  for (const item of result.media || []) {
    const card = document.createElement("div"),
      info = document.createElement("div"),
      title = document.createElement("strong"),
      meta = document.createElement("p"),
      button = document.createElement("button");
    card.className = "card";
    title.textContent =
      item.ext.toUpperCase() +
      (item.size ? " · " + (item.size / 1048576).toFixed(1) + " МБ" : "");
    meta.textContent = item.url;
    meta.title = item.url;
    button.textContent = "Скачать";
    button.addEventListener("click", () => download(item.url, button));
    info.append(title, meta);
    card.append(info, button);
    $("list").append(card);
  }
  $("page").disabled = !/^https?:/i.test(tab?.url || "");
}
$("connect").addEventListener("click", async () => {
  const r = await send({ action: "PAIR", code: $("code").value.trim() });
  if (r.error) status(r.error, true);
  else {
    status("Подключено!");
    await refresh();
  }
});
$("code").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("connect").click();
});
$("page").addEventListener("click", () => download(tab.url, $("page")));
$("refresh").addEventListener("click", () =>
  refresh().catch((e) => status(e.message, true)),
);
refresh().catch((e) => status(e.message, true));
$("intercept").addEventListener("change", async () => {
  const r = await send({
    action: "UPDATE_SETTINGS",
    settings: { interceptBrowserDownloads: $("intercept").checked },
  });
  if (r.error) status(r.error, true);
});
$("open-app").addEventListener("click", async () => {
  const r = await send({ action: "OPEN_APP" });
  if (r.error) status(r.error, true);
});
