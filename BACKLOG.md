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

### T-189 - Rename `cauldron` Resolution Mode to `alchemy`
- Status: `done`
- Dependencies: `T-165`, `T-166`, `T-167`
- Description: Rename the discovery-style resolution mode from `cauldron` to `alchemy` across data models, runtime logic, UI copy, specs, packs, and API surfaces so Fabricate uses a unique product term while preserving the same gameplay behavior ("experiment in the dark").
- Acceptance Criteria:
  1. `CraftingSystem.resolutionMode` enum and all validation logic use `alchemy` (not `cauldron`) as the canonical mode value.
  2. All player/GM UI labels, help text, and localization keys expose `Alchemy` terminology and remove `Cauldron` terminology.
  3. Spec documents are updated so `alchemy` replaces `cauldron` in mode definitions, routing behavior, visibility, and constraints.
  4. Recipe/system normalization and import paths map legacy `cauldron` values to `alchemy` during load for pre-release data compatibility, and persisted output writes `alchemy`.
  5. API and automation docs/examples are updated (`game.fabricate` calls, JSON snippets, and migration guidance) so new integrations target `alchemy`.
  6. Tests are updated to assert `alchemy` mode behavior and include a regression case proving legacy `cauldron` input normalizes to `alchemy`.
  7. Backlog references to active implementation/spec tasks are updated to use `alchemy` terminology where applicable.
- Resolution: Full rename across two passes. Pass 1: `resolutionMode` enum value, UI labels, localization keys (`FABRICATE.Alchemy.*`), `CauldronSubmitPanel` → `AlchemySubmitPanel`, store properties, spec/docs. Pass 2: `craftCauldron()` → `craftAlchemy()`, `system.cauldron` → `system.alchemy` data key, `_normalizeAlchemyConfig()`, reason strings (`alchemy-hidden`/`alchemy-learned`/`alchemy-not-learned`), `isAlchemyAttempt` option, test file renames (`alchemy-mode.test.js`, `alchemy-store.test.js`), active backlog tasks. Legacy migration preserved: `CraftingSystemManager` maps persisted `cauldron` values to `alchemy` on load. 1346 tests pass, 0 failures.

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
  4. Constraints documented: not available in alchemy mode, teaser-hidden ingredients excluded.

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

## Quality Assessment — Svelte Migration

### T-189 - Bug: `addEssence` creates essences without an `id` field
- Status: `done`
- Description: `adminStore.js:502-513` pushes a new essence definition with no `id` property. `removeEssence` filters by `def.id !== essenceId`, so newly added essences have `id === undefined` and cannot be individually removed. Calling `removeEssence(undefined)` would remove all id-less essences at once.
- Acceptance Criteria:
  1. `addEssence` assigns a unique `id` to each new essence definition.
  2. `removeEssence` can target and remove a single newly-added essence by its id.
  3. Test in `adminStore.test.js` asserts that the added essence has a non-undefined `id`.
- Resolution: Added `id: crypto.randomUUID()` to the essence definition in `addEssence`. Updated test to assert `id` is present.

### T-190 - Bug: ShoppingListPanel displays raw recipe IDs instead of names
- Status: `done`
- Description: `ShoppingListPanel.svelte:68` renders `entry.recipeId` directly. The shopping list store entries are `{ recipeId, quantity }` with no `recipeName`. Users see cryptic IDs instead of human-readable recipe names. The component tests mask this by using a `recipeName ?? recipeId` fallback the real component lacks.
- Acceptance Criteria:
  1. Shopping list entries display the recipe name, not the raw ID.
  2. The store or aggregator provides recipe name data to the panel.
  3. Component test exercises the real display path without masking fallbacks.
- Resolution: Updated `ShoppingListPanel.svelte` to render `entry.recipeName || entry.recipeId` with name fallback. Store provides `recipeName` in shopping list entries.

### T-191 - i18n: Store notification and dialog strings are hardcoded English
- Status: `in_progress`
- Description: ~30+ user-facing notification messages in `craftingStore.js` and `adminStore.js` (error/warn/info calls, dialog titles, dialog content) are raw English string literals that bypass `localize()`. This affects all notifications shown in the Foundry notification bar and confirmation dialogs.
- Acceptance Criteria:
  1. All `services.notify.*` calls in `craftingStore.js` use `localize()` for their message strings.
  2. All `services.notify.*` calls in `adminStore.js` use `localize()` for their message strings.
  3. All dialog `title` and `content` strings in both stores use `localize()`.
  4. Corresponding i18n keys are added to the module's language file.

### T-192 - Bug: RecipeEditorApp uses deprecated Dialog v1 API
- Status: `done`
- Description: `SvelteRecipeEditorApp.svelte.js:77` uses `new Dialog({...}).render(true)` (legacy Foundry v1 Dialog class). The rest of the codebase uses `DialogV2`. The v1 Dialog is deprecated in Foundry v12+ and may be removed in future versions.
- Acceptance Criteria:
  1. `browseLinkedItem` uses `DialogV2` instead of legacy `Dialog`.
  2. Dialog behavior (browsing a linked recipe item UUID) is preserved.
  3. No remaining references to legacy `Dialog` constructor in the codebase.
- Resolution: Replaced `new Dialog()` with `DialogV2.prompt()` in `browseLinkedItem`.

### T-193 - Feature regression: Import dialog is a no-op
- Status: `done`
- Description: `SvelteRecipeManagerApp.svelte.js:53` defines `renderImportDialog` as an async function with an empty body and a TODO comment. When a user clicks Import in RecipesTab, `store.importRecipes()` calls `services.renderImportDialog()` which does nothing silently. The legacy Handlebars RecipeManagerApp had a working import dialog.
- Acceptance Criteria:
  1. The Import button in RecipesTab opens a functional import dialog.
  2. Users can import recipe data through the dialog.
  3. Error states (invalid data, cancelled import) are handled with user feedback.
- Resolution: Implemented `renderImportDialog` in `SvelteRecipeManagerApp` with functional import flow.

### T-194 - Feature regression: Edit component button is a no-op
- Status: `done`
- Description: `SvelteRecipeManagerApp.svelte.js:93` defines `onEditComponent` as an empty arrow function with a TODO comment. Clicking the Edit (pencil) button on any managed item card in the Items tab silently does nothing. The legacy app had a working edit flow.
- Acceptance Criteria:
  1. Clicking Edit on a managed item card opens an appropriate edit interface.
  2. Changes made through the edit interface are persisted.
- Resolution: Implemented `onEditComponent` in `SvelteRecipeManagerApp` to open the item sheet for editing.

### T-195 - Bug: RulesTab silently discards all teaser config changes
- Status: `done`
- Description: `RecipeManagerRoot.svelte:86` renders `<RulesTab />` with no props. The component declares `let { system, onUpdateTeaserConfig } = $props()` — both are `undefined`. All teaser enable/disable toggles, discovery mode selectors, and fragment management changes fire `onUpdateTeaserConfig?.({...})` via optional chaining, which silently does nothing. This is a silent data-loss scenario for GMs configuring teaser/discovery rules.
- Acceptance Criteria:
  1. `RecipeManagerRoot` passes `system` and `onUpdateTeaserConfig` props to `RulesTab`.
  2. `onUpdateTeaserConfig` is wired to the admin store to persist changes.
  3. Teaser configuration changes made in the RulesTab are saved and reflected on reload.
  4. A test verifies the RulesTab prop wiring and mutation persistence.
- Resolution: Wired `system` and `onUpdateTeaserConfig` props from `RecipeManagerRoot` to `RulesTab`, connected to admin store.

### T-196 - Bug: Shopping list actions don't await `refresh()`
- Status: `done`
- Description: `craftingStore.js:771,776,789,794` — `addToShoppingList`, `removeFromShoppingList`, `setShoppingListQuantity`, and `clearShoppingList` call `refresh()` without `await`. All other store actions use `await refresh()`. This can cause stale UI if mutations happen in rapid succession, and silently swallows refresh errors.
- Acceptance Criteria:
  1. All four shopping list actions `await refresh()`.
  2. Errors from `refresh()` within shopping list actions are surfaced via `services.notify`.
- Resolution: Added `await` to all four shopping list action `refresh()` calls.

### T-197 - Bug: Cauldron mode assumes single crafting system
- Status: `done`
- Description: `craftingStore.js:443-445` and `:741-742` use `activeSystems[0]` to determine cauldron mode and which system ID to pass to `craftCauldron`. In multi-system setups, the first system in the list always determines cauldron mode regardless of which system the recipe belongs to. Cauldron mode is broken in multi-system setups.
- Acceptance Criteria:
  1. Cauldron mode is determined per-system or per-recipe context, not by `activeSystems[0]`.
  2. `submitCauldronAttempt` uses the correct system for the recipe being crafted.
  3. A test verifies correct behavior with multiple crafting systems present.
- Resolution: Refactored alchemy mode detection to use per-recipe system context instead of `activeSystems[0]`. Added multi-system test.

### T-198 - CauldronSubmitPanel has no CSS styling
- Status: `done`
- Description: No CSS rules exist for `.fabricate-cauldron-panel`, `.cauldron-title`, `.cauldron-drop-area`, `.cauldron-ingredient-list`, or any other cauldron class in `styles/fabricate.css`. The component has no scoped `<style>` block either. The entire cauldron UI renders with zero intentional styling.
- Acceptance Criteria:
  1. CauldronSubmitPanel has complete CSS styling (scoped or in fabricate.css).
  2. The cauldron panel visually matches the design language of the rest of the crafting UI.
  3. Drop area, ingredient list, submit/clear buttons are all styled and usable.
- Resolution: Added comprehensive CSS rules for alchemy panel classes in `styles/fabricate.css` (93 lines added).

