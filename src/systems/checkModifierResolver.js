/**
 * Ownership of the SYSTEM-LEVEL modifier library (issues 770, 1055, 1094, 1095, 1117):
 * who decides which modifiers apply, what they reduce to, and how that number reaches
 * the roll — on all THREE activities.
 *
 * A crafting system carries ONE named library at the system level
 * (`CraftingSystem.modifiers: {id,label,icon?,expression,isRollExpression,min?,max?}[]`,
 * issue 1117 — `checkModifiers` between 1.22.0 and 1.23.0).
 * Each of the three activity checks — `craftingCheck`, `salvageCraftingCheck` and
 * `gatheringCraftingCheck` — carries its OWN selection over that one library: a
 * COMBINATION RULE (`defaultModifierPolicy`), a default eligible id set
 * (`defaultModifierIds`) and an optional pick cap (`maxModifierPicks`). The catalogue is
 * defined once; each activity decides which entries apply and how they combine.
 *
 * The rule states WHO selects the eligible modifiers and WHEN. `bySubject` defers the
 * selection to the author of the record being resolved, at authoring time; `playerPicks`
 * defers it to the player at roll time; `addAll` and `highest` defer it to nobody and
 * reduce the activity's own default set. Both deferring rules are bounded by
 * `maxModifierPicks` (see {@link resolveMaxModifierPicks}), and both SUM what was picked
 * — which is why a bound of 1 reproduces the historical single-pick behaviour exactly.
 *
 * `bySubject` replaces the pre-1095 `byRecipe` because the rule's MEANING is
 * activity-independent while its LABEL is not ("By recipe" / "By component" / "By
 * gathering task"). {@link normalizeModifierPolicy} accepts `byRecipe` as a legacy READ
 * alias and never re-emits it, exactly as `breakToolsOnFail` reads
 * `consumeCatalystsOnFail`.
 *
 * EVERY RULE ACCEPTS DICE (issue 1118). A modifier expression may roll — `1d4`,
 * `2d20kh1`, `{1d6,1d8}kh1` — on all four combination rules, including the ones a check
 * consumes. A rolling entry is appended to the check's formula AS DICE
 * (`1d20 + 2[Modifiers] + (1d4)[Modifiers]`), so the variance the GM authored survives to
 * the roll, appears in `roll.dice`, animates, and shows on the chat card. Between issues
 * 1117 and 1118 this module modelled a check modifier on a TOOL BONUS, which is a scalar,
 * and a roll-shaped entry was a blocking readiness issue; that rule is retired, and with it
 * `modifierRollExpression`.
 *
 * Two consequences follow, and both are decisions rather than implementation details:
 *
 * - **`highest` and `playerPicks` rank by AVERAGE** ({@link reduceRollExpression}), so
 *   `1d4` (2.5) beats a flat `+2`, the winner is the same on every attempt, and no hidden
 *   roll is spent to find it. The winner is then appended AS DICE, so ranking
 *   deterministically does not flatten what it selects.
 * - **`min`/`max` clamp the ROLLED result**, expressed IN THE FORMULA as
 *   `min(max((1d8), -1), 6)`. One roll, the dice stay visible, and "never more than +6"
 *   means what it says: a roll of 7 contributes 6 and a roll of 3 contributes 3. Verified
 *   against the shipped 14.365 dice stack rather than assumed — `CONFIG.Dice.functions` is
 *   `{}` so `min`/`max` fall through to `Math.min`/`Math.max`, `FunctionTerm` evaluates a
 *   dice argument rather than stringifying it, and `FunctionTerm#dice` bubbles the inner die
 *   up into `Roll#dice`. See `tests/helpers/recordedModifierRollShapes.js`, which records
 *   that run.
 *
 * PER-ENTRY BOUNDS (issue 1095). An entry's optional `min`/`max` bound its contribution.
 * Both are absence-preserving in the same way `maxModifierPicks` is: only a finite number is
 * attached, and absence means unbounded. An authored `min > max` is a BLOCKING readiness
 * issue (`modifierBoundsInverted`) and the entry contributes nothing until it is repaired —
 * the same refuse posture `INVALID_CHARACTER_MODIFIER_BOUNDS` already takes for gathering
 * drop modifiers, adopted deliberately so a check modifier and a drop modifier fail the same
 * way. A dice expression does NOT exempt a bound from being sane: the same two faults block
 * a rolling entry, they just clamp a rolled number instead of a resolved one. See
 * {@link resolveModifierBounds} and {@link clampModifierValue}.
 *
 * THE MODIFIER APPENDS; IT DOES NOT SUBSTITUTE (issue 1094). There is no placeholder to
 * spend and no token a GM can forget: the resolved contribution is appended as flavoured
 * `[Modifiers]` terms, exactly the way `appendToolBonusTerms` appends tool bonuses, so a
 * catalogue that reaches a rolled check always contributes. The retired placeholder is
 * stripped from stored formulas by the `1.21.0` migration and from any survivor by
 * `stripRetiredModifierPlaceholder`, so it can never double-count.
 *
 * This module serves the two modes the catalogue reduces through:
 *
 * - DETERMINISTIC CONTRIBUTION ({@link resolveCheckModifierContribution}) — `addAll` and
 *   `highest` always, and `playerPicks` on every non-interactive path (API, headless,
 *   automated), where it resolves to the best legal selection. It returns the flat SCALAR
 *   and the ROLL FRAGMENTS separately, because those are appended by different functions;
 *   {@link appendResolvedCheckModifier} appends both before the string reaches Foundry's
 *   `Roll`.
 * - INTERACTIVE CHOICE ({@link buildCheckModifierChoice}) — an interactive
 *   `playerPicks` attempt over an authored formula with at least TWO eligible modifiers.
 *   This module only DESCRIBES the options (and the highest-averaging pre-selection); the
 *   terms are appended by `evaluateCheckRoll` once the roll prompt returns the player's
 *   pick, through the same two appenders the deterministic path uses.
 *
 * Three sibling derivations complete the ownership at the other end —
 * {@link resolveActiveCraftingCheckFormula}, {@link resolveActiveSalvageCheckFormula}
 * and {@link resolveActiveGatheringCheckFormula}. Each answers WHICH sub-config its
 * activity's resolution mode actually rolls, and therefore whether the catalogue reaches
 * a roll at all; all three apply the issue-1094 retirement shim BEFORE their emptiness
 * test, so readiness and the roll path can never disagree on any activity.
 *
 * The `@`-substitution of a modifier expression is INJECTED
 * ({@link makeRollDataExpressionResolver}), so the reduction below is a pure,
 * exhaustively-testable function of TEXT. The one Foundry global that remains is the `Roll`
 * CLASS, taken as an optional parameter defaulting to `globalThis.Roll` — the same shape
 * `stripRetiredModifierPlaceholder` uses, and for a stronger reason: an expression the engine
 * cannot ROLL must not be appended, because a fragment that throws inside `new Roll(...)`
 * becomes a rolled, and therefore CONSUMING, failure. {@link fragmentRolls} proves that by
 * rolling the fragment maximized rather than by asking `Roll.validate`, which is a PARSE
 * oracle and answers `true` for `MAX(1d4, 2)`, `1000d6` and `1d4 + .5` alike. It fails OPEN
 * when the global is absent (headless, tests), where nothing evaluates the formula anyway.
 */

import { stripRetiredModifierPlaceholder } from '../utils/craftingCheckExpression.js';
import { reduceRollExpression } from '../utils/rollExpressionAverage.js';

import { resolveModifierLibrary } from './characterLibraries.js';
import { resolveSalvageCheck } from './salvageCheckUsability.js';
import {
  appendCheckModifierRollTerms,
  appendCheckModifierTerm,
  isDecimalSafeTermValue,
} from './toolCheckBonus.js';

