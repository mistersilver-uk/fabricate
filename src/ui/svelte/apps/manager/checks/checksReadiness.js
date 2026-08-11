import {
  resolveEligibleModifierIds,
  resolveModifierBounds,
} from '../../../../../systems/checkModifierResolver.js';
import {
  findRangeConflicts,
  planRetiredPlaceholderStrip,
} from '../../../../../utils/craftingCheckExpression.js';

/**
 * Pure readiness evaluator for a single subsystem check (crafting, salvage, or
 * gathering). Mirrors `recipeReadiness.js`: it returns stable check/issue ids
 * that the Checks Validation tab maps to localized copy, so the tab is the one
 * canonical place a GM sees what is wrong with a check — the rules previously
 * lived inline inside `CraftingCheckEditor` and are surfaced here instead.
 *
 * @typedef {{ id: string, satisfied: boolean }} CheckReadinessCheck
 * @typedef {{ id: string, severity: 'critical' | 'warning' | 'info' }} CheckReadinessIssue
 */

/**
 * EVERY issue id this evaluator can raise — the SOURCE OF TRUTH, not a summary (issue
 * 1095).
 *
 * Until now every id was an inline string literal in the function body, and the only way
 * to enumerate them was to call the function with enough fixtures to reach every branch —
 * which cannot prove the set complete, because an unreached branch contributes nothing.
 * Downstream surfaces need the whole set (the Checks Validation route buckets each id to
 * a section), and a hand-copied mirror of an unprovable list is how those two drift.
 *
 * IT IS A GUARD, NOT A CONVENTION. `pushIssue` below is the ONLY way an issue reaches the
 * returned list and it THROWS on an unregistered id, so `issues.push({ id: 'newThing' })`
 * cannot quietly work: adding an id without registering it fails the first test that
 * reaches the branch, and `tests/checks-readiness.test.js` additionally scans this file's
 * source text so an id added by direct `push` is caught even on an unreached branch.
 *
 * Frozen, so a consumer cannot mutate the set process-wide.
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
  'modifiersInertNoCheck',
  'modifiersInertNoFormula',
]);

const REGISTERED_ISSUE_IDS = new Set(CHECK_READINESS_ISSUE_IDS);

/**
 * The five sections an activity route renders, in reading order (issue 1096).
 *
 * These are the `data-checks-section` values the section strip emits and the ids the
 * Validation route deep-links to, so they are declared once here beside the issue registry
 * that buckets into them rather than as string literals in two components.
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
 * Which SECTION owns each readiness issue (issue 1096).
 *
 * The section strip's warning dots, the rail's per-activity badge and the Validation
 * route's deep links are all fed from this one map, so the three cannot disagree about
 * where a problem lives.
 *
 * IT IS PROVEN EXHAUSTIVE, not merely kept in step by convention.
 * `tests/checks-readiness.test.js` asserts this object's key set EQUALS
 * {@link CHECK_READINESS_ISSUE_IDS} — the registry `pushIssue` refuses to emit outside — in
 * BOTH directions: an id added to the registry without a bucket fails, and a bucket naming
 * an id the registry does not carry fails too. Bucketing "by issue id" against a
 * hand-copied second list is exactly how a new id (issue 1095 added three) comes to bucket
 * nowhere and silently stops raising a dot.
 *
 * `rangeGap` buckets to Outcomes rather than to The roll: the hole is between two authored
 * TIERS, and the tier rows that close it are on Outcomes.
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
  modifiersInertNoCheck: 'modifiers',
  modifiersInertNoFormula: 'modifiers',
});

/**
 * The mode this evaluator answers "this activity rolls no check at all" under (issue 1096).
 *
 * Gathering `d100` and alchemy `checkMode: 'none'` are the two reachable members, and they
 * are the SAME state as far as readiness is concerned: there is no formula, no outcome tier
 * and no trigger to author, and the only rule that still applies is whether an authored
 * check-modifier selection reaches a roll (it does not).
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
 * The readiness mode for a RESOLVED check slot (issue 1096).
 *
 * `evaluateCheckReadiness` branches on `mode === 'routed'`, but no subsystem's authored
 * resolution mode is ever that string: crafting's is `routedByCheck`, `routedByIngredients`,
 * `simple`, `progressive` or `alchemy`, and alchemy's shape is its `checkMode` rather than
 * its resolution mode. Something has to translate — and the translation is ALREADY OWNED, by
 * `checkModifierResolver`'s `CRAFTING_CHECK_SLOTS` / `ALCHEMY_CHECK_SLOTS` /
 * `GATHERING_CHECK_SLOTS` maps, which decide which sub-config the ENGINE actually rolls.
 *
 * SO THIS TAKES THE SLOT, NOT THE MODE, and that is the whole point of the signature. A
 * second mapping from resolution mode to readiness mode is how the rail badge came to
 * evaluate the alchemy SIMPLE draft under ROUTED rules (the badge's draft was picked by one
 * mapping and its rules by another) and to demand a roll formula for alchemy `none`, a mode
 * that rolls nothing and whose route renders no formula field to clear it with. Reading the
 * slot means the check being evaluated and the rules it is evaluated under are chosen by the
 * same decision.
 *
 * The slot names ARE the readiness modes — `simple`, `routed`, `progressive` — so this is a
 * total function with exactly one interesting case: `null`, which the resolvers return for a
 * mode that rolls no check at all, becomes {@link NO_CHECK_MODE}.
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
 * The section that owns an issue id, or `null` for an id no bucket claims.
 *
 * Returning `null` rather than a default section is deliberate: an unbucketed id is a
 * defect the test above catches at build time, and silently filing it under "The roll"
 * would put a dot on a section whose controls cannot clear it.
 *
 * @param {string} id A {@link CHECK_READINESS_ISSUE_IDS} member.
 * @returns {string|null}
 */