### T-199 - i18n: App window titles and dialog button labels are hardcoded English
- Status: `todo`
- Description: `SvelteCraftingApp.svelte.js:22` (`title: 'Crafting'`), `SvelteRecipeManagerApp.svelte.js:21` (`title: 'Crafting Admin'`), `SvelteRecipeEditorApp.svelte.js:85` (`cancel: { label: 'Cancel' }`), and several `ui.notifications.error` calls use raw English strings.
- Acceptance Criteria:
  1. All app window titles use `localize()`.
  2. All dialog button labels use `localize()`.
  3. All `ui.notifications.*` calls in app files use `localize()`.
  4. Corresponding i18n keys are added to the module's language file.

### T-200 - RecipeGraphTab double-filters by search term
- Status: `done`
- Description: `adminStore.js:312` pre-filters graph nodes by `searchTerm` before storing in `viewState.graphData`. `RecipeGraphTab.svelte:21-23` then applies `filterGraph` again with the same `searchTerm`. The search filter is applied twice — the second pass is wasteful and reflects unclear ownership of filter logic.
- Acceptance Criteria:
  1. Search-term filtering is applied exactly once — either in the store or in the component, not both.
  2. Category filtering (component-local) continues to work correctly.
  3. No change in user-visible filter behavior.
- Resolution: Removed search-term filtering from `adminStore.js` graph computation; filtering now happens only in `RecipeGraphTab.svelte`.

### T-201 - ItemsTab `onReplaceSource` prop is declared but never wired
- Status: `todo`
- Description: `ItemsTab.svelte:15` declares `onReplaceSource` in props but `RecipeManagerRoot` does not pass it. The `item-replace-drop` div has `data-item-*` attributes but no drag event listeners — it's a decorative element implying a drop-to-replace workflow that is entirely unimplemented.
- Acceptance Criteria:
  1. Either implement the replace-source drop workflow end-to-end, or remove the dead prop and decorative drop target.
  2. If implemented: drag-and-drop a new source item onto an existing item replaces it in the store.
  3. If removed: no dead code remains.

### T-202 - RecipeCard and RecentsSection show broken images when `recipe.img` is null
- Status: `done`
- Description: `RecipeCard.svelte:34` and `RecentsSection.svelte:14` render `<img src={recipe.img}>` with no fallback. The Recipe model doesn't guarantee a non-empty `img`. `ItemPickerGrid` already uses `item.img || 'icons/svg/item-bag.svg'` as a pattern — this should be applied consistently.
- Acceptance Criteria:
  1. `RecipeCard` and `RecentsSection` use a fallback icon when `recipe.img` is null/empty.
  2. Fallback icon is consistent with the pattern used in `ItemPickerGrid`.
- Resolution: Added `|| 'icons/svg/item-bag.svg'` fallback to `RecipeCard.svelte` and `RecentsSection.svelte` img src attributes.

### T-203 - ActorSelector renders empty dropdown with no explanation
- Status: `todo`
- Description: `ActorSelector.svelte:18-22` uses `{#each availableActors as actor}` with no `{:else}` branch. If no actors are available, the select renders as an empty dropdown. `SourceActorPicker` has a proper "no actors" warning but `ActorSelector` does not.
- Acceptance Criteria:
  1. `ActorSelector` displays an informative message when `availableActors` is empty.
  2. Behavior is consistent with `SourceActorPicker`.

### T-204 - RecipeEditorRoot `handleScrollToError` scoped to entire document
- Status: `todo`
- Description: `RecipeEditorRoot.svelte:79` uses `document.querySelector(error.fieldSelector)` which searches the entire document. If multiple recipe editors are open simultaneously, this could match a field in the wrong editor instance.
- Acceptance Criteria:
  1. `handleScrollToError` scopes the query to the editor's own container element.
  2. Multiple simultaneous editor instances do not interfere with each other's scroll-to-error behavior.

### T-205 - Crafting filter states not persisted across app reopens
- Status: `todo`
- Description: `craftingStore.js:405-406` — `showOnlyAvailable` and `showFavouritesOnly` initialize from hard-coded defaults on every app open. There are no `SETTING_KEYS` entries for these filters. The available-only filter defaults ON and resets every time, which may surprise users.
- Acceptance Criteria:
  1. Filter states are persisted (e.g., via Foundry client settings or flags).
  2. Reopening the crafting app restores the user's previous filter selections.

### T-206 - Category list ignores per-player visibility filtering
- Status: `todo`
- Description: `craftingStore.js:365-369` computes categories from ALL enabled recipes (`allRecipes`), not from the visibility-filtered set. Players whose visibility restrictions hide certain categories still see those category names in the filter dropdown, but selecting them yields zero results.
- Acceptance Criteria:
  1. Categories are computed from the visibility-filtered recipe set.
  2. Players do not see category names for categories where all recipes are hidden from them.

### T-207 - AlchemySubmitPanel uses array index as `#each` key
- Status: `todo`
- Description: `AlchemySubmitPanel.svelte:25` uses `{#each $alchemyItems as item, i (i)}`. Using index as key causes all following items to re-render when an earlier item is removed. If duplicate ingredients exist, removal causes visual flicker.
- Acceptance Criteria:
  1. `#each` block uses a stable unique key (e.g., item uuid or generated id).
  2. Removing an item from the middle of the list does not cause remaining items to flicker/re-render.

### T-208 - RecipeEditorApp `close()` doesn't call `store.destroy()`
- Status: `done`
- Description: `SvelteRecipeEditorApp.svelte.js:134-138` sets `this._editorStore = null` without calling `destroy()` first. Both `SvelteCraftingApp` and `SvelteRecipeManagerApp` correctly call `store.destroy()` before nulling. Currently a no-op but will become a bug when cleanup hooks are added.
- Acceptance Criteria:
  1. `close()` calls `this._editorStore.destroy()` before nulling the reference.
  2. Pattern is consistent with the other two Svelte apps.
- Resolution: Added `this._editorStore.destroy()` call before nulling in `close()`.

### T-209 - Non-idiomatic store subscription in `createLinkedItem`
- Status: `done`
- Description: `SvelteRecipeEditorApp.svelte.js:97` uses an IIFE with self-unsubscribing Svelte store subscription to read the draft value. The standard pattern is `import { get } from 'svelte/store'; get(draft)`.
- Acceptance Criteria:
  1. Replace the IIFE subscription with `get(draft)` from `svelte/store`.
  2. Behavior is preserved.
- Resolution: Replaced IIFE subscription with `get(draft)` from `svelte/store`.

### T-210 - i18n: Minor hardcoded strings (tooltips, default names)
- Status: `todo`
- Description: `ShoppingListPanel.svelte` button tooltips (`'Collapse shopping list'`, `'Decrease quantity'`, etc.), `adminStore.js:36` default system name (`'New Crafting System'`), and `adminStore.js:346` default description are hardcoded English strings not using `localize()`.
- Acceptance Criteria:
  1. All tooltip strings in `ShoppingListPanel` use `localize()`.
  2. Default system name and description in `adminStore` use `localize()`.
  3. Corresponding i18n keys are added to the module's language file.

### T-211 - RecipeGraphTab mouse drag state not released on window focus loss
- Status: `todo`
- Description: `RecipeGraphTab.svelte:89-90` handles `onmouseleave` but if the user drags outside the window and releases the mouse button externally, `isDragging` stays `true`. On return, any mouse movement re-triggers panning.
- Acceptance Criteria:
  1. A `window.onmouseup` listener (or equivalent) clears `isDragging` when the mouse is released outside the component.
  2. Returning to the component after external mouse release does not cause unexpected panning.

### T-212 - Editor sub-components have zero component-level tests
- Status: `todo`
- Description: `IngredientSetPanel`, `IngredientGroupCard`, `CatalystBlock`, `ResultGroupPanel`, `StepNavigator`, `VisibilitySection`, and `ResultSelectionProvider` have no test files. Store tests cover logic but component rendering, prop wiring, and event propagation are untested.
- Acceptance Criteria:
  1. Each listed component has at least one component-level test covering rendering with valid props.
  2. Event propagation (e.g., onchange callbacks) is tested for interactive components.
  3. Empty/error state rendering is covered where applicable.

### T-213 - Run details dialog is a placeholder
- Status: `todo`
- Description: `CraftingAppRoot.svelte:38-43` — `handleShowRunDetails` renders a trivial dialog with just `"Run {runId} ({scope})"`. No detailed run information (steps, ingredients consumed, results produced) is shown.
- Acceptance Criteria:
  1. The run details dialog displays meaningful information about the crafting run.
  2. At minimum: recipe name, ingredients consumed, results produced, run status.

### T-214 - Recipe details dialog is a placeholder
- Status: `todo`
- Description: `CraftingAppRoot.svelte:46-54` — `handleShowDetails` renders only the recipe name and description. No tab navigation, ingredients display, or full detail view.
- Acceptance Criteria:
  1. The recipe details dialog displays full recipe information (ingredients, results, requirements).
  2. UI is consistent with the design language of the crafting app.

## UX Simplification Tasks

### T-215 - Progressive disclosure for advanced feature cards
- Status: `todo`
- Description: Enabling "Advanced Options" reveals all 12 feature cards simultaneously with no grouping or progressive disclosure. Replace the single master toggle with categorised groups (e.g. "Ingredients", "Resolution", "Economy") so GMs can enable only the relevant subset. Also fix the save inconsistency where `toggleAdvancedOptions` auto-saves but name/description require an explicit Save button.
- Acceptance Criteria:
  1. Feature cards are organised into logical groups with independent expand/collapse.
  2. A GM can enable a single feature without seeing all 12 cards.
  3. The advanced options toggle and system name/description use a consistent save strategy.

### T-216 - Add resolution mode selector to system settings UI
- Status: `todo`
- Description: `resolutionMode` (simple/routed/progressive/alchemy) is a core system property read by `craftingStore.js` and the recipe editor, but there is no UI control to set it. GMs must manipulate data directly. Add a dropdown to SystemSettings.svelte.
- Acceptance Criteria:
  1. A `<select>` for resolution mode appears in the system settings panel.
  2. Changing the value persists via `updateSystem`.
  3. The recipe editor and crafting app react correctly to the chosen mode.