/**
 * The combination rules a system may choose, in authoring-surface order. Each states
 * both how the eligible values reduce to one number AND who selects them:
 *
 * - `addAll`      — sum the activity's own default set. Nobody selects.
 * - `highest`     — `max(...)` of the activity's own default set. Nobody selects.
 * - `bySubject`   — the SUBJECT being resolved selects, at authoring time: the recipe on
 *                   crafting, the component on salvage, the gathering task on gathering.
 * - `playerPicks` — the PLAYER selects, at roll time.
 *
 * `bySubject` is a first-class rule, not a delegation of authority: the subject chooses
 * WHICH modifiers apply, never HOW they combine. Both selecting rules sum what was
 * picked and are bounded by {@link resolveMaxModifierPicks}.
 *
 * The LABEL is per-activity ("By recipe" / "By component" / "By gathering task") and lives
 * in the authoring surfaces; the TOKEN is activity-independent, which is why issue 1095
 * renamed the pre-1095 `byRecipe`.
 * @type {ReadonlyArray<'addAll'|'highest'|'bySubject'|'playerPicks'>}
 */
export const MODIFIER_POLICIES = Object.freeze(['addAll', 'highest', 'bySubject', 'playerPicks']);

const VALID_POLICIES = new Set(MODIFIER_POLICIES);

/**
 * Whether an authored modifier expression is a ROLL rather than a flat lookup (issue 1117).
 *
 * ONE PATTERN, because there is now ONE library. Before unification two lived in the repo
 * and they were COMPLEMENTARY, not duplicates: `GatheringRichStateService`'s
 * `/\d\s*d\s*\d|[*\/()]/i` requires a digit before the `d`, so it matched `1d6` and missed a
 * bare `d20`; `SystemEditView`'s `/\bd\d|[*\/()]/` requires a word boundary before the `d`,
 * so it matched `d20` and — because `1` and `d` are both word characters, leaving no
 * boundary between them — missed `1d6`. Neither was a superset of the other, so one library
 * with two readers would have disagreed about whether the same entry rolls. This is the
 * union of the two, which is the only merge that loses no detection either had.
 *
 * The classification is DERIVED and never authored: it is a fact about the expression, and
 * a persisted flag a GM could contradict would be a second source of truth for it.
 *
 * IT ASKS THE REDUCER (issue 1118 review), and no longer a pattern of its own. The pattern
 * disagreed with the resolver in BOTH directions: `1dF` and `2dC` roll and got no chip, while
 * `@a * 2` got the chip — and, since 1118, a roll note about dice it does not have — because
 * the pattern also matched arithmetic grouping. `reduceRollExpression` observes dice while it
 * reduces, so the chip and what actually appends are now one decision.
 *
 * @param {unknown} expression The authored expression.
 * @returns {boolean} True when the expression rolls dice.
 */
export function isRollExpression(expression) {
  // The `@`-paths are neutralized FIRST. The walk stops dead at an `@`, so an authored
  // `@prof + 1d4` — the ordinary shape of a real modifier — would otherwise never reach its
  // die and would classify as flat.
  return reduceRollExpression(neutralExpressionResolver(expression) ?? '').rollsDice;
}

/**
 * The absence-preserving ATTACH every subject normalizer spreads, RE-EXPORTED here so the
 * READ half of the subject-pick rule ({@link buildCheckModifierContext}, below) and the
 * WRITE half live behind one module for a consumer that already reads from it.
 *
 * The implementation stays in `src/utils/checkModifierPicks.js` and is import-free, because
 * the two Foundry-free normalizers that also need it must not pull this module in.
 */
export { authoredCheckModifierIds } from '../utils/checkModifierPicks.js';

/**
 * The pre-1095 spelling of `bySubject`, accepted on READ and never re-emitted — the same
 * new-then-legacy shape `_normalizeSalvageCraftingCheck` uses for
 * `breakToolsOnFail` / `consumeCatalystsOnFail`. Stated as a Map rather than an `if` so a
 * second alias, if one is ever needed, cannot be added in a second place.
 */
const LEGACY_POLICY_ALIASES = new Map([['byRecipe', 'bySubject']]);

/**
 * The rules under which someone other than the system selects the eligible modifiers,
 * and therefore the only rules for which `maxModifierPicks` means anything.
 *
 * Deliberately NOT exported as a Set: `Object.freeze` does not make a Set immutable (its
 * contents live in internal slots, so `.add`/`.delete` still work on a frozen one), so
 * exporting it would advertise an immutability it cannot enforce and let any consumer
 * mutate the rule membership process-wide. {@link policyDefersSelection} is the whole
 * public need.
 */
const SELECTING_POLICIES = new Set(['bySubject', 'playerPicks']);

/**
 * Whether a combination rule defers modifier selection to someone other than the system,
 * and therefore whether `maxModifierPicks` applies to it. The authoring surfaces ask this
 * rather than re-deriving the membership test — the Checks card shows the cap input under
 * exactly these rules, and each subject editor offers its picker under `bySubject`.
 *
 * The argument is NORMALIZED first, so a legacy `byRecipe` read straight off disk answers
 * the same as the `bySubject` it aliases. A raw membership test would answer `false` for
 * it and silently hide the cap on an un-migrated world.
 * @param {unknown} policy
 * @returns {boolean}
 */
export function policyDefersSelection(policy) {
  return SELECTING_POLICIES.has(normalizeModifierPolicy(policy));
}

/**
 * Normalize a combination rule to one of the four offerable rules; unknown values are
 * null so the caller can fall back.
 *
 * The pre-1095 `byRecipe` maps to `bySubject` and is NEVER re-emitted, so a world still
 * carrying it reads correctly and the next save rewrites it. That is a read alias, not a
 * fifth rule: `byRecipe` is not a member of {@link MODIFIER_POLICIES}, so no authoring
 * surface offers it.
 * @param {unknown} policy
 * @returns {'addAll'|'highest'|'bySubject'|'playerPicks'|null}
 */
export function normalizeModifierPolicy(policy) {
  if (VALID_POLICIES.has(policy)) return policy;
  return LEGACY_POLICY_ALIASES.get(policy) ?? null;
}

/**
 * Resolve the cap on how many modifiers a selecting rule may pick.
 *
 * ABSENT (or `null`, or any non-positive/non-integer value) means UNLIMITED, reported as
 * `Infinity` so every caller can compare against it arithmetically without special-casing
 * a sentinel. Absence is meaningful rather than a defaulting accident: a system that has
 * never been asked the question must not silently acquire a bound that truncates recipe
 * picks already on disk. The `1.20.0` migration stamps `1` onto pre-existing
 * `playerPicks` systems for exactly that reason — that is where their historical
 * single-pick behaviour is preserved, not here.
 *
 * @param {{ maxModifierPicks?: unknown }|null|undefined} context
 * @returns {number} A positive integer, or `Infinity` when unbounded.
 */
export function resolveMaxModifierPicks(context) {
  const max = Number(context?.maxModifierPicks);
  return Number.isInteger(max) && max > 0 ? max : Infinity;
}

/**
 * The three activities that carry a check-modifier selection, mapped to the system key
 * their selection triple is persisted under. The catalogue itself is NOT in here: it
 * moved to the system level in `1.22.0` and is shared by all three.
 * @type {ReadonlyMap<'crafting'|'salvage'|'gathering', string>}
 */
const ACTIVITY_CHECK_KEYS = new Map([
  ['crafting', 'craftingCheck'],
  ['salvage', 'salvageCraftingCheck'],
  ['gathering', 'gatheringCraftingCheck'],
]);

