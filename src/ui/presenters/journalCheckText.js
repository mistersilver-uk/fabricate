/**
 * The run journal's words for a crafting check: the step label, the anchor it grades against and
 * the header's mode. A success-counting check (issue 2006) names its successes needed and die,
 * never its retained formula or a DC, and an executed count reads its net against the check's own
 * successes needed.
 */
import { resolveActiveCraftingCheckFormula } from '../../systems/checkModifierResolver.js';
import { activeCheckEvaluation, isFixedSumOver } from '../../systems/checkTarget.js';
import { countRequired } from '../../systems/countCheck.js';
import {
  normalizeList,
  numberOrNull,
  stringOrNull,
} from '../../systems/gatheringEngineInternals.js';
import { taskCountRequired } from '../../systems/runJournalOutcomeBands.js';

import { comparisonText } from './checkDescriptor.js';

// The crafting `resolutionMode` token is system-internal, so the Journal names it by these keys.
const MODE_LABEL_KEYS = Object.freeze({
  simple: 'FABRICATE.App.Journal.Mode.Standard',
  routedByIngredients: 'FABRICATE.App.Journal.Mode.RoutedByIngredients',
  routedByCheck: 'FABRICATE.App.Journal.Mode.RoutedByCheck',
  progressive: 'FABRICATE.App.Journal.Mode.Progressive',
  alchemy: 'FABRICATE.App.Journal.Mode.Alchemy',
});

/**
 * The header's mode label key, `fallback`'s for an unknown mode, else null. `simple` reads
 * "Standard (DC)" only for a check graded against a DC; `dcLess` reads "Standard" (issue 2133).
 */
export function journalModeLabelKey(mode, { dcLess = false, fallback = null } = {}) {
  const known = Object.hasOwn(MODE_LABEL_KEYS, mode) ? mode : fallback;
  if (known === 'simple' && dcLess) return 'FABRICATE.App.Journal.Mode.StandardCheck';
  return known ? MODE_LABEL_KEYS[known] : null;
}

/** A closed run's mode key: a count, roll-under or character-value record grades against no DC. */
export function historicalModeLabelKey(step) {
  const { mode, product, direction } = step?.resolutionSnapshot ?? {};
  const executed = Object.hasOwn(step?.lastCheckResult ?? {}, 'target');
  return journalModeLabelKey(mode, {
    dcLess: product === 'count' || direction === 'under' || executed,
  });
}

/** The recipe's active crafting check under `mode`, as its step label and mode label read it. */
export function journalActiveCheck({ system, recipe, mode }) {
  return {
    ...resolveActiveCraftingCheckFormula({ ...system, resolutionMode: mode }),
    recipe,
    mode,
  };
}

/** A live run's mode key from its active check, an unknown mode reading as `simple`. */
export function activeModeLabelKey({ mode, config }) {
  const dcLess = !isFixedSumOver(activeCheckEvaluation(config));
  return journalModeLabelKey(mode, { dcLess, fallback: 'simple' });
}

/**
 * `{ net, required, zeroPool }` from persisted count evidence. A pass/fail margin is taken from
 * the check's own count, so `required` is `total − margin`. A routed margin is taken from its
 * matched tier, so `required` is the current `need`'s count, as the step label states it, only
 * while the record agrees with it (issue 2133); a fixed range or a drifted record states none.
 */
export function executedCount(data, need = null) {
  const net = Number.isFinite(data?.total) ? data.total : null;
  const margin = Number.isFinite(data?.margin) ? data.margin : null;
  const derived = net !== null && margin !== null ? net - margin : null;
  const required = data?.type ? routedRequired(data, derived, need) : derived;
  return { net, required: required > 0 ? required : null, zeroPool: data?.zeroPool === true };
}

/** The need's count when the record's total less margin is that count plus its tier's offset. */
function routedRequired(data, derived, need) {
  if (data.type === 'fixed' || derived === null || !need) return null;
  const tier = need.outcomes.find((entry) => entry?.id === data.outcomeId);
  if (!tier) return null;
  return derived - (numberOrNull(tier.dc) ?? 0) === need.required ? need.required : null;
}

/** A routed count's current need: its successes needed and the tiers whose offsets it records. */
function routedCountNeed(routed, required) {
  if (!Number.isInteger(required)) return null;
  return { required, outcomes: normalizeList(routed?.relativeOutcomes) };
}

/** A routed gathering count's current need, from the task's override else the pool's. */
export function taskCountNeed(routed, task) {
  return routedCountNeed(routed, taskCountRequired(routed, task));
}

/** A recorded number, or null for anything else, a blank string included. */
export function recordedNumber(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  return typeof value === 'string' && value.trim() === '' ? null : numberOrNull(value);
}

/** Outside sum/over/fixed a roll names its executed target and margin, never a DC (issue 2005). */
export function executedTargetFields(data, need = null) {
  // A count's `target` is a per-die face: its line reads its net and required count (issue 2006).
  if (data.product === 'count') {
    return { target: null, margin: null, count: executedCount(data, need) };
  }
  if (data.direction !== 'under' && data.targetSource !== 'attribute') return null;
  return { target: recordedNumber(data.target), margin: recordedNumber(data.margin) };
}

/** A routed count check's current need before any macro, else null (a fixed range, a DC). */
export function journalCountNeeded(active) {
  const { config } = active;
  if (activeCheckEvaluation(config).product !== 'count' || config?.type === 'fixed') return null;
  return routedCountNeed(config, journalCheckAnchor(active));
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