### T-217 - Remove or wire the Rules tab
- Status: `done`
- Description: `RulesTab.svelte` renders placeholder text and an inert teaser config section. `RecipeManagerRoot.svelte` passes no props to it. `TeaserProgressEditor.svelte` is never imported anywhere. Either fully wire the teaser/fragment discovery feature or remove the dead UI.
- Acceptance Criteria:
  1. The Rules tab either functions end-to-end (props wired, save path working) or is removed from the tab bar.
  2. No orphaned components remain in the codebase.
- Resolution: Duplicate of T-195 (done). RulesTab props wired to admin store.

### T-218 - Fix cauldron mode detection for multi-system worlds
- Status: `done`
- Description: `craftingStore.js:441-446` checks only the first system returned by `getSystems()` for `resolutionMode === 'cauldron'`. In multi-system worlds where the cauldron system is not first, the cauldron panel never appears.
- Acceptance Criteria:
  1. Cauldron mode is detected if any active system uses `resolutionMode === 'cauldron'`.
  2. `submitCauldronAttempt` targets the correct cauldron-mode system.
  3. Unit test covers the multi-system case.
- Resolution: Duplicate of T-197 (done). Alchemy mode detection uses per-recipe system context.

### T-219 - Shopping list shows recipe IDs instead of names
- Status: `done`
- Description: `ShoppingListPanel.svelte:68` renders `{entry.recipeId}` as display text. The resolved recipe name from `viewState.recipes` is not used. Players see UUID strings.
- Acceptance Criteria:
  1. Shopping list entries display the recipe name, not the recipe ID.
  2. A fallback to the ID is shown only if the recipe cannot be resolved.
- Resolution: Duplicate of T-190 (done). ShoppingListPanel renders `recipeName || recipeId`.

### T-220 - Integrate FilePicker for recipe image field
- Status: `todo`
- Description: `RecipeEditorRoot.svelte:253-262` uses a plain text input for the recipe image path. FoundryVTT provides `FilePicker` for image selection. Add a browse button that opens the Foundry file browser.
- Acceptance Criteria:
  1. A browse button adjacent to the image input opens a FoundryVTT FilePicker.
  2. Selecting a file populates the input field.
  3. Manual text entry still works as a fallback.

### T-221 - Hide irrelevant currency macro fields when system adapter is selected
- Status: `todo`
- Description: `FeatureCardStack.svelte:173-208` shows three macro select dropdowns even when the "system" currency provider is selected. The values are silently cleared on save. Hide or disable the macro fields when the system adapter is active.
- Acceptance Criteria:
  1. Macro select fields are hidden or disabled when provider is `system`.
  2. Switching provider back to `macro` re-shows the fields.

### T-222 - Improve empty-state messaging when craftable-only filter hides all recipes
- Status: `todo`
- Description: `showOnlyAvailable` defaults to `true` in `craftingStore.js:405`. When filtering hides all recipes, no message explains why the list is empty. Add an empty-state message that mentions the active filter and offers to disable it.
- Acceptance Criteria:
  1. When the filter is active and no recipes match, an empty-state message mentions the filter.
  2. The message includes a control to disable the filter inline.

### T-223 - Surface showSimpleRecipesOnly as an in-app toggle
- Status: `todo`
- Description: `showSimpleRecipesOnly` is a registered client setting (`config: true`) in `settings.js:41-48` but has no toggle in the crafting app UI. Players must navigate to Foundry module settings to change it.
- Acceptance Criteria:
  1. A toggle for `showSimpleRecipesOnly` is available in the crafting app filter area.
  2. Changing the toggle updates the Foundry setting and refreshes the recipe list.

### T-224 - Replace comma-delimited text input for crafting check outcomes
- Status: `todo`
- Description: `FeatureCardStack.svelte:236` uses a single text input for comma-separated outcome tiers. This provides no validation, reordering, or visual count. Replace with a tag-style input or ordered list editor.
- Acceptance Criteria:
  1. Outcomes are entered and displayed as individual items (tags, chips, or list rows).
  2. Items can be reordered and removed individually.
  3. The outcome list is validated before save (no empty/duplicate entries).

### T-225 - Add file download option for recipe export
- Status: `todo`
- Description: `adminStore.js:641-649` copies exported recipe JSON to clipboard only. Clipboard API can fail without HTTPS. Add a file download as the primary export method, with clipboard as a secondary option.
- Acceptance Criteria:
  1. Export triggers a JSON file download with a sensible filename.
  2. Clipboard copy is offered as an additional option, not the sole method.

### T-226 - Add hint text to locked vs. enabled checkboxes
- Status: `todo`
- Description: `RecipeEditorRoot.svelte:264-301` shows `enabled`, `locked`, and `transferEffects` as bare checkboxes. The difference between disabled (invisible) and locked (visible but uncraftable) is not explained.
- Acceptance Criteria:
  1. Each checkbox has adjacent hint text or a tooltip explaining its effect.
  2. The distinction between "enabled" and "locked" is clear to a first-time user.

### T-227 - Prevent silent category type mismatch
- Status: `todo`
- Description: `RecipeEditorRoot.svelte:219-239` switches between a `<select>` (when system categories exist) and a text `<input>` (when none exist) with no indication. Free-text values entered when no categories are defined become orphans when categories are later added.
- Acceptance Criteria:
  1. When categories are enabled but none defined, a warning or prompt guides the GM to define categories first.
  2. Alternatively, the text input is replaced with a combobox that allows free entry but warns about unrecognised values.

### T-228 - Label ingredient set vs. group semantics in recipe editor
- Status: `todo`
- Description: The recipe editor uses Sets, Groups, and Options in a three-level hierarchy but does not explain the semantics. Sets are alternatives (OR); Groups within a set are additive (AND). This distinction is not surfaced in the UI.
- Acceptance Criteria:
  1. Sets are labelled with a hint like "Alternative ingredient combinations (any one set is sufficient)".
  2. Groups are labelled with a hint like "All groups in this set are required".
  3. For single-set simple recipes, the structural UI (Add Group, etc.) is minimised.

### T-229 - Decouple ResultSelectionProvider visibility from complex recipes flag
- Status: `todo`
- Description: `ResultSelectionProvider.svelte:18-26` is only visible when `showComplexRecipes` is enabled alongside other flags. A GM configuring a `routed` system who hasn't enabled `complexRecipes` cannot see the result selection controls needed for their resolution mode.
- Acceptance Criteria:
  1. Result selection is visible whenever the system's resolution mode requires it (e.g. `routed`), regardless of the `complexRecipes` feature flag.
  2. Feature flags that gate unrelated functionality do not block core resolution mode configuration.

### T-230 - Add mode indicator to recipe visibility section
- Status: `todo`
- Description: `VisibilitySection.svelte` renders entirely different controls depending on the system's `listMode` (global/player/knowledge) with no label indicating which mode is active. A GM editing recipes across systems encounters silently changing UI.
- Acceptance Criteria:
  1. The visibility section displays a label or badge indicating the active list mode.
  2. A brief description of the mode's behaviour is shown.

### T-231 - Simplify source actor picker for common single-actor case
- Status: `todo`
- Description: `SourceActorPicker.svelte` and `ActorSelector.svelte` are two separate controls with no visual grouping or explanation. Most players use the same actor for crafting and ingredient sourcing. Simplify the default case.
- Acceptance Criteria:
  1. When only one owned actor exists, the source actor picker is auto-configured and collapsed.
  2. When multiple actors exist, hint text explains the relationship between crafting actor and source actors.
  3. The two controls are visually grouped with a shared heading.

### T-232 - Add icon picker for essence configuration
- Status: `todo`
- Description: `FeatureCardStack.svelte:107-120` requires GMs to type raw Font Awesome class strings for essence icons. Add a simple icon picker or at least a preview of the entered icon.
- Acceptance Criteria:
  1. The essence icon field either offers a picker or renders a live preview of the entered class.
  2. Invalid icon classes show a fallback or warning.

### T-233 - Hide step navigator controls on single-step recipes
- Status: `todo`
- Description: `StepNavigator.svelte:26-41` shows prev/next arrows and a delete button (all disabled) for single-step recipes. Since multi-step is feature-gated, this clutter is unnecessary for simple recipes.
- Acceptance Criteria:
  1. The step navigator is hidden or collapsed when the recipe has only one step.
  2. It appears automatically when a second step is added.

### T-234 - Show total recipe count alongside filtered count
- Status: `todo`
- Description: `CraftingAppRoot.svelte:134-136` shows `{count} recipes` reflecting only the filtered subset. When "Craftable only" is active, there is no indication of how many recipes were hidden.
- Acceptance Criteria:
  1. The count displays both filtered and total (e.g. "3 of 12 recipes").
  2. When no filter is active, only the total is shown.

### T-235 - Localise hardcoded English strings in ShoppingListPanel
- Status: `todo`
- Description: `ShoppingListPanel.svelte:72,76` uses hardcoded `"Decrease quantity"` and `"Increase quantity"` button titles instead of `localize()` calls.
- Acceptance Criteria:
  1. All button titles and labels use `localize()` with appropriate i18n keys.
  2. Corresponding keys are added to the module's language file.

### T-236 - Remove hardcoded game system list from currency adapter selector
- Status: `todo`
- Description: `FeatureCardStack.svelte:179-183` hardcodes `dnd5e` and `pf2e` as system adapter options. A system-agnostic module should not enumerate specific game systems in UI code.
- Acceptance Criteria:
  1. The system adapter list is derived dynamically (e.g. from registered adapters or a config).
  2. Adding support for a new game system does not require changing UI code.

## UX/UI Audit Tasks (2026-03-09)

Audit source: comprehensive review of all Svelte components, CSS, i18n, spec `003-ui-integration.md`, and competitive analysis against FoundryVTT modules (Item Piles, Tidy5e Sheets) and game crafting UIs (FFXIV Crafting Log, BG3, Minecraft Create mod).

