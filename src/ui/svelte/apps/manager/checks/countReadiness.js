/**
 * Readiness of a success-counting pool (issues 2004, 2006): its expressions, faces, required
 * counts and retained dice triggers, and the Preview-as actor's reading as `transient` warnings.
 * Every issue reaches its list through the `raise` funnel `checksReadiness.js` hands in, so its
 * registry still refuses an unregistered id.
 */
import {
  faceBeyondDie,
  MAX_COUNT_POOL,
  resolvePool,
} from '../../../../../systems/countEvaluation.js';
import { normalizeNullableSuccesses } from '../../../../../systems/normalize/checkEvaluation.js';
import { trimString as trimmed } from '../../../../../utils/scalars.js';

import { missingTargetPaths, readsCharacter, targetExpressionFault } from './checkTargetStatus.js';
import { countPoolDiceGroup } from './checkTriggerPresets.js';
import { summariseCondition } from './checkTriggerSummary.js';

/** A pool expression's fault whatever character reads it: blank, `dice` or `invalid`, else null. */
function poolExpressionFault(expression) {
  return trimmed(expression) === '' ? 'blank' : targetExpressionFault(expression);
}

/** The effect a beyond-the-die face has, by the pure predicates' own rule. */
function beyondDieEffect(kind, direction) {
  if (kind === 'explode') return 'neverExplodes';
  return direction === 'under' ? 'noFaceCancels' : 'everyFaceCancels';
}

const FACE_KINDS = ['explode', 'cancel'];

/** An enabled `from` rule with no face (imported or API data) blocks the roll (ruling R2). */
function countFaceSetReadiness(result, pool, raise) {
  const fromRules = FACE_KINDS.filter(
    (kind) => pool[kind].enabled && pool[kind].faces.kind === 'from'
  );
  if (fromRules.length === 0) return;
  const missing = fromRules.find((kind) => pool[kind].faces.value === null);
  result.checks.push({ id: 'countFacesSet', satisfied: !missing });
  if (missing) raise(result.issues, 'countFaceMissing', 'critical', { kind: missing });
}

/** Explode and cancel faces are set and on the die, and an explosion can stop. */
function countFaceReadiness(result, evaluation, thresholdMode, raise) {
  const { pool, direction } = evaluation;
  countFaceSetReadiness(result, pool, raise);
  const beyond = FACE_KINDS.find(
    (kind) => pool[kind].enabled && faceBeyondDie(pool[kind].faces, pool.die)
  );
  result.checks.push({ id: 'countFacesOnDie', satisfied: !beyond });
  if (beyond) {
    const effect = beyondDieEffect(beyond, direction);
    const data = { kind: beyond, face: pool[beyond].faces.value, die: pool.die, effect };
    raise(result.issues, 'countFaceBeyondDie', 'warning', data);
  }
  // Literal inputs, so only the face rules can refuse: the runtime's own every-face test.
  const literal = { ...evaluation, pool: { ...pool, base: '1', threshold: '1' } };
  const unbounded =
    resolvePool({ evaluation: literal, thresholdMode }).reason === 'explode-unbounded';
  result.checks.push({ id: 'countExplosionStops', satisfied: !unbounded });
  if (unbounded) raise(result.issues, 'countExplodeUnbounded', 'critical');
}

const FACE_TESTS = Object.freeze({
  '==': (face, value) => face === value,
  '<=': (face, value) => face <= value,
  '>=': (face, value) => face >= value,
  '<': (face, value) => face < value,
  '>': (face, value) => face > value,
});

/** Whether a dice condition can fire on the pool's one group: group 0, a face the die shows. */
function poolCanFire(condition, { groupId, sides }) {
  if (Number(condition?.groupId) !== groupId) return false;
  if (condition.aggregate === 'total') return true;
  const test = FACE_TESTS[condition.operator];
  const value = Number(condition.value);
  for (let face = 1; face <= sides; face += 1) if (test?.(face, value)) return true;
  return false;
}

/**
 * Retained dice triggers the pool can never fire (ruling R3), named by the summary heading their
 * cards, as `{ key, fallback, data }` fragments the copy layer localizes: a warning only, and the
 * triggers are never rewritten, so they work again after switching back.
 */
function countTriggerReadiness(result, check, evaluation, raise) {
  const triggers = Array.isArray(check?.checkBreakage?.triggers)
    ? check.checkBreakage.triggers
    : [];
  const dice = triggers.filter((trigger) => trigger?.condition?.type === 'diceGroup');
  if (dice.length === 0) return;
  const group = countPoolDiceGroup(evaluation);
  const unreachable = dice.filter((trigger) => !poolCanFire(trigger.condition, group));
  result.checks.push({ id: 'countTriggersReachable', satisfied: unreachable.length === 0 });
  if (unreachable.length > 0) {
    const context = { diceGroups: [group], counting: true };
    const triggers = unreachable.map((trigger) => summariseCondition(trigger.condition, context));
    raise(result.issues, 'countTriggerGroupUnreachable', 'warning', { triggers });
  }
}

/**
 * The issue data for the requirements whose count exceeds the authored ceiling (`overMax`) and
 * those above the base pool but within the ceiling (`overBase`): tier `names`, and `defaultRecord`
 * when the check's own count is among them, which the copy layer names in the reader's language.
 * The ceiling is the base alone until additional dice (issue 2008) raise it.
 */
