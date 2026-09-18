/**
 * The fixture checksum — the acceptance criterion "a fixture checksum detecting generator drift"
 * (issue 1071).
 */
import { createHash } from 'node:crypto';

/** Order two object keys by UTF-16 code unit, explicitly. */
function compareKeys(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/**
 * A key-order-independent, type-explicit serialization. Every branch emits a DISTINGUISHABLE token,
 * and that is the whole contract.
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
  // A held stack carries a `getFlag` closure.
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

/** A short, stable digest of any fixture value. */
export function fixtureChecksum(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex').slice(0, 16);
}
