import sharp from 'sharp';

export async function computeSharpness(input: string | Buffer): Promise<number> {
  const metadata = await sharp(input).metadata();
  if (!metadata.width || !metadata.height) {
    return 0;
  }

  const maxSize = 1024;
  let width = metadata.width;
  let height = metadata.height;

  if (width > maxSize || height > maxSize) {
    const scale = Math.min(maxSize / width, maxSize / height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const { data } = await sharp(input)
    .resize(width, height, { fit: 'inside', withoutEnlargement: true })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const laplacianValues: number[] = [];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const centerIdx = y * width + x;
      const topIdx = (y - 1) * width + x;
      const bottomIdx = (y + 1) * width + x;
      const leftIdx = y * width + (x - 1);
      const rightIdx = y * width + (x + 1);

      const center = data[centerIdx];
      const top = data[topIdx];
      const bottom = data[bottomIdx];
      const left = data[leftIdx];
      const right = data[rightIdx];

      const laplacian = 4 * center - top - bottom - left - right;
      laplacianValues.push(laplacian);
    }
  }

  if (laplacianValues.length === 0) {
    return 0;
  }

  const mean = laplacianValues.reduce((a, b) => a + b, 0) / laplacianValues.length;
  const variance =
    laplacianValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
    laplacianValues.length;

  return variance;
}