export function countCeilingIssues({ base, ceiling, requirements }) {
  const group = (predicate) => {
    const over = requirements.filter(({ required }) => predicate(required));
    const names = over
      .filter((entry) => !entry.defaultRecord)
      .map(({ name }) => name)
      .join(', ');
    return over.some((entry) => entry.defaultRecord) ? { names, defaultRecord: true } : { names };
  };
  return {
    overMax: group((required) => required > ceiling),
    overBase: group((required) => required > base && required <= ceiling),
  };
}

const raisesAny = (group) => group.defaultRecord === true || group.names !== '';

/**
 * The dice a literal base rolls, as the runtime settles it with no benefit applied, or the refusal.
 * The threshold and face rules are neutralized, so only the base decides.
 */
export function literalBaseDice(evaluation, thresholdMode) {
  const off = { enabled: false };
  const pool = { ...evaluation.pool, threshold: '1', explode: off, cancel: off };
  const placement = { preRolls: [], poolDelta: 0, thresholdDelta: 0 };
  return resolvePool({ evaluation: { ...evaluation, pool }, thresholdMode, placement });
}

/**
 * Recipe `tiers` set their own successes, and a literal base pool can meet every required count;
 * the Difficulty card states these rows too (issue 2006). `literal` is the base's settled read.
 */
export function countRequiredReadiness(result, evaluation, { tiers, literal, raise }) {
  const { pool } = evaluation;
  const tierRequired = tiers.map((tier) => ({
    name: trimmed(tier?.name) || String(tier?.id ?? ''),
    successes: normalizeNullableSuccesses(tier?.successes),
  }));
  if (tierRequired.length > 0) {
    const unset = tierRequired.filter((tier) => tier.successes === null);
    result.checks.push({ id: 'countTiersSetSuccesses', satisfied: unset.length === 0 });
    if (unset.length > 0) {
      const names = unset.map((tier) => tier.name).join(', ');
      const data = { names, required: pool.required };
      raise(result.issues, 'countTierWithoutSuccesses', 'critical', data);
    }
  }
  if (poolExpressionFault(pool.base)) return;
  if (readsCharacter(pool.base)) {
    result.checks.push({ id: 'countPoolCharacterDependent', satisfied: true });
    return;
  }
  if (!literal?.ok) return;
  const base = literal.policy.dice;
  const requirements = [
    { defaultRecord: true, required: pool.required },
    ...tierRequired.map((tier) => ({ name: tier.name, required: tier.successes ?? pool.required })),
  ];
  const { overMax, overBase } = countCeilingIssues({ base, ceiling: base, requirements });
  result.checks.push({ id: 'countRequiredWithinMaxPool', satisfied: !raisesAny(overMax) });
  if (raisesAny(overMax)) {
    raise(result.issues, 'countRequiredExceedsMaxPool', 'critical', {
      ...overMax,
      ceiling: base,
    });
  }
  if (raisesAny(overBase)) {
    result.checks.push({ id: 'countRequiredWithinBasePool', satisfied: false });
    raise(result.issues, 'countRequiredExceedsBasePool', 'warning', { ...overBase, base });
  }
}

/** The Preview-as actor's reading of a pool that reads the character; `input` names the field. */
function previewActorPoolWarnings(transient, evaluation, { thresholdMode, previewActor, raise }) {
  const rollData = previewActor.rollData ?? {};
  const read = resolvePool({ evaluation, thresholdMode, rollData });
  if (read.ok || !['base', 'threshold'].includes(read.refusedInput)) return;
  const actor = previewActor.name ?? '';
  const input = read.refusedInput;
  if (read.reason !== 'unresolved-path') {
    raise(transient, 'countValueNotNumericForPreview', 'warning', { actor, input });
    return;
  }
  const { base, threshold } = evaluation.pool;
  const paths = new Set([
    ...missingTargetPaths(base, rollData),
    ...missingTargetPaths(threshold, rollData),
  ]);
  const path = [...paths].join(', ');
  raise(transient, 'countPathUnresolvedForPreview', 'warning', { actor, path, input });
}

/**
 * Readiness of a success-counting pool. Fixed ranges and progressive checks grade no required
 * count, so only the pool itself and its triggers apply to them.
 */
export function countReadiness(result, check, evaluation, context) {
  const { mode, activity, previewActor, raise } = context;
  const { base, threshold } = evaluation.pool;
  const thresholdMode = check?.thresholdMode === 'exceed' ? 'exceed' : 'meet';
  const baseFault = poolExpressionFault(base);
  result.checks.push({ id: 'countPoolReadable', satisfied: !baseFault });
  if (baseFault) raise(result.issues, 'countPoolInvalid', 'critical');
  const thresholdFault = poolExpressionFault(threshold);
  result.checks.push({ id: 'countThresholdReadable', satisfied: !thresholdFault });
  if (thresholdFault) raise(result.issues, 'countThresholdInvalid', 'critical');
  countFaceReadiness(result, evaluation, thresholdMode, raise);
  const literal =
    baseFault || readsCharacter(base) ? null : literalBaseDice(evaluation, thresholdMode);
  if (literal?.reason === 'pool-too-large') {
    raise(result.issues, 'countPoolTooLarge', 'critical', { max: MAX_COUNT_POOL });
  }
  const gradesRequired = mode === 'simple' || (mode === 'routed' && check?.type !== 'fixed');
  const tiers = activity === 'crafting' && Array.isArray(check?.tiers) ? check.tiers : [];
  if (gradesRequired) countRequiredReadiness(result, evaluation, { tiers, literal, raise });
  countTriggerReadiness(result, check, evaluation, raise);
  if (previewActor && !baseFault && !thresholdFault) {
    previewActorPoolWarnings(result.transient, evaluation, { thresholdMode, previewActor, raise });
  }
}
