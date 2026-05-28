import sharp from 'sharp';
import type { ExposureHint } from '../../shared/types';

export interface ExposureResult {
  score: number;
  hint: ExposureHint;
}

export async function computeExposure(
  input: string | Buffer
): Promise<ExposureResult> {
  const { data } = await sharp(input)
    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (data.length === 0) return { score: 50, hint: 'ok' };
  return exposureFromGrey(data);
}

/** Exposure score + hint from an already-decoded greyscale raw buffer. */
export function computeExposureFromGrey(data: Buffer): ExposureResult {
  if (data.length === 0) return { score: 50, hint: 'ok' };
  return exposureFromGrey(data);
}

function exposureFromGrey(data: Buffer): ExposureResult {
  const histogram = new Uint32Array(256);
  for (let i = 0; i < data.length; i++) {
    histogram[data[i]]++;
  }

  const totalPixels = data.length;
  const highlightThreshold = 250;
  const shadowThreshold = 5;

  let highlightCount = 0;
  for (let i = highlightThreshold; i < 256; i++) {
    highlightCount += histogram[i];
  }

  let shadowCount = 0;
  for (let i = 0; i <= shadowThreshold; i++) {
    shadowCount += histogram[i];
  }

  const highlightClippingRatio = highlightCount / totalPixels;
  const shadowClippingRatio = shadowCount / totalPixels;

  let meanBrightness = 0;
  for (let i = 0; i < 256; i++) {
    meanBrightness += i * histogram[i];
  }
  meanBrightness = meanBrightness / totalPixels;

  let score = 100;

  const highlightClipThreshold = 0.02;
  const shadowClipThreshold = 0.02;

  if (highlightClippingRatio > highlightClipThreshold) {
    score -= Math.min(30, highlightClippingRatio * 500);
  }

  if (shadowClippingRatio > shadowClipThreshold) {
    score -= Math.min(30, shadowClippingRatio * 500);
  }

  const targetMean = 128;
  const meanDeviation = Math.abs(meanBrightness - targetMean);
  score -= meanDeviation * 0.2;

  score = Math.max(0, Math.min(100, score));

  let hint: ExposureHint = 'ok';

  if (highlightClippingRatio > highlightClipThreshold && meanBrightness > 160) {
    hint = 'overexposed';
  } else if (shadowClippingRatio > shadowClipThreshold && meanBrightness < 96) {
    hint = 'underexposed';
  }

  return { score, hint };
}
