/**
 * Ownership of the crafting check-modifier catalogue (issues 770, 1055, 1094): who
 * decides which modifiers apply, what they reduce to, and how that number reaches the
 * roll.
 *
 * A crafting system may carry a named catalogue of check modifiers on its
 * `craftingCheck` config (`checkModifiers: {id,label,icon?,expression}[]`), a
 * COMBINATION RULE (`defaultModifierPolicy`) and a default eligible id set
 * (`defaultModifierIds`). The SYSTEM alone owns both axes: a recipe never overrides the
 * rule, and never substitutes its own eligible set except where the rule itself says so.
 *
 * The rule states WHO selects the eligible modifiers and WHEN. `byRecipe` ("Recipe
 * picks") defers the selection to the recipe author at recipe-edit time; `playerPicks`
 * defers it to the player at roll time; `addAll` and `highest` defer it to nobody and
 * reduce the system's own default set. Both deferring rules are bounded by
 * `craftingCheck.maxModifierPicks` (see {@link resolveMaxModifierPicks}), and both SUM
 * what was picked — which is why a bound of 1 reproduces the historical single-pick
 * behaviour exactly.
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
 * - DETERMINISTIC SCALAR ({@link resolveCraftingModifierScalar}) — `addAll` and
 *   `highest` always, and `playerPicks` on every non-interactive path (API, headless,
 *   automated), where it resolves to the best legal selection. {@link applyCraftingModifier}
 *   appends it before the string reaches Foundry's `Roll`.
 * - INTERACTIVE CHOICE ({@link buildCraftingModifierChoice}) — an interactive
 *   `playerPicks` craft over an authored formula with at least TWO eligible modifiers.
 *   This module only DESCRIBES the options (and the highest-valued pre-selection); the
 *   term is appended by `evaluateCheckRoll` once the roll prompt returns the player's
 *   pick, through the same {@link appendCheckModifierTerm} the scalar path uses.
 *
 * {@link resolveActiveCraftingCheckFormula} completes the ownership at the other end:
 * it answers WHICH of the `craftingCheck` sub-configs the system's resolution mode
 * actually rolls, and therefore whether the catalogue reaches a roll at all.
 *
 * This module is intentionally free of Foundry globals: the numeric evaluation of a
 * modifier expression is INJECTED (`evaluateExpression`), so the reduction is a pure,
 * exhaustively-testable function. `checkRoll.js` supplies the real evaluator (backed
 * by `Roll.replaceFormulaData` + a deterministic arithmetic reducer).
 */

import { stripRetiredModifierPlaceholder } from '../utils/craftingCheckExpression.js';

import { appendCheckModifierTerm } from './toolCheckBonus.js';

/**
 * The combination rules a system may choose, in authoring-surface order. Each states
 * both how the eligible values reduce to one number AND who selects them:
 *
 * - `addAll`      — sum the system's own default set. Nobody selects.
 * - `highest`     — `max(...)` of the system's own default set. Nobody selects.
 * - `byRecipe`    — "Recipe picks": the RECIPE author selects, at recipe-edit time.
 * - `playerPicks` — the PLAYER selects, at roll time.
 *
 * `byRecipe` is a first-class rule, not a delegation of authority: the recipe chooses
 * WHICH modifiers apply, never HOW they combine. Both selecting rules sum what was
 * picked and are bounded by {@link resolveMaxModifierPicks}.
 * @type {ReadonlyArray<'addAll'|'highest'|'byRecipe'|'playerPicks'>}
 */
export const MODIFIER_POLICIES = Object.freeze(['addAll', 'highest', 'byRecipe', 'playerPicks']);

const VALID_POLICIES = new Set(MODIFIER_POLICIES);

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
const SELECTING_POLICIES = new Set(['byRecipe', 'playerPicks']);

/**
 * Whether a combination rule defers modifier selection to someone other than the system,
 * and therefore whether `maxModifierPicks` applies to it. The authoring surfaces ask this
 * rather than re-deriving the membership test — the Checks card shows the cap input under
 * exactly these rules, and the recipe editor offers its picker under `byRecipe`.
 * @param {unknown} policy
 * @returns {boolean}
 */
export function policyDefersSelection(policy) {
  return SELECTING_POLICIES.has(policy);
}

/**
 * Normalize a combination rule to one of the four offerable rules; unknown values are
 * null so the caller can fall back.
 * @param {unknown} policy
 * @returns {'addAll'|'highest'|'byRecipe'|'playerPicks'|null}
 */
