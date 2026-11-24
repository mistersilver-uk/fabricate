/**
 * The system's iterative library, `CraftingSystem.iterative = { version, counters, actions }`,
 * rebuilt with a fixed key set at every level (`data-models` CraftingSystem 37). A counter or action
 * whose id is missing, malformed or repeated is dropped; a cost or effect that does not parse is
 * kept with only its known keys, and a present non-array `availability.rules`, `costs` or `effects`
 * is kept as authored. A block whose `version` is above this build's is kept verbatim.
 */
import { cloneJson, isPlainObject, stringOnlyIdList, trimString } from '../../utils/scalars.js';
import {
  comparisonFault,
  entryFaults,
  enumOrDefault,
  isIterativeId,
  keepKnownKeys,
  normalizeAmount,
  normalizeComparison,
  normalizeCounterRuleList,
  optionalNumber,
  optionalText,
  uniqueIdentified,
} from '../iterative/counterRule.js';

export const ITERATIVE_LIBRARY_VERSION = 1;
export const COUNTER_LIMITS = Object.freeze(['none', 'perRecipe', 'global']);
export const ACTION_CHECKS = Object.freeze(['roll', 'none']);
export const RULE_COMBINES = Object.freeze(['all', 'any']);
export const EFFECT_OPS = Object.freeze(['add', 'subtract', 'set']);

const COST_KEYS = Object.freeze(['id', 'counterId', 'amount', 'needsEnough']);
const EFFECT_KEYS = Object.freeze(['id', 'name', 'description', 'when', 'target', 'op', 'amount']);
const TARGET_KEYS = Object.freeze(['kind', 'counterId']);
const WHEN_KEYS = Object.freeze(['combine', 'checkOutcomeIds', 'success', 'value', 'rules']);

export function iterativeLibraryVersionUnsupported(library) {
  return isPlainObject(library) && Number(library.version) > ITERATIVE_LIBRARY_VERSION;
}

/** `{ combine, checkOutcomeIds?, success?, value?, rules? }`, each optional key only when it holds one. */
export function normalizeEffectWhen(raw) {
  const when = isPlainObject(raw) ? raw : {};
  const checkOutcomeIds = stringOnlyIdList(when.checkOutcomeIds);
  const rules = normalizeCounterRuleList(when.rules);
  return {
    combine: enumOrDefault(when.combine, 'all'),
    ...(checkOutcomeIds.length > 0 && { checkOutcomeIds }),
    ...(typeof when.success === 'boolean' && { success: when.success }),
    ...(when.value != null && { value: normalizeComparison(when.value) }),
    ...(rules.length > 0 && { rules }),
  };
}

const presentNonArray = (value) => value != null && !Array.isArray(value);

/** `'when'` for a `when` that does not parse, including a present key of the wrong type. */
function effectWhenFault(raw) {
  if (raw == null) return null;
  if (!isPlainObject(raw) || !(raw.combine == null || RULE_COMBINES.includes(raw.combine))) {
    return 'when';
  }
  if (raw.success != null && typeof raw.success !== 'boolean') return 'when';
  if (presentNonArray(raw.checkOutcomeIds) || presentNonArray(raw.rules)) return 'when';
  return raw.value == null || comparisonFault(raw.value) === null ? null : 'when';
}

function costFault(raw) {
  if (!isIterativeId(raw?.id)) return 'id';
  if (!isIterativeId(raw.counterId)) return 'counterId';
  return normalizeAmount(raw.amount) === null ? 'amount' : null;
}

function effectFault(raw) {
  if (!isIterativeId(raw?.id)) return 'id';
  const { target } = raw;
  if (!isPlainObject(target) || target.kind !== 'counter' || !isIterativeId(target.counterId)) {
    return 'target';
  }
  if (!EFFECT_OPS.includes(raw.op)) return 'op';
  if (normalizeAmount(raw.amount) === null) return 'amount';
  return effectWhenFault(raw.when);
}

const ENTRY_FAULTS = Object.freeze({ cost: costFault, effect: effectFault });

/**
 * `null` for a well-formed `'cost'` or `'effect'`, else a short fault code. A repeated id is a
 * fault only within its list (`actionEntryFaults`).
 */
export function iterativeEntryFault(kind, entry) {
  return ENTRY_FAULTS[kind](entry);
}

