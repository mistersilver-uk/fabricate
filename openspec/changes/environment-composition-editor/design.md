# Design: Gathering Environment Composition Editor

## Data Model (minimal extension)

Environments are persisted in world setting `fabricate.gatheringEnvironments` and normalized/validated by `GatheringEnvironmentStore` (`src/systems/GatheringEnvironmentStore.js`). They already carry `enabledTaskIds` / `disabledTaskIds` / `enabledHazardIds` / `disabledHazardIds`, `selectionMode` (`targeted` | `blind`), `region`, `biomes`, `dangerTags`/`risk`, `conditions`, `sceneUuid`, `enabled`, and inline `tasks[]`.

Add to `_normalizeEnvironment()` and `_validateEnvironment()`:

- `compositionMode: 'automatic' | 'manual'` — default `'automatic'`; validated against `VALID_COMPOSITION_MODES` (mirror `VALID_SELECTION_MODES`). Shared across tasks and hazards in Phase 1.
- `taskOrder: string[]`, `hazardOrder: string[]` — ordered record IDs, normalized to deduped string arrays. They overlay drag order on the composed set; records absent from the array fall back to library order then name.

No per-record override fields are added in this change (see Phase 2 in the proposal).

### Composition semantics

`compositionMode` disambiguates today's ambiguous empty-list case (empty `enabledTaskIds` currently means "all matching" but cannot represent "manual, include none"):

- **automatic** — include every matching, library-enabled record **except** IDs in `disabled*Ids`.
- **manual** — include only IDs in `enabled*Ids` that still match and are library-enabled. A `manual`-included ID whose record no longer matches resolves to `includedButUnavailable` (not Available).

## Domain / Service

`src/systems/GatheringRichStateService.js`:

- Extract the boolean-only `_recordMatchesEnvironment` (`:748`) into a shared pure helper. New module `src/systems/gatheringMatch.js` exports `evaluateEnvironmentMatch(record, environment, conditions, { includeDanger, conditionSettings })` → `{ matches: boolean, evidence: { region, biome, weather, time, danger } }`, where each evidence field is `{ state: 'match' | 'any' | 'mismatch', recordValues: string[], envValues: string[] }`. `_recordMatchesEnvironment` becomes a thin wrapper returning `evidence.matches`. This removes the current duplication between the service and the adminStore mirror (`_environmentMatchesGatheringRecord` ~`:1955`, `_environmentAllowsGatheringLibraryRecord` `:1984`), which both delegate to the new helper.
- `composeEnvironment()` (`:170-199`) honors `compositionMode` per the semantics above and applies `taskOrder` / `hazardOrder` as a stable sort over the included set. `_environmentAllowsLibraryRecord` (`:763`) is gated through the mode.

## Store (`src/ui/svelte/stores/adminStore.js`)

- `updateEnvironmentDraft` allowed-field set (`:2616`) gains `compositionMode`, `taskOrder`, `hazardOrder`. The two arrays normalize through the existing `enabled*Ids` branch (`:2646`); `compositionMode` validates to the allowed set.
- New focused draft actions (thin wrappers over `updateEnvironmentDraft`, mirroring the existing environment task action style): `setEnvironmentCompositionMode(mode)`, `includeEnvironmentRecord(kind, id)`, `excludeEnvironmentRecord(kind, id)`, `restoreEnvironmentRecord(kind, id)`, `reorderEnvironmentRecord(kind, fromIndex, toIndex)`. `kind` is `'task' | 'hazard'`.
- A derived **composition view-model** exposed on the environment view-state so all four tabs + inspector + validation read one source of truth. Built from the draft environment + library `tasks`/`hazards` (`gatheringConfig.systems[systemId]`) + current conditions (`_gatheringCurrentConditions`), it classifies each record into a `CompositionState` (`includedByMatch` | `explicitlyIncluded` | `excluded` | `candidate` | `includedButUnavailable` | `notMatching` | `libraryDisabled`) plus a `RuntimeState` (`available` | `unavailable`), and exposes `evidence` from `evaluateEnvironmentMatch` and runtime counts (available / excluded / candidate / unavailable tasks & hazards, validation issue count).

## UI

