# Tasks

## Data model & domain

- [x] Add `compositionMode` (default `automatic`), `taskOrder`, `hazardOrder` to `_normalizeEnvironment()` and `_validateEnvironment()` in `src/systems/GatheringEnvironmentStore.js` (add `VALID_COMPOSITION_MODES`).
- [x] Create `src/systems/gatheringMatch.js` exporting `evaluateEnvironmentMatch(record, environment, conditions, opts)` → `{ matches, evidence }`. Re-point `GatheringRichStateService._recordMatchesEnvironment` to it.
- [x] Update `composeEnvironment()` in `src/systems/GatheringRichStateService.js` to honor `compositionMode` (automatic vs manual) and apply `taskOrder`/`hazardOrder` stable sort. Automatic preserves any legacy non-empty `enabled*Ids` allow-list for backward compatibility.

## Store

- [x] Extend `updateEnvironmentDraft` allowed fields with `compositionMode`/`taskOrder`/`hazardOrder` in `src/ui/svelte/stores/adminStore.js`; re-point the store matching mirror to `evaluateEnvironmentMatch`.
- [x] Add draft actions: `setEnvironmentCompositionMode`, `includeEnvironmentRecord`, `excludeEnvironmentRecord`, `restoreEnvironmentRecord`, `reorderEnvironmentRecord`.
- [x] Expose a derived composition view-model (`environmentComposition`: per-record `CompositionState`/`RuntimeState`/`evidence` + runtime counts) on the environment view-state.

## UI

- [x] Create `src/ui/svelte/apps/manager/environment/` shell + chrome: `EnvironmentEditView.svelte` (replace placeholder), `EnvironmentEditorHeader.svelte`, `EnvironmentEditorTabs.svelte`.
- [x] Create tabs: `EnvironmentOverviewTab.svelte`, `EnvironmentTasksTab.svelte`, `EnvironmentHazardsTab.svelte`, `EnvironmentValidationTab.svelte`.
- [x] Create inspector: `EnvironmentRightInspector.svelte`, `EnvironmentSummaryInspector.svelte`, and a kind-adaptive `RecordInspector.svelte` (replaces the suggested separate Task/Hazard wrapper inspectors; override section disabled in Phase 1).
- [x] Create shared building blocks: `RuntimeStatePill.svelte`, `CompositionStatePill.svelte`, `MatchingEvidenceChips.svelte`, `DiagnosticsDisclosure.svelte`, `CompositionModeControl.svelte`, and a single `CompositionList.svelte` engine (used by both task and hazard tabs in place of separate Task/Hazard list components).
- [x] Wire props/actions into the `<EnvironmentEditView>` mount in `CraftingSystemManagerRoot.svelte`; drop unused inline-task handlers.

## Localization & CSS

- [x] Localization: the editor uses the existing `text(key, fallback)` helper with English fallbacks. Dedicated `lang/en.json` keys were intentionally **not** added in this slice because several intended namespaces (`Environment.Inspector`, `Environment.Validation`, `Environment.Tasks`, `Environment.Hazards`) already exist as string/object keys; adding object-style keys would create duplicate-key collisions. Foundry i18n returns the key unchanged for missing nested paths, so fallbacks render correct English with no runtime error. Localizers can add a non-colliding namespace later.
- [x] Add `.manager-environment-*` selectors to `styles/fabricate.css`, reusing shared selectors and `--fab-*`/`--fab-mv2-*` tokens.

## Tests & validation

- [x] Add `composeEnvironment` mode/ordering coverage (`tests/gathering-environment-composition.test.js`) and `tests/gathering-match.test.js` for evidence.
- [x] Extend `tests/stores/adminStore.test.js` for the new fields + composition view-model.
- [x] Add `tests/components/environment-editor.test.js`; extend `tests/components/manager-mounted.test.js` compile list + new-draft mount assertions.
- [x] Run `npm test` (2602 pass / 0 fail).
- [x] Run `npm run build` (dist valid).
- [ ] Capture Manager V2 desktop + narrow screenshots for the PR (requires a running Foundry instance via `npm run dev` or `npm run test:foundry`).
