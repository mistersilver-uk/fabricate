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
- Status: `done`
- Description: Add a visual progression view that shows recipe relationships so players and GMs can understand crafting paths beyond a flat list.
- Acceptance Criteria:
  1. Crafting UI provides a tree/graph view for a selected crafting system.
  2. Graph edges are derived from recipe output components used as inputs in downstream recipes.
  3. Nodes support direct navigation to recipe details/editor context from the graph.
  4. Cycles and disconnected subgraphs are handled safely without runtime errors.
  5. Filtering by category and search term is supported in graph view.
  6. Unit tests validate graph construction logic for linear chains, branching graphs, and cyclic data.
- Resolution: Added "Graph" tab to RecipeManagerApp with `recipeGraphBuilder.js` (pure-function graph construction, Sugiyama-style layered layout, DFS cycle detection, category/search filtering) and `RecipeGraphTab.svelte` (SVG edges + HTML node overlays, pan/zoom, category filter, search, cycle edge dashed styling). Edges derived from recipe output componentIds matching downstream recipe input componentIds. Nodes clickable to navigate to recipe editor. Disconnected subgraphs laid out side by side. adminStore gains lazy graph computation and setGraphSearch action. 7 new localization keys. 31 new tests (22 builder, 4 store, 5 component), 1218 total passing. Reviewed and approved (1 round). Minor cosmetic CSS selector issue noted (non-blocking).

### T-059 - Add Shopping List and Missing-Materials Summary
- Status: `done`
- Description: Provide a consolidated planning view showing which materials are still needed for one or more target recipes.
- Acceptance Criteria:
  1. Users can add/remove recipes to a shopping list from recipe browse/detail UI.
  2. Shopping list view aggregates required component quantities across all selected recipes.
  3. View displays `have`, `need`, and `missing` values based on selected component source actors.
  4. Duplicate component requirements from multiple recipes are merged correctly.
  5. List updates reactively when selected actors or recipe quantities change.
  6. Unit tests verify aggregation math, actor-source switching, and empty-list behavior.
- Resolution: Added `shoppingListAggregator.js` pure function that multiplies ingredient needs by recipe quantity, deduplicates by componentId (priority: componentId > itemUuid > description), and computes have/need/missing per material. `ShoppingListPanel.svelte` collapsible panel with quantity controls, materials table with color-coded status, clear/remove actions. Cart button on `RecipeCard` adds to list. `craftingStore` gains 5 shopping list actions with reactive refresh. Session-scoped (clears on app close). 40 new tests (15 aggregator, 14 store, 11 component), 1261 total passing. Minor: recipe entries display raw IDs instead of names (cosmetic, non-blocking). Reviewed and approved (1 round).

### T-061 - Implement Partial Recipe Discovery / Teaser Mode
- Status: `done`
- Description: Add an optional visibility mode where undiscovered recipes can appear as partial teasers, revealing identity/progress while hiding full requirements until discovery conditions are met.
- Acceptance Criteria:
  1. Systems can enable/disable teaser mode independently of existing visibility modes.
  2. Teaser recipes display limited metadata (e.g., name/category) while hiding configurable fields (ingredients/results/details).
  3. Discovery progress is tracked per actor/user and supports threshold-based unlocks.
  4. GMs can manually configure visibility progress per user like in player mode.
  5. Alternatively, GM's can create a list of parts/fragments associated with in-game items that allow the players to learn part of a recipe if they haven't already learned that fragment yet.
  6. For both modes, players can see their progress towards unlocking/learning recipes.
  7. Fully discovered recipes automatically transition from teaser to normal visibility.
  8. Existing visibility modes (`global`, `player`, `knowledge`) continue to work unchanged when teaser mode is off.
  9. Unit tests cover teaser rendering, unlock transitions, and permission boundaries.
- Resolution: Added `teaser` as fourth listMode. Recipe model gains `teaser` field with `hiddenFields`, `revealThreshold`, `teaserDescription`. System-level `teaserConfig` with `enabled`, `discoveryMode` (threshold/fragments/both), and fragment definitions linked to item UUIDs. `RecipeVisibilityService` gains teaser visibility branch with `_evaluateTeaserAccess()`, `discoverFragment()`, `setDiscoveryProgress()`, `getDiscoveryProgressForActor()`. `FragmentDiscoveryHook` hooks into Foundry `createItem` for automatic fragment discovery. `TeaserProgressEditor.svelte` for GM per-actor progress management. `craftingStore` masks recipe fields based on teaser state. `RecipeCard` shows progress bar overlay and teaser styling. `RulesTab` gains full teaser config section with fragment editor. Manual + fragment progress additive. 43 new tests (12 normalization, 17 visibility, 6 fragment hook, 4 store, 4 component), 1053 total passing. Reviewed and approved (1 round).

### T-063 - Add Gathering/Harvesting Workflow
- Status: `todo`
- Dependencies: `T-092`
- Description: Introduce an optional gathering/harvesting flow so ingredient acquisition can be run as a first-class Fabricate action instead of a separate custom process. Define explicit access rules, resolution-mode support, time costs, and attempt-limit behavior so GM expectations are deterministic.
- Acceptance Criteria:
  1. Systems can define gathering activities with outputs, checks, and optional tool/catalyst requirements.
  2. Feature is gated behind a system-level toggle and has no behavioral impact when disabled.
  3. Each gathering activity exposes GM-managed availability with explicit scope semantics: `global` (available to eligible users anywhere) or `activeSceneOwnedActor` (requires an active scene token and actor ownership by the user).
  4. Access checks are enforced before execution and return clear user-facing errors for disabled activity, missing ownership, or missing active-scene context.
  5. Gathering explicitly defines supported resolution modes (and unsupported modes) in spec/docs, with validation errors for invalid mode configuration.
  6. Activities support an explicit time requirement contract (required duration + unit), surfaced in UI and persisted in run history/audit data.
  7. Activities support attempt-limit policy per actor (default unlimited), with configurable cap/window semantics and GM override behavior documented.
  8. Players can run gathering actions from UI and receive generated components/results into inventory.
  9. Gathering supports success/failure outcomes and configurable on-fail consumption behavior.
  10. Unit/integration tests cover access-scope gating, resolution-mode validation, time-requirement handling, attempt-limit enforcement/reset behavior, simple success, failed check, and invalid configuration paths.

