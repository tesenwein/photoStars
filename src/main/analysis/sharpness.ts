import sharp from 'sharp';

/** Laplacian variance of a pre-loaded raw greyscale pixel buffer.
 * Single streaming pass (sum + sum-of-squares) — avoids allocating a
 * per-pixel array and a second reduce pass over megapixel-sized images. */
function laplacianVariance(data: Buffer, width: number, height: number): number {
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const c = y * width + x;
      const lap = 4 * data[c] - data[(y-1)*width+x] - data[(y+1)*width+x] - data[y*width+(x-1)] - data[y*width+(x+1)];
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/** Laplacian variance from an already-decoded greyscale raw buffer. */
export function computeSharpnessFromGrey(data: Buffer, width: number, height: number): number {
  return laplacianVariance(data, width, height);
}

/**
 * Sharpness of a normalised sub-region (0–1 coords) of an image.
 * Returns 0 if the region is too small to measure.
 */
export async function computeRegionSharpness(
  input: string,
  roi: { x: number; y: number; w: number; h: number }
): Promise<number> {
  const meta = await sharp(input).metadata();
  if (!meta.width || !meta.height) return 0;
  const left   = Math.max(0, Math.round(roi.x * meta.width));
  const top    = Math.max(0, Math.round(roi.y * meta.height));
  const width  = Math.min(Math.round(roi.w * meta.width),  meta.width  - left);
  const height = Math.min(Math.round(roi.h * meta.height), meta.height - top);
  if (width < 16 || height < 16) return 0;
  const { data, info } = await sharp(input)
    .extract({ left, top, width, height })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return laplacianVariance(data, info.width, info.height);
}

export async function computeSharpness(input: string | Buffer): Promise<number> {
  const metadata = await sharp(input).metadata();
  if (!metadata.width || !metadata.height) return 0;

  const maxSize = 1024;
  const scale = Math.min(1, maxSize / Math.max(metadata.width, metadata.height));
  const width  = Math.round(metadata.width  * scale);
  const height = Math.round(metadata.height * scale);

  const { data, info } = await sharp(input)
    .resize(width, height, { fit: 'inside', withoutEnlargement: true })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return laplacianVariance(data, info.width, info.height);
}
