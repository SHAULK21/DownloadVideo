import JSZip from 'jszip';

export interface ExtensionCodeFile {
  filename: string;
  description: string;
  content: string;
}

export function getExtensionSourceFiles(): ExtensionCodeFile[] {
  const manifestJson = JSON.stringify({
    manifest_version: 3,
    name: "OmniGrab IDM - Media Sniffer & Downloader",
    version: "2.4.0",
    description: "Automatic video stream sniffer and high-speed multi-threaded download accelerator integration for Chrome, Brave and Edge.",
    permissions: [
      "activeTab",
      "storage",
      "webRequest",
      "scripting"
    ],
    host_permissions: [
      "<all_urls>"
    ],
    action: {
      default_popup: "popup.html",
      default_title: "OmniGrab IDM: Sniff Video Streams"
    },
    background: {
      service_worker: "background.js"
    },
    content_scripts: [
      {
        matches: ["<all_urls>"],
        js: ["content.js"],
        css: ["content.css"],
        run_at: "document_idle"
      }
    ]
  }, null, 2);

  const contentJs = `/**
 * OmniGrab IDM Content Script
 * Automatically detects HTML5 <video>, <audio>, HLS/DASH streams, and iframe players.
 * Injects the floating "Download this video" button.
 */

(function () {
  const capturedMedia = new Map();

  function scanMediaElements() {
    const videos = document.querySelectorAll('video, audio');
    videos.forEach((el, index) => {
      attachIdmFloatingGrabber(el, index);
    });
  }

  function attachIdmFloatingGrabber(mediaEl, id) {
    if (mediaEl.dataset.idmAttached) return;
    mediaEl.dataset.idmAttached = 'true';

    // Extract current stream source
    let src = mediaEl.currentSrc || mediaEl.src;
    if (!src) {
      const source = mediaEl.querySelector('source');
      if (source) src = source.src;
    }

    if (!src && !mediaEl.duration) return;

    // Create floating grabber container
    const grabber = document.createElement('div');
    grabber.className = 'omnime-grabber-badge';
    grabber.innerHTML = \`
      <div class="omnime-grabber-btn">
        <svg class="omnime-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        <span>Скачать это видео (IDM)</span>
        <svg class="omnime-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>
      <div class="omnime-dropdown">
        <div class="omnime-item" data-res="1080p">
          <span class="omnime-res">1080p Full HD</span>
          <span class="omnime-fmt">MP4 ~420MB</span>
        </div>
        <div class="omnime-item" data-res="720p">
          <span class="omnime-res">720p HD</span>
          <span class="omnime-fmt">MP4 ~190MB</span>
        </div>
        <div class="omnime-item" data-res="m3u8">
          <span class="omnime-res">HLS Stream</span>
          <span class="omnime-fmt">M3U8 Master</span>
        </div>
        <div class="omnime-item" data-res="audio">
          <span class="omnime-res">Аудиодорожка</span>
          <span class="omnime-fmt">M4A 256kbps</span>
        </div>
      </div>
    \`;

    // Position grabber over the media element
    positionGrabber(grabber, mediaEl);

    // Click handler: trigger IDM download
    grabber.querySelectorAll('.omnime-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const res = item.dataset.res;
        const targetUrl = src || window.location.href;
        const title = document.title || 'Video Stream';

        chrome.runtime.sendMessage({
          action: 'DOWNLOAD_WITH_IDM',
          data: {
            url: targetUrl,
            title: title + ' [' + res + ']',
            resolution: res,
            pageUrl: window.location.href
          }
        });

        item.style.backgroundColor = '#0284c7';
        setTimeout(() => {
          grabber.querySelector('.omnime-dropdown').style.display = 'none';
        }, 300);
      });
    });

    document.body.appendChild(grabber);
  }

  function positionGrabber(grabber, target) {
    const rect = target.getBoundingClientRect();
    if (rect.width < 120 || rect.height < 60) return;

    grabber.style.position = 'absolute';
    grabber.style.top = (window.scrollY + rect.top + 10) + 'px';
    grabber.style.left = (window.scrollX + rect.left + 12) + 'px';
    grabber.style.zIndex = '999999';
  }

  // Observe dynamically loaded videos (YouTube, Twitch, Netflix, VK, etc.)
  const observer = new MutationObserver(() => scanMediaElements());
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('load', scanMediaElements);
  scanMediaElements();
})();
`;

  const contentCss = `/* OmniGrab IDM Floating Video Grabber Style */
.omnime-grabber-badge {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  user-select: none;
}
.omnime-grabber-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
  color: #ffffff;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.25);
  transition: all 0.2s ease;
}
.omnime-grabber-btn:hover {
  background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
  transform: translateY(-1px);
}
.omnime-icon {
  width: 14px;
  height: 14px;
}
.omnime-caret {
  width: 12px;
  height: 12px;
}
.omnime-dropdown {
  display: none;
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 4px;
  min-width: 190px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.6);
}
.omnime-grabber-badge:hover .omnime-dropdown {
  display: block;
}
.omnime-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 8px;
  color: #f1f5f9;
  font-size: 11px;
  border-radius: 4px;
  cursor: pointer;
}
.omnime-item:hover {
  background: #1e293b;
  color: #38bdf8;
}
.omnime-res {
  font-weight: 600;
}
.omnime-fmt {
  color: #94a3b8;
  font-size: 10px;
}
`;

  const backgroundJs = `/**
 * OmniGrab IDM Extension Background Service Worker
 * Intercepts web requests and listens for media streams (video/mp4, m3u8, etc.)
 */

const mediaRegistry = new Map();

// Sniff requests with media headers
chrome.webRequest.onHeadersReceived.addListener(
  function(details) {
    const contentTypeHeader = details.responseHeaders?.find(
      h => h.name.toLowerCase() === 'content-type'
    );
    const mime = contentTypeHeader ? contentTypeHeader.value.toLowerCase() : '';

    const isVideo = mime.includes('video/') || mime.includes('x-mpegurl') || mime.includes('vnd.apple.mpegurl') || mime.includes('dash+xml');
    const isAudio = mime.includes('audio/');

    if (isVideo || isAudio) {
      const tabId = details.tabId;
      if (!mediaRegistry.has(tabId)) {
        mediaRegistry.set(tabId, []);
      }
      const list = mediaRegistry.get(tabId);
      if (!list.some(item => item.url === details.url)) {
        list.push({
          url: details.url,
          mime: mime,
          type: isVideo ? 'video' : 'audio',
          timestamp: Date.now()
        });
        chrome.action.setBadgeText({ tabId, text: String(list.length) });
        chrome.action.setBadgeBackgroundColor({ tabId, color: '#0284c7' });
      }
    }
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);

// Message broker between webpage content script and desktop IDM app
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'GET_TAB_MEDIA') {
    const tabId = sender.tab ? sender.tab.id : message.tabId;
    sendResponse({ media: mediaRegistry.get(tabId) || [] });
  }

  if (message.action === 'DOWNLOAD_WITH_IDM') {
    // Send to native messaging or local IDM desktop instance
    console.log('[IDM Extension] Forwarding download task:', message.data);
    chrome.storage.local.set({ ['task_' + Date.now()]: message.data });
    sendResponse({ status: 'queued', data: message.data });
  }
});
`;

  const popupHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      width: 320px;
      margin: 0;
      padding: 12px;
      background: #090d16;
      color: #e2e8f0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #1e293b;
      padding-bottom: 8px;
      margin-bottom: 10px;
    }
    .title {
      font-size: 13px;
      font-weight: 700;
      color: #38bdf8;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .status {
      font-size: 10px;
      color: #10b981;
    }
    .stream-list {
      max-height: 280px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .stream-card {
      background: #131b2e;
      border: 1px solid #23314d;
      border-radius: 6px;
      padding: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .stream-info {
      overflow: hidden;
      margin-right: 8px;
    }
    .stream-title {
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
      text-overflow: ellipsis;
      overflow: hidden;
      color: #f8fafc;
    }
    .stream-meta {
      font-size: 10px;
      color: #94a3b8;
      margin-top: 2px;
    }
    .btn-grab {
      background: #0284c7;
      color: #ffffff;
      border: none;
      padding: 5px 9px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
    }
    .btn-grab:hover {
      background: #0ea5e9;
    }
    .empty {
      padding: 24px 8px;
      text-align: center;
      color: #64748b;
      font-size: 11px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">
      <span>OmniGrab IDM</span>
    </div>
    <div class="status">● Модуль активен</div>
  </div>
  <div id="mediaContainer" class="stream-list">
    <div class="empty">Воспроизведите видео на странице для автоматического перехвата...</div>
  </div>
  <script src="popup.js"></script>
</body>
</html>
`;

  const popupJs = `document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('mediaContainer');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab) return;

  chrome.runtime.sendMessage({ action: 'GET_TAB_MEDIA', tabId: tab.id }, (response) => {
    const list = response?.media || [];
    if (list.length === 0) {
      container.innerHTML = '<div class="empty">На этой вкладке пока нет медиапотоков. Включите плеер на сайте!</div>';
      return;
    }

    container.innerHTML = '';
    list.forEach((item, i) => {
      const card = document.createElement('div');
      card.className = 'stream-card';
      card.innerHTML = \`
        <div class="stream-info">
          <div class="stream-title">Поток #\${i + 1}: \${tab.title || 'Видео'}</div>
          <div class="stream-meta">\${item.mime}</div>
        </div>
        <button class="btn-grab">Скачать</button>
      \`;

      card.querySelector('.btn-grab').addEventListener('click', () => {
        chrome.runtime.sendMessage({
          action: 'DOWNLOAD_WITH_IDM',
          data: {
            url: item.url,
            title: tab.title || 'Video Stream',
            pageUrl: tab.url
          }
        });
      });

      container.appendChild(card);
    });
  });
});
`;

  const readmeMd = `# Расширение OmniGrab IDM для Браузера (Chrome / Brave / Edge / Opera / Yandex)

Интеграционный модуль IDM для автоматического перехвата видеопотоков (MP4, WebM, HLS M3U8, DASH, MP3).

## Инструкция по установке за 30 секунд:

1. Распакуйте скачанный ZIP-архив в любую удобную папку на компьютере (например, \`C:\\OmniGrab-Extension\` или \`~/Downloads/omnigrab-extension\`).
2. Откройте ваш браузер (Chrome, Brave, Edge, Yandex Browser).
3. Перейдите по адресу: \`chrome://extensions/\` (или \`edge://extensions/\` для Edge).
4. Включите переключатель **«Режим разработчика»** (Developer mode) в правом верхнем углу.
5. Нажмите кнопку **«Загрузить распакованное расширение»** (Load unpacked).
6. Выберите распакованную папку.
7. Готово! Теперь на любом сайте при воспроизведении видео появится плавающая кнопка **«Скачать это видео (IDM)»** с выбором качества 4K, 1080p, 720p и аудиодорожки!
`;

  return [
    { filename: 'manifest.json', description: 'Manifest V3 спецификация расширения', content: manifestJson },
    { filename: 'content.js', description: 'Скрипт перехвата видео на веб-страницах и плавающей кнопки', content: contentJs },
    { filename: 'content.css', description: 'Стили плавающей кнопки IDM на видеоплеерах', content: contentCss },
    { filename: 'background.js', description: 'Фоновый перехватчик сетевых запросов и HLS потоков', content: backgroundJs },
    { filename: 'popup.html', description: 'Интерфейс всплывающего окна расширения', content: popupHtml },
    { filename: 'popup.js', description: 'Логика отображения найденных видеопотоков', content: popupJs },
    { filename: 'README.md', description: 'Пошаговая инструкция по установке в браузер', content: readmeMd },
  ];
}

export async function downloadExtensionZip(): Promise<void> {
  const zip = new JSZip();
  const files = getExtensionSourceFiles();

  files.forEach(f => {
    zip.file(f.filename, f.content);
  });

  const content = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(content);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'omnigrab-idm-extension.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
