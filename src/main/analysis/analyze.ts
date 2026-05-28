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

function normalizeSharpness(variance: number): number {
  const { floor, ceil } = config.sharpness;
  const clamped = Math.max(floor, Math.min(ceil, variance));
  return (clamped - floor) / (ceil - floor);
}

function deriveStars(
  sharpNorm: number,
  exposureScore: number,
  aestheticsScore: number | undefined,
  eyeStatus: EyeStatus | undefined
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

  let stars = Math.round(quality * 5);
  stars = Math.min(stars, blurryCap);

  // Penalty: faces detected but at least one eye closed.
  if (eyeStatus && eyeStatus.facesDetected > 0 && !eyeStatus.allEyesOpen) {
    stars = Math.max(1, stars - hardCaps.closedEyesPenalty);
  }

  return Math.max(0, Math.min(5, stars));
}

export async function analyzeImage(previewPath: string): Promise<AnalysisResult> {
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
    derivedStars: deriveStars(sharpNorm, exposure.score, aestheticsScore, eyeStatus),
  };
}
