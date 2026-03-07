# Agent Backlog

Purpose: keep agent work explicit, reviewable, and testable.

## Task Rules

- Each task must include: `ID`, `Title`, `Status`, `Description`, `Acceptance Criteria`.
- All tasks marked as `done` must have a `Resolution` note.
- Keep descriptions short and concrete (what to do, where to do it, why it matters).
- Acceptance criteria must be verifiable (tests, docs, behavior, or decision outcomes).
- When new work is discovered, add new tasks immediately and link dependencies.
- When necessary, update existing tasks to reflect changes to acceptance criteria or implementation.
- Do not close a task until all acceptance criteria are satisfied.

## Status Values

- `todo`
- `in_progress`
- `blocked`
- `done`

## Task Template

```md
### T-XXX - <Short Title>
- Status: <todo|in_progress|blocked|done>
- Description: <1-3 concise sentences with scope and intent>
- Acceptance Criteria:
  1. <verifiable outcome>
  2. <verifiable outcome>
  3. <verifiable outcome>
- Error (if any):
- Resolution:
```

## Tasks

## Competitive Analysis Gap Tasks

### T-057 - Implement Recipe Tree/Graph Visualization
- Status: `todo`
- Description: Add a visual progression view that shows recipe relationships so players and GMs can understand crafting paths beyond a flat list.
- Acceptance Criteria:
  1. Crafting UI provides a tree/graph view for a selected crafting system.
  2. Graph edges are derived from recipe output components used as inputs in downstream recipes.
  3. Nodes support direct navigation to recipe details/editor context from the graph.
  4. Cycles and disconnected subgraphs are handled safely without runtime errors.
  5. Filtering by category and search term is supported in graph view.
  6. Unit tests validate graph construction logic for linear chains, branching graphs, and cyclic data.

### T-059 - Add Shopping List and Missing-Materials Summary
- Status: `todo`
- Description: Provide a consolidated planning view showing which materials are still needed for one or more target recipes.
- Acceptance Criteria:
  1. Users can add/remove recipes to a shopping list from recipe browse/detail UI.
  2. Shopping list view aggregates required component quantities across all selected recipes.
  3. View displays `have`, `need`, and `missing` values based on selected component source actors.
  4. Duplicate component requirements from multiple recipes are merged correctly.
  5. List updates reactively when selected actors or recipe quantities change.
  6. Unit tests verify aggregation math, actor-source switching, and empty-list behavior.

### T-061 - Implement Partial Recipe Discovery / Teaser Mode
- Status: `todo`
- Description: Add an optional visibility mode where undiscovered recipes can appear as partial teasers, revealing identity/progress while hiding full requirements until discovery conditions are met.
- Acceptance Criteria:
  1. Systems can enable/disable teaser mode independently of existing visibility modes.
  2. Teaser recipes display limited metadata (e.g., name/category) while hiding configurable fields (ingredients/results/details).
  3. Discovery progress is tracked per actor/user and supports threshold-based unlocks.
  4. Fully discovered recipes automatically transition from teaser to normal visibility.
  5. Existing visibility modes (`global`, `player`, `knowledge`) continue to work unchanged when teaser mode is off.
  6. Unit tests cover teaser rendering, unlock transitions, and permission boundaries.

### T-063 - Add Gathering/Harvesting Workflow
- Status: `todo`
- Description: Introduce an optional gathering/harvesting flow so ingredient acquisition can be run as a first-class Fabricate action instead of a separate custom process.
- Acceptance Criteria:
  1. Systems can define gathering activities with outputs, checks, and optional tool/catalyst requirements.
  2. GMs are able to control the availability (toggle on/off) of gathering activities.
  3. Players can run gathering actions from UI and receive generated components/results into inventory.
  4. Gathering supports success/failure outcomes and configurable on-fail consumption behavior.
  5. Activity execution records history/audit data consistent with existing run-management patterns.
  6. Feature is gated behind a system toggle and has no behavioral impact when disabled.
  7. Unit/integration tests cover simple success, failed check, and invalid configuration paths.

