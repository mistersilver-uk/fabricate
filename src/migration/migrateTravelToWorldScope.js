/**
 * 1.27.0 — Lift the travel configuration from every crafting system to world scope
 * (issue 1282; pure, idempotent, version-gated).
 *
 * WHY THIS EXISTS. Realms are geography. Northreach Vale is the same valley whether a
 * character is there to gather herbs or to quarry stone, yet Fabricate stored the realm
 * library, its reveal mode and its modifier visibility on each crafting system. A GM running
 * two systems authored the same valley twice, linked the same Foundry Scene Region to both
 * copies, and revealed it to a character twice — and the two copies could then disagree. The
 * engine already conceded the problem: `_listingRealmContext` gave up entirely and reported
 * no realm whenever more than one realm-enabled system existed, because it could not say
 * which system's answer was the real one.
 *
 * The configuration now lives in the `travelConfig` world setting and a crafting system keeps
 * only `gatheringRealmSettings.enabled` — whether it PARTICIPATES.
 *
 * HOW REALMS ARE RECONCILED — union-merge, keyed by realm `id`, first system wins.
 * Environments (`includedRealmIds` / `excludedRealmIds`), party overrides and actor discovery
 * flags all reference realms by **id**, so a realm dropped by the merge orphans every
 * reference to it. Taking the union preserves the most references; keying by id rather than
 * by name is what makes the merge reference-preserving at all, and is why two systems that
 * both authored "Northreach Vale" keep both records rather than being silently fused.
 *
 * Ids are `randomID()`, so a collision across systems is effectively impossible — it can only
 * arise from a hand edit or a copy-import that skipped id rebinding. On collision the first
 * wins and the loser is REPORTED rather than re-keyed: re-keying would orphan every reference
 * to it, which is the precise harm the union exists to prevent.
 *
 * The scalars cannot be unioned, so `revealMode` and `modifierVisibility` are adopted from the
 * first system that had travel ENABLED. A system with the toggle off never configured them
 * deliberately, so preferring an enabled system's choice is the one signal available.
 *
 * PARTIES COLLAPSE TOO. `currentRealmOverrides` was keyed by systemId only because realms were
 * per-system. A party is one set of tokens standing in one place, so the map collapses to a
 * single `currentRealmOverride`, keeping the entry with the highest `updatedAt` — the GM's
 * most recent statement of where they are. Unlike the currency merge, which had to settle for
 * "first wins because picking either is arbitrary", there is a real signal here.
 *
 * ENVIRONMENTS ARE DELIBERATELY UNTOUCHED. Under first-wins every realm id survives, so
 * `includedRealmIds` / `excludedRealmIds` need no rewrite and adding one would be pure churn.
 * One consequence worth naming: an environment citing a realm that belonged to a DIFFERENT
 * system was previously invalid-but-inert, because validation ran only at save boundaries and
 * only against the owning system. It becomes valid and live, so it starts gating. Reachable
 * only by hand edit or copy-import, but a real behaviour change on upgrade.
 *
 * THE ACTOR DISCOVERY FLAG CANNOT BE MIGRATED HERE, and the reason is structural rather than a
 * choice: the runner reaches two corpora and four settings, and has no actor access at all.
 * `flags.fabricate.discoveredGatheringRealms` is upgraded lazily on read instead — see
 * `gatheringRealmDiscovery.js`.
 *
 * Mutated setting keys: `travelConfig` (created), `craftingSystems` (shrunk),
 * `gatheringParties` (overrides collapsed).
 *
 * IDEMPOTENT, and the guard is load-bearing. Once the world library carries realms this is a
 * no-op for the config: a second run must never re-impose stale system blocks over a library
 * the GM has since edited, because they may have deliberately deleted a realm.
 *
 * Never throws: every level is guarded, and a malformed system, party or realm is skipped
 * rather than repaired. Repair is the normalizer's job, not this migration's.
 */

import { isPlainObject, clone } from './migrationHelpers.js';

const SCALAR_KEYS = ['revealMode', 'modifierVisibility'];

/**
 * Read one system's legacy realm settings block, if it has one.
 * @param {object} system
 * @returns {object|null}
 */
function legacyRealmSettings(system) {
  if (!isPlainObject(system)) return null;
  const settings = system.gatheringRealmSettings ?? system.gatheringRegionSettings;
  return isPlainObject(settings) ? settings : null;
}

/**
 * Read one system's legacy realm list, if it has one.
 * @param {object} system
 * @returns {object[]}
 */
function legacyRealms(system) {
  if (!isPlainObject(system)) return [];
  const realms = system.gatheringRealms ?? system.gatheringRegions;
  return Array.isArray(realms) ? realms : [];
}

/**
 * Build the world travel config by unioning every system's realms by id.
 *
 * @param {Array<object>} systems
 * @returns {{ revealMode?: string, modifierVisibility?: string, realms: object[], _collisions?: object[] }}
 */
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

    // Scalars: prefer the first ENABLED system, but fall back to the first system carrying a
    // settings block at all, so a world where every system is switched off still keeps the
    // reveal mode its GM configured rather than silently reverting to `manual`.
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
        // Report, never re-key. A re-keyed realm orphans every environment, party override and
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
 * Reduce every system's travel block to the participation flag alone, and drop the realm list.
 *
 * @param {Array<object>} systems
 * @returns {Array<object>} a new array; unchanged systems are returned by reference
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

/**
 * Collapse each party's per-system realm overrides into one.
 *
 * @param {Array<object>} parties
 * @returns {{ parties: Array<object>, collapsed: object[] }}
 */
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

/**
 * @param {{ systems: Array<object>, gatheringParties: Array<object>, travelConfig: object }} data
 * @returns {{ systems: Array<object>, gatheringParties: Array<object>, travelConfig: object }}
 */
export function migrateTravelToWorldScope(data = {}) {
  const systems = Array.isArray(data.systems) ? data.systems : [];
  const parties = Array.isArray(data.gatheringParties) ? data.gatheringParties : [];
  const existing = isPlainObject(data.travelConfig) ? data.travelConfig : {};

  // The idempotence guard: a populated world library is authoritative and is never re-merged.
  const alreadyMigrated = Array.isArray(existing.realms) && existing.realms.length > 0;
  let travelConfig = existing;
  if (!alreadyMigrated) {
    const built = buildWorldTravelConfig(systems);
    // Return the ORIGINAL object when there was nothing to lift. The runner detects change by
    // JSON comparison, so emitting a freshly-built `{ realms: [] }` over a stored `{}` would
    // register as a change and write the setting in every world that never used travel.
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