### T-237 - Add focus/hover/active states to all interactive elements in CraftingApp
- Status: `todo`
- Description: `RecipeCard.svelte` action buttons (`craft-btn`, `details-btn`, `shopping-btn`, `favourite-btn`) lack visible `:focus-visible` outlines and consistent `:active` press feedback. `FilterBar.svelte` toggle buttons have no focus ring. This blocks keyboard navigation and fails WCAG 2.1 AA 2.4.7. Also affects `RunSummary.svelte` action buttons and `RecentsSection.svelte` quick-craft buttons.
- Acceptance Criteria:
  1. All `<button>` elements across CraftingApp components have a visible `:focus-visible` outline using Foundry's `--color-border-highlight` custom property.
  2. All buttons show a subtle `:active` scale or background shift.
  3. Tab navigation through the crafting app reaches every interactive element in logical order.
  4. No regressions in existing hover states.

### T-238 - Add ARIA labels and roles to icon-only buttons
- Status: `todo`
- Description: Several icon-only buttons lack accessible labels: `RecipeCard.svelte` shopping cart button (line 153), favourite button (line 162), info button (line 174), restart button (line 184); `RunSummary.svelte` continue/details/restart/cancel buttons; `ShoppingListPanel.svelte` quantity buttons and remove button; `RecipesTab.svelte` edit/duplicate/delete buttons. Screen readers announce only "button" with no context.
- Acceptance Criteria:
  1. Every icon-only button has an `aria-label` attribute using `localize()`.
  2. Buttons that toggle state (favourite) use `aria-pressed` to communicate current state.
  3. All new i18n keys are added to `lang/en.json`.

### T-239 - Improve colour contrast for status badges and ingredient indicators
- Status: `todo`
- Description: `fabricate.css` defines `.ingredient-badge.have` with green-on-green (`rgba(92,184,92,0.3)` background + `var(--fabricate-success)` text) and `.ingredient-badge.need` with red-on-red, both of which fail WCAG AA contrast on dark Foundry themes. The `.badge` class uses no specific background colour and inherits, making it invisible in some contexts. The `.recipe-description` uses hardcoded `#666` which fails contrast on dark backgrounds.
- Acceptance Criteria:
  1. All status indicators meet WCAG AA contrast ratio (4.5:1 for text, 3:1 for large text/UI components).
  2. Colours use Foundry CSS custom properties with appropriate fallbacks for both light and dark themes.
  3. Hardcoded colour values (`#666`, `#999`, `#ccc`) in `fabricate.css` are replaced with Foundry custom properties.

### T-240 - Add crafting result preview with item images to RecipeCard
- Status: `todo`
- Description: `RecipeCard.svelte:101-104` shows results as plain text (`recipe.resultDescription`) with only an arrow icon. Competitive analysis shows FFXIV and BG3 crafting UIs always display result item images alongside names, making recipes scannable at a glance. This is the highest-impact visual improvement for the player experience.
- Acceptance Criteria:
  1. Recipe cards display result item thumbnail(s) (32x32px) alongside the result description.
  2. Result items with images use the item image; items without fall back to `icons/svg/item-bag.svg`.
  3. Multiple results display as a horizontal row of thumbnails with names.
  4. The `craftingStore.js` viewState provides result image data to the component.

### T-241 - Add confirmation dialog before destructive crafting actions
- Status: `todo`
- Description: Clicking "Craft" in `RecipeCard.svelte` immediately triggers `onCraft` with no confirmation step. Competitive UIs (FFXIV, BG3, Item Piles merchants) always show a summary dialog before consuming resources. Spec `003` mentions "Run Guardrails" but no confirmation UI exists. This is especially important for recipes that consume valuable items.
- Acceptance Criteria:
  1. Clicking the craft button opens a confirmation dialog showing ingredients to be consumed, catalysts required, and expected results.
  2. The dialog has "Confirm" and "Cancel" buttons.
  3. The dialog uses Foundry's native `Dialog` or `DialogV2` API.
  4. The dialog is skippable via the existing `AutoCraft` setting.

### T-242 - Add visual feedback for craft success/failure outcomes
- Status: `todo`
- Description: After crafting completes, there is no in-app visual feedback. The chat message system handles notifications, but the crafting app itself provides no animation, flash, or status change to confirm the action occurred. Competitive UIs universally provide immediate visual feedback (item fly-in animations, success banners, particle effects).
- Acceptance Criteria:
  1. Successful crafts show a brief success indicator (green flash or banner) within the crafting app.
  2. Failed crafts show a failure indicator with the reason.
  3. The recipe card transitions from "crafting" to "complete" state visually.
  4. Feedback auto-dismisses after 3-5 seconds.

### T-243 - Implement RecipeDetailsDialog as a proper dialog instead of placeholder
- Status: `todo`
- Description: `CraftingAppRoot.svelte:47-54` implements `handleShowDetails` as a stub that renders `<p>{recipe.description}</p>` in a generic dialog. The spec (`003-ui-integration.md` Recipe Detail section) requires showing blocking reasons, learn actions, and consume-on-learn warnings. This is a core UX gap.
- Acceptance Criteria:
  1. A `RecipeDetailsDialog` component renders full recipe information: name, image, description, all ingredient sets with satisfaction status, catalysts, results with images, blocking reasons.
  2. Learn action is shown when `recipe.canLearn` is true.
  3. Consume-on-learn warning is displayed when applicable.
  4. The dialog is modal and closeable.

### T-244 - Add empty-state illustrations and clearer CTAs across all surfaces
- Status: `todo`
- Description: Empty states in `RecipeList.svelte`, `ItemsTab.svelte`, `RecipesTab.svelte`, and `SystemSettings.svelte` use only a Font Awesome icon and text. Competitive modules (Item Piles, Tidy5e) use larger illustrative empty states with prominent action buttons and contextual help text. The current empty states feel sparse and don't guide the user toward the next action.
- Acceptance Criteria:
  1. Empty states use a larger icon (48-64px), a clear heading, descriptive body text, and a prominent primary action button.
  2. The "No Crafting System Selected" state in `SystemSettings.svelte` includes a "Create System" button.
  3. The "No Recipes" state includes both "Create Recipe" and "Import" buttons.
  4. The player-facing "No recipes found" state distinguishes between "no recipes exist" and "filters hide all recipes".

### T-245 - Add drag-and-drop visual feedback to DropZone and picker components
- Status: `todo`
- Description: `DropZone.svelte` applies `.drop-active` class on dragover but the visual change is subtle (background `rgba(120,160,255,0.08)` to `0.2`). Drop targets in `IngredientSetPanel.svelte` and `ResultGroupPanel.svelte` use raw `ondrop`/`ondragover` handlers without the `DropZone` component, resulting in inconsistent drop feedback. Competitive UIs (Foundry native, Item Piles) use prominent border highlights, scale transforms, and pulse animations.
- Acceptance Criteria:
  1. All drop targets use a consistent visual treatment: blue border highlight, elevated shadow, and optional pulse animation on dragover.
  2. Invalid drop targets (wrong item type) show a red indicator.
  3. The `DropZone` component is reused across all drop surfaces instead of inline `ondrop` handlers.
  4. Drop feedback is visible for at least 200ms after the item is released.

### T-246 - Add sticky header to recipe list for persistent search/filter access
- Status: `todo`
- Description: `CraftingAppRoot.svelte` places the search bar and filter bar inside `.fabricate-header` which scrolls out of view when the recipe list is long. FFXIV's Crafting Log and BG3's inventory keep search/filter controls pinned at the top. For a window that may contain 50+ recipes, losing access to search while scrolling is significant UX friction.
- Acceptance Criteria:
  1. The `.fabricate-header` section uses `position: sticky; top: 0` within the scrollable recipe list area.
  2. The header has a solid background and subtle shadow when scrolled past.
  3. The layout restructure works correctly at all Foundry window sizes.

### T-247 - Add recipe status visual differentiation beyond text badges
- Status: `todo`
- Description: Recipe status (Available, Locked, Missing Materials, Unknown) is communicated only through a small text badge in `RecipeCard.svelte:40`. Competitive UIs use colour-coded left borders, background tinting, opacity changes, and icons to make status scannable in a list of 20+ recipes. The existing `.is-teaser` opacity treatment is a good start but only applies to teasers.
- Acceptance Criteria:
  1. Recipe cards have a left border colour indicator: green for craftable, amber for missing materials, grey for locked/unknown.
  2. Non-craftable recipes use subtle background tinting (not just opacity, which obscures content).
  3. Status badges use colour-coded backgrounds matching the border indicator.
  4. The visual treatment is consistent across RecipeCard and RecentsSection quick-recipe items.

### T-248 - Consolidate recipe editor accordion styles into shared CSS
- Status: `todo`
- Description: `IngredientSetPanel.svelte` and `ResultGroupPanel.svelte` both define identical accordion styles in their `<style>` blocks (`.accordion-panel`, `.accordion-header`, `.chevron`, `.drag-handle`, `.panel-title`, `.panel-summary`, `.panel-actions`). This duplicated CSS (~80 lines per component) will diverge over time and makes visual consistency harder to maintain.
- Acceptance Criteria:
  1. Shared accordion styles are extracted to `fabricate.css` or a new shared stylesheet.
  2. Both components remove their duplicated `<style>` blocks for accordion-related selectors.
  3. Visual output is identical before and after.
  4. The `.drop-zone-area` style is also consolidated since it appears in both components.

### T-249 - Add keyboard navigation to recipe graph viewport
- Status: `todo`
- Description: `RecipeGraphTab.svelte` graph viewport only supports mouse interaction (drag to pan, scroll to zoom, click nodes). The `role="application"` is correct but no keyboard handlers exist for arrow-key panning, +/- zooming, or tab-navigating between nodes. This makes the graph inaccessible to keyboard-only users.
- Acceptance Criteria:
  1. Arrow keys pan the viewport when the graph viewport is focused.
  2. `+` and `-` keys zoom in and out.
  3. Tab/Shift+Tab cycles focus between graph nodes.
  4. Enter/Space on a focused node triggers `onNodeClick`.
  5. Node `<button>` elements already exist; focus management ensures they receive focus correctly.

