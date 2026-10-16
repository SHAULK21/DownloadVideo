import React, { useState, useEffect, useRef } from 'react';
import { DownloadTask, MediaCategory, SniffedMediaStream, AppSettings } from './types';
import { INITIAL_DOWNLOADS } from './utils/initialData';
import { createSegmentsForTask, playDownloadCompleteChime, stepDownloadTask } from './utils/downloadEngine';
import { extractFilenameFromUrl, detectCategoryFromFormat } from './utils/mediaSniffer';

import { TopNav } from './components/TopNav';
import { Toolbar } from './components/Toolbar';
import { Sidebar } from './components/Sidebar';
import { DownloadsTable } from './components/DownloadsTable';
import { SegmentDrawer } from './components/SegmentDrawer';
import { AddDownloadModal } from './components/AddDownloadModal';
import { SiteGrabberModal } from './components/SiteGrabberModal';
import { ExtensionModal } from './components/ExtensionModal';
import { BrowserSimView } from './components/BrowserSimView';
import { VideoPreviewModal } from './components/VideoPreviewModal';
import { SettingsModal } from './components/SettingsModal';

const DEFAULT_SETTINGS: AppSettings = {
  maxThreads: 16,
  maxConcurrentDownloads: 3,
  speedLimitKbps: 0,
  autoStartOnDetect: true,
  showFloatingButton: true,
  defaultDownloadDir: 'C:\\Downloads\\Video',
  soundOnComplete: true,
  interceptVideoTypes: ['mp4', 'm3u8', 'webm', 'mkv', 'mp3', 'm4a'],
  minFileSizeToCatchKb: 512,
};

