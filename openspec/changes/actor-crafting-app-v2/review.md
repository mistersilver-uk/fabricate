# Review: Actor Crafting App V2

This change implements the V2 redesign of the player-facing Actor Crafting app
(Alchemy + Crafting tabs) as four sequenced slices on top of the parent change
`fabricate-ui-design-system-manager-v2/specs/ui-integration/spec.md`.

## Acceptance Against Parent Requirements

### `Actor Alchemy App design direction` (Slice 1)

| Spec rule | How it ships |
| --- | --- |
| 1. Shared actor/source header + mode tabs + alchemy-system selector when multiple alchemy systems exist | `ActorCraftingHeader` (unchanged identity), `CraftingAppRoot` tab pills (V2 tokens), `AlchemyView` renders the `AlchemySystemSelector` when `alchemySystems.length > 1`. |
| 2. Workbench-first surface: palette, workbench, discovered recipes, active runs, recent history | `AlchemyView` is the 3-column workbench-first grid with `RunBands` above. |
| 3. No Crafting-only chrome (shopping list, normal recipe browser, recents, favourites, GM authoring) | The Alchemy view only mounts alchemy-relevant components. |
| 4. Palette shows selected-system components with available quantity (inventory − workbench) | `_buildPalette` (unchanged from current) plus the V2 tile chrome in `ComponentPalette`. |
| 5. Zero-quantity entries remain visible but visually distinct | `ComponentPalette` keeps the `--empty` modifier and the zero badge. |
| 6. Palette interactions (click add, right-click remove, drag/drop) | Pre-slice verification confirmed drag/drop is wired; `Workbench` accepts drops via the `dragDrop` action. |
| 7. Workbench is the central composition surface with grouped quantities, clear-all, single primary attempt action | Restyled `Workbench.svelte` with prominent green "Attempt Alchemy" button + clear icon button. |
| 8. Discovered recipes panel always visible, empty state copy without leaking hidden data | `DiscoveredRecipesPanel` empty state uses `FABRICATE.Alchemy.NoDiscoveredRecipes` + `NoDiscoveredRecipesHint`. |
| 9. Non-GM sees only learned recipes; GM sees all | Existing `_buildDiscoveredRecipes` filter unchanged. |
| 10. Craftable-only filter against full palette/source quantities | Existing `_evaluateDiscoveredCraftability` unchanged. |
| 11. Auto-fill follows first-satisfiable-set with partial fallback | Existing `resolveAutoFill` unchanged. |
| 12. Selected discovered-recipe detail shows expected result, required components, required essences, missing state | New `SelectedDiscoveredRecipeCard` consuming the `selectedDiscoveredRecipe` payload from the store. |
| 13. Failed no-signature attempts MUST NOT reveal hidden recipe identity to non-GMs | Selected-recipe lookups go through the **filtered** `discoveredRecipes` list — verified by `tests/alchemy-view-secrecy.test.js`. Pre-existing alchemy attempt feedback semantics are unchanged. |
| 15. Active runs and recent history filtered to alchemy systems | `RunBands` receives `alchemyRuns` / `alchemyRunHistory` (existing filtered writables). |
| 16. Screenshots prove component palette / workbench / discovered+selected / active+history / no-leak / narrow-width | Smoke screenshot regeneration deferred — needs `npm run test:foundry`. |

### `Actor Crafting App design direction` (Slices 2 + 3)

