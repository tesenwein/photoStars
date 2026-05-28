import { app } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import sharp from 'sharp';
import type { ImageFileType } from '../../shared/types';
import { exiftoolInstance } from '../exiftool/exiftool';

const THUMB_MAX = 512;

function cacheDir(): string {
  return path.join(app.getPath('userData'), 'previews');
}

function cacheKey(filePath: string): string {
  return crypto.createHash('sha1').update(filePath).digest('hex');
}

async function ensureCacheDir(): Promise<string> {
  const dir = cacheDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Get a JPEG buffer for any image file.
 * - JPEG/HEIC: sharp reads directly.
 * - RAW/DNG: try sharp (libvips + libraw), then fall back to exiftool embedded preview.
 */
async function toJpegBuffer(filePath: string, type: ImageFileType): Promise<Buffer> {
  if (type !== 'raw') {
    return sharp(filePath)
      .rotate()
      .resize(THUMB_MAX, THUMB_MAX, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
  }

  // RAW: try sharp/libraw first (handles DNG, many other RAW formats).
  try {
    const buf = await sharp(filePath)
      .rotate()
      .resize(THUMB_MAX, THUMB_MAX, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    if (buf.length > 1000) return buf;
  } catch {
    // fall through to exiftool
  }

  // Fall back: extract embedded JPEG preview via exiftool-vendored.
  const tmpFile = path.join(await ensureCacheDir(), `__raw_${cacheKey(filePath)}.jpg`);
  try {
    // extractJpgFromRaw writes the embedded JPEG to tmpFile.
    await exiftoolInstance.extractJpgFromRaw(filePath, tmpFile);
    const raw = await fs.readFile(tmpFile);
    if (raw.length > 1000) {
      return sharp(raw).rotate()
        .resize(THUMB_MAX, THUMB_MAX, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
    }
  } finally {
    fs.unlink(tmpFile).catch(() => undefined);
  }

  throw new Error(`Cannot generate preview for ${path.basename(filePath)}`);
}

export async function generatePreview(
  filePath: string,
  type: ImageFileType
): Promise<string> {
  const dir = await ensureCacheDir();
  const outPath = path.join(dir, `${cacheKey(filePath)}.jpg`);

  try {
    await fs.access(outPath);
    return outPath; // already cached
  } catch {
    // not cached yet
  }

  const buf = await toJpegBuffer(filePath, type);
  await fs.writeFile(outPath, buf);
  return outPath;
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