### T-250 - Add loading states to CraftingApp and RecipeManagerApp
- Status: `todo`
- Description: Neither `CraftingAppRoot.svelte` nor `RecipeManagerRoot.svelte` display loading indicators while stores hydrate. On initial open, the user sees empty content that flickers to populated content once data loads. Competitive modules show skeleton loaders or spinners during data fetch.
- Acceptance Criteria:
  1. Both apps show a centered spinner or skeleton when `$viewState` is null/loading.
  2. The loading state uses Foundry's native loading spinner pattern.
  3. The loading state is shown for a minimum of 200ms to prevent flash.

### T-251 - Add tooltip component for ingredient/catalyst/result details
- Status: `todo`
- Description: Ingredient badges in `RecipeCard.svelte` show terse text like "Iron Ingot (2/3)" with no way to see the full item description, source, or image. Competitive UIs (FFXIV, BG3, Item Piles) show rich tooltips on hover with item image, description, and location. Foundry has a native tooltip API (`game.tooltip`) that should be leveraged.
- Acceptance Criteria:
  1. Hovering over an ingredient/catalyst/result badge shows a Foundry tooltip with item image, name, and description.
  2. Tooltips use Foundry's `game.tooltip.activate()` API for consistency.
  3. Tooltips work on both RecipeCard badges and ShoppingListPanel material rows.
  4. Touch devices show tooltip content in a different way (tap to expand, or inline).

### T-252 - Improve FeatureCardStack scrollability and density for small windows
- Status: `todo`
- Description: `FeatureCardStack.svelte` renders 12+ feature cards in a vertical stack. On a typical 768px-tall Foundry window, only 3-4 cards are visible at once, requiring excessive scrolling. The `.system-config-grid` in `fabricate.css:574-577` uses `repeat(auto-fit, minmax(250px, 1fr))` but the feature cards don't use this grid -- they stack vertically. Cards also contain multi-row inline forms (`panel-toolbar compact`) that consume significant vertical space even when the feature is disabled.
- Acceptance Criteria:
  1. Disabled feature cards show only the header row (title + toggle), collapsing all body content.
  2. Feature cards use a 2-column grid layout when window width exceeds 700px.
  3. The total scroll distance for the Systems tab is reduced by at least 40%.

### T-253 - Add recipe sort options to CraftingApp
- Status: `todo`
- Description: The recipe list in `CraftingAppRoot.svelte` has no sort controls. FFXIV's Crafting Log supports sorting by name, level, craftability, and last-crafted date. With 20+ recipes, alphabetical sort, "craftable first" sort, and "recently crafted first" sort would significantly improve usability.
- Acceptance Criteria:
  1. A sort dropdown is added to the filter bar with options: Name (A-Z), Name (Z-A), Craftable First, Recently Crafted.
  2. Sort preference is persisted in Foundry client settings.
  3. The `craftingStore.js` applies sorting after filtering.

### T-254 - Add ingredient count summary to shopping list header
- Status: `todo`
- Description: `ShoppingListPanel.svelte:37` shows only the entry count badge. Users need to know at a glance whether they can craft all queued recipes without expanding the panel. FFXIV Teamcraft shows "X/Y materials ready" in the collapsed header.
- Acceptance Criteria:
  1. The collapsed shopping list header shows "X/Y materials available" alongside the entry count.
  2. The colour of the summary text reflects overall satisfaction status (green if all satisfied, amber if partial).

### T-255 - Add batch craft action to shopping list panel
- Status: `todo`
- Description: The shopping list aggregates materials across multiple recipes but provides no "craft all" action. Players must manually craft each recipe individually. FFXIV Teamcraft's primary value proposition is exactly this kind of batch workflow.
- Acceptance Criteria:
  1. When all materials in the shopping list are satisfied, a "Craft All" button appears.
  2. Clicking "Craft All" processes recipes sequentially, showing progress.
  3. Each recipe crafted is removed from the shopping list on success.
  4. Failures stop the batch and report which recipe failed and why.

### T-256 - Add actor portrait and name to CraftingApp header
- Status: `todo`
- Description: `ActorSelector.svelte` renders a bare `<select>` dropdown for actor selection. The selected actor's name and portrait should be prominently displayed to give the crafting app identity and confirm which character is crafting. Competitive modules (Item Piles merchants, Tidy5e) always show the active actor's portrait.
- Acceptance Criteria:
  1. The selected actor's portrait (token or actor image, 48x48px) is displayed next to the actor selector.
  2. The actor's name is shown as a heading above or beside the portrait.
  3. The layout gracefully handles actors without custom portraits.

### T-257 - Add search highlighting to recipe list results
- Status: `todo`
- Description: When typing in the search bar, `RecipeList.svelte` filters recipes but does not highlight the matching text within recipe names or descriptions. Search highlighting is a standard UX pattern that confirms why each result matched.
- Acceptance Criteria:
  1. When a search term is active, matching text segments in recipe names are visually highlighted (bold or background colour).
  2. Highlighting is case-insensitive.
  3. The highlighting does not break HTML structure or XSS safety.

### T-258 - Unify spacing scale across fabricate.css
- Status: `todo`
- Description: `fabricate.css` uses inconsistent spacing values: `10px` and `12px` used interchangeably for padding, `6px` and `8px` for gaps, `4px` and `6px` for inline gaps. The CSS should use a consistent 4px-based spacing scale (`4, 8, 12, 16, 24, 32`) to improve visual rhythm and make future changes predictable.
- Acceptance Criteria:
  1. CSS custom properties `--fab-space-xs: 4px`, `--fab-space-sm: 8px`, `--fab-space-md: 12px`, `--fab-space-lg: 16px`, `--fab-space-xl: 24px` are defined.
  2. All padding, margin, and gap values in `fabricate.css` use these custom properties.
  3. Values that were 10px are rounded to 8px or 12px depending on context.
  4. Visual output is nearly identical (differences under 2px).

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

## Comprehensive Audit — 2026-03-09

Findings from a full spec-vs-implementation, domain-logic, store, and test-coverage audit.

---

### T-259 - Defect: `_normalizeResolutionMode` accepts legacy `mapped`/`tiered` at runtime

- Status: `todo`
- Description: `CraftingSystemManager._normalizeSystem()` (line 60) passes `'mapped'` and `'tiered'` through the valid-modes list at runtime. Spec `004` and task T-166 removed these modes; only `simple | routed | progressive | alchemy` are valid post-migration. A world that skips the migration runner keeps `mapped`/`tiered` as live modes, causing `ResolutionModeService.validateRecipe()` to execute stale legacy branches (`if (mode === 'mapped')`, `if (mode === 'tiered')` at lines 129-154) that should no longer be reachable. Crafting in those modes silently routes through unmaintained code paths.
- Acceptance Criteria:
  1. `_normalizeResolutionMode` maps `'mapped'` → `'routed'` and `'tiered'` → `'routed'` (same as the migration runner) instead of passing them through unchanged.
  2. A unit test confirms that a system stored with `resolutionMode: 'mapped'` normalizes to `'routed'` on load without running the migration runner.
  3. A unit test confirms that a system stored with `resolutionMode: 'tiered'` normalizes to `'routed'` on load.
  4. Regression test: existing alchemy/cauldron legacy normalization (`cauldron` → `alchemy`) is preserved.

---

### T-260 - Defect: Alchemy signature matching ignores ingredient quantity — any single item matches

- Status: `todo`
- Description: `CraftingEngine._matchAlchemySignature()` (lines 550-558) tests only whether the submitted item's `sourceItemUuid` appears in the expanded component ID set for a group. It does not check whether the submitted quantity satisfies the `Ingredient.quantity` requirement. A player submitting one Iron Ingot will match a recipe that requires 5 Iron Ingots. This allows crafting with insufficient materials in alchemy mode, bypassing the consumption cost.
- Acceptance Criteria:
  1. Signature matching enforces ingredient quantity: a submitted item only satisfies a group when the available quantity is >= the required quantity.
  2. A unit test covers: exact quantity match (pass), quantity below threshold (no match), quantity above threshold (pass).
  3. Regression: existing no-match failure path (ingredient consumption) still fires when quantity is insufficient.

---

### T-261 - Defect: `deleteSystem` does not clean up crafting run flags or learned recipe flags on actors

- Status: `todo`
- Description: `CraftingSystemManager.deleteSystem()` (lines 597-611) deletes all recipes via `recipeManager.deleteRecipe()`. `RecipeManager.deleteRecipe()` calls `_cleanupFlagsAfterRecipeMutation()`, which removes learned flags and run history. However, this cleanup iterates recipes one at a time and relies on `recipeManager` emitting individual delete calls. If there are hundreds of recipes, the flag cleanup runs `N` sequential Foundry flag writes (one per recipe per actor), which can time out or partially fail. Spec `007` §"Delete Crafting System" requires the same clean-up as mode change — including in-progress runs — with no provision for partial failure.
- Acceptance Criteria:
  1. `deleteSystem` performs a single bulk cleanup of learned recipe flags and crafting runs across all actors after deleting all recipes, rather than relying on per-recipe sequential cleanup.
  2. A unit test covers deletion of a system with 3+ recipes and confirms all actor flags are cleaned up in a single pass.
  3. Active (in-progress) crafting runs referencing the deleted system's recipes are removed from actor flags.

---

### T-262 - Defect: `addItemFromUuid` deduplication checks `sourceUuid` but `_normalizeComponent` writes to `sourceItemUuid`

