import { resolveDeterministicExpression } from '../../../../../systems/checkEvaluation.js';
import {
  classifyModifierExpression,
  modifierExpressionResolves,
  resolveEligibleModifierIds,
  resolveMaxModifierPicks,
  resolveModifierBounds,
  resolveModifierPolicy,
} from '../../../../../systems/checkModifierResolver.js';
import { isValidTargetAdjustment } from '../../../../../systems/checkTarget.js';
import {
  faceBeyondDie,
  MAX_COUNT_POOL,
  resolvePool,
} from '../../../../../systems/countEvaluation.js';
import {
  normalizeCheckEvaluation,
  normalizeNullableAdjustment,
  normalizeNullableSuccesses,
} from '../../../../../systems/normalize/checkEvaluation.js';
import {
  findRangeConflicts,
  planRetiredPlaceholderStrip,
} from '../../../../../utils/craftingCheckExpression.js';
import { trimString as trimmed } from '../../../../../utils/scalars.js';

import { invalidOverrideRecords, overrideEntriesFor } from './checkOverrideReadiness.js';
import { missingTargetPaths, readsCharacter, targetExpressionFault } from './checkTargetStatus.js';

/**
 * Pure readiness evaluator for one subsystem check, mirroring `recipeReadiness.js`: it returns
 * stable check/issue ids the Checks Validation tab maps to localized copy.
 * @typedef {{ id: string, satisfied: boolean }} CheckReadinessCheck
 * @typedef {{ id: string, severity: 'critical' | 'warning' | 'info' }} CheckReadinessIssue */

/**
 * EVERY issue id this evaluator can raise — the SOURCE OF TRUTH, inline literals being
 * enumerable only by reaching every branch. A GUARD, NOT A CONVENTION: `pushIssue` is the ONLY
 * way an issue reaches the list and it THROWS on an unregistered id, and
 * `tests/checks-readiness.test.js` also scans this source, catching a direct `push`.
 * @type {ReadonlyArray<string>} */
export const CHECK_READINESS_ISSUE_IDS = Object.freeze([
  // Formula
  'noRollFormula',
  'retiredPlaceholderBreaksFormula',
  'retiredPlaceholderInFormula',
  // Outcomes
  'unnamedOutcome',
  'noSuccessOutcome',
  'rangeInvalid',
  'rangeOverlap',
  'rangeGap',
  // Triggers
  'danglingTierStepTarget',
  'multipleTierStepTargets',
  // Check modifiers
  'modifierBoundsInverted',
  'modifierBoundsUnsafe',
  'modifierExpressionInvalid',
  'modifierAverageUnavailable',
  'modifiersInertNoCheck',
  'modifiersInertNoModifierSupport',
  'modifiersInertNoFormula',
  // Targets and adjustments
  'attributeTargetMissing',
  'attributeTargetInvalid',
  'attributeTierWithoutAdjustment',
  'adjustmentInvalidForKind',
  'otherwiseTierMissing',
  'multipleOtherwiseTiers',
  'progressiveUnderUnsupported',
  // Success-counting pools (issue 2004)
  'countPoolInvalid',
  'countThresholdInvalid',
  'countFaceBeyondDie',
  'countExplodeUnbounded',
  'countTierWithoutSuccesses',
  'countRequiredExceedsMaxPool',
  'countRequiredExceedsBasePool',
  'countPoolTooLarge',
  // Transient: they name the Preview-as actor and feed no badge, dot, tally or enable gate.
  'attributePathUnresolvedForPreview',
  'attributeValueNotNumeric',
  'countPathUnresolvedForPreview',
  'countValueNotNumericForPreview',
]);

const REGISTERED_ISSUE_IDS = new Set(CHECK_READINESS_ISSUE_IDS);

/**
 * The five sections an activity route renders, in reading order: the `data-checks-section`
 * values the strip emits, declared beside the registry that buckets into them.
 * @type {ReadonlyArray<string>} */
export const CHECK_SECTION_IDS = Object.freeze([
  'roll',
  'outcomes',
  'triggers',
  'modifiers',
  'on-failure',
]);

/**
 * Which SECTION owns each readiness issue: the strip's dots, the rail's badge and the Validation
 * deep links read this one map, PROVEN EXHAUSTIVE both ways by `tests/checks-readiness.test.js`.
 * `rangeGap` buckets to Outcomes rather than The roll, the hole being between authored TIERS.
 * @type {Readonly<Record<string, string>>} */
