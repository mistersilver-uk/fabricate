/**
 * 0.4.0 migration — collapse resource-node respawn policies.
 *
 * Old policies: `none | manual | elapsedTime | probability | manualAndElapsedTime`.
 * New policies: `manual | overTime`, where `overTime` carries a `gainMode`
 * (`guaranteed | chance | expression`). Mapping:
 *   none | undefined       -> manual
 *   manual                 -> manual
 *   elapsedTime            -> overTime + guaranteed
 *   probability            -> overTime + chance
 *   manualAndElapsedTime   -> overTime + chance   (the manual half is dropped;
 *                             GMs still top up counts via the restock API)
 *
 * Respawn config lives in three places, all migrated here:
 *   - library tasks:        `gatheringConfig.systems[sid].tasks[].nodes.respawn`
 *   - inline env tasks:     `environments[].tasks[].nodes.respawn`
 *   - per-env runtime state:`environments[].nodeRuntime[taskId].respawn`
 *
 * Pure, idempotent, and shape-preserving: records already on the new schema (or
 * with no respawn block) are returned by reference, so re-running is a no-op and
 * worlds with no node respawn config see zero churn. The new `gainMode`/
 * `amountExpression` defaults are supplied at read time by `normalizeRespawn`,
 * so this migration only rewrites the `policy` (+ `gainMode` where it changes).
 */

import { migrateNodeRespawnConfig } from './respawnTraversal.js';

const POLICY_MAP = Object.freeze({
  none: { policy: 'manual' },
  manual: { policy: 'manual' },
  elapsedTime: { policy: 'overTime', gainMode: 'guaranteed' },
  probability: { policy: 'overTime', gainMode: 'chance' },
  manualAndElapsedTime: { policy: 'overTime', gainMode: 'chance' },
});

function migrateRespawn(respawn) {
  if (!respawn || typeof respawn !== 'object') return respawn;
  // Already on the new schema → return by reference (idempotent no-op).
  if (respawn.policy === 'manual' || respawn.policy === 'overTime') return respawn;
  const mapped = POLICY_MAP[respawn.policy] || { policy: 'manual' };
  return { ...respawn, ...mapped };
}

/**
 * @param {object} gatheringConfig Raw gathering config setting.
 * @param {Array<object>} environments Raw gathering environments setting.
 * @returns {{gatheringConfig: object, environments: Array<object>}}
 */
export function migrateNodeRespawnModes(gatheringConfig = {}, environments = []) {
  return migrateNodeRespawnConfig(gatheringConfig, environments, migrateRespawn);
}