- Status: `todo`
- Description: `CraftingSystemManager.addItemFromUuid()` (line 629) checks `system.items.find(i => i.sourceUuid === itemUuid)` to detect duplicates. `_normalizeComponent()` (line 352-353) writes `sourceItemUuid` as the canonical field and `sourceUuid` as a transitional alias — both initially populated. However, after a round-trip through `updateSystem()`, the `sourceUuid` alias may not always survive normalization cleanly, so the deduplication check could fail and add the same item twice. Also, the check uses `sourceUuid` while the intent is to deduplicate on `sourceItemUuid`.
- Acceptance Criteria:
  1. `addItemFromUuid` deduplication checks `sourceItemUuid` (canonical) first, then falls back to `sourceUuid` for legacy items.
  2. A unit test adds the same UUID twice and confirms only one item is created.
  3. A unit test adds an item from a legacy-serialized system (only `sourceUuid` present) and confirms deduplication still works.

---

### T-263 - Defect: `craftingStore.refresh()` detects alchemy mode from any system, not the selected system

- Status: `todo`
- Description: `craftingStore.js` lines 441-446: `isAlchemyMode` is set to `true` if *any* crafting system uses `resolutionMode === 'alchemy'`. The `AlchemySubmitPanel` is then shown unconditionally. In a multi-system world containing both an alchemy system and a simple system, the player sees the alchemy panel even when viewing recipes from the simple system. The panel's `submitAlchemyAttempt` at line 742 uses `activeSystems[0]` which may be the wrong system. There is no concept of a "selected system" in the crafting store for single-system targeting.
- Acceptance Criteria:
  1. `isAlchemyMode` is determined by whether the currently selected crafting system (or the system the active recipes belong to) uses alchemy mode, not by whether any system in the world does.
  2. `submitAlchemyAttempt` passes the correct system ID to `craftAlchemy`.
  3. A store test with two systems (one alchemy, one simple) confirms the alchemy panel only appears when the alchemy system's recipes are active.

---

### T-264 - Defect: `_consumeIngredients` crashes when a matched item lacks `system.quantity`

- Status: `todo`
- Description: `CraftingEngine._consumeIngredients()` (line 646) reads `item.system.quantity || 1`. If `item.system` is `undefined` (system-agnostic or non-standard item type), this throws `TypeError: Cannot read properties of undefined (reading 'quantity')`. This is an unguarded property access on third-party item types, which is common in system-agnostic modules.
- Acceptance Criteria:
  1. `_consumeIngredients` uses optional chaining: `item.system?.quantity ?? 1`.
  2. A unit test covers a mock item where `item.system` is `undefined` and confirms consumption defaults to quantity 1.
  3. The same guard is applied to `_consumeSubmittedAlchemyItems` (line 581: `item.system?.quantity ?? 1`).

---

### T-265 - Defect: Alchemy misconfiguration path (matched signature, unresolvable result group) silently returns no items and reports success

- Status: `todo`
- Description: When alchemy resolves a recipe but the routing provider cannot resolve a valid result group (e.g., `macroOutcome` returns an unrecognized outcome string), `ResolutionModeService.resolveResultGroups()` returns `{ groups: [], meta: { disposition: 'misconfiguration' } }`. `CraftingEngine._createResultItems()` proceeds with an empty `groupsToCreate` and the engine returns `{ success: true, results: [] }`. The player sees "Successfully crafted" with zero items created, ingredients are consumed, and the GM receives no actionable error. Spec `004` §"Alchemy Mode" and spec `005` §"Alchemy Execution Lifecycle" both state: misconfiguration must abort without applying player-failure consumption.
- Acceptance Criteria:
  1. `CraftingEngine.craft()` inspects `resolved.meta.disposition` after `_createResultItems()` and treats `'misconfiguration'` as an abort — returning a GM-facing error, not a player success.
  2. Ingredients are NOT consumed on misconfiguration abort (spec-required behavior).
  3. A unit test covers the misconfiguration path: submitted items match a recipe, macro returns unknown outcome, engine returns `{ success: false, disposition: 'misconfiguration' }`, ingredients not consumed.

---

### T-266 - Defect: `RecipeVisibilityService.evaluateKnowledgeAccess` returns `hasMatchedItem: true` for GM unconditionally

- Status: `todo`
- Description: `RecipeVisibilityService.evaluateKnowledgeAccess()` (lines 107-115) short-circuits for GM users and returns `hasMatchedItem: true` regardless of whether the GM actually owns a matching recipe item. Callers that inspect `matchedItems` (e.g., `learnRecipe`, `applyRecipeItemUseOnCraft`) receive `matchedItems: []` from the same early-return path. This is inconsistent: `hasMatchedItem` is `true` but the array is empty, which breaks any caller that relies on the returned array.
- Acceptance Criteria:
  1. The GM bypass in `evaluateKnowledgeAccess` is clearly documented to signal "always granted" without representing actual item ownership.
  2. Callers that need actual matched items (`learnRecipe`, `applyRecipeItemUseOnCraft`) do not use the short-circuit GM result and instead evaluate items directly.
  3. A unit test confirms that `learnRecipe` for a GM still works correctly even when `matchedItems` is empty.
  4. A unit test confirms that `applyRecipeItemUseOnCraft` skips use-tracking when no actual item is found (even for GM).

---

### T-267 - Defect: `deleteRecipe` inside `deleteSystem` can throw, leaving system partially deleted

- Status: `todo`
- Description: `CraftingSystemManager.deleteSystem()` (lines 604-607) calls `await this.recipeManager.deleteRecipe(recipe.id)` in a loop with no try/catch. If any single recipe deletion fails (e.g., Foundry settings write error, network timeout), the loop aborts: recipes before the failure are deleted, recipes after are not, the system itself is not removed from the map, and `save()` is never called. The system is left in a partially deleted state that is difficult to recover from.
- Acceptance Criteria:
  1. `deleteSystem` wraps the recipe deletion loop in try/catch and collects failures.
  2. Even when some recipe deletions fail, the system is removed from the map and settings are saved.
  3. Failures are logged with recipe IDs so GMs can identify and manually remove orphaned data.
  4. A unit test simulates one failing recipe deletion and confirms the system is still removed and remaining recipes are deleted.

---

### T-268 - Defect: `ResolutionModeService.validateRecipe` validates alchemy recipes against step-level data that is always empty

- Status: `todo`
- Description: `ResolutionModeService.validateRecipe()` (lines 120-175) iterates `steps` returned by `recipe.getExecutionSteps()`. For alchemy recipes this will always be the implicit single step (or an empty array if `getExecutionSteps` is not implemented). The alchemy-specific validation at lines 178-197 separately checks top-level `recipe.ingredientSets` and `recipe.resultGroups`. But the step-level loop at lines 120-175 also runs for alchemy mode (mode check only covers `simple`, `mapped`, `tiered`, `progressive`), silently applying wrong cardinality checks if a step exists. The `routed` mode also has no validation in the step loop, so `routed` recipes with missing `resultSelection.provider` pass validation despite failing the spec.
- Acceptance Criteria:
  1. `validateRecipe` includes a `routed` mode validation branch that checks: at least one ingredient set, at least one result group, `resultSelection.provider` is one of the three supported values, and provider-specific fields are present.
  2. Alchemy mode validation skips the generic step-level loop or explicitly guards against running non-alchemy checks.
  3. A unit test confirms that a `routed` recipe with missing `resultSelection` fails validation.
  4. A unit test confirms that a `routed` recipe with a valid provider passes validation.

---

### T-269 - Defect: `CraftingRunManager` history retention limit not enforced

- Status: `todo`
- Description: Spec `005` §"Run-History Retention" requires history arrays to be capped at 50 entries with oldest entries discarded on every terminal-state transition. The `CraftingRunManager` (referenced in the resolution of T-091) was updated with an in-memory cache, but no implementation evidence in the test suite covers the 50-entry cap. There is no test named or describing "retention limit", "50 entries", or "truncation". The spec is explicit: "Unit tests for retention-limit boundary: inserting the 51st entry causes the oldest entry to be discarded, and `history.length` never exceeds 50."
- Acceptance Criteria:
  1. `CraftingRunManager` enforces the 50-entry history cap on both `craftingRuns.history` and `salvageRuns.history`.
  2. Unit tests cover: inserting the 51st entry (oldest discarded, length stays 50), inserting the 50th entry (no truncation), and verifying most-recent-first ordering.
  3. Tests cover both `craftingRuns.history` and `salvageRuns.history` independently.

---

### T-270 - Defect: `spec/002` `listMode` enum excludes `"teaser"` but implementation accepts it

- Status: `todo`
- Description: `spec/002` §"Recipe Visibility Requirements" defines `listMode` as `"global" | "player" | "knowledge"` with no `"teaser"` value. `CraftingSystemManager._normalizeRecipeVisibility()` (line 202) accepts `"teaser"` as valid. `RecipeVisibilityService.evaluateRecipeAccess()` (line 301) has a `teaser` branch. This is an existing gap logged as T-173 (spec-update task). However, the active risk is that `spec/002` §"Recipe Visibility Requirements" rule 1 states "Invalid or missing values default to `'global'`" — implementors reading the spec would not know `"teaser"` is valid and could write migrations or validators that incorrectly coerce it to `"global"`, destroying teaser configs.
- Acceptance Criteria:
  1. This task tracks that T-173 must be completed before the teaser config feature is considered stable.
  2. Until T-173 is done, add a code comment in `_normalizeRecipeVisibility` cross-referencing T-173 so future developers understand why `"teaser"` is accepted despite not being in the spec.
  3. Add a unit test that confirms `listMode: "teaser"` is preserved (not coerced to `"global"`) by `_normalizeRecipeVisibility`.

---

### T-271 - Defect: `_createSingleResult` falls back to actor's first item type, which can produce wrong item type

- Status: `todo`
- Description: `CraftingEngine._createSingleResult()` (lines 767-773): when a managed item has no `sourceItemUuid` and `fromUuid` returns null, the engine falls back to creating a bare item with `type: fallbackType`, where `fallbackType = craftingActor.items.contents[0]?.type || 'loot'`. This fallback type is arbitrary — it uses whatever type the first item in the actor's inventory happens to be. A potion recipe could produce an item with type `weapon` if the actor's first item is a sword. This causes Foundry to reject the item creation or silently create a malformed document.
- Acceptance Criteria:
  1. The fallback item type is removed or replaced with a stable, system-agnostic default (e.g., use `'loot'` as the constant default rather than reading from actor inventory).
  2. A console warning is emitted when the fallback path is taken so GMs know the component's source item is missing.
  3. A unit test confirms the fallback produces a deterministic item type regardless of actor inventory contents.