| Spec rule | How it ships |
| --- | --- |
| 1. Shared actor/source header + mode tabs | `CraftingAppRoot` shell + `ActorCraftingHeader` with V2 tokens. |
| 2. Browse-first: active runs, recent history, shopping list, search/filter toolbar, recipe table, selected-recipe inspector | `CraftingView` renders RunBands → optional Salvage band → ShoppingListPanel → toolbar → RecipeTable + SelectedRecipeInspector aside. |
| 3. No GM rails / admin breadcrumbs / import/export / authoring | Confirmed — the player view only has player actions. |
| 4. Recipe rows summarize requirements/results, not full structure | `RecipeTable` rows show Status, Requirements counters (X/Y), Result (truncated), Actions. |
| 5. Row summaries use data-backed labels and counts for required groups, optional, paths, choices, fixed/routed/progressive results, locked/learnable, in-progress | Status chips + requirement counters + the existing "Multiple Options" chip drive row complexity hints. Per-row complexity chips beyond `hasMultipleSets` are deferred (see Slice 3 Deferred). |
| 6. Selected-recipe inspector carries full craft plan for complex recipes | `ComplexRecipeInspector` renders complexity chips, path selector, ingredient set card, outcome card, step timeline, action footer. |
| 7. Path selector represents ingredient-set alternatives, shows selected + satisfiable | `ComplexRecipeInspector` path `<select>`; each option renders `Currently satisfiable` or `Missing materials`. |
| 8. AND across groups, OR across options | `IngredientSetCard` stacks groups vertically; OR groups show a "Choose one" header above their options. |
| 9. Source allocation per row when multiple sources are involved | `IngredientSetCard` renders a per-option source badge ("Brom", "Party Stash", "No source"). **Read-only advisory** — see "Source Allocation Contract" below. |
| 10. Result presentation distinguishes fixed / routed / progressive / learn / locked / failed | Outcome card has three variants. Learn/locked/failed flow through the simple inspector via existing `recipe.statusLabel` / `recipe.canLearn`. |
| 11. Multi-step active runs show current step + step timeline | `StepTimeline` renders completed / current / pending pills with `aria-current="step"`. Per-step remaining time deferred. |
| 12. Continue/start/cancel/details/add-to-list/favourite reachable at normal + narrow widths | Inspector action footer + table row actions. Narrow-width stacking via `@container` queries. |
| 13. Shopping list aggregation is Crafting-only and uses the selected/satisfiable path | Existing `aggregateShoppingList` unchanged; sits in the Crafting view only. |
| 14. Non-GM users MUST NOT see hidden recipe metadata through the inspector | `_recomputeSelectedRecipeInspector()` reads from the visibility-filtered `viewState.recipes`; teaser fields are masked in the prepared shape. |
| 15. Screenshots prove simple/complex states, inspector, paths, source allocation, timeline, shopping list, row actions, focus states, narrow stacking | Smoke screenshot regeneration deferred — needs `npm run test:foundry`. |

## Source Allocation Contract

Per-slice verification (recorded in `design.md`) confirmed `RecipeManager.evaluateCraftability()` returns aggregate counts only — no per-source-actor allocation — and `CraftingEngine.craft()` does not accept user-provided allocation. Slice 3 therefore derives source allocation in `craftingStore.js` (not in `src/systems/`) as **advisory display data**:

- For each ingredient option in the active path, the store walks source actors in selection order and the first actor with a matching item is shown as the supplier badge.
- The user **cannot** reassign sources through the inspector. There is no `onReassignSource` callback or analogous wiring.
- `craft()` continues to aggregate inventory across all source actors as before.

Tests verify the advisory derivation: see `tests/stores/crafting-store-craft-plan.test.js` ("builds a craftPlan with paths, source allocation, and outcome…", "marks unsatisfiable paths and missing source allocation when no items match") and `tests/components/complex-recipe-inspector.test.js` ("source allocation is read-only display only").

## Constraints Honoured

- **No new `src/systems/` files**. All new logic lives in `src/ui/svelte/apps/actor-app/` and additions to `src/ui/svelte/stores/craftingStore.js`.
- **No `craft()` signature change**, no new persistence schemas, no new module ids.
- **No new npm dependencies**.
- **Tokens**: actor-app surfaces use `--fab-*` exclusively. Verified by `tests/components/actor-app-container-queries.test.js` and `tests/components/simple-recipe-inspector.test.js` / `tests/components/complex-recipe-inspector.test.js` token assertions.
- **Container queries**: actor-app responsive behaviour uses `@container actor-app` queries, not viewport `@media`. Verified by `tests/components/actor-app-container-queries.test.js`.
- **Secrecy**: `tests/alchemy-view-secrecy.test.js` (5 tests) verifies non-GM viewers cannot leak hidden recipe data through `selectedDiscoveredRecipeId` even when forced.
- **Per-instance isolation**: `tests/stores/crafting-store-selection.test.js` and `tests/stores/crafting-store-craft-plan.test.js` verify `selectedRecipeId`, `selectedPathByRecipeId`, and selection state do not leak between store instances.

## Validation

- `npm test` — 2365 / 2365 pass
- `npm run build` — clean
- `npm run test:foundry` — pending (smoke screenshot regeneration)

## Files Touched

