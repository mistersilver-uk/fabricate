# Agent Backlog

Purpose: keep agent work explicit, reviewable, and testable.

## Task Rules

- Each task must include: `ID`, `Title`, `Status`, `Description`, `Acceptance Criteria`.
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

### T-054 - Ship Starter Content Pack and Check Macro Templates
- Status: `blocked`
- Blocked by: Needs an item compendium for the starter pack.
- Description: Add a starter content package that reduces time-to-first-craft for new GMs. Include at least one ready-to-use crafting system with sample components/recipes plus copy-paste check macro templates for common systems and a generic fallback.
- Acceptance Criteria:
  1. A starter data pack is available from inside the module (importable JSON or compendium content) with at least one complete system and at least 10 recipes.
  2. The starter pack includes required managed components, categories, and visibility settings so recipes are immediately craftable after import.
  3. At least two check macro templates are included and documented: one `dnd5e`-specific and one system-agnostic fallback.
  4. A smoke test verifies a fresh world can import the pack and successfully craft at least one recipe end-to-end without manual data authoring.
  5. User docs explain where starter content lives, how to import it, and how to adapt templates for custom systems.
  6. A compendium for the starter pack is available and included with the module.
  7. All components referenced in the starter pack are included in the module's compendium, and vice-versa.

### T-055 - Add Built-In Roll/Check UI (No Macro Required)
- Status: `todo`
- Description: Implement a built-in crafting-check mode so GMs can configure skill checks through UI fields instead of writing JavaScript macros. Keep macro mode available for advanced users.
- Acceptance Criteria:
  1. Crafting-system settings expose check mode selection: `builtIn` or `macro`.
  2. `builtIn` mode provides configurable fields for ability, optional skill, DC, and advantage/disadvantage (or equivalent system modifiers).
  3. Crafting engine resolves checks through a system adapter and returns a normalized pass/fail or value/outcome payload used by existing resolution modes.
  4. When a system adapter is unavailable, UI shows a clear fallback/error path and allows switching to macro mode.
  5. Unit tests cover serialization, default values, adapter invocation, and all failure paths.
  6. Backward compatibility is preserved for existing macro-based systems.

### T-056 - Add Automatic Crafting Chat Output
- Status: `done`
- Description: Post automatic chat summaries for crafting attempts so results are visible to the table without requiring custom success/failure macros.
- Acceptance Criteria:
  1. A system-level toggle controls automatic chat output and defaults to `enabled`.
  2. Successful craft messages include actor, recipe name, consumed ingredients/catalysts, and created results.
  3. Failure messages include actor, recipe name, failure reason, and any consumed resources.
  4. Messages are emitted exactly once per craft action and do not duplicate macro-generated output unless explicitly configured.
  5. Unit tests verify message payload content, toggle behavior, and no-message path when disabled.
  6. Localization keys are used for all user-facing chat labels and status text.

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

### T-058 - Add Favourites and Recently Crafted Lists
- Status: `todo`
- Description: Improve player UX by letting users pin favourite recipes and quickly access recently crafted ones.
- Acceptance Criteria:
  1. Players can toggle favourite status for a recipe in the crafting UI.
  2. A `Favourites` section appears at the top of recipe browsing when favourites exist.
  3. Recently crafted recipes are tracked per user and shown in a dedicated quick-access section.
  4. Favourites and recent lists persist across sessions using client-scoped settings.
  5. Data is isolated per user and per world and does not leak between users.
  6. UI tests cover toggle behavior, persistence, empty-state rendering, and sorting.

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

### T-060 - Redesign Recipe Editor UX for Complex Recipes
- Status: `todo`
- Description: Replace high-friction paginated editing for ingredient/result groups with a layout optimized for mapped/tiered recipes containing many options.
- Acceptance Criteria:
  1. Recipe editor supports viewing and editing multiple ingredient sets/result groups without forced carousel pagination.
  2. Group panels are collapsible/reorderable and maintain stable identifiers during edits.
  3. Core authoring workflows (add/remove option, catalyst editing, routing, save/cancel) remain functionally equivalent.
  4. Validation errors anchor to and highlight the exact affected section/field.
  5. Keyboard navigation and screen-reader labels are preserved or improved for new controls.
  6. Regression tests cover creation and edit flows for large mapped and tiered recipes.

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