/** Every cost and effect of an action that is kept as authored, as `{ kind, entry, fault }`. */
export function actionEntryFaults(action) {
  const faults = (kind, list) =>
    entryFaults(list, ENTRY_FAULTS[kind])
      .filter(({ fault }) => fault !== null)
      .map(({ entry, fault }) => ({ kind, entry, fault }));
  return [...faults('cost', action?.costs), ...faults('effect', action?.effects)];
}

function normalizeCost(entry, fault) {
  if (fault) return keepKnownKeys(entry, COST_KEYS);
  return {
    id: entry.id,
    counterId: entry.counterId,
    amount: normalizeAmount(entry.amount),
    needsEnough: entry.needsEnough !== false,
  };
}

/**
 * The `when` of an effect kept as authored: its known keys, with an object `value` and an array
 * of `rules` re-normalized, so a second pass raises the same fault.
 */
function keptWhen(raw) {
  const when = keepKnownKeys(raw, WHEN_KEYS);
  if (isPlainObject(when.value)) when.value = normalizeComparison(raw.value);
  if (Array.isArray(when.rules)) when.rules = normalizeCounterRuleList(raw.rules);
  return when;
}

function normalizeEffect(entry, fault) {
  if (fault) {
    const kept = keepKnownKeys(entry, EFFECT_KEYS);
    if (isPlainObject(entry?.when)) kept.when = keptWhen(entry.when);
    if (isPlainObject(entry?.target)) kept.target = keepKnownKeys(entry.target, TARGET_KEYS);
    return kept;
  }
  return {
    id: entry.id,
    ...optionalText('name', entry.name),
    ...optionalText('description', entry.description),
    when: normalizeEffectWhen(entry.when),
    target: { kind: 'counter', counterId: entry.target.counterId },
    op: entry.op,
    amount: normalizeAmount(entry.amount),
  };
}

function normalizeCounter(raw) {
  return {
    id: raw.id,
    label: trimString(raw.label),
    ...optionalText('description', raw.description),
    limit: enumOrDefault(raw.limit, 'none'),
    ...optionalNumber('min', raw.min),
    ...optionalNumber('max', raw.max),
  };
}

/** `normalize(raw)` for an absent or array `raw`; a present non-array is kept as authored. */
const listOrAuthored = (raw, normalize) => (presentNonArray(raw) ? cloneJson(raw) : normalize(raw));

/** The default for an absent `availability`; a present non-object one is kept as authored. */
function normalizeAvailability(raw) {
  if (raw != null && !isPlainObject(raw)) return cloneJson(raw);
  const availability = raw ?? {};
  return {
    combine: enumOrDefault(availability.combine, 'all'),
    rules: listOrAuthored(availability.rules, normalizeCounterRuleList),
  };
}

const normalizeCosts = (raw) =>
  entryFaults(raw, costFault).map(({ entry, fault }) => normalizeCost(entry, fault));

const normalizeEffects = (raw) =>
  entryFaults(raw, effectFault).map(({ entry, fault }) => normalizeEffect(entry, fault));

function normalizeAction(raw) {
  return {
    id: raw.id,
    label: trimString(raw.label),
    ...optionalText('description', raw.description),
    ...optionalText('icon', raw.icon),
    categories: stringOnlyIdList(raw.categories),
    usesSession: raw.usesSession !== false,
    availability: normalizeAvailability(raw.availability),
    costs: listOrAuthored(raw.costs, normalizeCosts),
    check: enumOrDefault(raw.check, 'none'),
    effects: listOrAuthored(raw.effects, normalizeEffects),
  };
}

/** The normalized library, or `null` for an absent, `null` or non-object block. */
export function normalizeIterativeLibrary(raw) {
  if (!isPlainObject(raw)) return null;
  if (iterativeLibraryVersionUnsupported(raw)) return cloneJson(raw);
  return {
    version: ITERATIVE_LIBRARY_VERSION,
    counters: uniqueIdentified(raw.counters).map(normalizeCounter),
    actions: uniqueIdentified(raw.actions).map(normalizeAction),
  };
}

/** `{ iterative }` for the system spread, or `{}`, so an unauthored library persists no key. */
export function iterativeLibraryEntry(raw) {
  const iterative = normalizeIterativeLibrary(raw);
  return iterative ? { iterative } : {};
}
