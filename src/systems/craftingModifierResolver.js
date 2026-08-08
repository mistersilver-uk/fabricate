/**
 * Ownership of the Fabricate `@craftingmod` placeholder (issues 770, 1055): where it
 * may be spent, who decides what it reduces to, and how it is substituted.
 *
 * A crafting system may carry a named catalogue of check modifiers on its
 * `craftingCheck` config (`checkModifiers: {id,label,icon?,expression}[]`), a default
 * COMBINATION RULE (`defaultModifierPolicy`) and a default eligible id set
 * (`defaultModifierIds`). A recipe may override the rule and/or the eligible id subset
 * through `Recipe.craftingModifier` — but only as far as the system delegates, which the
 * system states on `craftingCheck.recipeModifierAuthority` (see
 * {@link resolveRecipeModifierAuthority}).
 *
 * The catalogue feeds a Fabricate-owned `@craftingmod` formula placeholder, and this
 * module serves the two modes that placeholder resolves through:
 *
 * - DETERMINISTIC SCALAR ({@link resolveCraftingModifierScalar}) — `addAll` and
 *   `highest` always, and `playerPicks` on every non-interactive path (API, headless,
 *   automated), where it resolves identically to `highest`. The scalar is substituted
 *   into the check roll formula BEFORE the string reaches Foundry's `Roll` (an
 *   unresolved `@craftingmod` would otherwise be silently treated as 0 by Foundry).
 * - INTERACTIVE CHOICE ({@link buildCraftingModifierChoice}) — an interactive
 *   `playerPicks` craft over a `@craftingmod` formula with at least TWO eligible
 *   modifiers. This module only DESCRIBES the options (and the highest-valued
 *   pre-selection); `@craftingmod` stays unsubstituted until the roll prompt returns the
 *   player's pick, which `evaluateCheckRoll` then substitutes through the same
 *   {@link substituteCraftingModifier} the scalar path uses.
 *
 * {@link resolveActiveCraftingCheckFormula} completes the ownership at the other end:
 * it answers WHICH of the `craftingCheck` sub-configs the system's resolution mode
 * actually rolls, and therefore whether a `@craftingmod` reference is live or inert.
 * Every consumer of that selector asks it in order to answer a `@craftingmod` question,
 * and {@link CRAFTING_MOD_TOKEN} — the other half of each of those answers — is here.
 *
 * This module is intentionally free of Foundry globals: the numeric evaluation of a
 * modifier expression is INJECTED (`evaluateExpression`), so the reduction is a pure,
 * exhaustively-testable function. `checkRoll.js` supplies the real evaluator (backed
 * by `Roll.replaceFormulaData` + a deterministic arithmetic reducer).
 */

/** The Fabricate-owned placeholder resolved to a scalar before Foundry sees the roll. */
export const CRAFTING_MOD_TOKEN = '@craftingmod';

// Word-boundary match so `@craftingmodifier` (a hypothetical longer token) is NOT
// clobbered; `\b` after `d` fails against a following word char. Global so every
// occurrence is substituted; `String#replace` resets `lastIndex` on each call.
const CRAFTING_MOD_TOKEN_RE = /@craftingmod\b/g;

/**
 * The combination rules that may be OFFERED — the authoring surface's option list and
 * the only values a normalizer persists. `byRecipe` is deliberately absent: it
 * conflated the eligible SET with the combination RULE, and the set axis is now
 * `recipeModifierAuthority` (issue 1055).
 */
const VALID_POLICIES = new Set(['addAll', 'highest', 'playerPicks']);

/**
 * Retired policy values still readable from persisted data, translated on READ. Kept
 * separate from {@link VALID_POLICIES} because the two answer different questions:
 * what may be offered versus what may be understood.
 *
 * This is the ONE choke point for the translation, so a hand-built context carrying
 * `policy: 'byRecipe'` — an imported payload, an un-migrated world, an internally
 * constructed bag that never passed through `Recipe` — cannot bypass
 * `Recipe._normalizeCraftingModifier`'s own mapping and flip sum→max on a `highest`
 * system. The two mappings are a deliberate PAIR, not a redundancy: `Recipe`
 * pre-translates so this alias is never consulted for a recipe built through the model,
 * and this alias re-translates whatever never reached the model.
 *
 * `byRecipe` maps to `addAll` because that is what it arithmetically did — the eligible
 * id resolution already preferred the recipe's own `modifierIds`, and `byRecipe` summed
 * exactly that set.
 */
const LEGACY_POLICY_ALIASES = new Map([['byRecipe', 'addAll']]);

