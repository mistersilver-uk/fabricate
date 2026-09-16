import {
  modifierExpressionResolves,
  resolveEligibleModifierIds,
  resolveModifierBounds,
} from '../../../../../systems/checkModifierResolver.js';
import {
  findRangeConflicts,
  planRetiredPlaceholderStrip,
} from '../../../../../utils/craftingCheckExpression.js';

/**
 * Pure readiness evaluator for a single subsystem check (crafting, salvage or gathering).
 * Mirrors `recipeReadiness.js`: it returns stable check/issue ids the Checks Validation tab maps
 * to localized copy, so that tab is the one canonical place a GM sees what is wrong with a check.
 *
 * @typedef {{ id: string, satisfied: boolean }} CheckReadinessCheck
 * @typedef {{ id: string, severity: 'critical' | 'warning' | 'info' }} CheckReadinessIssue
 */

/**
 * EVERY issue id this evaluator can raise — the SOURCE OF TRUTH, not a summary, inline literals
 * being enumerable only by reaching every branch.
 *
 * IT IS A GUARD, NOT A CONVENTION: `pushIssue` is the ONLY way an issue reaches the returned
 * list and it THROWS on an unregistered id, and `tests/checks-readiness.test.js` also scans this
 * file's source, so a direct `push` is caught on an unreached branch too.
 *
 * @type {ReadonlyArray<string>}
 */
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
  'modifiersInertNoCheck',
  'modifiersInertNoModifierSupport',
  'modifiersInertNoFormula',
]);

const REGISTERED_ISSUE_IDS = new Set(CHECK_READINESS_ISSUE_IDS);

/**
 * The five sections an activity route renders, in reading order: the `data-checks-section`
 * values the strip emits, declared once beside the registry that buckets into them.
 * @type {ReadonlyArray<string>}
 */
export const CHECK_SECTION_IDS = Object.freeze([
  'roll',
  'outcomes',
  'triggers',
  'modifiers',
  'on-failure',
]);

/**
 * Which SECTION owns each readiness issue: the strip's dots, the rail's badge and the Validation
 * deep links all read this one map. PROVEN EXHAUSTIVE in BOTH directions by
 * `tests/checks-readiness.test.js` against {@link CHECK_READINESS_ISSUE_IDS}.
 *
 * `rangeGap` buckets to Outcomes rather than The roll: the hole is between two authored TIERS,
 * and the tier rows that close it are on Outcomes.
 *
 * @type {Readonly<Record<string, string>>}
 */
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
  modifiersInertNoCheck: 'modifiers',
  modifiersInertNoModifierSupport: 'modifiers',
  modifiersInertNoFormula: 'modifiers',
});

/**
 * The mode this evaluator answers "this activity rolls no check at all" under. Gathering `d100`
 * and alchemy `none` are the two reachable members, differing only in WHY, which the modifier
 * issue splits on. The name is "no check to AUTHOR", not a claim that nothing is rolled.
 * @type {'none'}
 */
export const NO_CHECK_MODE = 'none';

/**
 * Every mode {@link evaluateCheckReadiness} dispatches on. Frozen, and enforced below.
 * @type {ReadonlyArray<string>}
 */
export const CHECK_READINESS_MODES = Object.freeze(['simple', 'routed', 'progressive', 'none']);

const SUPPORTED_MODES = new Set(CHECK_READINESS_MODES);

/**
 * The readiness mode for a RESOLVED check slot. No subsystem's AUTHORED resolution mode is ever
 * `routed`, so something has to translate, and the translation is ALREADY OWNED by
 * `checkModifierResolver`'s slot maps, which decide which sub-config the ENGINE rolls.
 *
 * SO THIS TAKES THE SLOT, NOT THE MODE, which is the whole point of the signature: a second
 * mapping is how the rail badge came to evaluate the alchemy SIMPLE draft under ROUTED rules,
 * and to demand a roll formula for a mode whose route renders no formula field. The slot names
 * ARE the readiness modes, so this is total but for `null`, which becomes
 * {@link NO_CHECK_MODE}.
 *
 * @param {'simple'|'routed'|'progressive'|null|undefined} slot The `slot` field of
 *   `resolveActiveCraftingCheckFormula`, `resolveActiveSalvageCheckFormula` or
 *   `resolveActiveGatheringCheckFormula`.
 * @returns {'simple'|'routed'|'progressive'|'none'}
 */
export function readinessModeForSlot(slot) {
  return slot || NO_CHECK_MODE;
}

/**
 * The section that owns an issue id, or `null` for an id no bucket claims — deliberately not a
 * default section, which would put a dot on a section whose controls cannot clear it.
 *
 * @param {string} id A {@link CHECK_READINESS_ISSUE_IDS} member.
 * @returns {string|null}
 */
export function sectionForIssue(id) {
  return CHECK_ISSUE_SECTIONS[id] ?? null;
}

