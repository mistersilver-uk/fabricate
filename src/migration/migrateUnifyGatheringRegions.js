/**
 * Migration 0.9.0: unify gathering regions.
 *
 * Collapses the two historical "region" notions into the single first-class
 * `GatheringRegion` concept:
 *
 * 1. Each legacy per-system region vocabulary entry
 *    (`gatheringConfig.systems[sysId].vocabularies.regions.values`) becomes a
 *    `GatheringRegion` record on the matching crafting system
 *    (`system.gatheringRegions[]`), keyed by the crafting-system id. Dedupe is by
 *    region id (the vocabulary's own identity model), so distinct ids with
 *    duplicate labels produce distinct regions, and a config system id with no
 *    matching crafting system is skipped (no target to write to).
 * 2. Each environment with a non-empty legacy `region` and empty
 *    `includedRegionIds` is mapped to `includedRegionIds = [thatId]` ONLY when a
 *    derived region with that id exists. Orphan fallback: a free-text
 *    `environment.region` with no matching derived region leaves
 *    `includedRegionIds` empty and the inert `region` string in place (no data
 *    loss, no stale reference).
 * 3. `region` / `regions` tags are stripped from gathering-config tasks and
 *    hazards (region is no longer a composition axis — composition is biome +
 *    danger only).
 * 4. Each migrated system's `vocabularies.regions` is cleared to `{ values: [] }`.
 * 5. `gatheringRegionSettings.enabled` is left unset (normalizes to `false`), so
 *    migrated systems keep the region/travel subsystem opt-in. The runner fires a
 *    one-time GM notice naming the systems that had regions, warning that
 *    region-scoped tasks/hazards may now appear in MORE environments.
 *
 * Pure function: no I/O, no Foundry calls, deep-clones its inputs. Idempotent —
 * the id-dedupe on regions, the empty-`includedRegionIds` guard, the
 * orphan-leave-inert rule, and the cleared vocabulary all mean a second run is a
 * no-op. Runs at a version higher than the 0.2.0 `migrateGatheringConfig` so it
 * sees the per-system vocabulary that migration intentionally preserves.
 */

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/**
 * Normalize a vocabulary id (or a region/environment id) to its canonical form.
 * Matches the gathering vocabulary's own id model (`trim().toLowerCase()`), so a
 * derived region id, an `environment.region` string, and a stripped task tag all
 * collapse to the same key.
 *
 * @param {*} value
 * @returns {string}
 */
function vocabId(value) {
  if (value && typeof value === 'object') {
    return vocabId(value.id ?? value.value ?? value.label);
  }
  return String(value ?? '').trim().toLowerCase();
}

/**
 * Extract `{ id, label }` from one vocabulary `values` entry (a bare string or a
 * `{ id|value, label }` record). Returns `null` for entries with no usable id.
 *
 * @param {*} entry
 * @returns {{ id: string, label: string }|null}
 */
function vocabularyEntry(entry) {
  const isRecord = entry && typeof entry === 'object';
  const id = vocabId(isRecord ? (entry.id ?? entry.value ?? entry.label) : entry);
  if (!id) return null;
  const label = isRecord ? String(entry.label ?? '').trim() : '';
  return { id, label };
}

function regionValuesFor(systemConfig) {
  const regions = systemConfig?.vocabularies?.regions;
  if (Array.isArray(regions)) return regions;
  if (Array.isArray(regions?.values)) return regions.values;
  return [];
}

/**
 * Run the unification transform over the runner's one-pass data bundle.
 *
 * @param {{ systems?: object[], gatheringConfig?: object, environments?: object[] }} data
 * @returns {{ systems: object[], gatheringConfig: object, environments: object[], _unifiedRegionSystems?: string[] }}
 *   The transformed payloads plus a transient `_unifiedRegionSystems` field (the
 *   names of systems that had legacy regions) for the runner's GM notice. The
 *   field is stripped before persist by the runner.
 */
