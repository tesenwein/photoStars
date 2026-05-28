import { app } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import sharp from 'sharp';
import type { ImageFileType } from '../../shared/types';
import { runExiftool } from '../exiftool/exiftool';

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
 * RAW previews carry rotation only as metadata, so the embedded JPEG must be
 * re-oriented explicitly or it renders sideways.
 */
async function extractRawPreview(filePath: string): Promise<Buffer> {
  const { stdout } = await runExiftool([
    '-b',
    '-PreviewImage',
    '-JpgFromRaw',
    filePath,
  ]);
  const buf = Buffer.from(stdout, 'binary');
  if (buf.length === 0) {
    throw new Error(`No embedded preview found in ${filePath}`);
  }
  return buf;
}

export async function generatePreview(
  filePath: string,
  type: ImageFileType
): Promise<string> {
  const dir = await ensureCacheDir();
  const outPath = path.join(dir, `${cacheKey(filePath)}.jpg`);

  try {
    await fs.access(outPath);
    return outPath;
  } catch {
    // not cached yet
  }

  const source: string | Buffer = type === 'raw' ? await extractRawPreview(filePath) : filePath;

  await sharp(source)
    .rotate()
    .resize(THUMB_MAX, THUMB_MAX, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toFile(outPath);

  return outPath;
}

export interface PreviewResult {
  path: string;
  previewPath?: string;
  error?: string;
}

/**
 * Generate previews in bounded-concurrency batches so a large folder does not
 * spawn thousands of sharp/exiftool processes at once and freeze the app.
 */
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

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, worker);
  await Promise.all(workers);
}
