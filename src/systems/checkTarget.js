/**
 * Resolves a check's pre-modifier target from explicit inputs. It reads no Actor, recipe,
 * component, task or macro: callers pass the roll data, the fixed anchor and the chosen adjustment.
 */
import { resolveDeterministicExpression } from './checkEvaluation.js';

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