export function normalizeModifierPolicy(policy) {
  return VALID_POLICIES.has(policy) ? policy : null;
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
 * Build the check-modifier context for a system/recipe pair — the ONE bag both the
 * evaluation path (`CraftingEngine`) and the display path (`CraftingListingBuilder`)
 * resolve through, so a displayed formula can never disagree with the rolled one.
 *
 * `maxModifierPicks` is read straight off the persisted `craftingCheck` and is
 * `undefined` when the system has never been asked; the key is always present on the bag
 * so the shape is fixed, and {@link resolveMaxModifierPicks} owns what absence means.
 *
 * @param {object|null|undefined} system The crafting system.
 * @param {{ craftingModifier?: object|null }|null|undefined} recipe The recipe being crafted or listed.
 * @returns {{ catalogue: Array|undefined, systemPolicy: unknown, defaultModifierIds: Array|undefined,
 *   recipeModifier: object|null, maxModifierPicks: number|undefined }}
 */
export function buildCraftingModifierContext(system, recipe) {
  const check = system?.craftingCheck ?? {};
  return {
    catalogue: check.checkModifiers,
    systemPolicy: check.defaultModifierPolicy,
    defaultModifierIds: check.defaultModifierIds,
    recipeModifier: recipe?.craftingModifier ?? null,
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
 * Resolve the effective combination rule. The SYSTEM decides, full stop: a recipe's
 * stored `craftingModifier.policy` — which older data may still carry — is never
 * consulted, because a recipe may choose which modifiers apply but never how they
 * combine.
 *
 * The invariant lives here rather than at the authoring control, per "A UI control's
 * constraint is never an invariant": a legacy rule override left on disk stays on disk
 * and stays unhonoured, and no hand-built context can smuggle one back in.
 *
 * @param {{ systemPolicy?: unknown }|null|undefined} context
 * @returns {'addAll'|'highest'|'byRecipe'|'playerPicks'}
 */
export function resolveModifierPolicy(context = {}) {
  return normalizeModifierPolicy(context?.systemPolicy) ?? 'addAll';
}

/**
 * Resolve the ordered, de-duplicated, catalogue-validated list of eligible modifier
 * ids. Unknown ids (not present in the catalogue) are dropped, preserving source order.
 *
 * The recipe's id subset (`recipeModifier.modifierIds` is an array) is the source ONLY
 * under `byRecipe`, the rule that hands the selection to the recipe author; under every
 * other rule the system's `defaultModifierIds` is the source and a stored recipe subset
 * is ignored outright.
 *
 * Under `byRecipe` the resolved list is TRUNCATED to {@link resolveMaxModifierPicks},
 * keeping the first N in authored order. The bound is enforced here and not only at the
 * picker, per "A UI control's constraint is never an invariant" — a GM who lowers the cap
 * below what a recipe already picked must not leave that recipe rolling more modifiers
 * than the system now permits. Under `playerPicks` the list is the full set of OPTIONS
 * OFFERED and is deliberately not truncated; the cap bounds the player's selection from
 * it, which {@link buildCraftingModifierChoice} carries.
 *
 * An AUTHORED EMPTY array is an override, not an absence: a recipe carrying
 * `modifierIds: []` under `byRecipe` resolves to no eligible modifiers, so the scalar is
 * 0 and no term appends. `Recipe._normalizeCraftingModifier` preserves that shape on the
 * way in, keyed on `Array.isArray` at entry.
 *
 * @param {{ catalogue?: Array, systemPolicy?: unknown, defaultModifierIds?: Array,
 *   recipeModifier?: { modifierIds?: Array }|null, maxModifierPicks?: unknown }|null|undefined} context
 * @returns {string[]}
 */
export function resolveEligibleModifierIds(context = {}) {
  const { catalogue = [], defaultModifierIds = [], recipeModifier = null } = context ?? {};
  const known = new Set(
    (Array.isArray(catalogue) ? catalogue : [])
      .map((entry) => (entry && typeof entry === 'object' ? entry.id : null))
      .filter((id) => typeof id === 'string' && id !== '')
  );
  const recipePicks =
    resolveModifierPolicy(context) === 'byRecipe' && Array.isArray(recipeModifier?.modifierIds);
  const source = recipePicks
    ? recipeModifier.modifierIds
    : Array.isArray(defaultModifierIds)
      ? defaultModifierIds
      : [];
  const limit = recipePicks ? resolveMaxModifierPicks(context) : Infinity;
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
 * Resolve the check-modifier scalar for a modifier context.
 *
 * Reduction semantics:
 * - `highest`  → the deterministic `max(...)` of the eligible expression values (a
 *   scalar, NOT a keep-highest dice pool).
 * - `addAll`   → the sum of the eligible expression values.
 * - `byRecipe` → the sum of what the RECIPE picked. No special case is needed here:
 *   {@link resolveEligibleModifierIds} has already narrowed the list to the recipe's
 *   selection and truncated it to the cap, so summing that list is the whole rule.
 * - `playerPicks` → the DETERMINISTIC (non-interactive / API / headless) fallback: the
 *   sum of the BEST LEGAL SELECTION, i.e. the highest `maxModifierPicks` values. At a
 *   cap of 1 that is exactly `max(...)` — the historical behaviour — and unbounded it is
 *   the sum, because picking everything is then legal and optimal. The interactive
 *   per-roll selection is handled OUT of this scalar path, via
 *   {@link buildCraftingModifierChoice} + the interactive branch of `evaluateCheckRoll`.
 *
 * A missing/failed expression contributes 0 (never NaN). An empty eligible set → 0 —
 * including a recipe's AUTHORED empty set under `byRecipe`.
 *
 * @param {object} context
 * @param {Array} [context.catalogue]
 * @param {unknown} [context.systemPolicy]
 * @param {Array} [context.defaultModifierIds]
 * @param {{ modifierIds?: Array }|null} [context.recipeModifier]
 * @param {number} [context.maxModifierPicks]
 * @param {(expression: string|undefined) => number} evaluateExpression Injected
 *   numeric evaluator (roll-data resolution + arithmetic), so the reduction is pure.
 * @returns {number}
 */
export function resolveCraftingModifierScalar(context = {}, evaluateExpression) {
  const catalogue = Array.isArray(context.catalogue) ? context.catalogue : [];
  const policy = resolveModifierPolicy(context);
  const ids = resolveEligibleModifierIds(context);
  const byId = new Map(
    catalogue
      .filter((entry) => entry && typeof entry === 'object' && typeof entry.id === 'string')
      .map((entry) => [entry.id, entry])
  );
  const values = ids.map((id) => {
    const entry = byId.get(id);
    const raw =
      typeof evaluateExpression === 'function' ? evaluateExpression(entry?.expression) : 0;
    const num = Number(raw);
    return Number.isFinite(num) ? num : 0;
  });
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
  // `addAll` sums the system's default set; `byRecipe` sums the recipe's already-narrowed
  // and already-capped selection.
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
 * @param {object} context The modifier context ({@link buildCraftingModifierContext}'s bag).
 * @param {(expression: string|undefined) => number} evaluateExpression Injected
 *   numeric evaluator (roll-data resolution + arithmetic).
 * @returns {{ modifiers: Array<{id:string,label:string,icon:string,value:number}>,
 *   maxPicks: number, defaultSelectedIds: string[], defaultSelectedId: string }|null}
 */
export function buildCraftingModifierChoice(context = {}, evaluateExpression) {
  const catalogue = Array.isArray(context.catalogue) ? context.catalogue : [];
  const ids = resolveEligibleModifierIds(context);
  // Two-option rule: with 0 or 1 eligible modifier there is nothing to pick.
  if (ids.length < 2) return null;
  const byId = new Map(
    catalogue
      .filter((entry) => entry && typeof entry === 'object' && typeof entry.id === 'string')
      .map((entry) => [entry.id, entry])
  );
  const modifiers = ids.map((id) => {
    const entry = byId.get(id);
    const raw =
      typeof evaluateExpression === 'function' ? evaluateExpression(entry?.expression) : 0;
    const num = Number(raw);
    return {
      id,
      label: typeof entry?.label === 'string' ? entry.label : '',
      icon: typeof entry?.icon === 'string' ? entry.icon : '',
      value: Number.isFinite(num) ? num : 0,
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
 * scalar — an empty eligible set, a recipe's authored-empty pick, or no context at all
 * (salvage/gathering, which supply none) — appends nothing, so those formulas are
 * byte-identical to their authored form apart from the trim `appendToolBonusTerms`
 * applies. A non-finite or exponent-notation scalar also appends nothing rather than
 * emitting a term the dice grammar cannot parse.
 *
 * The name and signature are unchanged from the substitution era on purpose: every call
 * site keeps its shape, and only the arithmetic moved.
 *
 * @param {string} formula
 * @param {object|null} actor
 * @param {object|null} craftingModifier The modifier context
 *   ({@link buildCraftingModifierContext}'s bag).
 * @param {typeof globalThis.Roll} [Roll]
 * @returns {string}
 */
export function applyCraftingModifier(formula, actor, craftingModifier, Roll = globalThis.Roll) {
  if (typeof formula !== 'string') return formula;
  const scalar = craftingModifier
    ? resolveCraftingModifierScalar(craftingModifier, makeRollDataExpressionEvaluator(actor, Roll))
    : 0;
  return appendCheckModifierTerm(formula, { value: scalar });
}
