import { describe, it, expect } from 'vitest';
import { fitModel, MIN_SAMPLES } from './learning';
import { DEFAULT_SCORING_CONFIG } from './scoring';
import type { CorrectionRecord } from './ipc';

function record(p: Partial<CorrectionRecord> & { userStars: number }): CorrectionRecord {
  return {
    ts: 0,
    path: `img-${Math.round(p.userStars * 1000)}`,
    sharpnessScore: 300,
    exposureScore: 70,
    aestheticsScore: 5,
    isPortrait: false,
    ...p,
  };
}

describe('fitModel', () => {
  it('keeps defaults when there are too few samples', () => {
    const records = Array.from({ length: 5 }, () => record({ userStars: 5 }));
    const model = fitModel(records, DEFAULT_SCORING_CONFIG);
    expect(model.weightsPersonalised).toBe(false);
    expect(model.weights).toEqual(DEFAULT_SCORING_CONFIG.weights);
    expect(model.sampleCount).toBe(5);
  });

  it('learns to weight the feature that actually drives the user ratings', () => {
    // Build a dataset where stars track aesthetics and ignore sharpness:
    // high-aesthetic images get 5★, low-aesthetic get 1★, sharpness held constant.
    const records: CorrectionRecord[] = [];
    for (let i = 0; i < MIN_SAMPLES + 5; i++) {
      const high = i % 2 === 0;
      records.push(
        record({
          userStars: high ? 5 : 1,
          aestheticsScore: high ? 9 : 2,
          sharpnessScore: 300, // constant → uninformative
          exposureScore: 60, // constant → uninformative
        })
      );
    }
    const model = fitModel(records, DEFAULT_SCORING_CONFIG);
    expect(model.weightsPersonalised).toBe(true);
    // Aesthetics should be pulled up above its 0.20 default share.
    expect(model.weights.aesthetics).toBeGreaterThan(DEFAULT_SCORING_CONFIG.weights.aesthetics);
    // Weights stay a valid normalised distribution.
    const sum = model.weights.sharpness + model.weights.exposure + model.weights.aesthetics;
    expect(sum).toBeCloseTo(1, 5);
    expect(model.weights.sharpness).toBeGreaterThanOrEqual(0);
  });

  it('reports burst agreement when burst pairs exist', () => {
    const records: CorrectionRecord[] = [];
    for (let i = 0; i < MIN_SAMPLES + 5; i++) {
      const high = i % 2 === 0;
      // Two frames per burst group with differing aesthetics and ratings.
      records.push(
        record({
          userStars: high ? 5 : 1,
          aestheticsScore: high ? 9 : 2,
          burstGroup: `burst-${Math.floor(i / 2)}`,
        })
      );
    }
    const model = fitModel(records, DEFAULT_SCORING_CONFIG);
    expect(model.burstAgreement).toBeDefined();
    expect(model.burstAgreement!).toBeGreaterThan(0.8);
  });
});
