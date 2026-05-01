# Design: Issue #179 Gathering Environments Runtime

## Decisions

1. Keep gathering environments in their canonical world setting, `fabricate.gatheringEnvironments`, instead of embedding them under `CraftingSystem`.
2. Normalize `CraftingSystem.features.gathering` in `CraftingSystemManager` with a default of `false`; do not introduce legacy write aliases for new gathering fields.
3. Add a dedicated environment-store collaborator that owns environment CRUD, duplication, reorder, validation, save, and cleanup by system/environment/task reference.
4. Add a dedicated runtime collaborator that owns player-visible environment/task queries, start attempts, immediate resolution, timed run creation, time-gate completion, and terminal history writes.
5. Keep Foundry globals at composition edges: settings, notifications, actor lookup, `fromUuid`, world time, roll table draws, macro execution, item creation, and scene/token checks should be injected or wrapped.
6. Reuse existing domain shapes for `Catalyst`, `ResultGroup`, `Result`, macro execution, roll-table outcome matching, and actor flag persistence rather than creating gathering-specific copies where existing semantics match.
7. Add a dedicated Svelte gathering app registered through `appFactory`; it must not reuse the crafting app class or route.
8. Add the GM `Environments` tab as a first-class Svelte admin tab that is visible only for selected systems with `features.gathering === true`.
9. Disabling `features.gathering` hides that system's environments from player flows and the selected-system admin tab but does not delete persisted environment records; deleting the crafting system removes those records.
10. Timed run completion must reuse a narrow startup/time-update hook path that delegates immediately into the gathering runtime seam instead of embedding completion logic in `src/main.js`.
11. Scene/token gates affect attemptability, not environment listing: scene-gated environments stay listable when otherwise visible, and the player app shows localized blocked reasons until a start attempt is valid.
12. Persisted gathering runs must use the canonical actor flag path `Actor.flags.fabricate.gatheringRuns`; implementation must fix or bypass any helper that would write a double-prefixed path such as `fabricate.fabricate.gatheringRuns`.
13. Gathering catalyst availability and terminal catalyst usage use only the selected acting actor; gathering does not reuse crafting component-source actor aggregation semantics.
14. System-specific visibility/check logic belongs in a dedicated evaluator seam rather than inside `GatheringEngine`; existing crafting check/resolution services are insufficient on their own because gathering needs both list-time visibility and start/resolve-time checks.
15. Blind-environment secrecy applies across all player-facing surfaces: generic localized labels replace real task names in browse state, blockers, active runs, history, notifications, and terminal feedback.
16. The GM `Environments` tab must manage dirty edits explicitly and force the admin shell back to a valid tab when the tab disappears after system switches or `features.gathering` is toggled off.
17. The current backend slice validates the selected environment/task path before execution. Immediate tasks resolve terminal routed/progressive outcomes, plan `createdResults`, `usedCatalysts`, and `checkResult` for terminal history, persist that terminal history first, then create gathered results on success and apply catalyst usage or failure feedback only after persistence succeeds. Timed tasks create exactly one awaited `waitingTime` run after all guards pass, and module-private `GatheringEngine.processWorldTime(worldTime)` resumes matured waiting runs into terminal success/failure, cancellation for missing references, or active-run clearing for resume-time misconfiguration. Bootstrap now constructs and loads the backend gathering runtime after systems load, wires environment-store cleanup callbacks through the run manager, exposes narrow current-viewer gathering APIs and store/run/evaluator getters, keeps the raw `GatheringEngine` module-internal, and dispatches ready/updateWorldTime gathering processing with error isolation. The GM admin `Environments` editor is present with selected-system feature gating, cloned list/draft state, editable environment fields, selected-draft dirty state, visible save/cancel, disabled draft-shell creation with a disabled placeholder task for validation compatibility, store-backed environment duplicate/delete/reorder, delete confirmation with escaped GM-authored environment names, store-owned task/result/catalyst/visibility/result-selection/progressive/check/time/failure callbacks wired from root to tab, task-list add/select/duplicate/delete/reorder, base task fields for `name`, `description`, `img`, `enabled`, and `resolutionMode`, selected-task result-group authoring, selected-task catalyst authoring, selected-task visibility-gate authoring, routed result-selection provider authoring, progressive award-mode/check authoring, selected-task time-requirement authoring, selected-task failure-outcome authoring, save-blocking validation, inline field errors, `aria-invalid`/`aria-describedby` hooks, first-invalid focus, stale-reference warnings, nested task configuration preservation outside edited collections, and valid-tab fallback. Result-group authoring includes group add/rename/delete/reorder plus component-based result add/edit/delete/reorder; editable result fields are `componentId` and `quantity`. Catalyst authoring includes add/delete plus editing `componentId`, `degradesOnUse`, `destroyWhenExhausted`, and nullable `maxUses`; `maxUses` is validation- and runtime-relevant only when degradation is enabled. Visibility-gate authoring supports enable/clear plus `macro`, `dnd5e`, and `pf2e` provider fields; incomplete provider input stays local until required fields are present. Routed result selection supports `macroOutcome` with available script macro choices and `rollTableOutcome` with UUID text input. Progressive authoring supports `equal`, `partial`, and `exceed` award modes plus `macro`, `dnd5e`, and `pf2e` checks, with optional check thresholds for dnd5e/pf2e. Time-requirement authoring supports clearing `timeRequirement` for immediate tasks and editing minutes, hours, days, months, and years for timed tasks. Failure-outcome authoring supports clearing to default failure feedback plus text and macro custom outcomes, with provider switching clearing stale provider fields. Managed item options are prepared by the admin store/root so `EnvironmentsTab` can display component choices and progressive difficulty without Foundry lookups; result-level inline difficulty is not persisted because validation uses the selected managed component difficulty. Store validation remains the save boundary, persisted task removal cleans related runs only after a valid environment update, and unsaved task removal remains draft-only. Dirty navigation prompts, responsive GM/player layout polish, player UI, Items Directory action, dedicated app registration, scene-linked runtime integration coverage, hook-driven timed completion coverage, and harvesting boundary regression coverage are implemented. Live Foundry validation remains conditional for future runtime-specific or screenshot-required work.

