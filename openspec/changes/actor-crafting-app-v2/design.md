# Design: Actor Crafting App V2

## Reference Screenshots

- [Actor Crafting App - Alchemy Mode](<../fabricate-ui-design-system-manager-v2/references/Actor Crafting App - Alchemy Mode.png>)
- [Actor Crafting App - Crafting Mode - Simple recipes](<../fabricate-ui-design-system-manager-v2/references/Actor Crafting App - Crafting Mode - Simple recipes.png>)
- [Actor Crafting App - Crafting Mode - Complex Recipes](<../fabricate-ui-design-system-manager-v2/references/Actor Crafting App - Crafting Mode - Complex Recipes.png>)

These are visual direction. Where they conflict with the written requirements in `specs/ui-integration/spec.md` of this change (or the parent `fabricate-ui-design-system-manager-v2/specs/ui-integration/spec.md`), the written requirements win.

## Pre-Slice Verification

Three assumptions were verified by reading the implementation before the design was finalised:

1. **Source allocation contract** — `RecipeManager.evaluateCraftability()` returns aggregate `ingredientStates`, `essenceStates`, and `catalystStates` only. There is no per-source-actor allocation breakdown, and `CraftingEngine.craft()` does not accept a user-provided allocation. **Decision**: the complex-recipe inspector source allocation is read-only display evidence, derived in `craftingStore.js` by walking each ingredient option and matching against each source actor's items in selection order. The first matching source is shown as the supplier. The user cannot reassign allocation through the inspector.
2. **Drag/drop in Alchemy** — `ComponentPalette.svelte` already sets `dataTransfer` and the `Workbench.svelte` already mounts the `dragDrop` action. The V2 empty-state copy "Drop components here / or click items from the palette" is accurate without new wiring.
3. **Pagination naming clash** — `src/ui/svelte/apps/Pagination.svelte` (legacy thin footer) is unused. `src/ui/svelte/apps/manager-v2/Pagination.svelte` is the only one in use. Slice 0 promotes the manager-v2 component to `src/ui/svelte/components/Pagination.svelte` and deletes the legacy file.

## Shell Structure

The actor-app shell renders three regions stacked vertically:

```
┌──────────────────────────────────────────────────────┐
│  Actor card  │  Component Sources  │  Mode pills  │ Right slot
├──────────────────────────────────────────────────────┤
│              Tab body (Alchemy or Crafting)           │
└──────────────────────────────────────────────────────┘
```

`ActorAppShell.svelte` exposes a `headerRightSlot` snippet prop. Alchemy mounts `<AlchemySystemSelector>` into it. Crafting leaves it empty.

Mode pills come from the existing `activeTab` writable. Visibility rules from `showTabBar` / `hasAlchemyTab` / `hasCraftingTab` are unchanged.

`activeTab` persistence: not added in this change. Slice 2 may add `services.setSetting('lastActorAppTab', tab)` if cheap; otherwise session-only.

## Alchemy Layout

```
┌──────────────────────────────────────────────────────┐
│        RunBands: In Progress │ Recent History         │
├────────────┬──────────────────────┬──────────────────┤
│  Components│   Alchemy Workbench  │  Discovered      │
│  palette   │   (drop area, mix    │  Recipes panel   │
│  card      │   chip row, attempt) │  ─────────────   │
│            │                      │  Selected Recipe │
│            │                      │  inspector card  │
├────────────┴──────────────────────┴──────────────────┤
│  Palette legend (Available / Low / Unavailable)       │
└──────────────────────────────────────────────────────┘
```

Container-query stacking:
- `>= 1100px` container: three-column layout above
- `>= 800px` container: palette/workbench side-by-side, discovered+selected stacks below
- `< 800px` container: all sections stack full-width

## Crafting Layout

```
┌──────────────────────────────────────────────────────┐
│        RunBands: In Progress │ Recent History         │
├──────────────────────────────────────────────────────┤
│        Shopping List band                             │
├──────────────────────────────────────────────────────┤
│        Toolbar (search / filters)                     │
├────────────────────────────┬─────────────────────────┤
│  Recipe table              │  Selected Recipe        │
│  (rows + pagination)       │  Inspector              │
│                            │  (Simple or Complex)    │
└────────────────────────────┴─────────────────────────┘
```