export const CHECK_ISSUE_SECTIONS = Object.freeze({
  noRollFormula: 'roll',
  retiredPlaceholderBreaksFormula: 'roll',
  retiredPlaceholderInFormula: 'roll',
  unnamedOutcome: 'outcomes',
  noSuccessOutcome: 'outcomes',
  rangeInvalid: 'outcomes',
  rangeOverlap: 'outcomes',
  rangeGap: 'outcomes',
  danglingTierStepTarget: 'triggers',
  multipleTierStepTargets: 'triggers',
  modifierBoundsInverted: 'modifiers',
  modifierBoundsUnsafe: 'modifiers',
  modifierExpressionInvalid: 'modifiers',
  modifierAverageUnavailable: 'modifiers',
  modifiersInertNoCheck: 'modifiers',
  modifiersInertNoModifierSupport: 'modifiers',
  modifiersInertNoFormula: 'modifiers',
  attributeTargetMissing: 'roll',
  attributeTargetInvalid: 'roll',
  attributeTierWithoutAdjustment: 'roll',
  adjustmentInvalidForKind: 'roll',
  otherwiseTierMissing: 'outcomes',
  multipleOtherwiseTiers: 'outcomes',
  progressiveUnderUnsupported: 'roll',
  countPoolInvalid: 'roll',
  countThresholdInvalid: 'roll',
  countFaceBeyondDie: 'roll',
  countExplodeUnbounded: 'roll',
  countTierWithoutSuccesses: 'roll',
  countRequiredExceedsMaxPool: 'roll',
  countRequiredExceedsBasePool: 'roll',
  countPoolTooLarge: 'roll',
  attributePathUnresolvedForPreview: 'roll',
  attributeValueNotNumeric: 'roll',
  countPathUnresolvedForPreview: 'roll',
  countValueNotNumericForPreview: 'roll',
});

/**
 * Which control each issue names: the `data-validation-target` a Validation row's View and a
 * section notice's Review focus. An id with none is route-only and focuses its section: an
 * Outcomes tier carries no id, and a modifier fault names its own entries.
 * @type {Readonly<Record<string, string>>} */
export const CHECK_ISSUE_CONTROLS = Object.freeze({
  noRollFormula: 'checks-roll-formula',
  retiredPlaceholderBreaksFormula: 'checks-roll-formula',
  retiredPlaceholderInFormula: 'checks-roll-formula',
  danglingTierStepTarget: 'checks-triggers',
  multipleTierStepTargets: 'checks-triggers',
  attributeTargetMissing: 'checks-target-expression',
  attributeTargetInvalid: 'checks-target-expression',
  attributePathUnresolvedForPreview: 'checks-target-expression',
  attributeValueNotNumeric: 'checks-target-expression',
});

/**
 * The mode this evaluator answers "this activity rolls no check at all" under. Gathering `d100`
 * and alchemy `none` are the reachable members, differing only in WHY, which the modifier issue
 * splits on; the name is "no check to AUTHOR", not a claim that nothing is rolled.
 * @type {'none'} */
export const NO_CHECK_MODE = 'none';

/** Every mode {@link evaluateCheckReadiness} dispatches on, frozen and enforced below.
 *  @type {ReadonlyArray<string>} */
export const CHECK_READINESS_MODES = Object.freeze(['simple', 'routed', 'progressive', 'none']);

const SUPPORTED_MODES = new Set(CHECK_READINESS_MODES);

/**
 * The readiness mode for a RESOLVED check slot. No AUTHORED resolution mode is ever `routed`,
 * and the translation is ALREADY OWNED by `checkModifierResolver`'s slot maps. SO THIS TAKES THE
 * SLOT, NOT THE MODE: a second mapping is how the rail badge came to evaluate the alchemy SIMPLE
 * draft under ROUTED rules, and to demand a roll formula for a mode whose route renders no
 * formula field. `null` becomes {@link NO_CHECK_MODE}.
 * @param {'simple'|'routed'|'progressive'|null|undefined} slot The resolvers' `slot` field.
 * @returns {'simple'|'routed'|'progressive'|'none'} */
export function readinessModeForSlot(slot) {
  return slot || NO_CHECK_MODE;
}

/**
 * The section that owns an issue id, or `null` for an id no bucket claims — deliberately not a
 * default section, which would put a dot on a section whose controls cannot clear it.
 * @param {string} id A {@link CHECK_READINESS_ISSUE_IDS} member. @returns {string|null} */
export function sectionForIssue(id) {
  return CHECK_ISSUE_SECTIONS[id] ?? null;
}

/**
 * Append one issue, refusing any id not in {@link CHECK_READINESS_ISSUE_IDS}. The throw is the
 * mechanism, a frozen exported array being only a convention. `data` is the optional
 * interpolation payload for an issue whose sentence NAMES something.
 * @param {CheckReadinessIssue[]} issues
 * @param {string} id
 * @param {'critical'|'warning'|'info'} severity
 * @param {object|null} [data] Interpolation values for the localized sentence. */
