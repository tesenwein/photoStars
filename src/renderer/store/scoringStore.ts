import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type ScoringConfig, DEFAULT_SCORING_CONFIG } from '../../shared/scoring';

interface ScoringStore {
  config: ScoringConfig;
  setConfig: (patch: Partial<ScoringConfig>) => void;
  setWeights: (weights: Partial<ScoringConfig['weights']>) => void;
  setPortraitWeights: (weights: Partial<ScoringConfig['portraitWeights']>) => void;
  setHardCaps: (caps: Partial<ScoringConfig['hardCaps']>) => void;
  setSharpnessRange: (range: Partial<ScoringConfig['sharpness']>) => void;
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
      reset: () => set({ config: DEFAULT_SCORING_CONFIG }),
    }),
    { name: 'photostars-scoring-config' }
  )
);
