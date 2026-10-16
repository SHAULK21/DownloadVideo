import React, { useState } from 'react';
import {
  Download,
  CheckCircle2,
  FileCode,
  Chrome,
  ShieldCheck,
  Copy,
  Check,
  Layers,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { downloadExtensionZip, getExtensionSourceFiles } from '../utils/extensionGenerator';

interface ExtensionModalProps {
  onOpenBrowserSim: () => void;
}

export const ExtensionModal: React.FC<ExtensionModalProps> = ({ onOpenBrowserSim }) => {
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [selectedFileIdx, setSelectedFileIdx] = useState(0);
  const [copiedCode, setCopiedCode] = useState(false);

  const files = getExtensionSourceFiles();
  const currentFile = files[selectedFileIdx];

  const handleDownload = async () => {
    try {
      setDownloadingZip(true);
      await downloadExtensionZip();
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 4000);
    } catch (e) {
      console.error('Error generating zip:', e);
    } finally {
      setDownloadingZip(false);
    }
  };

  const handleCopyCode = () => {
    if (currentFile) {
      navigator.clipboard.writeText(currentFile.content);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-950 text-slate-200">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Hero Card */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-950/40 border border-slate-800 rounded-xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-cyan-400 font-semibold bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800/40">
                Модуль интеграции IDM
              </span>
              <span className="text-xs text-slate-400">· Manifest V3 Compliant</span>
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              Браузерное расширение OmniGrab IDM для автоперехвата видео
            </h1>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Встраивает плавающую панель <strong>«Скачать это видео»</strong> прямо поверх любого HTML5 плеера, YouTube, Vimeo, VK, Twitch, перехватывает HLS (.m3u8), DASH и прямые MP4/WebM потоки в браузерах Chrome, Brave, Edge и Opera.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0">
            <button
              onClick={handleDownload}
              disabled={downloadingZip}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-cyan-950/50 transition-all active:scale-95 whitespace-nowrap"
            >
              {downloadSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                  <span>Архив скачан (.ZIP)!</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>{downloadingZip ? 'Формирование ZIP...' : 'Скачать расширение (.ZIP)'}</span>
                </>
              )}
            </button>

            <button
              onClick={onOpenBrowserSim}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold rounded-lg border border-slate-700 transition-colors whitespace-nowrap"
            >
              <Sparkles className="w-4 h-4" />
              <span>Тест во встроенном браузере</span>
            </button>
          </div>
        </div>

        {/* Installation Instructions */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
            <Chrome className="w-5 h-5 text-cyan-400" />
            <h2 className="text-sm font-bold text-white">Инструкция по установке в браузер за 30 секунд</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
            <div className="p-3.5 bg-slate-950 rounded-lg border border-slate-800 space-y-1.5">
              <div className="font-mono text-cyan-400 font-bold text-[11px]">ШАГ 1</div>
              <div className="font-semibold text-slate-200">Скачайте и распакуйте</div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Нажмите кнопку «Скачать расширение (.ZIP)» вверху и извлеките файлы в любую папку.
              </p>
            </div>

            <div className="p-3.5 bg-slate-950 rounded-lg border border-slate-800 space-y-1.5">
              <div className="font-mono text-cyan-400 font-bold text-[11px]">ШАГ 2</div>
              <div className="font-semibold text-slate-200">Откройте extensions</div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                В адресной строке Chrome введите: <br />
                <code className="text-cyan-400 font-mono text-[10px]">chrome://extensions</code>
              </p>
            </div>

            <div className="p-3.5 bg-slate-950 rounded-lg border border-slate-800 space-y-1.5">
              <div className="font-mono text-cyan-400 font-bold text-[11px]">ШАГ 3</div>
              <div className="font-semibold text-slate-200">Режим разработчика</div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Включите тумблер <strong>«Режим разработчика»</strong> (Developer Mode) в верхнем правом углу.
              </p>
            </div>

            <div className="p-3.5 bg-slate-950 rounded-lg border border-slate-800 space-y-1.5">
              <div className="font-mono text-cyan-400 font-bold text-[11px]">ШАГ 4</div>
              <div className="font-semibold text-slate-200">Загрузить распакованное</div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Нажмите <strong>«Загрузить распакованное»</strong> и выберите распакованную папку. Готово!
              </p>
            </div>
          </div>
        </div>

        {/* Live Code Explorer */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
          <div className="flex items-center justify-between px-6 py-3 border-b border-slate-800 bg-slate-950">
            <div className="flex items-center gap-2">
              <FileCode className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-bold text-white">Исходный код модулей расширения</span>
            </div>

            <button
              onClick={handleCopyCode}
              className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition-colors"
            >
              {copiedCode ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Скопировано!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Копировать файл</span>
                </>
              )}
            </button>
          </div>

          <div className="flex flex-col md:flex-row min-h-[420px]">
            {/* File List */}
            <div className="w-full md:w-56 bg-slate-950/70 border-r border-slate-800 p-2 space-y-1 shrink-0">
              {files.map((file, idx) => (
                <button
                  key={file.filename}
                  onClick={() => setSelectedFileIdx(idx)}
                  className={`w-full text-left px-3 py-2 rounded text-xs transition-colors ${
                    selectedFileIdx === idx
                      ? 'bg-slate-800 text-cyan-400 font-semibold'
                      : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                  }`}
                >
                  <div className="font-mono">{file.filename}</div>
                  <div className="text-[10px] text-slate-500 truncate">{file.description}</div>
                </button>
              ))}
            </div>

            {/* Code Content */}
            <div className="flex-1 bg-slate-950 p-4 overflow-x-auto font-mono text-[11px] leading-relaxed text-slate-300">
              <pre>
                <code>{currentFile?.content}</code>
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