/**
 * Append one issue, refusing any id not in {@link CHECK_READINESS_ISSUE_IDS}. The throw is the
 * mechanism: a frozen exported array is only a convention. `data` is the optional interpolation
 * payload for an issue whose sentence NAMES something, attached only when supplied.
 *
 * @param {CheckReadinessIssue[]} issues
 * @param {string} id
 * @param {'critical'|'warning'|'info'} severity
 * @param {object|null} [data] Interpolation values for the issue's localized sentence.
 */
function pushIssue(issues, id, severity, data = null) {
  if (!REGISTERED_ISSUE_IDS.has(id)) {
    throw new Error(
      `checksReadiness: unregistered issue id "${id}" — add it to CHECK_READINESS_ISSUE_IDS ` +
        'so every surface that buckets these ids can see it'
    );
  }
  issues.push(data === null ? { id, severity } : { id, severity, data });
}

function trimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * The active outcome-tier list for a routed check. Relative and fixed tiers are
 * independent lists; only the active type's list is authored/validated.
 * @param {object} check
 * @returns {{ type: 'relative' | 'fixed', outcomes: object[] }}
 */
function routedOutcomes(check) {
  const type = check?.type === 'fixed' ? 'fixed' : 'relative';
  const key = type === 'fixed' ? 'fixedOutcomes' : 'relativeOutcomes';
  return { type, outcomes: Array.isArray(check?.[key]) ? check[key] : [] };
}

/**
 * Readiness of a routed check's tier-STEP targets, reported only once a trigger sets
 * `tierStep.mode === 'target'`. Two rules share one green tick, both saying the same thing: the
 * targets on this check name exactly one existing tier. A DANGLING target no-ops at runtime and
 * is reachable by ordinary authoring, the relative↔fixed switch dangling every `tierId` at once;
 * MULTIPLE targets are guidance rather than breakage, a static count not knowing which
 * conditions will match.
 *
 * @param {object} check    Plain check draft.
 * @param {object[]} outcomes The ACTIVE outcome-tier list (relative or fixed).
 * @returns {{ checks: CheckReadinessCheck[], issues: CheckReadinessIssue[] }}
 */
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
 *
 * SPAN-INTERIOR ONLY: a set that does not cover every value a die can roll is NOT a gap, but a
 * deliberate window. Invalid and overlapping ranges are excluded first, both raising their own
 * `critical` and a `start > end` range otherwise manufacturing a phantom gap.
 *
 * @param {object[]} outcomes The active FIXED outcome-tier list.
 * @param {Set<number>} excluded Indices already reported invalid or overlapping.
 * @returns {boolean}
 */
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
 * Readiness of the check-modifier selection for this activity. Every rule is keyed on what this
 * activity would ACTUALLY roll rather than on what the catalogue contains, because the catalogue
 * is shared by all three and a gathering check has no business reporting a crafting-only entry.
 * Eligibility is resolved through the resolver's own `resolveEligibleModifierIds`, so readiness
 * and the roll cannot disagree about which entries apply.
 *
 * A ROLL-SHAPED EXPRESSION IS NOT ONE OF THEM: a check appends a rolling modifier AS DICE, so
 * the blocking `modifierRollExpression` is RETIRED rather than reworded
 * (`openspec/specs/resolution-modes/spec.md` → "Check Source").
 *
 * - **`modifierBoundsInverted`** and **`modifierBoundsUnsafe`** (`critical`, BLOCKING) are the
 *   two bounds faults `openspec/specs/resolution-modes/spec.md` → "Check Source" states, kept
 *   as SEPARATE ids there and here because the two need different repairs.
 * - **`modifierExpressionInvalid`** (`critical`, BLOCKING). An eligible entry whose EXPRESSION
 *   cannot contribute at all — text the reducer cannot read, or a fragment the engine cannot
 *   roll. Bounds faults are excluded from it deliberately: they are reported above under
 *   repairs of their own, and one entry named under two different instructions is worse.
 * - All three NAME the offending entries, because a shared library can be long, and are raised
 *   ONLY for entries this activity selects: a fault on an entry only gathering drop rows
 *   reference is not this check's problem.
 * - **`modifiersInertNoCheck` / `modifiersInertNoModifierSupport` / `modifiersInertNoFormula`**
 *   (`warning`): an eligible selection reaching no roll, under each of the three reasons it can.
 *   These are the ONE owned path for that state, and they are gated on the selection being
 *   NON-EMPTY, because warning that nothing does anything when nothing was authored is noise.
 *
 * @param {object|null} modifierContext A `buildCheckModifierContext` bag, or null when the
 *   caller has no system to build one from (every assertion below then no-ops).
 * @param {{ rollsNoCheck: boolean, hasRollFormula: boolean }} formulaState
 * @returns {{ checks: CheckReadinessCheck[], issues: CheckReadinessIssue[] }}
 */
