import type { PhotoImage, EyeStatus } from './types';

export interface WeightSet {
  sharpness: number;
  exposure: number;
  aesthetics: number;
}

export interface ScoringConfig {
  weights: WeightSet;
  portraitWeights: WeightSet;
  /** Power curve exponent applied to the 0–1 quality score before star mapping. */
  qualityPower: number;
  /** Normalization range for raw Laplacian-variance sharpness scores. */
  sharpness: { floor: number; ceil: number };
  /**
   * For portraits with a detected face: blend of face sharpness (this weight)
   * vs whole-image sharpness (1 - this weight). Default 0.7.
   */
  faceBlend: number;
  /** Max quality bonus awarded for bokeh (face sharper than background). Default 0.06. */
  bokehBonusMax: number;
  hardCaps: {
    /** Variance below this → image is severely blurry → capped at blurryMaxStars. */
    blurryVariance: number;
    blurryMaxStars: number;
    /** Stars deducted when eyes closed or bad expression detected. */
    closedEyesPenalty: number;
  };
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  weights:        { sharpness: 0.45, exposure: 0.35, aesthetics: 0.20 },
  portraitWeights:{ sharpness: 0.65, exposure: 0.10, aesthetics: 0.25 },
  qualityPower:   1.8,
  sharpness:      { floor: 50, ceil: 600 },
  faceBlend:      0.7,
  bokehBonusMax:  0.06,
  hardCaps: {
    blurryVariance:    50,
    blurryMaxStars:    2,
    closedEyesPenalty: 1,
  },
};

function normalizeSharpness(variance: number, cfg: ScoringConfig): number {
  const { floor, ceil } = cfg.sharpness;
  const clamped = Math.max(floor, Math.min(ceil, variance));
  return (clamped - floor) / (ceil - floor);
}

function computeQuality(
  sharpNorm: number,
  exposureScore: number,
  aestheticsScore: number | undefined,
  isPortrait: boolean,
  faceSharpNorm: number | undefined,
  bokehRatio: number | undefined,
  cfg: ScoringConfig,
): number {
  const weights = isPortrait ? cfg.portraitWeights : cfg.weights;
  const total = weights.sharpness + weights.exposure + weights.aesthetics;
  const w = {
    sharpness:  weights.sharpness  / total,
    exposure:   weights.exposure   / total,
    aesthetics: weights.aesthetics / total,
  };
  const aestheticNorm = aestheticsScore !== undefined ? (aestheticsScore - 1) / 9 : 0.5;
  const effectiveSharp = (isPortrait && faceSharpNorm !== undefined)
    ? faceSharpNorm * cfg.faceBlend + sharpNorm * (1 - cfg.faceBlend)
    : sharpNorm;
  const bokehBonus = (isPortrait && bokehRatio !== undefined && bokehRatio > 1)
    ? Math.min(cfg.bokehBonusMax, (bokehRatio - 1) * cfg.bokehBonusMax)
    : 0;
  return Math.min(1,
    w.sharpness  * effectiveSharp +
    w.exposure   * (exposureScore / 100) +
    w.aesthetics * aestheticNorm +
    bokehBonus
  );
}

export function recomputeStars(
  img: PhotoImage,
  cfg: ScoringConfig,
): { qualityScore: number; derivedStars: number } {
  if (img.sharpnessScore === undefined || img.exposureScore === undefined) {
    return {
      qualityScore: img.qualityScore ?? 0,
      derivedStars: img.derivedStars ?? 0,
    };
  }

  const sharpNorm     = normalizeSharpness(img.sharpnessScore, cfg);
  const faceSharpNorm = img.faceSharpnessScore !== undefined
    ? normalizeSharpness(img.faceSharpnessScore, cfg) : undefined;
  const isPortrait    = img.isPortrait ?? false;

  const quality = computeQuality(
    sharpNorm, img.exposureScore, img.aestheticsScore,
    isPortrait, faceSharpNorm, img.bokehRatio, cfg,
  );

  const { hardCaps } = cfg;
  const capVariance = (isPortrait && faceSharpNorm !== undefined)
    ? faceSharpNorm * (cfg.sharpness.ceil - cfg.sharpness.floor) + cfg.sharpness.floor
    : img.sharpnessScore;
  const blurryCap = capVariance < hardCaps.blurryVariance ? hardCaps.blurryMaxStars : 5;

  const curved = Math.pow(Math.max(0, quality), cfg.qualityPower);
  let stars    = Math.round(curved * 5);
  stars        = Math.min(stars, blurryCap);

  const eye: EyeStatus | undefined = img.eyeStatus;
  if (eye && eye.facesDetected > 0 && (!eye.allEyesOpen || eye.badExpression)) {
    stars = Math.max(0, stars - hardCaps.closedEyesPenalty);
  }
  if (img.burstRank !== undefined && img.burstRank > 1) {
    const burstCap = Math.max(0, 3 - (img.burstRank - 1));
    stars = Math.min(stars, burstCap);
  }

  return { qualityScore: quality, derivedStars: Math.max(0, Math.min(5, stars)) };
}