function pushIssue(issues, id, severity, data = null) {
  if (!REGISTERED_ISSUE_IDS.has(id)) {
    throw new Error(
      `checksReadiness: unregistered issue id "${id}" — add it to CHECK_READINESS_ISSUE_IDS ` +
        'so every surface that buckets these ids can see it'
    );
  }
  issues.push(data === null ? { id, severity } : { id, severity, data });
}

/**
 * The active outcome-tier list for a routed check; relative and fixed are independent lists and
 * only the active type's is authored or validated.
 * @param {object} check @returns {{ type: 'relative' | 'fixed', outcomes: object[] }} */
function routedOutcomes(check) {
  const type = check?.type === 'fixed' ? 'fixed' : 'relative';
  const key = type === 'fixed' ? 'fixedOutcomes' : 'relativeOutcomes';
  return { type, outcomes: Array.isArray(check?.[key]) ? check[key] : [] };
}

/**
 * Readiness of a routed check's tier-STEP targets, reported only once a trigger sets
 * `tierStep.mode === 'target'`. Two rules share one green tick, both saying the targets name
 * exactly one existing tier: a DANGLING target no-ops at runtime and is reachable by ordinary
 * authoring, the relative↔fixed switch dangling every `tierId` at once, while MULTIPLE targets
 * are guidance, a static count not knowing which conditions will match.
 * @param {object} check    Plain check draft.
 * @param {object[]} outcomes The ACTIVE outcome-tier list (relative or fixed).
 * @returns {{ checks: CheckReadinessCheck[], issues: CheckReadinessIssue[] }} */
function tierStepTargetReadiness(check, outcomes) {
  const triggers = Array.isArray(check?.checkBreakage?.triggers)
    ? check.checkBreakage.triggers
    : [];
  const targets = triggers.filter((trigger) => trigger?.tierStep?.mode === 'target');
  if (targets.length === 0) return { checks: [], issues: [] };

  const tierIds = new Set(outcomes.map((outcome) => outcome?.id));
  const dangling = targets.some((trigger) => !tierIds.has(trigger?.tierStep?.tierId));
  const ambiguous = targets.length > 1;

  const issues = [];
  if (dangling) pushIssue(issues, 'danglingTierStepTarget', 'warning');
  if (ambiguous) pushIssue(issues, 'multipleTierStepTargets', 'warning');
  return {
    checks: [{ id: 'tierStepTargetsResolve', satisfied: !dangling && !ambiguous }],
    issues,
  };
}

/**
 * Whether a FIXED outcome set leaves a GAP — a roll value inside the set's own span that no tier
 * claims. `findRangeConflicts` sees only OVERLAP and `start > end`, so nothing else reports it,
 * and a fixed routed check has no `clampToNearest` rescue: the attempt is rolled but unrouted.
 * SPAN-INTERIOR ONLY, a set not covering every value a die can roll being a deliberate window,
 * and invalid and overlapping ranges are excluded first, a `start > end` range otherwise
 * manufacturing a phantom gap.
 * @param {object[]} outcomes The active FIXED outcome-tier list.
 * @param {Set<number>} excluded Indices already reported invalid or overlapping.
 * @returns {boolean} */
function fixedRangesHaveGap(outcomes, excluded) {
  const spans = outcomes
    .map((outcome, index) => ({ index, start: Number(outcome?.start), end: Number(outcome?.end) }))
    .filter(
      (span) =>
        !excluded.has(span.index) && Number.isFinite(span.start) && Number.isFinite(span.end)
    )
    .sort((a, b) => a.start - b.start);
  if (spans.length < 2) return false;
  // Ranges are INCLUSIVE on both ends, so adjacency is `next.start === previous.end + 1`.
  let reach = spans[0].end;
  for (const span of spans.slice(1)) {
    if (span.start > reach + 1) return true;
    reach = Math.max(reach, span.end);
  }
  return false;
}

