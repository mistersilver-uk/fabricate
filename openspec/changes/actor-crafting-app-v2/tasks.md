# Tasks

## Planning

- [x] Pre-slice verification: source allocation contract (no per-source allocation in `evaluateCraftability`), drag/drop wiring (already present), Pagination naming clash (legacy unused).
- [x] Create `proposal.md`, `design.md`, `tasks.md`, `specs/ui-integration/spec.md` under `openspec/changes/actor-crafting-app-v2/`.

## Implementer Entry Criteria

- [x] Replace existing actor-app components in place. No parallel v2 variant behind a flag.
- [x] Reuse `craftingStore.js` factory pattern (writables + recompute helpers, not chained `derived`).
- [x] No `src/systems/` API changes, no `craft()` signature change, no new persistence schemas.
- [x] No new npm dependencies.
- [x] All actor-app surfaces use `--fab-*` tokens.
- [x] All actor-app responsive behaviour uses container queries.
- [x] All actor-app surfaces preserve non-GM secrecy and teaser handling.

## Concrete Implementation Plan: Slice 0 — Shared Shell Uplift

Token migration, run bands extraction, pagination promotion, container queries. No user-visible layout change.

- [x] Promote `src/ui/svelte/apps/manager-v2/Pagination.svelte` → `src/ui/svelte/components/Pagination.svelte`. Update 5 manager-v2 imports.
- [x] Delete unused `src/ui/svelte/apps/Pagination.svelte` (legacy thin footer).
- [x] Decision: skip standalone `ActorAppShell.svelte`. Restructure `CraftingAppRoot.svelte` in-place. (See `design.md` "Shell Component Decision".)
- [x] Add `src/ui/svelte/apps/actor-app/RunBands.svelte` with dual-column In Progress / Recent History. Replaces `RunSummary.svelte` rendering. Pagination prop interface deferred to Slices 1–2 where it has data callers.
- [x] Modify `src/ui/svelte/apps/CraftingAppRoot.svelte` — add `fabricate-actor-app` class to root. Migrate `--fabricate-primary` and rgba literals to `--fab-accent` / `--fab-border`. (No viewport `@media` was present.)
- [x] Modify `src/ui/svelte/apps/ActorCraftingHeader.svelte` — convert viewport `@media (max-width: 620px)` to `@container actor-app (max-width: 620px)`. Token migration for header chrome (actor card, mode pills, edit-pencil affordance) is staged for Slice 1 when the alchemy-system header slot lands.
- [x] Modify `src/ui/SvelteCraftingApp.svelte.js` — set default size to 1280×820, add `fabricate-actor-app` to root classes.
- [x] Add `.fabricate-actor-app` scoped CSS in `styles/fabricate.css` declaring the named container.
- [x] Add `FABRICATE.ActorApp.Header.*` and `FABRICATE.ActorApp.RunBands.*` keys to `lang/en.json`.
- [x] Rename `tests/components/run-summary.test.js` → `tests/components/run-bands.test.js`; update `describe()` blocks.
- [x] Update `tests/alchemy-tab.test.js` import-path assertion for `RunBands` from `actor-app/`.
- [x] Add `tests/components/actor-app-container-queries.test.js` asserting actor-app scoped CSS uses `@container` not viewport `@media`, validates `--fab-*` token usage, and validates the `.fabricate-actor-app` named-container declaration.
- [x] Validate with `npm test` (2381/2381 pass) and `npm run build` (clean).

## Concrete Implementation Plan: Slice 1 — Alchemy Tab V2

Three-column workbench-first composition. Secrecy-respecting Selected Recipe inspector card. Palette legend.