/**
 * Read the SUBJECT's own modifier pick for an activity, as an id array or `null`.
 *
 * `null` means "no pick authored — inherit the activity's default set"; an EMPTY ARRAY
 * is an authored pick of zero and resolves to no eligible modifiers at all. The two are
 * told apart by `Array.isArray` at the point the pick is read, exactly as
 * `Recipe._normalizeCraftingModifier` decides authoredness at the point of entry, so a
 * malformed member cannot flip an authored empty set back to inherit.
 *
 * The field differs per activity because each subject is a different record:
 *
 * | Activity   | Subject        | Field                                  |
 * |------------|----------------|----------------------------------------|
 * | `crafting` | Recipe         | `recipe.craftingModifier.modifierIds`  |
 * | `salvage`  | Component      | `component.salvage.checkModifierIds`   |
 * | `gathering`| Gathering task | `task.checkModifierIds`                |
 * @param {'crafting'|'salvage'|'gathering'|string} activity
 * @param {object|null|undefined} subject
 * @returns {Array|null}
 */
function readSubjectModifierIds(activity, subject) {
  const authored =
    activity === 'crafting'
      ? subject?.craftingModifier?.modifierIds
      : activity === 'salvage'
        ? subject?.salvage?.checkModifierIds
        : activity === 'gathering'
          ? subject?.checkModifierIds
          : null;
  return Array.isArray(authored) ? authored : null;
}

/**
 * Build the check-modifier context for a (system, activity, subject) triple — the ONE bag
 * both the evaluation path (`CraftingEngine` / `GatheringEngine`) and the display path
 * (`CraftingListingBuilder`) resolve through, so a displayed formula can never disagree
 * with the rolled one.
 *
 * THE ARITY IS THREE, not two (issue 1095). The catalogue is shared but the SELECTION is
 * not: `activity` chooses which of the three selection triples is read, and which field
 * on `subject` carries a `bySubject` pick. A two-argument call would silently resolve
 * salvage and gathering against the CRAFTING rule.
 *
 * `maxModifierPicks` is read straight off the persisted activity check and is
 * `undefined` when it has never been asked; the key is always present on the bag
 * so the shape is fixed, and {@link resolveMaxModifierPicks} owns what absence means.
 *
 * @param {object|null|undefined} system The crafting system. Since issue 1308 it no longer owns
 *   the modifier library — the world does — but it is still read for any surviving legacy copy
 *   on a client that has not migrated yet.
 * @param {'crafting'|'salvage'|'gathering'} activity Which activity's selection to read.
 * @param {object|null|undefined} subject The record being resolved: a recipe, a component
 *   or a gathering task.
 * @param {object|Function|null} [characterLibrariesStore] Explicit world-libraries seam. Omitted
 *   in production, where the module registry resolves it; supplied by tests.
 * @returns {{ activity: string, catalogue: Array|undefined, systemPolicy: unknown,
 *   defaultModifierIds: Array|undefined, subjectModifierIds: Array|null,
 *   maxModifierPicks: number|undefined }}
 */
export function buildCheckModifierContext(
  system,
  activity,
  subject,
  characterLibrariesStore = null
) {
  const check = system?.[ACTIVITY_CHECK_KEYS.get(activity) ?? ''] ?? {};
  return {
    activity,
    // The ONE authored modifier library (issue 1117). It was `system.checkModifiers`
    // between 1.22.0 and 1.23.0, and `craftingCheck.checkModifiers` before that; the
    // 1.23.0 migration and the export upcast are the only two paths a legacy payload
    // arrives through, and no read-alias is kept here for the same reason 1.22.0 kept
    // none — a silent alias makes the relocation unobservable.
    catalogue: resolveModifierLibrary(system, characterLibrariesStore),
    systemPolicy: check.defaultModifierPolicy,
    defaultModifierIds: check.defaultModifierIds,
    subjectModifierIds: readSubjectModifierIds(activity, subject),
    maxModifierPicks: check.maxModifierPicks,
  };
}

/**
 * Which `craftingCheck` sub-config each crafting resolution mode actually rolls. The
 * two routed modes do NOT share a slot: `routedByIngredients` routes on the chosen
 * ingredient set and keeps the OPTIONAL pass/fail check on the shared `simple` slot
 * (`CraftingEngine.js:4089`), while `routedByCheck` routes on the `routed` check's
 * outcome tier and requires it.
 */
const CRAFTING_CHECK_SLOTS = new Map([
  ['simple', 'simple'],
  ['routedByIngredients', 'simple'],
  ['routedByCheck', 'routed'],
  ['progressive', 'progressive'],
]);

/** Alchemy selects its slot from the SYSTEM-level `alchemy.checkMode`; `none` has no check. */
const ALCHEMY_CHECK_SLOTS = new Map([
  ['simple', 'simple'],
  ['tiered', 'routed'],
]);

/** Modes that cannot resolve at all without a rolled outcome. */
const REQUIRED_CHECK_MODES = new Set(['routedByCheck', 'progressive']);

/**
 * Resolve the crafting check a system's resolution mode ACTUALLY rolls, and whether it
 * carries an authored roll formula.
 *
 * | Resolution mode       | Check config              | Notes                                   |
 * |-----------------------|---------------------------|-----------------------------------------|
 * | `simple`              | `craftingCheck.simple`    | optional                                |
 * | `routedByIngredients` | `craftingCheck.simple`    | optional; shares the simple slot        |
 * | `routedByCheck`       | `craftingCheck.routed`    | required                                |
 * | `progressive`         | `craftingCheck.progressive` | required                              |
 * | `alchemy`             | per `alchemy.checkMode`   | `none` → no check, `simple` → `simple`, `tiered` → `routed` |
 *
 * The return distinguishes the TWO reasons a catalogue of check modifiers can be INERT,
 * which no single boolean can: `slot === null` (this mode rolls no check at all) and
 * `slot && !checkUsable` (a slot exists but no formula is authored). The third cause —
 * "a formula is authored but never spends the placeholder" — retired with the placeholder
 * (issue 1094): the scalar now APPENDS, so an authored formula always carries it.
 *
 * An unrecognized `resolutionMode` reports `slot: null` rather than coercing to
 * `simple` — a token outside the canonical set is a config defect the manager's
 * normalizer should already have rewritten, and surfacing "no check" is the answer that
 * cannot mislead a caller into rendering or validating a check the engine will not roll.
 *
 * Pure: no `game`, no Foundry globals, no manager collaborator — a plain system object
 * is the whole input, so the stores, the authoring cards and the engine can all ask.
 *
 * @param {object|null|undefined} system The crafting system.
 * @returns {{
 *   mode: string,
 *   alchemyCheckMode: 'none'|'simple'|'tiered'|null,
 *   slot: 'simple'|'routed'|'progressive'|null,
 *   config: object|null,
 *   rollFormula: string,
 *   checkUsable: boolean,
 *   requiresCheck: boolean,
 * }}
 *
 * - `alchemyCheckMode` is `null` for every non-alchemy mode, so it can never be
 *   mistaken for an authored `'none'`.
 * - `rollFormula` is TRIMMED (`''` when there is none): an authored `"   "` is not a
 *   check, matching `ResolutionModeService._hasRollFormula` and `hasCheckFormula`.
 * - `requiresCheck` marks the modes that fail the craft without a rolled outcome —
 *   `routedByCheck`, `progressive`, and alchemy at `simple`/`tiered`.
 *
 * THE RETIREMENT SHIM RUNS BEFORE THE EMPTINESS TEST (issue 1094), so readiness and the
 * roll path can never disagree. A formula whose only content was the retired
 * placeholder would otherwise report
 * USABLE here, pass the `requiresCheck && !checkUsable` abort, reach `evaluateCheckRoll`,
 * strip to `''` and throw inside `new Roll('')` — a rolled, and therefore CONSUMING,
 * failure. Reported as `noFormula` instead.
 */
