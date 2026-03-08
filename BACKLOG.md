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
- Status: `todo`
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

### T-097 - Add Compendium Import with UUID Override and Fallback Item IDs
- Status: `todo`
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

### T-098 - Add Local Release Build Action for Dist-Ready Module Packaging
- Status: `todo`
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

### T-099 - Implement Cauldron Crafting Resolution Mode
- Status: `todo`
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

### T-166 - Unify Mapped and Tiered into Routed Result Selection
- Status: `todo`
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

### T-167 - Implement Overlapping Signature Uniqueness Validation (Components + Tags)
- Status: `todo`
- Dependencies: `T-165`, `T-166`
- Description: Implement global uniqueness validation for satisfiable ingredient signatures across all recipes and ingredient groups in a crafting system, including tag-based matching expansion, and block save/import on collisions.
- Acceptance Criteria:
  1. Signature expansion includes component matches and tag-based matches (`any`/`all`) against the system component/tag graph.
  2. Overlapping satisfiable signatures are detected across all recipes in the same crafting system (not only exact textual duplicates).
  3. Save/import operations are blocked on collisions with actionable diagnostics identifying both conflicting recipe/ingredient-set paths.
  4. Revalidation runs when relevant recipe, component, or tag definitions change so new overlaps cannot persist silently.
  5. Collision diagnostics are surfaced in GM UI (recipe editor/manager) and API validation responses.
  6. Unit/integration tests cover component-vs-component overlap, component-vs-tag overlap, tag-vs-tag overlap, and no-false-positive scenarios.

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
- Status: `todo`
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
- Status: `todo`
- Description: Fix the crafting app favourites presentation so favourited recipes do not render as oversized cards ahead of the normal recipe list. Favourites must be exposed via a dedicated UX pattern (separate tab, distinct section, or explicit `Show favourites only` toggle) that keeps browse layout stable.
- Acceptance Criteria:
  1. Repro is documented from current UI state here `FAVOURITES` appears before the standard list with oversized icon rendering that disrupts list layout.
  2. Favourites are moved out of the inline pre-list oversized presentation into one supported pattern: separate tab, compact section matching normal card size, or `Show favourites only` toggle filter.
  3. Favourite recipe cards use the same visual sizing constraints as normal recipe cards (icon bounds, row height, spacing), with no unbounded image growth.
  4. Default browse flow remains focused on the normal recipe list; favourites view/filter is opt-in and does not push regular results off-screen.
  5. Existing favourite state persistence and toggle behavior remain unchanged.
  6. UI tests cover: default list rendering without oversized favourites, switching into favourites view/filter, and returning to full list without layout regressions.
  7. Manual verification notes include before/after screenshots at the same window size confirming stable layout and readable favourites UX.

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
- Status: `todo`
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