## Boundaries

- Settings registration belongs in `src/config/settings.js`.
- System feature normalization belongs in `src/systems/CraftingSystemManager.js`.
- Environment persistence and validation should live in a new focused module under `src/systems/`, separate from runtime attempt execution.
- Actor run persistence should live in a new focused run-manager module under `src/systems/`, mirroring the shape of `CraftingRunManager` and `SalvageRunManager` without coupling to recipe or salvage internals.
- Runtime gathering execution should live in a separate engine/service module that depends on the environment store, run manager, system manager, gate/check evaluator, macro/roll adapters, and item/catalyst collaborators.
- Items Directory button injection should extend the existing `src/main.js` integration path but delegate app class lookup to `appFactory`.
- Admin UI state belongs in `src/ui/svelte/stores/adminStore.js`; environment editor components belong under `src/ui/svelte/apps/`.
- Player gathering UI state should use a new Svelte store under `src/ui/svelte/stores/`, with a dedicated app root under `src/ui/svelte/apps/`.

## Canonical Persistence Contracts

### Gathering Run Flag Path

- Persist all gathering runs under `Actor.flags.fabricate.gatheringRuns`.
- Do not write a helper-expanded path such as `Actor.flags.fabricate.fabricate.gatheringRuns`.
- If an existing actor-flag helper cannot safely write the canonical path, the implementation should bypass or narrow-wrap that helper for gathering run persistence.

### GatheringRun Stored Shape

Persisted `GatheringRun` entries in `active` and `history` must carry the canonical fields required for resume, cleanup, and UI rendering:

- `id`
- `actorUuid`
- `userId`
- `craftingSystemId`
- `environmentId`
- `taskId`
- `status`
- `startedAtWorldTime`
- `updatedAtWorldTime`
- `completedAtWorldTime` when terminal
- `timeGate.requiredSeconds` when time-gated
- `timeGate.availableAt` when time-gated
- `timeGate.initiatedAt` when time-gated
- `checkResult` when a task produced one
- `usedCatalysts`
- `createdResults`

Player-facing blind-environment labels should be computed from current environment/task selection mode at render time; do not add extra persisted snapshot fields solely to preserve generic blind labels.

## Collaborator Responsibilities

### GatheringEnvironmentStore

Owns persisted environment records and nothing actor-specific.

