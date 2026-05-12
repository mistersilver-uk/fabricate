# Design

## Data Shape

Both reusable gathering tasks and gathering hazards change:

- Before: `region: string`
- After: `regions: string[]`

Normalizers in `src/systems/GatheringRichStateService.js` (`_normalizeGatheringConfig` task and hazard branches) and `src/ui/svelte/stores/adminStore.js` (the parallel admin-side normalize) accept either shape on read and emit only `regions: string[]` on write. Legacy `region: 'forest'` becomes `regions: ['forest']`; an existing `regions[]` is kept verbatim through the existing tag list normalizer.

## Matching Semantics

A task or hazard with an empty `regions[]` is treated as "any region" — it matches every environment. A non-empty `regions[]` matches an environment when the environment's scalar `region` value appears in the record's `regions[]`. This mirrors how `biomes[]` already works in both matchers (`_recordMatchesEnvironment` in `GatheringRichStateService.js` and the parallel matcher in `adminStore.js`).

## UI

The task editor's Region field becomes the leftmost cell in the existing `manager-v2-task-availability-row`, rendered with the same picker block (`manager-v2-availability-picker` + `manager-v2-availability-menu-button` + `manager-v2-availability-menu` + `manager-v2-availability-pill`) used for biomes, time of day, and weather. The shared `openAvailabilityMenu` state extends to include `'region'`, so opening any one picker still closes the others.

All four picker wrappers receive a `use:dismissOnOutsideClick` directive that calls back when the menu is open and either the user clicks outside the wrapper or presses Escape. The action lives at `src/ui/svelte/actions/dismissOnOutsideClick.js` and is the same one already wired into `IconPicker`, `ManagerV2ColorPicker`, and other Manager V2 pickers.

The kind-aware helpers in `GatheringTaskEditView.svelte` (`conditionOptions`, `selectedConditionIds`, `availableConditionOptions`, `availabilityMenuLabel`, `availabilityFieldLabel`, `emptyAvailabilityLabel`, `addAvailability`, `removeAvailability`) extend to handle `kind === 'region'` so the new picker reuses the existing add/remove/pill machinery without parallel code. The standalone `selectedRegionId` / `updateRegion` helpers are removed.

## Downstream Reads

Three sites currently read `task.region` and need to switch to `task.regions[]`:

- `CraftingSystemManagerV2Root.svelte` — env-match filter and the task details fact display.
- `GatheringTasksBrowserView.svelte` — env-match filter and the per-row Region chip cell.

The single-select Region **filter** in the browser stays as a native `<select>`; only its read of `task.regions` updates (filter passes when the chosen region is included in the task's regions, or always when the filter is "all").

## Vocabulary Removal

`_handleVocabularyRemoval` in `adminStore.js` already strips a removed region id from both `task.region` and `hazard.region` scalar fields. After this change, it filters the value out of `regions[]` arrays for tasks and hazards.

## Out Of Scope

- Environments retain `region: string` (one location property).
- The browser's Region filter UI stays single-select.
- No persisted one-shot migration step; back-compat is read-time only.
