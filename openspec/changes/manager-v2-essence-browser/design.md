# Manager V2 Essence Browser Design

## Current Context

`CraftingSystemManagerV2Root.svelte` currently treats `Essences` as a feature-gated placeholder view. `adminStore` already exposes `addEssence(name, description, icon, sourceItemUuid)`, `updateEssence(essenceId, updates)`, and `removeEssence(essenceId)`. `selectedSystem.essenceDefinitions` includes resolved `associatedItem` and `associatedItemName` values, with `managedItemOptions` available for source selection.

The legacy current-admin implementation in `FeatureCardStack.svelte` uses `IconPicker`, `EssenceSourceSelector`, `DEFAULT_ESSENCE_ICON`, and `normalizeEssenceIcon`. Manager v2 should reuse those components and store actions instead of creating a second persistence path.

## Blocking Decisions Resolved For Implementation

- Treat the Essence browser source link as a **managed source component** reference for this implementation slice.
- Add `EssenceDefinition.sourceComponentId` as the canonical manager-v2 source field. Keep `associatedSystemItemId` as the legacy alias for the same component id.
- Treat `sourceItemUuid` as the resolved Foundry item/template UUID when available, not as the UI-selected component id. During compatibility normalization, if legacy `sourceItemUuid` or `associatedSystemItemId` matches a managed component id, migrate that value to `sourceComponentId`/`associatedSystemItemId` and derive `sourceItemUuid` from that component's source reference when possible.
- Preserve unresolved source evidence instead of silently collapsing it. A persisted component id that no longer resolves should produce a stale source state in display data; a resolved component without an item source should produce a missing source-item state; no source fields produce no-source state.
- Make `CraftingSystem.essenceDefinitions: EssenceDefinition[]` the canonical implementation shape for this work. Treat `CraftingSystem.essences` as a legacy/transitional alias only.
- Manager-v2 must not allow deleting an essence definition while the display usage evidence reports references. The delete action should be disabled or blocked with a localized explanation until the GM removes references first. This avoids silent component cleanup or invalid recipe references in this first slice.

## Implementation Plan

- Add a focused `src/ui/svelte/apps/manager-v2/EssenceBrowserView.svelte`:
  - receives essence cards, selected id, managed item options, and named callbacks
  - owns page-local create/edit/search/filter state
  - uses `IconPicker` and `EssenceSourceSelector` after those controls can operate in manager-v2
  - emits create/update/delete/select requests through callbacks only
- Keep `CraftingSystemManagerV2Root.svelte` responsible for routing, nav, and high-level data wiring only:
  - remove it from `placeholderViews`
  - add a feature-gated nav button after `Components` and before `Environments` or in the existing selected-system feature order chosen for manager v2
  - update `normalizedActiveView`, `viewTitle`, `viewSubtitle`, header action labels, and inspector routing for `currentView === 'essences'`
- Add an admin-store display seam:
  - `viewState.essenceCards` derived from selected essence definitions, managed components, recipes, environments, and salvage data where available
  - each card includes id, name, description, normalized icon, source component id, resolved source item data, raw source evidence, source state, and usage counts
  - keep the seam display-only; persistence remains in existing essence actions unless the source compatibility normalization requires a small action signature update
- Add source identity normalization:
  - preserve or migrate legacy values without dropping stale evidence
  - keep `sourceComponentId`, `associatedSystemItemId`, and derived/preserved `sourceItemUuid` coherent on add/update
  - update effect-transfer resolution to use the resolved source item UUID from the source component when present, and skip stale/missing sources without throwing
- Render the main essence browser:
  - toolbar with search and count chip
  - source-state filter for all, linked, stale/missing, and no source
  - create band using `IconPicker` and `EssenceSourceSelector`
  - table/list rows showing icon, name, description, source item evidence, and actions
  - empty state for no definitions, filtered-empty state for search mismatch
  - row click selects an essence; edit/delete buttons stop row selection propagation
- Render selected-essence inspector:
  - selected essence identity, icon, description, linked source item, source UUID/id, and action buttons
  - if no essence is selected but definitions exist, show a select-row empty state
