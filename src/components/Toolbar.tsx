import React from 'react';
import {
  Plus,
  Play,
  Pause,
  Square,
  Trash2,
  Layers,
  CheckCircle2,
  Gauge,
  Cpu,
  Search,
} from 'lucide-react';

interface ToolbarProps {
  onAddUrl: () => void;
  onResumeSelected: () => void;
  onPauseSelected: () => void;
  onStopAll: () => void;
  onDeleteSelected: () => void;
  onBatchGrabber: () => void;
  onClearCompleted: () => void;
  hasSelection: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  speedLimitKbps: number;
  onChangeSpeedLimit: (kbps: number) => void;
  defaultThreads: number;
  onChangeDefaultThreads: (threads: number) => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  onAddUrl,
  onResumeSelected,
  onPauseSelected,
  onStopAll,
  onDeleteSelected,
  onBatchGrabber,
  onClearCompleted,
  hasSelection,
  searchQuery,
  onSearchChange,
  speedLimitKbps,
  onChangeSpeedLimit,
  defaultThreads,
  onChangeDefaultThreads,
}) => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-2.5 bg-slate-900/90 border-b border-slate-800 text-xs">
      {/* Action Buttons Group */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={onAddUrl}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-700/80 hover:bg-cyan-600 text-white rounded font-medium transition-colors"
          title="Добавить одиночную или серию ссылок"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Добавить URL</span>
        </button>

        <button
          onClick={onResumeSelected}
          disabled={!hasSelection}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-emerald-400 rounded font-medium transition-colors"
          title="Возобновить выбранные загрузки"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>Старт</span>
        </button>

        <button
          onClick={onPauseSelected}
          disabled={!hasSelection}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-amber-400 rounded font-medium transition-colors"
          title="Приостановить выбранные"
        >
          <Pause className="w-3.5 h-3.5 fill-current" />
          <span>Пауза</span>
        </button>

        <button
          onClick={onStopAll}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-medium transition-colors"
          title="Остановить все активные потоки"
        >
          <Square className="w-3.5 h-3.5 fill-current text-rose-400" />
          <span>Стоп все</span>
        </button>

        <div className="h-4 w-px bg-slate-800 mx-1" />

        <button
          onClick={onDeleteSelected}
          disabled={!hasSelection}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-rose-400 rounded font-medium transition-colors"
          title="Удалить из списка"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Удалить</span>
        </button>

        <button
          onClick={onBatchGrabber}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-400 rounded font-medium transition-colors"
          title="Пакетный граббер сайтов (скачать все видео со страницы)"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Граббер</span>
        </button>

        <button
          onClick={onClearCompleted}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded font-medium transition-colors"
          title="Очистить завершенные из списка"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Очистить</span>
        </button>
      </div>

      {/* Speed, Threads and Search Controls */}
      <div className="flex items-center gap-3">
        {/* Speed Limiter */}
        <div className="flex items-center gap-1.5 bg-slate-950 px-2 py-1 rounded border border-slate-800">
          <Gauge className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="text-[11px] text-slate-400">Скорость:</span>
          <select
            value={speedLimitKbps}
            onChange={(e) => onChangeSpeedLimit(Number(e.target.value))}
            className="bg-transparent text-slate-200 font-mono text-[11px] outline-none cursor-pointer"
          >
            <option value={0} className="bg-slate-900 text-slate-200">Без лимита (Макс)</option>
            <option value={1024} className="bg-slate-900 text-slate-200">1 МБ/с (1024 KB/s)</option>
            <option value={3072} className="bg-slate-900 text-slate-200">3 МБ/с</option>
            <option value={10240} className="bg-slate-900 text-slate-200">10 МБ/с</option>
            <option value={25600} className="bg-slate-900 text-slate-200">25 МБ/с</option>
          </select>
        </div>

        {/* Multi-thread Connection Selector */}
        <div className="flex items-center gap-1.5 bg-slate-950 px-2 py-1 rounded border border-slate-800">
          <Cpu className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="text-[11px] text-slate-400">Потоков:</span>
          <select
            value={defaultThreads}
            onChange={(e) => onChangeDefaultThreads(Number(e.target.value))}
            className="bg-transparent text-slate-200 font-mono text-[11px] outline-none cursor-pointer"
            title="Количество одновременных сетевых соединений (IDM Multi-Segment Acceleration)"
          >
            <option value={1} className="bg-slate-900 text-slate-200">1 поток</option>
            <option value={4} className="bg-slate-900 text-slate-200">4 потока</option>
            <option value={8} className="bg-slate-900 text-slate-200">8 потоков (Стандарт)</option>
            <option value={16} className="bg-slate-900 text-slate-200">16 потоков (Турбо)</option>
            <option value={32} className="bg-slate-900 text-slate-200">32 потока (Максимум)</option>
          </select>
        </div>

        {/* Quick Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Поиск файлов..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-36 lg:w-48 pl-8 pr-2.5 py-1 bg-slate-950 border border-slate-800 rounded text-slate-200 placeholder-slate-500 text-[11px] focus:outline-none focus:border-cyan-500 transition-colors"
          />
        </div>
      </div>
    </div>
  );
};
