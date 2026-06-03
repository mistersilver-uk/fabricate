# Design: Gathering Environment Composition Editor

## Data Model (minimal extension)

Environments are persisted in world setting `fabricate.gatheringEnvironments` and normalized/validated by `GatheringEnvironmentStore` (`src/systems/GatheringEnvironmentStore.js`). They already carry `enabledTaskIds` / `disabledTaskIds` / `enabledHazardIds` / `disabledHazardIds`, `selectionMode` (`targeted` | `blind`), `region`, `biomes`, canonical `dangerLevel` with legacy `dangerTags`/`risk` fallback, condition context, `sceneUuid`, `enabled`, and optional inline `tasks[]`.

Add to `_normalizeEnvironment()` and `_validateEnvironment()`:

- `compositionMode: 'automatic' | 'manual'` — default `'automatic'`; validated against `VALID_COMPOSITION_MODES` (mirror `VALID_SELECTION_MODES`). Shared across tasks and hazards in Phase 1.
- `taskOrder: string[]`, `hazardOrder: string[]` — ordered record IDs, normalized to deduped string arrays. They overlay drag order on the composed set; records absent from the array fall back to library order then name.
- `forcedTaskIds: string[]`, `forcedHazardIds: string[]` — manual-mode GM force-add overrides, normalized to deduped string arrays. They are ignored in automatic mode. Forced manual records are cleared when removed from the included list without creating a local exclusion.

No per-record override fields are added in this change (see Phase 2 in the proposal).

### Composition semantics

`compositionMode` disambiguates today's ambiguous empty-list case (empty `enabledTaskIds` currently means "all matching" but cannot represent "manual, include none"):

- **automatic** — include every matching, library-enabled record **except** IDs in `disabled*Ids`.
- **manual** — include IDs in `enabled*Ids` that still match and are library-enabled, plus enabled IDs in `forced*Ids` even when they do not match. A normal manual-included ID whose record no longer matches resolves to `includedButUnavailable` (not Available); a forced non-matching ID resolves to `forceIncluded` and is Available until removed from the force list. Manual removal clears `enabled*Ids` / `forced*Ids` and does not add `disabled*Ids`; stale manual `disabled*Ids` are ignored.

Automatic composition can use matching reusable library tasks as the environment's gatherable records and does not require a legacy inline placeholder Environment Task. Inline placeholder tasks remain a legacy draft-authoring fallback only.

## Domain / Service

`src/systems/GatheringRichStateService.js`:

- Extract the boolean-only `_recordMatchesEnvironment` (`:748`) into a shared pure helper. New module `src/systems/gatheringMatch.js` exports `evaluateEnvironmentMatch(record, environment, conditions, { includeDanger, conditionSettings })` → `{ matches: boolean, evidence: { region, biome, danger, weather, time } }`, where region/biome/danger evidence determines composition matching and weather/time evidence reports runtime condition gates. `_recordMatchesEnvironment` becomes a thin wrapper returning `evidence.matches`. This removes the current duplication between the service and the adminStore mirror (`_environmentMatchesGatheringRecord` ~`:1955`, `_environmentAllowsGatheringLibraryRecord` `:1984`), which both delegate to the new helper.
- `composeEnvironment()` (`:170-199`) honors `compositionMode` per the semantics above and applies `taskOrder` / `hazardOrder` as a stable sort over the included set. `_environmentAllowsLibraryRecord` (`:763`) is gated through the mode.

## Store (`src/ui/svelte/stores/adminStore.js`)

- `updateEnvironmentDraft` allowed-field set (`:2616`) gains `compositionMode`, `taskOrder`, `hazardOrder`, `forcedTaskIds`, and `forcedHazardIds`. The arrays normalize through the existing `enabled*Ids` branch (`:2646`); `compositionMode` validates to the allowed set.
- New focused draft actions (thin wrappers over `updateEnvironmentDraft`, mirroring the existing environment task action style): `setEnvironmentCompositionMode(mode)`, `includeEnvironmentRecord(kind, id)`, `forceIncludeEnvironmentRecord(kind, id)`, `excludeEnvironmentRecord(kind, id)`, `restoreEnvironmentRecord(kind, id)`, `reorderEnvironmentRecord(kind, fromIndex, toIndex)`. `kind` is `'task' | 'hazard'`. `excludeEnvironmentRecord` keeps its internal name, but in manual mode it removes the ID from the matching `enabled*Ids` and `forced*Ids` and ensures it is absent from `disabled*Ids`; automatic tasks and hazards still add to `disabled*Ids`.
- A derived **composition view-model** exposed on the environment view-state so all four tabs + inspector + validation read one source of truth. Built from the draft environment + library `tasks`/`hazards` (`gatheringConfig.systems[systemId]`) + current conditions (`_gatheringCurrentConditions`), it classifies each record into a `CompositionState` (`includedByMatch` | `explicitlyIncluded` | `forceIncluded` | `excluded` | `candidate` | `includedButUnavailable` | `notMatching` | `libraryDisabled`) plus a `RuntimeState` (`available` | `unavailable`), and exposes `evidence` from `evaluateEnvironmentMatch` and runtime counts (available / excluded / candidate / unavailable tasks & hazards, validation issue count).

## UI

