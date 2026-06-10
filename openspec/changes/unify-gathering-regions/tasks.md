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

- [ ] Add `migrateUnifyGatheringRegions` (pure module) wired into `MigrationRunner` at a higher version than the 0.2.0 `migrateGatheringConfig`: correlate `gatheringConfig.systems[sysId].vocabularies.regions` ↔ crafting `systems[sysId]` ↔ environments by crafting-system id; derive `GatheringRegion` records (id-dedupe; distinct ids with duplicate labels → distinct regions; skip config system ids with no matching crafting system); map `environment.region` → `includedRegionIds` with the orphan fallback (no matching derived region → leave `includedRegionIds` empty + `region` inert); strip task/hazard region tags; clear per-system `vocabularies.regions`. Idempotent.
- [ ] Leave migrated systems' `gatheringRegionSettings.enabled` unset (normalizes to `false`); fire a one-time GM notice (runner transient-field pattern, stripped before persist) naming systems that had regions and warning region-scoped records may now appear in more environments.
- [ ] Reconcile with the 0.2.0 migration's intentional per-system region-vocab preservation (update `tests/migrate-gathering-config.test.js` and `tests/stores/adminStore.test.js` assertions in lockstep).

## Toggle Gating

- [ ] Engine: `GatheringEngine._locationBlockedReasons` early-returns the ungated `location` shape when disabled (neutralizes listing `location` and the start-attempt location guard).
- [ ] Resolver: `GatheringLocationService.resolveCurrentRegions` / `resolveForActor` / `buildCurrentRegionContext` fast-exit to unresolved-empty when disabled.
- [ ] Public API (`main.js`): `getGatheringLocationForActor`, `setGatheringPartyRegionOverride`, `clearGatheringPartyRegionOverride`, `revealGatheringRegionForActor`, `hideGatheringRegionForActor` no-op when disabled.

## UI

- [ ] Add an "Enable Travel & Regions" toggle card to the gathering settings tab bound to `gatheringRegionSettings.enabled` (mirror the condition-panel `aria-pressed` toggle), with hint copy naming where Travel lives; new adminStore action `setGatheringRegionsEnabled`. Pass current value from `CraftingSystemManagerRoot` via `regionStore.getRegionSettings(systemId)`.
- [ ] Remove ALL legacy region UI (now inert): the settings vocabulary `regions` panel + the `regions` dimension/actions in `adminStore` (keep biomes); the region picker in `GatheringTaskEditView` and `GatheringHazardEditView` (+ prop pass-throughs in `CraftingSystemManagerRoot`); the region filter + row chips in `GatheringTasksBrowserView` and `GatheringHazardsBrowserView`; the legacy `environment.region` filter in `EnvironmentsBrowserView`. Confirm no env-row/list label reads `environment.region`.
- [ ] Prune composition `evidence.region` consumers (`MatchingEvidenceChips.svelte`, browsers, `CraftingSystemManagerRoot` inspector evidence, admin composition view model) — do NOT touch the unrelated travel `evidence.regions`.
- [ ] Replace the single environment `region` `<select>` (`EnvironmentOverviewTab`) with a multi-region chip selector bound to `includedRegionIds` (options from `system.gatheringRegions`), gated on the toggle, with an empty-state hint pointing to Travel when no regions exist; wire `updateEnvironmentDraft` (add `includedRegionIds`, remove `region`); plumb `regionRecords` from `CraftingSystemManagerRoot` via `regionStore.listBySystem`.
- [ ] Expand the Travel region authoring surface to a region list + detail layout (name, description, image, enabled, secret, biomes from the biome vocabulary): widen `selectedSystemRegions` projection to carry description/img/biomes; thread biome-vocabulary options into the Travel view; add `onUpdateRegion` → `GatheringRegionStore.update`; route region delete through `services.confirmDialog` with referenced-by evidence (behavior change from the immediate-delete quick list). Namespaced `.manager-travel-region-*` CSS.
- [ ] Hide the `travel` nav item when disabled by filtering `gatheringNavItems`, and ensure `selectGatheringTab`/`openGatheringSection` validate against the filtered list so a stale `travel` tab falls back to `environments`.
- [ ] Localized strings, namespaced CSS, `services.confirmDialog` for destructive actions.