Container-query stacking:
- `>= 1180px` container: table + inspector side-by-side
- `>= 800px` container: inspector below table, both full-width
- `< 800px` container: same, with toolbar wrapping and rows compacting

Salvage entries decision: keep as a separate band below the Shopping List band. Folding salvage into the recipe table risks conflating recipe and salvage runtime semantics. The salvage band uses the existing `viewState.salvageEntries` data shape unchanged.

`recentRecipes` decision: removed from the V2 layout. The "Recent History" band shows run history (run records), not the legacy "Recently Crafted" recipe-id list. The store keeps `recentRecipes` as derived view-state for now (no behaviour change), but no V2 component renders it. Future cleanup may remove it from the store.

## Store Derived State

`craftingStore.js` adds the following per-instance writables and recompute helpers. Selection state is factory-scoped (isolated per app instance), matching the existing pattern.

New writables:
- `selectedDiscoveredRecipeId` (Slice 1)
- `selectedRecipeId` (Slice 2, with auto-select-first behaviour on initial refresh when nothing is selected)
- `selectedPathByRecipeId = writable(new Map())` (Slice 3)
- `craftingPageIndex`, `historyPageIndex`, `pageSize` (Slice 2)

New actions:
- `selectDiscoveredRecipe(id)` (Slice 1)
- `selectRecipe(id)` (Slice 2)
- `selectPath(recipeId, pathIndex)` (Slice 3)
- `setPageIndex(scope, index)` and `setPageSize(size)` (Slice 2)

New recompute helpers (mirror existing `_recomputePalette` / `_recomputeDiscoveredRecipes` pattern):
- `_recomputeSelectedDiscoveredRecipe()` — Slice 1; lookup goes through filtered `discoveredRecipes` so non-GM secrecy holds
- `_recomputeSelectedRecipeInspector()` — Slice 2; called from `refresh()`, `_handleInventoryChange()`, and selection actions; builds a `selectedRecipeInspector` view payload
- Slice 3 extends `_recomputeSelectedRecipeInspector()` with `craftPlan` data: complexity classification (uses `recipe.isSimpleRecipe()` from `Recipe.js`), per-set group/option breakdown, derived source allocation (advisory), step-timeline projection from active run data

Page-size persistence: `services.setSetting('actorAppPageSize', n)` reads/writes to align with existing `lastCraftingActor` / `lastComponentSources` / `lastAlchemySystem` patterns. Cheap, low risk, improves UX.

## Secrecy Rules

- `selectedDiscoveredRecipeId` lookups MUST resolve through the already-filtered `discoveredRecipes` writable, never through `getRecipesForSystem`. This preserves non-GM hidden-recipe rules — a non-GM viewer cannot see a hidden recipe even if a hidden id is forced into the writable.
- Teaser recipes (`recipe.isTeaser`) and `teaserHiddenFields` MUST be respected in `RecipeTableRow`, `SimpleRecipeInspector`, and `ComplexRecipeInspector`. Hidden requirements/essences/catalysts/results render the existing teaser placeholders.

## Source Allocation (Complex Inspector)

Read-only, advisory, derived in the store. Algorithm:

1. For each option in each ingredient group of the active path's ingredient set, walk the source actors in selection order.
2. The first source actor with at least one matching item is shown as the supplier badge for that option row.
3. If no source has matching items, the row shows a missing badge instead of a source name.

The user cannot reassign sources through the inspector. The screenshot's per-row source name is read-only display evidence.

## Folder Convention

New components live under `src/ui/svelte/apps/actor-app/`. This mirrors `src/ui/svelte/apps/manager-v2/`. Existing flat actor-app components stay flat for now (move-or-leave is a separate cleanup not in scope).

## Shell Component Decision