/**
 * Readiness of the check-modifier selection, keyed on what this activity would ACTUALLY roll
 * rather than the catalogue all three share, and resolved through `resolveEligibleModifierIds`.
 *
 * A ROLL-SHAPED EXPRESSION IS NOT ONE OF THEM, a check appending a rolling modifier AS DICE, so
 * `modifierRollExpression` is RETIRED (`openspec/specs/resolution-modes/spec.md` → "Check
 * Source", whose two bounds faults stay SEPARATE ids because the repairs differ).
 * `modifierExpressionInvalid` is an entry whose EXPRESSION cannot contribute and excludes bounds
 * faults. `modifierAverageUnavailable` is a separate, NON-BLOCKING warning naming an otherwise
 * usable entry whose dice total is TRANSFORMED (`classifyModifierExpression`), raised only when
 * `highest` or a capped `playerPicks` would actually rank it out (`modifiersCompete`). All four
 * NAME the offending entries and cover only entries this activity selects; the three
 * `modifiersInert*` warnings report a selection reaching no roll, gated on NON-EMPTY.
 * @param {object|null} modifierContext A `buildCheckModifierContext` bag, or null (no-ops).
 * @param {{ rollsNoCheck: boolean, hasRollFormula: boolean }} formulaState
 * @returns {{ checks: CheckReadinessCheck[], issues: CheckReadinessIssue[] }} */
/**
 * The offending entries' display names, comma-joined, or `''` when none are faulted; the label
 * is preferred and the id the fallback, so an unnamed entry is still locatable.
 * @param {Array<{entry: object}>} faulted @returns {string} */
function namesOf(faulted) {
  return faulted.map(({ entry }) => entry.label || entry.id).join(', ');
}

/** Whether ranking leaves an entry out: `highest` over two or more, or a `playerPicks` cap below
 *  the eligible count (an absent cap is `Infinity`, so it never is). */
function modifiersCompete(modifierContext, eligibleCount) {
  const policy = resolveModifierPolicy(modifierContext);
  const places = policy === 'highest' ? 1 : resolveMaxModifierPicks(modifierContext);
  return (policy === 'highest' || policy === 'playerPicks') && places < eligibleCount;
}

function checkModifierReadiness(modifierContext, { rollsNoCheck, hasRollFormula, activity = '' }) {
  if (!modifierContext) return { checks: [], issues: [] };
  const eligible = resolveEligibleModifierIds(modifierContext);
  if (eligible.length === 0) return { checks: [], issues: [] };

  const catalogue = Array.isArray(modifierContext.catalogue) ? modifierContext.catalogue : [];
  const byId = new Map(
    catalogue
      .filter((entry) => entry && typeof entry === 'object' && typeof entry.id === 'string')
      .map((entry) => [entry.id, entry])
  );
  // The offending ENTRIES rather than a boolean: a long shared library needs naming.
  const faulted = eligible
    .map((id) => ({ entry: byId.get(id), bounds: resolveModifierBounds(byId.get(id)) }))
    .filter(({ entry }) => Boolean(entry));
  const inverted = namesOf(faulted.filter(({ bounds }) => bounds.inverted));
  const unsafe = namesOf(faulted.filter(({ bounds }) => bounds.unsafe));
  // An entry whose EXPRESSION cannot contribute, bounds set aside; asked of the resolver, so
  // what readiness calls unusable and what the roll drops are one decision.
  const usableCandidates = faulted
    .filter(({ bounds }) => !bounds.inverted && !bounds.unsafe)
    .map((candidate) => ({
      ...candidate,
      resolves: modifierExpressionResolves(candidate.entry),
    }));
  const unusable = namesOf(usableCandidates.filter(({ resolves }) => !resolves));
  const transformed = namesOf(
    usableCandidates.filter(
      ({ entry, resolves }) => resolves && classifyModifierExpression(entry) === 'transformed'
    )
  );

  const issues = [];
  const checks = [
    { id: 'modifierBoundsValid', satisfied: inverted === '' && unsafe === '' },
    { id: 'modifierExpressionsResolve', satisfied: unusable === '' },
  ];
  if (inverted !== '') pushIssue(issues, 'modifierBoundsInverted', 'critical', { names: inverted });
  if (unsafe !== '') pushIssue(issues, 'modifierBoundsUnsafe', 'critical', { names: unsafe });
  if (unusable !== '') {
    pushIssue(issues, 'modifierExpressionInvalid', 'critical', { names: unusable });
  }
  if (transformed !== '' && modifiersCompete(modifierContext, eligible.length)) {
    pushIssue(issues, 'modifierAverageUnavailable', 'warning', { names: transformed });
  }
  // The two no-check modes reach no roll for OPPOSITE reasons, so they cannot share a sentence:
  // alchemy `none` rolls nothing, while gathering `d100` rolls and has no seam for modifiers.
  if (rollsNoCheck) {
    const id =
      activity === 'gathering' ? 'modifiersInertNoModifierSupport' : 'modifiersInertNoCheck';
    pushIssue(issues, id, 'warning');
  } else if (!hasRollFormula) pushIssue(issues, 'modifiersInertNoFormula', 'warning');
  return { checks, issues };
}