### T-088 - Implement `rollTableOutcome` Provider in Unified Routed Resolution
- Status: `done`
- Dependencies: `T-165`, `T-166`
- Description: Implement recipe-level `resultSelection.provider = "rollTableOutcome"` in the unified mapped+tiered routed model so GMs can drive result-group selection from a Foundry roll table instead of only explicit mapping or macro outcomes.
- Acceptance Criteria:
  1. `Recipe.resultSelection.provider` supports value `rollTableOutcome` alongside `ingredientSet` and `macroOutcome`.
  2. Recipe editor UI supports selecting a roll table UUID/id and defining deterministic roll-result-to-result-group mapping.
  3. Craft execution with `rollTableOutcome` rolls exactly once per attempt and resolves one result group deterministically.
  4. Missing table, missing mapping, and duplicate/ambiguous mapping states are validation errors that block save or craft with clear diagnostics.
  5. Chat/audit output records provider type and rolled value/result used for routing.
  6. Backward compatibility is preserved for legacy tiered macro-routing data through migration/normalization.
  7. Unit/integration tests cover happy path, invalid table reference, unmapped result handling, and regression safety for other providers.
- Resolution: Added `resultSelection` field to Recipe model with `_normalizeResultSelection()` for legacy migration. `ResolutionModeService.resolveByRollTable()` draws from Foundry roll table exactly once, matches drawn result name to ResultGroup.name (case-insensitive, trimmed). Reserved fail keywords (fail*, miss*, nothing, none, whiff*) handled. Validation blocks save on missing UUID, duplicate group names, reserved keywords as group names. Chat output displays drawn result. Editor UI has provider selector with roll table UUID input. 39+ new tests, 1148 total passing. Reviewed and approved (2 rounds).

### T-097 - Add Compendium Import with UUID Override and Fallback Item IDs
- Status: `done`
- Description: Allow crafting systems to be imported from compendiums with robust item-link remapping so imported recipes/components remain recognized across worlds and content variants.
- Acceptance Criteria:
  1. Crafting system manager supports importing crafting data from one or more selected compendium packs (at minimum components and recipes).
  2. Import flow supports UUID override/remap for linked source items by matching on source reference and item name when direct UUID linkage is unavailable or changed.
  3. UUID remap precedence is deterministic and documented (exact source UUID match first, then configured source+name match rules, then unresolved state).
  4. Components/recipe links can store fallback item IDs (one or many) and these IDs are used at runtime when primary UUID matching fails.
  5. Import options allow fallback item IDs to be explicitly provided and/or retained from existing data so previously recognized items continue to resolve after re-import.
  6. Import summary reports remapped links, retained fallback IDs, unresolved links, and any collisions requiring GM review.
  7. Matching logic used by crafting/visibility paths is updated (or shared) to honor primary UUID + fallback ID resolution consistently.
  8. Unit/integration tests cover: successful import, source+name UUID override, fallback-ID retention across re-import, unresolved-link reporting, and no regression to legacy UUID-only workflows.
- Resolution: Created `CompendiumImporter` service with `importFromPackData()`, `_remapComponentUuids()` (exact→source+name→unresolved precedence), `_findBySourceAndName()`, structured import summary (remapped/retained/unresolved/collisions). Added `fallbackItemIds` array to component normalization in CraftingSystemManager. Updated `ingredientMatchesItem()` and `_catalystMatchesItem()` in RecipeManager with fallback ID check between primary UUID and name match. Options: overwriteExisting, retainFallbackIds, additionalFallbackIds, targetPackIds. Wired into `game.fabricate.importFromPack()` and `game.fabricate.api.CompendiumImporter`. 12 new localization keys. 16 new tests (11 importer, 5 fallback matching), 615 total passing. Reviewed and approved (1 round).

### T-098 - Add Local Release Build Action for Dist-Ready Module Packaging
- Status: `done`
- Description: Create a local release build action that assembles a fully runnable module inside `dist/` (code, styles, packs, manifests, and required assets), rewrites a release-ready `module.json` from the root source manifest, and produces a shareable preview zip from that `dist/` output as the baseline for future GitHub Actions automation.
- Acceptance Criteria:
  1. A single local command/action (e.g. npm script or release script) builds release artifacts into `dist/` from a clean workspace.
  2. `dist/` contains everything required to load the module via symlink as end users would consume it: JS bundle(s), CSS, `module.json`, `packs/` (embedded compendiums), `lang/`, and any additional runtime-required files/assets.
  3. The generated `dist/module.json` is derived from the root `module.json` and rewritten for `dist/`-root execution (paths point to files inside `dist/`, not root-relative source paths).
  4. Manifest rewrite rules are deterministic and documented (including esmodule/style/pack path rewrites and any local preview version suffixing rules).
  5. Running the action produces a preview zip artifact inside `dist/` containing the packaged module exactly as distributed (no missing files, no extra source-only files).
  6. Zip naming/versioning follows a documented preview convention suitable for patron sharing (for example, includes module version + preview marker).
  7. A validation step verifies the packaged output can be symlinked and loaded by Foundry as a module without manual file copying.
  8. Documentation describes local release workflow and explicitly notes this action is the foundation for GitHub Actions automated release jobs.
- Resolution: Created `scripts/release.js` with exported utilities (`rewriteModuleJson`, `getRequiredFiles`, `validateDist`) and main build logic: clean dist/, vite build, copy static assets (styles, lang, packs, LICENSE, README), rewrite module.json for dist/-root execution, create preview zip. Three npm scripts: `npm run release` (full), `npm run release:build` (no zip), `npm run release:validate` (validate only). Deterministic manifest rewrite rules documented in JSDoc. Zip naming: `fabricate-v${version}-preview.zip`. Node.js built-ins only, no new dependencies. 22 new tests, 599 total passing. Reviewed and approved (1 round).

