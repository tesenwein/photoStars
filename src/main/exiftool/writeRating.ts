import { existsSync, copyFileSync } from 'fs';
import { extname, dirname, basename, join } from 'path';
import type { ImageFileType } from '../../shared/types';
import { exiftoolInstance } from './exiftool';

export interface WriteRatingOptions {
  path: string;
  type: ImageFileType;
  stars: number;
  /** Copy original/sidecar to <name>.bak before overwriting. */
  backup?: boolean;
  /** Lightroom xmp:Label color string (e.g. 'Green', 'Red', ''). */
  lrLabel?: string;
  /** Lightroom xmp:PickLabel: 1=picked, 0=unflagged, -1=rejected. */
  lrPickLabel?: number;
}

function backupPath(filePath: string): string {
  return filePath + '.bak';
}

export async function writeRating(opts: WriteRatingOptions): Promise<void> {
  const { path, type, stars, backup = false, lrLabel, lrPickLabel } = opts;

  if (!Number.isInteger(stars) || stars < 0 || stars > 5) {
    throw new Error(`Invalid rating: stars must be an integer between 0 and 5, got ${stars}`);
  }

  const tags: Record<string, unknown> = { Rating: stars };
  if (lrLabel !== undefined) tags['Label'] = lrLabel;
  if (lrPickLabel !== undefined) tags['PickLabel'] = lrPickLabel;

  if (type === 'raw') {
    const dir = dirname(path);
    const base = basename(path, extname(path));
    const sidecarPath = join(dir, `${base}.xmp`);

    if (existsSync(sidecarPath)) {
      if (backup) copyFileSync(sidecarPath, backupPath(sidecarPath));
      await exiftoolInstance.write(sidecarPath, tags, ['-overwrite_original']);
    } else {
      await exiftoolInstance.write(path, tags, ['-o', sidecarPath]);
    }
  } else {
    if (backup && existsSync(path)) copyFileSync(path, backupPath(path));
    await exiftoolInstance.write(path, tags, ['-overwrite_original']);
  }
}