- Load and save `fabricate.gatheringEnvironments`.
- Normalize stored environment/task records to canonical shapes.
- Validate save-time invariants for environment/task edits.
- Duplicate and reorder environments without leaking UI state.
- Deep-clone duplicated environments with a fresh environment ID and fresh nested task IDs so later edits, deletions, and run cleanup remain isolated from the source environment.
- Delete environments or tasks and invoke run-cleanup hooks for deleted IDs.
- Remove all environments for deleted crafting systems.
- Treat environment-store deletion cleanup as destructive record cleanup, distinct from runtime resume-time missing-reference cancellation history.

### GatheringRunManager

Owns actor-scoped `flags.fabricate.gatheringRuns` reads and writes.

- Read active/history runs for one actor.
- Enforce one-active-run-per-actor-per-task.
- Write immediate terminal history entries.
- Create waiting-time runs.
- Complete or cancel runs and prepend terminal history.
- Truncate history to the canonical 50-entry retention limit.
- Remove active/history entries by `environmentId`, `taskId`, or `craftingSystemId`.
- Assert or normalize writes so persisted entries conform to the canonical `GatheringRun` shape.

### GatheringGateAndCheckEvaluator

Owns gathering visibility-gate and task-check execution across providers.

- Evaluate `dnd5e`, `pf2e`, and `macro` visibility gates.
- Evaluate `dnd5e`, `pf2e`, and `macro` gathering checks.
- Return normalized neutral, terminal, and diagnostic results the engine can consume without embedding system-specific parsing.
- Surface reason codes and diagnostics that downstream engine/UI paths can translate into localized blocked reasons or GM validation feedback.

### GatheringEngine

Owns runtime attempt behavior and depends on narrow collaborators.

- List player-visible environments/tasks for a selected actor and viewer. Implemented for the current listing/attemptability slice.
- Produce player-listing models that separate visibility from attemptability, including localized blocked reasons. Implemented for the current listing/attemptability slice.
- Evaluate pause, ownership, scene/token, enabled-state, visibility, duplicate-run, catalyst availability, missing-reference, and task-configuration gates at start time. Implemented for the current start-attempt slice.
- Resolve accepted non-timed attempts immediately through routed or progressive outcome handling, then plan and write terminal history. The planned `createdResults`, `usedCatalysts`, and `checkResult` are persisted before irreversible result creation, catalyst usage, or failure feedback commits; terminal persistence failure blocks those post-history effects. Success creates result items only after history persists. Failure writes failed terminal history, skips result item creation, and then applies terminal catalyst behavior plus configured or default failure feedback.
- Create accepted timed start attempts as exactly one awaited `waitingTime` run after guards pass, returning `accepted: true`, `started: true`, `state: "waitingTime"`, run metadata, and no terminal history, catalyst usage, `usedCatalysts`, gathered results, or `createdResults`.
- Validate task configuration before starting or resuming any attempt. Implemented for selected-task start guards and backend timed resume.
- Resolve immediate routed/progressive outcomes.
- Create waiting-time runs and resume them once time gates mature. Implemented for backend `processWorldTime(worldTime)` and wired through guarded ready/updateWorldTime hook dispatch.
- Route misconfiguration to a GM-fix-required abort path; resume-time misconfiguration clears the active run without player terminal history or side effects.
- Route missing-reference completion to cancelled terminal runs, with blind redaction where an opaque blind environment can still be resolved.