export function resolveActiveCraftingCheckFormula(system) {
  const mode = system?.resolutionMode || 'simple';
  const alchemyCheckMode = mode === 'alchemy' ? system?.alchemy?.checkMode || 'none' : null;
  const slot =
    (mode === 'alchemy'
      ? ALCHEMY_CHECK_SLOTS.get(alchemyCheckMode)
      : CRAFTING_CHECK_SLOTS.get(mode)) ?? null;
  const config = slot ? ((system?.craftingCheck ?? {})[slot] ?? null) : null;
  const authored = typeof config?.rollFormula === 'string' ? config.rollFormula.trim() : '';
  const rollFormula = stripRetiredModifierPlaceholder(authored).trim();
  return {
    mode,
    alchemyCheckMode,
    slot,
    config,
    rollFormula,
    checkUsable: rollFormula.length > 0,
    requiresCheck: REQUIRED_CHECK_MODES.has(mode) || (mode === 'alchemy' && slot !== null),
  };
}

/**
 * The gathering resolution modes and the `gatheringCraftingCheck` sub-config each rolls.
 * `d100` is deliberately absent: it rolls the fixed d100 against each drop's chance and
 * authors no formula, so it has no slot and the check-modifier catalogue is inert under
 * it with cause `noCheck`. Gathering's d100 drop and event rows REFERENCE the same unified
 * library (issue 1117) but consume it differently — as a percentage-point delta or a
 * multiplicative factor on a drop chance, never as a term appended to a rolled formula —
 * so a `d100` system's references do not participate in `progressive` or `routed`.
 */
const GATHERING_CHECK_SLOTS = new Map([
  ['progressive', 'progressive'],
  ['routed', 'routed'],
]);

/**
 * Resolve the SALVAGE check a system's salvage resolution mode actually rolls, in the
 * same shape {@link resolveActiveCraftingCheckFormula} returns, so the three inert-cause
 * derivations the Checks surface reads cannot drift.
 *
 * Delegates to `resolveSalvageCheck` rather than re-deriving the pair — that module is
 * the SINGLE derivation of "which salvage check is active, and is it usable" (issue 859)
 * and already applies the issue-1094 retirement shim before its emptiness test. Adding a
 * second derivation here is exactly the drift it was extracted to end.
 *
 * `slot` is `null` only for an UNSUPPORTED salvage mode: every supported mode rolls a
 * slot, so salvage's `noCheck` cause reports a config defect rather than a legal
 * "this mode rolls no authored FORMULA" state (which salvage, unlike crafting and
 * gathering, has none of).
 *
 * The wording is deliberate. Crafting's such state is alchemy `checkMode: 'none'`, which
 * genuinely rolls nothing; gathering's is `d100`, which DOES roll — the d100 against each
 * drop's chance is that mode's check, and what it lacks is an authored formula to append a
 * modifier to. Calling gathering's state "rolls nothing" is what `noModifierSupport` exists
 * to stop the UI saying.
 *
 * @param {object|null|undefined} system The crafting system.
 * @returns {{ mode: string, slot: 'simple'|'routed'|'progressive'|null, config: object|null,
 *   rollFormula: string, checkUsable: boolean, requiresCheck: boolean }}
 */
export function resolveActiveSalvageCheckFormula(system) {
  const salvage = resolveSalvageCheck(system);
  return {
    mode: salvage.mode,
    slot: salvage.unsupportedMode ? null : salvage.mode,
    config: salvage.unsupportedMode ? null : salvage.config,
    rollFormula: salvage.unsupportedMode ? '' : salvage.rollFormula,
    checkUsable: !salvage.unsupportedMode && salvage.checkUsable,
    requiresCheck: salvage.requiresCheck,
  };
}

/**
 * Resolve the GATHERING check a gathering economy's resolution mode actually rolls, in
 * the same shape its two siblings return.
 *
 * THE MODE IS AN ARGUMENT, not a field on the system. Gathering's resolution mode lives
 * on the per-system gathering ECONOMY config (`gatheringConfig.systems[id].resolutionMode`,
 * surfaced to the manager as `selectedGatheringEconomy.resolutionMode`), not on the
 * crafting system, so this derivation cannot read it off `system` the way its crafting
 * and salvage siblings read `resolutionMode` / `salvageResolutionMode`. Passing it keeps
 * this module free of the gathering config's shape.
 *
 * THE SEAM IS DORMANT (issue 1095, decision 8). `_libraryTaskToRuntimeTask` hardcodes
 * `resolutionMode: 'd100'` pending issue 683 and the economy editor renders `progressive`
 * and `routed` disabled, so no GM-selectable configuration reaches a formula-rolled
 * gathering check today. This derivation lands with the rest of the shape; it starts
 * answering about a reachable state when 683 ships.
 *
 * THE RETIREMENT SHIM RUNS BEFORE THE EMPTINESS TEST (issue 1094), for the reason its
 * crafting sibling states: a formula whose only content was the retired placeholder would
 * otherwise report USABLE and throw inside `new Roll('')` as a rolled, consuming failure.
 *
 * @param {object|null|undefined} system The crafting system.
 * @param {string} [resolutionMode] The gathering economy's resolution mode. Defaults to
 *   `d100`, the only mode a GM can select today.
 * @returns {{ mode: string, slot: 'progressive'|'routed'|null, config: object|null,
 *   rollFormula: string, checkUsable: boolean, requiresCheck: boolean }}
 */
export function resolveActiveGatheringCheckFormula(system, resolutionMode = 'd100') {
  const mode = resolutionMode || 'd100';
  const slot = GATHERING_CHECK_SLOTS.get(mode) ?? null;
  const config = slot ? ((system?.gatheringCraftingCheck ?? {})[slot] ?? null) : null;
  const authored = typeof config?.rollFormula === 'string' ? config.rollFormula.trim() : '';
  const rollFormula = stripRetiredModifierPlaceholder(authored).trim();
  return {
    mode,
    slot,
    config,
    rollFormula,
    checkUsable: rollFormula.length > 0,
    // Both formula-rolled gathering modes cannot resolve without a rolled outcome: routed
    // routes by the matched tier's name and progressive spends the total as its budget.
    requiresCheck: slot !== null,
  };
}

/**
 * Resolve the effective combination rule. The SYSTEM decides, full stop: a recipe's
 * stored `craftingModifier.policy` — which older data may still carry — is never
 * consulted, because a subject may choose which modifiers apply but never how they
 * combine.
 *
 * The invariant lives here rather than at the authoring control, per "A UI control's
 * constraint is never an invariant": a legacy rule override left on disk stays on disk
 * and stays unhonoured, and no hand-built context can smuggle one back in.
 *
 * @param {{ systemPolicy?: unknown }|null|undefined} context
 * @returns {'addAll'|'highest'|'bySubject'|'playerPicks'}
 */
export function resolveModifierPolicy(context = {}) {
  return normalizeModifierPolicy(context?.systemPolicy) ?? 'addAll';
}

/**
 * Resolve the ordered, de-duplicated, catalogue-validated list of eligible modifier
 * ids. Unknown ids (not present in the catalogue) are dropped, preserving source order.
 *
 * The subject's id subset (`subjectModifierIds` is an array) is the source ONLY
 * under `bySubject`, the rule that hands the selection to the record being resolved;
 * under every other rule the activity's `defaultModifierIds` is the source and a stored
 * subject subset is ignored outright.
 *
 * Under `bySubject` the resolved list is TRUNCATED to {@link resolveMaxModifierPicks},
 * keeping the first N in authored order. The bound is enforced here and not only at the
 * picker, per "A UI control's constraint is never an invariant" — a GM who lowers the cap
 * below what a subject already picked must not leave that record rolling more modifiers
 * than the system now permits. Under `playerPicks` the list is the full set of OPTIONS
 * OFFERED and is deliberately not truncated; the cap bounds the player's selection from
 * it, which {@link buildCheckModifierChoice} carries.
 *
 * An AUTHORED EMPTY array is an override, not an absence: a subject carrying an empty
 * pick under `bySubject` resolves to no eligible modifiers, so the scalar is 0 and no
 * term appends. All three subject normalizers preserve that shape on the way in, keyed on
 * `Array.isArray` at entry, and {@link buildCheckModifierContext} reads it the same way.
 *
 * @param {{ catalogue?: Array, systemPolicy?: unknown, defaultModifierIds?: Array,
 *   subjectModifierIds?: Array|null, maxModifierPicks?: unknown }|null|undefined} context
 * @returns {string[]}
 */