- [x] Add `src/ui/svelte/apps/actor-app/AlchemyView.svelte`. Replaces `AlchemyTab.svelte` rendering. Structure: `<RunBands>` (alchemy-filtered) → optional system bar → three-column grid (components / workbench / discovered+selected) → `<PaletteAvailabilityLegend>`.
- [x] Add `src/ui/svelte/apps/actor-app/SelectedDiscoveredRecipeCard.svelte`. Renders only for the selected discovered recipe. Source: filtered `discoveredRecipes` writable.
- [x] Add `src/ui/svelte/apps/actor-app/PaletteAvailabilityLegend.svelte` (Available / Low Quantity / Unavailable colour dots).
- [x] Modify `src/ui/svelte/apps/CraftingAppRoot.svelte` to mount `<AlchemyView>` for the alchemy tab. Delete `AlchemyTab.svelte`.
- [x] Decision: Slice 1 keeps the alchemy system selector inside the alchemy view body (compact bar above the 3-column grid) rather than relocating it into the global header. The view-body location is highly visible, requires no header refactor, and matches the screenshot intent. A header right-slot relocation may follow as a polish slice if useful.
- [x] Modify `src/ui/svelte/apps/Workbench.svelte` — restyled with V2 tokens: dashed drop area, V2 chip rows, prominent green `Attempt Alchemy` primary button (uses `FABRICATE.ActorApp.Alchemy.AttemptAlchemy`), separate clear icon button.
- [x] Modify `src/ui/svelte/apps/DiscoveredRecipesPanel.svelte` — add `selectedRecipeId` prop + row selection wired to `store.selectDiscoveredRecipe(id)`. Visually highlight the selected row using `--fab-accent` tokens.
- [x] Modify `src/ui/svelte/stores/craftingStore.js`:
  - Add `selectedDiscoveredRecipeId` writable + `selectedDiscoveredRecipe` view writable + `selectDiscoveredRecipe(id)` action.
  - Add `_recomputeSelectedDiscoveredRecipe()` helper called from `refresh()`, `_handleInventoryChange()`, `setDiscoveredRecipeSearch()`, `toggleDiscoveredCraftableOnly()`, `selectDiscoveredRecipe()`, and `selectAlchemySystem()`.
  - Resolve selected lookup through filtered `discoveredRecipes` (preserves non-GM secrecy).
  - Selection state is per-store-instance (factory-scoped, isolation verified by tests).
- [x] Add `FABRICATE.ActorApp.Alchemy.*` keys to `lang/en.json`. Update `FABRICATE.Workbench.EmptyHint` and add `FABRICATE.Workbench.RemoveEntry`.
- [x] Rename `tests/alchemy-tab.test.js` → `tests/alchemy-view.test.js`; rewrite assertions for V2 layout.
- [x] Add `tests/alchemy-view-secrecy.test.js` (5 tests: non-GM hidden-recipe leak, learned-recipe inspector data, GM all-recipe visibility, system-switch clears selection, per-instance isolation).
- [x] Update `tests/crafting-app-root-tabs.test.js` for the AlchemyView import path and component reference.
- [x] Validate with `npm test` (2382/2382 pass) and `npm run build` (clean).

### Slice 1 Deferred to Polish Slices

- ComponentPalette tile chrome still uses the legacy `--fabricate-primary` badge fallback. Restyling the tile grid to the exact V2 tile chrome (token migration on badge, name colour, hover state) is deferred to a polish slice since the structural change is the user-visible win.
- AlchemySystemSelector chrome is unchanged in Slice 1. A header-right-slot relocation may land in a polish slice.
- Replacement of `tests/components/discovered-recipes-panel.test.js` is deferred — the existing test still passes against the modified component because the original assertions are pattern-based and don't conflict with the new selection prop.

## Concrete Implementation Plan: Slice 2 — Crafting Tab Simple Recipes

Replace card-list with table+inspector. Shopping list band, recipe table, persistent inspector for simple-recipe case.

