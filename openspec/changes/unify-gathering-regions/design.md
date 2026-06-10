# Design: Unify Gathering Regions

## Concept Boundary

- **Region** (`GatheringRegion`) answers "where is this — and where is the party?" It is geography. It drives location availability, current-region resolution, travel, and discovery. It is NOT a composition axis.
- **Biome** answers "what terrain/ecology is here?" It is a composition axis (which tasks/hazards belong) and the source of a region's terrain traits.
- **Danger** answers "how dangerous?" It is a composition axis for hazards.
- **Environment** answers "what gathering activity is available?" It declares which regions it belongs to and which biomes/danger it matches.

The legacy region vocabulary conflated geography with composition tagging. This change removes that conflation: composition uses biome + danger; geography uses `GatheringRegion`.

## Composition Change

`evaluateEnvironmentMatch` (`src/systems/gatheringMatch.js`) currently matches on region + biome + danger. Region is removed:

- A task/hazard composes into an environment when their biomes intersect (and, for hazards, danger), exactly as today minus the region axis.
- The `region` axis, `recordRegionList`, `envRegion`, and `evidence.region` are removed. Every consumer of `evidence.region` (matching evidence chips, the admin composition view model, listing evidence) is pruned.
- Task/hazard normalizers stop reading `region`/`regions`.

Worlds that relied on region-tag composition will compose by biome/danger after migration. This is an intentional, version-gated behavior change (see Migration).

## Region Settings: Enable Flag

`gatheringRegionSettings` (`src/systems/gatheringRegions.js`) gains an `enabled` boolean:

```js
GatheringRegionSettings = {
  enabled: boolean,            // default false — gates the whole region/travel subsystem
  revealMode: "manual" | "onPartyTokenEntry" | "alwaysVisible",
  modifierVisibility: "visible" | "gmOnly",
}
```

- Default `false`. Only an explicit `true` enables; non-boolean is invalid at save/import and coerces to `false` on read.
- A shared `isGatheringRegionsEnabled(system)` helper is the single source of truth every gate reads.
- Homed on `gatheringRegionSettings` (not `system.features`) because the region store already owns the normalize/validate/persist boundary for region behavior and `updateRegionSettings` is the existing write path; this keeps reveal/modifier/enabled coherent and round-trips through `_normalizeSystem` for export/import.

## Toggle Gating

When `isGatheringRegionsEnabled(system)` is false, the system behaves as if no environment is location-gated and no travel surfaces exist. Gate points:

- **Engine (central choke point):** `GatheringEngine._locationBlockedReasons` early-returns the ungated `location` shape when disabled, before the `environmentHasLocationRules` check. `system` is in scope at all callers (`startAttempt`, `_environmentBlockedReasons`, and the method param). This also neutralizes the listing `location` field.
- **Resolver:** `GatheringLocationService.resolveCurrentRegions` / `resolveForActor` / `buildCurrentRegionContext` fast-exit to the unresolved-empty shape (the service reads the system via its `systemManager`).
- **Public API (`src/main.js`):** `getGatheringLocationForActor` → `null`; `setGatheringPartyRegionOverride` / `clearGatheringPartyRegionOverride` → `null`; `revealGatheringRegionForActor` / `hideGatheringRegionForActor` → `false` (this also gates discovery writes).
- **Manager UI:** the `travel` nav item is hidden; the environment editor hides region selectors.
- **Player UI:** no current-region surface exists yet; when one is built it must gate on the flag. Today the suppressed engine `location` field is sufficient.

This mirrors the existing `system.features?.gathering` gating precedent.

## Environment Multi-Region

`environment.includedRegionIds` (already present, normalized) becomes the editor-surfaced region membership — a multi-select chip control mirroring the biome selector, sourced from `system.gatheringRegions`. The legacy single `environment.region` string is left readable but inert (no longer composition input, not surfaced in the editor). `excludedRegionIds` and the biome-availability fields remain available but the editor surfaces `includedRegionIds` as the primary region control in this change.

## Region Authoring In Travel

Region CRUD moves entirely into the Travel tab. The `GatheringRegionQuickList` (name + enabled only) grows into the canonical region authoring surface: name, description, image, enabled, secret, and biomes (chosen from the system biome vocabulary). The legacy region vocabulary editor (in the gathering settings/vocabulary area) is removed, and the `regions` dimension is removed from the shared vocabulary helpers. The biome vocabulary stays.

## Migration

A versioned, idempotent migration runs through the existing migration runner (which has systems, gathering config, and environments in scope in one pass):

1. For each system, append a `GatheringRegion` (`{ id, name: label || id, enabled: true }`) for each legacy `vocabularies.regions.values` entry not already present on `gatheringRegions[]` (id-dedupe → idempotent).
2. For each environment with a non-empty legacy `region` and empty `includedRegionIds`, set `includedRegionIds = [matchingRegionId]`. Leave the legacy `region` value inert.
3. Strip `region` / `regions` from gathering-config tasks and hazards.
4. Clear `vocabularies.regions` to `{ values: [] }` after deriving.
5. Leave `gatheringRegionSettings.enabled` unset → normalizes to `false`. Fire a one-time GM notice naming systems that had regions, so the GM knows to re-enable.

Idempotency: id-dedupe on regions, the empty-`includedRegionIds` guard, and the cleared vocabulary mean a second run is a no-op.

Import/export: regions and region settings round-trip through `_normalizeSystem`. Imports do not re-run the migration, so a pre-unification export imported later carries legacy data and is upgraded idempotently on the next startup. Document "import upgrades on next load."

## Risks

- **Composition behavior change**: dropping region as a composition axis changes which tasks auto-populate environments that previously relied on region tags. Mitigated by biome migration guidance and the version gate.
- **Default-disabled hides Travel** for current feature users. Mitigated by the one-time GM notice.
- **Stray `evidence.region` consumers**: grep `src/ui` + `src/systems` and prune all.