## Spec Alignment Tasks

## Documentation Recommendation Tasks

### T-074 - Add Screenshots and GIFs Across Core Documentation
- Status: `todo`
- Description: Add high-value visual walkthrough media to core docs pages so first-time GMs can follow UI workflows without relying on dense text. Create and embed the exact captures identified in recommendation D1, store them in `docs/images/`, and keep assets optimized for docs-site performance.
- Acceptance Criteria:
  1. `docs/images/` contains all seven required assets with descriptive filenames: quickstart system creation GIF, quickstart managed-items drag/drop GIF, recipe editor screenshot, crafting app status-badges screenshot, visibility mode-switching GIF, essences card screenshot, and multi-step run-progress screenshot.
  2. Required embeds are present in the intended pages and sections: `docs/quickstart.md` (step 2 and step 3), `docs/recipes/index.md` (recipe editor and crafting app sections), `docs/visibility.md` (visibility mode section), `docs/essences.md` (feature card section), and `docs/recipes/multi-step.md` (run progress section).
  3. Every image/GIF embed includes meaningful alt text describing the UI state and user action shown.
  4. GIF files are optimized to <= 2 MB each, cropped to the relevant panel, and reduced to a frame rate suitable for docs playback.
  5. All image paths resolve correctly in the built docs site with no broken media links.
  6. A short contributor note is added in docs guidance describing where media files live and optimization constraints for new captures.

## Integration Tasks

## Defect Tasks

### T-087 - Fix Recipe Matching on Foundry v12+ (`_stats.compendiumSource` vs `core.sourceId`)
- Status: `todo`
- Description: Diagnose and fix false "Cannot craft" and "Craftable only" filtering failures caused by deprecated `core.sourceId` matching. On Foundry v12+, recipe/item/component matching must use `_stats.compendiumSource` as the primary source UUID with legacy fallback support so linked recipe items and managed components resolve correctly.
- Acceptance Criteria:
  1. Root-cause is documented in code comments and/or task notes: craftability visibility currently fails when matching logic only reads `flags.core.sourceId`, causing `RecipeVisibilityService.evaluateRecipeAccess(...)` to return non-craftable for actors that do own matching items via `_stats.compendiumSource`.
  2. A shared source-UUID resolver is implemented (or equivalent centralized helper) that reads `_stats.compendiumSource` first, then falls back to legacy `flags.core.sourceId` for backward compatibility.
  3. Recipe-knowledge matching is updated to use the shared resolver in `src/systems/RecipeVisibilityService.js` so knowledge-gated recipes are correctly visible/craftable and no longer incorrectly filtered out by "Craftable only".
  4. Ingredient/catalyst/component matching paths that still depend on `flags.core.sourceId` are updated to use the same resolver (including `src/systems/RecipeManager.js` and `src/systems/CraftingEngine.js`) so behavior is consistent across crafting and salvage flows.
  5. Tests are added/updated to cover both modern and legacy item provenance fields: matching succeeds for `_stats.compendiumSource`, still succeeds for legacy `flags.core.sourceId`, and "Craftable only" includes recipes when actor inventory satisfies requirements.
  6. Documentation is updated to reflect Foundry v12+ behavior: replace/augment references to `core.sourceId` with `_stats.compendiumSource` + legacy fallback in the relevant docs/spec pages (`docs/visibility.md`, `spec/006-recipe-visibility.md`, and any related references).
  7. `docs/troubleshooting.md` includes a symptom entry for "recipe appears uncraftable despite owning recipe item/components" with a check for compendium source UUID linkage and expected behavior after the fix.
  8. Verification notes include at least one manual reproduction using an actor-owned copy created from compendium/world source where recipe becomes craftable and remains visible when "Craftable only" is enabled.
