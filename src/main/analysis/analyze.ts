import { computeSharpness } from './sharpness';
import { computeExposure } from './exposure';
import { sidecar } from '../sidecar/sidecarManager';
import type { ExposureHint, EyeStatus } from '../../shared/types';
import * as config from '../scoring.config.json';

export interface AnalysisResult {
  sharpnessScore: number;
  exposureScore: number;
  exposureHint: ExposureHint;
  eyeStatus?: EyeStatus;
  aestheticsScore?: number;
  derivedStars: number;
}

/** burstRank 1 = best slot in burst (no penalty), 2+ = progressively capped. */

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
  burstRank: number | undefined
): number {
  const { weights, hardCaps } = config;

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

  // Burst penalty: non-best shots in a burst are capped below the best slot.
  if (burstRank !== undefined && burstRank > 1) {
    const burstCap = Math.max(0, 3 - (burstRank - 1)); // rank2→2, rank3→1, rank4+→0
    stars = Math.min(stars, burstCap);
  }

  return Math.max(0, Math.min(5, stars));
}

export async function analyzeImage(previewPath: string, burstRank?: number): Promise<AnalysisResult> {
  const [sharpnessScore, exposure] = await Promise.all([
    computeSharpness(previewPath),
    computeExposure(previewPath),
  ]);

  const sharpNorm = normalizeSharpness(sharpnessScore);

  // Sidecar calls are best-effort; failures degrade gracefully.
  let eyeStatus: EyeStatus | undefined;
  let aestheticsScore: number | undefined;

  try {
    [eyeStatus, aestheticsScore] = await Promise.all([
      sidecar.analyzeFaceEye(previewPath),
      sidecar.analyzeAesthetics(previewPath),
    ]);
  } catch {
    // Sidecar not installed or failed — continue without face/aesthetics data.
  }

  return {
    sharpnessScore,
    exposureScore: exposure.score,
    exposureHint: exposure.hint,
    eyeStatus,
    aestheticsScore,
    derivedStars: deriveStars(sharpNorm, exposure.score, aestheticsScore, eyeStatus, burstRank),
  };
}
