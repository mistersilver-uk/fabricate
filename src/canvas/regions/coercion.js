/**
 * Shared value-coercion helpers for the interactable region behaviors.
 *
 * The region config/activation/depletion/flags modules each read loosely-typed
 * values out of Foundry flag data and normalize them the same way, so the
 * coercion lives here once rather than copied per module.
 */

/**
 * Coerce a loosely-typed value to a finite number, or `null`.
 *
 * Empty, nullish, and non-finite inputs all collapse to `null`, so callers can
 * treat "absent" and "invalid" uniformly.
 *
 * @param {unknown} value
 * @returns {number | null}
 */
export function numberOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * Flatten a Foundry embedded collection (or a plain array) into a plain array.
 *
 * Tolerates the several shapes a V13 `EmbeddedCollection` / `WorldCollection`
 * takes — a `.contents` array, a `.values()` iterator, or an already-plain array —
 * so the same read works against a live document and a plain test fake.
 *
 * @param {unknown} value
 * @returns {Array}
 */
export function collectionToArray(value) {
  if (Array.isArray(value?.contents)) return value.contents;
  if (typeof value?.values === 'function') return [...value.values()];
  if (Array.isArray(value)) return value;
  return [];
}
