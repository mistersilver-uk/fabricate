/**
 * Ownership of the SYSTEM-LEVEL check-modifier catalogue (issues 770, 1055, 1094, 1095):
 * who decides which modifiers apply, what they reduce to, and how that number reaches
 * the roll — on all THREE activities.
 *
 * A crafting system carries ONE named catalogue at the system level
 * (`CraftingSystem.checkModifiers: {id,label,expression,icon?,min?,max?}[]`, issue 1095).
 * Each of the three activity checks — `craftingCheck`, `salvageCraftingCheck` and
 * `gatheringCraftingCheck` — carries its OWN selection over that one catalogue: a
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
 * gathering row"). {@link normalizeModifierPolicy} accepts `byRecipe` as a legacy READ
 * alias and never re-emits it, exactly as `breakToolsOnFail` reads
 * `consumeCatalystsOnFail`.
 *
 * PER-ENTRY BOUNDS (issue 1095). An entry's optional `min`/`max` clamp the RESOLVED
 * value, after expression evaluation and before combination. Both are absence-preserving
 * in the same way `maxModifierPicks` is: only a finite number is attached, and absence
 * means unbounded. An authored `min > max` is a BLOCKING readiness issue
 * (`modifierBoundsInverted`) and the entry contributes 0 until it is repaired — the same
 * refuse posture `INVALID_CHARACTER_MODIFIER_BOUNDS` already takes for gathering drop
 * modifiers, adopted deliberately so a check modifier and a drop modifier fail the same
 * way. See {@link resolveModifierBounds} and {@link clampModifierValue}.
 *
 * THE SCALAR APPENDS; IT DOES NOT SUBSTITUTE (issue 1094). There is no placeholder to
 * spend and no token a GM can forget: the resolved number is appended as one flavoured
 * `+ N[Modifiers]` term, exactly the way `appendToolBonusTerms` appends tool bonuses,
 * so a catalogue that reaches a rolled check always contributes. The retired
 * placeholder is stripped from stored formulas by the `1.21.0` migration and
 * from any survivor by `stripRetiredModifierPlaceholder`, so it can never double-count.
 *
 * This module serves the two modes the catalogue reduces through:
 *
 * - DETERMINISTIC SCALAR ({@link resolveCheckModifierScalar}) — `addAll` and
 *   `highest` always, and `playerPicks` on every non-interactive path (API, headless,
 *   automated), where it resolves to the best legal selection.
 *   {@link appendResolvedCheckModifier} appends it before the string reaches Foundry's
 *   `Roll`.
 * - INTERACTIVE CHOICE ({@link buildCheckModifierChoice}) — an interactive
 *   `playerPicks` attempt over an authored formula with at least TWO eligible modifiers.
 *   This module only DESCRIBES the options (and the highest-valued pre-selection); the
 *   term is appended by `evaluateCheckRoll` once the roll prompt returns the player's
 *   pick, through the same {@link appendCheckModifierTerm} the scalar path uses.
 *
 * Three sibling derivations complete the ownership at the other end —
 * {@link resolveActiveCraftingCheckFormula}, {@link resolveActiveSalvageCheckFormula}
 * and {@link resolveActiveGatheringCheckFormula}. Each answers WHICH sub-config its
 * activity's resolution mode actually rolls, and therefore whether the catalogue reaches
 * a roll at all; all three apply the issue-1094 retirement shim BEFORE their emptiness
 * test, so readiness and the roll path can never disagree on any activity.
 *
 * This module is intentionally free of Foundry globals: the numeric evaluation of a
 * modifier expression is INJECTED (`evaluateExpression`), so the reduction is a pure,
 * exhaustively-testable function. `checkRoll.js` supplies the real evaluator (backed
 * by `Roll.replaceFormulaData` + a deterministic arithmetic reducer).
 */

import { stripRetiredModifierPlaceholder } from '../utils/craftingCheckExpression.js';

import { resolveSalvageCheck } from './salvageCheckUsability.js';
import { appendCheckModifierTerm, isDecimalSafeTermValue } from './toolCheckBonus.js';

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
 * The LABEL is per-activity ("By recipe" / "By component" / "By gathering row") and lives
 * in the authoring surfaces; the TOKEN is activity-independent, which is why issue 1095
 * renamed the pre-1095 `byRecipe`.
 * @type {ReadonlyArray<'addAll'|'highest'|'bySubject'|'playerPicks'>}
 */
export const MODIFIER_POLICIES = Object.freeze(['addAll', 'highest', 'bySubject', 'playerPicks']);

