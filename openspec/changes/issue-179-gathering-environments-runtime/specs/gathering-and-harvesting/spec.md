# Gathering and Harvesting Delta

## ADDED Requirements

### Requirement: Gathering implementation persistence boundaries

Fabricate MUST register and use the canonical gathering persistence keys required by the gathering workflow.

1. The world setting `fabricate.gatheringEnvironments` MUST store all gathering environment records.
2. The client setting `fabricate.lastGatheringActor` MUST store the last actor selected in the player gathering app.
3. `CraftingSystem` normalization MUST preserve `features.gathering` as a boolean with default `false`.
4. New gathering data MUST be written in canonical field names and MUST NOT introduce new transitional write aliases.
5. Player-facing gathering flows MUST ignore environments whose `craftingSystemId` references a missing system or a system where `features.gathering !== true`.
6. Gathering run persistence MUST use the canonical actor flag path `Actor.flags.fabricate.gatheringRuns`; the implementation MUST NOT write a helper-expanded path such as `Actor.flags.fabricate.fabricate.gatheringRuns`.
7. Persisted `GatheringRun` entries MUST store only the canonical fields needed by runtime resume and UI rendering: `id`, `actorUuid`, `userId`, `craftingSystemId`, `environmentId`, `taskId`, `status`, `startedAtWorldTime`, `updatedAtWorldTime`, `completedAtWorldTime` when terminal, `timeGate.requiredSeconds`, `timeGate.availableAt`, `timeGate.initiatedAt` when time-gated, `checkResult`, `usedCatalysts`, and `createdResults`.

### Requirement: Gathering environment store

Fabricate MUST provide a dedicated environment persistence and validation seam for GM-managed gathering environments.

1. The environment store MUST support create, update, duplicate, delete, reorder, list-by-system, validate, load, and save behavior.
2. The environment store MUST validate the canonical `GatheringEnvironment` and `GatheringTask` rules before saving GM edits.
3. Validation MUST include selection-mode task cardinality, provider-specific required fields, result group uniqueness, reserved failure keyword collisions, progressive referenced-component difficulty requirements, and unresolved crafting system references.
4. Environment deletion MUST remove active and historical gathering runs that reference the deleted `environmentId`.
5. Task deletion MUST remove active and historical gathering runs that reference the deleted `taskId`.
6. Crafting-system deletion MUST remove persisted environments owned by that system.
7. Environment-store deletion cleanup MUST remove records directly and MUST NOT write terminal cancellation history; runtime resume-time missing-reference handling is the separate terminal cancellation path.
8. Gathering feature disable for a crafting system MUST hide that system's environments from normal player flows and the selected-system admin tab immediately, but MUST NOT delete the persisted environment records.
9. Stale `sceneUuid` references MUST remain persisted and editable; runtime access for those environments MUST fail closed until the link is corrected or removed.
10. Duplicated environments MUST deep-clone the source record with a fresh environment ID and fresh nested task IDs.
11. Deleting or editing a duplicated environment MUST NOT mutate the source environment or clean up runs belonging only to the source environment.

### Requirement: Gathering gate and check evaluator

Fabricate MUST provide a dedicated evaluator seam for gathering visibility gates and task checks.

1. The evaluator MUST support `dnd5e`, `pf2e`, and `macro` providers for visibility gates.
2. The evaluator MUST support `dnd5e`, `pf2e`, and `macro` providers for gathering task checks.
3. `GatheringEngine` MUST consume normalized evaluator results rather than embedding provider-specific parsing and execution logic directly.
4. Existing crafting-only check or resolution helpers are not sufficient by themselves unless wrapped so the gathering runtime still has one explicit evaluator seam for both visibility and check execution.
5. Gathering check results with a numeric `value` and no terminal `status` MUST remain neutral value-only results for progressive award evaluation.
6. Gathering check results with terminal `success` or `failure` status MUST keep the numeric `value` alongside the terminal status.
7. Evaluator diagnostics for unsupported providers, provider errors, missing configuration, and malformed provider returns MUST be surfaced as diagnostics and MUST NOT be normalized into terminal player failures.