### Added
- `openspec/changes/actor-crafting-app-v2/{proposal,design,tasks,review}.md`
- `openspec/changes/actor-crafting-app-v2/specs/ui-integration/spec.md`
- `src/ui/svelte/components/Pagination.svelte` (promoted from manager-v2)
- `src/ui/svelte/apps/actor-app/RunBands.svelte`
- `src/ui/svelte/apps/actor-app/AlchemyView.svelte`
- `src/ui/svelte/apps/actor-app/SelectedDiscoveredRecipeCard.svelte`
- `src/ui/svelte/apps/actor-app/PaletteAvailabilityLegend.svelte`
- `src/ui/svelte/apps/actor-app/CraftingView.svelte`
- `src/ui/svelte/apps/actor-app/RecipeTable.svelte`
- `src/ui/svelte/apps/actor-app/SelectedRecipeInspector.svelte`
- `src/ui/svelte/apps/actor-app/SimpleRecipeInspector.svelte`
- `src/ui/svelte/apps/actor-app/ComplexRecipeInspector.svelte`
- `src/ui/svelte/apps/actor-app/IngredientSetCard.svelte`
- `src/ui/svelte/apps/actor-app/StepTimeline.svelte`
- `src/ui/svelte/apps/actor-app/ComplexityChips.svelte`
- `tests/alchemy-view.test.js` (renamed from alchemy-tab.test.js, rewritten)
- `tests/alchemy-view-secrecy.test.js`
- `tests/components/run-bands.test.js` (renamed from run-summary.test.js)
- `tests/components/actor-app-container-queries.test.js`
- `tests/components/recipe-table.test.js`
- `tests/components/simple-recipe-inspector.test.js`
- `tests/components/complex-recipe-inspector.test.js`
- `tests/stores/crafting-store-selection.test.js`
- `tests/stores/crafting-store-craft-plan.test.js`

### Modified
- `src/ui/SvelteCraftingApp.svelte.js` (default size 1280×820, `fabricate-actor-app` class)
- `src/ui/svelte/apps/CraftingAppRoot.svelte` (tab bar tokens, mounts AlchemyView/CraftingView)
- `src/ui/svelte/apps/ActorCraftingHeader.svelte` (container queries)
- `src/ui/svelte/apps/Workbench.svelte` (V2 chrome, "Attempt Alchemy" primary button)
- `src/ui/svelte/apps/DiscoveredRecipesPanel.svelte` (row selection)
- `src/ui/svelte/apps/manager-v2/{ComponentsBrowserView,EnvironmentsBrowserView,EssenceBrowserView,RecipesBrowserView,SystemsBrowserView}.svelte` (Pagination import path)
- `src/ui/svelte/stores/craftingStore.js` (new selection writables, recompute helpers, classification + craft plan derivation)
- `styles/fabricate.css` (`.fabricate-actor-app` named container)
- `lang/en.json` (`FABRICATE.ActorApp.*` namespace, Workbench keys)
- `tests/crafting-app-root-tabs.test.js` (AlchemyView + CraftingView import assertions)
- `tests/alchemy-view.test.js` import-path assertion
- `tests/components/manager-v2-mounted.test.js` (Pagination promoted to shared)

### Deleted
- `src/ui/svelte/apps/Pagination.svelte` (legacy, unused)
- `src/ui/svelte/apps/manager-v2/Pagination.svelte` (moved)
- `src/ui/svelte/apps/RunSummary.svelte` (replaced by RunBands)
- `src/ui/svelte/apps/AlchemyTab.svelte` (replaced by AlchemyView)
- `src/ui/svelte/apps/CraftingTab.svelte` (replaced by CraftingView)
- `src/ui/svelte/apps/RecipeList.svelte` (replaced by RecipeTable)
- `src/ui/svelte/apps/RecipeCard.svelte` (replaced by RecipeTable rows)
- `src/ui/svelte/apps/RecentsSection.svelte` (V2 layout drops Recently Crafted in favour of Recent History runs)
- `tests/components/recipe-card.test.js`, `tests/components/favourites-recents-section.test.js`, `tests/recents-section.test.js` (DOM-only tests of removed components)

## Outstanding Before Archive

1. **Foundry smoke screenshot regen** — run `npm run test:foundry` to capture `actor-app-alchemy-normal` / `-stacked`, `actor-app-crafting-simple-normal` / `-stacked`, `actor-app-crafting-complex-normal` / `-stacked`. Smoke fixtures should include at least one multi-step + multi-path + multi-source recipe to exercise the complex inspector + step timeline.
2. **Manual GM / non-GM secrecy verification** — log in as a non-owner user in the smoke world and confirm hidden alchemy recipes never appear in `discoveredRecipes`, `selectedDiscoveredRecipeId`, or the Selected Recipe inspector card.
3. **Parent change tasks.md tick** — once 1 and 2 are signed off, tick parent lines 682 (simple), 683 (complex), 684 (alchemy).
