import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type ScoringConfig, DEFAULT_SCORING_CONFIG } from '../../shared/scoring';
import type { LearnedModel } from '../../shared/learning';
import type { StarDistribution } from '../../shared/relativeRating';

interface ScoringStore {
  config: ScoringConfig;
  /** Personalised star distribution for relative rating; undefined = use default. */
  distribution?: StarDistribution;
  /** Metadata about the last learned fit, for the settings UI. */
  learnedModel?: LearnedModel;
  setConfig: (patch: Partial<ScoringConfig>) => void;
  setWeights: (weights: Partial<ScoringConfig['weights']>) => void;
  setPortraitWeights: (weights: Partial<ScoringConfig['portraitWeights']>) => void;
  setHardCaps: (caps: Partial<ScoringConfig['hardCaps']>) => void;
  setSharpnessRange: (range: Partial<ScoringConfig['sharpness']>) => void;
  /** Apply a freshly fit personalised model to the active scoring config. */
  applyLearnedModel: (model: LearnedModel) => void;
  reset: () => void;
}

export const useScoringStore = create<ScoringStore>()(
  persist(
    (set) => ({
      config: DEFAULT_SCORING_CONFIG,
      setConfig: (patch) =>
        set((s) => ({ config: { ...s.config, ...patch } })),
      setWeights: (weights) =>
        set((s) => ({ config: { ...s.config, weights: { ...s.config.weights, ...weights } } })),
      setPortraitWeights: (weights) =>
        set((s) => ({ config: { ...s.config, portraitWeights: { ...s.config.portraitWeights, ...weights } } })),
      setHardCaps: (caps) =>
        set((s) => ({ config: { ...s.config, hardCaps: { ...s.config.hardCaps, ...caps } } })),
      setSharpnessRange: (range) =>
        set((s) => ({ config: { ...s.config, sharpness: { ...s.config.sharpness, ...range } } })),
      applyLearnedModel: (model) =>
        set((s) => ({
          config: {
            ...s.config,
            weights: model.weights,
            portraitWeights: model.portraitWeights,
          },
          distribution: model.distributionPersonalised ? model.distribution : s.distribution,
          learnedModel: model,
        })),
      reset: () => set({ config: DEFAULT_SCORING_CONFIG, distribution: undefined, learnedModel: undefined }),
    }),
    { name: 'photostars-scoring-config' }
  )
);