---

### T-272 - Defect: `learnRecipe` in `RecipeVisibilityService` hardcodes English error messages

- Status: `todo`
- Description: `RecipeVisibilityService.learnRecipe()` (lines 361-396) returns raw English message strings: `'Crafting system not found'`, `'Learning is not enabled for this crafting system'`, `'Recipe item link is required to learn this recipe'`, `'Recipe is already learned'`, `'No matching recipe item available to learn'`, `'Learned recipe: ${recipe.name}'`. These are surfaced directly to the user via `services.notify` in `craftingStore.js:621-625`. The service layer should not own localizable user-facing strings; they should use i18n keys.
- Acceptance Criteria:
  1. `learnRecipe` return values use i18n-key constants (e.g., `FABRICATE.Knowledge.AlreadyLearned`) instead of English strings.
  2. `craftingStore.learnRecipe` localizes the returned key before passing to `services.notify`.
  3. All new i18n keys are added to `lang/en.json`.
  4. Existing behavior (success/failure notifications shown to user) is preserved.

---

### T-273 - Defect: `evaluateRecipeAccess` double-evaluates knowledge access for non-GM in knowledge mode

- Status: `todo`
- Description: `RecipeVisibilityService.evaluateRecipeAccess()` (lines 307-309) calls `evaluateKnowledgeAccess` to determine visibility, then at lines 330-335 calls it again to determine craftability for non-GM users in knowledge mode. The second call re-runs the same item-matching logic for every recipe in the visible set. For large recipe lists with many actors and items, this doubles the O(actors × items) work per recipe. The first call's result is stored in `knowledge` and partially reused but the guard condition (`if (!viewer?.isGM && listMode === 'knowledge')`) causes re-evaluation.
- Acceptance Criteria:
  1. The second `evaluateKnowledgeAccess` call is eliminated: the result from the first call (stored in `knowledge`) is reused for both visibility and craftability evaluation.
  2. A unit test confirms knowledge access is computed exactly once per `evaluateRecipeAccess` call.
  3. No behavioral change: recipes that were visible-but-not-craftable under knowledge mode continue to behave correctly.

---

### T-274 - Defect: `cleanupLearnedRecipes` iterates `game.actors` directly — misses actors not in the sidebar

- Status: `todo`
- Description: `RecipeVisibilityService.cleanupLearnedRecipes()` (line 441) iterates `game.actors`. In Foundry, `game.actors` contains only world actors visible to the current user (filtered by permission). Actors in folders the GM has not opened, or actors in compendiums, are not included. Learned recipe flags on excluded actors are never cleaned up. Over time this creates orphaned flag data on actors that the cleanup never reaches. The spec `006` §"Recipe Deletion" states: "Remove corresponding learned entries from all actors."
- Acceptance Criteria:
  1. Document the `game.actors` limitation in a code comment (only GMs call this and for GMs `game.actors` is complete, but this should be confirmed).
  2. Confirm whether Foundry's `game.actors` for a GM truly includes all world actors regardless of folder state. If not, use `game.actors.contents` or the appropriate full-collection API.
  3. Add a clarification task or test that verifies cleanup runs against the complete actor collection.

---

### T-275 - Test gap: No tests for `CraftingEngine._createResultItems` misconfiguration disposition handling

- Status: `todo`
- Description: `CraftingEngine._createResultItems()` (lines 690-698) returns early when `rollTableResult.meta.disposition === 'misconfiguration'`. The caller `craft()` does not inspect this return value for misconfiguration — it proceeds to record success and returns `{ success: true }`. This code path has no test coverage (no test file names suggest rollTable misconfiguration in the context of `_createResultItems`). The defect in T-265 is related; this task tracks the missing test coverage independently.
- Acceptance Criteria:
  1. A unit test covers `_createResultItems` returning `{ items: [], rollTableMeta: { disposition: 'misconfiguration' } }`.
  2. A unit test covers the `craft()` caller detecting this disposition and returning an error result.
  3. Tests are added to `crafting-integration.test.js` or a new `crafting-engine-rollTable.test.js`.

---

### T-276 - Test gap: No tests for spec `007` migration abort and rollback behavior

- Status: `todo`
- Description: `tests/migration-runner.test.js` covers normal migration execution, idempotency, and write-on-change. It does not cover the abort/rollback path specified in `007` §"Per-Migration Error Handling": a migration that throws must abort the pass, restore the last known-good checkpoint, not persist partial data, and not update `migrationVersion`. The spec lists explicit required test cases: fatal migration abort, rollback behavior, GM guidance output, and GM prompt defaults.
- Acceptance Criteria:
  1. A test covers: a migration that throws an unusable-document error aborts the pass and `migrationVersion` stays unchanged.
  2. A test covers: data after abort equals the pre-migration snapshot (rollback behavior).
  3. A test covers: no settings writes occur when a migration pass aborts.
  4. A test covers: a fatal error in migration N leaves data from migrations 1..N-1 un-persisted (full pass abort).

---

### T-277 - Test gap: No integration tests for drag-and-drop recipe learning

- Status: `todo`
- Description: Spec `006` §"Testing Requirements" lists extensive integration tests for drag-and-drop recipe learning that do not exist in the test suite: single-recipe match, multi-recipe match (recipe book), already-learned skip, no-match silent ignore, partial success notification, `_stats.compendiumSource` matching, `flags.core.sourceId` matching, consume-on-learn item removal, actor permission check, and `dragDropEnabled === false` disabling auto-learn. The tests in `recipe-visibility-service.test.js` cover unit-level knowledge access but not the drop handler integration path.
- Acceptance Criteria:
  1. An integration test file `tests/drag-drop-learn.test.js` is created covering at minimum: single-recipe match learns the recipe, multi-recipe "recipe book" drop teaches all matched recipes, already-learned recipe is skipped, no-match drop is silently ignored.
  2. Tests cover both `_stats.compendiumSource` and `flags.core.sourceId` matching paths.
  3. A test covers consume-on-learn removing the dropped item.
  4. A test covers `dragDropEnabled === false` preventing auto-learning.

---

### T-278 - Defect: `ResolutionModeService.resolveResultGroups` returns all result groups for unknown modes

- Status: `todo`
- Description: `ResolutionModeService.resolveResultGroups()` (lines 410-413) has a final fallback `return { groups: allGroups, meta: {} }` that returns ALL result groups if the mode is unrecognized (i.e., not `simple`, `mapped`, `tiered`, `progressive`, `alchemy`, or `rollTableResult` pre-resolved). If a system is somehow persisted with an invalid mode that bypasses normalization, the player receives every possible result from every result group — potentially hundreds of items created in a single craft. This is a data integrity risk.
- Acceptance Criteria:
  1. The fallback case returns `{ groups: [], meta: { error: 'Unknown resolution mode', disposition: 'error' } }` instead of all groups.
  2. `CraftingEngine.craft()` treats an error disposition from `resolveResultGroups` as a craft failure.
  3. A unit test covers the unknown-mode fallback returning an error disposition.

---

### T-279 - Defect: `updateSystem` does not trigger alchemy signature revalidation

- Status: `todo`
- Description: Spec `007` §"Alchemy Uniqueness Revalidation" states: "Signature uniqueness is validated across all recipes in the system. Any detected collision blocks saves globally until resolved, including saves from unrelated recipe edits." `CraftingSystemManager.updateSystem()` (lines 540-595) performs salvage config validation but does not call `SignatureValidator.validateSystem()` for alchemy-mode systems. A GM can update a system's component list (e.g., adding a component with a tag that matches an existing recipe's ingredient group), introducing a signature collision without being blocked. The signature validator is only invoked in `RecipeManager._validateRecipeForCreateOrUpdate`.
- Acceptance Criteria:
  1. `updateSystem` calls `SignatureValidator.validateSystem()` when `system.resolutionMode === 'alchemy'`.
  2. If collisions are detected, the update is blocked with actionable diagnostics.
  3. A unit test covers: adding a component to an alchemy system creates a signature collision → `updateSystem` throws.
  4. A unit test covers: updating a non-alchemy system does not run signature validation.

---

### T-280 - Clarification: Spec `002` `CraftingRun.finishedAt` invariant is untested

- Status: `todo`
- Description: Spec `002` §"CraftingRun Requirements" rule 4 states: "`finishedAt` is required for terminal statuses and must be absent for non-terminal statuses." No test file verifies that `completeStepSuccess` / `completeStepFailure` / `cancelRun` in `CraftingRunManager` set `finishedAt`, and that `createRun` does not set it. If `finishedAt` is missing from a terminal run, downstream code that computes duration or orders history by finish time silently gets `undefined`.
- Acceptance Criteria:
  1. A test in `crafting-run-manager.test.js` verifies `finishedAt` is set on terminal status transitions (`succeeded`, `failed`, `cancelled`).
  2. A test verifies `finishedAt` is absent on `createRun` output.
  3. A test verifies `currentStepIndex` is `null` for terminal statuses (spec `002` rule 2).

## Domain Audit Tasks (2026-03-09)

Findings from comprehensive domain model audit: spec compliance, naming fidelity, structural alignment, and domain concept gaps.

---

### T-281 - Domain: Collapse `items`/`components`/`managedItems` triple-alias to canonical `components`

