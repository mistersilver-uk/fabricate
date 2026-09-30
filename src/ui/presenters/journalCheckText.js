/**
 * The run journal's words for a crafting check: the step label and the anchor it grades against.
 * A success-counting check (issue 2006) names its successes needed and die, never its retained
 * formula or a DC, and an executed count reads its net against the required count its margin was
 * taken from.
 */
import { activeCheckEvaluation, isFixedSumOver } from '../../systems/checkTarget.js';
import { countRequired } from '../../systems/countCheck.js';
import { normalizeList, stringOrNull } from '../../systems/gatheringEngineInternals.js';

import { comparisonText } from './checkDescriptor.js';

/**
 * `{ net, required, zeroPool }` from persisted count evidence, `required` being `total − margin`
 * above zero. A routed result's margin is taken from its matched tier, so it states no required.
 */
export function executedCount(data) {
  const net = Number.isFinite(data?.total) ? data.total : null;
  const margin = Number.isFinite(data?.margin) && !data.type ? data.margin : null;
  const required = net !== null && margin !== null ? net - margin : null;
  return { net, required: required > 0 ? required : null, zeroPool: data?.zeroPool === true };
}

/**
 * The number a check grades against before any macro: the recipe's selected tier, else the
 * config's static DC, or for a count the tier's successes needed, else the pool's, never a DC.
 * A dynamic-DC macro and a progressive (value-budget) check have none.
 */
export function journalCheckAnchor({ config, recipe, mode }) {
  if (mode === 'progressive') return null;
  if (config?.dcMode === 'dynamic') return null;
  const tierId = stringOrNull(recipe?.checkTierId);
  const tier = tierId && normalizeList(config?.tiers).find((entry) => entry?.id === tierId);
  const evaluation = activeCheckEvaluation(config);
  if (evaluation.product === 'count') return countRequired(evaluation, tier?.successes);
  const tierDc = Number(tier?.dc);
  if (Number.isFinite(tierDc)) return Math.trunc(tierDc);
  const dc = Number(config?.dc);
  return Number.isFinite(dc) ? Math.trunc(dc) : null;
}

/** `{n} successes needed · d{die}s`, or the die alone where no required count applies. */
function countCheckLabel({ config, evaluation, required }, localize) {
  const die = evaluation.pool.die;
  if (!Number.isFinite(required) || config?.type === 'fixed') {
    return localize('FABRICATE.App.Journal.StepDetails.Count.CheckDie', { die });
  }
  return required === 1
    ? localize('FABRICATE.App.Journal.StepDetails.Count.CheckOne', { die })
    : localize('FABRICATE.App.Journal.StepDetails.Count.Check', { count: required, die });
}

/**
 * The step's check label: `rollFormula` with the resolved DC only (no skill name is stored), the
 * formula alone where no DC resolves. Outside sum/over/fixed a fixed target is named a Target and
 * a character value names no number; a count names its successes needed.
 */
export function journalCheckLabel({ config, rollFormula, recipe, mode }, localize) {
  const evaluation = activeCheckEvaluation(config);
  const dc = journalCheckAnchor({ config, recipe, mode });
  if (config && evaluation.product === 'count') {
    return countCheckLabel({ config, evaluation, required: dc }, localize);
  }
  const formula = stringOrNull(rollFormula);
  if (!formula) return null;
  if (dc === null) return formula;
  if (isFixedSumOver(evaluation)) {
    return localize('FABRICATE.App.Journal.StepDetails.CheckWithDc', { formula, dc });
  }
  // A character value states no number, and a fixed range grades the raw roll against no target.
  if (evaluation.target.source === 'attribute' || config?.type === 'fixed') return formula;
  return localize('FABRICATE.App.Journal.StepDetails.CheckWithTarget', {
    formula,
    target: dc,
    comparison: comparisonText(evaluation, config, localize),
  });
}
