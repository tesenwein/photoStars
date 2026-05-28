import * as fs from 'fs/promises';
import sharp from 'sharp';
import { computeSharpnessFromGrey, computeRegionSharpness } from './sharpness';
import { computeExposureFromGrey } from './exposure';
import { sidecar } from '../sidecar/sidecarManager';
import { readAnalysisCache, writeAnalysisCache } from './analysisCache';
import { isPortraitSubject } from './skinDetect';
import type { ExposureHint, EyeStatus } from '../../shared/types';
import * as config from '../scoring.config.json';

export interface AnalysisResult {
  sharpnessScore: number;
  exposureScore: number;
  exposureHint: ExposureHint;
  eyeStatus?: EyeStatus;
  aestheticsScore?: number;
  /** Laplacian variance inside the detected face region (portrait only). */
  faceSharpnessScore?: number;
  /** faceSharpness / wholeImageSharpness — >1 means subject is sharper than background. */
  bokehRatio?: number;
  /** True when faces or significant skin tones detected — uses portrait weights. */
  isPortrait?: boolean;
  /** Continuous 0–1 quality (pre-rounding) used for whole-shoot relative ranking. */
  qualityScore: number;
  derivedStars: number;
}

function normalizeSharpness(variance: number): number {
  const { floor, ceil } = config.sharpness;
  const clamped = Math.max(floor, Math.min(ceil, variance));
  return (clamped - floor) / (ceil - floor);
}

/** Weighted 0–1 quality from the per-feature scores; basis for both the
 * absolute star derivation and the relative whole-shoot ranking. */
function computeQuality(
  sharpNorm: number,
  exposureScore: number,
  aestheticsScore: number | undefined,
  isPortrait: boolean,
  faceSharpNorm?: number,
  bokehRatio?: number
): number {
  const weights = isPortrait ? config.portraitWeights : config.weights;
  const aestheticNorm = aestheticsScore !== undefined ? (aestheticsScore - 1) / 9 : 0.5;

  // For portraits with a detected face, blend whole-image sharpness (30%)
  // with face-region sharpness (70%) — a sharp face matters most.
  const effectiveSharp = (isPortrait && faceSharpNorm !== undefined)
    ? faceSharpNorm * 0.7 + sharpNorm * 0.3
    : sharpNorm;

  // Bokeh bonus: well-separated subject (face sharper than background) adds up to +0.06.
  const bokehBonus = (isPortrait && bokehRatio !== undefined && bokehRatio > 1)
    ? Math.min(0.06, (bokehRatio - 1) * 0.06)
    : 0;

  return Math.min(1,
    weights.sharpness * effectiveSharp +
    weights.exposure * (exposureScore / 100) +
    weights.aesthetics * aestheticNorm +
    bokehBonus
  );
}

function deriveStars(
  sharpNorm: number,
  exposureScore: number,
  aestheticsScore: number | undefined,
  eyeStatus: EyeStatus | undefined,
  burstRank: number | undefined,
  isPortrait: boolean,
  faceSharpNorm?: number,
  bokehRatio?: number
): number {
  const { hardCaps } = config;

  // Hard cap: severely blurry images are never above blurryMaxStars.
  // For portraits use face sharpness for the cap if available.
  const capVariance = (isPortrait && faceSharpNorm !== undefined)
    ? faceSharpNorm * (config.sharpness.ceil - config.sharpness.floor) + config.sharpness.floor
    : sharpNorm * (config.sharpness.ceil - config.sharpness.floor) + config.sharpness.floor;
  const blurryCap = capVariance < hardCaps.blurryVariance ? hardCaps.blurryMaxStars : 5;

  const quality = computeQuality(sharpNorm, exposureScore, aestheticsScore, isPortrait, faceSharpNorm, bokehRatio);

  // Power curve: compresses low-quality scores so most images land at 0–2★.
  const curved = Math.pow(Math.max(0, quality), config.qualityPower);
  let stars = Math.round(curved * 5);
  stars = Math.min(stars, blurryCap);

  // Penalty: faces present but eyes closed or bad expression.
  if (eyeStatus && eyeStatus.facesDetected > 0) {
    if (!eyeStatus.allEyesOpen || eyeStatus.badExpression) {
      stars = Math.max(0, stars - hardCaps.closedEyesPenalty);
    }
  }

  // Burst penalty: non-best shots are capped below the best slot.
  if (burstRank !== undefined && burstRank > 1) {
    const burstCap = Math.max(0, 3 - (burstRank - 1));
    stars = Math.min(stars, burstCap);
  }

  return Math.max(0, Math.min(5, stars));
}

