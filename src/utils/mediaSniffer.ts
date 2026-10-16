import { MediaCategory, SniffedMediaStream } from '../types';

export const DEMO_PRESET_MEDIA: SniffedMediaStream[] = [
  {
    id: 'stream-underwater-4k',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    title: 'Bioluminescent Reef & Exotic Fauna (4K Ultra HD)',
    format: 'mp4',
    category: 'video',
    quality: '4K UHD (2160p 60fps)',
    resolution: '3840x2160',
    fps: 60,
    filesize: 1240 * 1024 * 1024, // 1.24 GB
    mimeType: 'video/mp4',
    thumbnail: '/src/assets/images/video_stream_thumb_nature_1792147324489.jpg',
    sourcePageTitle: 'StreamVerse - Nature Cinema',
    sourcePageUrl: 'https://streamverse.io/watch/ocean-depths-4k',
    codec: 'HEVC / H.265 / AAC 320k',
    hasAudio: true,
    hasVideo: true,
  },
  {
    id: 'stream-supercar-1080p',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    title: 'Hyper-Speed Supercar Aerodynamic Tunnel Test',
    format: 'mp4',
    category: 'video',
    quality: 'Full HD (1080p 60fps)',
    resolution: '1920x1080',
    fps: 60,
    filesize: 480 * 1024 * 1024, // 480 MB
    mimeType: 'video/mp4',
    thumbnail: '/src/assets/images/video_stream_thumb_tech_1792147325301.jpg',
    sourcePageTitle: 'TechTube - Aero Dynamics Lab',
    sourcePageUrl: 'https://techtube.video/v/hyper-aero-2026',
    codec: 'AVC / H.264 / AAC 256k',
    hasAudio: true,
    hasVideo: true,
  },
  {
    id: 'stream-hls-master',
    url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    title: 'Adaptive Live Broadcast Stream (HLS Master M3U8)',
    format: 'm3u8',
    category: 'video',
    quality: 'Adaptive Multi-Bitrate (1080p-360p)',
    resolution: '1920x1080',
    fps: 30,
    filesize: 310 * 1024 * 1024, // ~310 MB
    mimeType: 'application/vnd.apple.mpegurl',
    thumbnail: '/src/assets/images/video_stream_thumb_nature_1792147324489.jpg',
    sourcePageTitle: 'LiveBroadcast News 24/7',
    sourcePageUrl: 'https://streamlive.net/channel/live-feed',
    codec: 'HLS TS Chunks / H.264',
    hasAudio: true,
    hasVideo: true,
  },
  {
    id: 'stream-podcast-audio',
    url: 'https://actions.google.com/sounds/v1/ambiences/rain_heavy.ogg',
    title: 'Acoustic Resonance - Episode #42: Soundscapes in Motion',
    format: 'mp3',
    category: 'audio',
    quality: 'Hi-Res Audio 320 kbps (48kHz)',
    filesize: 68 * 1024 * 1024, // 68 MB
    mimeType: 'audio/mpeg',
    thumbnail: '/src/assets/images/podcast_cover_art_1792147325292.jpg',
    sourcePageTitle: 'SoundPulse Podcasts',
    sourcePageUrl: 'https://soundpulse.audio/episodes/acoustic-resonance-42',
    codec: 'MPEG Audio Layer 3 (MP3)',
    hasAudio: true,
    hasVideo: false,
  },
  {
    id: 'stream-openmovie-tearsofsteel',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    title: 'Blender Foundation: Tears of Steel (Sci-Fi Short)',
    format: 'mp4',
    category: 'video',
    quality: 'Quad HD (1440p)',
    resolution: '2560x1440',
    fps: 24,
    filesize: 780 * 1024 * 1024,
    mimeType: 'video/mp4',
    thumbnail: '/src/assets/images/video_stream_thumb_tech_1792147325301.jpg',
    sourcePageTitle: 'Vimeo Creator Showcase',
    sourcePageUrl: 'https://vimeo.com/channels/blender/tearsofsteel',
    codec: 'AV1 / Opus',
    hasAudio: true,
    hasVideo: true,
  }
];

export function detectCategoryFromFormat(extOrMime: string): MediaCategory {
  const lower = extOrMime.toLowerCase();
  if (['mp4', 'm3u8', 'webm', 'mkv', 'mov', 'flv', 'avi', 'ts', 'video'].some(s => lower.includes(s))) {
    return 'video';
  }
  if (['mp3', 'm4a', 'aac', 'flac', 'wav', 'ogg', 'opus', 'audio'].some(s => lower.includes(s))) {
    return 'audio';
  }
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].some(s => lower.includes(s))) {
    return 'compressed';
  }
  if (['exe', 'msi', 'dmg', 'pkg', 'apk', 'iso', 'deb', 'rpm'].some(s => lower.includes(s))) {
    return 'programs';
  }
  if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'epub', 'txt'].some(s => lower.includes(s))) {
    return 'documents';
  }
  return 'video';
}

export function extractFilenameFromUrl(url: string, defaultName = 'download'): string {
  try {
    const cleanUrl = url.split('?')[0].split('#')[0];
    const parts = cleanUrl.split('/');
    const lastPart = parts[parts.length - 1];
    if (lastPart && lastPart.includes('.')) {
      return decodeURIComponent(lastPart);
    }
  } catch (e) {
    console.warn('Could not parse filename from url:', e);
  }
  return `${defaultName}.mp4`;
}

