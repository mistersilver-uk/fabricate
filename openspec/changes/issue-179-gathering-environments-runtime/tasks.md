# Tasks

## Backend And Runtime

- [ ] Register `fabricate.gatheringEnvironments` as a world setting and `fabricate.lastGatheringActor` as a client setting, including tests for defaults and key registration.
- [ ] Normalize `CraftingSystem.features.gathering` to a boolean default of `false` and update any feature-toggle selectors/tests that assume the field is absent.
- [ ] Narrow `lastGatheringActor` cleanup to unresolved actors or actors that are no longer selectable by the current user; remove any system-context cleanup behavior.
- [ ] Implement a dedicated gathering environment store with explicit methods for load, list-by-system, create, update, duplicate, reorder, delete, validate, and save.
- [ ] Encode environment/task validation rules in the store: selection-mode cardinality, provider-specific required fields, progressive result difficulty requirements, unique normalized result-group names, and reserved failure keyword rejection.
- [ ] Implement duplication as a deep clone with a fresh environment ID and fresh nested task IDs, and add cleanup-safe duplicate/delete isolation behavior.
- [ ] Implement deterministic cleanup in the environment store for deleted crafting systems and deleted environments/tasks, including actor run cleanup hooks by `craftingSystemId`, `environmentId`, and `taskId`.
- [ ] Preserve persisted environments when `features.gathering` is toggled off, but exclude them from player-visible runtime queries and selected-system admin navigation until re-enabled.
- [ ] Implement a gathering run manager that persists only to `Actor.flags.fabricate.gatheringRuns`, not a double-prefixed helper path, and bypass or narrow-wrap any helper that would write `fabricate.fabricate.gatheringRuns`.
- [ ] Persist only the canonical `GatheringRun` stored shape for both active and history entries, including `actorUuid`, `userId`, timestamps, `craftingSystemId`, `environmentId`, `taskId`, `status`, `timeGate.requiredSeconds`, `timeGate.availableAt`, `timeGate.initiatedAt`, `checkResult`, `usedCatalysts`, and `createdResults`; do not add extra blind-label snapshot fields unless a later spec explicitly requires them.
- [ ] Enforce one-active-run-per-actor-per-task, newest-first terminal history writes, and 50-entry truncation in the run manager.
- [ ] Implement a dedicated gathering gate/check evaluator seam for `dnd5e`, `pf2e`, and `macro` visibility gates plus `dnd5e`, `pf2e`, and `macro` task checks; keep this logic out of `GatheringEngine`.
- [ ] Implement runtime listing for a selected viewer and actor that keeps scene-gated environments listable when otherwise visible and returns explicit attemptability plus localized blocked reasons instead of hiding them.
- [ ] Cover listing-state edge cases in runtime contracts: no selectable actors, invalid remembered actor, no environments configured, no visible targeted tasks, blind sole-task hidden, scene/token blocked, duplicate active run blocked, and catalyst blocked.
- [ ] Implement start-attempt guard flow for pause, duplicate active runs, missing catalysts, hidden tasks, disabled records, scene/token access failure, missing references, and task misconfiguration before any catalyst consumption or terminal result writes.
- [ ] Validate and consume gathering catalysts only against the selected acting actor; do not reuse crafting component-source actor aggregation semantics for gathering.
- [ ] Implement immediate gathering resolution for tasks without `timeRequirement`, including routed/progressive outcome handling, failure feedback, result item creation on success only, catalyst application on terminal attempts, and terminal history writes.
- [ ] Implement timed gathering run creation for tasks with `timeRequirement`, persisting `waitingTime` runs with normalized world-time gates.
- [ ] Implement waiting-run completion on world-time advancement, including successful completion, failure completion, terminal cancellation when references disappear before resume, and misconfiguration-abort cleanup when GM edits leave the task invalid before resume.
- [ ] On resume-time misconfiguration, clear the active run without creating terminal history, result items, or catalyst usage, surface localized GM-fix-required feedback/diagnostics, and require a fresh manual start after repair.
- [ ] Wire gathering collaborators into module bootstrap, expose narrow `game.fabricate` accessors that include attemptability metadata and blocked reasons, and keep `src/main.js` limited to composition and hook registration.
- [ ] Stop after backend/runtime work and verify the dedicated runtime test slice before UI implementation continues.