export async function analyzeImage(previewPath: string, burstRank?: number): Promise<AnalysisResult> {
  let mtime = 0;
  try { mtime = (await fs.stat(previewPath)).mtimeMs; } catch { /* use 0 */ }

  const cached = await readAnalysisCache(previewPath, mtime);
  if (cached) {
    const sharpNorm     = normalizeSharpness(cached.sharpnessScore);
    const faceSharpNorm = cached.faceSharpnessScore !== undefined
      ? normalizeSharpness(cached.faceSharpnessScore) : undefined;
    const portrait = cached.isPortrait ?? false;
    cached.qualityScore = computeQuality(sharpNorm, cached.exposureScore, cached.aestheticsScore, portrait, faceSharpNorm, cached.bokehRatio);
    cached.derivedStars = deriveStars(
      sharpNorm, cached.exposureScore, cached.aestheticsScore,
      cached.eyeStatus, burstRank, portrait, faceSharpNorm, cached.bokehRatio
    );
    return cached;
  }

  // Decode the preview once into a greyscale raw buffer; sharpness and exposure
  // share it instead of each re-decoding the same JPEG through sharp.
  let sharpnessScore = 0;
  let exposure: { score: number; hint: ExposureHint } = { score: 50, hint: 'ok' };
  try {
    const { data, info } = await sharp(previewPath)
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (data.length > 0) {
      sharpnessScore = computeSharpnessFromGrey(data, info.width, info.height);
      exposure = computeExposureFromGrey(data);
    }
  } catch { /* decode failed — keep neutral defaults */ }

  const sharpNorm = normalizeSharpness(sharpnessScore);

  let eyeStatus: EyeStatus | undefined;
  let aestheticsScore: number | undefined;
  try {
    const combined = await sidecar.analyze(previewPath);
    eyeStatus = combined.eyeStatus;
    aestheticsScore = combined.aestheticsScore;
  } catch { /* sidecar unavailable */ }

  // Detect portrait subject via face detection or skin-tone fraction.
  const portrait = await isPortraitSubject(previewPath, eyeStatus?.facesDetected ?? 0);

  // Face-region sharpness + bokeh ratio (portrait only, when face bbox is available).
  let faceSharpnessScore: number | undefined;
  let bokehRatio: number | undefined;
  if (portrait && eyeStatus?.faceBbox) {
    try {
      faceSharpnessScore = await computeRegionSharpness(previewPath, eyeStatus.faceBbox);
      if (sharpnessScore > 0 && faceSharpnessScore > 0) {
        bokehRatio = faceSharpnessScore / sharpnessScore;
      }
    } catch { /* non-fatal */ }
  }
  const faceSharpNorm = faceSharpnessScore !== undefined
    ? normalizeSharpness(faceSharpnessScore) : undefined;

  const result: AnalysisResult = {
    sharpnessScore,
    exposureScore:      exposure.score,
    exposureHint:       exposure.hint,
    eyeStatus,
    aestheticsScore,
    faceSharpnessScore,
    bokehRatio,
    isPortrait:   portrait,
    qualityScore: computeQuality(sharpNorm, exposure.score, aestheticsScore, portrait, faceSharpNorm, bokehRatio),
    derivedStars: deriveStars(sharpNorm, exposure.score, aestheticsScore, eyeStatus, burstRank, portrait, faceSharpNorm, bokehRatio),
  };

  void writeAnalysisCache(previewPath, mtime, result);
  return result;
}