### Requirement: Gathering runtime service

Fabricate MUST provide a dedicated runtime service for player gathering attempts.

1. The runtime service MUST expose player-visible environment/task queries without requiring callers to duplicate visibility, scene, permission, or enabled-state rules.
2. Scene/token gating MUST affect attemptability, not listing: scene-gated environments that are otherwise visible MUST remain listable, and the runtime service MUST return attemptability state plus localized blocked reasons for those entries.
3. The runtime service MUST represent blocked or empty player states needed by the app, including no selectable actors, invalid remembered actor, no environments configured, no visible targeted tasks, blind sole-task hidden, scene/token blocked, duplicate active run blocked, and catalyst blocked.
4. The runtime service MUST start gathering attempts only after enforcing pause, environment enabled state, task enabled state, actor ownership, scene/token gating, task visibility, duplicate active task-run constraints, catalyst availability, and task configuration validity.
5. `startAttempt` behavior MUST validate gathering catalyst availability only against the selected acting actor. Terminal catalyst usage MUST also apply only against the selected acting actor after the terminal outcome is known; gathering MUST NOT reuse crafting component-source actor aggregation behavior.
6. For tasks without `timeRequirement`, `startAttempt` MUST resolve the routed or progressive terminal outcome immediately after start guards and selected-task configuration validation pass.
7. Immediate terminal resolution MUST write terminal actor history directly without creating an active run, MUST persist planned `createdResults`, `usedCatalysts`, and `checkResult` in that terminal history before committing irreversible result, catalyst, or failure-feedback effects, MUST create gathered result items only for `succeeded` outcomes, MUST skip gathered result creation for `failed` outcomes, and MUST apply terminal catalyst usage only after the outcome is known and terminal history persistence succeeds.
8. Non-timed selected-task validation MUST reject invalid `failureOutcome`, reserved failure keyword result-group names, and duplicate normalized result-group names before resolver calls, result creation, catalyst usage, failure feedback, or terminal history writes.
9. `startAttempt` MUST create exactly one awaited active `waitingTime` run for tasks with `timeRequirement`, by calling `GatheringRunManager.createWaitingRun` only after all start guards pass.
10. Non-GM blind start failure responses, including waiting-run creation errors or diagnostics, MUST redact real task identity, catalyst details, configuration errors, and diagnostics.
11. Non-GM blind terminal responses and persisted terminal history MUST redact real task identity, catalyst details, result details, provider diagnostics, and check internals. GM blind terminal responses MAY include real task and result details for inspection.
12. The runtime service MUST complete waiting runs when the module-private `GatheringEngine.processWorldTime(worldTime)` receives a world time at or after `timeGate.availableAt`; bootstrap MUST wire ready/updateWorldTime dispatch to that processor with error isolation and without exposing the raw engine instance publicly.
13. When a waiting run resumes and its environment, task, crafting system, or actor reference is no longer valid, the runtime service MUST cancel the run, remove it from `active`, and prepend a terminal `cancelled` history entry instead of resolving results.
14. When a waiting run resumes after GM edits leave the task misconfigured, the runtime service MUST clear the active run to avoid stuck duplicate blocking, MUST NOT create terminal player history entries, result items, or catalyst degradation, MUST surface GM-fix-required feedback/diagnostics, and MUST require a fresh manual start after the task is repaired.
15. If terminal completion cannot write history because `completeRun` returns `null` or throws, the runtime service MUST report an error and MUST NOT create result items, apply catalyst usage, or apply failure feedback.
16. Misconfiguration-aborted start attempts MUST NOT create active runs, terminal history entries, result items, catalyst degradation, or failure feedback.
17. Failed gathering attempts MUST be terminal player outcomes and MUST write history, skip gathered result creation, apply configured or default failure feedback, and apply catalyst usage for the terminal attempt after terminal history persistence succeeds.
18. The runtime service MUST keep one-active-run-per-actor-per-task semantics for both immediate start checks and persisted `waitingTime` runs.
19. Terminal gathering history MUST remain newest-first and MUST truncate to the canonical 50-entry actor limit.

