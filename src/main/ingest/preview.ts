import { app } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import sharp from 'sharp';
import type { ImageFileType } from '../../shared/types';
import { exiftoolInstance } from '../exiftool/exiftool';

const THUMB_MAX  = 512;
const HIRES_MAX  = 4096;

// Bump whenever preview-generation logic changes (rotation, sizing, quality) so
// previously cached previews are invalidated instead of served stale. Without
// this, fixing the RAW rotation leaves old upside-down JPEGs cached on disk.
const PREVIEW_CACHE_VERSION = 2;

export function cacheDir(): string {
  return path.join(app.getPath('userData'), 'previews');
}

export function cacheKey(filePath: string): string {
  return crypto
    .createHash('sha1')
    .update(`v${PREVIEW_CACHE_VERSION}:${filePath}`)
    .digest('hex');
}

async function ensureCacheDir(): Promise<string> {
  const dir = cacheDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * EXIF Orientation → clockwise rotation degrees needed to display upright.
 * The embedded JPEG in Leica (and many other) DNGs has NO Orientation tag —
 * it is stored in raw sensor (landscape) orientation — so we must read the
 * Orientation from the DNG itself and apply an explicit rotation.
 */
// Standard EXIF Orientation → clockwise degrees to pass to sharp().rotate(deg).
// The embedded JPEG has no Orientation tag so we read it from the source RAW
// and apply an explicit rotation — verified correct for Leica SL2 (Orientation=8→270°).
export const EXIF_ORIENTATION_DEG: Record<number, number> = {
  1: 0,
  2: 0,   // mirror H — ignore mirror, only rotate
  3: 180,
  4: 180, // mirror V — treat as 180°
  5: 90,
  6: 90,  // camera rotated CCW (portrait right)
  7: 270,
  8: 270, // camera rotated CW  (portrait left)  ← Leica SL2 confirmed
};

async function readRawOrientationDeg(filePath: string): Promise<number> {
  try {
    const tags = await exiftoolInstance.read(filePath, ['Orientation']);
    const o = typeof tags.Orientation === 'number' ? tags.Orientation : 1;
    return EXIF_ORIENTATION_DEG[o] ?? 0;
  } catch {
    return 0;
  }
}

async function rawToJpegBuffer(filePath: string, rotateDeg: number): Promise<Buffer> {
  // rotateDeg comes from the source RAW's Orientation tag (the embedded JPEG has none).
  const tmp = path.join(os.tmpdir(), `ps_raw_${cacheKey(filePath)}.jpg`);

  try {
    await exiftoolInstance.extractJpgFromRaw(filePath, tmp);
    const buf = await fs.readFile(tmp);
    if (buf.length > 10_000) {
      return sharp(buf)
        .rotate(rotateDeg)  // explicit — no EXIF auto-detect (embedded JPEG has no tag)
        .resize(THUMB_MAX, THUMB_MAX, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
    }
  } catch {
    // embedded JPEG not available — fall through
  } finally {
    fs.unlink(tmp).catch(() => undefined);
  }

  // Fall back: sharp/libraw direct decode with explicit rotation.
  return sharp(filePath, { failOn: 'none' })
    .rotate(rotateDeg)
    .resize(THUMB_MAX, THUMB_MAX, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
}

export async function generatePreview(
  filePath: string,
  type: ImageFileType,
  orientationDeg?: number
): Promise<string> {
  const dir    = await ensureCacheDir();
  const outPath = path.join(dir, `${cacheKey(filePath)}.jpg`);

  // Return cached version if it exists.
  try {
    await fs.access(outPath);
    return outPath;
  } catch { /* not cached */ }

  let buf: Buffer;
  if (type === 'raw') {
    // Caller usually supplies the orientation (read alongside other metadata in
    // one exiftool call); fall back to a dedicated read only if it didn't.
    const rotateDeg = orientationDeg ?? (await readRawOrientationDeg(filePath));
    buf = await rawToJpegBuffer(filePath, rotateDeg);
  } else {
    buf = await sharp(filePath)
      .rotate()
      .resize(THUMB_MAX, THUMB_MAX, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
  }

  await fs.writeFile(outPath, buf);
  return outPath;
}

/**
 * Generate (or return cached) a high-resolution preview (up to 2048px).
 * Used by the split-view main image so it fills the screen sharply.
 */
export async function generateHiResPreview(
  filePath: string,
  type: ImageFileType
): Promise<string> {
  const dir     = await ensureCacheDir();
  const outPath = path.join(dir, `${cacheKey(filePath)}.hires.jpg`);

  try {
    await fs.access(outPath);
    return outPath;
  } catch { /* not cached */ }

  let buf: Buffer;
  if (type === 'raw') {
    const rotateDeg = await readRawOrientationDeg(filePath);
    const tmp = path.join(os.tmpdir(), `ps_raw_hr_${cacheKey(filePath)}.jpg`);
    try {
      await exiftoolInstance.extractJpgFromRaw(filePath, tmp);
      const raw = await fs.readFile(tmp);
      if (raw.length > 10_000) {
        buf = await sharp(raw)
          .rotate(rotateDeg)
          .resize(HIRES_MAX, HIRES_MAX, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 90 })
          .toBuffer();
      } else {
        throw new Error('embedded JPEG too small');
      }
    } catch {
      buf = await sharp(filePath, { failOn: 'none' })
        .rotate(rotateDeg)
        .resize(HIRES_MAX, HIRES_MAX, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 90 })
        .toBuffer();
    } finally {
      fs.unlink(tmp).catch(() => undefined);
    }
  } else {
    buf = await sharp(filePath)
      .rotate()
      .resize(HIRES_MAX, HIRES_MAX, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();
  }

  await fs.writeFile(outPath, buf);
  return outPath;
}

/** Clear all cached previews (call when user wants a fresh re-scan). */
export async function clearPreviewCache(): Promise<void> {
  const dir = cacheDir();
  try {
    const files = await fs.readdir(dir);
    await Promise.all(files.map((f) => fs.unlink(path.join(dir, f)).catch(() => undefined)));
  } catch { /* dir doesn't exist yet */ }
}

