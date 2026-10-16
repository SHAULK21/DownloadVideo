import React, { useState, useRef } from 'react';
import {
  Globe,
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Download,
  Film,
  Music,
  ChevronDown,
  CheckCircle2,
  Zap,
  Play,
  Volume2,
  Maximize2,
  ExternalLink,
} from 'lucide-react';
import { SniffedMediaStream } from '../types';
import { DEMO_PRESET_MEDIA, formatBytes } from '../utils/mediaSniffer';

interface BrowserSimViewProps {
  onCaptureDownload: (stream: SniffedMediaStream) => void;
  onGoToDownloads: () => void;
}

export const BrowserSimView: React.FC<BrowserSimViewProps> = ({
  onCaptureDownload,
  onGoToDownloads,
}) => {
  const [activeSiteIdx, setActiveSiteIdx] = useState(0);
  const [customUrl, setCustomUrl] = useState('');
  const [showIdmDropdown, setShowIdmDropdown] = useState(false);
  const [capturedNotice, setCapturedNotice] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const activeMedia = DEMO_PRESET_MEDIA[activeSiteIdx];

  const handlePlayToggle = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play();
        setIsPlaying(true);
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }
  };

  const handleSelectQuality = (stream: SniffedMediaStream) => {
    onCaptureDownload(stream);
    setShowIdmDropdown(false);
    setCapturedNotice(`Поток «${stream.quality}» успешно перехвачен и добавлен в очередь IDM!`);
    setTimeout(() => setCapturedNotice(null), 4000);
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden text-slate-200">
      {/* Browser Chrome Navigation Bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-900 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-1.5 text-slate-400">
          <button className="p-1 hover:bg-slate-800 rounded transition-colors disabled:opacity-40">
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          <button className="p-1 hover:bg-slate-800 rounded transition-colors disabled:opacity-40">
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              if (videoRef.current) {
                videoRef.current.currentTime = 0;
                videoRef.current.play();
                setIsPlaying(true);
              }
            }}
            className="p-1 hover:bg-slate-800 rounded transition-colors"
            title="Перезагрузить страницу"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Address Bar */}
        <div className="flex-1 flex items-center gap-2 px-3 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono">
          <Globe className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="text-cyan-300 select-all truncate">{activeMedia.sourcePageUrl}</span>
          <span className="ml-auto text-[10px] text-emerald-400 font-sans font-semibold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            IDM Sniffer Active
          </span>
        </div>

        {/* Site Presets */}
        <div className="hidden lg:flex items-center gap-1">
          {DEMO_PRESET_MEDIA.map((m, idx) => (
            <button
              key={m.id}
              onClick={() => {
                setActiveSiteIdx(idx);
                setIsPlaying(false);
              }}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                activeSiteIdx === idx
                  ? 'bg-cyan-950 text-cyan-300 border border-cyan-800/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              {m.format === 'mp3' ? 'Подкаст (Аудио)' : `Сайт #${idx + 1}`}
            </button>
          ))}
        </div>
      </div>

      {/* Captured Toast Notification */}
      {capturedNotice && (
        <div className="bg-gradient-to-r from-cyan-900 to-blue-900 text-white px-6 py-2.5 text-xs flex items-center justify-between shadow-md border-b border-cyan-700/50">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-300" />
            <span className="font-medium">{capturedNotice}</span>
          </div>
          <button
            onClick={onGoToDownloads}
            className="font-semibold underline text-cyan-200 hover:text-white text-xs"
          >
            Открыть в менеджере IDM →
          </button>
        </div>
      )}

      {/* Webpage Canvas */}
      <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center">
        <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl space-y-4 p-5">
          {/* Simulated Webpage Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-cyan-600 flex items-center justify-center font-bold text-white text-xs">
                SV
              </div>
              <div>
                <h1 className="text-sm font-bold text-white">{activeMedia.sourcePageTitle}</h1>
                <p className="text-[11px] text-slate-400">Портал потокового видео высокой чёткости</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-cyan-400 border border-slate-700">
                HTML5 Video Engine
              </span>
            </div>
          </div>

          {/* Interactive Video Player with the Classic Floating IDM Grabber */}
          <div className="relative rounded-lg overflow-hidden bg-black aspect-video group shadow-inner">
            <video
              ref={videoRef}
              src={activeMedia.url}
              poster={activeMedia.thumbnail}
              controls
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              className="w-full h-full object-contain"
            />

            {/* THE SIGNATURE IDM FLOATING VIDEO GRABBER BUTTON */}
            <div className="absolute top-3.5 right-3.5 z-30">
              <div className="relative">
                <button
                  onClick={() => setShowIdmDropdown(!showIdmDropdown)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-md text-xs font-semibold shadow-2xl border border-white/25 transition-all transform hover:scale-105 active:scale-95"
                  title="Автоматический перехват видео потока браузерным расширением IDM"
                >
                  <Download className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Скачать это видео (IDM)</span>
                  <ChevronDown className="w-3.5 h-3.5 opacity-80" />
                </button>

                {/* IDM Resolution & Format Dropdown */}
                {showIdmDropdown && (
                  <div className="absolute right-0 top-full mt-1.5 w-64 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl p-1.5 z-40 text-xs">
                    <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800 mb-1">
                      Обнаруженные видеопотоки
                    </div>

                    <button
                      onClick={() =>
                        handleSelectQuality({
                          ...activeMedia,
                          quality: '4K UHD (2160p 60fps)',
                          filesize: 1240 * 1024 * 1024,
                        })
                      }
                      className="w-full text-left p-2 hover:bg-slate-800 rounded flex justify-between items-center transition-colors group"
                    >
                      <div>
                        <div className="font-semibold text-white group-hover:text-cyan-400">4K Ultra HD (2160p)</div>
                        <div className="text-[10px] text-slate-400">MP4 · HEVC / H.265</div>
                      </div>
                      <span className="font-mono text-[10px] text-cyan-300 font-semibold">~1.24 GB</span>
                    </button>

                    <button
                      onClick={() =>
                        handleSelectQuality({
                          ...activeMedia,
                          quality: 'Full HD (1080p 60fps)',
                          filesize: 480 * 1024 * 1024,
                        })
                      }
                      className="w-full text-left p-2 hover:bg-slate-800 rounded flex justify-between items-center transition-colors group"
                    >
                      <div>
                        <div className="font-semibold text-white group-hover:text-cyan-400">1080p Full HD</div>
                        <div className="text-[10px] text-slate-400">MP4 · H.264 High</div>
                      </div>
                      <span className="font-mono text-[10px] text-cyan-300 font-semibold">~480 MB</span>
                    </button>

                    <button
                      onClick={() =>
                        handleSelectQuality({
                          ...activeMedia,
                          quality: 'HD (720p)',
                          filesize: 195 * 1024 * 1024,
                        })
                      }
                      className="w-full text-left p-2 hover:bg-slate-800 rounded flex justify-between items-center transition-colors group"
                    >
                      <div>
                        <div className="font-semibold text-white group-hover:text-cyan-400">720p HD</div>
                        <div className="text-[10px] text-slate-400">MP4 · Оптимально для моб.</div>
                      </div>
                      <span className="font-mono text-[10px] text-cyan-300 font-semibold">~195 MB</span>
                    </button>

                    <button
                      onClick={() =>
                        handleSelectQuality({
                          ...activeMedia,
                          quality: 'Аудиодорожка (M4A / 256k)',
                          category: 'audio',
                          filesize: 42 * 1024 * 1024,
                        })
                      }
                      className="w-full text-left p-2 hover:bg-slate-800 rounded flex justify-between items-center transition-colors group border-t border-slate-800/80 mt-1"
                    >
                      <div>
                        <div className="font-semibold text-white group-hover:text-emerald-400">Аудиодорожка (M4A)</div>
                        <div className="text-[10px] text-slate-400">Только звук · 256 kbps</div>
                      </div>
                      <span className="font-mono text-[10px] text-emerald-300 font-semibold">~42 MB</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Video Metadata & Live Sniffer Inspector */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2">
            <div>
              <h2 className="text-base font-bold text-white">{activeMedia.title}</h2>
              <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                <span>Формат: <strong className="text-slate-200">{activeMedia.format.toUpperCase()}</strong></span>
                <span>·</span>
                <span>Разрешение: <strong className="text-slate-200">{activeMedia.resolution || '1080p'}</strong></span>
                <span>·</span>
                <span>Кодек: <strong className="text-slate-200">{activeMedia.codec}</strong></span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleSelectQuality(activeMedia)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-cyan-700/80 hover:bg-cyan-600 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Скачать оригинал ({formatBytes(activeMedia.filesize)})</span>
              </button>
            </div>
          </div>

          {/* Under-the-hood Sniffer Telemetry */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-[11px] space-y-1.5">
            <div className="text-slate-400 font-semibold flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-cyan-400" />
              Журнал перехвата сетевых запросов расширением (IDM Sniffer Log):
            </div>
            <div className="font-mono text-slate-400 space-y-1">
              <div>
                <span className="text-emerald-400">[200 OK]</span> GET {activeMedia.url}{' '}
                <span className="text-cyan-400 font-semibold">({activeMedia.mimeType})</span>
              </div>
              <div className="text-slate-500">
                Range-header: bytes=0- · Accept-Ranges: bytes · Multi-threading: Supported
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
