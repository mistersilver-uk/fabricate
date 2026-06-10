# Tasks

## OpenSpec And Review

- [ ] Run plan-review with `fabricate_domain_expert`, `fabricate_ux_designer`, and `fabricate_quality_engineer`.
- [ ] Revise `proposal.md`, `design.md`, and spec deltas until every plan reviewer approves.

## Data Layer

- [ ] Add `enabled` (default `false`) to `gatheringRegionSettings`: coerce in `normalizeGatheringRegionSettings` (only explicit `true` enables), reject non-boolean in `validateGatheringRegionSettings`, add `enabled: false` to `DEFAULT_REGION_SETTINGS`.
- [ ] Add a shared `isGatheringRegionsEnabled(system)` helper in `gatheringRegions.js`.
- [ ] Drop the region axis from `evaluateEnvironmentMatch` (`gatheringMatch.js`): remove `recordRegionList`, `envRegion`, `evidence.region`, and region from `matches`; update the typedef/docstring (biome + danger only).
- [ ] Prune every `evidence.region` / region consumer across `src/ui` and `src/systems` (matching evidence chips, admin composition view model, listing evidence, task/hazard normalizers in `GatheringRichStateService` and `adminStore`).
- [ ] Keep `environment.includedRegionIds` as the region membership field; leave legacy `environment.region` inert (readable, not composition input).

## Migration

- [ ] Add `migrateUnifyGatheringRegions` (pure module) wired into `MigrationRunner`: derive `GatheringRegion` records from `vocabularies.regions`, map `environment.region` → `includedRegionIds`, strip task/hazard region tags, clear `vocabularies.regions`. Idempotent.
- [ ] Leave migrated systems' `gatheringRegionSettings.enabled` unset (normalizes to `false`); fire a one-time GM notice naming systems that had regions.

## Toggle Gating

- [ ] Engine: `GatheringEngine._locationBlockedReasons` early-returns the ungated `location` shape when disabled (neutralizes listing `location` and the start-attempt location guard).
- [ ] Resolver: `GatheringLocationService.resolveCurrentRegions` / `resolveForActor` / `buildCurrentRegionContext` fast-exit to unresolved-empty when disabled.
- [ ] Public API (`main.js`): `getGatheringLocationForActor`, `setGatheringPartyRegionOverride`, `clearGatheringPartyRegionOverride`, `revealGatheringRegionForActor`, `hideGatheringRegionForActor` no-op when disabled.

## UI

- [ ] Add an "Enable Travel & Regions" toggle card to the gathering settings tab bound to `gatheringRegionSettings.enabled`; new adminStore action `setGatheringRegionsEnabled`.
- [ ] Remove the legacy region vocabulary panel and the `regions` vocabulary dimension/actions (keep biomes); prune the dead region filter.
- [ ] Replace the single environment `region` `<select>` with a multi-region chip selector bound to `includedRegionIds` (options from `system.gatheringRegions`), gated on the toggle; wire `updateEnvironmentDraft` (add `includedRegionIds`, remove `region`).
- [ ] Expand the Travel region authoring surface (name, description, image, enabled, secret, biomes from the biome vocabulary); add `onUpdateRegion` → `GatheringRegionStore.update`.
- [ ] Hide the `travel` nav item when disabled; guard tab resolution and render branches so a stale `travel` tab falls back to `environments`.
- [ ] Localized strings, namespaced CSS, `services.confirmDialog` for destructive actions.

## Tests

- [ ] Unit: `gathering-match` (biome+danger only, no `evidence.region`); region-settings `enabled` defaults/validation; `gathering-region-store` `enabled` round-trip; NEW migration test (vocab→regions, env.region→includedRegionIds, tags stripped, vocab cleared, idempotent twice, enabled stays false); engine location gating off/on; resolver/availability fast-exit; environment-store `includedRegionIds` validation intact.
- [ ] Component: env editor multi-region selector (bound + hidden-when-disabled); expanded Travel region authoring; settings toggle flips `enabled`; region vocab panel gone; Travel nav hidden when disabled.
- [ ] Update smoke harness fixtures (`gatheringRegions` instead of region vocab; `includedRegionIds` on environments; `enabled: true` on travel systems); update the `manager-travel` screenshot recipe.

## Validation Gates

- [ ] Run `npm test` (total count rises).
- [ ] Run `npm run build`.
- [ ] UI-changing slice: screenshot planning → local Foundry smoke capture → publish → clean per `docs/agents/ui-pr-screenshots.md`.
- [ ] Run implementation review with reviewer, UX, and quality coverage.

## Docs Loop

- [ ] Update canonical specs (`gathering-and-harvesting`, `data-models`, `ui-integration`, `overview`): region is geography only; composition is biome + danger; `gatheringRegionSettings.enabled`; legacy region vocabulary removed; environment multi-region.
- [ ] Update `DOMAIN.md` (region = geography; composition axes).
- [ ] Update JSDoc and user docs (`docs/gathering-regions.md`) for the toggle, multi-region environments, and Travel region authoring.
