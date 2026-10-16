import React, { useState } from 'react';
import { X, Search, Plus, Layers, Film, Music, Check, Cpu } from 'lucide-react';
import { SniffedMediaStream } from '../types';
import {
  analyzeMediaUrl,
  expandBatchUrlPattern,
  formatBytes,
  extractFilenameFromUrl,
  detectCategoryFromFormat,
} from '../utils/mediaSniffer';

interface AddDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddSingle: (stream: SniffedMediaStream, threads: number, saveFolder: string) => void;
  onAddBatch: (urls: string[], threads: number, saveFolder: string) => void;
  defaultThreads: number;
}

export const AddDownloadModal: React.FC<AddDownloadModalProps> = ({
  isOpen,
  onClose,
  onAddSingle,
  onAddBatch,
  defaultThreads,
}) => {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState<'single' | 'batch'>('single');
  const [urlInput, setUrlInput] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [detectedStreams, setDetectedStreams] = useState<SniffedMediaStream[]>([]);
  const [selectedStreamId, setSelectedStreamId] = useState<string>('');
  const [threadCount, setThreadCount] = useState<number>(defaultThreads);
  const [saveFolder, setSaveFolder] = useState('C:\\Downloads\\Video');
  const [batchText, setBatchText] = useState(
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4\nhttps://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4\nhttps://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4'
  );

  const handleAnalyze = () => {
    if (!urlInput.trim()) return;
    setAnalyzing(true);

    setTimeout(() => {
      const streams = analyzeMediaUrl(urlInput.trim());
      setDetectedStreams(streams);
      if (streams.length > 0) {
        setSelectedStreamId(streams[0].id);
      }
      setAnalyzing(false);
    }, 450);
  };

  const handleConfirmSingle = () => {
    const stream = detectedStreams.find((s) => s.id === selectedStreamId) || detectedStreams[0];
    if (stream) {
      onAddSingle(stream, threadCount, saveFolder);
      onClose();
    } else if (urlInput.trim()) {
      // Fallback direct URL
      const fallbackStreams = analyzeMediaUrl(urlInput.trim());
      onAddSingle(fallbackStreams[0], threadCount, saveFolder);
      onClose();
    }
  };

  const handleConfirmBatch = () => {
    const rawLines = batchText.split('\n').map((l) => l.trim()).filter(Boolean);
    const expandedUrls: string[] = [];

    rawLines.forEach((line) => {
      const expanded = expandBatchUrlPattern(line);
      expandedUrls.push(...expanded);
    });

    if (expandedUrls.length > 0) {
      onAddBatch(expandedUrls, threadCount, saveFolder);
      onClose();
    }
  };

  const handleQuickInsertSample = (type: '4k' | 'tech' | 'podcast') => {
    if (type === '4k') {
      setUrlInput('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4');
    } else if (type === 'tech') {
      setUrlInput('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4');
    } else {
      setUrlInput('https://actions.google.com/sounds/v1/ambiences/rain_heavy.ogg');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl text-slate-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-950 text-cyan-400 border border-cyan-800/40 rounded-lg">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Добавить задачу в загрузчик IDM</h2>
              <p className="text-xs text-slate-400">
                Автоматическое распознавание видеопотоков и пакетная очередь
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 px-6 pt-2">
          <button
            onClick={() => setActiveTab('single')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'single'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Film className="w-4 h-4" />
            <span>Одиночный URL / Автораспознавание</span>
          </button>
          <button
            onClick={() => setActiveTab('batch')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'batch'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Пакетная загрузка (Серии ссылок)</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {activeTab === 'single' ? (
            <div className="space-y-4">
              {/* URL Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">
                  Ссылка на видео, аудио или страницу сайта:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="https://... (mp4, m3u8, youtube, vimeo, podcast)"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                  />
                  <button
                    onClick={handleAnalyze}
                    disabled={!urlInput.trim() || analyzing}
                    className="flex items-center gap-1.5 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors shrink-0"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>{analyzing ? 'Анализ...' : 'Распознать'}</span>
                  </button>
                </div>

                {/* Quick Presets */}
                <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-500">
                  <span>Примеры:</span>
                  <button
                    type="button"
                    onClick={() => handleQuickInsertSample('4k')}
                    className="text-cyan-400 hover:underline"
                  >
                    4K Природа (Big Buck)
                  </button>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() => handleQuickInsertSample('tech')}
                    className="text-cyan-400 hover:underline"
                  >
                    1080p Тест (Elephant)
                  </button>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() => handleQuickInsertSample('podcast')}
                    className="text-cyan-400 hover:underline"
                  >
                    Аудио MP3
                  </button>
                </div>
              </div>

              {/* Detected Formats List (IDM Format Selector) */}
              {detectedStreams.length > 0 && (
                <div className="space-y-2 pt-2">
                  <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
                    <span>Распознанные форматы и видеопотоки IDM:</span>
                    <span className="text-[11px] text-emerald-400">
                      Найдено: {detectedStreams.length} варианта
                    </span>
                  </label>

                  <div className="space-y-1.5">
                    {detectedStreams.map((stream) => {
                      const isSelected = selectedStreamId === stream.id;
                      return (
                        <div
                          key={stream.id}
                          onClick={() => setSelectedStreamId(stream.id)}
                          className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-cyan-950/60 border-cyan-500 text-white'
                              : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                                isSelected ? 'border-cyan-400 bg-cyan-500' : 'border-slate-700'
                              }`}
                            >
                              {isSelected && <Check className="w-2.5 h-2.5 text-slate-950 stroke-[3]" />}
                            </div>
                            <div>
                              <div className="text-xs font-medium flex items-center gap-2">
                                <span>{stream.quality}</span>
                                <span className="font-mono text-[10px] bg-slate-800 px-1.5 py-0.2 rounded text-cyan-300">
                                  {stream.format.toUpperCase()}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                {stream.codec || 'Стандартный кодек'}
                              </div>
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="font-mono text-xs font-semibold tabular-nums text-slate-200">
                              {formatBytes(stream.filesize)}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {stream.fps ? `${stream.fps} fps` : 'Переменный битрейт'}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Batch Mode */
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">
                  Список ссылок (по одной на строку) или шаблон последовательности:
                </label>
                <p className="text-[11px] text-slate-400">
                  Поддерживается синтаксис диапазонов IDM: <code className="text-cyan-400 font-mono">https://site.com/video_[01-10].mp4</code>
                </p>
              </div>

              <textarea
                rows={6}
                value={batchText}
                onChange={(e) => setBatchText(e.target.value)}
                placeholder="https://...&#10;https://...&#10;https://..."
                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
              />

              <div className="text-[11px] text-slate-400">
                Будет создано задач:{' '}
                <span className="font-mono text-cyan-400 font-bold">
                  {batchText.split('\n').filter((l) => l.trim()).length}
                </span>
              </div>
            </div>
          )}

          {/* Engine Parameters */}
          <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-800">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                <span>Число потоков (Соединений):</span>
              </label>
              <select
                value={threadCount}
                onChange={(e) => setThreadCount(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
              >
                <option value={1}>1 поток (Без сегментации)</option>
                <option value={4}>4 потока</option>
                <option value={8}>8 потоков (Стандарт)</option>
                <option value={16}>16 потоков (Турбо-ускорение)</option>
                <option value={32}>32 потока (Максимальная скорость)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300">Папка сохранения:</label>
              <input
                type="text"
                value={saveFolder}
                onChange={(e) => setSaveFolder(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
          >
            Отмена
          </button>

          <button
            onClick={activeTab === 'single' ? handleConfirmSingle : handleConfirmBatch}
            className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 rounded-lg shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>
              {activeTab === 'single' ? 'Начать загрузку' : 'Добавить пакет в очередь'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