export default function App() {
  const [tasks, setTasks] = useState<DownloadTask[]>(INITIAL_DOWNLOADS);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [currentTab, setCurrentTab] = useState<'downloads' | 'extension' | 'grabber' | 'browser-sim'>('downloads');
  const [currentCategory, setCurrentCategory] = useState<MediaCategory>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'downloading' | 'completed' | 'paused'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [inspectingTaskId, setInspectingTaskId] = useState<string | null>('dl-101');
  const [previewingTask, setPreviewingTask] = useState<DownloadTask | null>(null);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isGrabberModalOpen, setIsGrabberModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // App Settings
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  // Real-time speed history for chart
  const [speedHistory, setSpeedHistory] = useState<number[]>([
    12 * 1024 * 1024,
    18 * 1024 * 1024,
    22 * 1024 * 1024,
    26 * 1024 * 1024,
    30 * 1024 * 1024,
  ]);

  // Main IDM Multi-Thread Download Heartbeat Engine
  useEffect(() => {
    const interval = setInterval(() => {
      setTasks((prevTasks) => {
        let hasChanges = false;
        let anyCompleted = false;
        let activeSpeedSum = 0;

        const updated = prevTasks.map((t) => {
          if (t.status === 'downloading') {
            hasChanges = true;
            const { updatedTask, completed } = stepDownloadTask(t, 0.5, settings.speedLimitKbps);
            if (completed) {
              anyCompleted = true;
            }
            activeSpeedSum += updatedTask.speed;
            return updatedTask;
          }
          return t;
        });

        if (anyCompleted && settings.soundOnComplete) {
          playDownloadCompleteChime();
        }

        // Update speed history
        setSpeedHistory((prev) => {
          const next = [...prev.slice(-19), activeSpeedSum];
          return next;
        });

        return hasChanges ? updated : prevTasks;
      });
    }, 500);

    return () => clearInterval(interval);
  }, [settings.speedLimitKbps, settings.soundOnComplete]);

  // Selection handlers
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filteredTasks.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredTasks.map((t) => t.id));
    }
  };

  // Bulk actions
  const handleResumeSelected = () => {
    setTasks((prev) =>
      prev.map((t) =>
        selectedIds.includes(t.id) && t.status !== 'completed'
          ? { ...t, status: 'downloading' }
          : t
      )
    );
  };

  const handlePauseSelected = () => {
    setTasks((prev) =>
      prev.map((t) =>
        selectedIds.includes(t.id) && t.status === 'downloading'
          ? { ...t, status: 'paused', speed: 0 }
          : t
      )
    );
  };

  const handleStopAll = () => {
    setTasks((prev) =>
      prev.map((t) =>
        t.status === 'downloading' ? { ...t, status: 'paused', speed: 0 } : t
      )
    );
  };

  const handleDeleteSelected = () => {
    setTasks((prev) => prev.filter((t) => !selectedIds.includes(t.id)));
    setSelectedIds([]);
    if (inspectingTaskId && selectedIds.includes(inspectingTaskId)) {
      setInspectingTaskId(null);
    }
  };

  const handleClearCompleted = () => {
    setTasks((prev) => prev.filter((t) => t.status !== 'completed'));
    setSelectedIds((prev) =>
      prev.filter((id) => {
        const item = tasks.find((t) => t.id === id);
        return item && item.status !== 'completed';
      })
    );
  };

  // Row specific
  const handlePauseResumeSingle = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === id) {
          if (t.status === 'downloading') {
            return { ...t, status: 'paused', speed: 0 };
          } else if (t.status === 'paused' || t.status === 'queued') {
            return { ...t, status: 'downloading' };
          }
        }
        return t;
      })
    );
  };

  const handleDeleteSingle = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setSelectedIds((prev) => prev.filter((item) => item !== id));
    if (inspectingTaskId === id) {
      setInspectingTaskId(null);
    }
  };

  // Add tasks
  const handleAddSingle = (stream: SniffedMediaStream, threads: number, saveFolder: string) => {
    const filename = `${stream.title.replace(/[\\/:*?"<>|]/g, '_')}.${stream.format}`;
    const newTask: DownloadTask = {
      id: `task-${Date.now()}`,
      url: stream.url,
      filename,
      format: stream.format.toUpperCase(),
      quality: stream.quality,
      totalBytes: stream.filesize,
      downloadedBytes: 0,
      speed: 0,
      status: 'downloading',
      threads,
      segments: createSegmentsForTask(stream.filesize, threads),
      category: stream.category,
      addedAt: Date.now(),
      eta: 15,
      priority: 'high',
      saveFolder,
      thumbnail: stream.thumbnail,
      videoPreviewUrl: stream.url,
    };

    setTasks((prev) => [newTask, ...prev]);
    setInspectingTaskId(newTask.id);
    setCurrentTab('downloads');
  };

  const handleAddBatch = (urls: string[], threads: number, saveFolder: string) => {
    const newTasks: DownloadTask[] = urls.map((url, idx) => {
      const filename = extractFilenameFromUrl(url, `batch_item_${idx + 1}`);
      const category = detectCategoryFromFormat(url);
      const estimatedSize = (180 + (idx % 5) * 60) * 1024 * 1024;

      return {
        id: `batch-${Date.now()}-${idx}`,
        url,
        filename,
        format: filename.split('.').pop()?.toUpperCase() || 'MP4',
        quality: 'Batch Stream',
        totalBytes: estimatedSize,
        downloadedBytes: 0,
        speed: 0,
        status: idx < 3 ? 'downloading' : 'queued',
        threads,
        segments: createSegmentsForTask(estimatedSize, threads),
        category,
        addedAt: Date.now() + idx,
        eta: 30,
        priority: 'normal',
        saveFolder,
      };
    });

    setTasks((prev) => [...newTasks, ...prev]);
    if (newTasks.length > 0) {
      setInspectingTaskId(newTasks[0].id);
    }
    setCurrentTab('downloads');
  };

  const handleBatchQueueFromGrabber = (streams: SniffedMediaStream[], threads: number) => {
    const newTasks: DownloadTask[] = streams.map((stream, idx) => ({
      id: `grab-${Date.now()}-${idx}`,
      url: stream.url,
      filename: `${stream.title.replace(/[\\/:*?"<>|]/g, '_')}.${stream.format}`,
      format: stream.format.toUpperCase(),
      quality: stream.quality,
      totalBytes: stream.filesize,
      downloadedBytes: 0,
      speed: 0,
      status: idx < 2 ? 'downloading' : 'queued',
      threads,
      segments: createSegmentsForTask(stream.filesize, threads),
      category: stream.category,
      addedAt: Date.now() + idx,
      eta: 25,
      priority: 'normal',
      saveFolder: 'C:\\Downloads\\Grabber',
      thumbnail: stream.thumbnail,
      videoPreviewUrl: stream.url,
    }));

    setTasks((prev) => [...newTasks, ...prev]);
    if (newTasks.length > 0) {
      setInspectingTaskId(newTasks[0].id);
    }
    setCurrentTab('downloads');
  };

  // Filter tasks
  const filteredTasks = tasks.filter((t) => {
    // Category filter
    if (currentCategory !== 'all' && t.category !== currentCategory) {
      return false;
    }
    // Status filter
    if (statusFilter !== 'all' && t.status !== statusFilter) {
      return false;
    }
    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        t.filename.toLowerCase().includes(q) ||
        t.url.toLowerCase().includes(q) ||
        t.quality.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Telemetry aggregates
  const categoryCounts: Record<MediaCategory, number> = {
    all: tasks.length,
    video: tasks.filter((t) => t.category === 'video').length,
    audio: tasks.filter((t) => t.category === 'audio').length,
    compressed: tasks.filter((t) => t.category === 'compressed').length,
    programs: tasks.filter((t) => t.category === 'programs').length,
    documents: tasks.filter((t) => t.category === 'documents').length,
  };

  const statusCounts = {
    downloading: tasks.filter((t) => t.status === 'downloading').length,
    completed: tasks.filter((t) => t.status === 'completed').length,
    paused: tasks.filter((t) => t.status === 'paused').length,
  };

  const totalCurrentSpeed = tasks
    .filter((t) => t.status === 'downloading')
    .reduce((acc, curr) => acc + curr.speed, 0);

  const activeSocketsCount = tasks
    .filter((t) => t.status === 'downloading')
    .reduce((acc, curr) => acc + curr.threads, 0);

  const totalDownloadedAll = tasks.reduce((acc, curr) => acc + curr.downloadedBytes, 0);

  const inspectingTask = tasks.find((t) => t.id === inspectingTaskId) || null;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 font-sans text-slate-100 select-none">
      {/* 1. Global Navigation Bar */}
      <TopNav
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        onOpenAddModal={() => setIsAddModalOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        activeCount={statusCounts.downloading}
      />

      {/* 2. Main Tab View Router */}
      {currentTab === 'downloads' && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Action Ribbon Toolbar */}
          <Toolbar
            onAddUrl={() => setIsAddModalOpen(true)}
            onResumeSelected={handleResumeSelected}
            onPauseSelected={handlePauseSelected}
            onStopAll={handleStopAll}
            onDeleteSelected={handleDeleteSelected}
            onBatchGrabber={() => setIsGrabberModalOpen(true)}
            onClearCompleted={handleClearCompleted}
            hasSelection={selectedIds.length > 0}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            speedLimitKbps={settings.speedLimitKbps}
            onChangeSpeedLimit={(kbps) => setSettings({ ...settings, speedLimitKbps: kbps })}
            defaultThreads={settings.maxThreads}
            onChangeDefaultThreads={(threads) => setSettings({ ...settings, maxThreads: threads })}
          />

          {/* Core Layout: Sidebar + Downloads Data Table */}
          <div className="flex-1 flex min-h-0">
            <Sidebar
              currentCategory={currentCategory}
              onSelectCategory={setCurrentCategory}
              statusFilter={statusFilter}
              onSelectStatusFilter={setStatusFilter}
              categoryCounts={categoryCounts}
              statusCounts={statusCounts}
              totalSpeed={totalCurrentSpeed}
              activeThreads={activeSocketsCount}
              maxThreads={settings.maxThreads * 2}
              totalDownloadedBytes={totalDownloadedAll}
            />

            <DownloadsTable
              tasks={filteredTasks}
              selectedIds={selectedIds}
              onToggleSelect={handleToggleSelect}
              onSelectAll={handleSelectAll}
              onPauseResume={handlePauseResumeSingle}
              onDelete={handleDeleteSingle}
              onInspectSegments={(task) => setInspectingTaskId(task.id)}
              onPreviewMedia={(task) => setPreviewingTask(task)}
              activeInspectId={inspectingTaskId || undefined}
            />
          </div>

          {/* 3. Bottom Multi-Thread Segment Inspector Drawer */}
          {inspectingTask && (
            <SegmentDrawer
              task={inspectingTask}
              onClose={() => setInspectingTaskId(null)}
              speedHistory={speedHistory}
            />
          )}
        </div>
      )}

      {currentTab === 'extension' && (
        <ExtensionModal onOpenBrowserSim={() => setCurrentTab('browser-sim')} />
      )}

      {currentTab === 'grabber' && (
        <div className="flex-1 flex items-center justify-center p-6 bg-slate-950">
          <SiteGrabberModal
            isOpen={true}
            onClose={() => setCurrentTab('downloads')}
            onBatchQueue={handleBatchQueueFromGrabber}
          />
        </div>
      )}

      {currentTab === 'browser-sim' && (
        <BrowserSimView
          onCaptureDownload={(stream) => {
            handleAddSingle(stream, settings.maxThreads, settings.defaultDownloadDir);
          }}
          onGoToDownloads={() => setCurrentTab('downloads')}
        />
      )}

      {/* Auxiliary Modals */}
      <AddDownloadModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddSingle={handleAddSingle}
        onAddBatch={handleAddBatch}
        defaultThreads={settings.maxThreads}
      />

      <SiteGrabberModal
        isOpen={isGrabberModalOpen}
        onClose={() => setIsGrabberModalOpen(false)}
        onBatchQueue={handleBatchQueueFromGrabber}
      />

      <VideoPreviewModal
        task={previewingTask}
        onClose={() => setPreviewingTask(null)}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={(newS) => setSettings(newS)}
      />
    </div>
  );
}