### T-099 - Implement Cauldron Crafting Resolution Mode
- Status: `done`
- Dependencies: `T-165`, `T-166`, `T-167`
- Description: Implement `cauldron` as a discovery-focused resolution mode where players submit ingredient combinations without browsing recipes, and routing uses the unified recipe-level provider model (`ingredientSet`, `macroOutcome`, `rollTableOutcome`) with hidden-recipe behavior and optional learn-on-craft visibility.
- Acceptance Criteria:
  1. `CraftingSystem.resolutionMode` supports `cauldron` and enforces single-step recipes only; multi-step recipes are invalid in cauldron mode.
  2. Player crafting UI for cauldron mode is attempt-based (ingredient submission) and does not expose full recipe listing/details up front.
  3. Input combination matching is deterministic and uses globally unique overlapping-signature constraints supplied by T-167.
  4. `learnOnCraft` controls visibility unlock: recipes are surfaced to players only when `learnOnCraft === true` and learning has occurred.
  5. Failed cauldron attempts consume by default (`consumeOnFail: true`), with explicit configuration override support.
  6. Result-group selection in cauldron uses recipe-level providers: `ingredientSet`, `macroOutcome`, `rollTableOutcome`.
  7. Failure feedback is clear but non-leaking (no hidden recipe metadata disclosure).
  8. Unit/integration tests cover discovery flow, consume-on-fail default, no-multi-step enforcement, learn-on-craft visibility behavior, and provider-specific routing.
- Resolution: Added `cauldron` resolution mode to CraftingSystemManager with `_normalizeCauldronConfig()` defaults. CraftingEngine gains `craftCauldron()` entry point with `_matchCauldronSignature()` using SignatureValidator for deterministic ingredient matching and `_consumeSubmittedCauldronItems()` with configurable consume-on-fail (default true). ResolutionModeService validates cauldron recipes (single-step only, ≥1 set/group, valid provider) and dispatches cauldron resolution branch. RecipeVisibilityService adds cauldron visibility (GM sees all, non-GM hidden/learned only) with `learnRecipeOnCraft()` and `hasLearnedRecipe()`. CraftingStore adds `isCauldronMode`, cauldron item management, and `submitCauldronAttempt`. New CauldronSubmitPanel.svelte component with drop zone and ingredient list. 39 new tests (27 engine, 12 store), 1187 total passing. Reviewed and approved (2 rounds).

### T-166 - Unify Mapped and Tiered into Routed Result Selection
- Status: `done`
- Dependencies: `T-165`
- Description: Replace split mapped/tiered resolution branching with a unified routed model where each recipe selects result-group routing via `resultSelection.provider` (`ingredientSet`, `macroOutcome`, `rollTableOutcome`), so behavior changes occur at recipe level instead of requiring global destructive mode changes.
- Acceptance Criteria:
  1. Unified routed execution path is implemented and used by both legacy mapped and tiered workflows.
  2. Recipe model/persistence supports `resultSelection.provider` and provider-specific config payloads.
  3. Deterministic migration/normalization maps legacy data: mapped -> `ingredientSet`, tiered -> `macroOutcome`.
  4. Existing mapped/tiered recipes continue to craft correctly after migration with no silent behavior drift.
  5. Recipe-level provider changes are validated and surfaced as recipe-scoped destructive/configuration warnings where required.
  6. Runtime and tests no longer depend on separate mapped vs tiered branching for result-group selection logic.
  7. Unit/integration tests cover provider selection, migration correctness, and backward-compatibility read paths.
- Resolution: Unified mapped/tiered into single `routed` mode with recipe-level `resultSelection.provider`. Recipe model gains `resultSelection` field with `_normalizeResultSelection()` migration (mapped→ingredientSet, tiered→macroOutcome). `ResolutionModeService.resolveResultGroups()` dispatches on provider in single routed branch. Reserved fail keywords handled with case-insensitive normalization. `CraftingSystemManager` normalizes legacy mode strings on read. Editor UI rebuilt with provider selector. Legacy backward-compat branches retained for non-normalized data. 40 new tests, 1012 total passing. Reviewed and approved (1 round).

### T-167 - Implement Overlapping Signature Uniqueness Validation (Components + Tags)
- Status: `done`
- Dependencies: `T-165`, `T-166`
- Description: Implement global uniqueness validation for satisfiable ingredient signatures across all recipes and ingredient groups in a crafting system, including tag-based matching expansion, and block save/import on collisions.
- Acceptance Criteria:
  1. Signature expansion includes component matches and tag-based matches (`any`/`all`) against the system component/tag graph.
  2. Overlapping satisfiable signatures are detected across all recipes in the same crafting system (not only exact textual duplicates).
  3. Save/import operations are blocked on collisions with actionable diagnostics identifying both conflicting recipe/ingredient-set paths.
  4. Revalidation runs when relevant recipe, component, or tag definitions change so new overlaps cannot persist silently.
  5. Collision diagnostics are surfaced in GM UI (recipe editor/manager) and API validation responses.
  6. Unit/integration tests cover component-vs-component overlap, component-vs-tag overlap, tag-vs-tag overlap, and no-false-positive scenarios.
- Resolution: Created `SignatureValidator` class with ingredient expansion (component and tag-type with any/all), group expansion (union of options), signature computation, and conservative union-intersection overlap detection. Integrated into `RecipeManager._validateRecipeForCreateOrUpdate()` to block save on collisions with diagnostic messages. Exposed via `game.fabricate.api.SignatureValidator`. Mode-agnostic (works across all modes, not just cauldron). 16 new tests covering all overlap scenarios. 1107 tests pass. Reviewed and approved (1 round).

## Spec Alignment Tasks

