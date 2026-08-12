/**
 * The fixture checksum — the acceptance criterion "a fixture checksum detecting generator
 * drift" (issue 1071).
 *
 * A benchmark baseline is a number attached to an input. When the input silently changes,
 * every count in the baseline changes with it and the diff reads as a performance
 * regression that nobody introduced — or, worse, a real regression is masked because the
 * fixture got easier at the same time. The checksum makes the input itself a committed,
 * asserted value, so a generator edit fails loudly and separately from a code change.
 *
 * `JSON.stringify` is NOT sufficient here. Its output depends on key insertion order, so a
 * generator refactor that builds the same object by assigning its fields in a different
 * order would report drift that does not exist. `stableStringify` sorts object keys at every
 * depth; arrays keep their order, because a fixture's order is part of the fixture (a
 * corpus walked in a different order examines a different number of candidates).
 *
 * Functions and `undefined` are unrepresentable in JSON and are emitted as explicit
 * sentinels rather than dropped: a fixture item carries a `getFlag` closure, and silently
 * omitting it would make a flagged and an unflagged item checksum identically — which is
 * exactly the distinction the inventory profiles exist to make.
 */
import { createHash } from 'node:crypto';

/**
 * A key-order-independent, type-explicit serialization.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function stableStringify(value) {
  if (value === null) return 'null';
  if (value === undefined) return '<undefined>';
  const type = typeof value;
  if (type === 'function') return '<function>';
  if (type === 'number') return Number.isFinite(value) ? String(value) : `<${String(value)}>`;
  if (type === 'bigint') return `<bigint:${value}>`;
  if (type !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  if (value instanceof Set) return `Set${stableStringify([...value])}`;
  if (value instanceof Map) return `Map${stableStringify([...value.entries()])}`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

/**
 * A short, stable digest of any fixture value.
 *
 * Truncated to 16 hex characters: long enough that an accidental collision between two
 * corpora is not a thing that happens, short enough to read in a baseline diff.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function fixtureChecksum(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex').slice(0, 16);
}
