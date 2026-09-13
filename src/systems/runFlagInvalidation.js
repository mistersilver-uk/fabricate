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
 *
 * Second trap: an update operator belongs to the last path segment, so a forced-replacement
 * write reaches the diff as `flags.fabricate.fabricate.==craftingRuns` and a probe for the bare
 * spelling misses it, with the same silence (issue 1654).
 *
 * Each container is therefore probed under every spelling of its own last segment, with the
 * parent path derived from the descriptor, so one matcher holds at both depths.
 */

import { hasByPath, pathSegments } from '../utils/objectPath.js';

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

/**
 * The update-operator prefixes Foundry reads on an update path's last segment. One core routine
 * applies both (`applySpecialKeys` on V13, `applyDataOperators` on V14) and Foundry classifies
 * them together as its `DeletionKey`, so a change diff can carry either.
 */
export const FLAG_UPDATE_OPERATOR_PREFIXES = Object.freeze(['-=', '==']);

/**
 * Every change-diff path that means this container was touched: the plain path, plus one per
 * update-operator prefix on its last segment. An interior segment is never prefixed —
 * `flags.fabricate.==fabricate.craftingRuns` is a different write with different semantics.
 *
 * @param {string} flagPath the container's plain stored path.
 * @returns {string[]} the plain path first, then one prefixed spelling per operator.
 */
export function runContainerDiffPaths(flagPath) {
  const segments = pathSegments(flagPath);
  if (segments.length === 0) return [];
  const key = segments.at(-1);
  const parent = segments.slice(0, -1).join('.');
  const prefix = parent === '' ? '' : `${parent}.`;
  return [
    flagPath,
    ...FLAG_UPDATE_OPERATOR_PREFIXES.map((operator) => `${prefix}${operator}${key}`),
  ];
}

/**
 * The probe paths per manager, derived once at module load: `updateActor` fires on every HP
 * tick, so deriving three spellings per container per invocation would be needless work.
 */
const RUN_CONTAINER_DIFF_PATHS = Object.freeze(
  RUN_CONTAINER_FLAG_PATHS.map(({ manager, flagPath }) =>
    Object.freeze({ manager, diffPaths: Object.freeze(runContainerDiffPaths(flagPath)) })
  )
);

/**
 * Return the run managers whose container flag is touched by an `updateActor` diff.
 *
 * @param {object} changes the `updateActor` change diff (may be nested or dotted)
 * @param {(object: object, path: string) => boolean} [hasProperty] path probe
 *   (`foundry.utils.hasProperty` at runtime; a POSIX-dotted default for tests)
 * @returns {string[]} the matched manager keys (subset of 'crafting'|'salvage'|'gathering')
 */
export function runContainersChanged(changes, hasProperty = hasByPath) {
  if (!changes || typeof changes !== 'object') return [];
  const probe = typeof hasProperty === 'function' ? hasProperty : hasByPath;
  return RUN_CONTAINER_DIFF_PATHS.filter(({ diffPaths }) =>
    diffPaths.some((path) => probe(changes, path))
  ).map(({ manager }) => manager);
}