Slice 0 implements the V2 shell by restructuring `CraftingAppRoot.svelte` in-place rather than introducing a separate `ActorAppShell.svelte` wrapper. The existing root already owns layout, tab bar rendering, and tab body routing. Adding a wrapper component would duplicate the role without clear benefit. The shell role tests against `CraftingAppRoot` continue to live in `tests/crafting-app-root-tabs.test.js` and `tests/components/actor-app-container-queries.test.js`. Slice 1+ may introduce additional V2 chrome (e.g. header right slot for the alchemy system selector) by extending `CraftingAppRoot` and `ActorCraftingHeader` rather than wrapping them.

## Pagination Promotion

Slice 0 moves `src/ui/svelte/apps/manager-v2/Pagination.svelte` → `src/ui/svelte/components/Pagination.svelte`. Manager-v2 imports update path-only. Class names (`manager-v2-pagination*`) and `data-pagination-*` selectors stay unchanged so manager-v2 layout/mounted tests pass without modification. Localization keys (`FABRICATE.Admin.ManagerV2.Pagination.*`) stay where they are; cross-namespace rename is deferred.

The legacy `src/ui/svelte/apps/Pagination.svelte` (thin "Showing X–Y of Z" footer) is unused and is deleted in Slice 0.

## Token Migration

Slice 0 replaces `--fabricate-primary` and rgba literals in `CraftingAppRoot.svelte` and `ActorCraftingHeader.svelte` with `--fab-accent` / `--fab-accent-soft` / `--fab-border`. Container queries replace `@media (max-width: ...)` viewport queries. New `.fabricate-actor-app` scope rules in `styles/fabricate.css` use `--fab-*` tokens exclusively.

## Localization

New namespace `FABRICATE.ActorApp.*`. Subgroups:
- `FABRICATE.ActorApp.Header.*`
- `FABRICATE.ActorApp.RunBands.*`
- `FABRICATE.ActorApp.Alchemy.*`
- `FABRICATE.ActorApp.Crafting.*`
- `FABRICATE.ActorApp.CraftPlan.*` (Slice 3)

Legacy `FABRICATE.Alchemy.*`, `FABRICATE.RecipeCard.*`, `FABRICATE.RunSummary.*`, `FABRICATE.ShoppingList.*` keys move only when their owning component is replaced. Keys still referenced by retained components (e.g. `ShoppingListPanel.*` if Slice 2 keeps the component instead of replacing) stay where they are.

## Test Strategy

- Mounted Svelte tests for each new component, asserting structure, focus order, keyboard navigation, secrecy, teaser handling
- Store tests for new selection writables, recompute helpers, isolation across instances, inventory-change re-evaluation
- Source-contract tests for token migration (no `--fabricate-*` references in actor-app surfaces) and for container queries (no viewport `@media` in actor-app scoped CSS)
- Foundry smoke pointer tests + screenshots for normal (1280×820) and stacked (960×740) container widths
- E2E flow tests rewritten for the new layout (existing `tests/e2e-crafting-flow.test.js`)

## Risk Hotspots

In descending order:

1. **Complex recipe source allocation** (Slice 3) is derived display data, not a real allocation contract. The screenshot suggests interactivity that the runtime does not support. Lock the inspector source UI to read-only badges and document this in `lang/en.json` tooltips.
2. **`RunSummary.svelte` test rewrite** in Slice 0 — `tests/components/run-summary.test.js` becomes `run-bands.test.js`. Plan rewrite, not extend.
3. **Recent History pagination** sits inside the Recent History band — separate from the main recipe-table pagination. Two distinct page-index writables required.
4. **Alchemy "Selected Recipe" inspector secrecy** — must use filtered `discoveredRecipes` writable. Test explicitly with hidden recipes for non-GM viewers.
5. **`CraftingAppRoot.svelte` legacy CSS** uses `--fabricate-primary` and rgba literals. Slice 0 must migrate or the V2 tab bar visibly mismatches.
6. **Container queries** (spec requirement 7 of `Fabricate product UI design system`). Current `ActorCraftingHeader` uses `@media (max-width: 620px)`. Must convert.