const VALID_POLICIES = new Set(MODIFIER_POLICIES);

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
 * @param {object|null|undefined} system The crafting system (owner of `checkModifiers`).
 * @param {'crafting'|'salvage'|'gathering'} activity Which activity's selection to read.
 * @param {object|null|undefined} subject The record being resolved: a recipe, a component
 *   or a gathering task.
 * @returns {{ activity: string, catalogue: Array|undefined, systemPolicy: unknown,
 *   defaultModifierIds: Array|undefined, subjectModifierIds: Array|null,
 *   maxModifierPicks: number|undefined }}
 */
export function buildCheckModifierContext(system, activity, subject) {
  const check = system?.[ACTIVITY_CHECK_KEYS.get(activity) ?? ''] ?? {};
  return {
    activity,
    catalogue: system?.checkModifiers,
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
 * it with cause `noCheck`. Gathering's separate d100 `characterModifiers` library is a
 * DIFFERENT concept (percentage-point / multiplicative) and does not participate in
 * `progressive` or `routed`.
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
 * "this mode rolls nothing" state (which salvage, unlike crafting and gathering, has
 * none of).
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
 * Evaluate one catalogue entry to its CLAMPED finite contribution. A missing or failed
 * expression contributes 0 (never NaN), and the entry's own bounds are applied here so
 * every consumer of a modifier value gets the bounded one.
 * @param {object|undefined} entry
 * @param {(expression: string|undefined) => number} evaluateExpression
 * @returns {number}
 */
function resolveEntryValue(entry, evaluateExpression) {
  const raw = typeof evaluateExpression === 'function' ? evaluateExpression(entry?.expression) : 0;
  const num = Number(raw);
  return clampModifierValue(Number.isFinite(num) ? num : 0, entry);
}

/**
 * Resolve the check-modifier scalar for a modifier context.
 *
 * Reduction semantics:
 * - `highest`  → the deterministic `max(...)` of the eligible expression values (a
 *   scalar, NOT a keep-highest dice pool).
 * - `addAll`   → the sum of the eligible expression values.
 * - `bySubject` → the sum of what the SUBJECT picked. No special case is needed here:
 *   {@link resolveEligibleModifierIds} has already narrowed the list to the subject's
 *   selection and truncated it to the cap, so summing that list is the whole rule.
 * - `playerPicks` → the DETERMINISTIC (non-interactive / API / headless) fallback: the
 *   sum of the BEST LEGAL SELECTION, i.e. the highest `maxModifierPicks` values. At a
 *   cap of 1 that is exactly `max(...)` — the historical behaviour — and unbounded it is
 *   the sum, because picking everything is then legal and optimal. The interactive
 *   per-roll selection is handled OUT of this scalar path, via
 *   {@link buildCheckModifierChoice} + the interactive branch of `evaluateCheckRoll`.
 *
 * Each value is CLAMPED to its own entry's `min`/`max` before it is combined (issue
 * 1095), so a bound means the same thing under every rule and an inverted pair
 * contributes 0.
 *
 * A missing/failed expression contributes 0 (never NaN). An empty eligible set → 0 —
 * including a subject's AUTHORED empty set under `bySubject`.
 *
 * @param {object} context
 * @param {Array} [context.catalogue]
 * @param {unknown} [context.systemPolicy]
 * @param {Array} [context.defaultModifierIds]
 * @param {Array|null} [context.subjectModifierIds]
 * @param {number} [context.maxModifierPicks]
 * @param {(expression: string|undefined) => number} evaluateExpression Injected
 *   numeric evaluator (roll-data resolution + arithmetic), so the reduction is pure.
 * @returns {number}
 */
export function resolveCheckModifierScalar(context = {}, evaluateExpression) {
  const policy = resolveModifierPolicy(context);
  const ids = resolveEligibleModifierIds(context);
  const byId = catalogueById(context.catalogue);
  const values = ids.map((id) => resolveEntryValue(byId.get(id), evaluateExpression));
  if (values.length === 0) return 0;
  if (policy === 'highest') return Math.max(...values);
  if (policy === 'playerPicks') {
    // The non-interactive fallback stands in for a player who picks optimally: the sum
    // of the highest N values the cap allows. At N=1 this is `max(...)`, reproducing the
    // historical single-pick behaviour exactly; unbounded, every value is legal to pick
    // and the same expression yields the plain sum.
    const limit = resolveMaxModifierPicks(context);
    if (limit >= values.length) return sumOf(values);
    return sumOf([...values].sort((a, b) => b - a).slice(0, limit));
  }
  // `addAll` sums the activity's default set; `bySubject` sums the subject's
  // already-narrowed and already-capped selection.
  return sumOf(values);
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
 * Build the interactive `playerPicks` choice descriptor for a modifier context: the
 * eligible modifier set mapped to `{ id, label, icon, value }` (value = the modifier's
 * `expression` evaluated to a finite number, else 0), the `maxPicks` cap the prompt must
 * enforce, and the pre-selection.
 *
 * The pre-selection is the BEST LEGAL selection — the highest-valued `maxPicks`
 * modifiers, tie-broken by eligible-set order (the FIRST occurrence among equal values
 * wins) — so it agrees exactly with the deterministic scalar a non-interactive craft
 * would have rolled. `defaultSelectedIds` carries it; `defaultSelectedId` remains the
 * first of them so a single-pick prompt keeps its existing contract unchanged.
 *
 * Returns `null` when FEWER THAN TWO modifiers are eligible, so the caller omits the
 * choice and the formula keeps its deterministic scalar. Zero eligible modifiers is the
 * obvious case; ONE is suppressed too because a single-option radio group is not a
 * choice — the player cannot change it, and with one eligible modifier `highest` IS the
 * only possible pick, so the deterministic path produces identical arithmetic without
 * rendering a choice-less "Check modifier" panel.
 *
 * This appends NOTHING; it only surfaces the options for the interactive roll prompt.
 * The chosen value is appended downstream in `evaluateCheckRoll` once the player
 * confirms.
 *
 * Each option's `value` is CLAMPED to its entry's own `min`/`max` (issue 1095) through
 * the same {@link clampModifierValue} the scalar path uses, so the number the player is
 * shown, the number the pre-selection is computed from, and the number the roll appends
 * are all one number. An inverted pair reads 0 here too, so the prompt never advertises a
 * contribution a blocked entry cannot make.
 *
 * @param {object} context The modifier context ({@link buildCheckModifierContext}'s bag).
 * @param {(expression: string|undefined) => number} evaluateExpression Injected
 *   numeric evaluator (roll-data resolution + arithmetic).
 * @returns {{ modifiers: Array<{id:string,label:string,icon:string,value:number}>,
 *   maxPicks: number, defaultSelectedIds: string[], defaultSelectedId: string }|null}
 */
export function buildCheckModifierChoice(context = {}, evaluateExpression) {
  const ids = resolveEligibleModifierIds(context);
  // Two-option rule: with 0 or 1 eligible modifier there is nothing to pick.
  if (ids.length < 2) return null;
  const byId = catalogueById(context.catalogue);
  const modifiers = ids.map((id) => {
    const entry = byId.get(id);
    return {
      id,
      label: typeof entry?.label === 'string' ? entry.label : '',
      icon: typeof entry?.icon === 'string' ? entry.icon : '',
      value: resolveEntryValue(entry, evaluateExpression),
    };
  });
  // Pre-select the best LEGAL selection: the highest-valued `maxPicks` modifiers. The
  // sort is on a copy carrying each modifier's original index so equal values tie-break
  // by eligible-set order (first occurrence wins), matching the single-pick behaviour
  // this generalizes and keeping the pre-selection equal to the deterministic scalar.
  const cap = resolveMaxModifierPicks(context);
  const maxPicks = Number.isFinite(cap) ? Math.min(cap, modifiers.length) : modifiers.length;
  const defaultSelectedIds = modifiers
    .map((modifier, index) => ({ modifier, index }))
    .sort((a, b) => b.modifier.value - a.modifier.value || a.index - b.index)
    .slice(0, maxPicks)
    .sort((a, b) => a.index - b.index)
    .map(({ modifier }) => modifier.id);
  return {
    modifiers,
    maxPicks,
    defaultSelectedIds,
    defaultSelectedId: defaultSelectedIds[0],
  };
}

/**
 * Deterministically evaluate a resolved arithmetic string (post `@`-substitution) to
 * a number. Supports `+ - * / %`, parentheses, unary +/-, decimals, and the common
 * roll-data math functions (`floor`/`ceil`/`round`/`trunc`/`abs`/`sign`/`min`/`max`).
 * No dice, no `eval`/`Function` (avoids the code-injection smell). Returns NaN on a
 * malformed input; callers coerce that to 0.
 * @param {string} input
 * @returns {number}
 */
export function evaluateNumericExpression(input) {
  const src = String(input ?? '').trim();
  if (src === '') return NaN;
  let i = 0;

  const skipWs = () => {
    while (i < src.length && /\s/.test(src[i])) i++;
  };

  function parseExpression() {
    let left = parseTerm();
    for (;;) {
      skipWs();
      const op = src[i];
      if (op === '+' || op === '-') {
        i++;
        const right = parseTerm();
        left = op === '+' ? left + right : left - right;
      } else break;
    }
    return left;
  }

  function parseTerm() {
    let left = parseUnary();
    for (;;) {
      skipWs();
      const op = src[i];
      if (['*', '/', '%'].includes(op)) {
        i++;
        const right = parseUnary();
        if (op === '*') left *= right;
        else if (op === '/') left = right === 0 ? NaN : left / right;
        else left = right === 0 ? NaN : left % right;
      } else break;
    }
    return left;
  }

  function parseUnary() {
    skipWs();
    if (src[i] === '+') {
      i++;
      return parseUnary();
    }
    if (src[i] === '-') {
      i++;
      return -parseUnary();
    }
    return parsePrimary();
  }

  function parsePrimary() {
    skipWs();
    const ch = src[i];
    if (ch === '(') {
      i++;
      const value = parseExpression();
      skipWs();
      if (src[i] === ')') i++;
      return value;
    }
    if (/[a-zA-Z_]/.test(ch)) return parseFunction();
    return parseNumber();
  }

  function parseNumber() {
    skipWs();
    const start = i;
    while (i < src.length && /[0-9.]/.test(src[i])) i++;
    const num = Number(src.slice(start, i));
    return Number.isFinite(num) ? num : NaN;
  }

  function parseFunction() {
    const start = i;
    while (i < src.length && /[a-zA-Z_]/.test(src[i])) i++;
    const name = src.slice(start, i).toLowerCase();
    skipWs();
    const args = [];
    if (src[i] === '(') {
      i++;
      skipWs();
      if (src[i] !== ')') {
        args.push(parseExpression());
        skipWs();
        while (src[i] === ',') {
          i++;
          args.push(parseExpression());
          skipWs();
        }
      }
      if (src[i] === ')') i++;
    }
    return applyMathFunction(name, args);
  }

  const result = parseExpression();
  return Number.isFinite(result) ? result : NaN;
}

function applyMathFunction(name, args) {
  switch (name) {
    case 'floor': {
      return Math.floor(args[0]);
    }
    case 'ceil': {
      return Math.ceil(args[0]);
    }
    case 'round': {
      return Math.round(args[0]);
    }
    case 'trunc': {
      return Math.trunc(args[0]);
    }
    case 'abs': {
      return Math.abs(args[0]);
    }
    case 'sign': {
      return Math.sign(args[0]);
    }
    case 'min': {
      return args.length > 0 ? Math.min(...args) : NaN;
    }
    case 'max': {
      return args.length > 0 ? Math.max(...args) : NaN;
    }
    default: {
      return NaN;
    }
  }
}

/**
 * Build the real expression evaluator for a crafting actor: resolve an expression's
 * `@`-placeholders against the actor's roll data via Foundry's `Roll.replaceFormulaData`
 * (missing keys → 0), then reduce the arithmetic deterministically. Any unresolved key,
 * NaN, or malformed expression yields 0 — never NaN into the roll.
 * @param {object|null} actor
 * @param {typeof globalThis.Roll} [Roll]
 * @returns {(expression: string|undefined) => number}
 */
export function makeRollDataExpressionEvaluator(actor, Roll = globalThis.Roll) {
  const rollData = actor?.getRollData?.() ?? actor?.system ?? {};
  return (expression) => {
    if (typeof expression !== 'string' || expression.trim() === '') return 0;
    if (typeof Roll?.replaceFormulaData !== 'function') return 0;
    const replaced = Roll.replaceFormulaData(String(expression), rollData, {
      missing: '0',
      warn: false,
    });
    // An unresolved key or an injected NaN sentinel means the expression does not
    // reduce to a number for this actor → contribute 0.
    if (/@/.test(replaced) || /NaN/i.test(replaced)) return 0;
    const value = evaluateNumericExpression(replaced);
    return Number.isFinite(value) ? value : 0;
  };
}

/**
 * Apply a check-modifier context to a formula: resolve the eligible modifiers to a
 * scalar against the crafter's roll data and APPEND it as one flavoured
 * `+ N[Modifiers]` term, BEFORE the string reaches Foundry's `Roll` (issue 1094).
 *
 * There is no placeholder and no back-compat branch: a GM authors no token and cannot
 * forget one, so a catalogue that reaches a rolled check always contributes. A ZERO
 * scalar — an empty eligible set, a subject's authored-empty pick, or no context at all
 * — appends nothing, so those formulas are byte-identical to their authored form apart
 * from the trim `appendToolBonusTerms` applies. A non-finite or exponent-notation scalar
 * also appends nothing rather than emitting a term the dice grammar cannot parse.
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
  const scalar = craftingModifier
    ? resolveCheckModifierScalar(craftingModifier, makeRollDataExpressionEvaluator(actor, Roll))
    : 0;
  return appendCheckModifierTerm(formula, { value: scalar });
}
