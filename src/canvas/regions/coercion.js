/**
 * Value coercion shared by the interactable region modules, which each read the same
 * loosely-typed values out of Foundry flag data — so it lives here once rather than per module.
 */

/** A finite number, or null. Empty, nullish and non-finite inputs collapse together. */
export function numberOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * A plain array from a V13 embedded collection (`.contents`, `.values()`) or an already-plain
 * array, so one read serves a live document and a test fake alike.
 */
export function collectionToArray(value) {
  if (Array.isArray(value?.contents)) return value.contents;
  if (typeof value?.values === 'function') return [...value.values()];
  if (Array.isArray(value)) return value;
  return [];
}
