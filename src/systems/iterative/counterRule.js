/**
 * The iterative id rule, the `CounterRule` normalizer and the record primitives both iterative
 * normalizers share. A rule that does not parse is kept with only its known keys, and it blocks.
 */
import {
  arrayOrEmpty,
  cloneJson,
  isPlainObject,
  numberOrNull,
  trimString,
} from '../../utils/scalars.js';

export const ITERATIVE_ID_PATTERN = /^[a-z][A-Za-z0-9]*$/u;
export const COUNTER_RULE_OPS = Object.freeze(['>=', '<=', '>', '<', '=']);

const RULE_KEYS = Object.freeze(['source', 'counterId', 'op', 'value', 'actionIds']);
const COMPARISON_KEYS = Object.freeze(['op', 'value']);

export function isIterativeId(value) {
  return typeof value === 'string' && ITERATIVE_ID_PATTERN.test(value);
}

/** A finite number from a number or a numeric string, else `null`; a blank string is `null`. */
export function iterativeNumber(value) {
  if (typeof value === 'number') return numberOrNull(value);
  return typeof value === 'string' ? numberOrNull(trimString(value)) : null;
}

/** `raw`'s present `keys`, cloned as authored: the shape of an entry that does not parse. */
export function keepKnownKeys(raw, keys) {
  if (!isPlainObject(raw)) return {};
  const present = keys.filter((key) => raw[key] !== undefined);
  return Object.fromEntries(present.map((key) => [key, cloneJson(raw[key])]));
}

/** An absent enum value takes `fallback`; a present one is kept as authored, in the enum or not. */
export function enumOrDefault(raw, fallback) {
  return raw == null ? fallback : cloneJson(raw);
}

export function optionalText(key, value) {
  const trimmed = trimString(value);
  return trimmed ? { [key]: trimmed } : {};
}

/** An authored optional number, `null` when it is not finite; an absent one stays absent. */
export function optionalNumber(key, value) {
  return value === undefined ? {} : { [key]: iterativeNumber(value) };
}

/** A trimmed expression (a finite number becomes its string), `''` when absent, else `null`. */
export function normalizeAmount(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : null;
}

/** The entries whose `idKey` is a valid id not seen earlier in the list; the first one wins. */
export function uniqueIdentified(raw, idKey = 'id') {
  const seen = new Set();
  return arrayOrEmpty(raw).filter((entry) => {
    const id = entry?.[idKey];
    if (!isIterativeId(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/**
 * Each entry with its fault: `'id'` for a missing, malformed or repeated id, else `fault(entry)`,
 * which is `null` for an entry that parses. No entry is dropped.
 */
export function entryFaults(raw, fault) {
  const seen = new Set();
  return arrayOrEmpty(raw).map((entry) => {
    const id = entry?.id;
    const fresh = isIterativeId(id) && !seen.has(id);
    if (isIterativeId(id)) seen.add(id);
    return { entry, fault: fresh ? fault(entry) : 'id' };
  });
}

/** `null` for `{ op, value }` with a known op and a finite value, else `'op'` or `'value'`. */
export function comparisonFault(raw) {
  if (!COUNTER_RULE_OPS.includes(raw?.op)) return 'op';
  return iterativeNumber(raw?.value) === null ? 'value' : null;
}

const buildComparison = (raw) => ({ op: raw.op, value: iterativeNumber(raw.value) });

export function normalizeComparison(raw) {
  return comparisonFault(raw) ? keepKnownKeys(raw, COMPARISON_KEYS) : buildComparison(raw);
}

/**
 * `null` for a well-formed `CounterRule`, else its first fault: `'rule'`, `'source'`,
 * `'actionIds'`, `'counterId'`, `'op'` or `'value'`.
 */
export function counterRuleFault(rule) {
  if (!isPlainObject(rule)) return 'rule';
  if (rule.source === 'previousAction') {
    const ids = rule.actionIds;
    return Array.isArray(ids) && ids.length > 0 && ids.every(isIterativeId) ? null : 'actionIds';
  }
  if (rule.source !== 'counter' && rule.source !== 'sessionCount') return 'source';
  if (rule.source === 'counter' && !isIterativeId(rule.counterId)) return 'counterId';
  return comparisonFault(rule);
}

/** A well-formed rule rebuilt with only its source's keys, else kept with only the known keys. */
export function normalizeCounterRule(raw) {
  if (counterRuleFault(raw)) return keepKnownKeys(raw, RULE_KEYS);
  if (raw.source === 'previousAction') {
    return { source: 'previousAction', actionIds: [...new Set(raw.actionIds)] };
  }
  const comparison = buildComparison(raw);
  return raw.source === 'counter'
    ? { source: 'counter', counterId: raw.counterId, ...comparison }
    : { source: 'sessionCount', ...comparison };
}

export function normalizeCounterRuleList(raw) {
  return arrayOrEmpty(raw).map(normalizeCounterRule);
}

/** The comparison each rule `op` applies, `(actual, value) => boolean`. */
export const COMPARISONS = Object.freeze({
  '>=': (actual, value) => actual >= value,
  '<=': (actual, value) => actual <= value,
  '>': (actual, value) => actual > value,
  '<': (actual, value) => actual < value,
  '=': (actual, value) => actual === value,
});

/**
 * Whether `rule` holds against `facts`, `{ counters: Map<counterId, number>, sessionCount, previousActionId }`.
 * A rule that does not parse, a counter with no value, and `previousAction` with no previous action hold nothing.
 */
export function evaluateCounterRule(rule, facts) {
  if (counterRuleFault(rule)) return false;
  if (rule.source === 'previousAction') {
    return facts.previousActionId !== null && rule.actionIds.includes(facts.previousActionId);
  }
  const actual =
    rule.source === 'counter' ? facts.counters.get(rule.counterId) : facts.sessionCount;
  return typeof actual === 'number' && COMPARISONS[rule.op](actual, iterativeNumber(rule.value));
}