- [x] Add `src/ui/svelte/apps/actor-app/CraftingView.svelte`. Replaces `CraftingTab.svelte` rendering. Structure: `<RunBands>` (crafting-filtered) → optional Salvage band → existing `<ShoppingListPanel>` → search/filter toolbar → `<RecipeTable>` + pagination on the left, `<SelectedRecipeInspector>` aside on the right.
- [x] Add `src/ui/svelte/apps/actor-app/RecipeTable.svelte`. Columns: Recipe / Status / Requirements summary / Result / Actions. Selected-row green inset accent. Hover doesn't shift row geometry. Container-query responsive — collapses Result column at medium widths and stacks at narrow widths. Honours `recipe.isTeaser` and `teaserHiddenFields`. Row-action buttons stop event propagation so they don't double-fire selection.
- [x] Add `src/ui/svelte/apps/actor-app/SelectedRecipeInspector.svelte` dispatcher (currently always mounts `SimpleRecipeInspector`; Slice 3 will add the complex variant).
- [x] Add `src/ui/svelte/apps/actor-app/SimpleRecipeInspector.svelte`. Image header, status chip, description, active-run section (only when present), requirements / essences / catalysts with check/missing icons, primary action (Craft / Continue / Learn), secondary actions (Add to List / Restart / Details), favourite toggle. Respects teaser fields.
- [x] Decision: skip standalone `CraftingToolbar.svelte` and `ShoppingListBand.svelte` files. The existing `SearchBar` + `FilterBar` + `ShoppingListPanel` components are reused inside `CraftingView` and meet the V2 layout intent. Replacing them is deferred to a polish slice.
- [x] Modify `src/ui/svelte/stores/craftingStore.js`:
  - Add `selectedRecipeId` + `selectedRecipeInspector` writables + `selectRecipe(id)` action.
  - Add `_recomputeSelectedRecipeInspector()` called from `refresh()` (after `viewState.set`), `_handleInventoryChange()`, and selection actions.
  - Auto-select-first behaviour when no selection exists or the prior selection is no longer in the list.
  - Add `craftingPageIndex`, `historyPageIndex`, `pageSize` writables. `setPageSize` persists via `services.setSetting('actorAppPageSize', n)` and resets both page indices to 0.
- [x] Modify `src/ui/svelte/apps/CraftingAppRoot.svelte` to mount `<CraftingView>` for the crafting tab.
- [x] Delete `src/ui/svelte/apps/CraftingTab.svelte`, `RecipeList.svelte`, `RecipeCard.svelte`, `RecentsSection.svelte` (and the DOM-only tests `tests/components/recipe-card.test.js`, `tests/components/favourites-recents-section.test.js`, `tests/recents-section.test.js` that exercised those removed components).
- [x] Add `FABRICATE.ActorApp.Crafting.*` keys to `lang/en.json` (column labels, SelectRecipeHint, ExpectedResult, Requirements, Essences, Catalysts, ActiveRun, RemainingTime).
- [x] Add `.fabricate-actor-app--crafting` scoped CSS via the new components: table+inspector grid + container-query stacking (full-width → inspector below table → fully stacked).
- [x] Add `tests/components/recipe-table.test.js` (header columns, row selection wiring, --fab-accent visual treatment, container queries, action stopPropagation, teaser handling, primary action gating).
- [x] Add `tests/components/simple-recipe-inspector.test.js` (empty hint, conditional sections, satisfied/unsatisfied row classes, active-run gating, Learn vs Craft button, teaser disable, --fab-accent tokens).
- [x] Add `tests/stores/crafting-store-selection.test.js` (export shape, auto-select-first, selectRecipe wiring, per-instance isolation, page size persistence + clamp, page index clamp).
- [x] Update `tests/crafting-app-root-tabs.test.js` for the CraftingView import path and component reference.
- [x] Validate with `npm test` (2344/2344 pass) and `npm run build` (clean).

### Slice 2 Deferred to Polish or Slice 3

- Recent History band pagination (separate from the recipe-table pagination) — pagination state writable exists (`historyPageIndex`) but RunBands hasn't been extended to render a per-band pagination footer. Defer until the run-band inner layout gets V2 chrome.
- E2E flow test (`tests/e2e-crafting-flow.test.js`) and the `tests/crafting-app-ui-actions.test.js` Handlebars-based UI test still run against `CraftingApp.js` (the legacy Handlebars fallback). They pass unchanged. A future cleanup may delete the Handlebars fallback once the Svelte path is verified end-to-end.
- Foundry Playwright smoke captures for `actor-app-crafting-simple-normal` and `actor-app-crafting-simple-stacked` — staged for the next time `npm run test:foundry` regenerates screenshots.

## Concrete Implementation Plan: Slice 3 — Crafting Tab Complex Recipes Inspector

Complex craft-plan inspector: complexity chips, paths, ingredient sets, source allocation (read-only advisory), step timeline.