export function migrateUnifyGatheringRegions(data = {}) {
  const systems = Array.isArray(data?.systems) ? clone(data.systems) : [];
  const gatheringConfig = isPlainObject(data?.gatheringConfig) ? clone(data.gatheringConfig) : data?.gatheringConfig;
  const environments = Array.isArray(data?.environments) ? clone(data.environments) : [];

  const configSystems = isPlainObject(gatheringConfig?.systems) ? gatheringConfig.systems : {};
  const systemsById = new Map(systems.filter(isPlainObject).map(system => [String(system?.id ?? ''), system]));

  // Per crafting-system: the set of region ids known after derivation (existing +
  // newly derived), so environment mapping can tell a real region from an orphan.
  // Pre-seed from each system's existing `gatheringRegions` so an environment that
  // already cites a first-class region (a partially-migrated or re-imported
  // system whose vocab is gone) still maps instead of being treated as an orphan.
  const derivedRegionIdsBySystem = new Map();
  for (const [sysId, system] of systemsById) {
    const ids = new Set((Array.isArray(system?.gatheringRegions) ? system.gatheringRegions : [])
      .map(region => vocabId(region?.id)).filter(Boolean));
    derivedRegionIdsBySystem.set(sysId, ids);
  }
  const unifiedSystemNames = [];

  for (const [rawSysId, systemConfig] of Object.entries(configSystems)) {
    const sysId = String(rawSysId);
    if (!isPlainObject(systemConfig)) continue;
    const values = regionValuesFor(systemConfig);

    // Only touch the per-system vocabulary when it actually carried region
    // values. Clearing it to `{ values: [] }` then makes a re-run a no-op (an
    // already-empty/absent regions vocab is left untouched). Systems with no
    // region vocab keep their config byte-for-byte so idempotency holds and
    // unrelated configs are never rewritten.
    const hadRegionVocab = values.length > 0;
    if (hadRegionVocab) {
      systemConfig.vocabularies = isPlainObject(systemConfig.vocabularies) ? systemConfig.vocabularies : {};
      systemConfig.vocabularies.regions = { values: [] };
      // Track the systems that actually carried region data for the GM notice
      // (only when a crafting system exists to receive the derived regions).
      if (systemsById.has(sysId)) unifiedSystemNames.push(sysId);
    }

    const system = systemsById.get(sysId);
    if (!system) continue; // No crafting system to write regions onto; skip.

    const existingIds = derivedRegionIdsBySystem.get(sysId)
      || new Set((Array.isArray(system.gatheringRegions) ? system.gatheringRegions : [])
        .map(region => vocabId(region?.id)).filter(Boolean));
    derivedRegionIdsBySystem.set(sysId, existingIds);

    for (const rawEntry of values) {
      const entry = vocabularyEntry(rawEntry);
      if (!entry) continue;
      if (existingIds.has(entry.id)) continue; // id-dedupe → idempotent.
      existingIds.add(entry.id);
      // Lazily materialize the array only when there is a region to add, so a
      // system with no derivable regions is never mutated (idempotent + no
      // spurious persist of an empty `gatheringRegions: []`).
      if (!Array.isArray(system.gatheringRegions)) system.gatheringRegions = [];
      system.gatheringRegions.push({
        id: entry.id,
        craftingSystemId: sysId,
        name: entry.label || entry.id,
        enabled: true
      });
    }
  }

  // Resolve the GM-notice system names to display names where available.
  const unifiedRegionSystems = unifiedSystemNames.map(sysId => {
    const system = systemsById.get(sysId);
    const name = isPlainObject(system) ? String(system?.name ?? '').trim() : '';
    return name || sysId;
  });

  // Strip region/regions tags from gathering-config tasks and hazards (region is
  // no longer a composition axis).
  for (const systemConfig of Object.values(configSystems)) {
    if (!isPlainObject(systemConfig)) continue;
    for (const collectionKey of ['tasks', 'hazards']) {
      const collection = systemConfig[collectionKey];
      if (!Array.isArray(collection)) continue;
      for (const record of collection) {
        if (!isPlainObject(record)) continue;
        delete record.region;
        delete record.regions;
      }
    }
  }

  // Map each environment's legacy `region` onto `includedRegionIds`.
  for (const environment of environments) {
    if (!isPlainObject(environment)) continue;
    const regionId = vocabId(environment.region);
    if (!regionId) continue;
    const existingIncluded = Array.isArray(environment.includedRegionIds) ? environment.includedRegionIds : [];
    if (existingIncluded.length > 0) continue; // Already mapped → idempotent.

    const sysId = String(environment.craftingSystemId ?? '');
    const known = derivedRegionIdsBySystem.get(sysId);
    if (known && known.has(regionId)) {
      environment.includedRegionIds = [regionId];
    }
    // Orphan: no derived region with this id → leave includedRegionIds empty and
    // the inert `region` string in place (no stale reference, no data loss).
  }

  const result = { systems, gatheringConfig, environments };
  if (unifiedRegionSystems.length > 0) {
    result._unifiedRegionSystems = unifiedRegionSystems;
  }
  return result;
}
