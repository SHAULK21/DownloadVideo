import React from 'react';
import { Download, Sliders, Plus, ExternalLink, Globe, LayoutList, Layers } from 'lucide-react';

interface TopNavProps {
  currentTab: 'downloads' | 'extension' | 'grabber' | 'browser-sim';
  onSelectTab: (tab: 'downloads' | 'extension' | 'grabber' | 'browser-sim') => void;
  onOpenAddModal: () => void;
  onOpenSettings: () => void;
  activeCount: number;
}

export const TopNav: React.FC<TopNavProps> = ({
  currentTab,
  onSelectTab,
  onOpenAddModal,
  onOpenSettings,
  activeCount,
}) => {
  return (
    <header className="flex items-center justify-between gap-8 px-6 py-3 bg-slate-900 border-b border-slate-800 shrink-0">
      {/* Zone 1: Brand Wordmark */}
      <div className="flex items-center gap-3 whitespace-nowrap shrink-0 cursor-pointer" onClick={() => onSelectTab('downloads')}>
        <div className="w-8 h-8 rounded-lg overflow-hidden bg-slate-800 border border-cyan-500/30 flex items-center justify-center shadow-sm">
          <img
            src="/src/assets/images/idm_app_icon_1792147324206.jpg"
            alt="OmniGrab IDM Icon"
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-base font-bold tracking-tight text-white">OmniGrab IDM</span>
          <span className="text-xs font-mono text-cyan-400">v2.4 Pro</span>
        </div>
      </div>

      {/* Zone 2: 4 Clean Single-Line Nav Links */}
      <nav className="hidden md:flex items-center gap-2 text-xs font-medium text-slate-300">
        <button
          onClick={() => onSelectTab('downloads')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md transition-colors whitespace-nowrap shrink-0 ${
            currentTab === 'downloads'
              ? 'bg-slate-800 text-cyan-400 font-semibold shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <LayoutList className="w-4 h-4" />
          <span>Менеджер загрузок</span>
          {activeCount > 0 && (
            <span className="font-mono text-[10px] bg-cyan-950 text-cyan-300 border border-cyan-700/50 px-1.5 py-0.2 rounded">
              {activeCount}
            </span>
          )}
        </button>

        <button
          onClick={() => onSelectTab('browser-sim')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md transition-colors whitespace-nowrap shrink-0 ${
            currentTab === 'browser-sim'
              ? 'bg-slate-800 text-cyan-400 font-semibold shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Globe className="w-4 h-4" />
          <span>Веб-плеер (Тест перехвата)</span>
        </button>

        <button
          onClick={() => onSelectTab('grabber')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md transition-colors whitespace-nowrap shrink-0 ${
            currentTab === 'grabber'
              ? 'bg-slate-800 text-cyan-400 font-semibold shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Пакетный граббер сайтов</span>
        </button>

        <button
          onClick={() => onSelectTab('extension')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md transition-colors whitespace-nowrap shrink-0 ${
            currentTab === 'extension'
              ? 'bg-slate-800 text-cyan-400 font-semibold shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <ExternalLink className="w-4 h-4" />
          <span>Браузерное расширение</span>
        </button>
      </nav>

      {/* Zone 3: 1 Primary CTA + Settings Icon */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={onOpenSettings}
          title="Настройки параметров и многопоточности"
          className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors"
        >
          <Sliders className="w-4 h-4" />
        </button>

        <button
          onClick={onOpenAddModal}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 rounded-lg shadow-sm transition-all whitespace-nowrap shrink-0 active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Добавить URL</span>
        </button>
      </div>
    </header>
  );
};
