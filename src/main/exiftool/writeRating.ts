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
}

function backupPath(filePath: string): string {
  return filePath + '.bak';
}

export async function writeRating(opts: WriteRatingOptions): Promise<void> {
  const { path, type, stars, backup = false } = opts;

  if (!Number.isInteger(stars) || stars < 0 || stars > 5) {
    throw new Error(`Invalid rating: stars must be an integer between 0 and 5, got ${stars}`);
  }

  if (type === 'raw') {
    const dir = dirname(path);
    const base = basename(path, extname(path));
    const sidecarPath = join(dir, `${base}.xmp`);

    if (existsSync(sidecarPath)) {
      if (backup) copyFileSync(sidecarPath, backupPath(sidecarPath));
      // Write to existing sidecar in-place.
      await exiftoolInstance.write(sidecarPath, { Rating: stars }, ['-overwrite_original']);
    } else {
      // Create sidecar: exiftool writes to a new file via -o.
      await exiftoolInstance.write(path, { Rating: stars }, ['-o', sidecarPath]);
    }
  } else {
    if (backup && existsSync(path)) copyFileSync(path, backupPath(path));
    await exiftoolInstance.write(path, { Rating: stars }, ['-overwrite_original']);
  }
}