Current checkpoint boundary: `GatheringEngine.startAttempt()` performs guards, resolves immediate tasks to terminal outcomes, plans terminal `createdResults`, `usedCatalysts`, and `checkResult`, persists terminal history, commits result/catalyst/failure-feedback side effects only after that persistence succeeds, and creates exactly one awaited `waitingTime` run for timed tasks through `GatheringRunManager.createWaitingRun`. `GatheringEngine.processWorldTime(worldTime)` now processes matured waiting runs: non-matured runs are ignored by the run manager, terminal success/failure writes history before post-history side effects, missing references become cancelled history, resume-time misconfiguration clears the active run without player terminal history or side effects, and `completeRun` returning `null` or throwing blocks result/catalyst/failure-feedback commits. Waiting-run creation still does not pass `usedCatalysts` or `createdResults`, create result items, or create terminal history at start time. Module bootstrap constructs this backend runtime after systems load, loads persisted environments, wires deletion cleanup to the run manager, exposes `listGatheringForActor` and `startGatheringAttempt` with current-viewer enforcement plus store/run/evaluator getters, intentionally withholds a public raw `GatheringEngine` accessor, and runs gathering world-time processing from ready/updateWorldTime through isolated callbacks. The GM admin shell now includes an `Environments` editor: it gates the tab on selected-system `features.gathering`, reads environments through the injected store, clones list/draft records, edits environment name, description, enabled state, selection mode, and scene UUID, tracks dirty state for the selected draft, shows save/cancel actions, creates disabled draft shells with one disabled placeholder task for validation compatibility, uses store methods for environment duplicate/delete/reorder, requires delete confirmation before store cleanup of referenced gathering runs, escapes GM-authored environment names in delete confirmation HTML, wires store-owned task/result/catalyst/visibility/result-selection/progressive/check/time/failure callbacks into the tab, supports task-list add/select/duplicate/delete/reorder actions, edits base task fields for `name`, `description`, `img`, `enabled`, and `resolutionMode`, supports selected-task result-group authoring, selected-task catalyst authoring, selected-task visibility-gate authoring, routed result-selection provider authoring, progressive check/award-mode authoring, selected-task time-requirement authoring, selected-task failure-outcome authoring, save-blocking validation summaries, inline validation errors, `aria-invalid`/`aria-describedby` wiring, first-invalid focus after failed save, persistent stale scene/macro warnings, nested task configuration preservation outside edited collections, and visible-tab fallback. Result-group authoring can add/rename/delete/reorder groups and add/edit/delete/reorder component-based results. Editable result fields are `componentId` and `quantity`. Catalyst authoring can add/delete rows and edit `componentId`, `degradesOnUse`, `destroyWhenExhausted`, and nullable `maxUses`; `maxUses` validation remains scoped to `degradesOnUse === true`. Visibility-gate authoring can enable, clear, and edit `macro`, `dnd5e`, and `pf2e` provider fields; incomplete provider input stays local until required fields are present, and clear only calls the store when committed visibility exists. Routed result selection can edit `macroOutcome.macroUuid` from available script macros and `rollTableOutcome.rollTableUuid` by UUID text input. Progressive checks can edit `macro`, `dnd5e`, and `pf2e` providers with optional thresholds for dnd5e/pf2e, and progressive award modes can edit `equal`, `partial`, or `exceed`. Time-requirement authoring supports clearing `timeRequirement` for immediate tasks and editing minutes, hours, days, months, and years for timed tasks. Failure-outcome authoring supports clearing to default failure feedback plus text and macro custom outcomes, with provider switching clearing stale provider fields. Store validation remains the save boundary: invalid cardinality or incomplete advanced config blocks save and leaves the dirty draft unpersisted. Persisted task removal through environment update cleans related runs after valid persistence; deleting a draft-only task remains draft-only. New draft placeholder result groups receive IDs immediately so the group can be edited before save/reload. Managed item options are built in the admin store/root and passed into `EnvironmentsTab`; the tab does not perform Foundry item lookups. Progressive difficulty is displayed from the selected managed component difficulty and is not persisted inline on result rows, because canonical store validation uses managed component difficulty. Dirty navigation prompts, responsive GM/player layout polish, player UI, Items Directory action, dedicated app registration, scene-linked runtime integration coverage, hook-driven timed completion coverage, and harvesting boundary regression coverage are implemented. Live Foundry validation remains conditional for future runtime-specific or screenshot-required work.

## Composition Edge

`src/main.js` should remain a thin wiring layer.

- Register settings.
- Instantiate gathering collaborators once module services are available.
- Expose narrow `game.fabricate` accessors for environment and gathering actions already needed by UI callers.
- Ensure those accessors return attemptability metadata and blocked reasons rather than forcing the Svelte layer to recreate gate logic.
- Register the dedicated gathering app class in `appFactory`. Implemented.
- Add the Items Directory header action when any normalized system exposes gathering. Implemented.
- Register the minimal hook needed to ask the gathering engine to process matured waiting runs. Implemented through guarded ready/updateWorldTime dispatch.

## Implementation Shape

