/**
 * `0.4.0` — collapse resource-node respawn policies onto `manual | overTime`, the latter carrying a
 * `gainMode`, across library tasks, inline environment tasks and per-env runtime state.
 * `manualAndElapsedTime` maps to `overTime` plus `chance`, the manual half being dropped since GMs
 * still top up counts through the restock API. Pure, idempotent and shape-preserving; the new
 * defaults come from `normalizeRespawn` at read time, so this rewrites the `policy` alone.
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

export function migrateNodeRespawnModes(gatheringConfig = {}, environments = []) {
  return migrateNodeRespawnConfig(gatheringConfig, environments, migrateRespawn);
}
