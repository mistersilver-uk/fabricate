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
 * Order two object keys by UTF-16 code unit, explicitly.
 *
 * `Array.prototype.sort()` with no comparator coerces its elements to strings and compares those,
 * which for the `string[]` `Object.keys` returns is already this ordering — so the bare `.sort()`
 * this replaces was deterministic. It is pinned anyway because a checksum should not rest on an
 * implicit coercion a later edit could invalidate by passing something other than keys.
 *
 * `localeCompare` would be the obvious-looking comparator and is the WRONG one: it orders by the
 * runtime's locale, so the same fixture would checksum differently on two machines with different
 * ICU data. That is precisely the cross-machine non-determinism this whole module exists to
 * eliminate.
 *
 * @param {string} left
 * @param {string} right
 * @returns {number}
 */
function compareKeys(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/**
 * A key-order-independent, type-explicit serialization.
 *
 * Every branch emits a DISTINGUISHABLE token, and that is the whole contract. A checksum's only
 * job is to notice difference, so a value that serialises to the same text as a different value
 * is not a cosmetic problem — it is the function silently failing. Two collapses existed before:
 * `JSON.stringify` returns the value `undefined` (not a string) for a symbol, so two distinct
 * symbols both rendered as `"undefined"`; and a `Date` fell through to the plain-object branch
 * where `Object.keys` yields `[]`, so every date rendered as `{}`. Neither shape appears in any
 * registered fixture — `tests/benchmark-harness.test.js` asserts that against every profile
 * rather than trusting this note — but both are now represented rather than left as traps.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function stableStringify(value) {
  if (value === null) return 'null';
  if (value === undefined) return '<undefined>';

  const type = typeof value;
  if (type === 'string') return JSON.stringify(value);
  if (type === 'boolean') return value ? 'true' : 'false';
  // `String(value)` covers the non-finite cases JSON cannot represent: NaN, Infinity, -Infinity.
  if (type === 'number') return Number.isFinite(value) ? String(value) : `<number:${value}>`;
  if (type === 'bigint') return `<bigint:${value.toString()}>`;
  if (type === 'symbol') return `<symbol:${value.description ?? ''}>`;
  // A held stack carries a `getFlag` closure. Its identity cannot be serialised, but dropping it
  // would make a flagged and an unflagged item checksum identically — the exact distinction the
  // inventory profiles exist to make — so it is represented by name.
  if (type === 'function') return `<function:${value.name}>`;

  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  if (value instanceof Set) return `Set${stableStringify([...value])}`;
  if (value instanceof Map) return `Map${stableStringify([...value.entries()])}`;
  if (value instanceof Date) return `<date:${value.getTime()}>`;

  // Built separately rather than nested inside the returned template: a template literal inside a
  // template literal is unreadable at exactly the point where correctness matters most.
  const entries = Object.keys(value)
    .sort(compareKeys)
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${entries.join(',')}}`;
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
