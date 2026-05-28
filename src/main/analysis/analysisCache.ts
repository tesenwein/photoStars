import * as fs from 'fs/promises';
import * as path from 'path';
import { cacheDir, cacheKey } from '../ingest/preview';
import type { AnalysisResult } from './analyze';

const CACHE_VERSION = 4; // bump to invalidate old cached results

interface CacheEntry {
  version: number;
  mtime: number;
  result: AnalysisResult;
}

function cacheFile(filePath: string): string {
  return path.join(cacheDir(), `${cacheKey(filePath)}.analysis.json`);
}

export async function readAnalysisCache(
  filePath: string,
  mtime: number
): Promise<AnalysisResult | null> {
  try {
    const raw = await fs.readFile(cacheFile(filePath), 'utf8');
    const entry = JSON.parse(raw) as CacheEntry;
    if (entry.version === CACHE_VERSION && entry.mtime === mtime) {
      return entry.result;
    }
  } catch { /* miss */ }
  return null;
}

export async function writeAnalysisCache(
  filePath: string,
  mtime: number,
  result: AnalysisResult
): Promise<void> {
  const entry: CacheEntry = { version: CACHE_VERSION, mtime, result };
  try {
    await fs.writeFile(cacheFile(filePath), JSON.stringify(entry));
  } catch { /* non-fatal */ }
}