### T-062 - Publish Item Piles Integration Guides and Macros
- Status: `reverted`
- Description: ~~Provide first-class documentation and ready-to-use macro examples for integrating Fabricate with Item Piles workflows.~~ Reverted — macro-based integration guides do not meet the bar for a real integration. See T-086 for the replacement spec requirement.

### T-063 - Add Gathering/Harvesting Workflow
- Status: `todo`
- Description: Introduce an optional gathering/harvesting flow so ingredient acquisition can be run as a first-class Fabricate action instead of a separate custom process.
- Acceptance Criteria:
  1. Systems can define gathering activities with outputs, checks, and optional tool/catalyst requirements.
  2. Players can run gathering actions from UI and receive generated components/results into inventory.
  3. Gathering supports success/failure outcomes and configurable on-fail consumption behavior.
  4. Activity execution records history/audit data consistent with existing run-management patterns.
  5. Feature is gated behind a system toggle and has no behavioral impact when disabled.
  6. Unit/integration tests cover simple success, failed check, and invalid configuration paths.

## Spec Alignment Tasks

### T-064 - Spec 002: Add `global` Recipe Visibility List Mode and Default
- Status: `done`
- Description: Update the data-model spec so `CraftingSystem.recipeVisibility.listMode` includes `global` and explicitly defaults to `global`. This aligns the spec with implemented normalization and UI behavior.
- Acceptance Criteria:
  1. `spec/002-data-models.md` defines `listMode` as `"global" | "player" | "knowledge"`.
  2. Spec text states default behavior is `listMode = "global"` when unset or invalid.
  3. All examples and field tables in spec 002 are updated to include `global`.
  4. Any cross-reference docs that mention `player|knowledge` only are updated to the 3-mode contract.
  5. No conflicting enum/default statements remain anywhere in `spec/`.

### T-065 - Spec 002/006: Define Empty `allowedUserIds` Semantics for Restricted Recipes
- Status: `done`
- Description: Clarify that `visibility.restricted=true` with an empty `allowedUserIds` list is valid and hides the recipe from all non-GM users, rather than being treated as a validation error.
- Acceptance Criteria:
  1. `spec/002-data-models.md` removes/updates any rule that requires non-empty `allowedUserIds` when restricted.
  2. `spec/006-recipe-visibility.md` explicitly documents evaluation semantics for empty `allowedUserIds`.
  3. GM visibility behavior is explicit: GM can still view/manage restricted recipes regardless of allow-list.
  4. Validation guidance in the spec distinguishes invalid shape from valid-but-hidden configuration.
  5. Spec examples include one restricted+empty case with expected visibility outcome.

### T-066 - Spec 006: Add Explicit `global` Branch to Listing Algorithm and Tests
- Status: `done`
- Description: Extend visibility behavior spec to include first-class `global` list-mode semantics and corresponding testing requirements.
- Acceptance Criteria:
  1. `spec/006-recipe-visibility.md` listing algorithm includes a `listMode === "global"` branch.
  2. `global` behavior is defined unambiguously for GM and non-GM viewers.
  3. Interaction of `global` listing with lock/craft guards is explicitly described.
  4. Testing requirements in spec 006 include unit coverage for `global` mode listings.
  5. No residual text implies only 2 list modes in spec 006.

### T-067 - Spec 006: Make Drag-and-Drop Learning a Required Behavior
- Status: `done`
- Description: Convert drag-and-drop recipe learning from optional language to required behavior, including matching rules, multi-match learning, and user feedback expectations.
- Acceptance Criteria:
  1. `spec/006-recipe-visibility.md` removes conditional wording (`if implemented`) for drag-and-drop learn.
  2. Required matching rules are specified for UUID and `flags.core.sourceId`.
  3. Multi-recipe matching from one dropped item is defined as a required capability.
  4. Required success/failure notification expectations are documented.
  5. Testing requirements include integration tests for drag-and-drop learn flow.