/** The two transient warnings: the Preview-as actor's value at the target cannot be read. */
function previewActorTargetWarnings(transient, expression, previewActor) {
  const rollData = previewActor.rollData ?? {};
  const read = resolveDeterministicExpression(expression, rollData, { pathMode: 'foundry' });
  if (read.ok) return;
  const actor = previewActor.name ?? '';
  if (read.reason === 'unresolved-path') {
    const path = missingTargetPaths(expression, rollData).join(', ');
    pushIssue(transient, 'attributePathUnresolvedForPreview', 'warning', { actor, path });
  } else {
    pushIssue(transient, 'attributeValueNotNumeric', 'warning', { actor });
  }
}

/** The character-value expression's own rules, and the Preview-as actor's reading of it. */
function attributeExpressionReadiness(result, expression, previewActor) {
  const hasExpression = expression !== '';
  result.checks.push({ id: 'attributeTargetSet', satisfied: hasExpression });
  if (!hasExpression) {
    pushIssue(result.issues, 'attributeTargetMissing', 'critical');
    return;
  }
  const fault = targetExpressionFault(expression);
  result.checks.push({ id: 'attributeTargetReadable', satisfied: !fault });
  if (fault) pushIssue(result.issues, 'attributeTargetInvalid', 'critical');
  else if (previewActor) previewActorTargetWarnings(result.transient, expression, previewActor);
}

/** Named entries whose adjustment is set, as `{ name, value }`; null adjustments are skipped. */
function setAdjustments(entries) {
  return entries
    .map((entry) => ({
      name: trimmed(entry?.name) || String(entry?.id ?? ''),
      value: normalizeNullableAdjustment(entry?.adjustment),
    }))
    .filter((entry) => entry.value !== null);
}

/** Under a character value every crafting recipe tier sets its own adjustment. */
function recipeTierReadiness(result, tiers) {
  if (tiers.length === 0) return;
  const unset = tiers.filter((tier) => normalizeNullableAdjustment(tier?.adjustment) === null);
  result.checks.push({ id: 'recipeTiersSetAdjustment', satisfied: unset.length === 0 });
  if (unset.length > 0) {
    const names = unset.map((tier) => trimmed(tier?.name) || tier?.id).join(', ');
    pushIssue(result.issues, 'attributeTierWithoutAdjustment', 'critical', { names });
  }
}

/**
 * The base, every set tier adjustment and every named override record suit the target's
 * adjustment kind. A faulted base is flagged as `baseAdjustment` rather than named, so the copy
 * layer names it in the reader's language; a faulted override is a component's or a gathering
 * task's kept value (issue 2078), named beside the tiers in the same sentence.
 */
function adjustmentKindReadiness(
  result,
  { adjustmentKind: kind, baseAdjustment },
  set,
  overrideRecords = []
) {
  const suits = (value) => isValidTargetAdjustment(kind, value);
  const baseInvalid = baseAdjustment !== null && !suits(baseAdjustment);
  const invalid = [
    ...set.filter((entry) => !suits(entry.value)),
    ...invalidOverrideRecords(overrideRecords, kind),
  ];
  result.checks.push({
    id: 'adjustmentsSuitKind',
    satisfied: !baseInvalid && invalid.length === 0,
  });
  if (baseInvalid || invalid.length > 0) {
    const names = invalid.map((entry) => entry.name).join(', ');
    const data = baseInvalid ? { names, baseAdjustment: true } : { names };
    pushIssue(result.issues, 'adjustmentInvalidForKind', 'critical', data);
  }
}

/** A multiply check's relative tiers: exactly one leaves its multiplier unset as Otherwise. */
function otherwiseReadiness(result, outcomes) {
  if (outcomes.length === 0) return;
  const otherwise = outcomes.filter(
    (outcome) => normalizeNullableAdjustment(outcome?.adjustment) === null
  );
  result.checks.push({ id: 'singleOtherwiseTier', satisfied: otherwise.length === 1 });
  if (otherwise.length === 0) pushIssue(result.issues, 'otherwiseTierMissing', 'critical');
  if (otherwise.length > 1) {
    const names = otherwise.map((outcome) => trimmed(outcome?.name) || outcome?.id).join(', ');
    pushIssue(result.issues, 'multipleOtherwiseTiers', 'critical', { names });
  }
}

/** A pool expression's fault whatever character reads it: blank, `dice` or `invalid`, else null. */
function poolExpressionFault(expression) {
  return trimmed(expression) === '' ? 'blank' : targetExpressionFault(expression);
}

/** The effect a beyond-the-die face has, by the pure predicates' own rule. */
function beyondDieEffect(kind, direction) {
  if (kind === 'explode') return 'neverExplodes';
  return direction === 'under' ? 'noFaceCancels' : 'everyFaceCancels';
}

