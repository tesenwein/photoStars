import { app } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
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
 * For RAW files we prefer the embedded JPEG (extractJpgFromRaw).
 * This is more reliable for orientation since the embedded JPEG carries its own
 * EXIF Orientation tag, whereas libraw's DNG decode can interact with sharp's
 * .rotate() in unexpected ways (especially Orientation=8 on Leica files).
 */
async function rawToJpegBuffer(filePath: string, tmpDir: string): Promise<Buffer> {
  const tmp = path.join(tmpDir, `__raw_${cacheKey(filePath)}.jpg`);

  // Try embedded JpgFromRaw first (Leica SL2: ~1 MB, good quality).
  try {
    await exiftoolInstance.extractJpgFromRaw(filePath, tmp);
    const buf = await fs.readFile(tmp);
    if (buf.length > 10_000) {
      return sharp(buf)
        .rotate()  // apply EXIF orientation from the embedded JPEG
        .resize(THUMB_MAX, THUMB_MAX, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
    }
  } catch {
    // embedded JPEG not available
  } finally {
    fs.unlink(tmp).catch(() => undefined);
  }

  // Fall back: let sharp/libraw decode the raw data directly.
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
    buf = await rawToJpegBuffer(filePath, dir);
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