### T-068 - Spec 003: Update Visibility UI Contract for `global|player|knowledge`
- Status: `done`
- Description: Update UI integration spec to reflect three visibility list modes and mode-specific control visibility in both system editor and recipe editor flows.
- Acceptance Criteria:
  1. `spec/003-ui-integration.md` defines list-mode selector options as `global`, `player`, `knowledge`.
  2. Spec explicitly describes which visibility controls are shown/hidden in each mode.
  3. Recipe list visibility-summary behavior is aligned to player mode only.
  4. Recipe editor behavior for global mode is documented (no player allow-list controls).
  5. No stale UI text remains that assumes only `player|knowledge`.

### T-069 - Spec 002: Clarify Catalyst `maxUses` Validation Rules
- Status: `done`
- Description: Record the implemented catalyst validation rule: `maxUses` constraints are enforced only when `degradesOnUse` is enabled; otherwise `maxUses` may be null/ignored for validity.
- Acceptance Criteria:
  1. `spec/002-data-models.md` catalyst requirements explicitly scope `maxUses` validation to `degradesOnUse === true`.
  2. Spec states `maxUses` is optional/non-blocking when `degradesOnUse === false`.
  3. Error/validation expectations are defined for invalid positive-integer constraints only in degrade-enabled scenarios.
  4. Any contradictory catalyst validation text is removed.
  5. Testing requirements mention coverage for the full `degradesOnUse × maxUses` matrix.

### T-070 - Spec 005: Clarify Multi-Step Recipes with Empty Top-Level Sets
- Status: `done`
- Description: Document that explicit multi-step recipes may have empty or absent top-level `ingredientSets/resultGroups`, and runtime/UI must resolve step-level sets without error.
- Acceptance Criteria:
  1. `spec/005-recipes-and-steps.md` explicitly permits empty/absent recipe-level sets for explicit multi-step recipes.
  2. Active-step resolution precedence is defined clearly over recipe-level fallback fields.
  3. Validation rules distinguish single-step contracts from explicit multi-step contracts.
  4. UI expectations cover rendering/details behavior when recipe-level sets are empty.
  5. Testing requirements include regression coverage for this shape.

### T-071 - Spec 007: Document Startup Migration Framework and `migrationVersion`
- Status: `done`
- Description: Update migration spec to reflect the implemented versioned migration runner, including `fabricate.migrationVersion`, ordered pending migrations, continue-on-error behavior, and write-on-change persistence.
- Acceptance Criteria:
  1. `spec/007-destructive-changes-and-migrations.md` documents `fabricate.migrationVersion` as migration state storage.
  2. Startup migration flow defines pending migration selection by semantic version ordering.
  3. Per-migration error handling is documented: failed migration logs warning and remaining migrations continue.
  4. Spec states data/settings persistence occurs only when payload changes are detected.
  5. Testing requirements include idempotency and partial-failure progression behavior.

### T-072 - Spec 002/007: Add Canonical-Write and Legacy-Read Compatibility Policy
- Status: `done`
- Description: Formalize compatibility policy during migration windows: reads may accept legacy aliases, but writes must emit canonical fields. Document alias mappings and retirement expectations.
- Acceptance Criteria:
  1. Spec defines canonical-write policy for current model fields (`componentId`, `components`, `match.type="component"`).
  2. Spec enumerates allowed legacy read aliases and their normalization behavior.
  3. Alias policy is tied to migration framework guidance in spec 007.
  4. Spec states that new persisted data must not emit legacy keys except explicitly documented transitional aliases.
  5. Testing requirements include backward-compat read tests and canonical-write assertions.

### T-073 - Spec 005: Define Run-History Retention Limits as Contract
- Status: `done`
- Description: Turn current run-history truncation behavior into explicit specification so retention and ordering are stable, testable, and not accidental implementation details.
- Acceptance Criteria:
  1. `spec/005-recipes-and-steps.md` defines maximum retained history length for `craftingRuns.history` and `salvageRuns.history`.
  2. Spec defines ordering contract (most recent first) and truncation behavior when limit is exceeded.
  3. Spec states whether the limit is fixed or configurable, with default value documented.
  4. Cross-reference to actor-flag shape remains consistent with spec 002/005 definitions.
  5. Testing requirements include limit-boundary behavior and ordering assertions.

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

