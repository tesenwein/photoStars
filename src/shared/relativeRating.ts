import type { PhotoImage } from './types';

/** Fractions of the pool assigned to 5★,4★,3★,2★,1★ (best → worst). */
export type StarDistribution = [number, number, number, number, number];

export interface RelativeRatingOptions {
  distribution?: StarDistribution;
}

/** Default culling curve: ~10% get 5★, then 20/30/25/15% down to 1★. */
const DEFAULT_DISTRIBUTION: StarDistribution = [0.1, 0.2, 0.3, 0.25, 0.15];

// Penalties mirror src/main/scoring.config.json hardCaps so relative and
// absolute ratings agree on what counts as a reject.
const BLURRY_VARIANCE = 50;
const BLURRY_MAX_STARS = 2;
const CLOSED_EYES_PENALTY = 1;

const STAR_BUCKETS = [5, 4, 3, 2, 1];

function baseStarsForPercentile(pct: number, dist: StarDistribution): number {
  let cum = 0;
  for (let i = 0; i < dist.length; i++) {
    cum += dist[i];
    if (pct < cum) return STAR_BUCKETS[i];
  }
  return 1;
}

/**
 * Assigns stars to each image relative to the rest of the supplied set, so the
 * rating depends on how many images are available rather than absolute quality.
 *
 * Images are ranked by qualityScore (best first); each is placed into a star
 * bucket by its percentile within the pool, then blurry / closed-eye / burst
 * penalties are applied on top. Returns a path → stars map. Images without a
 * qualityScore yet (analysis pending) are omitted — callers fall back to
 * derivedStars for those.
 */
export function assignRelativeStars(
  images: PhotoImage[],
  opts: RelativeRatingOptions = {}
): Map<string, number> {
  const dist = opts.distribution ?? DEFAULT_DISTRIBUTION;
  const map = new Map<string, number>();

  const scored = images.filter((i) => typeof i.qualityScore === 'number');
  if (scored.length === 0) return map;

  const ranked = [...scored].sort((a, b) => {
    const dq = (b.qualityScore as number) - (a.qualityScore as number);
    if (dq !== 0) return dq;
    const ds = (b.sharpnessScore ?? 0) - (a.sharpnessScore ?? 0);
    if (ds !== 0) return ds;
    return a.path.localeCompare(b.path);
  });

  const total = ranked.length;
  ranked.forEach((img, idx) => {
    const pct = total <= 1 ? 0 : idx / total;
    let stars = baseStarsForPercentile(pct, dist);

    if (img.sharpnessScore !== undefined && img.sharpnessScore < BLURRY_VARIANCE) {
      stars = Math.min(stars, BLURRY_MAX_STARS);
    }
    const eye = img.eyeStatus;
    if (eye && eye.facesDetected > 0 && (!eye.allEyesOpen || eye.badExpression)) {
      stars = Math.max(0, stars - CLOSED_EYES_PENALTY);
    }
    if (img.burstRank !== undefined && img.burstRank > 1) {
      stars = Math.min(stars, Math.max(0, 3 - (img.burstRank - 1)));
    }

    map.set(img.path, Math.max(0, Math.min(5, stars)));
  });

  return map;
}
