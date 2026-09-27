/**
 * Resolves a check's pre-modifier target from explicit inputs. It reads no Actor, recipe,
 * component, task or macro: callers pass the roll data, the fixed anchor and the chosen adjustment.
 */
import { localizeWith } from '../utils/localizeWithFallback.js';

import { resolveDeterministicExpression } from './checkEvaluation.js';
import { normalizeCheckEvaluation } from './normalize/checkEvaluation.js';

/** The refusal reasons runtime, preview and readiness share; count evaluation (#2004) extends it. */
export const CHECK_TARGET_REFUSALS = Object.freeze([
  'expression-missing',
  'unresolved-path',
  'non-finite',
  'dice',
  'invalid',
  'adjustment-invalid',
  'progressive-under',
  'formula-empty',
]);

/** Each refusal's sentence key and English fallback detail, after "{label} check cannot roll: ". */
const REFUSAL_COPY = Object.freeze({
  'expression-missing': [
    'FABRICATE.Check.TargetRefusal.ExpressionMissing',
    'no target formula is set',
  ],
  'unresolved-path': [
    'FABRICATE.Check.TargetRefusal.UnresolvedPath',
    'the character value its target reads was not found',
  ],
  'non-finite': [
    'FABRICATE.Check.TargetRefusal.NonFinite',
    'its target did not resolve to a number',
  ],
  dice: [
    'FABRICATE.Check.TargetRefusal.Dice',
    'its target formula rolls dice, but a target must be a fixed number',
  ],
  invalid: ['FABRICATE.Check.TargetRefusal.Invalid', 'its target value cannot be read as a number'],
  'adjustment-invalid': [
    'FABRICATE.Check.TargetRefusal.AdjustmentInvalid',
    'its difficulty adjustment is invalid; a multiplier must be above zero',
  ],
  'progressive-under': [
    'FABRICATE.Check.TargetRefusal.ProgressiveUnder',
    'a progressive check cannot roll under a target',
  ],
  'formula-empty': [
    'FABRICATE.Check.TargetRefusal.FormulaEmpty',
    'a roll-under check needs a roll formula',
  ],
});
const REFUSAL_FALLBACK = [
  'FABRICATE.Check.TargetRefusal.Misconfigured',
  'its target is misconfigured',
];

const foundryFormat = (key, data) => globalThis.game?.i18n?.format?.(key, data);

/** The sentence a refusal shows, localized with an English fallback; never the raw reason code. */
export function checkRefusalMessage(reason, label = 'Crafting', localize = foundryFormat) {
  const [key, detail] = Object.hasOwn(REFUSAL_COPY, reason)
    ? REFUSAL_COPY[reason]
    : REFUSAL_FALLBACK;
  return localizeWith(localize, key, { label }, `${label} check cannot roll: ${detail}.`);
}

/**
 * The normalized evaluation a check config runs by. A count evaluation stays inert until #2004
 * activates it, so it runs as the default sum/over/fixed record.
 */
export function activeCheckEvaluation(config) {
  const authored = config != null && Object.hasOwn(config, 'evaluation') ? config.evaluation : null;
  const evaluation = normalizeCheckEvaluation(authored);
  return evaluation.product === 'sum' ? evaluation : normalizeCheckEvaluation();
}

/** Whether a check grades a summed total over a fixed DC, the only case a `(DC n)` label names. */
export function isFixedSumOver(evaluation) {
  return (
    (evaluation?.product ?? 'sum') === 'sum' &&
    (evaluation?.direction ?? 'over') === 'over' &&
    (evaluation?.target?.source ?? 'fixed') === 'fixed'
  );
}

/** The ` (DC n)` chat-flavor suffix, which names only a summed roll-over fixed DC. */
export function dcFlavorSuffix(dc, evaluation) {
  return Number.isFinite(dc) && isFixedSumOver(evaluation) ? ` (DC ${dc})` : '';
}

/** A progressive check spends its total as a budget, so summed roll-under refuses; count/under rolls. */
export function progressiveTargetRefusal(evaluation) {
  return evaluation?.product === 'sum' && evaluation?.direction === 'under'
    ? 'progressive-under'
    : null;
}

/** The misconfigured check result a refusal returns before any roll, spend or award. */
export function checkTargetRefusal(reason, label = 'Crafting') {
  return {
    success: false,
    misconfigured: true,
    outcome: null,
    value: null,
    data: { targetRefusal: reason },
    message: checkRefusalMessage(reason, label),
  };
}

/**
 * An activity's target from its check config. `anchor` is its fixed DC, `override` its non-null
 * adjustment override, and `readRollData` is called only for an attribute source. A fixed-range
 * routed check reads no target, so its target source is inert, as a progressive one is.
 */
export function resolveActivityTarget(config, { anchor, override = null, readRollData }) {
  if (config?.type === 'fixed') return { ok: true, target: anchor, source: 'fixed' };
  const evaluation = activeCheckEvaluation(config);
  const attribute = evaluation.target.source === 'attribute';
  return resolveCheckTarget({
    evaluation,
    rollData: attribute ? readRollData() : {},
    anchor,
    adjustment: selectTargetAdjustment(evaluation, override),
  });
}

/** An added adjustment is any finite number; a multiplier is a finite number above zero. */
export function isValidTargetAdjustment(kind, value) {
  return Number.isFinite(value) && (kind !== 'multiply' || value > 0);
}

/**
 * The adjustment an activity applies: its non-null override (the selected recipe tier's,
 * the component's or the task's), else the evaluation's base. Null is identity.
 */
export function selectTargetAdjustment(evaluation, override) {
  return override ?? evaluation?.target?.baseAdjustment ?? null;
}

/**
 * `{ ok: true, target, source }` or `{ ok: false, reason }`. A fixed source keeps the anchor;
 * an attribute source resolves its expression with Foundry path semantics, applies the
 * adjustment, then floors, and never reads an unusable value as 0.
 */
export function resolveCheckTarget({ evaluation, rollData = {}, anchor, adjustment = null }) {
  const target = evaluation?.target ?? {};
  if (target.source !== 'attribute') {
    return Number.isFinite(anchor)
      ? { ok: true, target: anchor, source: 'fixed' }
      : { ok: false, reason: 'non-finite' };
  }
  if (!String(target.expression ?? '').trim()) return { ok: false, reason: 'expression-missing' };
  const resolved = resolveDeterministicExpression(target.expression, rollData, {
    pathMode: 'foundry',
  });
  if (!resolved.ok) return { ok: false, reason: resolved.reason };
  const kind = target.adjustmentKind === 'multiply' ? 'multiply' : 'add';
  const factor = adjustment ?? null;
  if (factor !== null && !isValidTargetAdjustment(kind, factor)) {
    return { ok: false, reason: 'adjustment-invalid' };
  }
  const value = Math.floor(adjusted(resolved.value, kind, factor));
  return Number.isFinite(value)
    ? { ok: true, target: value, source: 'attribute' }
    : { ok: false, reason: 'non-finite' };
}

/** A relative multiply tier's threshold, floored again; NaN when the multiplier is invalid. */
export function multiplyTierThreshold(anchor, multiplier) {
  return isValidTargetAdjustment('multiply', multiplier) ? Math.floor(anchor * multiplier) : NaN;
}

function adjusted(value, kind, adjustment) {
  if (adjustment === null) return value;
  return kind === 'multiply' ? value * adjustment : value + adjustment;
}
