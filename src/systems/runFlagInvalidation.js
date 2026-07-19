/**
 * Pure helpers for reacting to an `updateActor` change diff that touches a Fabricate
 * run-container flag (issues 733 + 739). The run managers cache an actor's runs in
 * memory and never learn about a write made on another client; wiring these to the
 * `updateActor` hook lets a manager drop its stale cache so the next read reflects the
 * currently-persisted document.
 *
 * TRAP: the crafting/salvage flags are stored at the DOUBLY-nested path
 * `flags.fabricate.fabricate.<container>` — `setFabricateFlag` prefixes `fabricate.`
 * and Foundry's `expandObject` nests that under the `fabricate` scope (see
 * `config/flags.js`). The gathering flag is written with a bare `setFlag`, so it lives
 * at the single-scope `flags.fabricate.gatheringRuns`. Matching the wrong depth means
 * the hook silently never fires.
 */

/**
 * @typedef {object} RunContainerDescriptor
 * @property {string} manager the run-manager key ('crafting' | 'salvage' | 'gathering')
 * @property {string} flagPath the exact stored change-diff path for the container
 */

/** @type {ReadonlyArray<RunContainerDescriptor>} */
export const RUN_CONTAINER_FLAG_PATHS = Object.freeze([
  { manager: 'crafting', flagPath: 'flags.fabricate.fabricate.craftingRuns' },
  { manager: 'salvage', flagPath: 'flags.fabricate.fabricate.salvageRuns' },
  { manager: 'gathering', flagPath: 'flags.fabricate.gatheringRuns' },
]);

function defaultHasProperty(object, path) {
  let current = object;
  for (const segment of String(path).split('.')) {
    if (current == null || typeof current !== 'object' || !(segment in current)) return false;
    current = current[segment];
  }
  return true;
}

/**
 * Return the run managers whose container flag is touched by an `updateActor` diff.
 *
 * @param {object} changes the `updateActor` change diff (may be nested or dotted)
 * @param {(object: object, path: string) => boolean} [hasProperty] path probe
 *   (`foundry.utils.hasProperty` at runtime; a POSIX-dotted default for tests)
 * @returns {string[]} the matched manager keys (subset of 'crafting'|'salvage'|'gathering')
 */
export function runContainersChanged(changes, hasProperty = defaultHasProperty) {
  if (!changes || typeof changes !== 'object') return [];
  const probe = typeof hasProperty === 'function' ? hasProperty : defaultHasProperty;
  return RUN_CONTAINER_FLAG_PATHS.filter(({ flagPath }) => probe(changes, flagPath)).map(
    ({ manager }) => manager
  );
}
