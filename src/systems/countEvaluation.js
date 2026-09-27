/**
 * Resolves a success-counting check's dice pool and projects rolled faces from explicit inputs.
 * It reads no Actor, recipe, component, task or macro: callers pass the roll data and placement.
 */
import { compareToTarget, resolveDeterministicExpression } from './checkEvaluation.js';

/** The reasons count adds to `CHECK_TARGET_REFUSALS`; every count refusal names its input. */
export const COUNT_REFUSALS = Object.freeze([
  'die-invalid',
  'faces-invalid',
  'explode-unbounded',
  'pool-too-large',
]);

/** Foundry's `DiceTerm` limit on the dice one term rolls. */
export const MAX_COUNT_POOL = 999;

/**
 * `{ ok: true, policy }` or `{ ok: false, reason, refusedInput }`. Call it with `placement: null`
 * before any roll, then with the settled placement: the pool floors after every benefit, and
 * `pool-too-large` is checked only once a placement is supplied. Nothing unusable reads as 0.
 */
export function resolvePool({ evaluation, thresholdMode, rollData = {}, placement = null }) {
  const pool = evaluation?.pool ?? {};
  const base = resolveCountInput(pool.base, rollData);
  if (!base.ok) return refusal(base.reason, 'base');
  const threshold = resolveCountInput(pool.threshold, rollData);
  if (!threshold.ok) return refusal(threshold.reason, 'threshold');
  if (!Number.isInteger(pool.die) || pool.die < 2) return refusal('die-invalid', 'die');
  const explode = faceRule(pool.explode, 'best');
  if (explode === INVALID_FACE) return refusal('faces-invalid', 'explode');
  const cancel = faceRule(pool.cancel, 'worst');
  if (cancel === INVALID_FACE) return refusal('faces-invalid', 'cancel');
  const rules = {
    die: pool.die,
    direction: evaluation?.direction === 'under' ? 'under' : 'over',
    comparison: thresholdMode === 'exceed' ? 'exceed' : 'meet',
    explode: explode && { ...explode, once: pool.explode.once === true },
    cancel,
  };
  if (explodesOnEveryFace(rules)) return refusal('explode-unbounded', 'explode');
  const resolved = { base: base.value, threshold: threshold.value };
  return settlePool(rules, resolved, pool.zeroPoolFails !== false, placement);
}

/**
 * The per-die tests odds and projection share. A `from` explosion face beyond the die never
 * explodes; a `from` cancel face beyond it cancels every face over and none under.
 */
export function countFacePredicates({ die, threshold, direction, comparison, explode, cancel }) {
  const against = direction === 'under' ? 'over' : 'under';
  return {
    qualifies: (face) => compareToTarget(face, threshold, comparison, direction),
    explodes: (face, { generated = false } = {}) =>
      Boolean(explode) &&
      !(generated && explode.once) &&
      (explode.kind === 'from'
        ? explode.value <= die && compareToTarget(face, explode.value, 'meet', direction)
        : face === extremeFace(die, direction)),
    cancels: (face) =>
      Boolean(cancel) &&
      (cancel.kind === 'from'
        ? compareToTarget(face, cancel.value, 'meet', against)
        : face === extremeFace(die, against)),
  };
}

/**
 * Marks every active die, explosion-generated ones included, as qualified and cancelled
 * independently; its contribution is qualified minus cancelled, and an inactive die's is 0.
 * The k-th exploded result in index order produced `results[number + k]`, as Foundry appends.
 */
export function projectCountResults({ policy, results, number = policy.dice }) {
  const { qualifies, cancels } = countFacePredicates(policy);
  const sources = [];
  const projected = results.map((entry, index) => {
    const active = entry.active !== false;
    const exploded = entry.exploded === true;
    const qualified = active && qualifies(entry.result);
    const cancelled = active && cancels(entry.result);
    const explodedFrom = index >= number ? (sources[index - number] ?? null) : null;
    if (exploded) sources.push(index);
    const contribution = Number(qualified) - Number(cancelled);
    return {
      index,
      face: entry.result,
      active,
      exploded,
      explodedFrom,
      qualified,
      cancelled,
      contribution,
    };
  });
  return {
    results: projected,
    successes: projected.filter((entry) => entry.qualified).length,
    cancelled: projected.filter((entry) => entry.cancelled).length,
    net: projected.reduce((total, entry) => total + entry.contribution, 0),
  };
}

/** Grading is always `net >= required`, and a zero pool fails even when nothing is required. */
export function countCheckPasses({ policy, net, required }) {
  return !policy.zeroPool && Number.isFinite(net) && net >= required;
}

/** The pool shortfall against the required count, not a proof that the check cannot pass. */
export function minimumAdditionalDice({ required, dice }) {
  return Math.max(0, required - dice);
}

const INVALID_FACE = Symbol('invalid face');

function resolveCountInput(expression, rollData) {
  if (!String(expression ?? '').trim()) return { ok: false, reason: 'expression-missing' };
  return resolveDeterministicExpression(expression, rollData, { pathMode: 'foundry' });
}

function refusal(reason, refusedInput) {
  return { ok: false, reason, refusedInput };
}

function faceRule(rule, extremeKind) {
  if (rule?.enabled !== true) return null;
  if (rule.faces?.kind !== 'from') return { kind: extremeKind, value: null };
  const { value } = rule.faces;
  return Number.isInteger(value) && value >= 1 ? { kind: 'from', value } : INVALID_FACE;
}

function extremeFace(die, direction) {
  return direction === 'under' ? 1 : die;
}

function explodesOnEveryFace(rules) {
  if (!rules.explode || rules.explode.once) return false;
  const { explodes } = countFacePredicates(rules);
  for (let face = 1; face <= rules.die; face += 1) {
    if (!explodes(face, { generated: true })) return false;
  }
  return true;
}

// Each already-signed delta is added exactly once; the threshold is never clamped or inverted.
function settlePool(rules, resolved, zeroPoolFails, placement) {
  if (placement?.preRolls?.some((entry) => !Object.hasOwn(entry, 'total'))) {
    throw new TypeError('A count pool resolves against a settled placement');
  }
  const threshold = resolved.threshold + (placement?.thresholdDelta ?? 0);
  if (!Number.isFinite(threshold)) return refusal('non-finite', 'threshold');
  const floored = Math.floor(resolved.base + (placement?.poolDelta ?? 0));
  if (!Number.isFinite(floored)) return refusal('non-finite', 'pool');
  if (placement && floored > MAX_COUNT_POOL) return refusal('pool-too-large', 'pool');
  const zeroPool = floored <= 0 && zeroPoolFails;
  let dice = Math.max(1, floored);
  if (zeroPool) dice = 0;
  return { ok: true, policy: { ...rules, resolved, threshold, dice, zeroPool } };
}
