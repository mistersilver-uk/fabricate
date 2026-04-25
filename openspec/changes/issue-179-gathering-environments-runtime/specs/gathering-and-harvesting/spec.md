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
3. Validation MUST include selection-mode task cardinality, provider-specific required fields, result group uniqueness, reserved failure keyword collisions, progressive result difficulty requirements, and unresolved crafting system references.
4. Environment deletion MUST remove active and historical gathering runs that reference the deleted `environmentId`.
5. Task deletion MUST remove active and historical gathering runs that reference the deleted `taskId`.
6. Crafting-system deletion MUST remove persisted environments owned by that system.
7. Gathering feature disable for a crafting system MUST hide that system's environments from normal player flows and the selected-system admin tab immediately, but MUST NOT delete the persisted environment records.
8. Stale `sceneUuid` references MUST remain persisted and editable; runtime access for those environments MUST fail closed until the link is corrected or removed.
9. Duplicated environments MUST deep-clone the source record with a fresh environment ID and fresh nested task IDs.
10. Deleting or editing a duplicated environment MUST NOT mutate the source environment or clean up runs belonging only to the source environment.

### Requirement: Gathering gate and check evaluator

Fabricate MUST provide a dedicated evaluator seam for gathering visibility gates and task checks.

1. The evaluator MUST support `dnd5e`, `pf2e`, and `macro` providers for visibility gates.
2. The evaluator MUST support `dnd5e`, `pf2e`, and `macro` providers for gathering task checks.
3. `GatheringEngine` MUST consume normalized evaluator results rather than embedding provider-specific parsing and execution logic directly.
4. Existing crafting-only check or resolution helpers are not sufficient by themselves unless wrapped so the gathering runtime still has one explicit evaluator seam for both visibility and check execution.

### Requirement: Gathering runtime service

Fabricate MUST provide a dedicated runtime service for player gathering attempts.

1. The runtime service MUST expose player-visible environment/task queries without requiring callers to duplicate visibility, scene, permission, or enabled-state rules.
2. Scene/token gating MUST affect attemptability, not listing: scene-gated environments that are otherwise visible MUST remain listable, and the runtime service MUST return attemptability state plus localized blocked reasons for those entries.
3. The runtime service MUST represent blocked or empty player states needed by the app, including no selectable actors, invalid remembered actor, no environments configured, no visible targeted tasks, blind sole-task hidden, scene/token blocked, duplicate active run blocked, and catalyst blocked.
4. The runtime service MUST start gathering attempts only after enforcing pause, environment enabled state, task enabled state, actor ownership, scene/token gating, task visibility, duplicate active task-run constraints, catalyst availability, and task configuration validity.
5. Gathering catalysts MUST be validated and consumed only against the selected acting actor; gathering MUST NOT reuse crafting component-source actor aggregation behavior.
6. The runtime service MUST resolve tasks without `timeRequirement` immediately and write the terminal run directly to actor history.
7. The runtime service MUST create an active `waitingTime` run for tasks with `timeRequirement`.
8. The runtime service MUST complete waiting runs when world time reaches `timeGate.availableAt`.
9. When a waiting run resumes and its environment, task, crafting system, or actor reference is no longer valid, the runtime service MUST cancel the run, remove it from `active`, and prepend a terminal `cancelled` history entry instead of resolving results.
10. When a waiting run resumes after GM edits leave the task misconfigured, the runtime service MUST clear the active run to avoid stuck duplicate blocking, MUST NOT create terminal player history entries, result items, or catalyst degradation, MUST surface GM-fix-required feedback/diagnostics, and MUST require a fresh manual start after the task is repaired.
11. Misconfiguration-aborted start attempts MUST NOT create active runs, terminal history entries, result items, or catalyst degradation.
12. Failed gathering attempts MUST be terminal player outcomes and MUST write history, skip gathered result creation, apply configured failure feedback, and apply catalyst usage for the terminal attempt.
13. The runtime service MUST keep one-active-run-per-actor-per-task semantics for both immediate start checks and persisted `waitingTime` runs.
14. Terminal gathering history MUST remain newest-first and MUST truncate to the canonical 50-entry actor limit.

