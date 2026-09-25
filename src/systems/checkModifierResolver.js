/**
 * The world modifier library's check side (issues 770, 1055, 1094, 1095, 1117, 1118): which
 * entries each activity selects, what they reduce to, and how they reach the roll, as DOMAIN.md
 * "Check Modifier" states. Each of `craftingCheck`, `salvageCraftingCheck` and
 * `gatheringCraftingCheck` selects through its own `{defaultModifierPolicy, defaultModifierIds,
 * maxModifierPicks}`; the flat contribution appends as one `[Modifiers]` term and each rolling
 * entry as its own, before the formula reaches `Roll`; `highest` and `playerPicks` rank magnitude
 * averages before transformed quantities; and `min`/`max` clamp the rolled result in the formula (`min(max((1d8), -1), 6)`,
 * verified on 14.365 and recorded in `tests/helpers/recordedModifierRollShapes.js`). The `@`
 * substitution is injected (`makeRollDataExpressionResolver`), so the reduction is a pure function
 * of text; `Roll` defaults to `globalThis.Roll`, a fragment it cannot roll is refused per entry,
 * and that rollability proof fails open when the global is absent.
 */

import { stripRetiredModifierPlaceholder } from '../utils/craftingCheckExpression.js';
import { classifyRollQuantity, reduceRollExpression } from '../utils/rollExpressionAverage.js';
import { formulaRolls } from '../utils/rollFormulaRollability.js';

import { resolveModifierLibrary } from './characterLibraries.js';
import { resolveSalvageCheck } from './salvageCheckUsability.js';
import {
  appendCheckModifierRollTerms,
  appendCheckModifierTerm,
  isDecimalSafeTermValue,
} from './toolCheckBonus.js';

/** The four combination rules in authoring order; each states how values reduce and who selects
 *  (DOMAIN.md "Check Modifier"). The token is activity-independent; the label is per activity. */
export const MODIFIER_POLICIES = Object.freeze(['addAll', 'highest', 'bySubject', 'playerPicks']);

const VALID_POLICIES = new Set(MODIFIER_POLICIES);

/** Whether an expression rolls dice, asked of `reduceRollExpression` so the display chip and the
 *  append are one decision (issue 1118). Derived, never authored or persisted. */
export function isRollExpression(expression) {
  // `@`-paths are neutralized first, or the walk would stop at `@` before reaching a die.
  return reduceRollExpression(neutralExpressionResolver(expression) ?? '').rollsDice;
}

/** Re-exported beside the read half; the import-free implementation is `checkModifierPicks.js`. */
export { authoredCheckModifierIds } from '../utils/checkModifierPicks.js';

/** The pre-1095 `byRecipe`, accepted on read and never re-emitted. */
const LEGACY_POLICY_ALIASES = new Map([['byRecipe', 'bySubject']]);

/** Not exported: a frozen Set still mutates, so `policyDefersSelection` is the public reader. */
const SELECTING_POLICIES = new Set(['bySubject', 'playerPicks']);

/** Whether a rule defers selection, so `maxModifierPicks` applies; a legacy `byRecipe` counts. */
export function policyDefersSelection(policy) {
  return SELECTING_POLICIES.has(normalizeModifierPolicy(policy));
}

/** One of the four rules, or `null`; `byRecipe` reads as `bySubject` and is never re-emitted. */
export function normalizeModifierPolicy(policy) {
  if (VALID_POLICIES.has(policy)) return policy;
  return LEGACY_POLICY_ALIASES.get(policy) ?? null;
}

/** A positive integer, or `Infinity` when absent or invalid: absence means unlimited, so a check
 *  never asked cannot truncate picks on disk (the `1.20.0` migration stamped `1` where needed). */
export function resolveMaxModifierPicks(context) {
  const max = Number(context?.maxModifierPicks);
  return Number.isInteger(max) && max > 0 ? max : Infinity;
}

/** Each activity's persisted selection key; the library itself is shared. */
const ACTIVITY_CHECK_KEYS = new Map([
  ['crafting', 'craftingCheck'],
  ['salvage', 'salvageCraftingCheck'],
  ['gathering', 'gatheringCraftingCheck'],
]);