- Wire actions through existing store APIs:
  - create calls `store.addEssence(name, description, icon, sourceComponentId)` and clears form only when the result is not `false`
  - save calls `store.updateEssence(id, { name, description, icon, sourceComponentId })`
  - source picker select/drop/clear calls local form state for create/edit, then store update for non-edit inline source changes only if that interaction is included
  - remove calls `store.removeEssence(id)` only when usage counts show no references; otherwise show/announce the usage-blocked state
- Keep manager-v2 presentational code free of direct Foundry globals. Reuse localized copy under `FABRICATE.Admin.ManagerV2.Essence` and existing shared essence picker labels where appropriate.

## Edge Cases

- `features.essences !== true`: hide the Essences nav item and normalize an active `essences` view back to `systems`.
- Store/page essence mutations should no-op or return `false` while the selected system has `features.essences !== true`.
- Empty system list: keep current no-system behavior.
- Duplicate names or blank names: rely on existing store return value and warning behavior; UI buttons should disable blank submit/save.
- Source component with stale/missing managed item: keep persisted component id and any raw source item UUID visible as text evidence when `associatedItem` is absent, and allow clearing.
- Long names/descriptions/source labels: clamp/wrap inside row and inspector geometry without horizontal overflow.
- Icon picker and source picker popovers must be reachable in manager-v2. Extend their host/bounds logic to recognize `.fabricate-manager-v2`, `.manager-v2-main`, and the relevant manager-v2 scroll container; do not rely on legacy `.fabricate-admin` styling.

## Verification Plan

- Source/contract tests:
  - manager-v2 includes `essences` as a real view, not a disabled placeholder
  - localized `FABRICATE.Admin.ManagerV2.Essence.*` keys exist
  - no direct Foundry globals in the Svelte root
  - source identity fields and `essenceDefinitions` array shape are documented in OpenSpec
- Mounted tests:
  - Essences nav appears only when the selected system has `features.essences === true`
  - clicking Essences routes to `data-manager-v2-view="essences"`
  - disabling the feature while on the route falls back to `systems`
  - rows render selected system essence definitions and selected-row inspector
  - no-essences base empty state renders when the feature is enabled but no definitions exist
  - search filters rows and shows filtered-empty state
  - create, edit/save/cancel, source clear/select/drop, and remove delegate to store callbacks with expected arguments
  - create and edit drafts remain intact when `store.addEssence` or `store.updateEssence` resolves `false`, including duplicate-name saves
  - switching selected systems clears filters/edit state and selects the first available essence for the new system
  - usage-blocked delete shows visible usage explanation, leaves the delete control blocked/disabled, and does not call `store.removeEssence`
- Store/domain tests:
  - legacy component-id source values migrate to `sourceComponentId` without losing stale evidence
  - updating only the source component preserves name/icon/description
  - clearing source sets source fields to null consistently
  - feature-disabled essence mutations return `false`
  - effect transfer resolves through the source component's item UUID and skips stale/missing sources
  - delete is blocked or no-ops while essence usage references exist
- Layout/CSS tests:
  - essence rows/table use stable columns at normal width and stack without overflow
  - create/edit controls and icon/source picker triggers have stable dimensions and accessible focus
- Admin-store tests:
  - extend existing essence action coverage for return-value, feature-gate, source-link, stale-source, and usage-block behavior
- Foundry/browser validation:
  - normal `1200x790` screenshot: Essence browser visible with create controls, multiple rows, selected inspector, no clipping/overlap
  - stacked `1000x700` screenshot: list and inspector remain reachable with coherent scroll containment
  - narrow `680px` browser/container screenshot or equivalent component harness: rows stack cleanly and action buttons remain visible
  - screenshot or pointer evidence for usage-blocked delete UI: visible warning/explanation, blocked/disabled delete control, and no delete callback
  - pointer hit tests for Essences nav, row selection, create/save/cancel/delete buttons, failed create/save preserving drafts, icon picker, source picker, source drop/replace, and clear source button

## Implementer Entry Criteria

- Active change: `openspec/changes/manager-v2-essence-browser/`
- Implement source identity, display seam, and destructive reference rules before building the visible browser page.
- Do not add Essence browser behavior directly as another large view branch in `CraftingSystemManagerV2Root.svelte`; use a focused component.
- Keep unrelated dirty worktree changes intact.