### Requirement: Dedicated gathering user interfaces

Fabricate MUST expose gathering through dedicated GM and player UI surfaces.

1. The Items Directory `Gathering` action MUST be visible only when at least one normalized crafting system has `features.gathering === true`.
2. The Items Directory `Gathering` action MUST open a dedicated gathering app and MUST NOT open or reuse the crafting app route.
3. The player gathering app MUST provide actor selection, available environment/task selection, active timed run display, terminal feedback, and history visibility needed to execute the runtime service.
4. The GM system settings UI MUST expose a reachable localized `Gathering` feature toggle that persists `features.gathering`.
5. The GM admin `Environments` tab MUST be visible only when the selected crafting system has `features.gathering === true`.
6. The GM admin `Environments` tab MUST block save when environment or task validation fails.
7. The GM admin `Environments` tab MUST support environment/task create, edit, duplicate, enable/disable, reorder, and delete workflows.
8. The player app MUST keep scene-gated environments listable when otherwise visible and MUST display localized blocked reasons instead of hiding them.
9. In blind environments, the player app MUST present one generic gather action rather than exposing the environment's single task as a named alternate choice.
10. Blind-environment secrecy MUST apply everywhere player-facing: localized generic labels are used for actions, duplicate-run blockers, active runs, history rows, notifications, and terminal feedback.
11. The player app MUST persist the selected actor to `fabricate.lastGatheringActor` and MUST clear or ignore that preference only when the actor no longer resolves or is no longer selectable for the current user.
12. The GM admin `Environments` tab MUST provide visible save/cancel affordances, confirm before tab change or close when dirty edits exist, and fall back to a valid visible tab if `Environments` disappears after a system switch or `features.gathering` toggles off.
13. The GM admin validation UX MUST include a localized summary, inline field errors, `aria-invalid`, `aria-describedby`, keyboard jump to the first invalid field after save attempt, and persistent stale-reference warnings.
14. The GM admin and player gathering layouts MUST remain usable in narrow Foundry windows by stacking major panes and collapsing active/history views to one column where necessary.

Current checkpoint: the GM system settings view exposes the gathering feature toggle, and the GM admin tab satisfies the tab visibility and valid-tab fallback portions of this requirement. The admin tab has progressed to environment editing plus task-list CRUD, base task fields, selected-task result-group authoring, selected-task catalyst authoring, selected-task visibility-gate authoring, routed result-selection provider authoring, progressive check/award-mode authoring, time-requirement authoring, failure-outcome authoring, and validation/accessibility presentation. It lists environments for the selected gathering-enabled system, exposes a cloned selected draft from the gathering environment store, edits environment name, description, enabled state, selection mode, and scene UUID, tracks dirty state for the selected draft, and provides visible save/cancel actions. New environment creation persists a disabled draft shell with one disabled placeholder task for validation compatibility; that shell is not a configured player-visible gathering path until configured and enabled by the GM. Duplicate, delete, and reorder use environment-store methods, and delete requires confirmation before the store cleans referenced gathering runs. The selected draft supports task-list add/select/duplicate/delete/reorder actions and base task fields for `name`, `description`, `img`, `enabled`, and `resolutionMode`. The selected task supports result-group add/rename/delete/reorder plus component-based result add/edit/delete/reorder for `componentId` and `quantity`. The selected task also supports catalyst add/delete plus editing `componentId`, `degradesOnUse`, `destroyWhenExhausted`, and nullable `maxUses`; `maxUses` is validation-relevant only when degradation is enabled. The selected task supports visibility gate enable/clear plus `macro`, `dnd5e`, and `pf2e` provider fields, with incomplete provider input kept local until required fields are available for a valid draft mutation. Routed result-selection authoring supports `macroOutcome.macroUuid` from available script macro options and `rollTableOutcome.rollTableUuid` as UUID text input. Progressive authoring supports `progressive.awardMode` values `equal`, `partial`, and `exceed`, plus `macro`, `dnd5e`, and `pf2e` checks with optional thresholds for dnd5e/pf2e. Time-requirement authoring supports immediate tasks by clearing `timeRequirement` and timed tasks by editing minutes, hours, days, months, and years. Failure-outcome authoring supports clearing to default failure feedback plus text and macro custom outcomes, with provider switching clearing stale provider fields. Task/result/catalyst/visibility/result-selection/progressive/check/time/failure edits are store-owned callback paths, preserve nested task configuration outside edited collections, and continue to persist through the environment-store validation boundary. Save failures block persistence, leave the dirty draft intact, show localized validation summaries and inline field-addressable errors, wire `aria-invalid`/`aria-describedby`, focus the first invalid target after failed save, and keep stale scene/macro references visible until the GM changes them. New draft placeholder result groups receive immediate IDs so they can be edited before save/reload. Managed item options are prepared by the admin store/root and passed into the environments tab; the tab does not perform Foundry lookups. Progressive difficulty is displayed from selected managed component difficulty and is not persisted inline on result rows because canonical store validation uses managed component difficulty. Dirty navigation prompts, the player gathering UI, Items Directory action, dedicated app registration, responsive GM/player container-query polish, scene-linked runtime integration coverage, hook-driven timed completion coverage, and harvesting boundary regression coverage are implemented. Live Foundry validation remains conditional for future runtime-specific or screenshot-required work.