/** Explode and cancel faces the die can show, and an explosion that can stop. */
function countFaceReadiness(result, evaluation, thresholdMode) {
  const { pool, direction } = evaluation;
  const beyond = ['explode', 'cancel'].find(
    (kind) => pool[kind].enabled && faceBeyondDie(pool[kind].faces, pool.die)
  );
  result.checks.push({ id: 'countFacesOnDie', satisfied: !beyond });
  if (beyond) {
    const effect = beyondDieEffect(beyond, direction);
    const data = { kind: beyond, face: pool[beyond].faces.value, die: pool.die, effect };
    pushIssue(result.issues, 'countFaceBeyondDie', 'warning', data);
  }
  // Literal inputs, so only the face rules can refuse: the runtime's own every-face test.
  const literal = { ...evaluation, pool: { ...pool, base: '1', threshold: '1' } };
  const unbounded =
    resolvePool({ evaluation: literal, thresholdMode }).reason === 'explode-unbounded';
  result.checks.push({ id: 'countExplosionStops', satisfied: !unbounded });
  if (unbounded) pushIssue(result.issues, 'countExplodeUnbounded', 'critical');
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
function literalBaseDice(evaluation, thresholdMode) {
  const off = { enabled: false };
  const pool = { ...evaluation.pool, threshold: '1', explode: off, cancel: off };
  const placement = { preRolls: [], poolDelta: 0, thresholdDelta: 0 };
  return resolvePool({ evaluation: { ...evaluation, pool }, thresholdMode, placement });
}

/**
 * Recipe tiers set their own successes, and a literal base pool can meet every required count.
 * `literal` is the base's settled read, or null when the base reads the character or is faulted.
 */
function countRequiredReadiness(result, check, evaluation, { activity, literal }) {
  const { pool } = evaluation;
  const tiers = activity === 'crafting' && Array.isArray(check?.tiers) ? check.tiers : [];
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
      pushIssue(result.issues, 'countTierWithoutSuccesses', 'warning', data);
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
    pushIssue(result.issues, 'countRequiredExceedsMaxPool', 'critical', {
      ...overMax,
      ceiling: base,
    });
  }
  if (raisesAny(overBase)) {
    result.checks.push({ id: 'countRequiredWithinBasePool', satisfied: false });
    pushIssue(result.issues, 'countRequiredExceedsBasePool', 'warning', { ...overBase, base });
  }
}

/** The Preview-as actor's reading of a pool that reads the character. */
function previewActorPoolWarnings(transient, evaluation, thresholdMode, previewActor) {
  const rollData = previewActor.rollData ?? {};
  const read = resolvePool({ evaluation, thresholdMode, rollData });
  if (read.ok || !['base', 'threshold'].includes(read.refusedInput)) return;
  const actor = previewActor.name ?? '';
  if (read.reason !== 'unresolved-path') {
    pushIssue(transient, 'countValueNotNumericForPreview', 'warning', { actor });
    return;
  }
  const { base, threshold } = evaluation.pool;
  const paths = new Set([
    ...missingTargetPaths(base, rollData),
    ...missingTargetPaths(threshold, rollData),
  ]);
  const path = [...paths].join(', ');
  pushIssue(transient, 'countPathUnresolvedForPreview', 'warning', { actor, path });
}

/**
 * Readiness of a success-counting pool: its expressions, faces and required counts, and the
 * Preview-as actor's reading as `transient` warnings. Fixed ranges and progressive checks grade
 * no required count, so only the pool itself applies to them.
 */
function countReadiness(result, check, evaluation, { mode, activity, previewActor }) {
  const { base, threshold } = evaluation.pool;
  const thresholdMode = check?.thresholdMode === 'exceed' ? 'exceed' : 'meet';
  const baseFault = poolExpressionFault(base);
  result.checks.push({ id: 'countPoolReadable', satisfied: !baseFault });
  if (baseFault) pushIssue(result.issues, 'countPoolInvalid', 'critical');
  const thresholdFault = poolExpressionFault(threshold);
  result.checks.push({ id: 'countThresholdReadable', satisfied: !thresholdFault });
  if (thresholdFault) pushIssue(result.issues, 'countThresholdInvalid', 'critical');
  countFaceReadiness(result, evaluation, thresholdMode);
  const literal =
    baseFault || readsCharacter(base) ? null : literalBaseDice(evaluation, thresholdMode);
  if (literal?.reason === 'pool-too-large') {
    pushIssue(result.issues, 'countPoolTooLarge', 'critical', { max: MAX_COUNT_POOL });
  }
  const gradesRequired = mode === 'simple' || (mode === 'routed' && check?.type !== 'fixed');
  if (gradesRequired) countRequiredReadiness(result, check, evaluation, { activity, literal });
  if (previewActor && !baseFault && !thresholdFault) {
    previewActorPoolWarnings(result.transient, evaluation, thresholdMode, previewActor);
  }
}

