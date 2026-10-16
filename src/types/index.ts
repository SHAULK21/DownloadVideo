export type MediaCategory = 'all' | 'video' | 'audio' | 'compressed' | 'programs' | 'documents';

export type DownloadStatus = 'queued' | 'downloading' | 'paused' | 'merging' | 'completed' | 'error';

export interface DownloadSegment {
  id: number;
  startByte: number;
  endByte: number;
  currentByte: number;
  speed: number; // bytes/sec
  status: 'idle' | 'downloading' | 'completed';
  color: string;
}

export interface DownloadTask {
  id: string;
  url: string;
  filename: string;
  format: string;
  quality: string;
  totalBytes: number;
  downloadedBytes: number;
  speed: number; // bytes/sec
  status: DownloadStatus;
  threads: number;
  segments: DownloadSegment[];
  category: MediaCategory;
  addedAt: number;
  completedAt?: number;
  eta: number; // seconds
  priority: 'high' | 'normal' | 'low';
  saveFolder: string;
  thumbnail?: string;
  errorMsg?: string;
  sourceUrl?: string;
  blobUrl?: string;
  videoPreviewUrl?: string;
}

export interface SniffedMediaStream {
  id: string;
  url: string;
  title: string;
  format: 'mp4' | 'm3u8' | 'webm' | 'mp3' | 'm4a' | 'zip' | 'exe' | 'ts';
  category: MediaCategory;
  quality: string;
  resolution?: string;
  fps?: number;
  filesize: number;
  mimeType: string;
  thumbnail?: string;
  sourcePageTitle?: string;
  sourcePageUrl?: string;
  codec?: string;
  hasAudio: boolean;
  hasVideo: boolean;
}

export interface AppSettings {
  maxThreads: number; // 1 - 32
  maxConcurrentDownloads: number; // 1 - 10
  speedLimitKbps: number; // 0 = unlimited
  autoStartOnDetect: boolean;
  showFloatingButton: boolean;
  defaultDownloadDir: string;
  soundOnComplete: boolean;
  interceptVideoTypes: string[];
  minFileSizeToCatchKb: number;
}

export interface SpeedHistoryPoint {
  time: number;
  speed: number;
}