### Persistence And Normalization

- Register `SETTING_KEYS.GATHERING_ENVIRONMENTS` as a world setting with default `[]`.
- Register `SETTING_KEYS.LAST_GATHERING_ACTOR` as a client setting with default `''`.
- Normalize every system to include `features.gathering`.
- Clean or ignore `lastGatheringActor` only when the actor no longer resolves or is no longer selectable by the current user.
- Load persisted environments through the environment-store collaborator and normalize to canonical data shapes.
- Preserve persisted environments when gathering is toggled off for a system; hide them from player runtime flows and from the selected-system admin navigation until gathering is re-enabled.

### Environment Store

- Expose behavior-first methods such as create, update, duplicate, delete, reorder, list by system, and validate.
- Validate selection mode cardinality, disabled state, task fields, result group uniqueness, reserved failure keyword collisions, provider-specific requirements, progressive referenced-component difficulty requirements, and unresolved system references.
- On crafting-system deletion, remove related environments deterministically.
- On gathering feature disable, keep persisted environments intact but exclude them from normal player-visible listings and the selected-system admin tab.
- On environment/task deletion, clean active and historical gathering runs that reference deleted IDs.
- Keep stale `sceneUuid` values readable and warn in editing UI; runtime scene-gated access fails closed until corrected.
- Persist duplication as a true deep clone with fresh IDs so deleting or editing the duplicate cannot mutate or clean up runs for the source environment.

### Runtime Execution

- Query player-visible environments by enabled gathering systems, environment enabled state, owned actor selection state, task enabled state, and visibility gates; scene/token mismatches remain visible as blocked attemptability states rather than hiding the environment from the list.
- Represent listing results with explicit attemptability and blocked-reason metadata so the UI can distinguish:
  - no selectable actors
  - invalid remembered actor
  - no environments configured
  - no visible targeted tasks
  - blind sole-task hidden
  - scene/token blocked
  - duplicate active run blocked
  - catalyst blocked
- In the current backend slice, attempts enforce pause, selected environment/task references, disabled records, actor selectability, scene/token presence, visibility, duplicate active task run, catalyst availability, and selected-task configuration before terminal side effects. A successful non-timed response resolves immediately into terminal routed/progressive history, with planned result/catalyst/check refs persisted before post-history commits; a successful timed response creates exactly one awaited `waitingTime` run and later completes through the guarded `updateWorldTime`/`processWorldTime(worldTime)` path when mature.
- Validate start-attempt configuration for the chosen task only. A misconfigured sibling task in the same targeted environment must not block a valid selected task.
- For scene-linked environments, missing or unavailable scene-access collaboration fails closed instead of allowing an attempt.
- Validate catalyst availability against the acting actor only; do not pass component source actors or aggregate actor collections into the gathering catalyst check.
- For non-GM blind environments, blocked start responses, including waiting-run creation failures or diagnostics, must not expose real task IDs, task names, visibility diagnostics, catalyst details, configuration errors, or run-manager diagnostics.
- Complete active `waitingTime` runs for timed tasks when world time reaches `timeGate.availableAt`.
- Cancel timed runs whose environment, task, system, or actor references become invalid before completion; cancellation is terminal history, not silent deletion.
- If a waiting run resumes after GM edits make the task misconfigured, clear the active run without writing terminal player history, results, catalyst usage, or failure feedback, emit GM-fix-required diagnostics through the runtime result, and require a fresh manual start after the GM corrects the task.
- Terminal-resolution misconfiguration, including invalid `failureOutcome`, is a GM-fix-required abort with no active run, catalyst degradation, result items, failure feedback, or terminal player history entry.
- Terminal task failure is a valid player outcome with no gathered items, catalyst usage for the terminal attempt, configured or default failure feedback, and a terminal history entry with `failed` status.
- Terminal gathering catalysts are consumed only against the acting actor; component-source actors or actor collections are not inspected or consumed.

### UI