/**
 * Expands batch URL patterns, e.g. "https://site.com/video_[01-08].mp4"
 */
export function expandBatchUrlPattern(pattern: string): string[] {
  const match = pattern.match(/\[(\d+)-(\d+)\]/);
  if (!match) {
    return [pattern.trim()];
  }

  const [fullMatch, startStr, endStr] = match;
  const start = parseInt(startStr, 10);
  const end = parseInt(endStr, 10);
  const padLength = startStr.length;

  const results: string[] = [];
  const minVal = Math.min(start, end);
  const maxVal = Math.max(start, end);
  // Cap at 100 to prevent runaway batches
  const limit = Math.min(maxVal, minVal + 99);

  for (let i = minVal; i <= limit; i++) {
    const numStr = String(i).padStart(padLength, '0');
    results.push(pattern.replace(fullMatch, numStr).trim());
  }
  return results;
}

/**
 * Intelligent media sniffer for a given URL.
 * Generates available streams/resolutions (4K, 1080p, 720p, 480p, MP3 audio).
 */
export function analyzeMediaUrl(inputUrl: string): SniffedMediaStream[] {
  const url = inputUrl.trim();
  const lower = url.toLowerCase();
  const filename = extractFilenameFromUrl(url);
  const baseName = filename.replace(/\.[^/.]+$/, "") || "Video Stream";
  const cat = detectCategoryFromFormat(lower);

  // If already matches demo
  const preset = DEMO_PRESET_MEDIA.find(p => p.url === url);
  if (preset) {
    return [preset];
  }

  // If direct audio
  if (cat === 'audio') {
    return [
      {
        id: `sniff-${Date.now()}-audio-hq`,
        url,
        title: `${baseName} (High Quality Audio)`,
        format: 'mp3',
        category: 'audio',
        quality: '320 kbps (HQ Audio)',
        filesize: 45 * 1024 * 1024,
        mimeType: 'audio/mpeg',
        codec: 'AAC / MP3',
        hasAudio: true,
        hasVideo: false,
      }
    ];
  }

  // If direct archive or program
  if (cat === 'compressed' || cat === 'programs' || cat === 'documents') {
    const ext = filename.split('.').pop() || 'dat';
    return [
      {
        id: `sniff-${Date.now()}-${ext}`,
        url,
        title: filename,
        format: ext as any,
        category: cat,
        quality: 'Original File',
        filesize: 185 * 1024 * 1024,
        mimeType: 'application/octet-stream',
        hasAudio: false,
        hasVideo: false,
      }
    ];
  }

  // For video or webpage URLs, return comprehensive multi-stream options (like IDM's video panel)
  return [
    {
      id: `sniff-${Date.now()}-4k`,
      url,
      title: `${baseName} [4K UHD]`,
      format: 'mp4',
      category: 'video',
      quality: '4K UHD (2160p 60fps)',
      resolution: '3840x2160',
      fps: 60,
      filesize: 1150 * 1024 * 1024,
      mimeType: 'video/mp4',
      codec: 'AV1 / HEVC + Opus',
      hasAudio: true,
      hasVideo: true,
    },
    {
      id: `sniff-${Date.now()}-1080p`,
      url,
      title: `${baseName} [Full HD]`,
      format: 'mp4',
      category: 'video',
      quality: 'Full HD (1080p)',
      resolution: '1920x1080',
      fps: 60,
      filesize: 420 * 1024 * 1024,
      mimeType: 'video/mp4',
      codec: 'AVC / H.264 + AAC',
      hasAudio: true,
      hasVideo: true,
    },
    {
      id: `sniff-${Date.now()}-720p`,
      url,
      title: `${baseName} [HD]`,
      format: 'mp4',
      category: 'video',
      quality: 'HD (720p)',
      resolution: '1280x720',
      fps: 30,
      filesize: 195 * 1024 * 1024,
      mimeType: 'video/mp4',
      codec: 'AVC / H.264 + AAC',
      hasAudio: true,
      hasVideo: true,
    },
    {
      id: `sniff-${Date.now()}-m3u8`,
      url: url.endsWith('.m3u8') ? url : `${url}.m3u8`,
      title: `${baseName} [HLS Master Playlist]`,
      format: 'm3u8',
      category: 'video',
      quality: 'HLS Live Stream (Auto)',
      filesize: 290 * 1024 * 1024,
      mimeType: 'application/x-mpegURL',
      codec: 'TS Segments / HLS',
      hasAudio: true,
      hasVideo: true,
    },
    {
      id: `sniff-${Date.now()}-audio-extract`,
      url,
      title: `${baseName} [Audio Track Only]`,
      format: 'm4a',
      category: 'audio',
      quality: 'Audio M4A / AAC (256 kbps)',
      filesize: 38 * 1024 * 1024,
      mimeType: 'audio/mp4',
      codec: 'AAC Stereo 48kHz',
      hasAudio: true,
      hasVideo: false,
    }
  ];
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function formatSpeed(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec, 1)}/s`;
}

export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0 || !isFinite(seconds)) return '--:--';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}h ${mins}m ${secs}s`;
  }
  return `${mins}m ${secs}s`;
}