### T-092 - Spec Gathering/Harvesting Workflow Contract (Human-Reviewed)
- Status: `todo`
- Description: Define the authoritative functional and data-model specification for Gathering/Harvesting Workflow before implementation work proceeds. The spec must explicitly capture access rules, resolution-mode semantics, time requirements, attempt limits, and run-history behavior, and it must be ratified with human maintainer/GM input.
- Acceptance Criteria:
  1. A new spec doc is created (or existing spec extended) for gathering/harvesting behavior covering data model, validation, UI contract, and runtime lifecycle.
  2. The spec defines access gating semantics (system toggle, activity availability scope, ownership/active-scene requirements) with deterministic allow/deny outcomes.
  3. The spec defines supported/unsupported resolution modes and required check/result contracts for each supported mode.
  4. The spec defines time requirements (duration/unit) and attempt-limit policy (scope, reset window, defaults, and GM override behavior).
  5. The spec defines persistence/history expectations for active vs completed gathering runs, including retention and cleanup behavior.
  6. Human input is required and recorded: at least one maintainer/GM review pass captures unresolved decisions and final choices in the task notes or spec decision log.
  7. Final sign-off from a human reviewer is captured in backlog notes before `T-063` is started.
  8. `T-063` explicitly references this task as a prerequisite dependency and implementation does not proceed until this task is `done`.

### T-165 - Spec Update: Unified Routed Mode and Cauldron Crafting
- Status: `done`
- Description: Update the formal spec to remove legacy `mapped`/`tiered`, adopt `simple|progressive|routed|cauldron`, define recipe-level `resultSelection.provider` (`ingredientSet`, `macroOutcome`, `rollTableOutcome`) for routed/cauldron, and lock cauldron discovery/visibility/consumption semantics.
- Acceptance Criteria:
  1. `spec/001-overview.md` is updated to include the unified routed direction and `cauldron` mode.
  2. `spec/002-data-models.md` defines recipe-level `resultSelection.provider` contract with provider-specific required fields and `cauldron`-specific system config fields.
  3. `spec/004-resolution-modes.md` is updated so mapped/tiered behavior is expressed as provider-driven routing and includes `cauldron` mode semantics.
  4. `spec/005-recipes-and-steps.md` defines cauldron execution lifecycle, consume-on-fail default behavior, and explicit "no multi-step in cauldron" rule.
  5. `spec/006-recipe-visibility.md` defines cauldron visibility behavior where recipe surfacing to players occurs only when `learnOnCraft === true` and recipe is learned.
  6. Uniqueness rules are formalized as overlapping satisfiable signature detection across all recipes/ingredient groups in a system, including tag matching.
  7. Spec states that save/import must be blocked on uniqueness collisions with actionable conflict diagnostics.
  8. `spec/007-destructive-changes-and-migrations.md` defines migration and compatibility strategy from legacy mapped/tiered data into provider-based routing.
- Notes (Decision Log, 2026-03-07):
  1. `resolutionMode` target enum: `simple | progressive | routed | cauldron`; legacy mapped/tiered removed (pre-release cleanup).
  2. Cauldron remains its own mode; provider only controls result-group selection source.
  3. Macro return contract is object-based and shared across routed+cauldron `macroOutcome`: `{ outcome: string, description?: string }` (+ existing success/data fields).
  4. Reserved outcome words are trim-normalized, case-insensitive (`fail*`, `miss*`, `nothing/none`, `whiff*`); preferred documented terms are `fail` and `miss`; reserved words cannot be result-group names.
  5. Rolltable routing key is drawn result name.
  6. No-signature cauldron attempts are treated as failed attempts with ingredient consumption.
  7. Learning occurs only on successful completion; if `learnOnCraft` is false, recipes remain hidden to non-GMs.
  8. Cauldron uniqueness scope is all recipes in-system, blocks all saves when collisions exist, and import is partial with one aggregated conflict report.
  9. Unmigratable legacy recipes are deleted with cascade cleanup; removed objects are logged to console as JSON.
  10. If a matched cauldron attempt cannot route to a valid result-group value, classify as crafting-system misconfiguration error (GM-fix required).
- Resolution: All spec files were already fully updated prior to this task review. All 8 ACs and all 10 decision log items verified present across spec/001, spec/002, spec/004, spec/005, spec/006, and spec/007. No changes needed.

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
- Status: `done`
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
- Resolution: Already fully implemented prior to this task review. Shared resolver `getSourceUuid()` in `src/utils/sourceUuid.js` reads `_stats.compendiumSource` first with `flags.core.sourceId` fallback. Used by RecipeVisibilityService, RecipeManager, and CraftingEngine. 50 tests passing across 3 test files. Docs updated in visibility.md, spec/006, and troubleshooting.md. All 8 ACs verified.

### T-089 - Fix Favourites Layout and Filtering UX in Crafting App
- Status: `done`
- Description: Fix the crafting app favourites presentation so favourited recipes do not render as oversized cards ahead of the normal recipe list. Favourites must be exposed via a dedicated UX pattern (separate tab, distinct section, or explicit `Show favourites only` toggle) that keeps browse layout stable.
- Acceptance Criteria:
  1. Repro is documented from current UI state here `FAVOURITES` appears before the standard list with oversized icon rendering that disrupts list layout.
  2. Favourites are moved out of the inline pre-list oversized presentation into one supported pattern: separate tab, compact section matching normal card size, or `Show favourites only` toggle filter.
  3. Favourite recipe cards use the same visual sizing constraints as normal recipe cards (icon bounds, row height, spacing), with no unbounded image growth.
  4. Default browse flow remains focused on the normal recipe list; favourites view/filter is opt-in and does not push regular results off-screen.
  5. Existing favourite state persistence and toggle behavior remain unchanged.
  6. UI tests cover: default list rendering without oversized favourites, switching into favourites view/filter, and returning to full list without layout regressions.
  7. Manual verification notes include before/after screenshots at the same window size confirming stable layout and readable favourites UX.
- Resolution: Replaced standalone `FavouritesSection` component with a "Favourites only" toggle filter in `FilterBar`. Added `showFavouritesOnly` writable and `toggleFavouritesOnly` action to craftingStore. Favourited recipes now render using normal `RecipeCard` layout when filter is active. `FavouritesSection.svelte` deleted. FilterBar star toggle matches "Craftable only" button pattern. 6 new store tests, FilterBar tests added, FavouritesSection tests removed. 972 tests pass. Reviewed and approved (2 rounds).

