import { exiftoolInstance } from '../exiftool/exiftool';
import type { PhotoImage } from '../../shared/types';
import { bucketBursts, type BurstItem, type BurstInfo } from '../../shared/burst';
import { EXIF_ORIENTATION_DEG } from './preview';

const DEFAULT_BURST_WINDOW_MS = 3_000;

export interface ImageMeta {
  ts: number;           // Unix ms, -1 if unknown
  rating?: number;      // 0–5 from XMP:Rating / EXIF Rating
  label?: string;       // xmp:Label (Green / Blue / Yellow / Red / …)
  orientationDeg: number; // clockwise rotation to display upright (0 if unknown)
}

/** Single exiftool call that reads timestamp + existing rating/label + orientation together. */
export async function readImageMeta(filePath: string): Promise<ImageMeta> {
  try {
    const tags = await exiftoolInstance.read(filePath, [
      'CreateDate', 'DateTimeOriginal', 'SubSecTimeOriginal',
      'Rating', 'XMP:Rating', 'Label', 'XMP:Label', 'Orientation',
    ]);

    // Timestamp
    const dt = tags.CreateDate ?? tags.DateTimeOriginal;
    let ts = -1;
    if (dt) {
      const d = typeof (dt as { toDate?: () => Date }).toDate === 'function'
        ? (dt as { toDate: () => Date }).toDate()
        : new Date(String(dt));
      const base = isNaN(d.getTime()) ? -1 : d.getTime();
      if (base >= 0) {
        const subSec = tags.SubSecTimeOriginal ? Number(tags.SubSecTimeOriginal) / 100 : 0;
        ts = base + subSec * 1000;
      }
    }

    // Rating: prefer XMP:Rating, fall back to EXIF Rating; ignore 0 (unrated)
    const rawRating = (tags as Record<string, unknown>)['XMP:Rating'] ?? tags.Rating;
    const rating = typeof rawRating === 'number' && rawRating > 0
      ? Math.min(5, Math.max(1, Math.round(rawRating)))
      : undefined;

    // Label
    const rawLabel = (tags as Record<string, unknown>)['XMP:Label'] ?? tags.Label;
    const label = typeof rawLabel === 'string' && rawLabel ? rawLabel : undefined;

    const orientation = typeof tags.Orientation === 'number' ? tags.Orientation : 1;
    const orientationDeg = EXIF_ORIENTATION_DEG[orientation] ?? 0;

    return { ts, rating, label, orientationDeg };
  } catch {
    return { ts: -1, orientationDeg: 0 };
  }
}

/** Kept for callers that only need the timestamp. */
export async function readTimestamp(filePath: string): Promise<number> {
  return (await readImageMeta(filePath)).ts;
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
