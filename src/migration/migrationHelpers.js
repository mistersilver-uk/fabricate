/**
 * Shared helpers for the pure, idempotent startup migrations, extracted so the rename and cleanup
 * passes share one copy — product-code duplication is measured by SonarCloud CPD.
 */

import { isPlainObject } from '../utils/scalars.js';

/** True when `value` is a non-null, non-array plain object. */
/** Deep-clone a JSON-safe value so a migration never mutates its input; `undefined` passes through. */
export function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/** Rename in place ONLY when the old key is present and the new one absent, so a stale key is inert. */
export function renameKey(obj, oldKey, newKey) {
  if (!isPlainObject(obj)) return;
  if (!Object.prototype.hasOwnProperty.call(obj, oldKey)) return;
  if (Object.prototype.hasOwnProperty.call(obj, newKey)) return; // already migrated → leave stale inert
  obj[newKey] = obj[oldKey];
  delete obj[oldKey];
}

export { isPlainObject } from '../utils/scalars.js';
