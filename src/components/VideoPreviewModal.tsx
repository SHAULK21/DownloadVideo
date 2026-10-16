import React from 'react';
import { X, Film, Music, Download } from 'lucide-react';
import { DownloadTask } from '../types';
import { formatBytes } from '../utils/mediaSniffer';

interface VideoPreviewModalProps {
  task: DownloadTask | null;
  onClose: () => void;
}

export const VideoPreviewModal: React.FC<VideoPreviewModalProps> = ({ task, onClose }) => {
  if (!task) return null;

  const previewSource = task.videoPreviewUrl || task.url;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col text-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800">
          <div className="flex items-center gap-2.5 truncate">
            {task.category === 'video' ? (
              <Film className="w-4 h-4 text-cyan-400 shrink-0" />
            ) : (
              <Music className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span className="font-semibold text-xs text-white truncate">{task.filename}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Player View */}
        <div className="bg-black aspect-video flex items-center justify-center relative">
          {task.category === 'audio' ? (
            <div className="w-full p-8 flex flex-col items-center justify-center space-y-4">
              <div className="w-32 h-32 rounded-xl overflow-hidden border border-slate-800 shadow-xl">
                {task.thumbnail ? (
                  <img src={task.thumbnail} alt={task.filename} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-slate-800 flex items-center justify-center">
                    <Music className="w-12 h-12 text-emerald-400" />
                  </div>
                )}
              </div>
              <audio src={previewSource} controls autoPlay className="w-full max-w-md" />
            </div>
          ) : (
            <video
              src={previewSource}
              poster={task.thumbnail}
              controls
              autoPlay
              className="w-full h-full object-contain"
            />
          )}
        </div>

        {/* Footer info */}
        <div className="flex items-center justify-between px-5 py-3 bg-slate-950 border-t border-slate-800 text-xs">
          <div className="flex items-center gap-3 text-slate-400 font-mono text-[11px]">
            <span>{task.quality}</span>
            <span>·</span>
            <span>{formatBytes(task.totalBytes)}</span>
            <span>·</span>
            <span>{task.threads} сокетов IDM</span>
          </div>

          <a
            href={task.url}
            target="_blank"
            rel="noopener noreferrer"
            download={task.filename}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-700/80 hover:bg-cyan-600 text-white rounded font-medium transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Сохранить файл</span>
          </a>
        </div>
      </div>
    </div>
  );
};
