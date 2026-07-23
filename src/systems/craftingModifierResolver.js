/**
 * Per-recipe crafting-check modifier resolution (issue 770, Phase 1).
 *
 * A crafting system may carry a named catalogue of check modifiers on its
 * `craftingCheck` config (`checkModifiers: {id,label,icon?,expression}[]`), a
 * default resolution policy (`defaultModifierPolicy`) and a default eligible id
 * set (`defaultModifierIds`). A recipe may override the policy and/or the eligible
 * id subset through `Recipe.craftingModifier`.
 *
 * The catalogue feeds a Fabricate-owned `@craftingmod` formula placeholder: it is
 * resolved to a SCALAR here and substituted into the check roll formula BEFORE the
 * string reaches Foundry's `Roll` (an unresolved `@craftingmod` would otherwise be
 * silently treated as 0 by Foundry). All Phase-1 policies are deterministic — no
 * dice pool, no interactive selection. `playerPicks` is Phase 2 (deferred).
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

const VALID_POLICIES = new Set(['addAll', 'highest', 'byRecipe', 'playerPicks']);

/**
 * Normalize a policy value to one of the four known policies, or null when unknown.
 * @param {unknown} policy
 * @returns {'addAll'|'highest'|'byRecipe'|'playerPicks'|null}
 */
export function normalizeModifierPolicy(policy) {
  return VALID_POLICIES.has(policy) ? policy : null;
}

/**
 * Resolve the effective policy: a recipe override wins over the system default,
 * which wins over the `addAll` fallback.
 * @param {{ systemPolicy?: unknown, recipeModifier?: { policy?: unknown }|null }} context
 * @returns {'addAll'|'highest'|'byRecipe'|'playerPicks'}
 */
export function resolveModifierPolicy({ systemPolicy, recipeModifier } = {}) {
  return (
    normalizeModifierPolicy(recipeModifier?.policy) ??
    normalizeModifierPolicy(systemPolicy) ??
    'addAll'
  );
}

/**
 * Resolve the ordered, de-duplicated, catalogue-validated list of eligible modifier
 * ids. When the recipe overrides the id subset (`recipeModifier.modifierIds` is an
 * array) that subset is used; otherwise the system `defaultModifierIds`. Unknown ids
 * (not present in the catalogue) are dropped, preserving source order.
 * @param {{ catalogue?: Array, defaultModifierIds?: Array, recipeModifier?: { modifierIds?: Array }|null }} context
 * @returns {string[]}
 */
export function resolveEligibleModifierIds({
  catalogue = [],
  defaultModifierIds = [],
  recipeModifier = null,
} = {}) {
  const known = new Set(
    (Array.isArray(catalogue) ? catalogue : [])
      .map((entry) => (entry && typeof entry === 'object' ? entry.id : null))
      .filter((id) => typeof id === 'string' && id !== '')
  );
  const source =
    recipeModifier && Array.isArray(recipeModifier.modifierIds)
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
 * Reduction semantics (Phase 1):
 * - `highest`  → the deterministic `max(...)` of the eligible expression values (a
 *   scalar, NOT a keep-highest dice pool).
 * - `addAll`   → the sum of the eligible expression values.
 * - `byRecipe` → the recipe's own eligible set, summed (the eligible id resolution
 *   already prefers the recipe's `modifierIds`, so `byRecipe` sums exactly that set).
 * - `playerPicks` → the DETERMINISTIC (non-interactive / API / headless) fallback,
 *   which resolves identically to `highest` (the reserved Phase-1 fallback). The
 *   interactive per-roll selection is handled OUT of this scalar path, via
 *   {@link buildCraftingModifierChoice} + the interactive branch of `evaluateCheckRoll`.
 *
 * A missing/failed expression contributes 0 (never NaN). An empty eligible set → 0.
 *
 * @param {object} context
 * @param {Array} [context.catalogue]
 * @param {unknown} [context.systemPolicy]
 * @param {Array} [context.defaultModifierIds]
 * @param {{ policy?: unknown, modifierIds?: Array }|null} [context.recipeModifier]
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
  // addAll and byRecipe both sum their eligible set.
  return values.reduce((sum, value) => sum + value, 0);
}

/**
 * Build the interactive `playerPicks` choice descriptor for a modifier context: the
 * eligible modifier set mapped to `{ id, label, icon, value }` (value = the modifier's
 * `expression` evaluated to a finite number, else 0), plus the `defaultSelectedId` —
 * the highest-valued eligible modifier, tie-broken by eligible-set order (the FIRST
 * occurrence among equal-max wins). Returns `null` when no modifier is eligible (the
 * caller then omits the choice and the formula keeps its deterministic scalar).
 *
 * This does NOT substitute `@craftingmod`; it only surfaces the options for the
 * interactive roll prompt. The chosen value is substituted downstream in
 * `evaluateCheckRoll` once the player confirms.
 *
 * @param {object} context The modifier context
 *   (`{ catalogue, systemPolicy, defaultModifierIds, recipeModifier }`).
 * @param {(expression: string|undefined) => number} evaluateExpression Injected
 *   numeric evaluator (roll-data resolution + arithmetic).
 * @returns {{ token: string, modifiers: Array<{id:string,label:string,icon:string,value:number}>,
 *   defaultSelectedId: string }|null}
 */
export function buildCraftingModifierChoice(context = {}, evaluateExpression) {
  const catalogue = Array.isArray(context.catalogue) ? context.catalogue : [];
  const ids = resolveEligibleModifierIds(context);
  if (ids.length === 0) return null;
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
 *   (`{ catalogue, systemPolicy, defaultModifierIds, recipeModifier }`).
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