### T-090 - Fix Recipe Display Labels and Icon Fallbacks in Crafting UI
- Status: `done`
- Description: Correct recipe presentation defects where ingredient/catalyst/component labels render as `undefined`, `item`, or `managed item` instead of human-readable names, and improve recipe icon selection so cards/details use source-item art when available with a clean fallback icon.
- Acceptance Criteria:
  1. Root-cause is documented for placeholder/undefined label output in recipe list/detail rendering (including catalyst lines and ingredient summary rows).
  2. Name resolution uses deterministic precedence and never renders `undefined` to users: explicit display name -> managed component name -> linked source item name -> localized fallback label.
  3. Generic placeholders (`item`, `managed item`) are not shown when a resolvable component or item name exists.
  4. Recipe icon selection follows deterministic precedence: recipe image override (if set) -> linked source item image (if available) -> fallback icon `icons/sundries/documents/document-bound-white-tan.webp`.
  5. Icon sizing and rendering remain consistent with recipe card layout (no stretching/overflow) in both list and detail/modal contexts.
  6. Missing/broken source item references degrade gracefully to the fallback icon without console errors or broken image glyphs.
  7. Tests cover label resolution (managed component, linked item, missing data), icon precedence, and fallback behavior in recipe list rendering.
  8. Manual verification notes include before/after screenshots confirming corrected names and fallback icon usage in the same UI context as the reported issue.
- Resolution: Added 6 name/icon resolution methods to RecipeManager (`resolveComponentName`, `resolveComponentNameAsync`, `resolveComponentImg`, `resolveResultDescription`, `resolveRecipeIcon`, `resolveRecipeIconAsync`). Fixed catalyst name (`undefined` → resolved via `resolveComponentName`), ingredient description (`"managed item"` → actual component name via `_resolveIngredientDescription`), and recipe icon fallback chain (custom → linked item → document icon). Added 3 localization fallback keys. 13 new tests, all passing. Known deferred: `resultDescription` in craftingStore still uses `Result.getDescription()` — wiring async resolver requires follow-on work. CHANGELOG and API docs updated. Reviewed and approved (1 round).

### T-091 - Fix Completed Simple Crafts Persisting as In-Progress and Double Chat Success
- Status: `done`
- Description: Resolve a UI/state regression where a completed simple (one stage) recipe correctly consumes/produces items but remains listed under in-progress runs, renders with an oversized in-progress icon, and emits a duplicate success chat message.
- Acceptance Criteria:
  1. Repro is documented: run a simple recipe that succeeds and verifies inventory updates; observe incorrect post-run state (`In Progress` entry remains), oversized in-progress card icon, and two success chat messages.
  2. Successful completion of a simple recipe clears it from active/in-progress run state immediately (or never inserts it there) and records it only in completed/recent history.
  3. Recently crafted cards use bounded icon sizing consistent with normal recipe-card constraints; no oversized icon rendering occurs in active-session UI.
  4. Exactly one success chat message is emitted per successful craft action when automatic chat output is enabled.
  5. If macro chat output is also configured, duplicate prevention rules are deterministic and documented so only one success summary is shown unless explicit multi-message behavior is enabled.
  6. Unit/integration tests cover simple-recipe completion state transitions, in-progress card rendering constraints, and single-message chat emission on success.
  7. Manual verification notes include before/after screenshots plus chat-log confirmation showing one success message for one successful craft.
- Resolution: Three fixes: (1) Added in-memory `_cache` Map to `CraftingRunManager` with cache-first `_getContainer()`, write-through `_persist()`, and `invalidateCache()` to eliminate stale-flag race after completion. (2) Removed duplicate `ChatMessage.create()` from `/craft` handler in `main.js`, replaced with `ui.notifications.info/error()`; CraftingEngine `_postCraftChatMessage` is now the single chat output path. (3) Added `max-width: 64px`, `max-height: 64px`, `object-fit: cover`, `flex-shrink: 0` to `.recipe-icon img` CSS. Tests, CHANGELOG, API docs, troubleshooting guide, and macro examples updated. Reviewed and approved (2 rounds).

### T-094 - Fix Items-Tab Search Pinning and Card Density in Crafting System Manager
- Status: `done`
- Description: Improve usability of the Crafting System Manager `Items` tab by keeping search/filter controls visible while scrolling and reducing unnecessary card whitespace caused by the `Drop to replace source` zone wrapping to a separate line.
- Acceptance Criteria:
  1. Repro is documented from current UI state: in the `Items` tab, search controls scroll out of view above the fold and item cards become overly tall due to the replace-source drop zone occupying its own line.
  2. The items-tab search bar/filter row is pinned (sticky) at the top of the scrollable items content area and remains visible while scrolling through long item lists.
  3. Sticky search behavior works within the manager window layout without overlapping tab headers, card controls, or list content.
  4. Item card layout is compacted so `Drop to replace source` affordance no longer creates excessive vertical whitespace (for example by placing it inline, as a compact control, or as a collapsed affordance).
  5. Drag-and-drop replace-source behavior remains fully functional after layout changes, including visual drop feedback and successful source replacement.
  6. Responsive behavior is defined for narrower manager widths so cards remain readable and controls do not overlap or clip.
  7. UI tests cover sticky search visibility during scroll and card-height/layout regressions in the items tab.
  8. Manual verification notes include before/after screenshots at the same window size showing pinned search controls and denser card layout.
- Resolution: Sticky search via `position: sticky` on `.admin-panel > .panel-toolbar`. Replace-source zone converted to absolute-positioned overlay on item image (opacity-based reveal on hover/drag-active, icon-only with tooltip). `use:dragDrop` action wired to per-card overlay with `onReplaceSource` threaded through RecipeManagerRoot. Fixed pre-existing bug: both `onDropItem` and `onReplaceSource` now use `get()` from svelte/store instead of broken `.get?.()`. 8 new tests. 970 tests pass. Reviewed and approved (2 rounds).

