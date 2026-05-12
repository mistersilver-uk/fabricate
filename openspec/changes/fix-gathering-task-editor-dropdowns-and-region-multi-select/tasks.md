## 1. Planning

- [x] Create OpenSpec proposal, design, and tasks documents.

## 2. Outside-Click Dismissal

- [x] Import `dismissOnOutsideClick` in `GatheringTaskEditView.svelte`.
- [x] Apply `use:dismissOnOutsideClick` to the biome/time-of-day/weather picker wrapper, gated on `openAvailabilityMenu === kind`.

## 3. Region Multi-Select In The Editor

- [x] Delete the native Region `<select>` block.
- [x] Insert a region picker block mirroring the biome/timeOfDay/weather template at the same position in the availability row, sharing the `openAvailabilityMenu` state.
- [x] Extend `conditionOptions`, `selectedConditionIds`, `availableConditionOptions`, `availabilityMenuLabel`, `availabilityFieldLabel`, `emptyAvailabilityLabel` to handle `kind === 'regions'`.
- [x] Remove the standalone `selectedRegionId` and `updateRegion` helpers.

## 4. Model Normalization And Matching

- [x] In `GatheringRichStateService.js`: switch task and hazard `region` normalization to `regions[]` with legacy `region` fallback.
- [x] In `GatheringRichStateService.js`: update `_recordMatchesEnvironment` to match `env.region` against `record.regions[]`.
- [x] In `adminStore.js`: mirror the same task and hazard normalization changes.
- [x] In `adminStore.js`: update the parallel env-match function.
- [x] In `adminStore.js`: update `_handleVocabularyRemoval` so the regions branch filters arrays for tasks and hazards (environment keeps scalar `region`).

## 5. Downstream View Sites

- [x] `CraftingSystemManagerV2Root.svelte`: env-match filter reads `task.regions[]`; task fact display renders joined labels or "Any region" when empty.
- [x] `GatheringTasksBrowserView.svelte`: env-match filter, region-filter membership check, and per-row chip read `task.regions[]`. Filter UI stays single-select.

## 6. Localization

- [x] Add `FABRICATE.Admin.ManagerV2.Environment.Tasks.AddRegionCondition` ("Add region").
- [x] Add `FABRICATE.Admin.ManagerV2.Environment.Tasks.AllRegionsSelected` ("All regions selected").

## 7. Tests

- [x] Migrate existing region-matching tests to `regions[]` semantics (`tests/stores/adminStore.test.js`, `tests/components/manager-v2-mounted.test.js`).
- [x] Read-time back-compat from legacy `region: 'x'` exercised by the existing duplicate-task and vocab-removal tests (input shape unchanged, output assertions updated to `regions[]`).
- [x] Add coverage for outside-click dismissal across all four pickers in the mounted task editor test.

## 8. Validation

- [x] `npm test` green (2456/2456).
- [x] `npm run build` green.
