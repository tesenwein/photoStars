import { existsSync, copyFileSync } from 'fs';
import { extname, dirname, basename, join } from 'path';
import { ImageFileType } from '../../shared/types';
import { runExiftool } from './exiftool';

export interface WriteRatingOptions {
  path: string;
  type: ImageFileType;
  stars: number;
  /** When true, copy JPEG/HEIC originals and RAW sidecars to <name>.bak before writing. */
  backup?: boolean;
}

function backupPath(filePath: string): string {
  return filePath + '.bak';
}

export async function writeRating(opts: WriteRatingOptions): Promise<void> {
  const { path, type, stars, backup = false } = opts;

  if (!Number.isInteger(stars) || stars < 0 || stars > 5) {
    throw new Error(`Invalid rating: stars must be an integer between 0 and 5, got ${stars}`);
  }

  const ratingTag = `-XMP:Rating=${stars}`;

  if (type === 'raw') {
    const dir = dirname(path);
    const base = basename(path, extname(path));
    const sidecarPath = join(dir, `${base}.xmp`);

    if (existsSync(sidecarPath)) {
      if (backup) copyFileSync(sidecarPath, backupPath(sidecarPath));
      await runExiftool([ratingTag, sidecarPath]);
    } else {
      await runExiftool(['-o', sidecarPath, ratingTag, path]);
    }
  } else {
    if (backup && existsSync(path)) copyFileSync(path, backupPath(path));
    await runExiftool(['-overwrite_original', ratingTag, path]);
  }
}
