/**
 * Shared helpers for the pure, idempotent startup data migrations.
 *
 * Extracted so the rename/cleanup migrations (regions→realms, hazards→events,
 * unify-regions, break-tools-on-fail, …) share one copy instead of each carrying an
 * identical inline definition (product-code duplication is measured by SonarCloud CPD).
 */

/**
 * True when `value` is a non-null, non-array plain object.
 *
 * @param {*} value
 * @returns {boolean}
 */
export function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Structurally deep-clone a JSON-safe value so a migration never mutates its input.
 * `undefined` is returned unchanged.
 *
 * @param {*} value
 * @returns {*}
 */
export function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/**
 * Rename `oldKey` → `newKey` on a plain object in place, but only when `oldKey` is
 * present and `newKey` is absent (idempotent; never clobbers an existing new key). A
 * stale `oldKey` left beside an existing `newKey` is left inert (no clobber, no drop).
 *
 * @param {object} obj
 * @param {string} oldKey
 * @param {string} newKey
 */
export function renameKey(obj, oldKey, newKey) {
  if (!isPlainObject(obj)) return;
  if (!Object.prototype.hasOwnProperty.call(obj, oldKey)) return;
  if (Object.prototype.hasOwnProperty.call(obj, newKey)) return; // already migrated → leave stale inert
  obj[newKey] = obj[oldKey];
  delete obj[oldKey];
}
