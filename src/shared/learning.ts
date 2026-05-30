import type { CorrectionRecord } from './ipc';
import type { ScoringConfig, WeightSet } from './scoring';
import { DEFAULT_SCORING_CONFIG } from './scoring';
import type { StarDistribution } from './relativeRating';

/**
 * Turns the persisted manual-rating corrections (see {@link CorrectionRecord})
 * into a personalised scoring model: feature weights that match the user's
 * taste, the star distribution they actually use, and a confidence signal from
 * how well the learned weights reproduce their burst picks.
 *
 * Design choices that make this robust rather than overfit:
 *  - Ridge regression regularised **toward the default weights** (the prior),
 *    not toward zero. With few samples the fit barely moves; it personalises
 *    gradually as evidence accumulates. λ is high so a handful of corrections
 *    can't swing the model wildly.
 *  - Weights are clamped non-negative and renormalised to sum to 1, so they
 *    drop straight into {@link ScoringConfig.weights} / portraitWeights.
 *  - Portrait and non-portrait samples are fit separately when each side has
 *    enough data; otherwise that side keeps its default.
 *  - Everything is pure: no electron / fs / Date deps, so it is unit-testable
 *    and runnable in either process.
 */

/** Minimum samples per weight-set before we trust a personalised fit. */
export const MIN_SAMPLES = 25;
/** Minimum total samples before we trust a learned star distribution. */
export const MIN_DISTRIBUTION_SAMPLES = 40;
/** Ridge strength: pull toward the default weights. Higher = more conservative. */
const RIDGE_LAMBDA = 8;

export interface LearnedModel {
  weights: WeightSet;
  portraitWeights: WeightSet;
  distribution: StarDistribution;
  /** Total usable correction samples. */
  sampleCount: number;
  /** Portrait subset size. */
  portraitSampleCount: number;
  /** Whether each part was personalised or left at the default. */
  weightsPersonalised: boolean;
  portraitWeightsPersonalised: boolean;
  distributionPersonalised: boolean;
  /** 0–1: fraction of burst pairs whose ordering the learned weights reproduce.
   * undefined when there aren't enough burst pairs to measure. */
  burstAgreement?: number;
}

interface FeatureRow {
  /** Normalised features in the same space as computeQuality. */
  sharp: number;
  exposure: number;
  aesthetic: number;
  /** Inverse-power-curve target derived from the user's chosen stars, 0–1. */
  target: number;
  isPortrait: boolean;
  burstGroup?: string;
  userStars: number;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function normalizeSharpness(variance: number, cfg: ScoringConfig): number {
  const { floor, ceil } = cfg.sharpness;
  return clamp01((Math.max(floor, Math.min(ceil, variance)) - floor) / (ceil - floor));
}

/** Build the regression rows, dropping records without the core features. */
function toRows(records: CorrectionRecord[], cfg: ScoringConfig): FeatureRow[] {
  const rows: FeatureRow[] = [];
  for (const r of records) {
    if (r.sharpnessScore === undefined || r.exposureScore === undefined) continue;
    const isPortrait = r.isPortrait ?? false;
    const wholeSharp = normalizeSharpness(r.sharpnessScore, cfg);
    const sharp =
      isPortrait && r.faceSharpnessScore !== undefined
        ? normalizeSharpness(r.faceSharpnessScore, cfg) * cfg.faceBlend +
          wholeSharp * (1 - cfg.faceBlend)
        : wholeSharp;
    const aesthetic =
      r.aestheticsScore !== undefined ? clamp01((r.aestheticsScore - 1) / 9) : 0.5;
    // Invert the power curve so the regression target lives in the same linear
    // quality space the weights combine into.
    const q = clamp01(r.userStars / 5);
    const target = Math.pow(q, 1 / cfg.qualityPower);
    rows.push({
      sharp,
      exposure: clamp01(r.exposureScore / 100),
      aesthetic,
      target,
      isPortrait,
      burstGroup: r.burstGroup,
      userStars: r.userStars,
    });
  }
  return rows;
}

/** Solve a small symmetric linear system A x = b by Gaussian elimination. */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const m = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    }
    [m[col], m[pivot]] = [m[pivot], m[col]];
    const pv = m[col][col];
    if (Math.abs(pv) < 1e-9) continue;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col] / pv;
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c];
    }
  }
  return m.map((row, i) => (Math.abs(m[i][i]) < 1e-9 ? 0 : row[n] / m[i][i]));
}

/**
 * Ridge regression of target ≈ w·[sharp, exposure, aesthetic], regularised
 * toward the prior weight set. Minimises ‖Xw − y‖² + λ‖w − w₀‖².
 * Returns weights clamped ≥0 and renormalised to sum 1.
 */
