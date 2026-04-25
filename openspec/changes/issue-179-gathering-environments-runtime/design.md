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
13. Gathering catalysts are validated and consumed only against the selected acting actor; gathering does not reuse crafting component-source actor aggregation semantics.
14. System-specific visibility/check logic belongs in a dedicated evaluator seam rather than inside `GatheringEngine`; existing crafting check/resolution services are insufficient on their own because gathering needs both list-time visibility and start/resolve-time checks.
15. Blind-environment secrecy applies across all player-facing surfaces: generic localized labels replace real task names in browse state, blockers, active runs, history, notifications, and terminal feedback.
16. The GM `Environments` tab must manage dirty edits explicitly and force the admin shell back to a valid tab when the tab disappears after system switches or `features.gathering` is toggled off.

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
- Return normalized results the engine can consume without embedding system-specific parsing.
- Surface localized blocked reasons or diagnostics that can be shown in the player app or GM validation paths.

### GatheringEngine

Owns runtime attempt behavior and depends on narrow collaborators.

- List player-visible environments/tasks for a selected actor and viewer.
- Produce player-listing models that separate visibility from attemptability, including localized blocked reasons.
- Evaluate pause, ownership, scene/token, enabled-state, visibility, and catalyst gates at start/resume time.
- Validate task configuration before starting or resuming any attempt.
- Resolve immediate routed/progressive outcomes.
- Create waiting-time runs and resume them once time gates mature.
- Route misconfiguration to a GM-fix-required abort path.
- Route missing-reference completion to cancelled terminal runs.

## Composition Edge

`src/main.js` should remain a thin wiring layer.

- Register settings.
- Instantiate gathering collaborators once module services are available.
- Expose narrow `game.fabricate` accessors for environment and gathering actions already needed by UI callers.
- Ensure those accessors return attemptability metadata and blocked reasons rather than forcing the Svelte layer to recreate gate logic.
- Register the dedicated gathering app class in `appFactory`.
- Add the Items Directory header action when any normalized system exposes gathering.
- Register the minimal hook needed to ask the gathering engine to process matured waiting runs.

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
- Validate selection mode cardinality, disabled state, task fields, result group uniqueness, reserved failure keyword collisions, provider-specific requirements, progressive difficulty requirements, and unresolved system references.
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
- Start attempts by enforcing pause, permissions, scene/token presence, visibility, duplicate active task run, catalyst availability, and task configuration before any catalyst use or terminal outcome.
- Resolve immediate tasks in one call, writing terminal history directly.
- Create active `waitingTime` runs for timed tasks and complete them when world time reaches `timeGate.availableAt`.
- Cancel timed runs whose environment, task, system, or actor references become invalid before completion; cancellation is terminal history, not silent deletion.
- If a waiting run resumes after GM edits make the task misconfigured, clear the active run without writing terminal player history, results, or catalyst usage, emit localized GM-fix-required feedback/diagnostics, and require a fresh manual start after the GM corrects the task.
- Treat misconfiguration as a GM-fix-required abort: no active run, no catalyst degradation, no result items, and no terminal player history entry.
- Treat task failure as a valid terminal player outcome: no gathered items, failure feedback or macro execution, catalyst usage for the terminal attempt, and history write.
- Validate and consume gathering catalysts only against the acting actor; do not inspect or consume from component-source actors.

### UI

- Add `Gathering` to the Items Directory only when at least one normalized system has `features.gathering === true`.
- Add `SvelteGatheringApp.svelte.js` and register it through `appFactory`.
- Add a player gathering root component with actor selection, available environment/task listing, blocked-state messaging, active timed runs, completion feedback, and history summary.
- Add an `Environments` admin tab with environment list, task editor, validation summary, duplicate/reorder/delete actions, visible save/cancel affordances, dirty-state confirmation before tab change or app close, and save blocking per the gathering spec.
- When the selected system changes or `features.gathering` toggles off, force `activeTab` back to a valid visible tab and discard any impossible `Environments` tab selection.
- For blind environments, use localized generic labels instead of real task names across browse cards, start actions, duplicate-run blockers, active runs, history, notifications, and terminal feedback; compute those labels from current selection mode at render time rather than persisting extra blind-summary fields on runs.
- Provide responsive narrow-window behavior: environment list/editor panes stack vertically, each pane scrolls independently where needed, save actions remain reachable, and player active/history regions collapse to one column.
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
- Timed completion needs world-time processing. The initial implementation should use the existing time-update pattern if available or add a narrow hook registration path that delegates to the run manager/engine.
- Blind-environment secrecy requires disciplined generic labeling in every player-facing output path; missing one surface would leak hidden task names.