/**
 * The authority levels a system may delegate to its recipes (issue 1055), in
 * authoring-surface order — least to most delegated.
 *
 * - `none` — recipes inherit both axes; no per-recipe control is offered.
 * - `setOnly` — recipes choose the eligible modifier SET.
 * - `setAndRule` — recipes may also override the combination RULE.
 *
 * ABSENT is a fourth, unpersisted state meaning "not yet stamped", and it is
 * load-bearing; see {@link resolveRecipeModifierAuthority}.
 * @type {ReadonlyArray<'none'|'setOnly'|'setAndRule'>}
 */
export const RECIPE_MODIFIER_AUTHORITIES = Object.freeze(['none', 'setOnly', 'setAndRule']);

const RECIPE_MODIFIER_AUTHORITY_SET = new Set(RECIPE_MODIFIER_AUTHORITIES);

/**
 * Normalize a combination rule to one of the three offerable rules, translating a
 * retired value through {@link LEGACY_POLICY_ALIASES}; unknown values are null.
 * @param {unknown} policy
 * @returns {'addAll'|'highest'|'playerPicks'|null}
 */
export function normalizeModifierPolicy(policy) {
  if (VALID_POLICIES.has(policy)) return policy;
  return LEGACY_POLICY_ALIASES.get(policy) ?? null;
}

/**
 * Resolve how much authority over the modifier axes the system delegates to its recipes.
 *
 * An ABSENT (or `null`, or unrecognized) value resolves as `setAndRule` — today's
 * pre-1055 behaviour — so nothing silently loses authority before it is stamped: a
 * client where the initialize-time stamp cannot run, an imported payload, and an
 * internally hand-built context all keep honouring the recipe overrides they honoured
 * before this axis existed. The stamp only ever narrows a system a GM has decided about.
 *
 * @param {{ recipeModifierAuthority?: unknown }|null|undefined} context
 * @returns {'none'|'setOnly'|'setAndRule'}
 */
export function resolveRecipeModifierAuthority(context) {
  const authority = context?.recipeModifierAuthority;
  return RECIPE_MODIFIER_AUTHORITY_SET.has(authority) ? authority : 'setAndRule';
}

/**
 * Build the `@craftingmod` modifier context for a system/recipe pair — the ONE bag both
 * the evaluation path (`CraftingEngine`) and the display path (`CraftingListingBuilder`)
 * resolve through, so a displayed formula can never disagree with the rolled one.
 *
 * `recipeModifierAuthority` is read straight off the persisted `craftingCheck` and is
 * `undefined` when the system has not been stamped; the key is always present on the bag
 * so the shape is fixed, and {@link resolveRecipeModifierAuthority} owns what absence
 * means.
 *
 * @param {object|null|undefined} system The crafting system.
 * @param {{ craftingModifier?: object|null }|null|undefined} recipe The recipe being crafted or listed.
 * @returns {{ catalogue: Array|undefined, systemPolicy: unknown, defaultModifierIds: Array|undefined,
 *   recipeModifier: object|null, recipeModifierAuthority: 'none'|'setOnly'|'setAndRule'|undefined }}
 */
export function buildCraftingModifierContext(system, recipe) {
  const check = system?.craftingCheck ?? {};
  return {
    catalogue: check.checkModifiers,
    systemPolicy: check.defaultModifierPolicy,
    defaultModifierIds: check.defaultModifierIds,
    recipeModifier: recipe?.craftingModifier ?? null,
    recipeModifierAuthority: check.recipeModifierAuthority,
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
 * Resolve the crafting check a system's resolution mode ACTUALLY rolls, and whether a
 * `@craftingmod` reference in it is live.
 *
 * | Resolution mode       | Check config              | Notes                                   |
 * |-----------------------|---------------------------|-----------------------------------------|
 * | `simple`              | `craftingCheck.simple`    | optional                                |
 * | `routedByIngredients` | `craftingCheck.simple`    | optional; shares the simple slot        |
 * | `routedByCheck`       | `craftingCheck.routed`    | required                                |
 * | `progressive`         | `craftingCheck.progressive` | required                              |
 * | `alchemy`             | per `alchemy.checkMode`   | `none` → no check, `simple` → `simple`, `tiered` → `routed` |
 *
 * The return distinguishes the three reasons a catalogue of check modifiers can be
 * INERT, which no single boolean can: `slot === null` (this mode rolls no check at all),
 * `slot && !checkUsable` (a slot exists but no formula is authored) and
 * `checkUsable && !referencesModifier` (a formula is authored but never spends
 * `@craftingmod`, so every modifier silently contributes nothing).
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
 *   referencesModifier: boolean,
 * }}
 *
 * - `alchemyCheckMode` is `null` for every non-alchemy mode, so it can never be
 *   mistaken for an authored `'none'`.
 * - `rollFormula` is TRIMMED (`''` when there is none): an authored `"   "` is not a
 *   check, matching `ResolutionModeService._hasRollFormula` and `hasCheckFormula`.
 * - `requiresCheck` marks the modes that fail the craft without a rolled outcome —
 *   `routedByCheck`, `progressive`, and alchemy at `simple`/`tiered`.
 */