function fitWeightSet(rows: FeatureRow[], prior: WeightSet): WeightSet {
  const total = prior.sharpness + prior.exposure + prior.aesthetics;
  const w0 = [prior.sharpness / total, prior.exposure / total, prior.aesthetics / total];

  // Normal equations with Tikhonov term centred on the prior.
  const XtX = [
    [RIDGE_LAMBDA, 0, 0],
    [0, RIDGE_LAMBDA, 0],
    [0, 0, RIDGE_LAMBDA],
  ];
  const Xty = [RIDGE_LAMBDA * w0[0], RIDGE_LAMBDA * w0[1], RIDGE_LAMBDA * w0[2]];
  for (const row of rows) {
    const x = [row.sharp, row.exposure, row.aesthetic];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) XtX[i][j] += x[i] * x[j];
      Xty[i] += x[i] * row.target;
    }
  }
  const raw = solve(XtX, Xty).map((v) => Math.max(0, v));
  const sum = raw[0] + raw[1] + raw[2];
  if (sum < 1e-9) return prior;
  return { sharpness: raw[0] / sum, exposure: raw[1] / sum, aesthetics: raw[2] / sum };
}

/** Star distribution the user actually applies, blended toward the default by
 * how much data we have (shrinkage), so a thin dataset stays near the default. */
function learnDistribution(
  rows: FeatureRow[],
  prior: StarDistribution
): { dist: StarDistribution; personalised: boolean } {
  if (rows.length < MIN_DISTRIBUTION_SAMPLES) return { dist: prior, personalised: false };
  // buckets index 0..4 → 5★..1★ to match relativeRating's STAR_BUCKETS order.
  const counts = [0, 0, 0, 0, 0];
  for (const r of rows) {
    const stars = Math.max(1, Math.min(5, Math.round(r.userStars)));
    counts[5 - stars] += 1;
  }
  const n = rows.length;
  const empirical = counts.map((c) => c / n) as StarDistribution;
  // Shrinkage weight grows with sample size, capped so we never fully trust it.
  const k = Math.min(0.75, n / (n + 200));
  const blended = empirical.map((e, i) => k * e + (1 - k) * prior[i]) as StarDistribution;
  const s = blended.reduce((a, b) => a + b, 0);
  return { dist: blended.map((v) => v / s) as StarDistribution, personalised: true };
}

/** Among burst groups, count how many within-group rating orderings the learned
 * weights reproduce (predicted quality ranks the same pick higher). */
function burstAgreement(rows: FeatureRow[], weights: WeightSet): number | undefined {
  const groups = new Map<string, FeatureRow[]>();
  for (const r of rows) {
    if (!r.burstGroup) continue;
    const g = groups.get(r.burstGroup) ?? [];
    g.push(r);
    groups.set(r.burstGroup, g);
  }
  let agree = 0;
  let pairs = 0;
  const score = (r: FeatureRow): number =>
    weights.sharpness * r.sharp + weights.exposure * r.exposure + weights.aesthetics * r.aesthetic;
  for (const members of groups.values()) {
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const a = members[i];
        const b = members[j];
        if (a.userStars === b.userStars) continue; // no preference to reproduce
        pairs += 1;
        const userPrefersA = a.userStars > b.userStars;
        const modelPrefersA = score(a) >= score(b);
        if (userPrefersA === modelPrefersA) agree += 1;
      }
    }
  }
  return pairs === 0 ? undefined : agree / pairs;
}

/** Fit the full personalised model from the persisted corrections. */
export function fitModel(
  records: CorrectionRecord[],
  baseCfg: ScoringConfig = DEFAULT_SCORING_CONFIG,
  defaultDistribution?: StarDistribution
): LearnedModel {
  const rows = toRows(records, baseCfg);
  const portraitRows = rows.filter((r) => r.isPortrait);
  const nonPortraitRows = rows.filter((r) => !r.isPortrait);

  const weightsPersonalised = nonPortraitRows.length >= MIN_SAMPLES;
  const portraitWeightsPersonalised = portraitRows.length >= MIN_SAMPLES;

  const weights = weightsPersonalised
    ? fitWeightSet(nonPortraitRows, baseCfg.weights)
    : baseCfg.weights;
  const portraitWeights = portraitWeightsPersonalised
    ? fitWeightSet(portraitRows, baseCfg.portraitWeights)
    : baseCfg.portraitWeights;

  const prior = defaultDistribution ?? [0.1, 0.2, 0.3, 0.25, 0.15];
  const { dist, personalised: distributionPersonalised } = learnDistribution(rows, prior);

  return {
    weights,
    portraitWeights,
    distribution: dist,
    sampleCount: rows.length,
    portraitSampleCount: portraitRows.length,
    weightsPersonalised,
    portraitWeightsPersonalised,
    distributionPersonalised,
    burstAgreement: weightsPersonalised ? burstAgreement(rows, weights) : undefined,
  };
}
