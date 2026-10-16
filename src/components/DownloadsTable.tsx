import React from 'react';
import {
  Film,
  Music,
  Archive,
  FileCode,
  FileText,
  Play,
  Pause,
  Trash2,
  Eye,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
} from 'lucide-react';
import { DownloadTask, MediaCategory } from '../types';
import { formatBytes, formatDuration, formatSpeed } from '../utils/mediaSniffer';

interface DownloadsTableProps {
  tasks: DownloadTask[];
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onPauseResume: (id: string) => void;
  onDelete: (id: string) => void;
  onInspectSegments: (task: DownloadTask) => void;
  onPreviewMedia: (task: DownloadTask) => void;
  activeInspectId?: string;
}

export const DownloadsTable: React.FC<DownloadsTableProps> = ({
  tasks,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onPauseResume,
  onDelete,
  onInspectSegments,
  onPreviewMedia,
  activeInspectId,
}) => {
  const isAllSelected = tasks.length > 0 && selectedIds.length === tasks.length;

  const getCategoryIcon = (cat: MediaCategory) => {
    switch (cat) {
      case 'video':
        return <Film className="w-4 h-4 text-cyan-400 shrink-0" />;
      case 'audio':
        return <Music className="w-4 h-4 text-emerald-400 shrink-0" />;
      case 'compressed':
        return <Archive className="w-4 h-4 text-amber-400 shrink-0" />;
      case 'programs':
        return <FileCode className="w-4 h-4 text-purple-400 shrink-0" />;
      default:
        return <FileText className="w-4 h-4 text-blue-400 shrink-0" />;
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden">
      <div className="flex-1 overflow-x-auto overflow-y-auto">
        <table className="w-full text-left text-xs border-collapse min-w-[980px]">
          {/* Table Header */}
          <thead className="bg-slate-900/90 text-slate-400 text-[11px] sticky top-0 z-10 border-b border-slate-800">
            <tr>
              <th className="py-2.5 px-3 w-10 text-center">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={onSelectAll}
                  className="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0 cursor-pointer"
                />
              </th>
              <th className="py-2.5 px-3 min-w-[260px]">Имя файла / Формат</th>
              <th className="py-2.5 px-3 w-28 text-right">Размер</th>
              <th className="py-2.5 px-4 w-72">Сегменты IDM и Прогресс</th>
              <th className="py-2.5 px-3 w-28 text-right">Скорость</th>
              <th className="py-2.5 px-3 w-24 text-right">Осталось</th>
              <th className="py-2.5 px-3 w-20 text-center">Потоки</th>
              <th className="py-2.5 px-3 w-28 text-center">Статус</th>
              <th className="py-2.5 px-3 w-28 text-right">Действия</th>
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-slate-900 text-slate-300">
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-16 text-center text-slate-500">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <Layers className="w-10 h-10 text-slate-700 stroke-[1.2]" />
                    <p className="text-sm font-medium text-slate-400">Список загрузок пуст</p>
                    <p className="text-xs text-slate-500">
                      Вставьте ссылку вверху или откройте «Веб-плеер» для тестирования автоперехвата
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              tasks.map((task) => {
                const isSelected = selectedIds.includes(task.id);
                const percent = Math.min(100, Math.floor((task.downloadedBytes / Math.max(1, task.totalBytes)) * 100));
                const isInspecting = activeInspectId === task.id;

                return (
                  <tr
                    key={task.id}
                    onClick={() => onInspectSegments(task)}
                    className={`transition-colors cursor-pointer group ${
                      isInspecting
                        ? 'bg-cyan-950/30 border-l-2 border-l-cyan-500'
                        : isSelected
                        ? 'bg-slate-900/80'
                        : 'hover:bg-slate-900/50'
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="py-2 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelect(task.id)}
                        className="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0 cursor-pointer"
                      />
                    </td>

                    {/* Filename & Format metadata */}
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0 overflow-hidden">
                          {task.thumbnail ? (
                            <img
                              src={task.thumbnail}
                              alt={task.filename}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            getCategoryIcon(task.category)
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-slate-200 truncate group-hover:text-cyan-300 transition-colors" title={task.filename}>
                            {task.filename}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400">
                            <span className="font-mono text-cyan-400 font-semibold">{task.format}</span>
                            <span>·</span>
                            <span>{task.quality}</span>
                            <span>·</span>
                            <span className="font-mono">{task.saveFolder}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* File Size */}
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                      {formatBytes(task.totalBytes)}
                    </td>

                    {/* Signature IDM Multi-Segment Progress Bar */}
                    <td className="py-2 px-4">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] font-mono">
                          <span className="text-slate-400">
                            {formatBytes(task.downloadedBytes)} / {formatBytes(task.totalBytes)}
                          </span>
                          <span className={`font-semibold tabular-nums ${task.status === 'completed' ? 'text-emerald-400' : 'text-cyan-400'}`}>
                            {percent}%
                          </span>
                        </div>

                        {/* Visual multi-connection segment bar */}
                        <div className="w-full h-2.5 bg-slate-900 rounded overflow-hidden flex gap-0.5 p-0.5 border border-slate-800">
                          {task.segments.length > 0 ? (
                            task.segments.map((seg) => {
                              const segSpan = seg.endByte - seg.startByte;
                              const segDone = seg.currentByte - seg.startByte;
                              const segRatio = Math.max(0, Math.min(1, segDone / Math.max(1, segSpan)));
                              const flexBasis = Math.max(1, Math.round((segSpan / task.totalBytes) * 100));

                              return (
                                <div
                                  key={seg.id}
                                  style={{ flex: flexBasis }}
                                  className="h-full bg-slate-950 rounded-xs overflow-hidden relative"
                                  title={`Соединение #${seg.id}: ${(segRatio * 100).toFixed(0)}% (${formatSpeed(seg.speed)})`}
                                >
                                  <div
                                    className="h-full transition-all duration-200"
                                    style={{
                                      width: `${segRatio * 100}%`,
                                      backgroundColor: seg.color || '#0284c7',
                                    }}
                                  />
                                </div>
                              );
                            })
                          ) : (
                            <div
                              className="h-full bg-cyan-500 transition-all duration-300 rounded"
                              style={{ width: `${percent}%` }}
                            />
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Speed */}
                    <td className="py-2 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                      {task.status === 'downloading' ? (
                        <span className="text-cyan-400 font-semibold">{formatSpeed(task.speed)}</span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>

                    {/* ETA */}
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-400 whitespace-nowrap">
                      {task.status === 'downloading' ? (
                        formatDuration(task.eta)
                      ) : task.status === 'completed' ? (
                        <span className="text-emerald-500">Готово</span>
                      ) : (
                        <span>—</span>
                      )}
                    </td>

                    {/* Threads Count */}
                    <td className="py-2 px-3 text-center font-mono whitespace-nowrap">
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700/60">
                        {task.threads} сок.
                      </span>
                    </td>

                    {/* Status Badge */}
                    <td className="py-2 px-3 text-center whitespace-nowrap">
                      {task.status === 'downloading' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-cyan-950 text-cyan-300 border border-cyan-800/60">
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                          Качается
                        </span>
                      )}
                      {task.status === 'paused' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-950 text-amber-300 border border-amber-800/60">
                          Пауза
                        </span>
                      )}
                      {task.status === 'completed' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-950 text-emerald-300 border border-emerald-800/60">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          Завершено
                        </span>
                      )}
                      {task.status === 'merging' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-purple-950 text-purple-300 border border-purple-800/60">
                          Сборка частей
                        </span>
                      )}
                      {task.status === 'queued' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-900 text-slate-400 border border-slate-800">
                          В очереди
                        </span>
                      )}
                      {task.status === 'error' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-rose-950 text-rose-300 border border-rose-800/60">
                          <AlertCircle className="w-3 h-3 text-rose-400" />
                          Ошибка
                        </span>
                      )}
                    </td>

                    {/* Row Action Buttons */}
                    <td className="py-2 px-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {/* Play/Pause */}
                        {task.status !== 'completed' && (
                          <button
                            onClick={() => onPauseResume(task.id)}
                            className="p-1 hover:bg-slate-800 text-slate-300 hover:text-white rounded transition-colors"
                            title={task.status === 'downloading' ? 'Пауза' : 'Возобновить'}
                          >
                            {task.status === 'downloading' ? (
                              <Pause className="w-3.5 h-3.5 fill-current text-amber-400" />
                            ) : (
                              <Play className="w-3.5 h-3.5 fill-current text-emerald-400" />
                            )}
                          </button>
                        )}

                        {/* Preview */}
                        {(task.category === 'video' || task.category === 'audio') && (
                          <button
                            onClick={() => onPreviewMedia(task)}
                            className="p-1 hover:bg-slate-800 text-slate-300 hover:text-cyan-400 rounded transition-colors"
                            title="Предпросмотр / Воспроизвести"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Inspect Segments */}
                        <button
                          onClick={() => onInspectSegments(task)}
                          className="p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded transition-colors"
                          title="Инспектор потоков и соединений"
                        >
                          <Sliders className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete */}
                        <button
                          onClick={() => onDelete(task.id)}
                          className="p-1 hover:bg-slate-800 text-slate-400 hover:text-rose-400 rounded transition-colors"
                          title="Удалить задачу"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