export function resolveEligibleModifierIds(context = {}) {
  const { catalogue = [], defaultModifierIds = [], subjectModifierIds = null } = context ?? {};
  const known = new Set(
    (Array.isArray(catalogue) ? catalogue : [])
      .map((entry) => (entry && typeof entry === 'object' ? entry.id : null))
      .filter((id) => typeof id === 'string' && id !== '')
  );
  const subjectPicks =
    resolveModifierPolicy(context) === 'bySubject' && Array.isArray(subjectModifierIds);
  const source = subjectPicks
    ? subjectModifierIds
    : Array.isArray(defaultModifierIds)
      ? defaultModifierIds
      : [];
  const limit = subjectPicks ? resolveMaxModifierPicks(context) : Infinity;
  const seen = new Set();
  const ids = [];
  for (const id of source) {
    if (ids.length >= limit) break;
    if (typeof id !== 'string' || !known.has(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * Resolve a catalogue entry's per-entry bounds (issue 1095).
 *
 * ABSENCE-PRESERVING, in the same way {@link resolveMaxModifierPicks} is: only a FINITE
 * number is a bound, so `null`, `undefined`, `''`, `NaN`, `Infinity` and junk all report
 * `null` and mean unbounded on that side. A bound of `0` is a real bound and survives —
 * which is why this cannot be written with `||`.
 *
 * `inverted` is the authored `min > max` case. It is a BLOCKING misconfiguration, not a
 * silently-reordered pair: the entry contributes 0 until it is repaired, and
 * `checksReadiness` raises `modifierBoundsInverted` at `critical`. That is deliberately
 * the same refuse posture `INVALID_CHARACTER_MODIFIER_BOUNDS` already takes for gathering
 * drop modifiers (`GatheringRichStateService`), so a check modifier and a drop modifier
 * fail the same way. Swapping them instead would roll a number the GM never authored.
 *
 * `unsafe` is the second blocking case, and it is the one whose damage SPREADS (issue
 * 1095). A bound only has to be FINITE to be a bound, so `1e21` is one — but the appended
 * term is a dice-grammar `Constant`, which has no exponent production, so
 * `isDecimalSafeTermValue` refuses the value and `appendCheckModifierTerm` drops THE WHOLE
 * TERM. Under `addAll` that term is the SUM, so one entry clamped to `1e21` deletes every
 * other modifier's contribution from the roll — a well-formed `+3` silently vanishing
 * because of a bound on a different entry. Reporting it per-entry, and contributing 0 for
 * that entry alone, keeps the blast radius where the GM authored the mistake.
 *
 * @param {{ min?: unknown, max?: unknown }|null|undefined} entry A catalogue entry.
 * @returns {{ min: number|null, max: number|null, inverted: boolean, unsafe: boolean }}
 */
export function resolveModifierBounds(entry) {
  const min = numericBoundOrNull(entry?.min);
  const max = numericBoundOrNull(entry?.max);
  return {
    min,
    max,
    inverted: min !== null && max !== null && min > max,
    unsafe: !boundIsTermSafe(min) || !boundIsTermSafe(max),
  };
}

/**
 * Whether a resolved bound can survive the append it will be clamped into.
 *
 * A `null` bound is unbounded and therefore always safe. Anything else has to be a value
 * the dice grammar's `Constant` production can express, which is exactly the question
 * {@link isDecimalSafeTermValue} answers for the appended term itself — asked of the same
 * function rather than re-derived, so the clamp and the emit cannot disagree about which
 * numbers are expressible.
 * @param {number|null} bound
 * @returns {boolean}
 */
function boundIsTermSafe(bound) {
  return bound === null || isDecimalSafeTermValue(bound);
}

/**
 * One raw bound to a finite number, or `null` for every unbounded FORM.
 *
 * `null`, `''` and `[]` are guarded EXPLICITLY before `Number()`, which coerces all three
 * to `0` — and `0` is a REAL bound here, so a coerced one is indistinguishable from an
 * authored one. That is the same trap `_normalizeSalvage`'s `dcOverride` guard calls out,
 * and it matters twice over on this field: clearing a bound in the editor patches `null`,
 * so without the guard "clear the maximum" would mint a maximum of 0 and silently zero the
 * modifier.
 *
 * A STRING IS TRIMMED FIRST, and that is the same guard again rather than tidiness:
 * `Number('   ')` is `0`, so a whitespace-only field — which is what a stored `' '` from an
 * import or a hand-edit looks like — would otherwise mint a real bound of `0` and clamp the
 * entry to nothing. `''` is already guarded above; trimming is what makes `'  '` reach the
 * same answer as `''` instead of the opposite one.
 * @param {unknown} value
 * @returns {number|null}
 */
function numericBoundOrNull(value) {
  // `[null, undefined, '']` rather than three `===` comparisons: the repo's own idiom for
  // this guard (`_normalizeSalvage`'s `dcOverride`, `_normalizeGatheringTask`'s), and the
  // one the lint rule asks for.
  if ([null, undefined, ''].includes(value)) return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const raw = typeof value === 'string' ? value.trim() : value;
  if (raw === '') return null;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * Clamp one resolved modifier value to its entry's bounds, AFTER expression evaluation
 * and BEFORE combination — so `highest` compares clamped values and `addAll` sums them,
 * which is what makes a bound mean the same thing under every combination rule.
 *
 * An inverted pair contributes 0 (see {@link resolveModifierBounds}), and so does a bound
 * the dice grammar cannot express — clamping to one would poison the SUM and delete every
 * other modifier's term, so the refusal is contained to the entry that owns the bad bound.
 * An absent bound is unbounded on that side.
 *
 * @param {number} value An already-coerced finite number.
 * @param {{ min?: unknown, max?: unknown }|null|undefined} entry
 * @returns {number}
 */
export function clampModifierValue(value, entry) {
  const { min, max, inverted, unsafe } = resolveModifierBounds(entry);
  if (inverted || unsafe) return 0;
  let clamped = value;
  if (min !== null) clamped = Math.max(min, clamped);
  if (max !== null) clamped = Math.min(max, clamped);
  return clamped;
}

/**
 * Index a catalogue by id, dropping malformed entries. Shared by the scalar and the
 * choice so the two cannot disagree about which entries exist.
 * @param {unknown} catalogue
 * @returns {Map<string, object>}
 */
function catalogueById(catalogue) {
  return new Map(
    (Array.isArray(catalogue) ? catalogue : [])
      .filter((entry) => entry && typeof entry === 'object' && typeof entry.id === 'string')
      .map((entry) => [entry.id, entry])
  );
}

/**
 * One catalogue entry, resolved against the acting character (issue 1118).
 *
 * `average` is the ranking number and is ALWAYS finite. Exactly one of `value` and
 * `formula` is set on a contributing entry:
 *
 * - `value` — a flat entry's clamped number. Several of these SUM into one appended term.
 * - `formula` — a rolling entry's clamped, parenthesised roll fragment. Each of these gets
 *   its OWN appended term, so the dice stay attributable and one bad fragment cannot delete
 *   another entry's contribution.
 *
 * A BLOCKED entry (inverted or grammar-inexpressible bounds, an expression that does not
 * reduce, a fragment the engine cannot roll) carries `value: 0`, `formula: null` and
 * `average: 0` — it contributes nothing, exactly as an unresolvable expression always has.
 *
 * `display` is the chip the roll prompt renders, built here rather than by the prompt so it
 * cannot describe a contribution different from the one appended.
 *
 * `blocked` states that outcome EXPLICITLY rather than leaving it to be inferred from
 * `value === 0`, which a legitimately zero-valued entry shares. Readiness needs to tell those
 * two apart to report the first and stay silent about the second.
 *
 * @typedef {{ id: string, label: string, icon: string, average: number,
 *   value: number|null, formula: string|null, blocked: boolean,
 *   display: string }} ResolvedCheckModifier
 */

/** A blocked entry's resolution: present in the list, contributing nothing. */
function blockedModifier(id, entry) {
  return {
    id,
    label: typeof entry?.label === 'string' ? entry.label : '',
    icon: typeof entry?.icon === 'string' ? entry.icon : '',
    average: 0,
    value: 0,
    formula: null,
    blocked: true,
    display: '+0',
  };
}

/**
 * The clamped roll fragment for a rolling entry, expressed IN THE FORMULA.
 *
 * The expression is ALWAYS parenthesised first, and that is a correctness requirement rather
 * than tidiness: an authored expression may carry its own flavour or bind more loosely than
 * the append position implies, and `1d4[fire][Modifiers]` is a syntax error on 14.365 where
 * `(1d4[fire])[Modifiers]` parses and rolls.
 *
 * The bounds then wrap it — `max` raises to the minimum, `min` lowers to the maximum — so a
 * half-bounded entry emits ONE function and an unbounded one emits none.
 *
 * @param {string} text The `@`-substituted expression.
 * @param {{ min: number|null, max: number|null }} bounds
 * @returns {string}
 */
function buildModifierRollFragment(text, bounds) {
  const inner = `(${text})`;
  if (bounds.min !== null && bounds.max !== null) {
    return `min(max(${inner}, ${bounds.min}), ${bounds.max})`;
  }
  if (bounds.min !== null) return `max(${inner}, ${bounds.min})`;
  if (bounds.max !== null) return `min(${inner}, ${bounds.max})`;
  return inner;
}

/**
 * Resolve one catalogue entry to its {@link ResolvedCheckModifier}.
 *
 * The order is deliberate. Bounds are checked FIRST, so a blocked bound refuses the entry
 * before any expression work and a dice expression cannot smuggle a bad bound past the
 * check. Then the injected resolver substitutes `@`-paths; then {@link reduceRollExpression}
 * both reduces the text and reports whether it rolls, which is why those are one call and
 * not a reduction plus a separate opinion about the same string.
 *
 * A ROLLING entry is additionally proven ROLLABLE by {@link fragmentRolls}, and a refusal
 * blocks that entry alone. Without it an authored `MAX(1d4, 2)` or `1000d6` would reach
 * `new Roll(...)` and throw as a rolled — therefore CONSUMING — failure, where before this
 * change it merely reduced to a number.
 *
 * @param {string} id
 * @param {object|undefined} entry
 * @param {(expression: string|undefined) => string|number|null} resolveExpression
 * @param {typeof globalThis.Roll} [Roll]
 * @returns {ResolvedCheckModifier}
 */
function resolveCatalogueEntry(id, entry, resolveExpression, Roll) {
  const bounds = resolveModifierBounds(entry);
  if (bounds.inverted || bounds.unsafe) return blockedModifier(id, entry);
  const raw = typeof resolveExpression === 'function' ? resolveExpression(entry?.expression) : null;
  const text = raw === null || raw === undefined ? '' : String(raw).trim();
  if (text === '') return blockedModifier(id, entry);
  const { value, rollsDice } = reduceRollExpression(text);
  if (!Number.isFinite(value)) return blockedModifier(id, entry);
  const average = clampModifierValue(value, entry);
  if (!rollsDice) {
    return {
      ...blockedModifier(id, entry),
      average,
      value: average,
      blocked: false,
      display: modifierChipLabel(average, null, bounds),
    };
  }
  const formula = buildModifierRollFragment(text, bounds);
  if (!fragmentRolls(formula, Roll)) return blockedModifier(id, entry);
  return {
    ...blockedModifier(id, entry),
    average,
    value: null,
    formula,
    blocked: false,
    display: modifierChipLabel(average, text, bounds),
  };
}

/**
 * Whether a rolling fragment can actually be ROLLED, proven by rolling it.
 *
 * `Roll.validate` IS NOT THIS TEST, and believing it was is how the first version of this
 * guard came to have a hole the size of a capitalized function name. `validate` is
 * `evaluateSync({ strict: false })`, and `Roll#_evaluateASTSync` SKIPS every
 * non-deterministic node — so on a fragment that rolls, which is every fragment reaching
 * here, the dice-bearing subtree is never evaluated and no evaluate-time error class is
 * exercised at all. It is a PARSE oracle wearing an evaluation's clothes. Measured against
 * the shipped 14.365 stack over 355 emitted formulas, 25 validated `true` and then threw:
 *
 * | authored            | what `evaluate()` says                                            |
 * |---------------------|-------------------------------------------------------------------|
 * | `MAX(1d4, 2)`       | `The function "MAX" is not registered in CONFIG.Dice.functions`    |
 * | `1000d6`            | `You may not evaluate a DiceTerm with more than 999 results`       |
 * | `1d4 + .5`          | `Unresolved StringTerm .5` (`Constant` needs a leading digit)      |
 *
 * Each of those throws inside `evaluateCheckRoll`, which the runners catch as a FAILED
 * check — ingredients spent, tools broken, every attempt, with only a `console.error`.
 *
 * `maximize: true` is what makes the proof total: it renders every term deterministic, so
 * `_evaluateASTSync` skips NOTHING and every node is really evaluated. The finite test on
 * the total is required rather than decorative — `Roll#total` is `Number(this._total) || 0`,
 * which passes `-Infinity` through as a number, and `max(, 2)` is exactly that shape. So
 * this predicate closes the empty-head trap BY CONSTRUCTION rather than by argument.
 *
 * Measured at 0.03-0.5 ms per fragment on the real stack, exploding and reroll pools
 * included, and it runs once per eligible rolling entry per resolution.
 *
 * FAIL OPEN when there is no dice engine (headless, tests), matching
 * `stripRetiredModifierPlaceholder`: nothing evaluates the formula there either, and
 * answering "unrollable" would silently delete a modifier from every headless resolution.
 *
 * @param {string} formula The assembled, clamped fragment.
 * @param {typeof globalThis.Roll} [Roll]
 * @returns {boolean}
 */
function fragmentRolls(formula, Roll) {
  if (typeof Roll !== 'function') return true;
  try {
    const roll = new Roll(formula);
    if (typeof roll?.evaluateSync !== 'function') return true;
    roll.evaluateSync({ maximize: true });
    return Number.isFinite(roll.total);
  } catch {
    return false;
  }
}

/**
 * Every `@`-path replaced by a neutral `0`, so an expression can be judged WITHOUT an actor.
 *
 * Readiness runs in the manager, where there is no crafter and no roll data, but the two
 * faults it has to surface — text the reducer cannot read, and a fragment the engine cannot
 * roll — are properties of the AUTHORED text that survive substitution: `MAX(1d4, @a)` throws
 * whatever `@a` is, and `1d4]` never parses.
 */
function neutralExpressionResolver(expression) {
  return typeof expression === 'string' ? expression.replaceAll(/@[\w.]+/g, '0') : null;
}

/**
 * Whether a catalogue entry's EXPRESSION can contribute at all, judged without an actor
 * (issue 1118 review).
 *
 * IT ANSWERS ABOUT THE WHOLE ENTRY, BOUNDS INCLUDED, and the caller is what keeps a bounds
 * fault from being reported twice: `checkModifierReadiness` asks this only of entries whose
 * bounds it has already found sound. An earlier draft stripped the bounds here as well, and
 * that was dead code — mutation showed removing the strip changed no test, because the
 * caller's filter already made it unreachable. One guard, at the place that knows why.
 *
 * WHAT IT CANNOT SEE, stated rather than implied: a fault that depends on the actor's roll
 * data. `@count d6` is rollable at `@count = 2` and refused at `@count = 1000`, and no
 * actor-free reading can decide that. The roll path still refuses it per attempt.
 *
 * @param {object|null|undefined} entry A catalogue entry.
 * @param {typeof globalThis.Roll} [Roll]
 * @returns {boolean} False when the entry would contribute nothing for expression reasons.
 */
export function modifierExpressionResolves(entry, Roll = globalThis.Roll) {
  if (!entry || typeof entry !== 'object') return false;
  return !resolveCatalogueEntry('', entry, neutralExpressionResolver, Roll).blocked;
}

/**
 * Resolve the eligible catalogue entries a modifier context SELECTS, in the order they are
 * appended.
 *
 * Selection semantics, unchanged in shape from the pre-1118 scalar and restated because the
 * ranking key changed from "value" to "average":
 *
 * - `addAll`    → every entry in the activity's default set.
 * - `highest`   → the ONE entry with the highest average. `1d4` (2.5) beats a flat `+2`, and
 *   the winner is appended as dice, so ranking deterministically does not flatten it.
 * - `bySubject` → what the SUBJECT picked. No special case is needed:
 *   {@link resolveEligibleModifierIds} has already narrowed the list to the subject's
 *   selection and truncated it to the cap.
 * - `playerPicks` → the DETERMINISTIC (non-interactive / API / headless) fallback: the BEST
 *   LEGAL SELECTION, i.e. the highest-averaging `maxModifierPicks` entries. At a cap of 1
 *   that is exactly `highest` — the historical behaviour — and unbounded it is everything,
 *   because picking everything is then legal and optimal. The interactive per-roll selection
 *   is handled OUT of this path, via {@link buildCheckModifierChoice} + the interactive
 *   branch of `evaluateCheckRoll`.
 *
 * The two ranking rules SORT ON A COPY carrying each entry's eligible-set index, so equal
 * averages tie-break by authored order (first occurrence wins) and the result is returned in
 * eligible order rather than in rank order — the appended formula must not depend on which
 * entry happened to rank highest.
 *
 * @param {object} context
 * @param {(expression: string|undefined) => string|number|null} resolveExpression
 * @param {typeof globalThis.Roll} [Roll]
 * @returns {ResolvedCheckModifier[]}
 */
export function resolveSelectedCheckModifiers(
  context = {},
  resolveExpression,
  Roll = globalThis.Roll
) {
  const policy = resolveModifierPolicy(context);
  const byId = catalogueById(context.catalogue);
  const resolved = resolveEligibleModifierIds(context).map((id) =>
    resolveCatalogueEntry(id, byId.get(id), resolveExpression, Roll)
  );
  if (resolved.length === 0) return resolved;
  if (policy === 'highest') return bestByAverage(resolved, 1);
  if (policy === 'playerPicks') return bestByAverage(resolved, resolveMaxModifierPicks(context));
  // `addAll` takes the activity's default set; `bySubject` takes the subject's
  // already-narrowed and already-capped selection.
  return resolved;
}

/**
 * The `limit` highest-averaging entries, returned in ELIGIBLE order. Ties keep the first
 * authored occurrence, matching the single-pick behaviour this generalizes.
 * @param {ResolvedCheckModifier[]} resolved
 * @param {number} limit
 * @returns {ResolvedCheckModifier[]}
 */
function bestByAverage(resolved, limit) {
  if (limit >= resolved.length) return resolved;
  return resolved
    .map((modifier, index) => ({ modifier, index }))
    .sort((a, b) => b.modifier.average - a.modifier.average || a.index - b.index)
    .slice(0, limit)
    .sort((a, b) => a.index - b.index)
    .map(({ modifier }) => modifier);
}

/**
 * Resolve a modifier context to the two things a formula needs: the FLAT SCALAR every
 * non-rolling selected entry sums to, and the ROLL FRAGMENTS each rolling one contributes.
 *
 * They are returned separately because they are appended by different functions —
 * `appendCheckModifierTerm` collapses the scalar into one `+ N[Modifiers]` term and
 * `appendCheckModifierRollTerms` gives each fragment its own — and because a caller that
 * only needs the number (a display chip, a readiness read) must not have to know how a
 * fragment is spelled.
 *
 * A zero scalar with no fragments is the "nothing applies" answer: an empty eligible set, a
 * subject's authored-empty pick, or a selection whose every entry is blocked.
 *
 * @param {object} context
 * @param {(expression: string|undefined) => string|number|null} resolveExpression
 * @param {typeof globalThis.Roll} [Roll]
 * @returns {{ scalar: number, rollTerms: string[], selected: ResolvedCheckModifier[] }}
 */
export function resolveCheckModifierContribution(
  context = {},
  resolveExpression,
  Roll = globalThis.Roll
) {
  const selected = resolveSelectedCheckModifiers(context, resolveExpression, Roll);
  return {
    scalar: sumOf(selected.map((modifier) => modifier.value ?? 0)),
    rollTerms: selected
      .map((modifier) => modifier.formula)
      .filter((formula) => typeof formula === 'string' && formula !== ''),
    selected,
  };
}

/**
 * Sum a list of already-coerced finite numbers.
 * @param {number[]} values
 * @returns {number}
 */
function sumOf(values) {
  return values.reduce((sum, value) => sum + value, 0);
}

/**
 * The chip a roll-prompt option shows for a resolved modifier.
 *
 * A FLAT entry keeps its signed number (`+3`, `-2`), which is what the prompt has always
 * rendered. A ROLLING entry shows what it will actually roll — `+1d4`, or `+1d8 (-1 to 6)`
 * when it is bounded — because a rolling modifier's average is not what the player receives,
 * and a chip reading `+2.5` next to a `1d4` would be a number the roll can never produce.
 *
 * IT IS BUILT FROM THE SAME INPUTS AS THE FRAGMENT, not read back out of it. Rendering the
 * fragment with its outer parentheses stripped put `+min((1d4), 3)` in front of a player: the
 * inner parentheses are there to make the APPEND parse, and the function wrapper is how a
 * bound is expressed TO THE DICE ENGINE — neither is something to read. Taking `(text,
 * bounds)` keeps the chip and the fragment one derivation while letting each say it in its
 * own register.
 *
 * @param {number} value The flat value; ignored when `text` is present.
 * @param {string|null} text The substituted expression, or `null` for a flat entry.
 * @param {{ min: number|null, max: number|null }} bounds
 * @returns {string}
 */
function modifierChipLabel(value, text, bounds) {
  if (text === null) return value < 0 ? String(value) : `+${value}`;
  if (bounds.min !== null && bounds.max !== null) {
    return `+${text} (${bounds.min} to ${bounds.max})`;
  }
  if (bounds.min !== null) return `+${text} (min ${bounds.min})`;
  if (bounds.max !== null) return `+${text} (max ${bounds.max})`;
  return `+${text}`;
}

/**
 * Build the interactive `playerPicks` choice descriptor for a modifier context: the
 * eligible modifier set mapped to `{ id, label, icon, value, formula, display }`, the
 * `maxPicks` cap the prompt must enforce, and the pre-selection.
 *
 * Each option carries BOTH halves of its resolution, because the prompt needs different
 * ones for different jobs: `value` is the flat number a chosen flat entry appends (null for
 * a rolling one), `formula` is the clamped roll fragment a chosen rolling entry appends
 * (null for a flat one), `average` is what the pre-selection ranks by, and `display` is the
 * chip. `evaluateCheckRoll` re-derives the legal selection from this descriptor and never
 * trusts what the prompt returns, so every one of these has to travel with it.
 *
 * The pre-selection is the BEST LEGAL selection — the highest-AVERAGING `maxPicks`
 * modifiers, tie-broken by eligible-set order (the FIRST occurrence among equal averages
 * wins) — so it agrees exactly with what a non-interactive craft would have rolled.
 * `defaultSelectedIds` carries it; `defaultSelectedId` remains the first of them so a
 * single-pick prompt keeps its existing contract unchanged.
 *
 * Returns `null` when FEWER THAN TWO modifiers are eligible, so the caller omits the
 * choice and the formula keeps its deterministic contribution. Zero eligible modifiers is
 * the obvious case; ONE is suppressed too because a single-option radio group is not a
 * choice — the player cannot change it, and with one eligible modifier `highest` IS the
 * only possible pick, so the deterministic path produces identical arithmetic without
 * rendering a choice-less "Check modifier" panel.
 *
 * This appends NOTHING; it only surfaces the options for the interactive roll prompt.
 * The chosen contribution is appended downstream in `evaluateCheckRoll` once the player
 * confirms.
 *
 * Every option is resolved through the same {@link resolveCatalogueEntry} the deterministic
 * path uses, so the number the player is shown, the number the pre-selection is computed
 * from, and what the roll appends are all one resolution. A blocked entry reads `+0` here
 * too, so the prompt never advertises a contribution it cannot make.
 *
 * @param {object} context The modifier context ({@link buildCheckModifierContext}'s bag).
 * @param {(expression: string|undefined) => string|number|null} resolveExpression Injected
 *   `@`-substitution.
 * @param {typeof globalThis.Roll} [Roll]
 * @returns {{ modifiers: Array<{id:string,label:string,icon:string,value:number|null,
 *   formula:string|null,average:number,display:string}>, maxPicks: number,
 *   defaultSelectedIds: string[], defaultSelectedId: string }|null}
 */
export function buildCheckModifierChoice(context = {}, resolveExpression, Roll = globalThis.Roll) {
  const ids = resolveEligibleModifierIds(context);
  // Two-option rule: with 0 or 1 eligible modifier there is nothing to pick.
  if (ids.length < 2) return null;
  const byId = catalogueById(context.catalogue);
  const modifiers = ids.map((id) =>
    resolveCatalogueEntry(id, byId.get(id), resolveExpression, Roll)
  );
  const cap = resolveMaxModifierPicks(context);
  const maxPicks = Number.isFinite(cap) ? Math.min(cap, modifiers.length) : modifiers.length;
  const defaultSelectedIds = bestByAverage(modifiers, maxPicks).map((modifier) => modifier.id);
  return {
    modifiers,
    maxPicks,
    defaultSelectedIds,
    defaultSelectedId: defaultSelectedIds[0],
  };
}

/**
 * Deterministically evaluate a resolved expression (post `@`-substitution) to a number.
 *
 * DELEGATES to {@link reduceRollExpression} rather than carrying its own walk (issue 1118).
 * The two had to agree about arithmetic anyway, and a second recursive-descent reducer for
 * the same grammar is how a dice-aware reduction and a dice-blind one come to answer
 * differently about `floor(1d8 / 2)`.
 *
 * The reduction is the expression's deterministic AVERAGE, so a dice term contributes its
 * mean rather than a rolled face. That is the only reading that is a function of the text.
 *
 * @param {string} input
 * @returns {number} NaN on a malformed input; callers coerce that to 0.
 */
export function evaluateNumericExpression(input) {
  return reduceRollExpression(input).value;
}

/**
 * Build the real `@`-substitution for a crafting actor: resolve an expression's
 * `@`-placeholders against the actor's roll data via Foundry's `Roll.replaceFormulaData`
 * (missing keys → 0) and return the RESOLVED TEXT.
 *
 * IT RETURNS TEXT, NOT A NUMBER (issue 1118), and that is the whole seam change. A modifier
 * may roll, so reducing here would have destroyed the dice before anything downstream could
 * decide whether to append them; substitution is the only part of the resolution that needs
 * Foundry, and it is therefore the only part that is injected. {@link reduceRollExpression}
 * does the reduction, purely, from the text this returns.
 *
 * An unresolved key, an injected NaN sentinel, an absent `Roll`, or an empty expression all
 * yield `null` — "this expression does not resolve for this actor" — which every caller
 * treats as contributing nothing, exactly as the pre-1118 evaluator's `0` did.
 *
 * @param {object|null} actor
 * @param {typeof globalThis.Roll} [Roll]
 * @returns {(expression: string|undefined) => string|null}
 */
export function makeRollDataExpressionResolver(actor, Roll = globalThis.Roll) {
  const rollData = actor?.getRollData?.() ?? actor?.system ?? {};
  return (expression) => {
    if (typeof expression !== 'string' || expression.trim() === '') return null;
    if (typeof Roll?.replaceFormulaData !== 'function') return null;
    const replaced = Roll.replaceFormulaData(String(expression), rollData, {
      missing: '0',
      warn: false,
    });
    // An unresolved key or an injected NaN sentinel means the expression does not resolve
    // for this actor → contribute nothing.
    if (/@/.test(replaced) || /NaN/i.test(replaced)) return null;
    return replaced;
  };
}

/**
 * Apply a check-modifier context to a formula: resolve the eligible modifiers against the
 * crafter's roll data and APPEND their contribution, BEFORE the string reaches Foundry's
 * `Roll` (issues 1094, 1118).
 *
 * TWO APPENDS, IN A FIXED ORDER. The flat modifiers collapse into one `+ N[Modifiers]` term
 * first, then each rolling modifier gets its own `+ (…)[Modifiers]` term in eligible order.
 * The flat term leads so that a catalogue with no dice in it emits the byte-identical
 * formula it always has.
 *
 * There is no placeholder and no back-compat branch: a GM authors no token and cannot
 * forget one, so a catalogue that reaches a rolled check always contributes. A ZERO scalar
 * with no fragments — an empty eligible set, a subject's authored-empty pick, or no context
 * at all — appends nothing, so those formulas are byte-identical to their authored form
 * apart from the trim `appendToolBonusTerms` applies. A non-finite or exponent-notation
 * scalar also appends nothing rather than emitting a term the dice grammar cannot parse.
 *
 * The NAME says what it does rather than where it came from (issue 1095): it appends an
 * already-resolvable context, on any of the three activities, and nothing about it is
 * crafting-specific any more.
 *
 * @param {string} formula
 * @param {object|null} actor
 * @param {object|null} craftingModifier The modifier context
 *   ({@link buildCheckModifierContext}'s bag). The parameter keeps the `craftingModifier`
 *   spelling because that is the key every `checkRoll.js` options bag carries it under;
 *   renaming the OPTION is a wider rename than issue 1095 owns.
 * @param {typeof globalThis.Roll} [Roll]
 * @returns {string}
 */
export function appendResolvedCheckModifier(
  formula,
  actor,
  craftingModifier,
  Roll = globalThis.Roll
) {
  if (typeof formula !== 'string') return formula;
  if (!craftingModifier) return appendCheckModifierTerm(formula, { value: 0 });
  const { scalar, rollTerms } = resolveCheckModifierContribution(
    craftingModifier,
    makeRollDataExpressionResolver(actor, Roll),
    Roll
  );
  return appendCheckModifierRollTerms(
    appendCheckModifierTerm(formula, { value: scalar }),
    rollTerms
  );
}
