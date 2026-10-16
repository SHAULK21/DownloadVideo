import React, { useState } from 'react';
import { X, Globe, Search, Filter, CheckSquare, Square, Download, Film, Music, Check } from 'lucide-react';
import { SniffedMediaStream } from '../types';
import { formatBytes } from '../utils/mediaSniffer';

interface SiteGrabberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBatchQueue: (streams: SniffedMediaStream[], threads: number) => void;
}

const DEMO_GRABBER_RESULTS: SniffedMediaStream[] = [
  {
    id: 'grab-1',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    title: 'Episode 01: Coral Ecosystems & Bioluminescence (4K)',
    format: 'mp4',
    category: 'video',
    quality: '4K UHD (2160p)',
    filesize: 1240 * 1024 * 1024,
    mimeType: 'video/mp4',
    thumbnail: '/src/assets/images/video_stream_thumb_nature_1792147324489.jpg',
    hasAudio: true,
    hasVideo: true,
  },
  {
    id: 'grab-2',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    title: 'Episode 02: Advanced Aerodynamics & Supercar Wind Tunnel',
    format: 'mp4',
    category: 'video',
    quality: '1080p Full HD',
    filesize: 480 * 1024 * 1024,
    mimeType: 'video/mp4',
    thumbnail: '/src/assets/images/video_stream_thumb_tech_1792147325301.jpg',
    hasAudio: true,
    hasVideo: true,
  },
  {
    id: 'grab-3',
    url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    title: 'Episode 03: Live Multicast Stream Playlist (HLS)',
    format: 'm3u8',
    category: 'video',
    quality: 'Adaptive HLS',
    filesize: 310 * 1024 * 1024,
    mimeType: 'application/vnd.apple.mpegurl',
    thumbnail: '/src/assets/images/video_stream_thumb_nature_1792147324489.jpg',
    hasAudio: true,
    hasVideo: true,
  },
  {
    id: 'grab-4',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    title: 'Episode 04: Mountain Fire Ridge & Cinematic Drone Reel',
    format: 'mp4',
    category: 'video',
    quality: '1080p Full HD',
    filesize: 290 * 1024 * 1024,
    mimeType: 'video/mp4',
    thumbnail: '/src/assets/images/video_stream_thumb_tech_1792147325301.jpg',
    hasAudio: true,
    hasVideo: true,
  },
  {
    id: 'grab-5',
    url: 'https://actions.google.com/sounds/v1/ambiences/rain_heavy.ogg',
    title: 'Soundtrack Track 01: Ambient Acoustic Symphony (Master Audio)',
    format: 'mp3',
    category: 'audio',
    quality: '320 kbps HQ',
    filesize: 68 * 1024 * 1024,
    mimeType: 'audio/mpeg',
    thumbnail: '/src/assets/images/podcast_cover_art_1792147325292.jpg',
    hasAudio: true,
    hasVideo: false,
  },
  {
    id: 'grab-6',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    title: 'Episode 05: Sci-Fi Visual Effects & Compositing Breakdown',
    format: 'mp4',
    category: 'video',
    quality: '1440p Quad HD',
    filesize: 780 * 1024 * 1024,
    mimeType: 'video/mp4',
    thumbnail: '/src/assets/images/video_stream_thumb_nature_1792147324489.jpg',
    hasAudio: true,
    hasVideo: true,
  }
];

