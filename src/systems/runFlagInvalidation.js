/**
 * Which run managers an `updateActor` diff touches (issues 733, 739), so each drops the runs a
 * write on another client made stale. `setFabricateFlag` stores crafting and salvage DOUBLY nested
 * at `flags.fabricate.fabricate.<container>` (see `.agents/docs/foundry-and-architecture.md`);
 * gathering's bare `setFlag` stores `flags.fabricate.gatheringRuns`. A forced replacement arrives
 * as `flags.fabricate.fabricate.==craftingRuns` (issue 1654). A probe at the wrong depth or
 * spelling silently never fires.
 */

import { hasByPath, pathSegments } from '../utils/objectPath.js';

export const RUN_CONTAINER_FLAG_PATHS = Object.freeze([
  { manager: 'crafting', flagPath: 'flags.fabricate.fabricate.craftingRuns' },
  { manager: 'salvage', flagPath: 'flags.fabricate.fabricate.salvageRuns' },
  { manager: 'gathering', flagPath: 'flags.fabricate.gatheringRuns' },
]);

/**
 * The operator prefixes Foundry reads on an update path's last segment. One core routine applies
 * both (`applySpecialKeys` on V13, `applyDataOperators` on V14), so a diff can carry either.
 */
export const FLAG_UPDATE_OPERATOR_PREFIXES = Object.freeze(['-=', '==']);

/** The plain path, then each operator on its last segment; an interior prefix is another write. */
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

/** Derived once at module load, since `updateActor` fires on every HP tick. */
const RUN_CONTAINER_DIFF_PATHS = Object.freeze(
  RUN_CONTAINER_FLAG_PATHS.map(({ manager, flagPath }) =>
    Object.freeze({ manager, diffPaths: Object.freeze(runContainerDiffPaths(flagPath)) })
  )
);

/** The manager keys whose container a nested or dotted `updateActor` diff touches. */
export function runContainersChanged(changes, hasProperty = hasByPath) {
  if (!changes || typeof changes !== 'object') return [];
  const probe = typeof hasProperty === 'function' ? hasProperty : hasByPath;
  return RUN_CONTAINER_DIFF_PATHS.filter(({ diffPaths }) =>
    diffPaths.some((path) => probe(changes, path))
  ).map(({ manager }) => manager);
}