export function resolveActiveCraftingCheckFormula(system) {
  const mode = system?.resolutionMode || 'simple';
  const alchemyCheckMode = mode === 'alchemy' ? system?.alchemy?.checkMode || 'none' : null;
  const slot =
    (mode === 'alchemy'
      ? ALCHEMY_CHECK_SLOTS.get(alchemyCheckMode)
      : CRAFTING_CHECK_SLOTS.get(mode)) ?? null;
  const config = slot ? ((system?.craftingCheck ?? {})[slot] ?? null) : null;
  const rollFormula = typeof config?.rollFormula === 'string' ? config.rollFormula.trim() : '';
  return {
    mode,
    alchemyCheckMode,
    slot,
    config,
    rollFormula,
    checkUsable: rollFormula.length > 0,
    requiresCheck: REQUIRED_CHECK_MODES.has(mode) || (mode === 'alchemy' && slot !== null),
    referencesModifier: rollFormula.includes(CRAFTING_MOD_TOKEN),
  };
}

/**
 * Resolve the effective combination rule: the recipe's override wins over the system
 * default, which wins over the `addAll` fallback — but the recipe override is consulted
 * ONLY when the system delegates the rule axis (`setAndRule`).
 *
 * The invariant lives here rather than at the authoring control, per "A UI control's
 * constraint is never an invariant": a stored override left behind by a GM lowering the
 * authority level stays on disk and stays unhonoured.
 *
 * @param {{ systemPolicy?: unknown, recipeModifier?: { policy?: unknown }|null,
 *   recipeModifierAuthority?: unknown }|null|undefined} context
 * @returns {'addAll'|'highest'|'playerPicks'}
 */
export function resolveModifierPolicy(context = {}) {
  const recipePolicy =
    resolveRecipeModifierAuthority(context) === 'setAndRule'
      ? normalizeModifierPolicy(context?.recipeModifier?.policy)
      : null;
  return recipePolicy ?? normalizeModifierPolicy(context?.systemPolicy) ?? 'addAll';
}

/**
 * Resolve the ordered, de-duplicated, catalogue-validated list of eligible modifier
 * ids. The recipe's id subset (`recipeModifier.modifierIds` is an array) is used when
 * the system delegates the SET axis (`setOnly` or `setAndRule`); otherwise the system
 * `defaultModifierIds`. Unknown ids (not present in the catalogue) are dropped,
 * preserving source order.
 *
 * An AUTHORED EMPTY array is an override, not an absence: a recipe carrying
 * `modifierIds: []` under a delegating authority resolves to no eligible modifiers, so
 * `@craftingmod` reduces to 0. `Recipe._normalizeCraftingModifier` preserves that shape
 * on the way in, keyed on `Array.isArray` at entry.
 *
 * @param {{ catalogue?: Array, defaultModifierIds?: Array,
 *   recipeModifier?: { modifierIds?: Array }|null, recipeModifierAuthority?: unknown }|null|undefined} context
 * @returns {string[]}
 */
