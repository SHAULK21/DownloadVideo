(() => {
  if (location.hostname === "127.0.0.1" || location.hostname === "localhost")
    return;
  const attached = new Map();
  let enabled = true;
  let scheduled = false;
  function send(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (r) =>
          resolve(
            r || {
              error:
                chrome.runtime.lastError?.message || "Расширение недоступно.",
            },
          ),
        );
      } catch (e) {
        resolve({ error: e.message });
      }
    });
  }
  function place(el, host) {
    const r = el.getBoundingClientRect();
    host.style.display =
      enabled &&
      r.width >= 100 &&
      r.height >= 40 &&
      r.bottom > 0 &&
      r.top < innerHeight
        ? "block"
        : "none";
    host.style.top = Math.max(4, r.top + 8) + "px";
    host.style.left =
      Math.max(4, Math.min(innerWidth - 175, r.left + 8)) + "px";
  }
  function scan() {
    scheduled = false;
    for (const [el, host] of attached) {
      if (!el.isConnected) {
        host.remove();
        attached.delete(el);
      } else place(el, host);
    }
    if (!enabled) return;
    for (const el of document.querySelectorAll("video,audio")) {
      if (attached.has(el)) continue;
      const src = el.currentSrc || el.src || el.querySelector("source")?.src;
      if (!src) continue;
      const host = document.createElement("div");
      host.style.cssText = "position:fixed;z-index:2147483647;";
      const shadow = host.attachShadow({ mode: "closed" });
      const style = document.createElement("style");
      style.textContent =
        "button{all:initial;font:600 12px Segoe UI,Arial,sans-serif;cursor:pointer;display:block;color:white;background:#087fa1;border:1px solid #76d5e8;padding:8px 12px;border-radius:7px;box-shadow:0 3px 15px #0008;max-width:240px}button:disabled{opacity:.7}small{display:block;font:11px Segoe UI;color:#ffe7ed;background:#361b29;padding:7px;border-radius:5px;margin-top:3px;max-width:250px;white-space:normal}";
      const button = document.createElement("button");
      button.textContent = "↓ Скачать в OmniGrab";
      const message = document.createElement("small");
      message.hidden = true;
      button.addEventListener("click", async () => {
        const current =
          el.currentSrc || el.src || el.querySelector("source")?.src;
        button.disabled = true;
        message.hidden = true;
        const url = current || location.href;
        const r = await send({
          action: "DOWNLOAD_VIDEO",
          url,
          title: document.title,
          pageUrl: location.href,
        });
        button.disabled = false;
        if (r.error) {
          message.textContent = r.error;
          message.hidden = false;
        } else {
          button.textContent = "✓ Отправлено в загрузчик";
          setTimeout(() => (button.textContent = "↓ Скачать в OmniGrab"), 2500);
        }
      });
      shadow.append(style, button, message);
      document.documentElement.appendChild(host);
      attached.set(el, host);
      place(el, host);
    }
  }
  function schedule() {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(scan);
    }
  }
  async function sync() {
    const r = await send({ action: "GET_SETTINGS" });
    enabled = r.settings?.showFloatingButton !== false;
    schedule();
  }
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["src"],
  });
  document.addEventListener("loadedmetadata", schedule, true);
  document.addEventListener("loadstart", schedule, true);
  window.addEventListener("scroll", schedule, true);
  window.addEventListener("resize", schedule);
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.settings) {
      enabled = changes.settings.newValue?.showFloatingButton !== false;
      schedule();
    }
  });
  setInterval(sync, 10000);
  sync();
})();
