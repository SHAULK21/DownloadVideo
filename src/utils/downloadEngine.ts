import { DownloadSegment, DownloadTask } from '../types';

const SEGMENT_COLORS = [
  '#0284c7', // sky
  '#0ea5e9', // light blue
  '#2563eb', // blue
  '#3b82f6', // bright blue
  '#06b6d4', // cyan
  '#14b8a6', // teal
  '#10b981', // emerald
  '#6366f1', // indigo
];

export function createSegmentsForTask(totalBytes: number, threadCount: number): DownloadSegment[] {
  const count = Math.max(1, Math.min(32, threadCount));
  const segmentSize = Math.floor(totalBytes / count);
  const segments: DownloadSegment[] = [];

  for (let i = 0; i < count; i++) {
    const startByte = i * segmentSize;
    const endByte = i === count - 1 ? totalBytes : (i + 1) * segmentSize - 1;
    segments.push({
      id: i + 1,
      startByte,
      endByte,
      currentByte: startByte,
      speed: 0,
      status: 'idle',
      color: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
    });
  }

  return segments;
}

export function playDownloadCompleteChime(): void {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    
    // Pleasant 2-tone IDM chime (D5 -> G5)
    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.2);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(783.99, now + 0.12); // G5
    gain2.gain.setValueAtTime(0.2, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.45);
  } catch (e) {
    // AudioContext might be restricted until user gesture
  }
}

/**
 * Advances a download task by a time tick delta
 */
export function stepDownloadTask(
  task: DownloadTask,
  deltaSec: number,
  globalSpeedCapKbps: number = 0
): { updatedTask: DownloadTask; completed: boolean } {
  if (task.status !== 'downloading') {
    return { updatedTask: task, completed: false };
  }

  const remainingTotal = task.totalBytes - task.downloadedBytes;
  if (remainingTotal <= 0) {
    return {
      updatedTask: {
        ...task,
        status: 'completed',
        speed: 0,
        eta: 0,
        downloadedBytes: task.totalBytes,
        completedAt: Date.now(),
      },
      completed: true,
    };
  }

  // Base bandwidth computation with multi-thread speedup multiplier:
  // Each thread provides additional acceleration up to a realistic saturated pipe (e.g. 15 - 45 MB/s)
  const threadMultiplier = Math.min(6, 1 + Math.log2(task.threads) * 0.85);
  let baseBandwidth = (3.5 + Math.random() * 2.5) * 1024 * 1024 * threadMultiplier; // ~15 - 35 MB/s

  if (globalSpeedCapKbps > 0) {
    baseBandwidth = Math.min(baseBandwidth, globalSpeedCapKbps * 1024);
  }

  let totalDeltaDownloaded = 0;
  const segments = [...task.segments];

  // Distribute across active segments
  const activeSegments = segments.filter(s => s.status !== 'completed');
  if (activeSegments.length === 0) {
    return {
      updatedTask: {
        ...task,
        status: 'completed',
        speed: 0,
        eta: 0,
        downloadedBytes: task.totalBytes,
        completedAt: Date.now(),
      },
      completed: true,
    };
  }

  const perSegmentTargetSpeed = baseBandwidth / activeSegments.length;

  for (let i = 0; i < segments.length; i++) {
    const seg = { ...segments[i] };
    const segRemaining = seg.endByte - seg.currentByte;

    if (segRemaining <= 0) {
      seg.status = 'completed';
      seg.speed = 0;
      segments[i] = seg;
      continue;
    }

    seg.status = 'downloading';
    // Add jitter per thread
    const jitter = 0.85 + Math.random() * 0.3;
    const segSpeed = perSegmentTargetSpeed * jitter;
    const segDelta = Math.min(segRemaining, segSpeed * deltaSec);

    seg.currentByte += segDelta;
    seg.speed = segDelta / deltaSec;
    totalDeltaDownloaded += segDelta;

    if (seg.currentByte >= seg.endByte) {
      seg.currentByte = seg.endByte;
      seg.status = 'completed';
      seg.speed = 0;
    }

    segments[i] = seg;
  }

  // IDM dynamic chunk splitting: if any idle thread exists while another segment has > 2MB remaining, split it!
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].status === 'completed') {
      // Find largest active segment
      let largestIdx = -1;
      let largestRemaining = 2 * 1024 * 1024; // min 2MB
      for (let j = 0; j < segments.length; j++) {
        if (segments[j].status === 'downloading') {
          const rem = segments[j].endByte - segments[j].currentByte;
          if (rem > largestRemaining) {
            largestRemaining = rem;
            largestIdx = j;
          }
        }
      }

      if (largestIdx !== -1) {
        // Split in half
        const donor = segments[largestIdx];
        const half = Math.floor((donor.endByte - donor.currentByte) / 2);
        const newStart = donor.currentByte + half;
        const oldEnd = donor.endByte;

        donor.endByte = newStart - 1;
        segments[largestIdx] = donor;

        segments[i] = {
          ...segments[i],
          startByte: newStart,
          currentByte: newStart,
          endByte: oldEnd,
          status: 'downloading',
          speed: perSegmentTargetSpeed * 0.9,
        };
      }
    }
  }

  const newDownloaded = Math.min(task.totalBytes, task.downloadedBytes + totalDeltaDownloaded);
  const currentSpeed = totalDeltaDownloaded / deltaSec;
  const newRemaining = task.totalBytes - newDownloaded;
  const eta = currentSpeed > 0 ? Math.ceil(newRemaining / currentSpeed) : 0;

  const isAllComplete = segments.every(s => s.status === 'completed') || newDownloaded >= task.totalBytes;

  return {
    updatedTask: {
      ...task,
      segments,
      downloadedBytes: newDownloaded,
      speed: isAllComplete ? 0 : currentSpeed,
      eta: isAllComplete ? 0 : eta,
      status: isAllComplete ? 'completed' : 'downloading',
      completedAt: isAllComplete ? Date.now() : undefined,
    },
    completed: isAllComplete,
  };
}
