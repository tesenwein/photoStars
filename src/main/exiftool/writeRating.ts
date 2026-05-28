import { existsSync } from 'fs';
import { extname, dirname, basename, join } from 'path';
import { ImageFileType } from '../../shared/types';
import { runExiftool } from './exiftool';

export async function writeRating(opts: { path: string; type: ImageFileType; stars: number }): Promise<void> {
  const { path, type, stars } = opts;

  if (!Number.isInteger(stars) || stars < 0 || stars > 5) {
    throw new Error(`Invalid rating: stars must be an integer between 0 and 5, got ${stars}`);
  }

  const ratingTag = `-XMP:Rating=${stars}`;

  if (type === 'raw') {
    const dir = dirname(path);
    const base = basename(path, extname(path));
    const sidecarPath = join(dir, `${base}.xmp`);

    if (existsSync(sidecarPath)) {
      await runExiftool([ratingTag, sidecarPath]);
    } else {
      await runExiftool(['-o', sidecarPath, ratingTag, path]);
    }
  } else {
    await runExiftool(['-overwrite_original', ratingTag, path]);
  }
}
