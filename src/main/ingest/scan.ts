import * as fs from 'fs/promises';
import * as path from 'path';
import type { ImageFileType, PhotoImage } from '../../shared/types';

const RAW_EXTS = new Set([
  '.cr2', '.cr3', '.nef', '.nrw', '.arw', '.sr2', '.srf', '.raf', '.rw2',
  '.orf', '.dng', '.pef', '.raw', '.rwl', '.iiq', '.3fr', '.erf', '.mef', '.mos',
]);
const JPEG_EXTS = new Set(['.jpg', '.jpeg', '.jpe']);
const HEIC_EXTS = new Set(['.heic', '.heif']);

function classify(ext: string): ImageFileType | undefined {
  const e = ext.toLowerCase();
  if (RAW_EXTS.has(e)) return 'raw';
  if (JPEG_EXTS.has(e)) return 'jpeg';
  if (HEIC_EXTS.has(e)) return 'heic';
  return undefined;
}

export async function scanFolder(folder: string): Promise<PhotoImage[]> {
  const out: PhotoImage[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        const type = classify(path.extname(entry.name));
        if (type) {
          out.push({ path: full, name: entry.name, type, written: false });
        }
      }
    }
  }

  await walk(folder);
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}