export function resolveEligibleModifierIds(context = {}) {
  const { catalogue = [], defaultModifierIds = [], recipeModifier = null } = context ?? {};
  const authority = resolveRecipeModifierAuthority(context);
  const known = new Set(
    (Array.isArray(catalogue) ? catalogue : [])
      .map((entry) => (entry && typeof entry === 'object' ? entry.id : null))
      .filter((id) => typeof id === 'string' && id !== '')
  );
  const recipeSetHonoured =
    (authority === 'setOnly' || authority === 'setAndRule') &&
    Array.isArray(recipeModifier?.modifierIds);
  const source = recipeSetHonoured
    ? recipeModifier.modifierIds
    : Array.isArray(defaultModifierIds)
      ? defaultModifierIds
      : [];
  const seen = new Set();
  const ids = [];
  for (const id of source) {
    if (typeof id !== 'string' || !known.has(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * Resolve the `@craftingmod` scalar for a modifier context.
 *
 * Reduction semantics:
 * - `highest`  → the deterministic `max(...)` of the eligible expression values (a
 *   scalar, NOT a keep-highest dice pool).
 * - `addAll`   → the sum of the eligible expression values. A persisted legacy
 *   `byRecipe` reduces here too, via {@link LEGACY_POLICY_ALIASES} — the eligible id
 *   resolution already prefers the recipe's `modifierIds`, so summing that set is
 *   exactly what `byRecipe` did.
 * - `playerPicks` → the DETERMINISTIC (non-interactive / API / headless) fallback,
 *   which resolves identically to `highest`. The interactive per-roll selection is
 *   handled OUT of this scalar path, via {@link buildCraftingModifierChoice} + the
 *   interactive branch of `evaluateCheckRoll`.
 *
 * A missing/failed expression contributes 0 (never NaN). An empty eligible set → 0 —
 * including a recipe's AUTHORED empty set under a delegating authority.
 *
 * @param {object} context
 * @param {Array} [context.catalogue]
 * @param {unknown} [context.systemPolicy]
 * @param {Array} [context.defaultModifierIds]
 * @param {{ policy?: unknown, modifierIds?: Array }|null} [context.recipeModifier]
 * @param {'none'|'setOnly'|'setAndRule'} [context.recipeModifierAuthority]
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
  // `playerPicks` resolves deterministically as `highest` here — this scalar path is
  // the non-interactive / API / headless fallback; the interactive per-roll choice is
  // resolved via buildCraftingModifierChoice + evaluateCheckRoll instead.
  if (policy === 'highest' || policy === 'playerPicks') return Math.max(...values);
  // `addAll` sums its eligible set (and a persisted `byRecipe` has already been
  // translated to `addAll` by `normalizeModifierPolicy`).
  return values.reduce((sum, value) => sum + value, 0);
}

/**
 * Build the interactive `playerPicks` choice descriptor for a modifier context: the
 * eligible modifier set mapped to `{ id, label, icon, value }` (value = the modifier's
 * `expression` evaluated to a finite number, else 0), plus the `defaultSelectedId` —
 * the highest-valued eligible modifier, tie-broken by eligible-set order (the FIRST
 * occurrence among equal-max wins).
 *
 * Returns `null` when FEWER THAN TWO modifiers are eligible, so the caller omits the
 * choice and the formula keeps its deterministic scalar. Zero eligible modifiers is the
 * obvious case; ONE is suppressed too because a single-option radio group is not a
 * choice — the player cannot change it, and with one eligible modifier `highest` IS the
 * only possible pick, so the deterministic path produces identical arithmetic without
 * rendering a choice-less "Check modifier" panel.
 *
 * This does NOT substitute `@craftingmod`; it only surfaces the options for the
 * interactive roll prompt. The chosen value is substituted downstream in
 * `evaluateCheckRoll` once the player confirms.
 *
 * @param {object} context The modifier context ({@link buildCraftingModifierContext}'s bag).
 * @param {(expression: string|undefined) => number} evaluateExpression Injected
 *   numeric evaluator (roll-data resolution + arithmetic).
 * @returns {{ token: string, modifiers: Array<{id:string,label:string,icon:string,value:number}>,
 *   defaultSelectedId: string }|null}
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
  // Default-select the highest-valued modifier; strict `>` keeps the FIRST occurrence
  // among equal-max (eligible-set order tie-break — iterate in id order).
  let defaultSelectedId = modifiers[0].id;
  let bestValue = modifiers[0].value;
  for (const modifier of modifiers) {
    if (modifier.value > bestValue) {
      bestValue = modifier.value;
      defaultSelectedId = modifier.id;
    }
  }
  return { token: CRAFTING_MOD_TOKEN, modifiers, defaultSelectedId };
}

/**
 * Substitute a resolved scalar for every `@craftingmod` token in a formula. The
 * scalar is wrapped in parentheses so a negative modifier stays valid arithmetic
 * (`1d20 + (-2)`). A formula with no token is returned unchanged; a non-finite scalar
 * substitutes 0.
 * @param {string} formula
 * @param {number} scalar
 * @returns {string}
 */
export function substituteCraftingModifier(formula, scalar) {
  if (typeof formula !== 'string' || !formula.includes(CRAFTING_MOD_TOKEN)) return formula;
  const value = Number.isFinite(Number(scalar)) ? Number(scalar) : 0;
  return formula.replaceAll(CRAFTING_MOD_TOKEN_RE, `(${value})`);
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
 * Apply a crafting modifier context to a formula: resolve `@craftingmod` to a scalar
 * against the crafter's roll data and substitute it, BEFORE the string reaches
 * Foundry's `Roll`. A formula without the token (or with no context) is returned
 * unchanged — full back-compat with single-formula checks. A present token with no
 * context substitutes 0 (defensive; salvage/gathering never author `@craftingmod`).
 * @param {string} formula
 * @param {object|null} actor
 * @param {object|null} craftingModifier The modifier context
 *   ({@link buildCraftingModifierContext}'s bag).
 * @param {typeof globalThis.Roll} [Roll]
 * @returns {string}
 */
export function applyCraftingModifier(formula, actor, craftingModifier, Roll = globalThis.Roll) {
  if (typeof formula !== 'string' || !formula.includes(CRAFTING_MOD_TOKEN)) return formula;
  const scalar = craftingModifier
    ? resolveCraftingModifierScalar(craftingModifier, makeRollDataExpressionEvaluator(actor, Roll))
    : 0;
  return substituteCraftingModifier(formula, scalar);
}