### Requirement: Gathering test coverage

The issue `#179` implementation MUST include automated coverage for the core gathering behavior.

1. Tests MUST cover settings registration and `features.gathering` normalization.
2. Tests MUST cover narrowed `lastGatheringActor` cleanup and invalid remembered actor behavior.
3. Tests MUST cover environment and task validation.
4. Tests MUST cover duplication semantics, duplicate/delete isolation, and destructive cleanup boundaries: deleted crafting systems remove persisted environments, deleted environments/tasks clean actor run records, and disabled gathering hides but does not delete persisted environments.
5. Tests MUST cover the canonical persisted `Actor.flags.fabricate.gatheringRuns` shape and guard against double-prefixed actor-flag writes.
6. Tests MUST cover `dnd5e`, `pf2e`, and `macro` visibility gates plus `dnd5e`, `pf2e`, and `macro` gathering checks through the dedicated evaluator seam.
7. Tests MUST cover player-visible environment/task filtering and attemptability-state reporting, including no selectable actors, invalid remembered actor, no environments configured, no visible targeted tasks, blind sole-task hidden, scene/token gating as listable-but-blocked, duplicate active run blocked, catalyst blocked, non-GM blind secrecy, GM blind inspection, and hidden targeted task filtering.
8. Tests MUST cover start-attempt guard ordering, immediate terminal success/failure, terminal history persistence before post-history result/catalyst/failure-feedback commits, terminal persistence failure blocking irreversible effects, invalid `failureOutcome` aborts, timed `waitingTime` run creation after guards, run-creation failure handling, and no terminal side effects before selected-task validation passes.
9. Tests MUST cover backend timed completion, timed cancellation, resume-time misconfiguration clearing of active runs without history/results/catalyst writes, fresh manual restart after repair, timed terminal history writes, completeRun null/throw side-effect blocking, blind timed redaction, history cap behavior, bootstrap construction after systems load, environment-store loading, cleanup callback wiring, narrow public accessors, current-user viewer enforcement, no raw public `GatheringEngine` accessor, and guarded ready/updateWorldTime dispatch.
10. Tests MUST cover routed and progressive gathering resolution, including failure keywords and misconfiguration aborts.
11. Tests MUST cover Items Directory button gating, player gathering app registration, blind-vs-targeted player behavior, GM `Environments` tab gating, dirty-state/tab-fallback behavior, accessibility validation state, and narrow-window layout handling.
12. Tests MUST include at least one runtime/integration path for scene-linked gathering and one hook-driven timed completion path.
13. Tests MUST include a regression guard confirming harvesting remains modeled as recipe or salvage data rather than a separate gathering runtime path.
