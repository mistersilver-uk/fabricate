# Gathering And Harvesting Spec Delta

## Modified Requirements

### Environment Composition Matching

Composition matching no longer uses region. A reusable library task or hazard matches an environment by **biome (and, for hazards, danger)** only.

Requirements:

1. Automatic composition matches records to environments by biome intersection (and danger for hazards). Region is NOT a composition axis.
2. `GatheringRegion` membership (`environment.includedRegionIds`) affects **location availability only**, never composition.
3. Match evidence no longer includes a region dimension; only biome and danger evidence are produced.
4. Weather and time of day remain runtime gates (unchanged); matching is decided by biome / danger only.

### Region Is Geography Only

`GatheringRegion` is the single region concept and is geography.

Requirements:

1. Regions drive location availability, current-region resolution, travel, and discovery.
2. Regions do not own tasks, hazards, drops, or composition.
3. Environments may belong to multiple regions via `includedRegionIds`.

### Per-System Travel & Regions Toggle

Each crafting system has an `enabled` flag (`gatheringRegionSettings.enabled`, default `false`) that gates the region/travel subsystem.

Requirements:

1. When disabled, no environment is location-gated: availability evaluation, current-region resolution, and travel guidance MUST NOT run, and the engine MUST NOT emit location evidence.
2. When disabled, party current-region overrides, region discovery reveal/hide, and the location API MUST be inert (no-op / null / false).
3. When disabled, composition (biome + danger) is unaffected and gathering otherwise behaves as a non-location-aware system.
4. The flag is read through a single shared predicate so every gate is consistent.

### Migration From Legacy Region Vocabulary

Requirements:

1. A versioned, idempotent migration derives `GatheringRegion` records from the legacy region vocabulary (correlated by crafting-system id), maps `environment.region` → `includedRegionIds` (orphan free-text region left inert), strips task/hazard region tags, and clears the region vocabulary.
2. Migrated systems remain disabled by default; a one-time GM notice names systems that had regions and warns that region-scoped tasks/hazards may now appear in more environments (an empty-biome record that was narrowed only by region now matches any biome).
3. Re-running the migration makes no further changes; imports upgrade on next startup.

## Testing Requirements

- Unit tests that composition matching uses biome + danger only and produces no region evidence.
- Unit tests for `gatheringRegionSettings.enabled` defaults, save-boundary rejection of non-boolean, and read coercion.
- Unit tests that the engine does not location-gate, the resolver returns unresolved, and the location API no-ops when disabled; and that all behave normally when enabled.
- Unit tests for the migration: vocabulary → regions, `environment.region` → `includedRegionIds`, task/hazard region tags stripped, vocabulary cleared, `enabled` stays false, idempotent across two runs.
