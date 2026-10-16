export interface Settings {
  maxThreads: number;
  maxConcurrentDownloads: number;
  speedLimitKbps: number;
  autoStartOnDetect: boolean;
  showFloatingButton: boolean;
  defaultDownloadDir: string;
  soundOnComplete: boolean;
  interceptVideoTypes: string[];
  minFileSizeToCatchKb: number;
}
export interface Stream {
  id: string;
  url: string;
  title: string;
  format: string;
  quality: string;
  category: string;
  filesize: number;
  approximate?: boolean;
  thumbnail?: string;
  hasAudio: boolean;
  hasVideo: boolean;
}
export interface Task {
  id: string;
  url: string;
  filename: string;
  format: string;
  quality: string;
  category: string;
  totalBytes: number;
  downloadedBytes: number;
  speed: number;
  eta: number;
  status:
    "queued" | "downloading" | "paused" | "merging" | "completed" | "error";
  threads: number;
  addedAt: number;
  completedAt?: number;
  saveFolder: string;
  errorMsg?: string;
  outputPath?: string;
  fragmentIndex: number;
  fragmentCount: number;
  estimated?: boolean;
}
export interface State {
  desktop?: boolean;
  version: string;
  settings: Settings;
  tasks: Task[];
  pairing: { code: string; expires: number } | null;
  warning: string | null;
}