## Verification Plan

- Unit tests for settings keys and `features.gathering` normalization.
- Unit tests for `lastGatheringActor` cleanup only when the actor is unresolved or no longer selectable by the current user.
- Unit tests for environment normalization and validation rules.
- Unit tests for duplication semantics: duplicated environments/tasks get fresh IDs and remain isolated for later edit/delete cleanup.
- Unit tests for destructive cleanup boundaries: deleted crafting systems remove environments, deleted environments/tasks clean actor runs, disabled gathering hides but does not delete persisted environments.
- Unit tests for canonical persisted `Actor.flags.fabricate.gatheringRuns` shape and explicit rejection/bypass of double-prefixed writes.
- Unit tests for player-visible environment/task filtering and attemptability-state reporting, including no selectable actors, invalid remembered actor, no environments configured, no visible targeted tasks, blind sole-task hidden, and scene/token blocked states.
- Unit tests for start gating: paused game, disabled records, actor ownership, scene/token mismatch, hidden task, duplicate active task run, missing catalysts, and misconfiguration.
- Unit tests for gathering catalyst validation/consumption against the acting actor only.
- Unit tests for `dnd5e`, `pf2e`, and `macro` visibility gates plus `dnd5e`, `pf2e`, and `macro` task checks through the dedicated evaluator seam.
- Unit tests for routed and progressive terminal resolution, including reserved failure keywords and result group matching.
- Unit tests for active/history gathering run persistence, resume-time cancellation on missing references, resume-time misconfiguration clearing of active runs without history/results/catalyst writes, hook-driven timed completion, and 50-entry history cap.
- Component/store tests for the admin `Environments` tab dirty-state handling, fallback to a valid tab, validation accessibility state, narrow-window layout behavior, and player gathering app gating.
- Integration coverage for at least one scene-linked gathering path and one hook-driven timed completion path.
- Regression coverage confirming harvesting remains modeled as recipe or salvage data, not a separate player gathering runtime path.
- `npm test`
- `npm run build`
- `npm run test:foundry` when live scene/token behavior, hook-driven timed completion, responsive narrow-window checks, or reproducible screenshots are needed.

## Recommended Implementation Sequence

1. Register settings, normalize `features.gathering`, and lock down the canonical actor-flag persistence path.
2. Implement environment-store persistence, validation, duplication semantics, and destructive cleanup helpers.
3. Implement gathering run persistence, canonical stored shape, and history retention.
4. Implement the dedicated gate/check evaluator seam.
5. Implement gathering runtime listing, attemptability reporting, immediate resolution, waiting-time creation, and timed completion/cancellation.
6. Wire module bootstrap, `game.fabricate` accessors, and Items Directory app entry.
7. Stop and verify backend/runtime tests before starting UI work.
8. Implement the GM `Environments` tab, dirty-state controls, responsive validation UX, and tab-fallback behavior.
9. Stop and verify GM admin UI tests before starting player app work.
10. Implement the dedicated player gathering app, actor preference behavior, blind-environment secrecy, and blocked-state presentation.
11. Finish localization and focused automated coverage, then run required validation gates.

## Entry Criteria For Implementation

- Issue `#179` remains the active scope.
- This change folder is accepted as the implementation handoff.
- The implementer confirms whether to deliver the work in one PR or split it into backend/runtime and UI follow-ups with disjoint write sets.
