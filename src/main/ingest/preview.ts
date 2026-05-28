import { app } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import sharp from 'sharp';
import type { ImageFileType } from '../../shared/types';
import { exiftoolInstance } from '../exiftool/exiftool';

const THUMB_MAX = 512;

export function cacheDir(): string {
  return path.join(app.getPath('userData'), 'previews');
}

export function cacheKey(filePath: string): string {
  return crypto.createHash('sha1').update(filePath).digest('hex');
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
async function rawToJpegBuffer(filePath: string): Promise<Buffer> {
  const tmp = path.join(os.tmpdir(), `ps_raw_${cacheKey(filePath)}.jpg`);
  try {
    // 1. Extract the embedded JPEG — the highest-quality preview the camera wrote.
    await exiftoolInstance.extractJpgFromRaw(filePath, tmp);

    // 2. The embedded JPEG usually has no Orientation tag (stored in sensor/landscape
    //    order). Copy the Orientation from the source RAW into the temp JPEG so that
    //    sharp().rotate() (no argument) can auto-correct it — works for any camera.
    const tags = await exiftoolInstance.read(filePath, ['Orientation']);
    const orientation = typeof tags.Orientation === 'number' ? tags.Orientation : 1;
    if (orientation !== 1) {
      await exiftoolInstance.write(tmp, { Orientation: orientation }, ['-overwrite_original']);
    }

    // 3. sharp().rotate() reads the EXIF Orientation we just wrote and corrects it.
    const buf = await fs.readFile(tmp);
    if (buf.length > 10_000) {
      return sharp(buf)
        .rotate()   // auto-orient from EXIF — universal for all cameras
        .resize(THUMB_MAX, THUMB_MAX, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
    }
  } catch {
    // embedded JPEG not available — fall through to direct libraw decode
  } finally {
    fs.unlink(tmp).catch(() => undefined);
  }

  // Fall back: sharp/libraw direct decode — also handles orientation via .rotate().
  return sharp(filePath)
    .rotate()
    .resize(THUMB_MAX, THUMB_MAX, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
}

export async function generatePreview(
  filePath: string,
  type: ImageFileType
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
    buf = await rawToJpegBuffer(filePath);
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

/** Clear all cached previews (call when user wants a fresh re-scan). */
export async function clearPreviewCache(): Promise<void> {
  const dir = cacheDir();
  try {
    const files = await fs.readdir(dir);
    await Promise.all(files.map((f) => fs.unlink(path.join(dir, f)).catch(() => undefined)));
  } catch { /* dir doesn't exist yet */ }
}

export interface PreviewResult {
  path: string;
  previewPath?: string;
  error?: string;
}

export async function generatePreviews(
  items: { path: string; type: ImageFileType }[],
  onResult: (result: PreviewResult) => void,
  concurrency = 4
): Promise<void> {
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const item = items[cursor++];
      try {
        const previewPath = await generatePreview(item.path, item.type);
        onResult({ path: item.path, previewPath });
      } catch (err) {
        onResult({ path: item.path, error: (err as Error).message });
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length || 1) }, worker);
  await Promise.all(workers);
}
