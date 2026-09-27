/**
 * The activity side of a success-counting check: validate its pool before any Tool or modifier
 * roll, pick its required count, and capture the resolved policy a prepared run replays. It reads
 * no Actor, recipe, component, task or macro: callers pass roll data and the override they select.
 */
import { firstUnresolvedPath } from './checkEvaluation.js';
import {
  activeCheckEvaluation,
  progressiveTargetRefusal,
  resolveActivityTarget,
} from './checkTarget.js';
import { resolvePool } from './countEvaluation.js';

/** The required count: an integer override (a tier's, component's or task's, 0 included), else the pool's. */
export function countRequired(evaluation, override = null) {
  return Number.isInteger(override) ? override : evaluation.pool.required;
}

/**
 * A pool refusal that names its unresolved path, so the refusal sentence can. `refusal` is a
 * `resolvePool` refusal; any other reason passes through unchanged.
 */
export function namedPoolRefusal(refusal, evaluation, rollData) {
  if (refusal.reason !== 'unresolved-path') return refusal;
  const expression = evaluation.pool?.[refusal.refusedInput];
  return { ...refusal, path: firstUnresolvedPath(expression, rollData, { pathMode: 'foundry' }) };
}

/**
 * `{ ok: true, target, source, policy? }` or a refusal, before any Tool or modifier roll. A
 * count check validates its pool and answers its required count as `target`, whatever its
 * routing type; any other check resolves its target through {@link resolveActivityTarget}.
 */
export function resolveActivityCheck(config, { required = null, readRollData, ...target }) {
  const evaluation = activeCheckEvaluation(config);
  if (evaluation.product !== 'count') {
    return resolveActivityTarget(config, { ...target, readRollData });
  }
  const rollData = readRollData();
  const pool = resolvePool({ evaluation, thresholdMode: config?.thresholdMode, rollData });
  if (!pool.ok) return namedPoolRefusal(pool, evaluation, rollData);
  return {
    ok: true,
    target: countRequired(evaluation, required),
    source: 'count',
    policy: pool.policy,
  };
}

/**
 * A progressive check's refusal before any roll, or `null`: summed roll-under refuses, and a
 * count check refuses a pool that cannot resolve.
 */
export function progressiveCheckRefusal(config, readRollData) {
  const evaluation = activeCheckEvaluation(config);
  if (evaluation.product !== 'count') {
    const reason = progressiveTargetRefusal(evaluation);
    return reason ? { reason } : null;
  }
  const rollData = readRollData();
  const pool = resolvePool({ evaluation, thresholdMode: config?.thresholdMode, rollData });
  return pool.ok ? null : namedPoolRefusal(pool, evaluation, rollData);
}

/**
 * The private `decisionPolicy.count` a prepared run replays: the pool resolved before any Tool
 * roll, with the required count the macro already settled. It holds numbers, never expressions.
 */
export function countDecisionPolicy(evaluation, policy, required) {
  const { pool } = evaluation;
  return {
    die: policy.die,
    direction: policy.direction,
    base: policy.resolved.base,
    threshold: policy.resolved.threshold,
    required,
    comparison: policy.comparison,
    explode: structuredClone(pool.explode),
    cancel: structuredClone(pool.cancel),
    zeroPoolFails: pool.zeroPoolFails,
    modifierDestination: pool.modifierDestination,
  };
}

/**
 * The evaluation, strictness and required count a captured `decisionPolicy.count` replays, so the
 * prepared evaluator never reads the live actor; `null` when the capture is missing.
 */
export function preparedCountEvaluation(count) {
  if (!count || typeof count !== 'object') return null;
  return {
    evaluation: {
      product: 'count',
      direction: count.direction === 'under' ? 'under' : 'over',
      pool: {
        die: count.die,
        base: count.base,
        threshold: count.threshold,
        required: count.required,
        modifierDestination: count.modifierDestination,
        zeroPoolFails: count.zeroPoolFails,
        explode: count.explode,
        cancel: count.cancel,
      },
    },
    thresholdMode: count.comparison,
    required: count.required,
  };
}
