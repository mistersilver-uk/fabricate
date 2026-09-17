/**
 * `0.5.0` — convert node respawn intervals from a raw `intervalSeconds` to `intervalUnit` plus
 * `intervalAmount`, the former having baked the Earth calendar's day length into persisted data and
 * so drifted on a custom calendar. The new schema stores the authored INTENT and resolves against
 * the active world calendar at runtime, exactly for every value the old editor could produce.
 * Pure, idempotent and shape-preserving: an already-converted respawn is returned by reference.
 */

import { migrateNodeRespawnConfig } from './respawnTraversal.js';

const SECONDS_PER_UNIT = Object.freeze({ minutes: 60, hours: 3600, days: 86_400, weeks: 604_800 });

/** A seconds count as `{intervalUnit, intervalAmount}`: the largest whole unit, else fractional hours. */
function secondsToUnitAmount(seconds) {
  const total = Number(seconds) || 0;
  for (const unit of ['weeks', 'days', 'hours', 'minutes']) {
    const size = SECONDS_PER_UNIT[unit];
    if (total > 0 && total % size === 0)
      return { intervalUnit: unit, intervalAmount: total / size };
  }
  return { intervalUnit: 'hours', intervalAmount: total ? total / SECONDS_PER_UNIT.hours : 0 };
}

function migrateRespawn(respawn) {
  if (!respawn || typeof respawn !== 'object') return respawn;
  // Already on the unit+amount schema → return by reference (idempotent no-op).
  if (respawn.intervalUnit !== undefined) return respawn;
  // Nothing to convert (e.g. a respawn block that never had an interval).
  if (!('intervalSeconds' in respawn)) return respawn;
  const { intervalSeconds, ...rest } = respawn;
  return { ...rest, ...secondsToUnitAmount(intervalSeconds) };
}

export function migrateNodeRespawnIntervals(gatheringConfig = {}, environments = []) {
  return migrateNodeRespawnConfig(gatheringConfig, environments, migrateRespawn);
}