### T-095 - Fix Recipe Editor Error Visibility, Items Panel Pinning, and Card Overflow
- Status: `done`
- Dependencies: `T-096`
- Description: Fix recipe editor usability issues where validation feedback is lost above the fold, the system-items search control scrolls out of view, and system-item cards overflow/align poorly in the side panel.
- Acceptance Criteria:
  1. Repro is documented from current UI state: validation errors disappear when scrolling, system-items search is not pinned, and system-item cards overflow with non-centered content.
  2. An always-visible validation summary banner is pinned within the recipe editor viewport and updates live as validation state changes.
  3. Field-level validation errors remain visible at the offending controls/rows with clear inline messages and error styling, even when the summary banner is present.
  4. Clicking an entry in the validation summary scrolls/focuses the corresponding invalid field in the editor.
  5. The system-items search bar in the recipe editor side panel is pinned (sticky) and remains visible while scrolling through items and recipe settings.
  6. System-item cards are constrained to the container width with centered/aligned content, no horizontal overflow, and consistent spacing at supported window sizes.
  7. UI tests cover sticky error summary behavior, inline validation rendering, sticky system-items search during scroll, and no-overflow card layout in the recipe editor.
  8. Manual verification notes include before/after screenshots at the same window size confirming persistent error visibility, pinned search, and corrected card layout.
- Resolution: Three fixes: (1) Field-level inline error indicators added to recipe name input, ingredient group cards (`IngredientGroupCard`), and result group panels (`ResultGroupPanel`) via `hasError` props and `field-error`/`group-error` CSS classes. Click-to-scroll guarded to only expand collapsed panels. (2) Components panel search pinned via `.picker-sticky-header` wrapper with `position: sticky; top: 0`, panel changed to `overflow-y: auto`. (3) Card overflow fixed with `box-sizing: border-box; max-width: 100%; min-width: 0` and `-webkit-line-clamp: 2` on card names. 48 new tests (24 validation, 21 picker, 3 togglePanel guard). 1091 tests pass. Reviewed and approved (2 rounds).

### T-096 - Global UI Terminology Refactor: `System Items` -> `Components`
- Status: `done`
- Description: Define and execute a global terminology cleanup replacing user-facing `System Items` wording with `Components` (or approved final term) across UI, docs, and localization where it refers to managed crafting components.
- Acceptance Criteria:
  1. A terminology decision is documented with human maintainer sign-off for the canonical user-facing term and scope boundaries.
  2. All targeted UI labels/tooltips/headings are updated consistently, including the recipe editor side panel and crafting manager tabs.
  3. Localization keys/messages are updated without breaking backward compatibility for existing translations.
  4. Docs/spec references using old user-facing wording are updated or explicitly aliased.
  5. Regression review confirms no logic coupling relies on display strings and no mismatched mixed terminology remains in updated surfaces.
- Resolution: Changed 4 localization string values in `lang/en.json`: Admin tab "Items" → "Components", search placeholder "Search system items..." → "Search components...", editor side panel heading "System Items" → "Components", and empty hint updated to reference "Components" tab. Localization keys unchanged for backward compatibility. No doc/spec changes needed (no references existed). CHANGELOG updated. All 1027 tests pass. Reviewed and approved (1 round).

### T-168 - Fix Crafting App Launch Failure from Items Sidebar (`each_key_duplicate`)
- Status: `done`
- Description: Fix a rendering defect where clicking `Craft Item` from the Items sidebar header fails to open the Crafting App due to a Svelte `each_key_duplicate` error in `RunSummary.svelte` during application render.
- Acceptance Criteria:
  1. Reproduction is documented using the reported flow: click `Craft Item` in sidebar header -> app fails with `Failed to render Application "fabricate-crafting"` and `each_key_duplicate` pointing to `RunSummary.svelte`.
  2. Clicking `Craft Item` reliably opens the Crafting App without render exceptions.
  3. `RunSummary.svelte` list keying strategy is corrected so keys are always unique/stable for rendered rows, including edge cases where IDs may overlap across active/history collections.
  4. If upstream run data can contain duplicate IDs, normalization/guardrails are added before render so duplicate-key crashes cannot occur.
  5. Component/store tests cover duplicate-key-prone datasets and confirm rendering succeeds without throwing.
  6. Manual verification confirms no `each_key_duplicate` or `Failed to render Application "fabricate-crafting"` errors in console when opening from sidebar header.
- Resolution: Fixed with two-layer defense: (1) store-level deduplication in `_buildPreparedRecipes` filters duplicate run IDs via Set before data reaches components, (2) composite `{#each}` keys (`active-${run.id}` / `history-${run.id}`) in `RunSummary.svelte` prevent cross-list key collisions. 9 new tests added (4 store, 5 component). All 1013 tests pass. Reviewed and approved.

## Post-Implementation Spec Update Tasks

Quality-engineer review identified 20 spec gaps across 4 completed features (T-097, T-057, T-059, T-061). Organized by spec file.

### spec/002-data-models.md

### T-169 - Spec: Add `fallbackItemIds` to Component Data Model
- Status: `todo`
- Description: `Component.fallbackItemIds` is used in runtime matching (RecipeManager) and populated during compendium import (CompendiumImporter), but has no definition in spec/002-data-models.md.
- Acceptance Criteria:
  1. `spec/002` Component properties block includes `fallbackItemIds: string[]` with description stating these are alternate item UUIDs accepted as matches when `sourceItemUuid` does not resolve.
  2. A requirements entry clarifies fallback IDs are tried in order after `sourceItemUuid` matching fails, using the same source-UUID resolver.
  3. A note states `fallbackItemIds` must never contain the same value as `sourceItemUuid` (de-duplication required).

### T-170 - Spec: Document `__SYSTEM_ID__` Placeholder in Recipe Pack Data
- Status: `todo`
- Description: CompendiumImporter resolves `craftingSystemId: "__SYSTEM_ID__"` to the imported system's ID. This placeholder convention is absent from spec/002 Recipe section.
- Acceptance Criteria:
  1. `spec/002` Recipe requirements section documents that `craftingSystemId` may be `"__SYSTEM_ID__"` in pack data only; replaced at import time with the system's actual ID.
  2. A note states `"__SYSTEM_ID__"` is not valid in saved/persisted recipe data — it is a pack-bundle-only authoring convention.

