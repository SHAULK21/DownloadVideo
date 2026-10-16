(() => {
  if (location.hostname === "127.0.0.1" || location.hostname === "localhost")
    return;
  const attached = new Map();
  let enabled = true,
    scheduled = false;
  let position = { x: 0, y: 0 };
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
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
  function setPosition(value) {
    if (Number.isFinite(value?.x) && Number.isFinite(value?.y))
      position = { x: clamp(value.x, 0, 1), y: clamp(value.y, 0, 1) };
  }
  function savePosition() {
    try {
      chrome.storage.local
        ?.set?.({ floatingButtonPosition: position })
        ?.catch(() => {});
    } catch {}
  }
  function dimensions(record) {
    const r = record.el.getBoundingClientRect();
    return {
      r,
      width: record.host.offsetWidth || Math.min(260, innerWidth - 8),
      height: record.host.offsetHeight || 34,
    };
  }
  function place(record) {
    const { el, host } = record;
    const { r, width, height } = dimensions(record);
    const fullscreen = document.fullscreenElement;
    const container =
      fullscreen?.contains(el) && !/^(VIDEO|AUDIO)$/.test(fullscreen.tagName)
        ? fullscreen
        : document.documentElement;
    if (host.parentNode !== container) container.appendChild(host);
    host.style.display =
      enabled &&
      !record.dismissed &&
      r.width >= 100 &&
      r.height >= 40 &&
      r.bottom > 0 &&
      r.top < innerHeight &&
      r.right > 0 &&
      r.left < innerWidth &&
      (!fullscreen || fullscreen.contains(el)) &&
      fullscreen !== el
        ? "block"
        : "none";
    host.style.maxWidth =
      Math.max(100, Math.min(innerWidth - 8, r.width - 16)) + "px";
    host.style.left =
      clamp(
        r.left + 8 + position.x * Math.max(0, r.width - width - 16),
        4,
        Math.max(4, innerWidth - width - 4),
      ) + "px";
    host.style.top =
      clamp(
        r.top + 8 + position.y * Math.max(0, r.height - height - 16),
        4,
        Math.max(4, innerHeight - height - 4),
      ) + "px";
  }
  function opacity(record, value) {
    record.host.style.opacity = String(value);
    record.host.style.pointerEvents = value === 0 ? "none" : "auto";
  }
  function wake(record) {
    clearTimeout(record.idle);
    opacity(record, record.hovered || record.focused || record.drag ? 1 : 0.65);
    record.idle = setTimeout(() => {
      if (record.hovered || record.focused || record.drag || record.busy)
        return;
      opacity(record, record.el.paused || record.el.ended ? 0.28 : 0);
    }, 2200);
  }
  function scan() {
    scheduled = false;
    for (const [el, record] of attached) {
      if (!el.isConnected) {
        clearTimeout(record.idle);
        clearTimeout(record.feedback);
        record.host.remove();
        attached.delete(el);
      } else place(record);
    }
    if (!enabled) return;
    for (const el of document.querySelectorAll("video,audio")) {
      if (attached.has(el)) continue;
      if (!(el.currentSrc || el.src || el.querySelector("source")?.src))
        continue;
      const host = document.createElement("div");
      host.dataset.omnigrabButton = "";
      host.style.cssText =
        "position:fixed;z-index:2147483647;transition:opacity .2s;";
      const record = { el, host };
      const shadow = host.attachShadow({ mode: "closed" });
      const style = document.createElement("style");
      style.textContent = `
        [hidden]{display:none!important}
        .bar{display:flex;align-items:stretch;border:1px solid #76d5e8;border-radius:7px;overflow:hidden;background:#087fa1;box-shadow:0 3px 15px #0008}
        button{all:initial;pointer-events:inherit;font:600 12px Segoe UI,Arial,sans-serif;cursor:pointer;color:white;padding:8px;box-sizing:border-box}
        button:hover,button:focus-visible{background:#055a76;outline:2px solid white;outline-offset:-2px}
        button:disabled{opacity:.6;cursor:wait}.download{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .drag{cursor:grab;touch-action:none;user-select:none;flex:none}.drag:active{cursor:grabbing}.hide{flex:none}
        small{display:block;font:11px Segoe UI,Arial;color:#ffe7ed;background:#361b29;padding:7px;border-radius:5px;margin-top:3px;max-width:250px;white-space:normal}
      `;
      const bar = document.createElement("div");
      bar.className = "bar";
      const handle = document.createElement("button");
      handle.className = "drag";
      handle.textContent = "⠿";
      handle.title = "Перетащить кнопку. Стрелки — переместить, Home — вернуть";
      handle.setAttribute("aria-label", "Переместить кнопку скачивания");
      const button = document.createElement("button");
      button.className = "download";
      button.textContent = "↓ Скачать в OmniGrab";
      button.setAttribute("aria-label", "Скачать в OmniGrab");
      const hide = document.createElement("button");
      hide.className = "hide";
      hide.textContent = "×";
      hide.title =
        "Скрыть до перезагрузки страницы. Скачать можно через значок расширения";
      hide.setAttribute("aria-label", "Скрыть кнопку скачивания");
      const message = document.createElement("small");
      message.hidden = true;
      hide.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        record.dismissed = true;
        clearTimeout(record.idle);
        place(record);
      });
      handle.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        const bounds = host.getBoundingClientRect();
        record.drag = {
          id: event.pointerId,
          x: event.clientX - bounds.left,
          y: event.clientY - bounds.top,
        };
        try {
          handle.setPointerCapture(event.pointerId);
        } catch {}
        wake(record);
      });
      handle.addEventListener("keydown", (event) => {
        const delta = {
          ArrowLeft: [-0.05, 0],
          ArrowRight: [0.05, 0],
          ArrowUp: [0, -0.05],
          ArrowDown: [0, 0.05],
        }[event.key];
        if (!delta && event.key !== "Home") return;
        event.preventDefault();
        event.stopPropagation();
        setPosition(
          event.key === "Home"
            ? { x: 0, y: 0 }
            : { x: position.x + delta[0], y: position.y + delta[1] },
        );
        place(record);
        savePosition();
        wake(record);
      });
      host.addEventListener("pointerenter", () => {
        record.hovered = true;
        wake(record);
      });
      host.addEventListener("pointerleave", () => {
        record.hovered = false;
        wake(record);
      });
      handle.addEventListener("lostpointercapture", (event) => {
        if (record.drag?.id !== event.pointerId) return;
        record.drag = null;
        savePosition();
        wake(record);
      });
      shadow.addEventListener("focusin", (event) => {
        record.focused = event.target.matches(":focus-visible");
        wake(record);
      });
      shadow.addEventListener("focusout", (event) => {
        if (event.relatedTarget && shadow.contains(event.relatedTarget)) return;
        record.focused = false;
        wake(record);
      });
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const current =
          el.currentSrc || el.src || el.querySelector("source")?.src;
        button.disabled = record.busy = true;
        message.hidden = true;
        wake(record);
        const r = await send({
          action: "DOWNLOAD_VIDEO",
          url: current || location.href,
          title: document.title,
          pageUrl: location.href,
        });
        button.disabled = record.busy = false;
        clearTimeout(record.feedback);
        if (r.error) {
          message.textContent = r.error;
          message.hidden = false;
        } else {
          button.textContent = "✓ Отправлено в загрузчик";
          record.feedback = setTimeout(() => {
            button.textContent = "↓ Скачать в OmniGrab";
          }, 2500);
        }
        wake(record);
      });
      bar.append(handle, button, hide);
      shadow.append(style, bar, message);
      attached.set(el, record);
      place(record);
      wake(record);
    }
  }
  function schedule() {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(scan);
    }
  }
  document.addEventListener(
    "pointermove",
    (event) => {
      for (const record of attached.values()) {
        if (record.dismissed || !enabled) continue;
        const { r, width, height } = dimensions(record);
        if (record.drag && record.drag.id === event.pointerId) {
          setPosition({
            x:
              (event.clientX - record.drag.x - r.left - 8) /
              Math.max(1, r.width - width - 16),
            y:
              (event.clientY - record.drag.y - r.top - 8) /
              Math.max(1, r.height - height - 16),
          });
          place(record);
          wake(record);
        } else if (
          event.clientX >= r.left &&
          event.clientX <= r.right &&
          event.clientY >= r.top &&
          event.clientY <= r.bottom
        )
          wake(record);
      }
    },
    true,
  );
  for (const type of ["pointerup", "pointercancel"])
    document.addEventListener(
      type,
      (event) => {
        for (const record of attached.values())
          if (record.drag?.id === event.pointerId) {
            record.drag = null;
            savePosition();
            wake(record);
          }
      },
      true,
    );
  for (const type of ["play", "pause", "ended"])
    document.addEventListener(
      type,
      (event) => {
        const record = attached.get(event.target);
        if (record) wake(record);
      },
      true,
    );
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
  document.addEventListener("fullscreenchange", schedule);
  window.addEventListener("scroll", schedule, true);
  window.addEventListener("resize", schedule);
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.settings)
      enabled = changes.settings.newValue?.showFloatingButton !== false;
    if (changes.floatingButtonPosition)
      setPosition(changes.floatingButtonPosition.newValue);
    schedule();
  });
  chrome.storage.local
    ?.get?.("floatingButtonPosition")
    ?.then((r) => {
      setPosition(r.floatingButtonPosition);
      schedule();
    })
    .catch(() => {});
  setInterval(sync, 10000);
  sync();
})();