/**
 * Readiness of a summed check's target, read only where the active activity and mode read it: a
 * progressive check's direction, and a character-value target's expression and adjustments. A
 * progressive or fixed-range target source is inert, so nothing about it is validated.
 * @returns {{ checks: CheckReadinessCheck[], issues: CheckReadinessIssue[],
 *   transient: CheckReadinessIssue[] }} */
function targetReadiness(check, { mode, activity, previewActor, overrideEntries = [] }) {
  const result = { checks: [], issues: [], transient: [] };
  const evaluation = normalizeCheckEvaluation(check?.evaluation);
  if (evaluation.product === 'count') {
    countReadiness(result, check, evaluation, { mode, activity, previewActor });
    return result;
  }
  if (mode === 'progressive') {
    if (evaluation.direction === 'under') {
      result.checks.push({ id: 'progressiveHigherIsBetter', satisfied: false });
      pushIssue(result.issues, 'progressiveUnderUnsupported', 'critical');
    }
    return result;
  }
  const { type, outcomes } = routedOutcomes(check);
  if (evaluation.target.source !== 'attribute' || (mode === 'routed' && type === 'fixed')) {
    return result;
  }
  attributeExpressionReadiness(result, evaluation.target.expression.trim(), previewActor);
  const tiers = activity === 'crafting' && Array.isArray(check?.tiers) ? check.tiers : [];
  recipeTierReadiness(result, tiers);
  const multiplyTiers =
    mode === 'routed' && evaluation.target.adjustmentKind === 'multiply' ? outcomes : [];
  adjustmentKindReadiness(
    result,
    evaluation.target,
    [...setAdjustments(tiers), ...setAdjustments(multiplyTiers)],
    overrideEntries
  );
  if (multiplyTiers.length > 0) otherwiseReadiness(result, multiplyTiers);
  return result;
}

/**
 * The roll formula's readiness, read post-shim as `checkUsable` reads it: one strip plan decides
 * both the formula tick and the retired-placeholder severity (a stripped placement is lossless, a
 * refused one discards the whole formula), with the legacy `rollExpression` alias planned the same
 * way. A count check's retained formula is inert, so it raises nothing and counts as a roll.
 */
function formulaReadiness(check, evaluation) {
  if (evaluation.product === 'count') return { checks: [], issues: [], hasRollFormula: true };
  const checks = [];
  const issues = [];
  const plan = planRetiredPlaceholderStrip(trimmed(check?.rollFormula));
  const hasRollFormula = plan.outcome !== 'refused' && trimmed(plan.formula) !== '';
  checks.push({ id: 'hasRollFormula', satisfied: hasRollFormula });
  if (!hasRollFormula) pushIssue(issues, 'noRollFormula', 'warning');
  const legacyPlan = planRetiredPlaceholderStrip(trimmed(check?.rollExpression));
  if (plan.outcome === 'refused' || legacyPlan.outcome === 'refused') {
    pushIssue(issues, 'retiredPlaceholderBreaksFormula', 'critical');
  } else if (plan.outcome === 'stripped' || legacyPlan.outcome === 'stripped') {
    pushIssue(issues, 'retiredPlaceholderInFormula', 'warning');
  }
  return { checks, issues, hasRollFormula };
}

/**
 * Evaluate one subsystem check's readiness.
 * @param {object} check Plain check draft (the active draft for its mode).
 * @param {object} [options]
 * @param {'routed'|'simple'|'progressive'|'none'} [options.mode] A {@link CHECK_READINESS_MODES}
 *   member, derived through {@link readinessModeForSlot}. An unrecognized mode THROWS rather
 *   than defaulting: a caller handing through a raw resolution mode skipped every rule silently.
 * @param {object|null} [options.modifierContext] A `buildCheckModifierContext` bag, or null.
 * @param {'crafting'|'salvage'|'gathering'} [options.activity] Which activity's check this is;
 *   it decides WHY a no-check mode's selection reaches no roll, and whether recipe tiers apply.
 * @param {?{name: string, rollData: object}} [options.previewActor] The Preview-as character,
 *   whose unreadable target value raises a `transient` warning naming them.
 * @param {object[]} [options.components] Every component; `activity: 'salvage'` grades each
 *   salvage-enabled one's kept override (issue 2078).
 * @param {object[]} [options.gatheringTasks] Every gathering task; `activity: 'gathering'`
 *   grades each routed one's kept override the same way.
 * @returns {{ checks: CheckReadinessCheck[], issues: CheckReadinessIssue[],
 *   transient: CheckReadinessIssue[] }} */
