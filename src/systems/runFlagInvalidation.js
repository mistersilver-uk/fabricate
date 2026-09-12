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
 * SECOND TRAP, ONE PREFIX OVER (issue 1654). An UPDATE OPERATOR is part of the last path
 * segment, so a write that uses one reaches this diff under a DIFFERENT key: a
 * forced-replacement write of `flags.fabricate.fabricate.==craftingRuns` expands to a
 * `'==craftingRuns'` key beside where a plain write would have put `'craftingRuns'`, and
 * a probe for the bare spelling does not match it. The consequence is the same silence
 * the trap above describes — `runContainersChanged` answers `[]`, no manager drops its
 * cache, and every other client goes on serving runs it has already been told are stale.
 * The `1.34.0` essence-merge remap is the first pass to write one (it MUST, because it
 * rewrites a map's KEY SET and a merge write cannot remove a key), and `-=` has been
 * reachable all along through `deleteRemovedActiveRunFlags`.
 *
 * Each container is therefore probed under every spelling of its OWN last segment, with
 * the parent path DERIVED from the descriptor rather than written out. That is what makes
 * the fix hold at both depths at once: nothing here repeats `flags.fabricate` or knows
 * which containers are doubly nested.
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
 * The update-operator prefixes Foundry reads on the LAST segment of an update path.
 *
 * Both are applied in ONE pass by the same core routine (`applySpecialKeys` on V13,
 * `applyDataOperators` on V14) and Foundry classifies them together — its own
 * `` DeletionKey = `-=${string}` | `==${string}` `` — so there is no configuration in
 * which one reaches a change diff and the other does not. Listing only the one Fabricate
 * writes today would leave the next one to be discovered in the field.
 *
 * @type {ReadonlyArray<string>}
 */
export const FLAG_UPDATE_OPERATOR_PREFIXES = Object.freeze(['-=', '==']);

/**
 * Every change-diff path that means "this container was touched": the plain path, plus
 * one per update-operator prefix applied to its LAST segment.
 *
 * THE PREFIX GOES ON THE LAST SEGMENT AND NOWHERE ELSE, which is the whole reason this is
 * derived rather than spelled out. `flags.fabricate.==fabricate.craftingRuns` is a
 * different write with different semantics, and a matcher that prefixed an interior
 * segment would match writes this hook has no business reacting to.
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
 * The probe paths per manager, derived ONCE at module load.
 *
 * `updateActor` fires on every HP tick, so this is a hot path; deriving three spellings
 * per container on every invocation would be needless work. A non-flag diff still costs
 * only its first segment, because every probe bails at `flags`.
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