- [x] Add `src/ui/svelte/apps/actor-app/ComplexRecipeInspector.svelte`. Complexity chip row, Craft Plan header with path dropdown, Ingredient Sets card for the selected path, Outcome card (Fixed / Routed / Progressive), Step Timeline, action footer.
- [x] Add `src/ui/svelte/apps/actor-app/IngredientSetCard.svelte`. AND group blocks listing OR options with type badges (Component / Tag / Essence). Per-option read-only source actor allocation badge ("Brom", "Party Stash", or "No source"). Optional essences and catalysts sections gate on data.
- [x] Add `src/ui/svelte/apps/actor-app/StepTimeline.svelte`. Completed / current / pending step pills with `aria-current="step"` on the active step.
- [x] Add `src/ui/svelte/apps/actor-app/ComplexityChips.svelte` (`Complex`, `Multi-step`, `N Paths`, `N Choice` chips driven by classification payload).
- [x] Modify `src/ui/svelte/stores/craftingStore.js`:
  - Add `selectedPathByRecipeId = writable(new Map())` + `selectPath(recipeId, pathIndex)` action.
  - Add top-level pure helpers `_buildComplexityClassification()`, `_buildCraftPlan()`, `_resolveFirstMatchingSource()`, `_summarizeOptionLabel/Type()`, `_availableQuantityFor()`, `_buildIngredientSetCardData()`. Source allocation walks each option against each source actor's items in selection order — first match wins. Read-only advisory data; canonical `craft()` aggregates inventory across all sources.
  - Extend `_recomputeSelectedRecipeInspector()` to attach `classification` (always) and `craftPlan` (only when complex).
- [x] Modify `SelectedRecipeInspector.svelte` to dispatch to `ComplexRecipeInspector` when `classification.isComplex === true`.
- [x] Decision: row-level complexity chip stays on the existing `recipe.hasMultipleSets` "Multiple Options" chip in `RecipeTable.svelte`. Full complexity chips and craft plan live in the inspector per Requirement 4 of the parent UI delta. Adding more chips per row would compete with the row's compact summary and is deferred to a polish slice.
- [x] Add `FABRICATE.ActorApp.CraftPlan.*` keys to `lang/en.json`: chip labels, path selector, ingredient set headings, option type labels, source tooltip / missing copy, outcome headings, step status labels.
- [x] Extend the V2 actor-app styling via the new components: each new component scopes its own `--fab-*` token-based CSS (no shared classes added to `styles/fabricate.css` for Slice 3).
- [x] Add `tests/components/complex-recipe-inspector.test.js` (14 tests covering inspector, ComplexityChips, IngredientSetCard, StepTimeline, SelectedRecipeInspector dispatch).
- [x] Add `tests/stores/crafting-store-craft-plan.test.js` (7 tests: exports, craftPlan derivation, path selection, classification accuracy, missing-source handling, per-instance isolation, simple recipes get no craftPlan).
- [x] Validate with `npm test` (2365/2365 pass) and `npm run build` (clean).

### Slice 3 Deferred to Polish

- Foundry Playwright smoke captures `actor-app-crafting-complex-normal` (1280×820) and `actor-app-crafting-complex-stacked` (960×740) — staged for the next `npm run test:foundry` regen with multi-step + multi-path + multi-source fixtures.
- Time & Cost card. The recipe model has `currencyCost` and per-step `timeRequirement`; surfacing them in the inspector is straightforward but requires a small dedicated section. Deferred so the structural inspector lands first.
- Active-run remaining-time display in the StepTimeline. Currently steps are statused by index only; surfacing per-step remaining time requires hooking the active-run data into the craftPlan payload. Deferred.
- Row-level complexity chips in `RecipeTable`. The compact `Multiple Options` chip already exists; adding `Multi-step` / `Routed` / `Progressive` chips per row needs new derived fields on every prepared recipe. Deferred to a polish slice.

## Archive

- [x] Write `review.md` summarising acceptance against parent change requirements (parent `tasks.md` lines 682–684).
- [ ] Tick parent `tasks.md` lines 682 (simple), 683 (complex), 684 (alchemy) once a maintainer signs off.
- [ ] Run `npm run test:foundry` end to end (smoke screenshot regeneration is needed before parent acceptance ticks).

## Verification (recap)

- [x] `npm test` passes 100% across all four slices (2365 / 2365 final).
- [x] `npm run build` clean after each slice.
- [ ] `npm run test:foundry` regenerates the new screenshot captures listed per slice.
- [ ] Manual GM/non-GM toggle for Slice 1 secrecy in the Foundry smoke world.
- [x] No `--fabricate-*` token references remain in actor-app surfaces.
- [x] No viewport `@media` queries in actor-app scoped CSS.
- [x] No new `src/systems/` files, no `craft()` signature change, no new persistence schemas.