export const SiteGrabberModal: React.FC<SiteGrabberModalProps> = ({
  isOpen,
  onClose,
  onBatchQueue,
}) => {
  if (!isOpen) return null;

  const [siteUrl, setSiteUrl] = useState('https://video-hub.com/series/masterclass-2026');
  const [crawling, setCrawling] = useState(false);
  const [results, setResults] = useState<SniffedMediaStream[]>(DEMO_GRABBER_RESULTS);
  const [selectedIds, setSelectedIds] = useState<string[]>(DEMO_GRABBER_RESULTS.map((r) => r.id));
  const [filterType, setFilterType] = useState<'all' | 'video' | 'audio'>('all');
  const [threadCount, setThreadCount] = useState<number>(16);

  const handleCrawl = () => {
    setCrawling(true);
    setTimeout(() => {
      setCrawling(false);
      setResults(DEMO_GRABBER_RESULTS);
      setSelectedIds(DEMO_GRABBER_RESULTS.map((r) => r.id));
    }, 600);
  };

  const filteredResults = results.filter((item) => {
    if (filterType === 'all') return true;
    return item.category === filterType;
  });

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((item) => item !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const selectAll = () => {
    if (selectedIds.length === filteredResults.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredResults.map((r) => r.id));
    }
  };

  const handleQueueBatch = () => {
    const selectedStreams = results.filter((r) => selectedIds.includes(r.id));
    if (selectedStreams.length > 0) {
      onBatchQueue(selectedStreams, threadCount);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh] text-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-950 text-cyan-400 border border-cyan-800/40 rounded-lg">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">IDM Site Grabber (Пакетный граббер сайтов)</h2>
              <p className="text-xs text-slate-400">
                Сканирует всю веб-страницу и автоматически находит все видеопотоки для пакетного скачивания
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

        {/* Crawl Bar */}
        <div className="p-4 bg-slate-950/60 border-b border-slate-800 flex gap-2">
          <div className="relative flex-1">
            <Globe className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              placeholder="Адрес веб-сайта для граббинга (например, https://site.com/series/)"
              className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
            />
          </div>
          <button
            onClick={handleCrawl}
            disabled={crawling}
            className="flex items-center gap-2 px-5 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors shrink-0"
          >
            <Search className="w-3.5 h-3.5" />
            <span>{crawling ? 'Сканирование...' : 'Сканировать страницу'}</span>
          </button>
        </div>

        {/* Filters and Batch Select Header */}
        <div className="flex items-center justify-between px-6 py-2.5 bg-slate-900 border-b border-slate-800 text-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={selectAll}
              className="flex items-center gap-1.5 text-slate-300 hover:text-white"
            >
              {selectedIds.length === filteredResults.length && filteredResults.length > 0 ? (
                <CheckSquare className="w-4 h-4 text-cyan-400" />
              ) : (
                <Square className="w-4 h-4 text-slate-500" />
              )}
              <span>Выбрать все ({filteredResults.length})</span>
            </button>

            <span className="text-slate-600">|</span>

            <div className="flex items-center gap-1">
              <span className="text-slate-400 text-[11px]">Фильтр:</span>
              <button
                onClick={() => setFilterType('all')}
                className={`px-2 py-0.5 rounded text-[11px] ${
                  filterType === 'all' ? 'bg-cyan-950 text-cyan-300 border border-cyan-800/40' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Все ({results.length})
              </button>
              <button
                onClick={() => setFilterType('video')}
                className={`px-2 py-0.5 rounded text-[11px] ${
                  filterType === 'video' ? 'bg-cyan-950 text-cyan-300 border border-cyan-800/40' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Видео ({results.filter(r => r.category === 'video').length})
              </button>
              <button
                onClick={() => setFilterType('audio')}
                className={`px-2 py-0.5 rounded text-[11px] ${
                  filterType === 'audio' ? 'bg-cyan-950 text-cyan-300 border border-cyan-800/40' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Аудио ({results.filter(r => r.category === 'audio').length})
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400">Потоков на файл:</span>
            <select
              value={threadCount}
              onChange={(e) => setThreadCount(Number(e.target.value))}
              className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[11px] font-mono text-slate-200"
            >
              <option value={4}>4 потока</option>
              <option value={8}>8 потоков</option>
              <option value={16}>16 потоков (Турбо)</option>
              <option value={32}>32 потока (Макс)</option>
            </select>
          </div>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60 p-2">
          {filteredResults.map((item) => {
            const isSelected = selectedIds.includes(item.id);
            return (
              <div
                key={item.id}
                onClick={() => toggleSelect(item.id)}
                className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                  isSelected ? 'bg-cyan-950/30' : 'hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                      isSelected ? 'border-cyan-400 bg-cyan-500' : 'border-slate-700'
                    }`}
                  >
                    {isSelected && <Check className="w-2.5 h-2.5 text-slate-950 stroke-[3]" />}
                  </div>

                  <div className="w-12 h-8 rounded bg-slate-950 border border-slate-800 overflow-hidden shrink-0">
                    {item.thumbnail ? (
                      <img
                        src={item.thumbnail}
                        alt={item.title}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : item.category === 'video' ? (
                      <Film className="w-4 h-4 text-cyan-400 m-auto mt-2" />
                    ) : (
                      <Music className="w-4 h-4 text-emerald-400 m-auto mt-2" />
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-200 truncate">
                      {item.title}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                      <span className="font-mono text-cyan-400">{item.quality}</span>
                      <span>·</span>
                      <span className="font-mono">{item.format.toUpperCase()}</span>
                      <span>·</span>
                      <span className="truncate max-w-xs">{item.url}</span>
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0 ml-4 font-mono text-xs tabular-nums text-slate-200">
                  {formatBytes(item.filesize)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950 border-t border-slate-800">
          <div className="text-xs text-slate-400">
            Выбрано к пакетной загрузке:{' '}
            <span className="font-mono text-cyan-400 font-bold">{selectedIds.length}</span> из{' '}
            <span className="font-mono text-slate-300">{filteredResults.length}</span> файлов
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
            >
              Отмена
            </button>
            <button
              onClick={handleQueueBatch}
              disabled={selectedIds.length === 0}
              className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-40 rounded-lg shadow-sm transition-all"
            >
              <Download className="w-4 h-4" />
              <span>Запустить пакетную загрузку ({selectedIds.length})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
