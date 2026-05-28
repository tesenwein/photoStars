import * as fs from 'fs/promises';
import { computeSharpness } from './sharpness';
import { computeExposure } from './exposure';
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
  /** True when faces or significant skin tones detected — uses portrait weights. */
  isPortrait?: boolean;
  derivedStars: number;
}

function normalizeSharpness(variance: number): number {
  const { floor, ceil } = config.sharpness;
  const clamped = Math.max(floor, Math.min(ceil, variance));
  return (clamped - floor) / (ceil - floor);
}

function deriveStars(
  sharpNorm: number,
  exposureScore: number,
  aestheticsScore: number | undefined,
  eyeStatus: EyeStatus | undefined,
  burstRank: number | undefined,
  isPortrait: boolean
): number {
  const { hardCaps } = config;

  // Portrait shots use reduced exposure weight — moody/dark lighting is intentional.
  const weights = isPortrait ? config.portraitWeights : config.weights;

  // Hard cap: severely blurry images are never above blurryMaxStars.
  const rawVariance = sharpNorm * (config.sharpness.ceil - config.sharpness.floor) + config.sharpness.floor;
  const blurryCap = rawVariance < hardCaps.blurryVariance ? hardCaps.blurryMaxStars : 5;

  const aestheticNorm = aestheticsScore !== undefined ? (aestheticsScore - 1) / 9 : 0.5;
  const quality =
    weights.sharpness * sharpNorm +
    weights.exposure  * (exposureScore / 100) +
    weights.aesthetics * aestheticNorm;

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
    const sharpNorm = normalizeSharpness(cached.sharpnessScore);
    cached.derivedStars = deriveStars(
      sharpNorm, cached.exposureScore, cached.aestheticsScore,
      cached.eyeStatus, burstRank, cached.isPortrait ?? false
    );
    return cached;
  }

  const [sharpnessScore, exposure] = await Promise.all([
    computeSharpness(previewPath),
    computeExposure(previewPath),
  ]);

  const sharpNorm = normalizeSharpness(sharpnessScore);

  let eyeStatus: EyeStatus | undefined;
  let aestheticsScore: number | undefined;
  try {
    [eyeStatus, aestheticsScore] = await Promise.all([
      sidecar.analyzeFaceEye(previewPath),
      sidecar.analyzeAesthetics(previewPath),
    ]);
  } catch { /* sidecar unavailable */ }

  // Detect portrait subject via face detection or skin-tone fraction.
  const portrait = await isPortraitSubject(previewPath, eyeStatus?.facesDetected ?? 0);

  const result: AnalysisResult = {
    sharpnessScore,
    exposureScore:  exposure.score,
    exposureHint:   exposure.hint,
    eyeStatus,
    aestheticsScore,
    isPortrait:   portrait,
    derivedStars: deriveStars(sharpNorm, exposure.score, aestheticsScore, eyeStatus, burstRank, portrait),
  };

  void writeAnalysisCache(previewPath, mtime, result);
  return result;
}