### Requirement: Dedicated gathering user interfaces

Fabricate MUST expose gathering through dedicated GM and player UI surfaces.

1. The Items Directory `Gathering` action MUST be visible only when at least one normalized crafting system has `features.gathering === true`.
2. The Items Directory `Gathering` action MUST open a dedicated gathering app and MUST NOT open or reuse the crafting app route.
3. The player gathering app MUST provide actor selection, available environment/task selection, active timed run display, terminal feedback, and history visibility needed to execute the runtime service.
4. The GM admin `Environments` tab MUST be visible only when the selected crafting system has `features.gathering === true`.
5. The GM admin `Environments` tab MUST block save when environment or task validation fails.
6. The GM admin `Environments` tab MUST support environment/task create, edit, duplicate, enable/disable, reorder, and delete workflows.
7. The player app MUST keep scene-gated environments listable when otherwise visible and MUST display localized blocked reasons instead of hiding them.
8. In blind environments, the player app MUST present one generic gather action rather than exposing the environment's single task as a named alternate choice.
9. Blind-environment secrecy MUST apply everywhere player-facing: localized generic labels are used for actions, duplicate-run blockers, active runs, history rows, notifications, and terminal feedback.
10. The player app MUST persist the selected actor to `fabricate.lastGatheringActor` and MUST clear or ignore that preference only when the actor no longer resolves or is no longer selectable for the current user.
11. The GM admin `Environments` tab MUST provide visible save/cancel affordances, confirm before tab change or close when dirty edits exist, and fall back to a valid visible tab if `Environments` disappears after a system switch or `features.gathering` toggles off.
12. The GM admin validation UX MUST include a localized summary, inline field errors, `aria-invalid`, `aria-describedby`, keyboard jump to the first invalid field after save attempt, and persistent stale-reference warnings.
13. The GM admin and player gathering layouts MUST remain usable in narrow Foundry windows by stacking major panes and collapsing active/history views to one column where necessary.

### Requirement: Gathering test coverage

The issue `#179` implementation MUST include automated coverage for the core gathering behavior.

1. Tests MUST cover settings registration and `features.gathering` normalization.
2. Tests MUST cover narrowed `lastGatheringActor` cleanup and invalid remembered actor behavior.
3. Tests MUST cover environment and task validation.
4. Tests MUST cover duplication semantics, duplicate/delete isolation, and destructive cleanup boundaries: deleted crafting systems remove persisted environments, deleted environments/tasks clean actor run records, and disabled gathering hides but does not delete persisted environments.
5. Tests MUST cover the canonical persisted `Actor.flags.fabricate.gatheringRuns` shape and guard against double-prefixed actor-flag writes.
6. Tests MUST cover `dnd5e`, `pf2e`, and `macro` visibility gates plus `dnd5e`, `pf2e`, and `macro` gathering checks through the dedicated evaluator seam.
7. Tests MUST cover player-visible environment/task filtering and attemptability-state reporting, including no selectable actors, no environments configured, no visible targeted tasks, blind sole-task hidden, and scene/token gating as listable-but-blocked.
8. Tests MUST cover immediate task resolution, timed run creation, hook-driven timed completion, timed cancellation, resume-time misconfiguration clearing of active runs without history/results/catalyst writes, fresh manual restart after repair, terminal history writes, and history cap behavior.
9. Tests MUST cover routed and progressive gathering resolution, including failure keywords and misconfiguration aborts.
10. Tests MUST cover Items Directory button gating, player gathering app registration, blind-vs-targeted player behavior, GM `Environments` tab gating, dirty-state/tab-fallback behavior, accessibility validation state, and narrow-window layout handling.
11. Tests MUST include at least one runtime/integration path for scene-linked gathering and one hook-driven timed completion path.
12. Tests MUST include a regression guard confirming harvesting remains modeled as recipe or salvage data rather than a separate gathering runtime path.
