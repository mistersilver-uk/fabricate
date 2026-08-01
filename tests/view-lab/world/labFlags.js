/**
 * Foundry V13 flag semantics, in one place.
 *
 * The lab previously carried THREE different `getFlag` implementations — two literal-key lookups
 * returning `null`, and one literal-first-then-walk that was patched onto a single actor. None of
 * them was Foundry's, and the difference is not cosmetic: every Fabricate read goes through
 * `getFabricateFlag`, which normalises a bare key to the dotted `fabricate.<key>`. A literal-only
 * lookup answers `null` to all of it, so a frame renders cleanly and completely — showing nothing
 * learned, no tool wear, nothing broken, no realm discovered — whatever the fixture author seeded.
 * That is the worst failure this harness has: a confident, wrong screenshot.
 *
 * V13's implementation (`common/abstract/document.mjs:906-919`) delegates to `getProperty`
 * (`common/utils/helpers.mjs:701-713`), which tries the LITERAL key first and only then splits on
 * `.` and walks. Both halves matter — Foundry stores a dotted key literally when it was written as
 * one, so a walk-only implementation misses exactly the keys a literal-only one finds.
 */

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
 * Returns `undefined` for a missing flag, as Foundry does — not `null`. Callers distinguish the two:
 * `getFabricateFlag` applies its `defaultValue` on `undefined`.
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
 * A `setFlag` that stores where Foundry stores.
 *
 * `setFlag(ns, key, v)` becomes `update({flags: {[ns]: {[key]: v}}})`, and V13's `updateSource`
 * expands dotted keys only when a TOP-LEVEL key contains a dot
 * (`common/abstract/data.mjs:442-451`). The inner key here never does, so nothing expands and the
 * value lands one level deep — which is why the three run containers do not agree with each other.
 * See {@link RUN_CONTAINER_PATHS}.
 *
 * @param {object} document The document to write to.
 * @returns {(scope: string, key: string, value: unknown) => Promise<object>} The bound mutator.
 */
export function makeSetFlag(document) {
  return async (scope, key, value) => {
    document.flags = document.flags ?? {};
    document.flags[scope] = { ...(document.flags[scope] ?? {}), [key]: value };
    return document;
  };
}

/**
 * Where each run container actually lives, mirroring `src/systems/runFlagInvalidation.js`.
 *
 * These are NOT uniform, and the asymmetry is real production behaviour rather than an oversight:
 *
 * - crafting and salvage go through `setFabricateFlag`, which issues
 *   `update({'flags.fabricate.fabricate.<key>': v})`. That is a top-level dotted key, so V13
 *   expands it — landing the container DOUBLY nested at `flags.fabricate.fabricate.<key>`.
 * - gathering uses a bare `actor.setFlag('fabricate', 'gatheringRuns', v)`, whose inner key has no
 *   dot, so nothing expands and it lands at `flags.fabricate.gatheringRuns`.
 *
 * The lab must seed ONE shape — production's — per container. Writing both spellings, as it did
 * before, makes it impossible for the lab to reproduce the depth bug this branch already shipped
 * once, because every reader finds something no matter which depth it looks at.
 */
export const RUN_CONTAINER_PATHS = Object.freeze({
  craftingRuns: ['fabricate', 'craftingRuns'],
  salvageRuns: ['fabricate', 'salvageRuns'],
  gatheringRuns: ['gatheringRuns'],
});

/**
 * Foundry's `expandObject`: a dotted TOP-LEVEL key becomes nested objects.
 *
 * `updateSource` applies this only when a top-level key contains a dot — which is the whole reason
 * the three run containers sit at two different depths. See {@link RUN_CONTAINER_PATHS}.
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
 * The lab's documents previously updated with `Object.assign`, which is not an update in any sense
 * Foundry would recognise. Two consequences, both silent:
 *
 *   - a nested change replaced the whole branch instead of merging into it;
 *   - a deletion key produced a own-property literally NAMED
 *     `flags.fabricate.fabricate.craftingRuns.active.-=lab-run-x` and deleted nothing.
 *
 * `deleteRemovedActiveRunFlags`, `GatheringRunManager` and `RecipeVisibilityService.forgetLearnedRecipes`
 * all issue `-=` keys. Under `Object.assign` each appeared to succeed while changing nothing, so the
 * UI would render unchanged and the frame would read as a UI bug rather than a harness bug.
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
 * `updateSource` matters beyond correctness of the write: `setFabricateFlag` forks on
 * `typeof document.updateSource === 'function'`, so without it EVERY lab write took the legacy
 * `setFlag` fallback while every production write took the `update` branch. The lab could not
 * exercise the path production runs.
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
