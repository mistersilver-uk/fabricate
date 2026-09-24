import { getFabricateFlag, setFabricateFlag } from '../config/flags.js';

/**
 * Actor-flag helpers for realm discovery, which follows the character across parties. The flag
 * `discoveredGatheringRealms` is `{ [realmId]: { discoveredAt, source, partyId?, sceneUuid?,
 * sceneRegionUuid? } }`, world-wide since issue 1282 dropped the old `[systemId]` nesting. The
 * migration runner has no actor access, so the re-key is lazy on read, and writes persist only the
 * new shape. A numeric `discoveredAt` marks a realm entry, anything else object-shaped is a legacy
 * bucket, and a half-upgraded mixed map is normal; on a collision the earliest `discoveredAt`
 * wins. Reads never throw, keeping entries with a stale `partyId`. `hideGatheringRealm` re-sets
 * the whole map rather than relying on Foundry `-=` deletion.
 */

const DISCOVERY_FLAG_KEY = 'discoveredGatheringRealms';
const LEGACY_DISCOVERY_FLAG_KEY = 'discoveredGatheringRegions';
const DISCOVERY_SOURCES = new Set(['manual', 'partyToken', 'import', 'api']);

function isRealmEntry(value) {
  return Boolean(value) && typeof value === 'object' && typeof value.discoveredAt === 'number';
}

function flattenDiscoveryMap(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const flat = {};
  const adopt = (realmId, entry) => {
    const existing = flat[realmId];
    if (!existing) {
      flat[realmId] = entry;
      return;
    }
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

/** The whole `{ [realmId]: entry }` map, upgraded on read. */
export function getDiscoveredGatheringRealms(actor) {
  const value = getFabricateFlag(
    actor,
    DISCOVERY_FLAG_KEY,
    getFabricateFlag(actor, LEGACY_DISCOVERY_FLAG_KEY, {})
  );
  return flattenDiscoveryMap(value);
}

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
 * Record a discovery, `true` when written. `source` is `manual`, `partyToken`, `import` or
 * `api`; `validateRealmExists` (a validator, a travel config or a realm array) must find the
 * realm, else the write is refused.
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

/** Remove one entry by re-setting the whole map, `true` when one was removed. */
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

export function getDiscoveredRealmIds(actor) {
  return new Set(Object.keys(getDiscoveredGatheringRealms(actor)));
}
