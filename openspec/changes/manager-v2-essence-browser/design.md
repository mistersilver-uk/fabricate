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

## Session Learnings To Preserve

- Disabled placeholder arrays are a common source of "button cannot be clicked" defects in Manager V2. Before debugging event handlers, check whether a nav item is still rendered through placeholder/deferred-view data and therefore disabled by design.
- Promoting a Manager V2 feature from placeholder to route requires a whole-route checklist: remove placeholder entry, add feature-gated nav, normalize invalid active routes, add breadcrumbs/title/subtitle/header action labels, render a focused main component, wire inspector state, and add mounted plus source-contract tests.
- Essence source links are not just raw item UUIDs in Manager V2. The GM selects a managed source component; that component may provide a Foundry source item UUID used by effect transfer. Stale component references and missing source UUIDs must remain inspectable.
- Delete safety for essence definitions depends on component usage, not just whether the definition exists. Display seams should derive usage counts before the UI exposes destructive actions.
- The durable Essence browser target is browse-first. Interim native controls can unblock a route, but the design target remains shared `IconPicker`, `EssenceSourceSelector`, and a dedicated edit route.
- Mounted Svelte tests in this repo are more reliable when simulated DOM events update controls through explicit `value` plus `oninput`/`onchange` handlers. `bind:value` can hide test-harness event gaps for synthetic input/change dispatches.

## Implementation Plan

- Add a focused `src/ui/svelte/apps/manager-v2/EssenceBrowserView.svelte`:
  - receives essence cards, selected id, managed item options, and named callbacks
  - owns page-local search/filter state
  - emits select/delete/edit-navigation requests through callbacks only
  - does not own inline edit state for name, description, icon, or source
- Add a focused manager-v2 edit essence route/component:
  - opens from the essence row Edit action and selected-inspector Edit action
  - owns name, description, icon, source, dirty-state, save/cancel, and validation UI
  - uses `IconPicker` as a pop-over picker for icon selection
  - uses `EssenceSourceSelector` and drag/drop for source linking only when effect transfer is enabled
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
  - source-state filter for all, linked, stale/missing, and no source only when effect transfer is enabled
  - table/list rows showing icon, name, description, usage evidence, source item evidence only when effect transfer is enabled, and actions
  - row Edit action routes to the edit essence view
  - empty state for no definitions, filtered-empty state for search mismatch
  - row click selects an essence; edit/delete buttons stop row selection propagation
- Render selected-essence inspector:
  - selected essence identity, icon, description, linked source item, source UUID/id, and action buttons
  - if no essence is selected but definitions exist, show a select-row empty state
- Wire actions through existing store APIs:
  - create/edit save calls `store.addEssence(...)` or `store.updateEssence(id, { name, description, icon, sourceComponentId })` from the dedicated edit route and keeps the draft intact when the result is `false`
  - source picker select/drop/clear calls local edit-route form state; the browse page must not directly update source linkage
  - remove calls `store.removeEssence(id)` only when usage counts show no references; otherwise show/announce the usage-blocked state
- Keep manager-v2 presentational code free of direct Foundry globals. Reuse localized copy under `FABRICATE.Admin.ManagerV2.Essence` and existing shared essence picker labels where appropriate.

## Edge Cases

- `features.essences !== true`: hide the Essences nav item and normalize an active `essences` view back to `systems`.
- Store/page essence mutations should no-op or return `false` while the selected system has `features.essences !== true`.
- Empty system list: keep current no-system behavior.
- Duplicate names or blank names: rely on existing store return value and warning behavior; UI buttons should disable blank submit/save.
- Source component with stale/missing managed item: keep persisted component id and any raw source item UUID visible as text evidence when `associatedItem` is absent, and allow clearing.
- `features.effectTransfer !== true`: hide source UI entirely, including browse source columns/filters, inspector source sections, edit-route source controls, source warnings, and source mutation affordances. Preserve stored source evidence in data, but do not display or mutate it from manager-v2 essence screens while effect transfer is disabled.
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
  - browse row Edit opens the dedicated edit essence route and browse rows do not render inline edit controls
  - create, edit/save/cancel, source clear/select/drop, and remove delegate to store callbacks with expected arguments from the correct route
  - create and edit drafts remain intact when `store.addEssence` or `store.updateEssence` resolves `false`, including duplicate-name saves
  - switching selected systems clears filters/edit state and selects the first available essence for the new system
  - usage-blocked delete shows visible usage explanation, leaves the delete control blocked/disabled, and does not call `store.removeEssence`
  - source UI is absent when effect transfer is disabled and present with source-state evidence plus picker/drop affordances when it is enabled
- Store/domain tests:
  - legacy component-id source values migrate to `sourceComponentId` without losing stale evidence
  - updating only the source component preserves name/icon/description
  - clearing source sets source fields to null consistently
  - feature-disabled essence mutations return `false`
  - effect transfer resolves through the source component's item UUID and skips stale/missing sources
  - delete is blocked or no-ops while essence usage references exist
- Layout/CSS tests:
  - essence rows/table use stable columns at normal width and stack without overflow
  - edit-route controls and icon/source picker triggers have stable dimensions and accessible focus
- Admin-store tests:
  - extend existing essence action coverage for return-value, feature-gate, source-link, stale-source, and usage-block behavior
- Foundry/browser validation:
  - normal `1200x790` screenshot: Essence browser visible with create action, multiple rows, selected inspector, no inline edit controls, no clipping/overlap
  - normal `1200x790` screenshot: Edit essence route visible with identity form, pop-over icon picker trigger, conditional source panel, save/cancel strip, and evidence rail
  - stacked `1000x700` screenshot: list and inspector remain reachable with coherent scroll containment
  - narrow `680px` browser/container screenshot or equivalent component harness: rows stack cleanly and action buttons remain visible
  - screenshot or pointer evidence for usage-blocked delete UI: visible warning/explanation, blocked/disabled delete control, and no delete callback
  - pointer hit tests for Essences nav, row selection, create/save/cancel/delete buttons, failed create/save preserving drafts, icon picker, source picker, source drop/replace, and clear source button

## Implementer Entry Criteria

- Active change: `openspec/changes/manager-v2-essence-browser/`
- Implement source identity, display seam, and destructive reference rules before building the visible browser page.
- Do not add Essence browser behavior directly as another large view branch in `CraftingSystemManagerV2Root.svelte`; use a focused component.
- Keep unrelated dirty worktree changes intact.
