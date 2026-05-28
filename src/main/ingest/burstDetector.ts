import { exiftoolInstance } from '../exiftool/exiftool';
import type { PhotoImage } from '../../shared/types';
import { bucketBursts, type BurstItem, type BurstInfo } from '../../shared/burst';

const DEFAULT_BURST_WINDOW_MS = 3_000;

export async function readTimestamp(filePath: string): Promise<number> {
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

/**
 * Reads EXIF capture timestamps for all images with bounded concurrency.
 * Returned ts is Unix ms, or -1 when unknown.
 */
export async function readTimestamps(
  images: PhotoImage[],
  concurrency = 8
): Promise<BurstItem[]> {
  const items: BurstItem[] = new Array(images.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < images.length) {
      const idx = cursor++;
      items[idx] = { path: images[idx].path, ts: await readTimestamp(images[idx].path) };
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, images.length || 1) }, worker));
  return items;
}

/**
 * Reads timestamps then groups shots within burstWindowMs into bursts.
 * Bucketing itself is delegated to the pure shared helper so the renderer can
 * re-bucket the same way when the burst-window slider changes.
 */
export async function detectBursts(
  images: PhotoImage[],
  burstWindowMs = DEFAULT_BURST_WINDOW_MS,
  concurrency = 8
): Promise<Map<string, BurstInfo>> {
  if (images.length === 0) return new Map();
  const items = await readTimestamps(images, concurrency);
  return bucketBursts(items, burstWindowMs);
}
