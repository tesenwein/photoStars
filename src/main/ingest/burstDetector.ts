import * as crypto from 'crypto';
import { exiftoolInstance } from '../exiftool/exiftool';
import type { PhotoImage } from '../../shared/types';

const DEFAULT_BURST_WINDOW_MS = 3_000;

interface Timestamped {
  path: string;
  ts: number; // Unix ms, or -1 if unknown
}

async function readTimestamp(filePath: string): Promise<number> {
  try {
    const tags = await exiftoolInstance.read(filePath, ['CreateDate', 'DateTimeOriginal', 'SubSecTimeOriginal']);
    const dt = tags.CreateDate ?? tags.DateTimeOriginal;
    if (!dt) return -1;
    // ExifDateTime has .toDate()
    const d = typeof (dt as { toDate?: () => Date }).toDate === 'function'
      ? (dt as { toDate: () => Date }).toDate()
      : new Date(String(dt));
    const base = isNaN(d.getTime()) ? -1 : d.getTime();
    if (base === -1) return -1;

    // Add sub-second precision if available
    const subSec = tags.SubSecTimeOriginal ? Number(tags.SubSecTimeOriginal) / 100 : 0;
    return base + subSec * 1000;
  } catch {
    return -1;
  }
}

function groupKey(ts: number, windowMs: number): string {
  const bucket = Math.floor(ts / windowMs) * windowMs;
  return crypto.createHash('sha1').update(String(bucket)).digest('hex').slice(0, 8);
}

/**
 * Reads EXIF timestamps for all images concurrently (bounded concurrency),
 * groups shots within BURST_WINDOW_MS of each other, and annotates each
 * PhotoImage with burstGroup / burstRank.
 *
 * Burst rank is assigned by file name order within the group (serves as a
 * stable proxy until scores are available; the UI re-ranks by score later).
 */
export async function detectBursts(
  images: PhotoImage[],
  burstWindowMs = DEFAULT_BURST_WINDOW_MS,
  concurrency = 8
): Promise<Map<string, { burstGroup: string; burstRank: number }>> {
  const result = new Map<string, { burstGroup: string; burstRank: number }>();
  if (images.length === 0) return result;

  // Read timestamps with bounded concurrency
  const timestamped: Timestamped[] = new Array(images.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < images.length) {
      const idx = cursor++;
      timestamped[idx] = {
        path: images[idx].path,
        ts: await readTimestamp(images[idx].path),
      };
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, images.length) }, worker));

  // Group by timestamp bucket
  const groups = new Map<string, string[]>();
  for (const t of timestamped) {
    if (t.ts === -1) continue;
    const key = groupKey(t.ts, burstWindowMs);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t.path);
  }

  // Only annotate groups with ≥2 images
  for (const [key, paths] of groups) {
    if (paths.length < 2) continue;
    paths.forEach((p, i) => {
      result.set(p, { burstGroup: key, burstRank: i + 1 });
    });
  }

  return result;
}
