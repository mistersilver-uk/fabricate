/** Foundry V13 flag semantics, in one place. */

/**
 * Foundry's `getProperty`: literal key first, then a dotted walk.
 *
 * @param {object} object Object to read from.
 * @param {string} key Property name, possibly dotted.
 * @returns {unknown} The value, or `undefined`.
 */
export function getProperty(object, key) {
  if (!object || typeof object !== 'object') return undefined;
  if (key in object) return object[key];
  return String(key)
    .split('.')
    .reduce((current, part) => (current == null ? undefined : current[part]), object);
}

/**
 * A V13-accurate `getFlag` bound to a document's own `flags`.
 *
 * @param {object} document The document whose `flags` to read.
 * @returns {(scope: string, key: string) => unknown} The bound accessor.
 */
export function makeGetFlag(document) {
  return (scope, key) => {
    const bucket = document.flags?.[scope];
    if (!bucket) return undefined;
    return getProperty(bucket, key);
  };
}

/**
 * A `setFlag` that stores where Foundry stores, and MERGES the way Foundry merges.
 *
 * @param {object} document The document to write to.
 * @returns {(scope: string, key: string, value: unknown) => Promise<object>} The bound mutator.
 */
export function makeSetFlag(document) {
  return async (scope, key, value) => {
    document.flags = document.flags ?? {};
    applyUpdate(document.flags, { [scope]: { [key]: value } });
    return document;
  };
}

/**
 * Where each run container actually lives, mirroring `src/systems/runFlagInvalidation.js`. The lab
 * must seed ONE shape — production's — per container.
 */
export const RUN_CONTAINER_PATHS = Object.freeze({
  craftingRuns: ['fabricate', 'craftingRuns'],
  salvageRuns: ['fabricate', 'salvageRuns'],
  gatheringRuns: ['gatheringRuns'],
});

/**
 * Foundry's `expandObject`: a dotted TOP-LEVEL key becomes nested objects.
 *
 * @param {object} changes Flat or partly-dotted change set.
 * @returns {object} The expanded set.
 */
export function expandObject(changes) {
  const expanded = {};
  for (const [key, value] of Object.entries(changes)) {
    if (!key.includes('.')) {
      expanded[key] = value;
      continue;
    }
    const parts = key.split('.');
    let node = expanded;
    for (const part of parts.slice(0, -1)) {
      if (typeof node[part] !== 'object' || node[part] === null) node[part] = {};
      node = node[part];
    }
    node[parts.at(-1)] = value;
  }
  return expanded;
}

/**
 * Apply an expanded change set the way V13's `_updateDiff` does: deep merge, and `-=key` DELETES.
 *
 * @param {object} target Object to mutate.
 * @param {object} changes Expanded change set.
 * @returns {object} The mutated target.
 */
export function applyUpdate(target, changes) {
  for (const [key, value] of Object.entries(changes)) {
    if (key.startsWith('-=')) {
      delete target[key.slice(2)];
      continue;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (typeof target[key] !== 'object' || target[key] === null || Array.isArray(target[key])) {
        target[key] = {};
      }
      applyUpdate(target[key], value);
      continue;
    }
    target[key] = value;
  }
  return target;
}

/**
 * Install V13-shaped `update` and `updateSource` on a lab document.
 *
 * @param {object} document Document to equip.
 * @returns {object} The same document.
 */
export function installUpdateSemantics(document) {
  document.updateSource = (changes = {}) => applyUpdate(document, expandObject(changes));
  document.update = async (changes = {}) => {
    applyUpdate(document, expandObject(changes));
    return document;
  };
  return document;
}

/**
 * Seed a Fabricate flag at the depth production writes it.
 *
 * @param {object} document Document to stock.
 * @param {string[]} path Key path BELOW `flags.fabricate`, e.g. `['fabricate','craftingRuns']`.
 * @param {unknown} value Value to store.
 */
export function seedFabricateFlag(document, path, value) {
  document.flags = document.flags ?? {};
  let node = (document.flags.fabricate = document.flags.fabricate ?? {});
  for (const part of path.slice(0, -1)) {
    node[part] = node[part] ?? {};
    node = node[part];
  }
  node[path.at(-1)] = value;
}
