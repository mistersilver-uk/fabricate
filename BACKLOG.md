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
```

## Tasks

## Competitive Analysis Gap Tasks

### T-054 - Ship Starter Content Pack and Check Macro Templates
- Status: `todo`
- Description: Add a starter content package that reduces time-to-first-craft for new GMs. Include at least one ready-to-use crafting system with sample components/recipes plus copy-paste check macro templates for common systems and a generic fallback.
- Acceptance Criteria:
  1. A starter data pack is available from inside the module (importable JSON or compendium content) with at least one complete system and at least 10 recipes.
  2. The starter pack includes required managed components, categories, and visibility settings so recipes are immediately craftable after import.
  3. At least two check macro templates are included and documented: one `dnd5e`-specific and one system-agnostic fallback.
  4. A smoke test verifies a fresh world can import the pack and successfully craft at least one recipe end-to-end without manual data authoring.
  5. User docs explain where starter content lives, how to import it, and how to adapt templates for custom systems.

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
- Status: `todo`
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
- Status: `todo`
- Description: Provide first-class documentation and ready-to-use macro examples for integrating Fabricate with Item Piles workflows.
- Acceptance Criteria:
  1. Docs include a step-by-step guide for using Item Piles merchants as ingredient vendors.
  2. Docs include a guide for Item Piles currency integration with Fabricate currency requirements.
  3. Docs include a guide for combining Item Piles flows with time-gated crafting.
  4. At least three copy-paste macro examples are provided, validated against current API names.
  5. All integration docs live under `docs/` and are linked from the main docs index.
  6. Manual verification checklist confirms examples run without edits other than IDs/UUIDs.

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
- Status: `todo`
- Description: Update the data-model spec so `CraftingSystem.recipeVisibility.listMode` includes `global` and explicitly defaults to `global`. This aligns the spec with implemented normalization and UI behavior.
- Acceptance Criteria:
  1. `spec/002-data-models.md` defines `listMode` as `"global" | "player" | "knowledge"`.
  2. Spec text states default behavior is `listMode = "global"` when unset or invalid.
  3. All examples and field tables in spec 002 are updated to include `global`.
  4. Any cross-reference docs that mention `player|knowledge` only are updated to the 3-mode contract.
  5. No conflicting enum/default statements remain anywhere in `spec/`.

### T-065 - Spec 002/006: Define Empty `allowedUserIds` Semantics for Restricted Recipes
- Status: `todo`
- Description: Clarify that `visibility.restricted=true` with an empty `allowedUserIds` list is valid and hides the recipe from all non-GM users, rather than being treated as a validation error.
- Acceptance Criteria:
  1. `spec/002-data-models.md` removes/updates any rule that requires non-empty `allowedUserIds` when restricted.
  2. `spec/006-recipe-visibility.md` explicitly documents evaluation semantics for empty `allowedUserIds`.
  3. GM visibility behavior is explicit: GM can still view/manage restricted recipes regardless of allow-list.
  4. Validation guidance in the spec distinguishes invalid shape from valid-but-hidden configuration.
  5. Spec examples include one restricted+empty case with expected visibility outcome.

### T-066 - Spec 006: Add Explicit `global` Branch to Listing Algorithm and Tests
- Status: `todo`
- Description: Extend visibility behavior spec to include first-class `global` list-mode semantics and corresponding testing requirements.
- Acceptance Criteria:
  1. `spec/006-recipe-visibility.md` listing algorithm includes a `listMode === "global"` branch.
  2. `global` behavior is defined unambiguously for GM and non-GM viewers.
  3. Interaction of `global` listing with lock/craft guards is explicitly described.
  4. Testing requirements in spec 006 include unit coverage for `global` mode listings.
  5. No residual text implies only 2 list modes in spec 006.

### T-067 - Spec 006: Make Drag-and-Drop Learning a Required Behavior
- Status: `todo`
- Description: Convert drag-and-drop recipe learning from optional language to required behavior, including matching rules, multi-match learning, and user feedback expectations.
- Acceptance Criteria:
  1. `spec/006-recipe-visibility.md` removes conditional wording (`if implemented`) for drag-and-drop learn.
  2. Required matching rules are specified for UUID and `flags.core.sourceId`.
  3. Multi-recipe matching from one dropped item is defined as a required capability.
  4. Required success/failure notification expectations are documented.
  5. Testing requirements include integration tests for drag-and-drop learn flow.

### T-068 - Spec 003: Update Visibility UI Contract for `global|player|knowledge`
- Status: `todo`
- Description: Update UI integration spec to reflect three visibility list modes and mode-specific control visibility in both system editor and recipe editor flows.
- Acceptance Criteria:
  1. `spec/003-ui-integration.md` defines list-mode selector options as `global`, `player`, `knowledge`.
  2. Spec explicitly describes which visibility controls are shown/hidden in each mode.
  3. Recipe list visibility-summary behavior is aligned to player mode only.
  4. Recipe editor behavior for global mode is documented (no player allow-list controls).
  5. No stale UI text remains that assumes only `player|knowledge`.

### T-069 - Spec 002: Clarify Catalyst `maxUses` Validation Rules
- Status: `todo`
- Description: Record the implemented catalyst validation rule: `maxUses` constraints are enforced only when `degradesOnUse` is enabled; otherwise `maxUses` may be null/ignored for validity.
- Acceptance Criteria:
  1. `spec/002-data-models.md` catalyst requirements explicitly scope `maxUses` validation to `degradesOnUse === true`.
  2. Spec states `maxUses` is optional/non-blocking when `degradesOnUse === false`.
  3. Error/validation expectations are defined for invalid positive-integer constraints only in degrade-enabled scenarios.
  4. Any contradictory catalyst validation text is removed.
  5. Testing requirements mention coverage for the full `degradesOnUse × maxUses` matrix.

### T-070 - Spec 005: Clarify Multi-Step Recipes with Empty Top-Level Sets
- Status: `todo`
- Description: Document that explicit multi-step recipes may have empty or absent top-level `ingredientSets/resultGroups`, and runtime/UI must resolve step-level sets without error.
- Acceptance Criteria:
  1. `spec/005-recipes-and-steps.md` explicitly permits empty/absent recipe-level sets for explicit multi-step recipes.
  2. Active-step resolution precedence is defined clearly over recipe-level fallback fields.
  3. Validation rules distinguish single-step contracts from explicit multi-step contracts.
  4. UI expectations cover rendering/details behavior when recipe-level sets are empty.
  5. Testing requirements include regression coverage for this shape.

### T-071 - Spec 007: Document Startup Migration Framework and `migrationVersion`
- Status: `todo`
- Description: Update migration spec to reflect the implemented versioned migration runner, including `fabricate.migrationVersion`, ordered pending migrations, continue-on-error behavior, and write-on-change persistence.
- Acceptance Criteria:
  1. `spec/007-destructive-changes-and-migrations.md` documents `fabricate.migrationVersion` as migration state storage.
  2. Startup migration flow defines pending migration selection by semantic version ordering.
  3. Per-migration error handling is documented: failed migration logs warning and remaining migrations continue.
  4. Spec states data/settings persistence occurs only when payload changes are detected.
  5. Testing requirements include idempotency and partial-failure progression behavior.

### T-072 - Spec 002/007: Add Canonical-Write and Legacy-Read Compatibility Policy
- Status: `todo`
- Description: Formalize compatibility policy during migration windows: reads may accept legacy aliases, but writes must emit canonical fields. Document alias mappings and retirement expectations.
- Acceptance Criteria:
  1. Spec defines canonical-write policy for current model fields (`componentId`, `components`, `match.type="component"`).
  2. Spec enumerates allowed legacy read aliases and their normalization behavior.
  3. Alias policy is tied to migration framework guidance in spec 007.
  4. Spec states that new persisted data must not emit legacy keys except explicitly documented transitional aliases.
  5. Testing requirements include backward-compat read tests and canonical-write assertions.

### T-073 - Spec 005: Define Run-History Retention Limits as Contract
- Status: `todo`
- Description: Turn current run-history truncation behavior into explicit specification so retention and ordering are stable, testable, and not accidental implementation details.
- Acceptance Criteria:
  1. `spec/005-recipes-and-steps.md` defines maximum retained history length for `craftingRuns.history` and `salvageRuns.history`.
  2. Spec defines ordering contract (most recent first) and truncation behavior when limit is exceeded.
  3. Spec states whether the limit is fixed or configurable, with default value documented.
  4. Cross-reference to actor-flag shape remains consistent with spec 002/005 definitions.
  5. Testing requirements include limit-boundary behavior and ordering assertions.
