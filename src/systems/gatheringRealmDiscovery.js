import { getFabricateFlag, setFabricateFlag } from '../config/flags.js';

/**
 * Actor-flag helpers for realm discovery. Discovery is actor-scoped so realm knowledge follows
 * the character across party changes. The bare flag key `discoveredGatheringRealms` matches
 * sibling actor-state keys (`learnedRecipes`, `gatheringRuns`) and is stored under the module
 * flag namespace through `src/config/flags.js`. Logical shape:
 *
 * ```js
 * discoveredGatheringRealms = {
 *   [realmId]: { discoveredAt, source, partyId?, sceneUuid?, sceneRegionUuid? }
 * }
 * ```
 *
 * DISCOVERY IS WORLD-WIDE (issue 1282). It used to nest under a `systemId`, because realms
 * were per crafting system. Realms are geography now, so knowing one is knowledge of the
 * world: a character who has found Northreach Vale has found it, whichever crafting system
 * they were serving at the time.
 *
 * THE MIGRATION RUNNER CANNOT REWRITE THIS. It reaches two corpora and four world settings and
 * has no actor access at all, so the re-key happens LAZILY on read, and every write persists
 * only the new shape. That is the same mechanism the earlier `discoveredGatheringRegions`
 * rename used, for the same reason.
 *
 * Two details make the lazy upgrade safe:
 *
 * - **The discriminator is `discoveredAt`.** Every entry has one; no `systemId` bucket ever
 *   does. So an object carrying a numeric `discoveredAt` is a realm entry, and anything else
 *   object-shaped is a legacy bucket to flatten.
 * - **A HALF-UPGRADED map is reachable in normal use**, not hypothetical: upgrade an actor,
 *   write, then discover a second realm, and the map holds both shapes at once until the next
 *   full read. The flattener therefore handles a mixed map rather than assuming one shape.
 *
 * On a collision between buckets the EARLIEST `discoveredAt` wins. Discovery records the first
 * time a character saw a place; a later duplicate from another system is not a re-discovery.
 *
 * Reads never throw: entries whose `partyId` is now stale stay readable. `hideGatheringRealm`
 * re-sets the whole map rather than relying on Foundry `-=` deletion.
 *
 * @typedef {'manual' | 'partyToken' | 'import' | 'api'} GatheringRealmDiscoverySource
 */

const DISCOVERY_FLAG_KEY = 'discoveredGatheringRealms';
const LEGACY_DISCOVERY_FLAG_KEY = 'discoveredGatheringRegions';
const DISCOVERY_SOURCES = new Set(['manual', 'partyToken', 'import', 'api']);

function isRealmEntry(value) {
  return Boolean(value) && typeof value === 'object' && typeof value.discoveredAt === 'number';
}

/**
 * Flatten any mix of the legacy `[systemId][realmId]` shape and the current `[realmId]` shape
 * into the current one.
 *
 * @param {object} raw
 * @returns {object}
 */
function flattenDiscoveryMap(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const flat = {};
  const adopt = (realmId, entry) => {
    const existing = flat[realmId];
    if (!existing) {
      flat[realmId] = entry;
      return;
    }
    // Earliest wins: the first sighting is the fact discovery records.
    if (Number(entry.discoveredAt) < Number(existing.discoveredAt)) flat[realmId] = entry;
  };

  for (const [key, value] of Object.entries(source)) {
    if (isRealmEntry(value)) {
      adopt(key, value);
      continue;
    }
    if (!value || typeof value !== 'object') continue;
    // A legacy per-system bucket.
    for (const [realmId, entry] of Object.entries(value)) {
      if (isRealmEntry(entry)) adopt(realmId, entry);
    }
  }
  return flat;
}

/**
 * @param {object} actor Foundry actor document.
 * @returns {object} The full `{ [realmId]: entry }` map, upgraded on read.
 */
export function getDiscoveredGatheringRealms(actor) {
  const value = getFabricateFlag(
    actor,
    DISCOVERY_FLAG_KEY,
    getFabricateFlag(actor, LEGACY_DISCOVERY_FLAG_KEY, {})
  );
  return flattenDiscoveryMap(value);
}

/**
 * @param {object} actor
 * @param {string} realmId
 * @returns {boolean}
 */
export function isGatheringRealmDiscovered(actor, realmId) {
  return Boolean(getDiscoveredGatheringRealms(actor)[realmId]);
}

function resolveRealmExists(realmId, validation) {
  if (typeof validation === 'function') {
    return validation({ realmId }) === true;
  }
  if (validation && typeof validation.realmExists === 'function') {
    return validation.realmExists({ realmId }) === true;
  }
  // Accept a travel-config snapshot ({ realms }) or a raw realm array.
  const realms = Array.isArray(validation)
    ? validation
    : Array.isArray(validation?.realms)
      ? validation.realms
      : null;
  if (realms) {
    return realms.some((realm) => realm?.id === realmId);
  }
  return false;
}

/**
 * Record realm discovery on an actor. The realm must exist in the world's travel config or the
 * write is rejected (returns `false`).
 *
 * @param {object} actor
 * @param {object} args
 * @param {string} args.realmId
 * @param {GatheringRealmDiscoverySource} [args.source='api']
 * @param {string} [args.partyId]
 * @param {string} [args.sceneUuid]
 * @param {string} [args.sceneRegionUuid]
 * @param {Function|object|object[]} args.validateRealmExists Validator collaborator, travel
 *   config snapshot, or realm array proving the realm exists.
 * @param {() => number} [args.now]
 * @returns {Promise<boolean>} `true` when the discovery entry was written.
 */
export async function revealGatheringRealm(
  actor,
  {
    realmId,
    source = 'api',
    partyId = null,
    sceneUuid = null,
    sceneRegionUuid = null,
    validateRealmExists = null,
    now = () => Date.now(),
  } = {}
) {
  if (!realmId) return false;
  if (!DISCOVERY_SOURCES.has(source)) return false;
  if (!resolveRealmExists(realmId, validateRealmExists)) return false;

  const map = getDiscoveredGatheringRealms(actor);
  const entry = { discoveredAt: now(), source };
  if (partyId) entry.partyId = String(partyId);
  if (sceneUuid) entry.sceneUuid = String(sceneUuid);
  if (sceneRegionUuid) entry.sceneRegionUuid = String(sceneRegionUuid);
  await setFabricateFlag(actor, DISCOVERY_FLAG_KEY, { ...map, [realmId]: entry });
  return true;
}

/**
 * Remove a realm discovery entry by re-setting the whole map (no Foundry `-=` deletion).
 *
 * @param {object} actor
 * @param {{ realmId: string }} args
 * @returns {Promise<boolean>} `true` when an entry was removed.
 */
export async function hideGatheringRealm(actor, { realmId } = {}) {
  if (!realmId) return false;
  const map = getDiscoveredGatheringRealms(actor);
  if (!(realmId in map)) return false;
  const next = {};
  for (const [key, value] of Object.entries(map)) {
    if (key === realmId) continue;
    next[key] = value;
  }
  await setFabricateFlag(actor, DISCOVERY_FLAG_KEY, next);
  return true;
}

/**
 * Return the set of discovered realm ids.
 *
 * @param {object} actor
 * @returns {Set<string>}
 */
export function getDiscoveredRealmIds(actor) {
  return new Set(Object.keys(getDiscoveredGatheringRealms(actor)));
}