### T-171 - Spec: Document `CraftingSystem.teaserConfig` Data Model
- Status: `todo`
- Description: `CraftingSystem.teaserConfig` and `TeaserFragment` are implemented but absent from spec/002.
- Acceptance Criteria:
  1. `spec/002` CraftingSystem schema includes `teaserConfig` with shape: `{ enabled: boolean, discoveryMode: "threshold" | "fragments" | "both", fragments: TeaserFragment[] }`.
  2. `TeaserFragment` model defined with fields: `id`, `name`, `linkedItemUuid`, `recipeIds[]`, `progressValue` (0-100).
  3. Requirements state when `teaserConfig` is active and what each `discoveryMode` value means.

### T-172 - Spec: Document `Recipe.teaser` Field
- Status: `todo`
- Description: `Recipe.teaser` field is implemented but absent from spec/002.
- Acceptance Criteria:
  1. `spec/002` Recipe schema includes `teaser` with shape: `{ enabled: boolean, hiddenFields: string[], revealThreshold: number, teaserDescription: string }`.
  2. `hiddenFields` valid values enumerated: `"ingredients"`, `"results"`, `"description"`, `"catalysts"`, `"essences"`.
  3. Default normalization (when `teaser` absent from stored data) is specified.

### T-173 - Spec: Add `teaser` to `listMode` Enum
- Status: `todo`
- Description: Implementation accepts `listMode: "teaser"` but spec/002 only lists `"global" | "player" | "knowledge"`. Both spec/002 and spec/006 must be updated.
- Acceptance Criteria:
  1. `spec/002` `recipeVisibility.listMode` type includes `"teaser"`.
  2. `spec/006` listing algorithm includes a `listMode === "teaser"` branch describing visibility-always/craftability-gated semantics.
  3. A requirements entry documents that when `listMode === "teaser"`, `teaserConfig` at system level governs field visibility and discovery conditions.

### T-174 - Spec: Document `Actor.flags.fabricate.discoveryProgress` Flag
- Status: `todo`
- Description: Discovery progress per actor is stored in flags but undocumented in spec/002 Actor Flags section.
- Acceptance Criteria:
  1. `spec/002` Actor Flags section includes `discoveryProgress` with schema: `{ [recipeId]: { progress: number, fragments: string[], discoveredAt: number|null, manuallySet: boolean } }`.
  2. Requirements state: `progress` is 0-100, `fragments` contains discovered TeaserFragment IDs, `discoveredAt` is timestamp set when threshold reached.
  3. Cleanup policy on recipe deletion is specified.

### T-175 - Spec: Add ShoppingList Data Model
- Status: `todo`
- Description: Shopping list aggregation model is fully implemented but entirely absent from spec/002.
- Acceptance Criteria:
  1. `spec/002` gains a ShoppingList section defining `ShoppingListEntry` (`{ recipeId, quantity }`) and `AggregatedShoppingList` (`{ ingredients[], essences[], catalysts[], allSatisfied, totalRecipes, totalQuantity }`).
  2. `AggregatedIngredient` shape defined with `componentId`, `description`, `totalNeed`, `have`, `missing`, `satisfied`.
  3. Deduplication key priority documented: componentId > itemUuid > description.
  4. `have` uses shared inventory (latest evaluation value, not summed across recipes).
  5. Session-scoped persistence boundary stated explicitly.

### T-176 - Spec: Clarify Shopping List `have` Aggregation Semantics
- Status: `todo`
- Description: The "latest evaluation wins" strategy for `have` in ingredient merging is correct but counter-intuitive and undocumented.
- Acceptance Criteria:
  1. ShoppingList requirements in spec/002 state: `have` reflects shared inventory from the latest recipe evaluation pass, not summed across recipes.
  2. Quantity multiplication applies to ingredients and essences but NOT catalysts.
  3. When `componentSourceActors` is empty, all `have` values are 0 and evaluation is skipped.

### spec/003-ui-integration.md

### T-177 - Spec: Document `importFromPackData` API Contract
- Status: `todo`
- Description: spec/003 describes compendium import in two vague sentences. The implementation has a fully defined API with options, phased execution, and structured summary return.
- Acceptance Criteria:
  1. `spec/003` gains a Compendium Import subsection documenting: pack data shape requirement, named options (`overwriteExisting`, `retainFallbackIds`, `additionalFallbackIds`, `targetPackIds`), early-exit behaviour.
  2. Structured import summary shape documented: `{ system, components: { remapped[], retained[], unresolved[] }, recipes: { imported, skipped, errors[] }, collisions[] }`.
  3. UUID remapping precedence documented: exact match → source+name match → unresolved.

### T-178 - Spec: Document `targetPackIds` Filter Option
- Status: `todo`
- Description: The `targetPackIds` option restricts UUID search to specific Foundry compendium packs but is undocumented.
- Acceptance Criteria:
  1. `spec/003` Compendium Import section states `targetPackIds` is an optional array of Foundry compendium collection IDs.
  2. When empty/omitted, all Item-type packs are searched. When non-empty, search is restricted to those packs.

### T-179 - Spec: Add Graph Tab UI Section
- Status: `todo`
- Description: The Recipe Graph tab in RecipeManagerApp is entirely absent from spec/003.
- Acceptance Criteria:
  1. `spec/003` GM Crafting Admin tab list includes "Graph".
  2. New Graph Tab section documents: toolbar controls (search, category filter, zoom), graph viewport (pan/zoom), node display (icon, name, category), click-to-edit navigation, edge rendering (solid vs dashed for cycles), legend, empty state, stats display.
  3. Lazy computation contract stated: graph data computed only when Graph tab is active.
  4. Filter contract stated: category and search applied client-side, no re-layout on filter.

### T-180 - Spec: Add Shopping List Panel UI Section
- Status: `todo`
- Description: Shopping list panel in CraftingApp is entirely absent from spec/003.
- Acceptance Criteria:
  1. `spec/003` Crafting App (Player) section gains a Shopping List Panel subsection.
  2. Documents: entry point (cart button on RecipeCard), panel header with count badge, recipe entry list with quantity controls, materials table (Need/Have/Missing columns), essences/catalysts sections, summary footer.
  3. Reactivity triggers documented: actor source change, quantity change, add/remove.
  4. Constraints documented: not available in cauldron mode, teaser-hidden ingredients excluded.