## Tests

- [ ] Unit `gathering-match` — biome+danger drive `matches`; no `evidence.region`; rename the "region/biome/danger mismatch" case; update existing region assertions.
- [ ] Unit region settings — `enabled` defaults `false`, returned shape includes `enabled`, non-boolean rejected at save AND coerced on read.
- [ ] Unit `gathering-region-store` — `updateRegionSettings({enabled})` round-trip AND export/import round-trip through `_normalizeSystem`.
- [ ] NEW `tests/migrate-unify-gathering-regions.test.js` (top-level, globbed dir) — vocab→regions; env.region→includedRegionIds; task/hazard tags stripped; vocab cleared; enabled stays false; idempotent twice; PLUS edge cases: orphan `environment.region` (no derived region → empty includedRegionIds, region inert), duplicate vocabulary labels, partially-migrated system, config system id with no matching crafting system, GM-notice names surfaced + transient field not persisted, re-import of pre-unification data upgrades on next run.
- [ ] Unit composition-outcome — a formerly region-only (empty-biome) task composes into more environments after migration (broaden direction).
- [ ] Unit engine location gating — disabled ⇒ gated env not blocked, `location.gated===false`, start-attempt guard skipped; enabled ⇒ existing behavior (extend `tests/gathering-engine-location-gating.test.js`).
- [ ] Unit resolver — `resolveCurrentRegions`/`resolveForActor`/`buildCurrentRegionContext` each fast-exit when disabled; `main.js` location API methods no-op when disabled.
- [ ] Update existing tests in lockstep: `tests/gathering-rich-library.test.js`, `tests/gathering-engine-listing.test.js` (hazard.regions), `tests/migrate-gathering-config.test.js` + `tests/stores/adminStore.test.js` (per-system region-vocab now cleared), `tests/components/environment-editor.test.js` (RegionHint/CheckRegion), `tests/components/gathering-task-browser-redesign.test.js` (regionChips), `tests/helpers/gathering.js`.
- [ ] Component: env editor multi-region selector (bound + hidden-when-disabled + empty-state hint); expanded Travel region authoring (description/img/secret/biomes, delete-confirm); settings toggle flips `enabled` with aria-pressed; region vocab panel + task/hazard region pickers/filters gone; Travel nav hidden when disabled.
- [ ] Update smoke harness fixtures (`scripts/foundry-test-run.mjs`): replace the two `vocabularies.regions` seed sites (~:928/2071) with `gatheringRegions`; drop `region:` from the ~15 task/environment seed sites; set `includedRegionIds` on affected environments; set `gatheringRegionSettings.enabled: true` on travel systems BEFORE the manager `.show()` (~:2400) so the Travel nav is visible for the capture step. Update the `manager-travel` screenshot recipe.

## Validation Gates

- [ ] Run `npm test` (total count rises).
- [ ] Run `npm run build`.
- [ ] UI-changing slice: screenshot planning → local Foundry smoke capture → publish → clean per `docs/agents/ui-pr-screenshots.md`.
- [ ] Run implementation review with reviewer, UX, and quality coverage.

## Docs Loop

- [ ] Update canonical specs (`gathering-and-harvesting`, `data-models`, `ui-integration`, `overview`): region is geography only; composition is biome + danger; `gatheringRegionSettings.enabled`; legacy region vocabulary removed; environment multi-region.
- [ ] Update `DOMAIN.md` (region = geography; composition axes).
- [ ] Update JSDoc and user docs (`docs/gathering-regions.md`) for the toggle, multi-region environments, and Travel region authoring.
