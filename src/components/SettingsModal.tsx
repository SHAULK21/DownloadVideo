import React from 'react';
import { X, Sliders, Cpu, Gauge, Volume2, Folder, ShieldCheck } from 'lucide-react';
import { AppSettings } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (newSettings: AppSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave,
}) => {
  if (!isOpen) return null;

  const [form, setForm] = React.useState<AppSettings>({ ...settings });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg overflow-hidden shadow-2xl text-slate-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-950 text-cyan-400 border border-cyan-800/40 rounded-lg">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Параметры и Настройки IDM</h2>
              <p className="text-xs text-slate-400">Конфигурация многопоточности и перехвата браузера</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto text-xs">
          {/* Threads & Acceleration */}
          <div className="space-y-3">
            <div className="font-semibold text-slate-200 flex items-center gap-2 text-xs uppercase tracking-wider text-cyan-400">
              <Cpu className="w-4 h-4" />
              Многопоточное ускорение (Multi-Threading)
            </div>

            <div className="space-y-1">
              <label className="text-slate-300 font-medium">
                Число параллельных соединений на одну задачу:
              </label>
              <select
                value={form.maxThreads}
                onChange={(e) => setForm({ ...form, maxThreads: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
              >
                <option value={1}>1 поток (Без разделения на сегменты)</option>
                <option value={4}>4 потока</option>
                <option value={8}>8 потоков (Стандарт IDM)</option>
                <option value={16}>16 потоков (Турбо-режим)</option>
                <option value={32}>32 потока (Максимальная загрузка канала)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-slate-300 font-medium">
                Максимальное число одновременных закачек:
              </label>
              <input
                type="number"
                min={1}
                max={10}
                value={form.maxConcurrentDownloads}
                onChange={(e) => setForm({ ...form, maxConcurrentDownloads: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Browser Integration & Sniffing */}
          <div className="space-y-3 pt-3 border-t border-slate-800">
            <div className="font-semibold text-slate-200 flex items-center gap-2 text-xs uppercase tracking-wider text-cyan-400">
              <ShieldCheck className="w-4 h-4" />
              Интеграция с браузером и автоперехват
            </div>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.showFloatingButton}
                onChange={(e) => setForm({ ...form, showFloatingButton: e.target.checked })}
                className="rounded bg-slate-950 border-slate-700 text-cyan-500 focus:ring-0"
              />
              <span className="text-slate-300">
                Показывать плавающую кнопку «Скачать это видео» над веб-плеерами
              </span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.autoStartOnDetect}
                onChange={(e) => setForm({ ...form, autoStartOnDetect: e.target.checked })}
                className="rounded bg-slate-950 border-slate-700 text-cyan-500 focus:ring-0"
              />
              <span className="text-slate-300">
                Автоматически начинать скачивание при клике по плавающей панели
              </span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.soundOnComplete}
                onChange={(e) => setForm({ ...form, soundOnComplete: e.target.checked })}
                className="rounded bg-slate-950 border-slate-700 text-cyan-500 focus:ring-0"
              />
              <span className="text-slate-300 flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                Звуковое уведомление (IDM Chime) при завершении скачивания
              </span>
            </label>
          </div>

          {/* Paths */}
          <div className="space-y-3 pt-3 border-t border-slate-800">
            <div className="space-y-1">
              <label className="text-slate-300 font-medium">Основная папка для сохранения:</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={form.defaultDownloadDir}
                  onChange={(e) => setForm({ ...form, defaultDownloadDir: e.target.value })}
                  className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-lg shadow-sm transition-colors"
            >
              Применить настройки
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
