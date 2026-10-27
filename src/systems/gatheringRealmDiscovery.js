import {
  FABRICATE_FLAG_NAMESPACE,
  forcedDeletionEntry,
  forcedReplacementEntry,
  getFabricateFlag,
  setFabricateFlag,
} from '../config/flags.js';

/**
 * Actor-flag helpers for realm discovery, which follows the character across parties. The flag
 * `discoveredGatheringRealms` is `{ [realmId]: { discoveredAt, source, partyId?, sceneUuid?,
 * sceneRegionUuid? } }`, world-wide since issue 1282 dropped the old `[systemId]` nesting. The
 * migration runner has no actor access, so the re-key is lazy on read. A numeric `discoveredAt`
 * marks a realm entry, anything else object-shaped is a legacy bucket, and a stored map may mix
 * both; on a collision the earliest `discoveredAt` wins. Reads never throw, keeping entries with a
 * stale `partyId`. Every Document write force-replaces the whole flat map, so no legacy bucket or
 * pre-rename key survives core's merge (issue 2050).
 */

const DISCOVERY_FLAG_KEY = 'discoveredGatheringRealms';
const LEGACY_DISCOVERY_FLAG_KEY = 'discoveredGatheringRegions';
const DISCOVERY_FLAG_PARENT = `flags.${FABRICATE_FLAG_NAMESPACE}.${FABRICATE_FLAG_NAMESPACE}`;
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

/** Read from stored source, where a stored `null` still counts as present. */
function storesLegacyDiscoveryKey(actor) {
  const stored = (actor._source ?? actor).flags?.[FABRICATE_FLAG_NAMESPACE]?.[
    FABRICATE_FLAG_NAMESPACE
  ];
  return (
    Boolean(stored) &&
    typeof stored === 'object' &&
    Object.hasOwn(stored, LEGACY_DISCOVERY_FLAG_KEY)
  );
}

/**
 * Persist `next` as the whole flat map, `true` when written. A Document gets one update that
 * force-replaces the map and force-deletes the legacy key only when stored, keeping the payload
 * minimal; the replacement fills the same parent, so no empty parent can result. A non-Document
 * falls back to `setFabricateFlag`, or is refused with `false`.
 */
async function writeDiscoveryMap(actor, next) {
  if (typeof actor?.update === 'function' && typeof actor.updateSource === 'function') {
    const entries = [forcedReplacementEntry(DISCOVERY_FLAG_PARENT, DISCOVERY_FLAG_KEY, next)];
    if (storesLegacyDiscoveryKey(actor)) {
      entries.push(forcedDeletionEntry(DISCOVERY_FLAG_PARENT, LEGACY_DISCOVERY_FLAG_KEY));
    }
    await actor.update(Object.fromEntries(entries));
    return true;
  }
  if (typeof actor?.setFlag !== 'function') return false;
  await setFabricateFlag(actor, DISCOVERY_FLAG_KEY, next);
  return true;
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
  return writeDiscoveryMap(actor, { ...map, [realmId]: entry });
}

/** Remove one entry by writing the flat map minus it, `true` when one was removed and written. */
export async function hideGatheringRealm(actor, { realmId } = {}) {
  if (!realmId) return false;
  const map = getDiscoveredGatheringRealms(actor);
  if (!Object.hasOwn(map, realmId)) return false;
  const next = Object.fromEntries(Object.entries(map).filter(([key]) => key !== realmId));
  return writeDiscoveryMap(actor, next);
}

export function getDiscoveredRealmIds(actor) {
  return new Set(Object.keys(getDiscoveredGatheringRealms(actor)));
}