export function evaluateCheckReadiness(check = {}, options = {}) {
  const mode = options.mode || 'simple';
  if (!SUPPORTED_MODES.has(mode)) {
    throw new Error(
      `checksReadiness: unsupported mode "${mode}" — pass a CHECK_READINESS_MODES member, ` +
        'derived from the resolved check slot with readinessModeForSlot()'
    );
  }
  const modifierContext = options.modifierContext ?? null;
  const checks = [];
  const issues = [];

  // A mode with NO CHECK TO AUTHOR. NOT A BARE EARLY RETURN: a check-modifier selection is
  // authored regardless of the resolution mode, so `modifiersInertNoCheck` here is the only
  // owned path for one reaching a mode that rolls nothing. AND IT MUST NOT REPORT
  // `noRollFormula`, which a second resolution-mode mapping once made it do for alchemy `none`
  // — a permanent rail badge against a route rendering no formula field to clear it with.
  if (mode === NO_CHECK_MODE) {
    const modifiers = checkModifierReadiness(modifierContext, {
      rollsNoCheck: true,
      hasRollFormula: false,
      activity: options.activity || '',
    });
    return { checks: modifiers.checks, issues: modifiers.issues, transient: [] };
  }

  const evaluation = normalizeCheckEvaluation(check?.evaluation);
  const formula = formulaReadiness(check, evaluation);
  checks.push(...formula.checks);
  issues.push(...formula.issues);
  const { hasRollFormula } = formula;

  // Routed checks route an outcome tier to a result set by tier NAME, and only SUCCESS tiers
  // can be routed, so the rules below wait until at least one tier is authored.
  if (mode === 'routed') {
    const { type, outcomes } = routedOutcomes(check);
    if (outcomes.length > 0) {
      const allNamed = outcomes.every((outcome) => trimmed(outcome?.name) !== '');
      checks.push({ id: 'outcomesNamed', satisfied: allNamed });
      if (!allNamed) {
        pushIssue(issues, 'unnamedOutcome', 'critical');
      }

      const hasSuccess = outcomes.some((outcome) => outcome?.success === true);
      checks.push({ id: 'hasSuccessOutcome', satisfied: hasSuccess });
      if (!hasSuccess) {
        pushIssue(issues, 'noSuccessOutcome', 'critical');
      }

      // Fixed tiers own a CONTIGUOUS, non-overlapping segment of the roll value range, and all
      // three faults are `critical`: no copy or test may describe `rangeInvalid` or
      // `rangeOverlap` as a warning, each leaving a roll value routed wrongly or not at all.
      if (type === 'fixed') {
        const conflicts = findRangeConflicts(outcomes);
        const rangesValid = conflicts.invalid.size === 0;
        const rangesNoOverlap = conflicts.overlapping.size === 0;
        checks.push({ id: 'rangesValid', satisfied: rangesValid });
        if (!rangesValid) {
          pushIssue(issues, 'rangeInvalid', 'critical');
        }
        checks.push({ id: 'rangesNoOverlap', satisfied: rangesNoOverlap });
        if (!rangesNoOverlap) {
          pushIssue(issues, 'rangeOverlap', 'critical');
        }
        const excluded = new Set([...conflicts.invalid, ...conflicts.overlapping]);
        const gapped = fixedRangesHaveGap(outcomes, excluded);
        checks.push({ id: 'rangesContiguous', satisfied: !gapped });
        if (gapped) {
          pushIssue(issues, 'rangeGap', 'critical');
        }
      }
    }

    // Outside the tier-count gate on purpose: a target authored before any tier exists is
    // exactly the dangling case a GM needs told about.
    const tierStep = tierStepTargetReadiness(check, outcomes);
    checks.push(...tierStep.checks);
    issues.push(...tierStep.issues);
  }

  const overrideEntries = overrideEntriesFor(options.activity, options);
  const target = targetReadiness(check, {
    mode,
    activity: options.activity || '',
    previewActor: options.previewActor ?? null,
    overrideEntries,
  });
  checks.push(...target.checks);
  issues.push(...target.issues);

  // The check-modifier selection, last: it reads `hasRollFormula` above to decide whether
  // an eligible selection reaches a roll at all.
  const modifiers = checkModifierReadiness(modifierContext, {
    rollsNoCheck: false,
    hasRollFormula,
  });
  checks.push(...modifiers.checks);
  issues.push(...modifiers.issues);

  return { checks, issues, transient: target.transient };
}
