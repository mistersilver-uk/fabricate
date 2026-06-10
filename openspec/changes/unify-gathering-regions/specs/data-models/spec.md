# Data Models Spec Delta

## Modified Models

### GatheringRegionSettings

Add an `enabled` flag that gates the region/travel/availability subsystem per crafting system.

```js
GatheringRegionSettings = {
  enabled: boolean,            // gates the whole region/travel subsystem
  revealMode: "manual" | "onPartyTokenEntry" | "alwaysVisible",
  modifierVisibility: "visible" | "gmOnly",
}
```

Requirements:

1. `enabled` defaults to `false`. Only an explicit boolean `true` enables; any other value (including missing) normalizes to `false`.
2. Non-boolean `enabled` is invalid at save/import boundaries and coerces to `false` when read from existing data.
3. A shared predicate (`isGatheringRegionsEnabled(system)`) is the single source of truth for the flag and is read by every region/travel/availability gate.

### GatheringEnvironment

`includedRegionIds` is the canonical region-membership field (an array of `GatheringRegion` ids) and supports membership in multiple regions.

Requirements:

1. `includedRegionIds` entries must reference a `GatheringRegion` in the same crafting system when validation runs with complete system context.
2. The legacy single `region` string remains readable for back-compat but is no longer a composition input and is not surfaced in the environment editor.
3. Region membership (`includedRegionIds`) participates in **location availability only**, never in task/hazard composition matching.

### Gathering Task / Gathering Hazard

Region tags are removed from tasks and hazards.

Requirements:

1. Tasks and hazards no longer carry `region` / `regions` fields for composition. Normalizers strip them.
2. Composition matching uses biome (and, for hazards, danger) only.

## Removed Models

### Region Vocabulary

The per-system region vocabulary (`gatheringConfig.systems[systemId].vocabularies.regions`) is removed. The biome vocabulary is unchanged.

Requirements:

1. The `regions` vocabulary dimension, its editor, and its store actions are removed.
2. A migration converts existing region-vocabulary entries into `GatheringRegion` records before clearing the vocabulary (see `gathering-and-harvesting` delta).

## Migration

A versioned, idempotent migration:

1. Correlates `gatheringConfig.systems[sysId].vocabularies.regions`, crafting `systems[sysId]`, and environments by crafting-system id.
2. Derives a `GatheringRegion` (`{ id, name: label || id, enabled: true }`) for each legacy region-vocabulary entry not already present on the system's `gatheringRegions[]` (distinct ids with duplicate labels → distinct regions; a config system id with no matching crafting system is skipped).
3. Maps each environment's non-empty legacy `region` to `includedRegionIds` when `includedRegionIds` is empty AND a derived region with that id exists. Orphan fallback: an `environment.region` with no matching derived region leaves `includedRegionIds` empty and the inert `region` string in place (no stale reference, no data loss).
4. Strips `region` / `regions` from gathering-config tasks and hazards.
5. Clears each system's region vocabulary.
6. Leaves `gatheringRegionSettings.enabled` unset (normalizes to `false`) and emits a one-time GM notice (runner transient-field pattern) naming affected systems and warning that region-scoped records may now appear in more environments.

Requirements:

1. The migration is idempotent: re-running it makes no further changes (id-dedupe, empty-`includedRegionIds` guard, orphan-leave-inert, cleared vocabulary).
2. It runs at a higher version than the 0.2.0 `migrateGatheringConfig` (which preserves per-system region vocab); that preservation assertion is superseded here.
3. Imports do not re-run the migration; pre-unification imports upgrade on the next startup.