### T-075 - Split `crafting-systems.md` Into Focused Topic Pages
- Status: `todo`
- Description: Reduce cognitive load by decomposing the current monolithic `docs/crafting-systems.md` page into focused pages for checks, effect transfer, and salvage while keeping the base system setup page concise. Preserve all current guidance and examples while improving navigation and discoverability.
- Acceptance Criteria:
  1. New pages are created with valid front matter and nav placement: `docs/crafting-checks.md`, `docs/effect-transfer.md`, and `docs/salvage.md`.
  2. `docs/crafting-systems.md` is narrowed to system creation/settings, feature toggles, managed items, and requirements only.
  3. Crafting-check configuration and worked examples are moved from `docs/crafting-systems.md` into `docs/crafting-checks.md`.
  4. Effect-transfer content (including triple-flag pipeline and worked example) is moved into `docs/effect-transfer.md`.
  5. Salvage resolution and `salvageCraftingCheck` guidance are moved into `docs/salvage.md`.
  6. Internal links and sidebar navigation are updated so all moved sections remain reachable and no stale anchors remain.

### T-076 - Add Task-Oriented `docs/how-to/` Documentation Section
- Status: `done`
- Description: Add a task-first documentation section for users who need direct answers to practical goals. Create concise "How do I...?" pages that point to full references without duplicating entire concept pages.
- Acceptance Criteria:
  1. A new `docs/how-to/` section exists with an index/landing page linked from docs navigation.
  2. Six pages are added for the recommended tasks: skill-check recipes, recipe discovery during play, degrading tools/catalysts, effect transfer setup, crafting from shared party storage, and recipe import/export workflows.
  3. Each how-to page includes four consistent blocks: problem statement, one-paragraph answer, minimal UI/code steps, and links to deeper reference pages.
  4. Each page is intentionally concise and answer-first (targeting short-form guidance rather than full conceptual treatment).
  5. All cross-links to existing pages/macros are valid and point to current file paths.
  6. The main docs home page includes an entry point to the new how-to section for non-linear, task-driven learning.

### T-077 - Add "What's Next?" Learning-Path Navigation to Concept Pages
- Status: `done`
- Description: Add explicit continuation links at the end of core concept pages so readers can follow a guided learning path instead of returning to sidebar navigation after each page.
- Acceptance Criteria:
  1. `docs/catalysts.md` ends with a "What's next?" section linking to `docs/recipes/index.md` and `docs/api/crafting-engine.md`.
  2. `docs/essences.md` ends with a "What's next?" section linking to effect transfer docs and recipe-editor-related docs.
  3. `docs/visibility.md` ends with a "What's next?" section linking to recipe editing/visibility configuration and crafting-app experience docs.
  4. `docs/recipes/simple.md`, `docs/recipes/mapped.md`, `docs/recipes/tiered.md`, and `docs/recipes/progressive.md` each include "What's next?" links to the next mode page and relevant macro-contract guidance.
  5. Added links are ordered intentionally (next most-likely page first) and use consistent section headings/formatting.
  6. Manual link verification confirms all new "What's next?" links resolve to existing pages/anchors.

### T-078 - Enable and Tune Just the Docs Search
- Status: `done`
- Description: Configure Just the Docs built-in search so users can quickly locate settings and behaviors without manually scanning long pages. Apply the recommended search configuration in `_config.yml` and verify results quality on key terms.
- Acceptance Criteria:
  1. `docs/_config.yml` enables search and includes the configured options for heading depth, preview count, preview context windows, and tokenizer separator.
  2. The generated docs site displays the search UI in navigation and returns results while typing.
  3. Search returns relevant results for representative terms from current docs (for example: `consumeIngredientsOnFail`, `knowledge`, `salvageCraftingCheck`).
  4. Search previews include enough context to distinguish similarly named settings.
  5. No existing docs-site configuration is broken by the search changes.
  6. A brief note is added to docs home/usage guidance so readers know search is available.

