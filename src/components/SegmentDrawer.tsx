import React from 'react';
import { X, Cpu, Activity, Share2, FolderOpen, Zap } from 'lucide-react';
import { DownloadTask } from '../types';
import { formatBytes, formatSpeed } from '../utils/mediaSniffer';

interface SegmentDrawerProps {
  task: DownloadTask | null;
  onClose: () => void;
  speedHistory: number[];
}

export const SegmentDrawer: React.FC<SegmentDrawerProps> = ({
  task,
  onClose,
  speedHistory,
}) => {
  if (!task) return null;

  const percent = Math.min(100, Math.floor((task.downloadedBytes / Math.max(1, task.totalBytes)) * 100));

  // Compute SVG polyline for speed chart
  const chartWidth = 320;
  const chartHeight = 56;
  const maxHistoricalSpeed = Math.max(1024 * 1024, ...speedHistory);
  const points = speedHistory.map((val, idx) => {
    const x = (idx / Math.max(1, speedHistory.length - 1)) * chartWidth;
    const y = chartHeight - (val / maxHistoricalSpeed) * (chartHeight - 8) - 4;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="bg-slate-900 border-t border-slate-800 p-4 shrink-0 transition-all text-xs">
      {/* Drawer Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-cyan-950 text-cyan-400 border border-cyan-800/50 rounded">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-100">{task.filename}</span>
              <span className="font-mono text-cyan-400 text-[11px] bg-slate-800 px-1.5 py-0.5 rounded">
                {task.threads} параллельных потоков IDM
              </span>
            </div>
            <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
              <span>{formatBytes(task.downloadedBytes)} из {formatBytes(task.totalBytes)} ({percent}%)</span>
              <span>·</span>
              <span className="text-emerald-400 font-semibold">{formatSpeed(task.speed)}</span>
              <span>·</span>
              <span className="text-cyan-300">Динамическое расщепление сегментов активно</span>
            </div>
          </div>
        </div>

        {/* Speed Mini-Graph & Close Button */}
        <div className="flex items-center gap-4">
          <div className="hidden md:flex flex-col items-end">
            <span className="text-[10px] text-slate-400 flex items-center gap-1">
              <Activity className="w-3 h-3 text-cyan-400" />
              График скорости
            </span>
            <div className="w-[160px] h-9 bg-slate-950 rounded border border-slate-800 overflow-hidden relative mt-1">
              <svg width="100%" height="100%" viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none">
                <polyline
                  fill="none"
                  stroke="#06b6d4"
                  strokeWidth="2"
                  points={points || '0,50 320,50'}
                />
              </svg>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Grid of Active Sockets / Segments */}
      <div className="pt-3">
        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-cyan-400" />
          Состояние сетевых сокетов (Chunk Segments)
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 max-h-48 overflow-y-auto pr-1">
          {task.segments.map((seg) => {
            const segSpan = seg.endByte - seg.startByte;
            const segDone = seg.currentByte - seg.startByte;
            const segRatio = Math.max(0, Math.min(1, segDone / Math.max(1, segSpan)));
            const segPercent = (segRatio * 100).toFixed(0);

            return (
              <div
                key={seg.id}
                className="bg-slate-950 p-2.5 rounded border border-slate-800 space-y-1.5"
              >
                <div className="flex justify-between items-center text-[11px]">
                  <span className="font-semibold text-slate-300">
                    Поток #{seg.id}
                  </span>
                  <span
                    className={`font-mono text-[10px] font-semibold tabular-nums ${
                      seg.status === 'completed'
                        ? 'text-emerald-400'
                        : seg.status === 'downloading'
                        ? 'text-cyan-400'
                        : 'text-slate-500'
                    }`}
                  >
                    {seg.status === 'completed' ? 'Готов' : `${segPercent}%`}
                  </span>
                </div>

                {/* Segment Mini Progress Bar */}
                <div className="w-full bg-slate-900 rounded-xs h-1.5 overflow-hidden">
                  <div
                    className="h-full transition-all duration-200"
                    style={{
                      width: `${segRatio * 100}%`,
                      backgroundColor: seg.color || '#0284c7',
                    }}
                  />
                </div>

                <div className="flex justify-between text-[10px] text-slate-500 font-mono tabular-nums">
                  <span>{formatBytes(segDone)} / {formatBytes(segSpan)}</span>
                  <span>{seg.speed > 0 ? formatSpeed(seg.speed) : '—'}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
