/**
 * `1.27.0` — lift the travel configuration to world scope, collapsing each party's per-system realm
 * override with it (issue 1282). Pure, idempotent, version-gated; spec § Travel World-Scope
 * Migration owns the id-keyed union, the reported collision, the scalar adoption and the
 * highest-`updatedAt` party collapse. ENVIRONMENTS ARE UNTOUCHED, and the actor discovery flag
 * CANNOT be migrated here at all — the runner has no actor access, so it upgrades lazily on read.
 */

import { isPlainObject, clone } from './migrationHelpers.js';

const SCALAR_KEYS = ['revealMode', 'modifierVisibility'];

/** Read one system's legacy realm settings block, if it has one. */
function legacyRealmSettings(system) {
  if (!isPlainObject(system)) return null;
  const settings = system.gatheringRealmSettings ?? system.gatheringRegionSettings;
  return isPlainObject(settings) ? settings : null;
}

/** Read one system's legacy realm list, if it has one. */
function legacyRealms(system) {
  if (!isPlainObject(system)) return [];
  const realms = system.gatheringRealms ?? system.gatheringRegions;
  return Array.isArray(realms) ? realms : [];
}

/** Build the world travel config by unioning every system's realms by id. */
export function buildWorldTravelConfig(systems) {
  const list = Array.isArray(systems) ? systems : [];
  const realms = [];
  const seen = new Map();
  const collisions = [];
  let scalars = null;
  let scalarsFromEnabled = false;

  for (const system of list) {
    const settings = legacyRealmSettings(system);
    const enabled = settings?.enabled === true;

    // Scalars: prefer the first ENABLED system, falling back to the first carrying a settings block
    // at all, so a world where every system is switched off keeps the reveal mode its GM configured.
    if (settings && !scalarsFromEnabled && (enabled || scalars === null)) {
      const picked = {};
      for (const key of SCALAR_KEYS) {
        if (settings[key] !== undefined) picked[key] = clone(settings[key]);
      }
      scalars = picked;
      scalarsFromEnabled = enabled;
    }

    for (const realm of legacyRealms(system)) {
      if (!isPlainObject(realm)) continue;
      const id = String(realm.id || '').trim();
      if (!id) continue;
      if (seen.has(id)) {
        // Report, never re-key: a re-keyed realm orphans every environment, party override and
        // actor flag that cites it — strictly worse than the duplicate it would resolve.
        collisions.push({
          realmId: id,
          keptFrom: seen.get(id),
          discardedFrom: isPlainObject(system) ? String(system.id || '') : '',
        });
        continue;
      }
      seen.set(id, isPlainObject(system) ? String(system.id || '') : '');
      // `craftingSystemId` is deliberately dropped: a world realm has no owning system.
      const { craftingSystemId: _ownerDropped, ...rest } = clone(realm);
      realms.push(rest);
    }
  }

  const built = { ...scalars, realms };
  if (collisions.length > 0) built._collisions = collisions;
  return built;
}

/**
 * Reduce every system's travel block to the participation flag alone and drop the realm list.
 * Unchanged systems are returned by reference.
 */
export function stripSystemTravelConfig(systems) {
  const list = Array.isArray(systems) ? systems : [];
  return list.map((system) => {
    if (!isPlainObject(system)) return system;
    const settings = legacyRealmSettings(system);
    const hasRealms = system.gatheringRealms !== undefined || system.gatheringRegions !== undefined;
    const settingsKeys = settings ? Object.keys(settings) : [];
    const settingsAlreadyShrunk =
      settings === null ||
      settingsKeys.length === 0 ||
      (settingsKeys.length === 1 && settingsKeys[0] === 'enabled');
    // Already shrunk — leave the reference alone so the runner's change detection stays honest.
    if (!hasRealms && settingsAlreadyShrunk && system.gatheringRegionSettings === undefined) {
      return system;
    }

    const {
      gatheringRealms: _realmsDropped,
      gatheringRegions: _legacyRealmsDropped,
      gatheringRegionSettings: _legacySettingsDropped,
      ...rest
    } = system;
    return { ...rest, gatheringRealmSettings: { enabled: settings?.enabled === true } };
  });
}

/** Collapse each party's per-system realm overrides into one. */
export function collapsePartyRealmOverrides(parties) {
  const list = Array.isArray(parties) ? parties : [];
  const collapsed = [];
  const next = list.map((party) => {
    if (!isPlainObject(party)) return party;
    const overrides = party.currentRealmOverrides ?? party.currentRegionOverrides;
    // Already collapsed, or never had one — leave the reference alone.
    if (!isPlainObject(overrides)) return party;

    const entries = Object.values(overrides).filter(isPlainObject);
    // Prefer a real manual placement over an emptied one: a `none` entry records that the GM
    // cleared the override, which should not outrank a system where they actually set one.
    const manual = entries.filter(
      (entry) =>
        entry.mode === 'manual' && Array.isArray(entry.realmIds) && entry.realmIds.length > 0
    );
    const candidates = manual.length > 0 ? manual : entries;
    const winner = candidates.reduce((best, entry) => {
      if (!best) return entry;
      return Number(entry.updatedAt || 0) > Number(best.updatedAt || 0) ? entry : best;
    }, null);

    if (manual.length > 1) {
      collapsed.push({ partyId: String(party.id || ''), competing: manual.length });
    }

    const {
      currentRealmOverrides: _dropped,
      currentRegionOverrides: _legacyDropped,
      ...rest
    } = party;
    if (!winner) return rest;
    return {
      ...rest,
      currentRealmOverride: {
        mode: winner.mode === 'manual' ? 'manual' : 'none',
        realmIds: Array.isArray(winner.realmIds) ? clone(winner.realmIds) : [],
        updatedAt: Number.isFinite(Number(winner.updatedAt)) ? Number(winner.updatedAt) : 0,
        updatedByUserId: String(winner.updatedByUserId || ''),
      },
    };
  });
  return { parties: next, collapsed };
}

export function migrateTravelToWorldScope(data = {}) {
  const systems = Array.isArray(data.systems) ? data.systems : [];
  const parties = Array.isArray(data.gatheringParties) ? data.gatheringParties : [];
  const existing = isPlainObject(data.travelConfig) ? data.travelConfig : {};

  // The idempotence guard: a populated world library is authoritative and is never re-merged.
  const alreadyMigrated = Array.isArray(existing.realms) && existing.realms.length > 0;
  let travelConfig = existing;
  if (!alreadyMigrated) {
    const built = buildWorldTravelConfig(systems);
    // Return the ORIGINAL object when there was nothing to lift: the runner detects change by JSON
    // comparison, so emitting `{ realms: [] }` over a stored `{}` would write the setting in every
    // world that never used travel.
    const liftedAnything = built.realms.length > 0 || Object.keys(built).length > 1;
    travelConfig = liftedAnything ? built : existing;
  }

  const { parties: collapsedParties } = collapsePartyRealmOverrides(parties);

  return {
    systems: stripSystemTravelConfig(systems),
    gatheringParties: collapsedParties,
    travelConfig,
  };
}