### T-079 - Make `visibility.md` the Single Canonical Visibility Guide
- Status: `done`
- Description: Eliminate duplicated visibility guidance by reducing non-canonical pages to short link-outs and concentrating authoritative behavior details in `docs/visibility.md`. This prevents documentation drift as visibility features evolve.
- Acceptance Criteria:
  1. The long visibility section in `docs/crafting-systems.md` is replaced with a short summary and a direct link to `docs/visibility.md`.
  2. `docs/visibility.md` contains the full and authoritative explanation of list modes, knowledge options, linked recipe items, and learn flow behavior.
  3. Duplicate mode-by-mode visibility explanations are removed from non-canonical docs pages unless strictly necessary for a brief contextual reference.
  4. Where visibility is mentioned elsewhere, wording clearly signals `docs/visibility.md` as the canonical source.
  5. Cross-links are updated so readers land on `docs/visibility.md` for detailed configuration.
  6. A docs-content audit confirms there are no conflicting visibility instructions across pages after the cleanup.

### T-080 - Add Narrative Introductions Before Configuration Tables
- Status: `done`
- Description: Improve accessibility for first-time readers by adding short scenario-driven intros before the first configuration table in core concept pages. Use concrete crafting examples to explain "why this exists" before presenting field-level configuration details.
- Acceptance Criteria:
  1. `docs/essences.md`, `docs/catalysts.md`, and `docs/visibility.md` each include a 3-5 sentence narrative introduction before their first configuration table.
  2. Each intro uses concrete in-world examples (items, crafting situations, player outcomes) rather than abstract terminology alone.
  3. Existing configuration tables remain accurate and are preserved below the new conceptual lead-in.
  4. Intro language is audience-appropriate for GMs and avoids assuming API-level familiarity.
  5. Each intro links or transitions cleanly into a deeper section or worked example on the same page.
  6. Terminology used in intros is consistent with field names and behavior described later in each page.

### T-081 - Create `docs/troubleshooting.md` for Common Failure Modes
- Status: `done`
- Description: Add a troubleshooting guide for predictable setup/runtime issues based on existing validation behavior and known support pain points. Provide symptom-first entries with concrete checks and links to corrective documentation.
- Acceptance Criteria:
  1. A new `docs/troubleshooting.md` page exists with navigation/front matter and is linked from docs home and quickstart follow-up navigation.
  2. The guide includes entries for the recommended failure modes: missing recipes in app, crafting check macro not running, catalysts not degrading/tracking, effect transfer not applying, and salvage configuration rejection.
  3. Each troubleshooting entry follows a consistent structure: symptom, likely causes, step-by-step checks, and links to the authoritative docs page.
  4. Troubleshooting checks align with current validation logic and documented contracts (including mode-specific macro return shapes where relevant).
  5. The page references the correct feature prerequisites/flags for effect transfer and visibility behavior.
  6. At least one quick diagnostic checklist is provided for "before filing an issue" to reduce repeated support questions.

## Integration Tasks

### T-086 - Implement Automated Item Piles Integration
- Status: `todo`
- Description: Build a first-class automated integration with Item Piles per `spec/008-integrations.md`. The integration must detect Item Piles, use its public API, and require zero user-authored macros. Covers currency costs as crafting requirements, merchant stock as ingredient sources, and container contents as crafting-station inventory.
- Acceptance Criteria:
  1. A system-level feature toggle `features.itemPiles` controls the integration and defaults to `false`.
  2. Fabricate detects Item Piles at startup and hides/disables the toggle when the module is absent.
  3. Currency costs are defined as a recipe requirement field and deducted automatically on successful craft via the Item Piles API.
  4. Merchant actor stock is queryable as an ingredient source without user macros.
  5. Item Piles container contents are readable as crafting-station inventory for multi-step recipes.
  6. All data exchange uses the Item Piles public API (`game.itempiles.API`), not internal flags or direct document manipulation.
  7. Unit tests mock the Item Piles API and cover: module-absent, toggle-off, and toggle-on happy paths.
  8. A minimum compatible Item Piles version is documented and enforced at runtime.
  9. No user-authored macros or scripts are required at any point in the workflow.
