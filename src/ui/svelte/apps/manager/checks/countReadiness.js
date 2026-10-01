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
import { poolCanFire } from '../../../../../systems/countTriggerReach.js';
import { normalizeNullableSuccesses } from '../../../../../systems/normalize/checkEvaluation.js';
import { parseDiceGroups } from '../../../../../utils/craftingCheckExpression.js';
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
  const missing = fromRules.filter((kind) => pool[kind].faces.value === null);
  result.checks.push({ id: 'countFacesSet', satisfied: missing.length === 0 });
  for (const kind of missing) raise(result.issues, 'countFaceMissing', 'critical', { kind });
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

/**
 * The die a kept trigger's group reads in the formula it was written for: a repeated die by its
 * ordinal, and a group the formula no longer has by number, as a fragment the copy layer localizes.
 */
function formulaGroupName(rollFormula, groupId) {
  const parsed = parseDiceGroups(rollFormula);
  const group = parsed[groupId];
  if (!group) {
    return {
      key: 'FABRICATE.Admin.Manager.Checks.Validation.CountTriggerDiceGroup',
      fallback: 'dice group {n}',
      data: { n: groupId + 1 },
    };
  }
  const same = parsed.filter((entry) => entry.raw === group.raw);
  if (same.length === 1) return group.raw;
  const n = parsed.slice(0, groupId + 1).filter((entry) => entry.raw === group.raw).length;
  return {
    key: 'FABRICATE.Admin.Manager.Checks.Breakage.GroupOrdinal',
    fallback: '{die} #{n}',
    data: { die: group.raw, n },
  };
}

/**
 * Retained dice triggers the pool can never fire (ruling R3), named against the formula they were
 * written for, as `{ key, fallback, data }` fragments the copy layer localizes: a warning only, and
 * the triggers are never rewritten, so they work again after switching back.
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
    const triggers = unreachable.map(({ condition }) => {
      const groupId = Number(condition.groupId);
      const label = formulaGroupName(check?.rollFormula, groupId);
      return summariseCondition(condition, { diceGroups: [{ groupId, label }], counting: true });
    });
    raise(result.issues, 'countTriggerGroupUnreachable', 'warning', { triggers });
  }
}

/**
 * The issue data for the requirements whose count exceeds the authored ceiling (`overMax`) and
 * those above the base pool but within the ceiling (`overBase`): tier `names`, and `defaultRecord`
 * when the check's own count is among them, which the copy layer names in the reader's language.
 * The ceiling is the base plus the additional-dice max while they are enabled (issue 2008).
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
  const ceiling = base + (pool.additionalDice.enabled ? pool.additionalDice.max : 0);
  const { overMax, overBase } = countCeilingIssues({ base, ceiling, requirements });
  result.checks.push({ id: 'countRequiredWithinMaxPool', satisfied: !raisesAny(overMax) });
  if (raisesAny(overMax)) {
    raise(result.issues, 'countRequiredExceedsMaxPool', 'critical', { ...overMax, ceiling });
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

/** A stored document path: dot-separated identifiers, never `@`, an operator or a list index. */
const STORED_PATH = /^[\p{L}_$][\p{L}\p{N}_$]*(?:\.[\p{L}_$][\p{L}\p{N}_$]*)*$/u;

const MACRO_FIELDS = Object.freeze({ read: 'readMacroUuid', spend: 'spendMacroUuid' });

/** The first field the authored source leaves blank (`path`, `read` or `spend`), else null. */
function missingSourceField(additional) {
  const fields =
    additional.source === 'macro'
      ? Object.entries(MACRO_FIELDS).map(([kind, field]) => [kind, additional[field]])
      : [['path', additional.path]];
  return fields.find(([, value]) => trimmed(value) === '')?.[0] ?? null;
}

/**
 * Whether a linked macro synchronously resolves to nothing, to another document, or to a macro
 * that is not a script. A compendium index entry carries no `documentName` (nor a Macro `type`)
 * and a lookup that throws is unresolved, so neither is flagged here.
 */
function macroFlagged(uuid) {
  if (typeof globalThis.fromUuidSync !== 'function') return false;
  let found;
  try {
    found = globalThis.fromUuidSync(uuid, { strict: false });
  } catch {
    return false;
  }
  if (found == null) return true;
  if (!found.documentName) return false;
  return found.documentName !== 'Macro' || found.type !== 'script';
}

function additionalDiceMacroReadiness(result, additional, raise) {
  const linked = Object.entries(MACRO_FIELDS).filter(([, field]) => trimmed(additional[field]));
  if (linked.length === 0) return;
  const flagged = linked.filter(([, field]) => macroFlagged(trimmed(additional[field])));
  result.checks.push({ id: 'countAdditionalDiceMacrosScript', satisfied: flagged.length === 0 });
  for (const [kind] of flagged) {
    raise(result.issues, 'countAdditionalDiceMacroInvalid', 'critical', { kind });
  }
}

/** The Preview-as actor's stored value at the path: a transient warning when it cannot pay. */
function previewActorResourceWarning(transient, path, previewActor, raise) {
  if (typeof previewActor.readStored !== 'function') return;
  const { value, overridden } = previewActor.readStored(path) ?? {};
  const unread = typeof value !== 'number' || !Number.isFinite(value);
  if (!unread && !overridden) return;
  const actor = previewActor.name ?? '';
  const data = unread ? { actor, path } : { actor, path, overridden: true };
  raise(transient, 'countAdditionalDicePathUnresolvedForPreview', 'warning', data);
}

/** Readiness of the additional-dice policy (issue 2008), silent while it is switched off. */
function additionalDiceReadiness(result, additional, previewActor, raise) {
  if (!additional.enabled) return;
  const missing = missingSourceField(additional);
  result.checks.push({ id: 'countAdditionalDiceSourceSet', satisfied: !missing });
  if (missing) {
    raise(result.issues, 'countAdditionalDiceSourceMissing', 'critical', { input: missing });
  }
  if (additional.source === 'macro') {
    additionalDiceMacroReadiness(result, additional, raise);
    return;
  }
  const path = trimmed(additional.path);
  if (!path) return;
  const stored = STORED_PATH.test(path);
  result.checks.push({ id: 'countAdditionalDicePathStored', satisfied: stored });
  if (!stored) raise(result.issues, 'countAdditionalDicePathInvalid', 'critical');
  else if (previewActor) previewActorResourceWarning(result.transient, path, previewActor, raise);
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
  additionalDiceReadiness(result, evaluation.pool.additionalDice, previewActor, raise);
  countTriggerReadiness(result, check, evaluation, raise);
  if (previewActor && !baseFault && !thresholdFault) {
    previewActorPoolWarnings(result.transient, evaluation, { thresholdMode, previewActor, raise });
  }
}
