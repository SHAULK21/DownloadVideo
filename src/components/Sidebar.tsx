import React from 'react';
import {
  Folder,
  Film,
  Music,
  Archive,
  FileCode,
  FileText,
  Activity,
  CheckCircle2,
  PauseCircle,
  Clock,
  Zap,
} from 'lucide-react';
import { MediaCategory } from '../types';
import { formatBytes, formatSpeed } from '../utils/mediaSniffer';

interface SidebarProps {
  currentCategory: MediaCategory;
  onSelectCategory: (cat: MediaCategory) => void;
  statusFilter: 'all' | 'downloading' | 'completed' | 'paused';
  onSelectStatusFilter: (status: 'all' | 'downloading' | 'completed' | 'paused') => void;
  categoryCounts: Record<MediaCategory, number>;
  statusCounts: {
    downloading: number;
    completed: number;
    paused: number;
  };
  totalSpeed: number;
  activeThreads: number;
  maxThreads: number;
  totalDownloadedBytes: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentCategory,
  onSelectCategory,
  statusFilter,
  onSelectStatusFilter,
  categoryCounts,
  statusCounts,
  totalSpeed,
  activeThreads,
  maxThreads,
  totalDownloadedBytes,
}) => {
  const categories: { id: MediaCategory; label: string; icon: React.ReactNode }[] = [
    { id: 'all', label: 'Все категории', icon: <Folder className="w-4 h-4 text-slate-400" /> },
    { id: 'video', label: 'Видео (MP4, HLS)', icon: <Film className="w-4 h-4 text-cyan-400" /> },
    { id: 'audio', label: 'Аудио (MP3, AAC)', icon: <Music className="w-4 h-4 text-emerald-400" /> },
    { id: 'compressed', label: 'Архивы (ZIP, RAR)', icon: <Archive className="w-4 h-4 text-amber-400" /> },
    { id: 'programs', label: 'Программы (EXE, APK)', icon: <FileCode className="w-4 h-4 text-purple-400" /> },
    { id: 'documents', label: 'Документы', icon: <FileText className="w-4 h-4 text-blue-400" /> },
  ];

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between shrink-0 select-none">
      <div className="p-3 space-y-5 overflow-y-auto">
        {/* Categories Section */}
        <div>
          <div className="px-2.5 pb-2 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
            Категории
          </div>
          <div className="space-y-0.5">
            {categories.map((cat) => {
              const count = categoryCounts[cat.id] || 0;
              const isActive = currentCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => onSelectCategory(cat.id)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                    isActive
                      ? 'bg-cyan-950 text-cyan-300 font-medium border border-cyan-800/40'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    {cat.icon}
                    <span className="truncate">{cat.label}</span>
                  </div>
                  <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Queues & State Section */}
        <div>
          <div className="px-2.5 pb-2 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
            Очереди и Статусы
          </div>
          <div className="space-y-0.5 text-xs">
            <button
              onClick={() => onSelectStatusFilter('all')}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md transition-colors ${
                statusFilter === 'all'
                  ? 'bg-slate-800 text-white font-medium'
                  : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5" />
                <span>Все очереди</span>
              </div>
            </button>

            <button
              onClick={() => onSelectStatusFilter('downloading')}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md transition-colors ${
                statusFilter === 'downloading'
                  ? 'bg-slate-800 text-cyan-300 font-medium'
                  : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-cyan-400" />
                <span>В процессе</span>
              </div>
              <span className="font-mono text-[11px] text-cyan-400 tabular-nums">
                {statusCounts.downloading}
              </span>
            </button>

            <button
              onClick={() => onSelectStatusFilter('paused')}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md transition-colors ${
                statusFilter === 'paused'
                  ? 'bg-slate-800 text-amber-300 font-medium'
                  : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <PauseCircle className="w-3.5 h-3.5 text-amber-400" />
                <span>На паузе</span>
              </div>
              <span className="font-mono text-[11px] text-amber-400 tabular-nums">
                {statusCounts.paused}
              </span>
            </button>

            <button
              onClick={() => onSelectStatusFilter('completed')}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md transition-colors ${
                statusFilter === 'completed'
                  ? 'bg-slate-800 text-emerald-300 font-medium'
                  : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Завершённые</span>
              </div>
              <span className="font-mono text-[11px] text-emerald-400 tabular-nums">
                {statusCounts.completed}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Network Engine Telemetry Gauge */}
      <div className="p-3 m-2.5 bg-slate-950 rounded-lg border border-slate-800/90 text-xs space-y-2">
        <div className="flex items-center justify-between text-slate-400">
          <span className="flex items-center gap-1.5 font-medium text-[11px]">
            <Zap className="w-3.5 h-3.5 text-cyan-400" />
            Пропускная способность
          </span>
          <span className="font-mono text-cyan-400 font-bold tabular-nums">
            {formatSpeed(totalSpeed)}
          </span>
        </div>

        {/* Multi-thread socket load */}
        <div className="space-y-1">
          <div className="flex justify-between text-[11px] text-slate-400">
            <span>Активные сокеты IDM</span>
            <span className="font-mono text-slate-200 tabular-nums">
              {activeThreads} / {maxThreads} потоков
            </span>
          </div>
          <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, (activeThreads / Math.max(1, maxThreads)) * 100)}%` }}
            />
          </div>
        </div>

        <div className="pt-1 border-t border-slate-900 flex justify-between text-[11px] text-slate-400">
          <span>Скачано всего:</span>
          <span className="font-mono text-slate-300 tabular-nums">
            {formatBytes(totalDownloadedBytes)}
          </span>
        </div>
      </div>
    </aside>
  );
};
