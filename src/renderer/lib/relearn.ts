import { fitModel, type LearnedModel } from '../../shared/learning';
import { useScoringStore } from '../store/scoringStore';

/**
 * Reads the persisted rating corrections, fits a personalised scoring model
 * against the current config, and applies it when there's enough data to trust.
 * Returns the fitted model (even when not yet personalised) so callers can show
 * progress. Safe to call silently — the fit is regularised toward the defaults.
 */
export async function relearnAndApply(): Promise<LearnedModel> {
  const { config, applyLearnedModel } = useScoringStore.getState();
  const records = await window.api.readCorrections();
  const model = fitModel(records, config);
  if (model.weightsPersonalised || model.portraitWeightsPersonalised) {
    applyLearnedModel(model);
  }
  return model;
}
