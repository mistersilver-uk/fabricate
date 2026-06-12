import { getFabricateFlag, setFabricateFlag } from '../config/flags.js';

/**
 * Actor-flag helpers for realm discovery. Discovery is actor-scoped so realm
 * knowledge follows the character across party changes. The bare flag key
 * `discoveredGatheringRealms` matches sibling actor-state keys (`learnedRecipes`,
 * `gatheringRuns`) and is stored under the module flag namespace through
 * `src/config/flags.js`. Logical shape:
 *
 * ```js
 * discoveredGatheringRealms = {
 *   [systemId]: {
 *     [realmId]: { discoveredAt, source, partyId?, sceneUuid?, sceneRegionUuid? }
 *   }
 * }
 * ```
 *
 * Discovery WRITES validate that the realm belongs to the referenced crafting
 * system (per spec) using an injected validator or a system snapshot. Reads never
 * throw: entries whose `partyId` is now stale stay readable. `hideGatheringRealm`
 * re-sets the whole per-system map rather than relying on Foundry `-=` deletion.
 *
 * Legacy-read fallback: the getter reads the new `discoveredGatheringRealms` flag
 * and falls back to the old `discoveredGatheringRegions` actor flag, so a world
 * saved on the pre-rename schema still resolves discovery before the actor's next
 * write. Every write persists under the NEW key only, lazily upgrading the actor.
 *
 * @typedef {'manual' | 'partyToken' | 'import' | 'api'} GatheringRealmDiscoverySource
 */

const DISCOVERY_FLAG_KEY = 'discoveredGatheringRealms';
const LEGACY_DISCOVERY_FLAG_KEY = 'discoveredGatheringRegions';
const DISCOVERY_SOURCES = new Set(['manual', 'partyToken', 'import', 'api']);

/**
 * @param {object} actor Foundry actor document.
 * @returns {object} The full `{ [systemId]: { [realmId]: entry } }` map (clone-safe to read).
 */
export function getDiscoveredGatheringRealms(actor) {
  const value = getFabricateFlag(actor, DISCOVERY_FLAG_KEY, getFabricateFlag(actor, LEGACY_DISCOVERY_FLAG_KEY, {}));
  return value && typeof value === 'object' ? value : {};
}

/**
 * @param {object} actor
 * @param {string} systemId
 * @param {string} realmId
 * @returns {boolean}
 */
export function isGatheringRealmDiscovered(actor, systemId, realmId) {
  const map = getDiscoveredGatheringRealms(actor);
  const system = map?.[systemId];
  return Boolean(system && typeof system === 'object' && system[realmId]);
}

function resolveRealmBelongsToSystem(systemId, realmId, validation) {
  if (typeof validation === 'function') {
    return validation({ systemId, realmId }) === true;
  }
  if (validation && typeof validation.realmBelongsToSystem === 'function') {
    return validation.realmBelongsToSystem({ systemId, realmId }) === true;
  }
  // Accept a system snapshot ({ id, gatheringRealms }) or a raw realm array.
  const realms = Array.isArray(validation)
    ? validation
    : (Array.isArray(validation?.gatheringRealms) ? validation.gatheringRealms : null);
  if (realms) {
    return realms.some(realm => realm?.id === realmId);
  }
  return false;
}

/**
 * Record realm discovery on an actor. The realm must belong to the referenced
 * crafting system or the write is rejected (returns `false`).
 *
 * @param {object} actor
 * @param {object} args
 * @param {string} args.systemId
 * @param {string} args.realmId
 * @param {GatheringRealmDiscoverySource} [args.source='api']
 * @param {string} [args.partyId]
 * @param {string} [args.sceneUuid]
 * @param {string} [args.sceneRegionUuid]
 * @param {Function|object|object[]} args.validateRealmInSystem Validator collaborator,
 *   system snapshot, or realm array proving the realm belongs to the system.
 * @param {() => number} [args.now]
 * @returns {Promise<boolean>} `true` when the discovery entry was written.
 */
export async function revealGatheringRealm(actor, {
  systemId,
  realmId,
  source = 'api',
  partyId = null,
  sceneUuid = null,
  sceneRegionUuid = null,
  validateRealmInSystem = null,
  now = () => Date.now()
} = {}) {
  if (!systemId || !realmId) return false;
  if (!DISCOVERY_SOURCES.has(source)) return false;
  if (!resolveRealmBelongsToSystem(systemId, realmId, validateRealmInSystem)) return false;

  const map = clone(getDiscoveredGatheringRealms(actor));
  const systemMap = map[systemId] && typeof map[systemId] === 'object' ? { ...map[systemId] } : {};
  const entry = { discoveredAt: now(), source };
  if (partyId) entry.partyId = String(partyId);
  if (sceneUuid) entry.sceneUuid = String(sceneUuid);
  if (sceneRegionUuid) entry.sceneRegionUuid = String(sceneRegionUuid);
  systemMap[realmId] = entry;
  map[systemId] = systemMap;
  await setFabricateFlag(actor, DISCOVERY_FLAG_KEY, map);
  return true;
}

/**
 * Remove a realm discovery entry by re-setting the whole per-system map (no
 * Foundry `-=` deletion).
 *
 * @param {object} actor
 * @param {{ systemId: string, realmId: string }} args
 * @returns {Promise<boolean>} `true` when an entry was removed.
 */
export async function hideGatheringRealm(actor, { systemId, realmId } = {}) {
  if (!systemId || !realmId) return false;
  const map = clone(getDiscoveredGatheringRealms(actor));
  const systemMap = map[systemId];
  if (!systemMap || typeof systemMap !== 'object' || !(realmId in systemMap)) return false;
  const nextSystemMap = {};
  for (const [key, value] of Object.entries(systemMap)) {
    if (key === realmId) continue;
    nextSystemMap[key] = value;
  }
  map[systemId] = nextSystemMap;
  await setFabricateFlag(actor, DISCOVERY_FLAG_KEY, map);
  return true;
}

/**
 * Return the set of discovered realm ids for one system, ignoring stale entries.
 *
 * @param {object} actor
 * @param {string} systemId
 * @returns {Set<string>}
 */
export function getDiscoveredRealmIdsForSystem(actor, systemId) {
  const map = getDiscoveredGatheringRealms(actor);
  const systemMap = map?.[systemId];
  if (!systemMap || typeof systemMap !== 'object') return new Set();
  return new Set(Object.keys(systemMap));
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