- Add `Gathering` to the Items Directory only when at least one normalized system has `features.gathering === true`.
- Add `SvelteGatheringApp.svelte.js` and register it through `appFactory`.
- Add a player gathering root component with actor selection, available environment/task listing, blocked-state messaging, active timed runs, completion feedback, and history summary.
- The GM system settings view exposes a localized `Gathering` feature toggle wired to `features.gathering`; enabling it makes the selected system's `Environments` tab reachable, and disabling it hides the tab without deleting persisted environment records.
- The `Environments` admin tab is implemented as a gated Svelte tab that lists stored environments for the selected system, shows a cloned selected draft, edits environment-level fields, tracks dirty state, provides save/cancel, creates disabled draft shells with one disabled placeholder task and immediately identified result group for validation compatibility/pre-save editing, uses store-backed environment duplicate/delete/reorder actions, delegates store-owned task/result/catalyst/visibility/result-selection/progressive/check/time/failure callbacks from the root into the tab, supports task-list add/select/duplicate/delete/reorder actions, edits base task fields (`name`, `description`, `img`, `enabled`, `resolutionMode`), supports selected-task result-group authoring, supports selected-task catalyst authoring, supports selected-task visibility-gate authoring, supports routed result-selection provider authoring, supports progressive check/award-mode authoring, supports selected-task time-requirement authoring, supports selected-task failure-outcome authoring, and preserves nested task configuration. Result authoring edits `componentId` and `quantity`; catalyst authoring edits `componentId`, `degradesOnUse`, `destroyWhenExhausted`, and nullable `maxUses`; time authoring edits minutes, hours, days, months, and years or clears to immediate resolution; failure authoring edits text or macro outcomes or clears to default feedback; progressive difficulty is displayed from managed component difficulty.
- Save-blocking validation, localized summaries, inline field errors, `aria-invalid`, `aria-describedby`, first-invalid focus, and stale-reference warnings are implemented per the gathering spec.
- When the selected system changes or `features.gathering` toggles off, force `activeTab` back to a valid visible tab and discard any impossible `Environments` tab selection. Implemented for the current admin tab; dirty-navigation confirmation is implemented for environment draft transitions.
- For blind environments, use localized generic labels instead of real task names across browse cards, start actions, duplicate-run blockers, active runs, history, notifications, and terminal feedback; compute those labels from current selection mode at render time rather than persisting extra blind-summary fields on runs.
- Provide responsive narrow-window behavior keyed to application container width rather than browser viewport width: environment list/editor panes stack vertically, each pane scrolls independently where needed, save actions remain reachable, and player active/history regions collapse to one column.
- Provide localized validation summary plus inline field errors, `aria-invalid`, `aria-describedby`, keyboard jump to the first invalid field after a failed save, and persistent stale-reference warnings.
- Localize new user-facing copy in `lang/`.

## Candidate Files

- `src/config/settings.js`
- `src/config/preferencesCleanup.js`
- `src/main.js`
- `src/ui/appFactory.js`
- `src/systems/CraftingSystemManager.js`
- new `src/systems/GatheringEnvironmentStore.js`
- new `src/systems/GatheringRunManager.js`
- new `src/systems/GatheringGateAndCheckEvaluator.js`
- new `src/systems/GatheringEngine.js`
- new `src/ui/SvelteGatheringApp.svelte.js`
- `src/ui/SvelteRecipeManagerApp.svelte.js`
- `src/ui/svelte/stores/adminStore.js`
- new `src/ui/svelte/stores/gatheringStore.js`
- new Svelte components under `src/ui/svelte/apps/`
- `lang/en.json`
- focused tests under `tests/`

## Risks And Tradeoffs

- Gathering overlaps structurally with crafting and salvage, but sharing too much engine code would couple different lifecycles. Prefer shared small helpers only where contracts are identical.
- Runtime gating depends on Foundry scene/token state, so unit tests should isolate gate evaluation and Foundry integration tests should cover one live path if practical.
- Keeping scene-gated environments listable but blocked adds UI state complexity, but hiding them would violate the intended player feedback model and make blocked reasons invisible.
- Environment editing can become a large admin form. Keep store actions cohesive and component boundaries small enough that validation and field updates remain testable.
- Timed completion backend processing exists on module-private `GatheringEngine.processWorldTime(worldTime)`. Bootstrap delegates to it through a narrow guarded ready/updateWorldTime path without exposing the raw engine instance through `game.fabricate`, and the dispatcher isolates crafting, salvage, and gathering processor failures from each other.
- Blind-environment secrecy requires disciplined generic labeling in every player-facing output path; missing one surface would leak hidden task names.

