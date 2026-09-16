/**
 * `0.9.0` — collapse the two historical "region" notions into the first-class `GatheringRegion`,
 * mapping each environment's legacy `region` onto `includedRegionIds` and clearing the per-system
 * vocabulary. `gatheringRegionSettings.enabled` is LEFT UNSET, so a migrated system keeps the
 * subsystem opt-in and the runner's notice warns that region-scoped records may now appear in MORE
 * environments. Pure, deep-cloning and idempotent; it runs above `0.2.0`, whose vocabulary it reads.
 */

import { isPlainObject, clone } from './migrationHelpers.js';

/**
 * Normalize an id to the gathering vocabulary's own model, so a derived region id, an
 * `environment.region` string and a stripped task tag all collapse to the same key.
 */
function vocabId(value) {
  if (value && typeof value === 'object') {
    return vocabId(value.id ?? value.value ?? value.label);
  }
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

/** `{ id, label }` from one vocabulary entry — a bare string or a record; null with no usable id. */
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
 * Run the unification over the runner's bundle, plus a transient `_unifiedRegionSystems` field
 * naming the systems that had legacy regions, which the runner strips before persisting.
 */
export function migrateUnifyGatheringRegions(data = {}) {
  const systems = Array.isArray(data?.systems) ? clone(data.systems) : [];
  const gatheringConfig = isPlainObject(data?.gatheringConfig)
    ? clone(data.gatheringConfig)
    : data?.gatheringConfig;
  const environments = Array.isArray(data?.environments) ? clone(data.environments) : [];

  const configSystems = isPlainObject(gatheringConfig?.systems) ? gatheringConfig.systems : {};
  const systemsById = new Map(
    systems.filter(isPlainObject).map((system) => [String(system?.id ?? ''), system])
  );

  // The region ids known after derivation, per system, so environment mapping tells a real region
  // from an orphan. Pre-seeded from existing `gatheringRegions` so an environment citing a
  // first-class region on a partially-migrated system still maps.
  const derivedRegionIdsBySystem = new Map();
  for (const [sysId, system] of systemsById) {
    const ids = new Set(
      (Array.isArray(system?.gatheringRegions) ? system.gatheringRegions : [])
        .map((region) => vocabId(region?.id))
        .filter(Boolean)
    );
    derivedRegionIdsBySystem.set(sysId, ids);
  }
  const unifiedSystemNames = [];

  for (const [rawSysId, systemConfig] of Object.entries(configSystems)) {
    const sysId = String(rawSysId);
    if (!isPlainObject(systemConfig)) continue;
    const values = regionValuesFor(systemConfig);

    // Only touch a vocabulary that actually carried region values, so a system with none keeps its
    // config byte-for-byte and idempotence holds.
    const hadRegionVocab = values.length > 0;
    if (hadRegionVocab) {
      systemConfig.vocabularies = isPlainObject(systemConfig.vocabularies)
        ? systemConfig.vocabularies
        : {};
      systemConfig.vocabularies.regions = { values: [] };
      // Only when a crafting system exists to receive the derived regions.
      if (systemsById.has(sysId)) unifiedSystemNames.push(sysId);
    }

    const system = systemsById.get(sysId);
    if (!system) continue; // No crafting system to write regions onto; skip.

    const existingIds =
      derivedRegionIdsBySystem.get(sysId) ||
      new Set(
        (Array.isArray(system.gatheringRegions) ? system.gatheringRegions : [])
          .map((region) => vocabId(region?.id))
          .filter(Boolean)
      );
    derivedRegionIdsBySystem.set(sysId, existingIds);

    for (const rawEntry of values) {
      const entry = vocabularyEntry(rawEntry);
      if (!entry) continue;
      if (existingIds.has(entry.id)) continue; // id-dedupe → idempotent.
      existingIds.add(entry.id);
      // Lazily materialized, so a system with no derivable regions is never mutated.
      if (!Array.isArray(system.gatheringRegions)) system.gatheringRegions = [];
      system.gatheringRegions.push({
        id: entry.id,
        craftingSystemId: sysId,
        name: entry.label || entry.id,
        enabled: true,
      });
    }
  }

  // Resolve the GM-notice system names to display names where available.
  const unifiedRegionSystems = unifiedSystemNames.map((sysId) => {
    const system = systemsById.get(sysId);
    const name = isPlainObject(system) ? String(system?.name ?? '').trim() : '';
    return name || sysId;
  });

  // Region is no longer a composition axis, so its tags go.
  for (const systemConfig of Object.values(configSystems)) {
    if (!isPlainObject(systemConfig)) continue;
    for (const collectionKey of ['tasks', 'events']) {
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
    const existingIncluded = Array.isArray(environment.includedRegionIds)
      ? environment.includedRegionIds
      : [];
    if (existingIncluded.length > 0) continue; // Already mapped → idempotent.

    const sysId = String(environment.craftingSystemId ?? '');
    const known = derivedRegionIdsBySystem.get(sysId);
    if (known && known.has(regionId)) {
      environment.includedRegionIds = [regionId];
    }
    // Orphan: leave `includedRegionIds` empty and the inert `region` string in place — no stale
    // reference, no data loss.
  }

  const result = { systems, gatheringConfig, environments };
  if (unifiedRegionSystems.length > 0) {
    result._unifiedRegionSystems = unifiedRegionSystems;
  }
  return result;
}
