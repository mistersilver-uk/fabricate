/** Shared helpers for the pure, idempotent startup migrations. */

import { isPlainObject } from '../utils/scalars.js';

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

/** Call `fn(system, index)` for each plain-object entry; a non-array and a non-object entry are skipped. Clones nothing. */
export function forEachSystem(systems, fn) {
  if (!Array.isArray(systems)) return;
  for (const [index, system] of systems.entries()) {
    if (isPlainObject(system)) fn(system, index);
  }
}

/** Map plain-object entries through `fn(system, index)`; a non-object entry passes through by reference. */
export function mapSystems(systems, fn) {
  if (!Array.isArray(systems)) return [];
  return systems.map((system, index) => (isPlainObject(system) ? fn(system, index) : system));
}

export { isPlainObject } from '../utils/scalars.js';
