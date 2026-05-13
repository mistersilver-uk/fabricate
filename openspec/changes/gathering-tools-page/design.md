# Design: Gathering Tools Page

## Persistence

New per-system library at `gatheringConfig.systems[systemId].tools[]`. Each entry:

```
{ id, label?, enabled, componentId, requirement, breakage, onBreak }
```

`requirement`, `breakage`, and `onBreak` use the existing Tool model shape (`src/models/Tool.js`). `_normalizeGatheringLibraryTool` (`src/ui/svelte/stores/adminStore.js`) is total — fills defaults, never rejects. Validation happens at the editor save boundary via `Tool.fromJSON(...).validate()`.

CRUD helpers in `adminStore.js` next to the existing library-task helpers:

- `addGatheringLibraryTool(systemId)`
- `updateGatheringLibraryTool(systemId, toolId, updates)`
- `deleteGatheringLibraryTool(systemId, toolId)` (uses the existing confirm-delete dialog with a new `'tool'` branch)
- `validateGatheringLibraryTool(tool)` — wraps `Tool.validate()`.

`_normalizeGatheringConfig` accepts `tools: []` per system block; legacy configs without the field normalize to `[]`. The runtime `normalizeGatheringConfig` (`src/systems/GatheringRichStateService.js`) gains a `normalizeLibraryTool` helper used in the same system block.

Cleanup: the previously dead inline `addEnvironmentTaskTool` family (only ever wired to the placeholder env editor) is removed alongside `_newEnvironmentTool`.

## Draft + Save

A `toolsDraft` writable parallel to `environmentDraft` holds the in-memory list while the page is open. A `toolsDraftBaseline` snapshot enables JSON-stable per-tool dirty tracking. Functions on the store:

- `enterToolsDraft(systemId)` snapshots the live `tools` array.
- `addToolToDraft()` / `updateToolInDraft(id, patch)` mutate the draft and recompute the dirty tool id list.
- `deleteToolFromDraft(id)` persists deletion immediately for saved tools; unsaved new tools are removed from the draft only.
- `selectDraftTool(id)` / `setExpandedDraftTool(id)` track selection and inline-expansion state.
- `validateToolsDraft()` returns `{ valid, errors[{ id, errors[] }] }`.
- `validateToolDraft(id)` validates one tool.
- `isToolDraftDirty(id)` checks the per-tool dirty id list.
- `saveToolDraft(id)` re-reads the live config, hash-checks that tool against its baseline entry, and surfaces an overwrite confirm when concurrent edits are detected. On confirm (or no divergence), writes only that tool to `systems[id].tools` and clears that tool's dirty state.
- `saveAllDirtyToolDrafts()` saves all dirty tools one at a time and leaves any failed/invalid tool dirty.
- `cancelToolsDraft()` clears all draft state.
- `confirmDiscardDirtyToolsDraft()` mirrors the environment-draft confirm dialog for discard-only callers; the manager v2 route guard uses a three-outcome prompt (`Save All`, `Discard Changes`, `Keep Editing`).

## Composition seam

`composeEnvironment` (`src/systems/GatheringRichStateService.js`) attaches a non-enumerable `__libraryTools` Map keyed by tool id, mirroring `__libraryCharacterModifiers`. Task→tool references are stored as `task.toolIds: string[]`. The editor resolves each id against the per-system tools array; the runtime resolves through the `__libraryTools` Map. Missing references are tolerated (the runtime treats them as not-present; the editor renders them as a stale warning chip).

## Task editor wiring

`GatheringTaskEditView.svelte` gains a `Required Tools` section between Task Availability and Components. It accepts three additional props:

- `libraryTools: Tool[]` — the persisted per-system tools library (`gatheringConfig.systems[id].tools`), exposed by the root via a `selectedGatheringSystemTools` derivation.
- `onAddToolReference(toolId)` / `onRemoveToolReference(toolId)` — root-supplied handlers that append/filter `task.toolIds` via the existing `updateSelectedGatheringTask` path (which routes through the draft when one exists).

Local state owned by the editor: `toolSearchTerm`, `toolPageIndex`, `toolPageSize`. All reset on task switch (existing `task.id` $effect). The section renders three regions:

1. **Attached pill row.** One chip per `toolIds` entry, using the `manager-v2-availability-pill` base with a thumbnail of the resolved managed component. Chip shows a `×` button that calls `onRemoveToolReference`. References whose id is missing from the library render as an `is-stale` warning chip with a warning icon and a `×` to clear the dangling reference.
2. **Search + paginated result grid.** A compact `manager-v2-search` input filters unattached library tools by tool label and underlying component name. Results render as `manager-v2-task-component-card` items (with a `manager-v2-task-required-tools-card-item` modifier that replaces the drag grip with a `fas fa-plus` add affordance). Clicking a card calls `onAddToolReference`.
3. **Library-empty placeholder.** When the per-system library is empty, the picker hides the search/grid/footer and shows a hint pointing the GM to the Tools page in the left rail.

The card's visual identity reuses the existing `manager-v2-task-*-card` shell (border, surface, radius, inset highlight) and the existing component-card grid so the new section reads as a sibling of the Components browser.

## Manager V2 wiring

`CraftingSystemManagerV2Root.svelte`:

- New top-level nav button positioned between Essences and Gathering. Always visible when a system is selected; not gated by `canShowEnvironments` or `canShowEssences`. Icon `fas fa-screwdriver-wrench`. Label `FABRICATE.Admin.ManagerV2.Nav.Tools`.
- New `currentView === 'tools'` value, threaded through `normalizedActiveView`, `viewTitle`, `viewSubtitle`, `headerActionsLabel`, `inspectorLabel`, and `setView`. `isGatheringRoute` does **not** include Tools — Tools is a sibling top-level route, not a gathering child.
- `setView('tools')` calls `enterToolsDraft(systemId)` as the side-effect that initializes the draft when the route is entered.
- `confirmRouteExit` chain extended with `confirmToolsRouteExit` so dirty drafts prompt before navigation.
- Breadcrumb extension `Crafting Systems > {System} > Tools`.
- Header actions block has no Tools-specific navigation or dirty actions. The selected-tool inspector card owns the conditional `Unsaved` chip, `Delete tool`, and per-tool `Save changes` so destructive and persistence actions stay in the right-side tool context.
- New child view `ToolsBrowserView.svelte` mounted for the route.
- Inspector branch with a SELECTED TOOL hero/action card plus supporting cards for overview, requirement, breakage, on-break action, usage (rendered in a "Not linked" state), and a closing warning band.

`ToolsBrowserView.svelte`:

- Section header + `Tools (N)` browser card with `Add tool` action.
- Compact rows with fixed-width managed-component identity/drop-zone column (thumbnail + name + secondary), fixed summary and chevron action columns, three summary chips, conditional per-row `Unsaved` pip overlaid at the top-left row corner on an opaque chip surface, selected row headers indicated by a subtle background fill rather than accent borders, and expand/collapse chevron.
- Rows with an existing mapped component render that component identity as a subtle dashed drop zone; dropping a managed component from the right-side component browser replaces the tool's `componentId`.
- The bottom Add tool stub is also a drop target; dropping a managed component or importable Foundry item creates a new tool pre-mapped to that component.
- Inline editor for the selected/expanded row: optional label, component picker (with `dragDrop` action), optional requirement as a single actor roll-data property field with a proficiency-style example (`@tools.alchemist.value`), breakage mechanic radio group with single-line mode-specific controls, on-break action radio group with a full-width replacement component drop zone for `replaceWith` that keeps its empty-state copy inside the drop zone rather than using a separate side label, and an inline `Delete tool` button.
- Empty state when zero tools; `+ Add tool` ghost row appended when at least one tool exists.

## Radio group accessibility

A new `manager-v2-radio-group` / `manager-v2-radio-option` pattern using `<fieldset role="radiogroup">` with native `<input type="radio">` (visually hidden, keyboard navigable). Defer extraction to a generic component until a second consumer appears.

## CSS

New `manager-v2-tools-*` and `manager-v2-radio-*` classes appended to `styles/fabricate.css`. All colours through `var(--fab-…)` tokens; the task drop-rate slider reuses the shared `dropRateTierClass` / `dropRateTierColor` helpers extracted to `src/ui/svelte/util/dropRateTier.js`, while the active tool breakage-chance slider has a dedicated full-track green/yellow/red semantic gradient with a matching dynamic thumb colour.

Follow-up inspector component browser rules keep the right rail card deterministic: the card owns header/scroll/footer grid rows, the compact search label is a positioned full-width block so its icon anchors inside the input chrome, the result scroll area has enough padded height for complete one-column cards, and the shared pagination component is restyled as transparent full-width centered footer content inside this narrow card.

## Localization

New block `FABRICATE.Admin.ManagerV2.Tools.*` plus `FABRICATE.Admin.ManagerV2.Environment.GatheringTabs.{Tools,ToolsTitle,ToolsHint}`.