New directory `src/ui/svelte/apps/manager/environment/`. Svelte 5 runes only; components are prop-driven (data + callbacks in, no direct store imports), matching the existing `GatheringTaskEditView` pattern. The manager root renders the shared `.manager-inspector` aside only when `currentView !== 'environment-edit'` (`:3271`), so the editor owns its right inspector.

- Shell: `EnvironmentEditView.svelte` (replaces placeholder; keeps `manager-environment-edit-view` + `manager-environment-details-band` hooks), `EnvironmentEditorHeader.svelte`, `EnvironmentEditorTabs.svelte` (keyboard-navigable tablist).
- Tabs: `EnvironmentOverviewTab.svelte`, `EnvironmentTasksTab.svelte`, `EnvironmentHazardsTab.svelte`, `EnvironmentValidationTab.svelte`.
- Inspector: `EnvironmentRightInspector.svelte` → `EnvironmentSummaryInspector.svelte`, `TaskWrapperInspector.svelte`, `HazardWrapperInspector.svelte`. Override section disabled in Phase 1.
- Shared: `RuntimeStatePill.svelte`, `CompositionStatePill.svelte`, `MatchingEvidenceChips.svelte`, `CompositionModeControl.svelte`, and a shared `CompositionList.svelte` used by task and hazard tabs.

Behaviour rules in UI: automatic task mode and automatic hazard mode keep Included / Excluded / Non-matching sections, with non-matching and library-disabled records in the dedicated paginated Non-matching section. Manual task and hazard mode render only Included in this environment plus a single Available to add section, with no Excluded section and no separate Non-matching section. Available to add orders matching addable rows first, then enabled non-matching rows, then library-disabled rows; matching rows use Include, enabled non-matching rows use Force add, and library-disabled rows remain non-addable until enabled in the reusable library. Manual included rows use Remove copy for the shared exclusion callback, and removed records return to Available to add with normal candidate/not-matching/library-disabled state. Manual mode can force-add enabled non-matching records; those rows render in the included section as `forceIncluded` with explicit force-included copy. Drag-reorder remains hazard-only for included hazards, with non-drag fallback buttons. Status pills always carry text, never colour alone.

Tab count badges summarize composition membership, not runtime availability. Tasks and Hazards count records whose `compositionState` is `includedByMatch`, `explicitlyIncluded`, `forceIncluded`, or `includedButUnavailable`; excluded, candidate, non-matching, and library-disabled records do not count. The Validation tab can render multiple chips: critical readiness issues are labelled as errors with danger tone, and warning readiness issues are labelled separately with warning tone.

## Manager root wiring (`CraftingSystemManagerRoot.svelte`)

The route, header (`:888`/`:908`), action bar (`:2785-2793`), and `<EnvironmentEditView>` mount (`:3040`) already exist. Pass the composition view-model + new store actions as props; drop the now-unused inline-task authoring handlers the placeholder never used. Reuse the existing Save (neutral→primary) / Delete (destructive) header buttons.

## Localization

New keys under `FABRICATE.Admin.Manager.Environment.*` in `lang/en.json` (header, tabs, composition states, runtime states, validation issue titles, inspector section labels). The `text(key, fallback)` helper degrades gracefully, so fallbacks ship working strings.

## CSS

New `.manager-environment-*` selectors in `styles/fabricate.css` reusing existing `--fab-*` tokens and shared classes (`manager-chip` + modifiers, `manager-button` + modifiers, `manager-inspector-card`, `manager-field`, `manager-fact-grid`). Compact rows, muted section headers, strong selected-row outline, green/amber/red pills. No new colours, no bright white panels.

## Tests

- `tests/gathering-rich-state-service.*` (or a new `tests/gathering-environment-composition.test.js`) — `composeEnvironment` under `automatic` vs `manual` (empty-list disambiguation, manual non-matching include → unavailable, `taskOrder`/`hazardOrder` sort).
- `tests/gathering-match.test.js` (new) — `evaluateEnvironmentMatch` evidence per field (region/biome/danger for composition; weather/time for runtime condition gates) and `matches` parity with prior `_recordMatchesEnvironment`.
- `tests/stores/adminStore.test.js` — `updateEnvironmentDraft` accepts `compositionMode`/`taskOrder`/`hazardOrder`; the composition view-model classifies `CompositionState`/`RuntimeState` and counts correctly.
- `tests/components/environment-editor.test.js` (new) — source/contract checks: pills render text + state; tabs are keyboard-navigable; automatic task mode and automatic hazard mode retain Included/Excluded/Non-matching sections; manual task and hazard mode render Included plus Available to add without Excluded or separate Non-matching; Available to add orders matching rows before non-matching/library-disabled rows and preserves include, force-add, library-disabled, and open-source actions; localization keys/fallbacks stay aligned.
- `tests/components/manager-mounted.test.js` — extend the compile/mount list with the new environment components.

## Risks

1. Svelte 5 runes only (`$state`, `$derived`, `$effect`); mirror existing edit-view reactivity. No Foundry globals in the new components — localisation threads through the existing `localize` helper.
2. Reinterpreting `enabled*Ids`/`disabled*Ids` by `compositionMode` must keep existing environments (which have no `compositionMode`) behaving as before: default `'automatic'` preserves the prior "empty enabled = all matching" semantics.
3. The editor owns its inspector; the manager root must not also render the shared inspector for `environment-edit` (already the case at `:3271`).