## Verification Plan

- Unit tests for settings keys and `features.gathering` normalization.
- Unit tests for `lastGatheringActor` cleanup only when the actor is unresolved or no longer selectable by the current user.
- Unit tests for environment normalization and validation rules.
- Unit tests for duplication semantics: duplicated environments/tasks get fresh IDs and remain isolated for later edit/delete cleanup.
- Unit tests for destructive cleanup boundaries: deleted crafting systems remove environments, deleted environments/tasks clean actor runs, disabled gathering hides but does not delete persisted environments.
- Unit tests for canonical persisted `Actor.flags.fabricate.gatheringRuns` shape and explicit rejection/bypass of double-prefixed writes.
- Unit tests for player-visible environment/task filtering and attemptability-state reporting, including no selectable actors, invalid remembered actor, no environments configured, no visible targeted tasks, blind sole-task hidden, scene/token blocked, duplicate active run blocked, catalyst blocked, non-GM blind secrecy, GM blind inspection, and hidden targeted task filtering.
- Unit tests for start gating, immediate terminal resolution, and timed waiting-run creation: paused game, disabled records, actor ownership, scene/token mismatch, hidden task, duplicate active task run, missing catalysts, misconfiguration, immediate routed/progressive terminal outcomes, timed `waitingTime` creation without `usedCatalysts` or `createdResults`, blind failure redaction, and run-creation failure handling.
- Unit tests for gathering catalyst validation/consumption against the acting actor only.
- Unit tests for `dnd5e`, `pf2e`, and `macro` visibility gates plus `dnd5e`, `pf2e`, and `macro` task checks through the dedicated evaluator seam.
- Unit tests for routed and progressive terminal resolution, including reserved failure keywords and result group matching.
- Unit tests for active/history gathering run persistence, backend timed completion, resume-time cancellation on missing references, resume-time misconfiguration clearing of active runs without history/results/catalyst writes, terminal persistence failure side-effect blocking, 50-entry history cap, bootstrap construction after systems load, environment-store loading, cleanup callbacks to the run manager, public accessor shape, current-viewer enforcement, no raw public `GatheringEngine` accessor, and guarded ready/updateWorldTime dispatch.
- Component/store tests for the admin `Environments` tab environment-level dirty-state handling, store-backed create/duplicate/delete/reorder, task-list CRUD/base-field editing, selected-task result-group authoring, nested task configuration preservation, fallback to a valid tab, validation accessibility state, narrow-window layout behavior, and player gathering app gating.
- Integration coverage for at least one scene-linked gathering path and one hook-driven timed completion path.
- Regression coverage confirming harvesting remains modeled as recipe or salvage data, not a separate player gathering runtime path.
- `npm test`
- `npm run build`
- `npm run test:foundry` when future live scene/token behavior, hook-driven timed completion, or reproducible screenshots need Foundry runtime validation.

## Recommended Implementation Sequence

1. Register settings, normalize `features.gathering`, and lock down the canonical actor-flag persistence path.
2. Implement environment-store persistence, validation, duplication semantics, and destructive cleanup helpers.
3. Implement gathering run persistence, canonical stored shape, and history retention.
4. Implement the dedicated gate/check evaluator seam.
5. Implement gathering runtime listing, attemptability reporting, immediate resolution, waiting-time creation, and timed completion/cancellation.
6. Wire module bootstrap and narrow `game.fabricate` accessors.
7. Stop and verify backend/runtime tests before starting UI work.
8. Implement the GM `Environments` tab environment editor, base task fields, selected-task result-group authoring, selected-task catalyst authoring, visibility gates, routed/progressive authoring, time-requirement authoring, failure-outcome authoring, dirty-navigation prompts, responsive validation UX, and tab-fallback behavior.
9. Stop and verify GM admin UI tests before starting player app work.
10. Implement the dedicated player gathering app, actor preference behavior, blind-environment secrecy, and blocked-state presentation.
11. Finish localization and focused automated coverage, then run required validation gates.

## Entry Criteria For Implementation

- Issue `#179` remains the active scope.
- This change folder is accepted as the implementation handoff.
- The implementer confirms whether to deliver the work in one PR or split it into backend/runtime and UI follow-ups with disjoint write sets.