/**
 * The subject's own pick (crafting `recipe.craftingModifier.modifierIds`, salvage
 * `component.salvage.checkModifierIds`, gathering `task.checkModifierIds`). `null` inherits the
 * default set; an authored empty array is a pick of zero, told apart by `Array.isArray`.
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
 * The one context bag the evaluation and display paths both resolve through, so a shown formula
 * cannot disagree with the rolled one. Arity three: `activity` selects which selection triple
 * and subject field are read. `maxModifierPicks` is read raw (`undefined` when never asked).
 * `system` still supplies a surviving legacy library copy on an unmigrated client (issue 1308).
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
    // The world library (issue 1117); the retired `checkModifiers` keys get no read alias here.
    catalogue: resolveModifierLibrary(system, characterLibrariesStore),
    systemPolicy: check.defaultModifierPolicy,
    defaultModifierIds: check.defaultModifierIds,
    subjectModifierIds: readSubjectModifierIds(activity, subject),
    maxModifierPicks: check.maxModifierPicks,
  };
}

/** The `craftingCheck` slot each mode rolls; `routedByIngredients` keeps its optional pass/fail
 *  check on the `simple` slot, while `routedByCheck` requires `routed`. */
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
 * The crafting check a system's mode actually rolls (alchemy per `alchemy.checkMode`, where
 * `none` rolls none), with its trimmed post-shim formula. `slot: null` (no check) and a slot
 * without `checkUsable` are the two causes a library is inert; an unknown mode reports
 * `slot: null` rather than coercing to `simple`. `alchemyCheckMode` is `null` outside alchemy.
 * `requiresCheck` marks `routedByCheck`, `progressive` and alchemy `simple`/`tiered`. The
 * retired placeholder is stripped before the emptiness test (issue 1094), so a formula holding
 * only it reads as no formula instead of throwing in `new Roll('')` as a consuming failure.
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

/** Gathering's formula-rolled slots. `d100` has none: it rolls against each drop's chance, and
 *  its library references shift that chance rather than append to a formula. */
const GATHERING_CHECK_SLOTS = new Map([
  ['progressive', 'progressive'],
  ['routed', 'routed'],
]);

/**
 * The salvage sibling, delegating to `resolveSalvageCheck`, the single salvage derivation
 * (issue 859). `slot` is `null` only for an unsupported mode, a config defect: every supported
 * salvage mode rolls a formula, unlike crafting's alchemy `none` (which rolls nothing) and
 * gathering's `d100` (which rolls, but has no formula; cause `noModifierSupport`).
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
 * The gathering sibling. The mode is an argument, defaulting to `d100`, because it lives on the
 * gathering economy config rather than the crafting system. The shim runs before the emptiness
 * test, as in the crafting sibling.
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
    // Routed routes by tier name and progressive spends the total, so both need a roll.
    requiresCheck: slot !== null,
  };
}

/** The system's rule, default `addAll`; a legacy recipe-level `policy` is never consulted. */
export function resolveModifierPolicy(context = {}) {
  return normalizeModifierPolicy(context?.systemPolicy) ?? 'addAll';
}

/**
 * The ordered, de-duplicated eligible ids, dropping any the library does not know. Only
 * `bySubject` reads the subject's pick, bounded on read by the check's `defaultModifierIds` mark
 * (issue 1608): nothing is pruned, and an absent (non-array) mark bounds nothing while an
 * authored empty one allows nothing. `bySubject` truncates to `resolveMaxModifierPicks` in
 * authored order; `playerPicks` returns the full offered list; the cap bounds the player's pick.
 */
export function resolveEligibleModifierIds(context = {}) {
  const { catalogue = [], subjectModifierIds = null } = context ?? {};
  // Read raw, with no `= []` default: an absent mark must not read as an all-suppressing one.
  const mark = Array.isArray(context?.defaultModifierIds) ? context.defaultModifierIds : null;
  const subjectPicks =
    resolveModifierPolicy(context) === 'bySubject' && Array.isArray(subjectModifierIds);
  return takeEligibleModifierIds(subjectPicks ? subjectModifierIds : (mark ?? []), {
    known: knownModifierIds(catalogue),
    // The mark bounds only under `bySubject`; elsewhere it is the source.
    marked: subjectPicks && mark ? new Set(mark) : null,
    limit: subjectPicks ? resolveMaxModifierPicks(context) : Infinity,
  });
}

/** The library's usable ids: an entry without a non-empty string `id` names nothing. */
function knownModifierIds(catalogue) {
  const ids = new Set();
  for (const entry of Array.isArray(catalogue) ? catalogue : []) {
    const id = entry && typeof entry === 'object' ? entry.id : null;
    if (typeof id === 'string' && id !== '') ids.add(id);
  }
  return ids;
}