## GM Admin UI

- [ ] Add the GM admin `Environments` tab gated by selected-system `features.gathering === true`, backed by admin-store state that does not leak unsaved form state into persisted records.
- [ ] Add environment/task editor components for environment fields, task CRUD, enable/disable, duplicate, reorder, result groups, catalysts, scene UUID, visibility gates, checks, time requirements, and failure outcomes.
- [ ] Provide visible save/cancel affordances for the tab and confirm before tab navigation, system switch, or app close when dirty edits exist.
- [ ] Force the admin shell back to a valid visible tab when `Environments` disappears after system switch or `features.gathering` toggles off, and reset/constrain `activeTab` accordingly.
- [ ] Block GM saves when environment/task validation fails, with localized validation summary, inline field errors, `aria-invalid`, `aria-describedby`, keyboard jump to the first invalid field after a failed save, and persistent stale linked-scene/system warnings.
- [ ] Make the editor responsive in narrow Foundry windows: stack list/editor panes, keep independent scrolling panes where needed, and keep primary save actions reachable without layout breakage.
- [ ] Stop after GM admin UI work and verify admin store/component tests before player app work continues.

## Player App

- [ ] Register a dedicated gathering app through `appFactory` and add the Items Directory `Gathering` action gated by at least one normalized system with `features.gathering === true`.
- [ ] Add the dedicated player gathering app and store with actor selection, `lastGatheringActor` persistence/cleanup, environment/task browsing, attemptability-state messaging, active timed runs, and history/feedback surfaces.
- [ ] Keep scene/token-gated environments listable in the player app and display localized blocked reasons instead of hiding them.
- [ ] Apply blind-environment secrecy everywhere player-facing by using localized generic labels for action buttons, duplicate-run blockers, active runs, history rows, notifications, and terminal feedback; real task names remain GM-only.
- [ ] Implement blind-environment labels from current environment/task selection mode at render time so the player app does not depend on extra persisted blind-summary fields.
- [ ] Show clear empty/blocked states for no selectable actors, invalid remembered actor, no environments configured, no visible targeted tasks, and blind sole-task hidden.
- [ ] Make active runs/history collapse to a one-column layout in narrow Foundry windows.

## Verification

- [ ] Add unit tests for settings keys, `features.gathering` normalization, and narrowed `lastGatheringActor` cleanup.
- [ ] Add unit tests for environment validation, duplication semantics, duplicate/delete isolation, and destructive cleanup boundaries.
- [ ] Add unit tests asserting the canonical persisted `Actor.flags.fabricate.gatheringRuns` shape and guarding against double-prefixed helper writes.
- [ ] Add unit tests for `dnd5e`, `pf2e`, and `macro` visibility gates plus `dnd5e`, `pf2e`, and `macro` gathering checks through the dedicated evaluator seam.
- [ ] Add unit tests for player-visible listing and attemptability-state reporting, including scene/token gating as listable-but-blocked.
- [ ] Add unit tests for acting-actor-only catalyst validation/consumption.
- [ ] Add unit tests for immediate resolution, timed run creation, hook-driven timed completion, resume-time cancellation on missing references, resume-time misconfiguration active-run clearing without history/results/catalyst writes, fresh manual restart after repair, terminal history ordering, and 50-entry retention.
- [ ] Add component/store tests for blind-vs-targeted player UI, admin dirty-state handling, valid-tab fallback, validation accessibility state, and narrow-window responsive layout behavior.
- [ ] Add at least one runtime/integration test for scene-linked gathering and one hook-driven timed completion path.
- [ ] Add a regression guard confirming harvesting remains modeled as recipe or salvage data rather than a separate gathering runtime path.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `npm run test:foundry` when live scene/token gating, hook-driven timed completion, narrow-window validation, or reproducible UI screenshots require Foundry runtime validation.