export function sectionForIssue(id) {
  return CHECK_ISSUE_SECTIONS[id] ?? null;
}

/**
 * Append one issue, refusing any id not in {@link CHECK_READINESS_ISSUE_IDS}.
 *
 * The throw is the mechanism. A frozen exported array is only a convention — nothing stops
 * a later edit pushing a literal straight onto `issues` — so the registry is made
 * load-bearing by routing every emit through here. The failure is loud and immediate
 * rather than a silently under-bucketed row on the Validation route.
 *
 * `data` is the optional interpolation payload for an issue whose sentence NAMES something
 * (issue 1117): the two bounds faults have to say WHICH entries carry them, because a shared
 * library can be long and "one of your modifiers has a bad bound" is not a repairable
 * instruction. The key is attached only when supplied, so every other issue keeps its
 * exact two-key shape and no consumer has to guard for it.
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
 * Readiness of a routed check's tier-STEP targets (issue 975), reported only once at
 * least one trigger sets `tierStep.mode === 'target'` — mirroring the outcome-tier
 * rules, which stay silent until a tier is authored.
 *
 * Two rules share one green tick, because both say the same thing to a GM: the
 * targets on this check name exactly one existing tier.
 *
 * - A DANGLING target (including one that has chosen no tier at all) no-ops at
 *   runtime; the relative↔fixed type switch dangles every `tierId` at once, so this
 *   is reachable by ordinary authoring and not only by import.
 * - MULTIPLE targets are guidance, not breakage. This is a static authoring count:
 *   it cannot know which conditions will match, or whether a roll will be forced, so
 *   it reports what happens if more than one does rather than calling the check broken.
 *
 * Extracted rather than inlined so the tier-step rules do not add branches to the
 * already-branchy `evaluateCheckReadiness`.
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
 * Whether a FIXED outcome set leaves a GAP — a roll value inside the set's own span that
 * no tier claims (issue 1095, DN6).
 *
 * `findRangeConflicts` sees only OVERLAP and `start > end`, so a gapped set — Slag 1–9,
 * Rough 11–17, with 10 claimed by nobody — raises nothing at all today. That state is
 * reachable by ordinary authoring (edit one boundary and stop), and a fixed routed check
 * has no `clampToNearest` rescue: a roll of 10 matches no tier, so the attempt is rolled
 * but unrouted. The band strip's fallback note is its only signal, and that note never
 * reaches the section dot, the rail badge or the Validation route — so the four surfaces
 * disagree about whether the check is ready.
 *
 * SPAN-INTERIOR ONLY. The gap is measured between the set's own minimum and maximum, so a
 * set that simply does not cover every value a die can roll is NOT a gap: `2d20` rolls
 * 2–40 and a GM who authors 7–34 has authored a deliberate window, not a mistake. Only a
 * hole BETWEEN two authored tiers is reported.
 *
 * Invalid and overlapping ranges are excluded first: both already raise their own
 * `critical`, and a `start > end` range would otherwise manufacture a phantom gap.
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
  // Anything larger leaves at least one unclaimed value between the two.
  let reach = spans[0].end;
  for (const span of spans.slice(1)) {
    if (span.start > reach + 1) return true;
    reach = Math.max(reach, span.end);
  }
  return false;
}

/**
 * Readiness of the check-modifier selection for this activity (issue 1095).
 *
 * Two rules, both keyed on what this activity would ACTUALLY roll rather than on what the
 * catalogue contains, because the catalogue is shared by all three activities and a
 * gathering check has no business reporting a crafting-only entry:
 *
 * A ROLL-SHAPED EXPRESSION IS NOT ONE OF THEM (issue 1118). Between issues 1117 and 1118 an
 * eligible entry whose expression rolled dice raised a blocking `modifierRollExpression`,
 * because a check appended one resolved scalar as a dice-grammar `Constant` and a roll
 * cannot be one. A check now appends a rolling modifier AS DICE, so the rule it enforced no
 * longer exists and the id is retired rather than reworded — there is nothing left to report
 * about an entry that rolls.
 *
 * - **`modifierBoundsInverted`** (`critical`, BLOCKING). An entry whose authored
 *   `min > max` contributes nothing until it is repaired — the refuse posture
 *   `INVALID_CHARACTER_MODIFIER_BOUNDS` already takes for gathering drop modifiers,
 *   adopted deliberately so a check modifier and a drop modifier fail the same way. It is
 *   not a warning: the entry is silently worth nothing, which is exactly the class of
 *   defect readiness exists to surface. A dice expression does not exempt an entry from it:
 *   the bounds clamp a rolled result exactly as they clamped a resolved number.
 * - **`modifierBoundsUnsafe`** (`critical`, BLOCKING). An entry whose authored bound is
 *   finite but not expressible as a dice-grammar `Constant` — `1e21`, `1e-7`. It is a
 *   SEPARATE id rather than a second cause folded into the one above, because the two need
 *   different advice: "your minimum is above your maximum" and "this number is too large to
 *   roll" are not the same repair. It is `critical` for a stronger reason than its sibling:
 *   the resolver contains it to the offending entry, but the bound it would otherwise clamp
 *   to poisons the flat SUM, and `appendCheckModifierTerm` drops the WHOLE term for an
 *   exponent-notation value — so before the containment this single entry deleted every
 *   other flat modifier from the roll. It bites a rolling entry the same way, where the
 *   bound would be emitted into a `min(…)`/`max(…)` the grammar cannot parse.
 * - Both NAME the offending entries, because a shared library can be long and "one of your
 *   modifiers has a bad bound" is not a repairable instruction. They are raised ONLY for
 *   entries this activity actually selects: a fault on an entry only gathering drop rows
 *   reference is not this check's problem.
 * - **`modifiersInertNoCheck` / `modifiersInertNoFormula`** (`warning`). An eligible
 *   selection that reaches no roll. These are the ONE owned path for "the gathering d100
 *   check-modifier section reports `noCheck`", and they are gated on the selection being
 *   NON-EMPTY for the same reason `CraftingModifierCatalogueCard` gates its notice on a
 *   non-empty catalogue: warning that nothing does anything, when nothing was authored,
 *   is noise on first contact.
 *
 * Eligibility is resolved through the resolver's own `resolveEligibleModifierIds`, so
 * readiness and the roll cannot disagree about which entries this activity applies.
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

function checkModifierReadiness(modifierContext, { rollsNoCheck, hasRollFormula }) {
  if (!modifierContext) return { checks: [], issues: [] };
  const eligible = resolveEligibleModifierIds(modifierContext);
  if (eligible.length === 0) return { checks: [], issues: [] };

  const catalogue = Array.isArray(modifierContext.catalogue) ? modifierContext.catalogue : [];
  const byId = new Map(
    catalogue
      .filter((entry) => entry && typeof entry === 'object' && typeof entry.id === 'string')
      .map((entry) => [entry.id, entry])
  );
  // The offending ENTRIES, not just a boolean: a shared library can be long, and "one of
  // your modifiers has a bad bound" is not a repairable instruction.
  const faulted = eligible
    .map((id) => ({ entry: byId.get(id), bounds: resolveModifierBounds(byId.get(id)) }))
    .filter(({ entry }) => Boolean(entry));
  const inverted = namesOf(faulted.filter(({ bounds }) => bounds.inverted));
  const unsafe = namesOf(faulted.filter(({ bounds }) => bounds.unsafe));

  const issues = [];
  const checks = [{ id: 'modifierBoundsValid', satisfied: inverted === '' && unsafe === '' }];
  if (inverted !== '') pushIssue(issues, 'modifierBoundsInverted', 'critical', { names: inverted });
  if (unsafe !== '') pushIssue(issues, 'modifierBoundsUnsafe', 'critical', { names: unsafe });
  if (rollsNoCheck) pushIssue(issues, 'modifiersInertNoCheck', 'warning');
  else if (!hasRollFormula) pushIssue(issues, 'modifiersInertNoFormula', 'warning');
  return { checks, issues };
}

/**
 * Evaluate one subsystem check's readiness.
 *
 * @param {object} check Plain check draft (the active draft for its mode).
 * @param {object} [options]
 * @param {'routed'|'simple'|'progressive'|'none'} [options.mode] The mode to evaluate
 *   under — a {@link CHECK_READINESS_MODES} member, which callers derive from the ENGINE's
 *   resolved slot through {@link readinessModeForSlot}. An unrecognized mode THROWS rather
 *   than defaulting: a caller handing through a raw resolution mode (`routedByCheck`,
 *   `alchemy`, `d100`) silently skipped every rule that mode has, on the one surface a GM
 *   consults to find out whether a check works, and a default is what made that silent.
 * @param {object|null} [options.modifierContext] A `buildCheckModifierContext` bag for
 *   this activity (issue 1095). Omitted by a caller that has no system to build one from,
 *   in which case no check-modifier rule is evaluated.
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

  // A mode that rolls NO CHECK AT ALL: gathering `d100` (the fixed roll against each drop's
  // chance) and alchemy `checkMode: 'none'`. There is nothing to author and therefore no
  // formula, no outcome tiers and no triggers to validate.
  //
  // IT IS NOT A BARE EARLY RETURN (issue 1095). The check-modifier selection is authored on
  // the activity's check regardless of the resolution mode, so a GM can author one and reach
  // a mode that rolls nothing. Reporting `modifiersInertNoCheck` here is the only owned path
  // for that state; returning empty left it unreported.
  //
  // AND IT MUST NOT REPORT `noRollFormula` (issue 1096). It did, for alchemy `none`, because
  // a second resolution-mode mapping coerced that mode to `simple`: a permanent "1 issue"
  // badge on the rail, raised against a route that renders no formula field, so no control
  // the GM could reach would ever clear it.
  if (mode === NO_CHECK_MODE) {
    const modifiers = checkModifierReadiness(modifierContext, {
      rollsNoCheck: true,
      hasRollFormula: false,
    });
    return { checks: modifiers.checks, issues: modifiers.issues };
  }

  // Every authored check needs a roll formula to resolve. Mirrors the
  // system-level "warn always" rule for a missing routed/progressive formula.
  //
  // READ POST-SHIM (issue 1094), and this is the whole point of the derivation rather than
  // a `trimmed(check?.rollFormula)`. `checkUsable` — the value the engine, the inert-cause
  // projection and the recipe editor all dispatch on — is post-shim, so reading the RAW
  // field here made this tab tick "Has a roll formula" green for `@craftingmod`,
  // `1d20 * @craftingmod` and `max(@craftingmod, 2)`: a check that cannot roll at all,
  // reported as ready, inside the module named `checksReadiness`. That falsified the
  // invariant `resolution-modes/spec.md` asserts, on the one surface a GM consults to find
  // out whether a check works.
  //
  // ONE PLAN, not one plan and one classifier. `planRetiredPlaceholderStrip` is the same
  // decider `stripRetiredModifierPlaceholder` (and therefore `checkUsable`) reduces, so
  // deriving BOTH the formula tick and the severity split below from this single call is
  // what makes them incapable of disagreeing — see the split's own note for the rows that
  // caught them disagreeing.
  const authoredFormula = trimmed(check?.rollFormula);
  const plan = planRetiredPlaceholderStrip(authoredFormula);
  const hasRollFormula = plan.outcome !== 'refused' && trimmed(plan.formula) !== '';
  checks.push({ id: 'hasRollFormula', satisfied: hasRollFormula });
  if (!hasRollFormula) {
    pushIssue(issues, 'noRollFormula', 'warning');
  }

  // The retired check-modifier placeholder, typed after its retirement (issue 1094). The
  // formula field is free text, so nothing stops a GM who read an old guide from typing
  // it, and the shim would then remove it SILENTLY on the way to the roll.
  //
  // THE SEVERITY SPLITS ON THE STRIP OUTCOME, because the two cases need opposite advice.
  // A STRIPPED placement is genuinely ignorable: the removal is lossless, so whatever was
  // authored around it still rolls, the modifiers still apply, and only what the GM
  // believes about WHY is wrong — so "it is ignored and removed before the roll, delete it"
  // is true and a warning is proportionate. (A placeholder-ONLY formula is the degenerate
  // case: it strips losslessly to nothing, and `hasRollFormula` above is what reports that
  // there is no formula left, because "delete the placeholder" and "author a formula" are
  // different instructions and must not be merged into one issue.) A REFUSED
  // one is not ignorable: the whole formula is discarded and the check does not roll at all, and
  // telling that GM to "just delete the placeholder" is actively wrong, because deleting it
  // out of `1d20 * @craftingmod` or `max(@craftingmod, 2)` leaves `1d20 * ` or `max(, 2)` —
  // still broken. That one is critical and says the formula must be rewritten.
  //
  // IT ASKS THE DECIDER, NOT THE CLASSIFIER, and the distinction is not cosmetic. This
  // split used to test `describeRetiredModifierPlaceholder(...).nonAdditive`, which is only
  // the FIRST half of what decides usability: `planRetiredPlaceholderStrip` refuses a
  // non-additive placement AND an additive one whose residue is structurally incomplete.
  // The two disagree on exactly the rows the residue check was added for — `1d20 * -@craftingmod`,
  // `1d20 - @craftingmod -` and `@craftingmod +` are all `nonAdditive: false` and all refused —
  // so the tab told that GM the placeholder was "ignored and removed before the roll, so
  // delete it", and deleting it leaves `1d20 * `, still refused, with `hasRollFormula` then
  // reading GREEN because nothing re-validates a placeholder-free formula. The migration
  // meanwhile counted the same formula `untouched` and said it would not roll. One decider
  // is the only way two surfaces can give one instruction.
  //
  // The legacy `routed.rollExpression` alias is planned too, DEFENSIVELY rather than as a
  // load-bearing branch: both `CraftingSystemManager._normalizeRoutedCraftingCheck` and the
  // manager root's `cloneRoutedCheck` fold it into `rollFormula` and neither emits the key,
  // so no draft this tab is handed carries a live one. The `1.21.0` migration sweeps it
  // because it reads the raw SETTING, which is a different input. It stays because this is
  // a pure evaluator over a plain check object with no normalizer of its own, and it plans
  // through the same decider so the two branches cannot answer differently.
  const legacyPlan = planRetiredPlaceholderStrip(trimmed(check?.rollExpression));
  if (plan.outcome === 'refused' || legacyPlan.outcome === 'refused') {
    pushIssue(issues, 'retiredPlaceholderBreaksFormula', 'critical');
  } else if (plan.outcome === 'stripped' || legacyPlan.outcome === 'stripped') {
    pushIssue(issues, 'retiredPlaceholderInFormula', 'warning');
  }

  // Routed checks route an outcome tier to a result set by tier NAME, and only
  // SUCCESS tiers can be routed. The outcome-tier rules below are only meaningful
  // once at least one tier has been authored.
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

      // Fixed tiers own a CONTIGUOUS, non-overlapping segment of the roll value range.
      // All three of these are `critical` — including the two that predate issue 1095.
      // No copy or test may describe `rangeInvalid` or `rangeOverlap` as a warning: each
      // leaves a roll value that routes to the wrong tier or to none, which fails the
      // attempt rather than degrading it.
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
        // The third range rule, and the one nothing reported before issue 1095 (DN6).
        const excluded = new Set([...conflicts.invalid, ...conflicts.overlapping]);
        const gapped = fixedRangesHaveGap(outcomes, excluded);
        checks.push({ id: 'rangesContiguous', satisfied: !gapped });
        if (gapped) {
          pushIssue(issues, 'rangeGap', 'critical');
        }
      }
    }

    // Outside the tier-count gate on purpose: a target authored before any tier
    // exists is exactly the dangling case a GM most needs told about.
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
