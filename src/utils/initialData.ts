import { DownloadTask } from '../types';
import { createSegmentsForTask } from './downloadEngine';

export const INITIAL_DOWNLOADS: DownloadTask[] = [
  {
    id: 'dl-101',
    filename: 'Bioluminescent_Reef_4K_60fps.mp4',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    format: 'MP4',
    quality: '4K UHD (2160p)',
    totalBytes: 1240 * 1024 * 1024,
    downloadedBytes: 785 * 1024 * 1024,
    speed: 24.8 * 1024 * 1024,
    status: 'downloading',
    threads: 16,
    segments: createSegmentsForTask(1240 * 1024 * 1024, 16).map((s, idx) => {
      // Simulate partial progress across segments
      const progressRatio = Math.min(1, 0.45 + (idx * 0.035));
      const current = Math.floor(s.startByte + (s.endByte - s.startByte) * progressRatio);
      return {
        ...s,
        currentByte: current,
        status: progressRatio >= 1 ? 'completed' : 'downloading',
        speed: (1.2 + (idx % 4) * 0.4) * 1024 * 1024,
      };
    }),
    category: 'video',
    addedAt: Date.now() - 36000,
    eta: 18,
    priority: 'high',
    saveFolder: 'C:\\Downloads\\Video',
    thumbnail: '/src/assets/images/video_stream_thumb_nature_1792147324489.jpg',
    videoPreviewUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  },
  {
    id: 'dl-102',
    filename: 'Hyper_Supercar_WindTunnel_Test.mp4',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    format: 'MP4',
    quality: '1080p Full HD',
    totalBytes: 480 * 1024 * 1024,
    downloadedBytes: 480 * 1024 * 1024,
    speed: 0,
    status: 'completed',
    threads: 8,
    segments: createSegmentsForTask(480 * 1024 * 1024, 8).map(s => ({
      ...s,
      currentByte: s.endByte,
      status: 'completed',
      speed: 0,
    })),
    category: 'video',
    addedAt: Date.now() - 140000,
    completedAt: Date.now() - 20000,
    eta: 0,
    priority: 'normal',
    saveFolder: 'C:\\Downloads\\Video',
    thumbnail: '/src/assets/images/video_stream_thumb_tech_1792147325301.jpg',
    videoPreviewUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
  },
  {
    id: 'dl-103',
    filename: 'Acoustic_Resonance_Podcast_Ep42.mp3',
    url: 'https://actions.google.com/sounds/v1/ambiences/rain_heavy.ogg',
    format: 'MP3',
    quality: '320 kbps HQ',
    totalBytes: 68 * 1024 * 1024,
    downloadedBytes: 32 * 1024 * 1024,
    speed: 5.4 * 1024 * 1024,
    status: 'downloading',
    threads: 8,
    segments: createSegmentsForTask(68 * 1024 * 1024, 8).map((s, idx) => {
      const progressRatio = Math.min(1, 0.35 + (idx * 0.05));
      const current = Math.floor(s.startByte + (s.endByte - s.startByte) * progressRatio);
      return {
        ...s,
        currentByte: current,
        status: progressRatio >= 1 ? 'completed' : 'downloading',
        speed: 0.68 * 1024 * 1024,
      };
    }),
    category: 'audio',
    addedAt: Date.now() - 15000,
    eta: 7,
    priority: 'normal',
    saveFolder: 'C:\\Downloads\\Music',
    thumbnail: '/src/assets/images/podcast_cover_art_1792147325292.jpg',
    videoPreviewUrl: 'https://actions.google.com/sounds/v1/ambiences/rain_heavy.ogg',
  },
  {
    id: 'dl-104',
    filename: 'HLS_Live_Stream_Archive.m3u8',
    url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    format: 'M3U8',
    quality: 'Adaptive 1080p',
    totalBytes: 310 * 1024 * 1024,
    downloadedBytes: 110 * 1024 * 1024,
    speed: 0,
    status: 'paused',
    threads: 8,
    segments: createSegmentsForTask(310 * 1024 * 1024, 8).map(s => ({
      ...s,
      currentByte: Math.floor(s.startByte + (s.endByte - s.startByte) * 0.35),
      status: 'idle',
      speed: 0,
    })),
    category: 'video',
    addedAt: Date.now() - 85000,
    eta: 0,
    priority: 'low',
    saveFolder: 'C:\\Downloads\\Video',
    thumbnail: '/src/assets/images/video_stream_thumb_nature_1792147324489.jpg',
  }
];