New directory `src/ui/svelte/apps/manager/environment/`. Svelte 5 runes only; components are prop-driven (data + callbacks in, no direct store imports), matching the existing `GatheringTaskEditView` pattern. The manager root renders the shared `.manager-inspector` aside only when `currentView !== 'environment-edit'` (`:3271`), so the editor owns its right inspector.

- Shell: `EnvironmentEditView.svelte` (replaces placeholder; keeps `manager-environment-edit-view` + `manager-environment-details-band` hooks), `EnvironmentEditorHeader.svelte`, `EnvironmentEditorTabs.svelte` (keyboard-navigable tablist).
- Tabs: `EnvironmentOverviewTab.svelte`, `EnvironmentTasksTab.svelte`, `EnvironmentHazardsTab.svelte`, `EnvironmentValidationTab.svelte`.
- Inspector: `EnvironmentRightInspector.svelte` → `EnvironmentSummaryInspector.svelte`, `TaskWrapperInspector.svelte`, `HazardWrapperInspector.svelte`. Override section disabled in Phase 1.
- Shared: `RuntimeStatePill.svelte`, `CompositionStatePill.svelte`, `MatchingEvidenceChips.svelte`, `DiagnosticsDisclosure.svelte`, `CompositionModeControl.svelte`, `TaskCompositionList.svelte`, `HazardCompositionList.svelte`.

Behaviour rules in UI: non-matching records appear only in `DiagnosticsDisclosure` (collapsed) and cannot be included into the main flow (include action blocked for non-matching candidates); manual-included non-matching records render as `includedButUnavailable`. Drag-reorder reuses the existing `dragDrop` action with non-drag fallback buttons. Status pills always carry text, never colour alone.

## Manager root wiring (`CraftingSystemManagerRoot.svelte`)

The route, header (`:888`/`:908`), action bar (`:2785-2793`), and `<EnvironmentEditView>` mount (`:3040`) already exist. Pass the composition view-model + new store actions as props; drop the now-unused inline-task authoring handlers the placeholder never used. Reuse the existing Save (neutral→primary) / Delete (destructive) header buttons.

## Localization

New keys under `FABRICATE.Admin.Manager.Environment.*` in `lang/en.json` (header, tabs, composition states, runtime states, validation issue titles, inspector section labels). The `text(key, fallback)` helper degrades gracefully, so fallbacks ship working strings.

## CSS

New `.manager-environment-*` selectors in `styles/fabricate.css` reusing existing `--fab-*` tokens and shared classes (`manager-chip` + modifiers, `manager-button` + modifiers, `manager-inspector-card`, `manager-field`, `manager-fact-grid`). Compact rows, muted section headers, strong selected-row outline, green/amber/red pills. No new colours, no bright white panels.

## Tests

- `tests/gathering-rich-state-service.*` (or a new `tests/gathering-environment-composition.test.js`) — `composeEnvironment` under `automatic` vs `manual` (empty-list disambiguation, manual non-matching include → unavailable, `taskOrder`/`hazardOrder` sort).
- `tests/gathering-match.test.js` (new) — `evaluateEnvironmentMatch` evidence per field (region/biome/weather/time/danger; `any` vs `match` vs `mismatch`) and `matches` parity with prior `_recordMatchesEnvironment`.
- `tests/stores/adminStore.test.js` — `updateEnvironmentDraft` accepts `compositionMode`/`taskOrder`/`hazardOrder`; the composition view-model classifies `CompositionState`/`RuntimeState` and counts correctly.
- `tests/components/environment-editor.test.js` (new) — happy-dom mount: pills render text + state; tabs are keyboard-navigable; lists render Included/Candidate/Excluded/Diagnostics; non-matching records absent from the main flow.
- `tests/components/manager-mounted.test.js` — extend the compile/mount list with the new environment components.

## Risks

1. Svelte 5 runes only (`$state`, `$derived`, `$effect`); mirror existing edit-view reactivity. No Foundry globals in the new components — localisation threads through the existing `localize` helper.
2. Reinterpreting `enabled*Ids`/`disabled*Ids` by `compositionMode` must keep existing environments (which have no `compositionMode`) behaving as before: default `'automatic'` preserves the prior "empty enabled = all matching" semantics.
3. The editor owns its inspector; the manager root must not also render the shared inspector for `environment-edit` (already the case at `:3271`).