/**
 * The offending entries' display names, comma-joined, or `''` when none are faulted. The
 * label is preferred and the id is the fallback, so an unnamed entry is still locatable.
 * @param {Array<{entry: object}>} faulted
 * @returns {string}
 */
function namesOf(faulted) {
  return faulted.map(({ entry }) => entry.label || entry.id).join(', ');
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
  const unusable = namesOf(
    faulted.filter(
      ({ entry, bounds }) =>
        !bounds.inverted && !bounds.unsafe && !modifierExpressionResolves(entry)
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
  // The two no-check modes reach no roll for OPPOSITE reasons, so they cannot share a sentence:
  // alchemy `none` rolls nothing, while gathering `d100` rolls and has no seam for modifiers.
  if (rollsNoCheck) {
    const id =
      activity === 'gathering' ? 'modifiersInertNoModifierSupport' : 'modifiersInertNoCheck';
    pushIssue(issues, id, 'warning');
  } else if (!hasRollFormula) pushIssue(issues, 'modifiersInertNoFormula', 'warning');
  return { checks, issues };
}

/**
 * Evaluate one subsystem check's readiness.
 *
 * @param {object} check Plain check draft (the active draft for its mode).
 * @param {object} [options]
 * @param {'routed'|'simple'|'progressive'|'none'} [options.mode] The mode to evaluate under, a
 *   {@link CHECK_READINESS_MODES} member callers derive through {@link readinessModeForSlot}.
 *   An unrecognized mode THROWS rather than defaulting: a caller handing through a raw
 *   resolution mode silently skipped every rule that mode has.
 * @param {object|null} [options.modifierContext] A `buildCheckModifierContext` bag, omitted by
 *   a caller with no system to build one from, in which case no modifier rule is evaluated.
 * @param {'crafting'|'salvage'|'gathering'} [options.activity] Which activity's check this is.
 *   It changes exactly one answer — WHY a no-check mode's modifier selection reaches no roll —
 *   and omitting it keeps the mode-rolls-nothing reading.
 * @returns {{ checks: CheckReadinessCheck[], issues: CheckReadinessIssue[] }}
 */
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
    return { checks: modifiers.checks, issues: modifiers.issues };
  }

  // Every authored check needs a roll formula to resolve, READ POST-SHIM, which is the whole
  // point of this derivation: `checkUsable` is post-shim, so reading the RAW field ticked "Has a
  // roll formula" green for a check that cannot roll, falsifying the invariant
  // `resolution-modes/spec.md` asserts. ONE PLAN, not one plan and one classifier: deriving BOTH
  // the formula tick and the severity split below from this single call makes them incapable of
  // disagreeing.
  const authoredFormula = trimmed(check?.rollFormula);
  const plan = planRetiredPlaceholderStrip(authoredFormula);
  const hasRollFormula = plan.outcome !== 'refused' && trimmed(plan.formula) !== '';
  checks.push({ id: 'hasRollFormula', satisfied: hasRollFormula });
  if (!hasRollFormula) {
    pushIssue(issues, 'noRollFormula', 'warning');
  }

  // The retired check-modifier placeholder, typed after its retirement: the formula field is
  // free text, and the shim would remove it SILENTLY on the way to the roll.
  //
  // THE SEVERITY SPLITS ON THE STRIP OUTCOME, the two cases needing opposite advice. A STRIPPED
  // placement is ignorable, the removal being lossless, and a placeholder-ONLY formula is the
  // degenerate case reported by `hasRollFormula` above rather than merged into this one. A
  // REFUSED placement discards the WHOLE formula, so "just delete the placeholder" is actively
  // wrong: deleting it out of `1d20 * @craftingmod` leaves `1d20 * `, still broken.
  //
  // IT ASKS THE DECIDER, NOT THE CLASSIFIER, which is not cosmetic: the classifier covers only
  // the first half of usability, where `planRetiredPlaceholderStrip` refuses a non-additive
  // placement AND an additive one whose residue is structurally incomplete. One decider is the
  // only way two surfaces give one instruction. The legacy `routed.rollExpression` alias is
  // planned too, DEFENSIVELY — no draft this tab is handed carries a live one — through that
  // same decider, so the two branches cannot answer differently.
  const legacyPlan = planRetiredPlaceholderStrip(trimmed(check?.rollExpression));
  if (plan.outcome === 'refused' || legacyPlan.outcome === 'refused') {
    pushIssue(issues, 'retiredPlaceholderBreaksFormula', 'critical');
  } else if (plan.outcome === 'stripped' || legacyPlan.outcome === 'stripped') {
    pushIssue(issues, 'retiredPlaceholderInFormula', 'warning');
  }

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

  // The check-modifier selection, last: it reads `hasRollFormula` above to decide whether
  // an eligible selection reaches a roll at all.
  const modifiers = checkModifierReadiness(modifierContext, {
    rollsNoCheck: false,
    hasRollFormula,
  });
  checks.push(...modifiers.checks);
  issues.push(...modifiers.issues);

  return { checks, issues };
}