/** The ordered survivors of `source`. Every drop happens before `limit` counts, so an unknown or
 *  unmarked id never consumes a slot a real pick was entitled to. */
function takeEligibleModifierIds(source, { known, marked, limit }) {
  const seen = new Set();
  const ids = [];
  for (const id of source) {
    if (ids.length >= limit) break;
    if (typeof id !== 'string' || seen.has(id)) continue;
    if (!known.has(id)) continue;
    if (marked && !marked.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * An entry's bounds (issue 1095), absence-preserving: only a finite number is a bound, and `0`
 * is real. `inverted` (`min > max`) blocks the entry, raising `modifierBoundsInverted`, rather
 * than reordering the pair. `unsafe` flags a bound the dice grammar cannot express, which would
 * drop the whole summed `[Modifiers]` term; both make only this entry contribute 0.
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

/** `null` is safe; any other bound must pass `isDecimalSafeTermValue`, which the emit asks too. */
function boundIsTermSafe(bound) {
  return bound === null || isDecimalSafeTermValue(bound);
}

/** A finite number, or `null` for every unbounded form. `null`, `''`, `[]` and whitespace are
 *  guarded before `Number()`, which reads each as a real bound of `0`. */
function numericBoundOrNull(value) {
  if ([null, undefined, ''].includes(value)) return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const raw = typeof value === 'string' ? value.trim() : value;
  if (raw === '') return null;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : null;
}

/** Clamp after evaluation and before combination, so a bound means the same under every rule;
 *  an inverted or unsafe pair contributes 0. */
export function clampModifierValue(value, entry) {
  const { min, max, inverted, unsafe } = resolveModifierBounds(entry);
  if (inverted || unsafe) return 0;
  let clamped = value;
  if (min !== null) clamped = Math.max(min, clamped);
  if (max !== null) clamped = Math.min(max, clamped);
  return clamped;
}

/** The library by id, shared by the scalar and the choice so they agree on what exists. */
function catalogueById(catalogue) {
  return new Map(
    (Array.isArray(catalogue) ? catalogue : [])
      .filter((entry) => entry && typeof entry === 'object' && typeof entry.id === 'string')
      .map((entry) => [entry.id, entry])
  );
}

/**
 * A resolved entry: `average` ranks magnitude quantities and is null for transformed ones; a flat
 * entry sets `value` (summed into one term) and a rolling one sets `formula` (its own term), never both. A blocked entry keeps
 * its place with `value: 0`, `average: 0` and `blocked: true`, which readiness reads rather than
 * inferring from a legitimate zero. `display` is the prompt chip. This builds the blocked shape.
 */
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

/** The clamped fragment, always parenthesised: `1d4[fire][Modifiers]` is a syntax error on
 *  14.365 where `(1d4[fire])[Modifiers]` rolls. A half-bounded entry emits one function. */
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
 * Bounds are checked first, so a dice expression cannot smuggle a bad bound past them; then the
 * injected resolver substitutes, `reduceRollExpression` reduces and reports dice in one call, and
 * a rolling fragment must prove rollable or it blocks this entry alone, rather than throwing in
 * `new Roll(...)` as a consuming failure.
 */
function resolveCatalogueEntry(id, entry, resolveExpression, Roll) {
  const bounds = resolveModifierBounds(entry);
  if (bounds.inverted || bounds.unsafe) return blockedModifier(id, entry);
  const raw = typeof resolveExpression === 'function' ? resolveExpression(entry?.expression) : null;
  const text = raw === null || raw === undefined ? '' : String(raw).trim();
  if (text === '') return blockedModifier(id, entry);
  const quantity = classifyRollQuantity(text);
  if (quantity === 'irreducible') return blockedModifier(id, entry);
  const { value, rollsDice } = reduceRollExpression(text);
  if (!Number.isFinite(value)) return blockedModifier(id, entry);
  const average = quantity === 'transformed' ? null : clampModifierValue(value, entry);
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

/** Delegates to `rollFormulaRollability.js`, which proves a fragment by rolling it maximized. */
function fragmentRolls(formula, Roll) {
  return formulaRolls(formula, Roll);
}

/** Every `@`-path as `0`, to judge authored text without an actor (readiness has none). */
function neutralExpressionResolver(expression) {
  return typeof expression === 'string' ? expression.replaceAll(/@[\w.]+/g, '0') : null;
}

/** Whether an entry's expression can contribute, judged without an actor; the caller asks only
 *  of entries with sound bounds. A fault that depends on roll data is refused per attempt. */
export function modifierExpressionResolves(entry, Roll = globalThis.Roll) {
  if (!entry || typeof entry !== 'object') return false;
  return !resolveCatalogueEntry('', entry, neutralExpressionResolver, Roll).blocked;
}

/** Quantity semantics of an authored modifier expression, with actor paths neutralized. */
export function classifyModifierExpression(entry) {
  return classifyRollQuantity(neutralExpressionResolver(entry?.expression) ?? '');
}

/**
 * The selected entries in eligible order: `addAll` all, `highest` the single best ranked entry,
 * `bySubject` the already-capped pick, and `playerPicks` (non-interactive) the best legal
 * selection of `maxModifierPicks`. Magnitude averages rank first; ties and transformed entries
 * keep authored order.
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
  if (policy === 'highest') return bestRankedModifiers(resolved, 1);
  if (policy === 'playerPicks') {
    return bestRankedModifiers(resolved, resolveMaxModifierPicks(context));
  }
  return resolved;
}

/** Magnitude averages, then transformed quantities, then blocked entries; output keeps eligible order. */
function bestRankedModifiers(resolved, limit) {
  if (limit >= resolved.length) return resolved;
  return resolved
    .map((modifier, index) => ({ modifier, index }))
    .sort((a, b) => compareRankedModifiers(a, b))
    .slice(0, limit)
    .sort((a, b) => a.index - b.index)
    .map(({ modifier }) => modifier);
}

function compareRankedModifiers(left, right) {
  const leftBlocked = left.modifier.blocked === true;
  const rightBlocked = right.modifier.blocked === true;
  if (leftBlocked !== rightBlocked) return leftBlocked ? 1 : -1;
  const leftFinite = Number.isFinite(left.modifier.average);
  const rightFinite = Number.isFinite(right.modifier.average);
  if (leftFinite !== rightFinite) return leftFinite ? -1 : 1;
  if (leftFinite && left.modifier.average !== right.modifier.average) {
    return right.modifier.average - left.modifier.average;
  }
  return left.index - right.index;
}

/** The flat `scalar` and the per-entry `rollTerms`, apart because different appenders take them
 *  and a number-only reader must not spell fragments. Zero and none means nothing applies. */
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

function sumOf(values) {
  return values.reduce((sum, value) => sum + value, 0);
}

/** The prompt chip: a flat entry's signed number, or what a rolling one rolls (`+1d8 (-1 to 6)`),
 *  built from the fragment's inputs rather than read back out of it. */
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
 * The interactive `playerPicks` descriptor: each option carries `value` (flat), `formula`
 * (rolling), `average` (magnitude ranking, null when transformed) and `display`, because
 * `evaluateCheckRoll` re-derives the legal
 * selection from it and never trusts the prompt. `defaultSelectedIds` is the best legal
 * selection, so confirming reproduces the non-interactive roll; `defaultSelectedId` is its first.
 * `null` below two eligible modifiers, where there is no choice to offer. It appends nothing.
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
  const defaultSelectedIds = bestRankedModifiers(modifiers, maxPicks).map(
    (modifier) => modifier.id
  );
  return {
    modifiers,
    maxPicks,
    defaultSelectedIds,
    defaultSelectedId: defaultSelectedIds[0],
  };
}

/** An expression's deterministic average, via `reduceRollExpression`; `NaN` when malformed. */
export function evaluateNumericExpression(input) {
  return reduceRollExpression(input).value;
}

/**
 * The real `@` substitution: `Roll.replaceFormulaData` against the actor's roll data, returning
 * text rather than a number so dice survive to the append (issue 1118). An unresolved key, a
 * `NaN`, an absent `Roll` or an empty expression is `null`, contributing nothing.
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
    if (/@/.test(replaced) || /NaN/i.test(replaced)) return null;
    return replaced;
  };
}

/**
 * Append a modifier context to a formula before it reaches `Roll` (issues 1094, 1118): the flat
 * term first, so a dice-free library emits the byte-identical formula it always did, then one
 * term per rolling entry. `craftingModifier` keeps the name every `checkRoll.js` options bag uses.
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