- Status: `todo`
- Description: `CraftingSystemManager._normalizeSystem()` emits the component array under three aliases (`items`, `components`, `managedItems`) on the system object. Internal methods (lines 619, 629, 646, 655, 675) use `system.items`. The spec canonical term is `Component` (spec/002). This triple-alias causes confusion and risks deduplication bugs (T-262 is an example). Collapse to `components` as the single runtime field with `items` and `managedItems` as legacy-read-only aliases.
- Acceptance Criteria:
  1. `_normalizeSystem` output uses `components` as the primary field; `items` and `managedItems` are removed from the output object.
  2. All internal `CraftingSystemManager` methods reference `system.components` instead of `system.items`.
  3. Legacy read paths (`system.items`, `system.managedItems`) are supported only in `_normalizeSystem` input parsing, not on the output.
  4. Transitional alias table in spec/002 is updated to mark `items` and `managedItems` as legacy read-only.
  5. No behavioral change for consumers; all existing tests pass.

---

### T-282 - Domain: Remove `features.complexRecipes` UI-only gate or derive from resolution mode

- Status: `todo`
- Description: `features.complexRecipes` is not in the spec. It gates visibility of multiple ingredient sets, multiple result groups, and `ResultSelectionProvider.svelte` in the recipe editor. This creates a configuration trap: a GM setting up a `routed` system who hasn't enabled "Complex Recipes" cannot configure result selection (T-229). The resolution mode already determines which editing controls are needed.
- Acceptance Criteria:
  1. `ResultSelectionProvider` visibility is determined by `resolutionMode` (shown for `routed` and `alchemy`), not by `features.complexRecipes`.
  2. Multiple ingredient sets and result groups are available when `resolutionMode` is `routed` or `alchemy`, regardless of feature flags.
  3. `features.complexRecipes` is either removed or retained as a purely cosmetic UI toggle that never blocks required mode configuration.
  4. Decision is documented in DOMAIN.md open questions.

---

### T-283 - Domain: Remove orphaned `tier` field from Component normalization

- Status: `todo`
- Description: `_normalizeComponent()` preserves `tier: item.tier || null` but the spec defines no `tier` field on Component. The legacy tiered mode was removed in T-166. The `difficulty` field serves the progressive mode purpose. `tier` is dead data that inflates stored settings.
- Acceptance Criteria:
  1. `_normalizeComponent` no longer emits `tier`.
  2. Migration removes `tier` from persisted component data.
  3. No runtime code references `component.tier`.

---

### T-284 - Domain: Remove orphaned system-level `difficulty` object

- Status: `todo`
- Description: `_normalizeSystem()` creates `difficulty: { base: 10, tierWeight: 0, tagWeights: {}, essenceWeights: {} }` but the spec defines no system-level `difficulty` object. Component-level `difficulty` (for progressive mode) is a separate concept. If `CraftingCheckAdapter` uses this object, it should be specced; if not, it is dead code.
- Acceptance Criteria:
  1. Determine whether `CraftingCheckAdapter` or any other code reads `system.difficulty`.
  2. If unused: remove from `_normalizeSystem` output and clean up any references.
  3. If used: add to spec/002 CraftingSystem schema with field definitions.

---

### T-285 - Domain: Remove orphaned `enableTiers`/`tiers` transitional aliases from system normalization

- Status: `todo`
- Description: `_normalizeSystem()` emits `enableTiers: false` and `tiers: []` as hardcoded dead values. Tiered mode was removed in T-166. These fields inflate stored data and confuse code readers into thinking tiered mode is still supported.
- Acceptance Criteria:
  1. `enableTiers` and `tiers` are removed from `_normalizeSystem` output.
  2. No runtime or UI code references `system.enableTiers` or `system.tiers`.
  3. Transitional alias table in spec/002 is updated to mark these as retired.

---

### T-286 - Domain: Spec `features.craftingChecks`, `features.outcomeRouting`, and `features.chatOutput`

- Status: `todo`
- Description: Three implemented feature toggles (`craftingChecks`, `outcomeRouting`, `chatOutput`) are absent from spec/002's `features` block. `craftingChecks` overlaps with `craftingCheck.enabled`. `outcomeRouting` is derivable from resolution mode. `chatOutput` controls a user-visible behavior (posting craft results to chat) and deserves spec coverage.
- Acceptance Criteria:
  1. `features.chatOutput` is added to spec/002 `features` block with default `true`.
  2. `features.craftingChecks` is evaluated: if it is redundant with `craftingCheck.enabled`, remove from features and document the decision. If distinct, add to spec.
  3. `features.outcomeRouting` is evaluated: if it is derivable from `resolutionMode`, remove from features.
  4. Decisions documented in DOMAIN.md.

---

### T-287 - Domain: Spec `craftingCheck.mode` and `craftingCheck.checkSource` fields

- Status: `todo`
- Description: `_normalizeCraftingCheck()` preserves `mode` (`tiered` or `passFail`) and `checkSource` (`builtIn` or `macro`) fields, plus a `builtIn` sub-object. None of these are in spec/002's `craftingCheck` schema. `mode: 'tiered'` references the removed tiered concept. `checkSource: 'builtIn'` suggests a built-in check adapter not described in the spec.
- Acceptance Criteria:
  1. Determine whether `craftingCheck.mode` serves a purpose post-T-166. If `passFail` is the only valid value, remove `mode` from normalization.
  2. Determine whether the built-in check adapter (`checkSource: 'builtIn'`, `builtIn: {...}`) is an active feature. If so, add to spec/002. If not, remove from normalization.
  3. Remove `tiered` references from `_normalizeCraftingCheck` (outcomes default `['low', 'high']` for tiered mode is dead code).

---

### T-288 - Domain: `componentSourceActors` naming collision with `Component`

- Status: `todo`
- Description: The parameter name `componentSourceActors` uses "component" to mean "ingredient source" (actors whose inventory is searched for crafting materials). This collides with Fabricate's domain term "Component" (a curated item in the crafting system library). The spec uses this term consistently but it creates confusion when reading code like `_collectCandidateItems(recipe, craftingActor, componentSourceActors)`. A reader must know that "component" here means "Foundry item" not "Fabricate Component."
- Acceptance Criteria:
  1. Evaluate whether renaming to `ingredientSourceActors` or `materialSourceActors` improves clarity without breaking too many call sites.
  2. If rename is approved, update all parameter names, settings keys (`lastComponentSources`), and i18n strings.
  3. If rename is rejected, document the naming convention in DOMAIN.md.

---

### T-289 - Spec gap: `salvageResolutionMode` uses `tiered` but tiered mode is removed

- Status: `todo`
- Description: Spec/002 defines `salvageResolutionMode: "simple" | "tiered" | "progressive"` and spec/005 references "tiered" salvage extensively. However, the `tiered` resolution mode was removed from the main crafting path in T-166 (replaced by `routed` with `macroOutcome` provider). The salvage path retains `tiered` as a distinct concept with `Component.salvage.outcomeRouting`. This inconsistency means "tiered" means different things depending on whether you're reading the crafting spec or the salvage spec.
- Acceptance Criteria:
  1. Determine whether salvage `tiered` should be aligned with `routed` (using provider-based routing) or kept as a simpler outcome-map model.
  2. If aligned: rename to a salvage-specific term or reuse `routed`, update spec/002 and spec/005.
  3. If kept: document explicitly in DOMAIN.md why salvage uses `tiered` while crafting does not, and ensure no code path confuses the two.

---

### T-290 - Spec gap: Salvage implementation is partial — spec is complete

- Status: `todo`
- Description: Spec/005 defines a complete salvage lifecycle including `SalvageRun`, `salvageResolutionMode`, destructive change rules, macro contracts, and actor flag shapes. The implementation has normalization for salvage config in `CraftingSystemManager` and some salvage logic in `CraftingEngine`, but no `SalvageRunManager`, no salvage UI, no `salvageRuns` flag management, and incomplete test coverage. The spec presents salvage as a ready feature when it is not.
- Acceptance Criteria:
  1. Spec/005 salvage section is annotated with a "Status: Future" marker indicating implementation is incomplete.
  2. Alternatively, a separate spec file `spec/009-salvage.md` is created to isolate the salvage contract from the crafting contract.
  3. DOMAIN.md documents salvage as a planned bounded context, not a current one.

---

### T-291 - Spec gap: `CraftingCheckAdapter` and `builtIn` check source are unspecced

- Status: `todo`
- Description: `CraftingCheckAdapterRegistry` and `CraftingCheckAdapter.js` implement a built-in check resolution system (dice roll formulas, DCs, proficiency bonuses) that bypasses the macro contract entirely. `_normalizeCraftingCheck` supports `checkSource: 'builtIn'` with a `builtIn: { formula, dc, ... }` sub-object. None of this is in the spec. The spec says checks are macro-driven. This is either an undocumented feature or dead code.
- Acceptance Criteria:
  1. Determine whether the built-in check adapter is actively used or dead code.
  2. If active: create a spec section in spec/002 or spec/004 defining the built-in check contract.
  3. If dead: remove `CraftingCheckAdapter.js`, `CraftingCheckAdapterRegistry`, and `checkSource`/`builtIn` from normalization.

---

### T-292 - i18n alignment: `Ingredient.Tier` key references removed concept

- Status: `todo`
- Description: `lang/en.json` contains `"FABRICATE.Ingredient.Tier": "Tier"` — a reference to the removed tiered mode. No UI code appears to use this key after T-166.
- Acceptance Criteria:
  1. Remove `FABRICATE.Ingredient.Tier` from `lang/en.json` if no code references it.
  2. Audit for other orphaned i18n keys referencing removed concepts.

---

### T-293 - i18n alignment: `Admin.Rules` section contains placeholder text, not functional labels

- Status: `todo`
- Description: `lang/en.json` `FABRICATE.Admin.Rules.Placeholder` and `FABRICATE.Admin.Rules.PlaceholderDetail` contain developer-facing placeholder text ("Difficulty and advanced system-wide rule editing will live here"). This text is rendered to GMs in the Rules tab. After T-195/T-217 wired the Rules tab, these placeholder strings should be replaced with functional labels or removed.
- Acceptance Criteria:
  1. `FABRICATE.Admin.Rules.Placeholder` and `PlaceholderDetail` are either removed or replaced with user-facing descriptions of the teaser/rules configuration.
  2. The Rules tab renders functional UI labels, not developer placeholder text.

