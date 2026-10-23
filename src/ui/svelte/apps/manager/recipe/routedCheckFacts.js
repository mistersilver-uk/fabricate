/**
 * What the recipe editor reads off a system's routed check: every tier with its bounds, the
 * evaluation `routedMinimum` takes its direction from, and a fixed check's gaps.
 */
import { activeCheckEvaluation } from '../../../../../systems/checkTarget.js';
import { routedOutcomeTierRows } from '../../../../../utils/routedOutcomeKeywords.js';
import { fixedTierGaps } from '../checks/checkRangeGaps.js';

/** `{ tiers, evaluation, gaps }` for `routed`; a relative or absent check has no gaps. */
export function routedCheckFacts(routed) {
  return {
    tiers: routedOutcomeTierRows(routed),
    evaluation: activeCheckEvaluation(routed),
    gaps: routed?.type === 'fixed' ? fixedTierGaps(routed.fixedOutcomes) : [],
  };
}
