import { computeSharpness } from './sharpness';
import { computeExposure } from './exposure';
import type { ExposureHint } from '../../shared/types';

export interface AnalysisResult {
  sharpnessScore: number;
  exposureScore: number;
  exposureHint: ExposureHint;
  derivedStars: number;
}

// Laplacian variance below this reads as clearly soft/out-of-focus on a
// 512px preview; above the upper bound is reliably crisp. Calibrate in Phase 6.
const SHARP_FLOOR = 50;
const SHARP_CEIL = 600;

function normalizeSharpness(variance: number): number {
  const clamped = Math.max(SHARP_FLOOR, Math.min(SHARP_CEIL, variance));
  return (clamped - SHARP_FLOOR) / (SHARP_CEIL - SHARP_FLOOR);
}

/**
 * Provisional star recommendation from the hard filters only. Phase 5 replaces
 * this with the weighted combination that also factors eyes and aesthetics.
 */
function deriveStars(sharpNorm: number, exposureScore: number): number {
  const quality = 0.6 * sharpNorm + 0.4 * (exposureScore / 100);
  return Math.round(quality * 5);
}

export async function analyzeImage(previewPath: string): Promise<AnalysisResult> {
  const [sharpnessScore, exposure] = await Promise.all([
    computeSharpness(previewPath),
    computeExposure(previewPath),
  ]);

  const sharpNorm = normalizeSharpness(sharpnessScore);
  return {
    sharpnessScore,
    exposureScore: exposure.score,
    exposureHint: exposure.hint,
    derivedStars: deriveStars(sharpNorm, exposure.score),
  };
}
