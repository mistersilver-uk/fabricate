# Design: Manager V2 Hazard Library

## Data Model

No data model change. Hazards are persisted as `gatheringConfig.systems[systemId].hazards` and normalized by `_normalizeGatheringHazard` in `src/ui/svelte/stores/adminStore.js` (around line 628). Editor and browser code reads/writes through the existing adminStore actions and the field shape declared in `openspec/specs/gathering-and-harvesting/spec.md` § "Reusable Gathering Hazard Library".

## Store Surface

All required actions already exist on adminStore:

- `addGatheringLibraryHazard(systemId, hazard)` — creates and returns the normalized hazard.
- `updateGatheringLibraryHazard(systemId, hazardId, patch)` — patches via `_normalizeGatheringHazard`.
- `deleteGatheringLibraryHazard(systemId, hazardId)` — runs `_confirmGatheringLibraryRecordDelete({ kind: 'hazard' })` so the existing confirmation dialog surfaces every referencing environment via `enabledHazardIds`.
- `_gatheringLibraryRecordUsages(systemId, record, kind: 'hazard')` — returns the environments where a hazard is referenced.

This change **adds one action**: `duplicateGatheringLibraryHazard(systemId, hazardId)`. It mirrors the corresponding task duplicate helper: deep-clone the source record, regenerate the id via the shared randomID helper, append a localised "(copy)" suffix to the name, re-normalize through `_normalizeGatheringHazard`, persist into the system's `hazards` array, and return the new record. No other store wiring is needed.

## UI

Two new Svelte 5 components mirror the existing tasks library:

- `src/ui/svelte/apps/manager/GatheringHazardsBrowserView.svelte`
  - Props: `hazards`, `environments`, `selectedSystemId`, `selectedHazardId`, `gatheringConfig`, plus callbacks `onSelectHazard`, `onCreateHazard`, `onEditHazard`, `onDuplicateHazard`, `onDeleteHazard`, `onToggleHazardEnabled`, `panelId`, `labelledBy`.
  - Toolbar filters: search, status (on/off), region, biome, dangerTag.
  - Table columns: status toggle, image+name, description preview, dangerTag pills, dropRate %, environment usage count, action group (edit / duplicate / delete).
  - Pagination at 10 rows per page like the task browser.
- `src/ui/svelte/apps/manager/GatheringHazardEditView.svelte`
  - Props: `hazard`, `systemId`, `regionOptions`, `biomeOptions`, `weatherOptions`, `timeOfDayOptions`, `characterModifierLibrary`, plus callback `onUpdateHazard`.
  - Sections: Identity (img picker, name, description, enabled toggle); Availability (regions/biomes/weather/timeOfDay pill multi-select); DangerTags (chip editor with `safe`, `hazardous`, `dangerous`, `deadly` seeded as suggestions); DropRate (number input clamped 1-100); Hazard modifier (provider/expression/macro fields via `ProviderExpressionInput.svelte`); Character modifiers (list, each with provider+expression+macroUuid+`+`/`-` operator+optional min/max bounds, reusing the same `ProviderExpressionInput`).
  - Local validation: name required; dropRate within 1-100; dangerTags must not be reserved failure keywords (per `openspec/specs/gathering-and-harvesting/spec.md` § 442).

Tab wiring in `src/ui/svelte/apps/manager/EnvironmentsBrowserView.svelte`:

- Keep `id: 'encounters'` so any persisted nav-tab state stays valid.
- Rename `EncountersPlaceholderTitle` / `EncountersPlaceholderHint` localisation keys to non-placeholder equivalents (`EncountersTitle`, `EncountersHint`).
- Render `GatheringHazardsBrowserView` when `activeGatheringTab === 'encounters'` — same conditional pattern as the existing tasks block (around lines 787-802).
- Mount `GatheringHazardEditView` conditionally for a `selectedHazardId`, mirroring how `GatheringTaskEditView` is mounted today.

## Localization

New keys live under `FABRICATE.Admin.Manager.GatheringHazards.*`, mirroring the existing `FABRICATE.Admin.Manager.GatheringTasks.*` namespace. Required keys: `Filters`, `SearchPlaceholder`, `Create`, `Edit`, `Delete`, `Duplicate`, `StatusOn`, `StatusOff`, `Name`, `DangerTags`, `DropRate`, `Environments`, `Empty`, plus editor section labels (`Identity`, `Availability`, `Modifiers`, `CharacterModifiers`, `HazardModifier`). The placeholder keys `FABRICATE.Admin.Manager.Environment.GatheringTabs.EncountersPlaceholderTitle` / `EncountersPlaceholderHint` are renamed to `EncountersTitle` / `EncountersHint`. The existing `NewLibraryHazard` and `ReusableHazards` keys are reused.

## CSS

New selectors mirror the task panel layout in `styles/fabricate.css`:

- `.manager-gathering-panel-hazards`
- `.manager-gathering-hazards-table`
- `.manager-gathering-hazard-row`
- `.manager-gathering-hazard-identity`

Shared selectors (`.manager-status-toggle`, `.manager-action-group`, `.manager-chip-row`, `.manager-availability-pill`) are reused; no duplication. A `.manager-danger-tag-pill` variant is added if dangerTag chips need distinct accent colour treatment.

## Tests

- `tests/stores/adminStore.test.js` — extend with cases for `duplicateGatheringLibraryHazard` (new id, full normalization round-trip, "(copy)" suffix). Verify `_gatheringLibraryRecordUsages` returns expected environment references for `kind: 'hazard'`.
- `tests/components/gathering-hazards-browser.test.js` (new) — happy-dom mount; assert rows, filter+search updates, deletion-confirmation surfaces usage list, action callbacks fire with expected payloads.
- `tests/components/gathering-hazard-editor.test.js` (new) — happy-dom mount; assert section render, dropRate clamps, save dispatches the updated record, validation blocks save on empty name.
- `tests/components/manager-mounted.test.js` — extend the compile/mount list to include the new hazard views.

## Risks

1. Svelte 5 runes only. The new components use `$state`, `$derived`, `$effect`; no Svelte 4 stores. Mirror the task browser/editor reactivity.
2. Foundry globals (`game`, `ui`, `Hooks`, `CONFIG`) stay at the existing thin edges. No new imports of them in the hazard components — localisation reuses the existing `localize` helper threaded through the manager root.
3. Tab id `encounters` must not change; renaming would invalidate any persisted nav state. Only the labels and the body change in this slice.
4. Environment-level hazard attach UI is intentionally absent. Anyone reviewing should not expect environment rows to display reusable hazard chips yet — that work is tracked separately and uses the same `enabledHazardIds` / `disabledHazardIds` store wiring already in place.