### T-181 - Spec: Document Non-Persisted Session State
- Status: `todo`
- Description: Shopping list is session-scoped (not persisted) but this boundary is not stated in spec/003.
- Acceptance Criteria:
  1. `spec/003` Data Storage section includes a Non-Persisted Session State note listing: shopping list entries, shopping list panel expanded/collapsed state.
  2. States that implementors must not persist shopping list to `game.settings` or flags.

### T-182 - Spec: Document Teaser Mode UI Flows
- Status: `todo`
- Description: GM teaser config UI (TeaserProgressEditor, RulesTab teaser section) and player-facing teaser display are absent from spec/003.
- Acceptance Criteria:
  1. `spec/003` Systems Tab section documents teaser config controls: enable toggle, discovery mode selector, fragment list editor.
  2. GM progress management dialog documented: per-actor progress table, manual progress input, Reset action, Grant Discovery action.
  3. Player-facing teaser recipe display documented: hidden fields not rendered, teaserDescription shown, progress indicator, craft action disabled until discovered.

### T-183 - Spec: Clarify Graph Filter Ownership (Store vs Component)
- Status: `todo`
- Description: Current implementation applies search filter in both adminStore and RecipeGraphTab component, creating ambiguity about which tier owns each filter dimension.
- Acceptance Criteria:
  1. `spec/003` Graph Tab section explicitly states filter ownership: search and category are client-side (component-level) over pre-computed graph.
  2. Graph layout computed once per system selection, not re-triggered by filtering.
  3. Any duplicate filter application in store is noted as implementation detail to clean up.

### spec/005-recipes-and-steps.md

### T-184 - Spec: Add Recipe Dependency Graph Semantics
- Status: `todo`
- Description: Graph edge derivation rules, node/edge shapes, cycle handling, and layout algorithm are implemented but absent from spec/005.
- Acceptance Criteria:
  1. `spec/005` gains a Recipe Dependency Graph Semantics section defining: edge derivation rule (output componentId of recipe A matches input componentId of recipe B), self-loop exclusion.
  2. Node shape and edge shape defined with all fields.
  3. Cycle handling documented: DFS back-edge detection, cycle edges excluded from layer assignment, rendered with dashed stroke.
  4. Disconnected subgraph layout documented: side-by-side with gap.
  5. Sugiyama-style layout algorithm described with constants (LAYER_SPACING, NODE_SPACING, NODE_WIDTH, NODE_HEIGHT).

### T-185 - Spec: Add Graph Construction Testing Requirements
- Status: `todo`
- Description: Testing requirements for graph builder are absent from spec/005.
- Acceptance Criteria:
  1. `spec/005` Testing Requirements section includes: empty recipe list, single isolated recipe, linear chain, branching graph, disconnected components, self-loop exclusion, cycle detection, layout assignment, filter preservation.

### spec/006-recipe-visibility.md

### T-186 - Spec: Document Teaser Visibility Evaluation Rules
- Status: `todo`
- Description: `RecipeVisibilityService._evaluateTeaserAccess` implements a full evaluation algorithm but spec/006 has no teaser mode section.
- Acceptance Criteria:
  1. `spec/006` gains a Teaser Mode section with evaluation algorithm: `effectiveProgress = stored.progress + sum(fragment progressValues)`, craftability gated on `effectiveProgress >= revealThreshold` OR `discoveredAt != null`.
  2. `teaserState` payload shape specified: `{ isTeaser, progress, hiddenFields, teaserDescription }`.
  3. GM bypass documented: GM always sees fully revealed recipes in teaser mode.

### T-187 - Spec: Document Fragment Auto-Discovery Hook
- Status: `todo`
- Description: `FragmentDiscoveryHook` automatically discovers fragments on `createItem` but this is absent from spec/006.
- Acceptance Criteria:
  1. `spec/006` gains a Fragment Auto-Discovery section: trigger (`createItem` when item UUID matches fragment), scope conditions (`teaserConfig.enabled` AND `discoveryMode ∈ ["fragments", "both"]`), idempotency contract, auto-transition on threshold reached.
  2. Testing requirements include idempotency and auto-transition tests.

### Shopping List Testing

### T-188 - Spec: Add Shopping List Testing Requirements
- Status: `todo`
- Description: Testing requirements for shopping list edge cases (teaser interaction, deleted recipes, quantity multiplication scope) are unspecified.
- Acceptance Criteria:
  1. Spec documents testing requirements: empty/non-empty componentSourceActors, deleted recipe handling (silently skipped), teaser-hidden ingredients excluded, quantity multiplication applies to ingredients/essences but not catalysts.

## Svelte Migration Tasks

Plan reference: `SVELTE_MIGRATION_PLAN.md` (approved 2026-03-07, T-093).

### Phase 0: Foundation

### T-104 - Proof-of-Concept Smoke Test
- Status: `todo`
- Dependencies: `T-101`, `T-102`, `T-103`
- Description: Create a minimal Svelte component mounted via SvelteApplicationMixin, verify it renders inside Foundry, responds to prop changes, handles drag-and-drop, and is cleaned up on close. The component is deleted after validation.
- Acceptance Criteria:
  1. A temporary `HelloSvelte.svelte` component renders text and a reactive prop inside a Foundry ApplicationV2 window.
  2. Updating props from the App class causes the component to reactively update without full re-mount.
  3. A `use:dragDrop` element in the component accepts an item drop from the Foundry sidebar and logs the received data.
  4. Closing the window cleanly unmounts the component with no console errors or leaked event listeners.
  5. Existing Handlebars surfaces (CraftingApp, RecipeManagerApp, RecipeEditorApp) are completely unaffected.
  6. The temporary component and its App wrapper are deleted after manual verification, leaving no dead code.

### Phase 1: CraftingApp (Player UI)

### Phase 2: RecipeManagerApp (GM Admin UI)

### Phase 3: RecipeEditorApp (GM Editor UI)

### Phase 4: Cleanup and Hardening
