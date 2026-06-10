import { getFabricateFlag, setFabricateFlag } from '../config/flags.js';

/**
 * Actor-flag helpers for region discovery. Discovery is actor-scoped so region
 * knowledge follows the character across party changes. The bare flag key
 * `discoveredGatheringRegions` matches sibling actor-state keys (`learnedRecipes`,
 * `gatheringRuns`) and is stored under the module flag namespace through
 * `src/config/flags.js`. Logical shape:
 *
 * ```js
 * discoveredGatheringRegions = {
 *   [systemId]: {
 *     [regionId]: { discoveredAt, source, partyId?, sceneUuid?, sceneRegionUuid? }
 *   }
 * }
 * ```
 *
 * Discovery WRITES validate that the region belongs to the referenced crafting
 * system (per spec) using an injected validator or a system snapshot. Reads never
 * throw: entries whose `partyId` is now stale stay readable. `hideGatheringRegion`
 * re-sets the whole per-system map rather than relying on Foundry `-=` deletion.
 *
 * @typedef {'manual' | 'partyToken' | 'import' | 'api'} GatheringRegionDiscoverySource
 */

const DISCOVERY_FLAG_KEY = 'discoveredGatheringRegions';
const DISCOVERY_SOURCES = new Set(['manual', 'partyToken', 'import', 'api']);

/**
 * @param {object} actor Foundry actor document.
 * @returns {object} The full `{ [systemId]: { [regionId]: entry } }` map (clone-safe to read).
 */
export function getDiscoveredGatheringRegions(actor) {
  const value = getFabricateFlag(actor, DISCOVERY_FLAG_KEY, {});
  return value && typeof value === 'object' ? value : {};
}

/**
 * @param {object} actor
 * @param {string} systemId
 * @param {string} regionId
 * @returns {boolean}
 */
export function isGatheringRegionDiscovered(actor, systemId, regionId) {
  const map = getDiscoveredGatheringRegions(actor);
  const system = map?.[systemId];
  return Boolean(system && typeof system === 'object' && system[regionId]);
}

function resolveRegionBelongsToSystem(systemId, regionId, validation) {
  if (typeof validation === 'function') {
    return validation({ systemId, regionId }) === true;
  }
  if (validation && typeof validation.regionBelongsToSystem === 'function') {
    return validation.regionBelongsToSystem({ systemId, regionId }) === true;
  }
  // Accept a system snapshot ({ id, gatheringRegions }) or a raw region array.
  const regions = Array.isArray(validation)
    ? validation
    : (Array.isArray(validation?.gatheringRegions) ? validation.gatheringRegions : null);
  if (regions) {
    return regions.some(region => region?.id === regionId);
  }
  return false;
}

/**
 * Record region discovery on an actor. The region must belong to the referenced
 * crafting system or the write is rejected (returns `false`).
 *
 * @param {object} actor
 * @param {object} args
 * @param {string} args.systemId
 * @param {string} args.regionId
 * @param {GatheringRegionDiscoverySource} [args.source='api']
 * @param {string} [args.partyId]
 * @param {string} [args.sceneUuid]
 * @param {string} [args.sceneRegionUuid]
 * @param {Function|object|object[]} args.validateRegionInSystem Validator collaborator,
 *   system snapshot, or region array proving the region belongs to the system.
 * @param {() => number} [args.now]
 * @returns {Promise<boolean>} `true` when the discovery entry was written.
 */
export async function revealGatheringRegion(actor, {
  systemId,
  regionId,
  source = 'api',
  partyId = null,
  sceneUuid = null,
  sceneRegionUuid = null,
  validateRegionInSystem = null,
  now = () => Date.now()
} = {}) {
  if (!systemId || !regionId) return false;
  if (!DISCOVERY_SOURCES.has(source)) return false;
  if (!resolveRegionBelongsToSystem(systemId, regionId, validateRegionInSystem)) return false;

  const map = clone(getDiscoveredGatheringRegions(actor));
  const systemMap = map[systemId] && typeof map[systemId] === 'object' ? { ...map[systemId] } : {};
  const entry = { discoveredAt: now(), source };
  if (partyId) entry.partyId = String(partyId);
  if (sceneUuid) entry.sceneUuid = String(sceneUuid);
  if (sceneRegionUuid) entry.sceneRegionUuid = String(sceneRegionUuid);
  systemMap[regionId] = entry;
  map[systemId] = systemMap;
  await setFabricateFlag(actor, DISCOVERY_FLAG_KEY, map);
  return true;
}

/**
 * Remove a region discovery entry by re-setting the whole per-system map (no
 * Foundry `-=` deletion).
 *
 * @param {object} actor
 * @param {{ systemId: string, regionId: string }} args
 * @returns {Promise<boolean>} `true` when an entry was removed.
 */
export async function hideGatheringRegion(actor, { systemId, regionId } = {}) {
  if (!systemId || !regionId) return false;
  const map = clone(getDiscoveredGatheringRegions(actor));
  const systemMap = map[systemId];
  if (!systemMap || typeof systemMap !== 'object' || !(regionId in systemMap)) return false;
  const nextSystemMap = {};
  for (const [key, value] of Object.entries(systemMap)) {
    if (key === regionId) continue;
    nextSystemMap[key] = value;
  }
  map[systemId] = nextSystemMap;
  await setFabricateFlag(actor, DISCOVERY_FLAG_KEY, map);
  return true;
}

/**
 * Return the set of discovered region ids for one system, ignoring stale entries.
 *
 * @param {object} actor
 * @param {string} systemId
 * @returns {Set<string>}
 */
export function getDiscoveredRegionIdsForSystem(actor, systemId) {
  const map = getDiscoveredGatheringRegions(actor);
  const systemMap = map?.[systemId];
  if (!systemMap || typeof systemMap !== 'object') return new Set();
  return new Set(Object.keys(systemMap));
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
