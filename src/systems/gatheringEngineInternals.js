/**
 * Internal helpers shared by GatheringEngine and its extracted collaborators
 * (e.g. GatheringWorldTimeProcessor). These are intentionally tiny, dependency-
 * free coercions and collection-normalizers; they live in one module so the
 * engine and the processor reuse a single definition instead of duplicating it.
 */

/**
 * Normalize an array / Map / iterable / Foundry collection into a plain array.
 * Returns an empty array for nullish or non-iterable input.
 *
 * @param {*} value
 * @returns {Array<*>}
 */
export function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (value instanceof Map) return [...value.values()];
  if (typeof value.values === 'function') return [...value.values()];
  if (typeof value[Symbol.iterator] === 'function') return [...value];
  return [];
}

/**
 * Resolve a document's stable id, preferring `id` then `uuid`.
 *
 * @param {*} document
 * @returns {string|null}
 */
export function idOf(document) {
  return stringOrNull(document?.id) || stringOrNull(document?.uuid);
}

/**
 * Trim a value to a non-empty string, or null when empty / nullish.
 *
 * @param {*} value
 * @returns {string|null}
 */
export function stringOrNull(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

/**
 * Iterate a Foundry collection / array / EmbeddedCollection (scenes, regions,
 * behaviours) tolerantly, mirroring the scan in `interactableMarkerDepletion`.
 * Returns an empty array for nullish input so callers can `for...of` safely.
 *
 * @param {*} collection
 * @returns {Iterable<*>}
 */
export function iterateCollection(collection) {
  if (!collection) return [];
  if (typeof collection[Symbol.iterator] === 'function') return collection;
  if (Array.isArray(collection?.contents)) return collection.contents;
  if (typeof collection?.values === 'function') return collection.values();
  return [];
}
