# Tasks

## Backend And Runtime

- [x] Register `fabricate.gatheringEnvironments` as a world setting and `fabricate.lastGatheringActor` as a client setting, including tests for defaults and key registration.
- [x] Normalize `CraftingSystem.features.gathering` to a boolean default of `false` and update any feature-toggle selectors/tests that assume the field is absent.
- [x] Narrow `lastGatheringActor` cleanup to unresolved actors or actors that are no longer selectable by the current user; remove any system-context cleanup behavior.
- [x] Implement a dedicated gathering environment store with explicit methods for load, list-by-system, create, update, duplicate, reorder, delete, validate, and save.
- [x] Encode environment/task validation rules in the store: selection-mode cardinality, provider-specific required fields, progressive referenced-component difficulty requirements, unique normalized result-group names, and reserved failure keyword rejection.
- [x] Implement duplication as a deep clone with a fresh environment ID and fresh nested task IDs, and add cleanup-safe duplicate/delete isolation behavior.
- [x] Implement deterministic cleanup in the environment store for deleted crafting systems and deleted environments/tasks, including actor run cleanup hooks by `craftingSystemId`, `environmentId`, and `taskId`.
- [x] Preserve persisted environments when `features.gathering` is toggled off, but exclude them from player-visible runtime queries and selected-system admin navigation until re-enabled.
- [x] Implement a gathering run manager that persists only to `Actor.flags.fabricate.gatheringRuns`, not a double-prefixed helper path, and bypass or narrow-wrap any helper that would write `fabricate.fabricate.gatheringRuns`.
- [x] Persist only the canonical `GatheringRun` stored shape for both active and history entries, including `actorUuid`, `userId`, timestamps, `craftingSystemId`, `environmentId`, `taskId`, `status`, `timeGate.requiredSeconds`, `timeGate.availableAt`, `timeGate.initiatedAt`, `checkResult`, `usedCatalysts`, and `createdResults`; do not add extra blind-label snapshot fields unless a later spec explicitly requires them.
- [x] Enforce one-active-run-per-actor-per-task, newest-first terminal history writes, and 50-entry truncation in the run manager.
- [x] Implement a dedicated gathering gate/check evaluator seam for `dnd5e`, `pf2e`, and `macro` visibility gates plus `dnd5e`, `pf2e`, and `macro` task checks; keep this logic out of `GatheringEngine` and preserve neutral value-only check results plus non-terminal diagnostics.
- [x] Implement runtime listing for a selected viewer and actor that keeps scene-gated environments listable when otherwise visible and returns explicit attemptability plus localized blocked reasons instead of hiding them.
- [x] Cover listing-state edge cases in runtime contracts: no selectable actors, invalid remembered actor, no environments configured, no visible targeted tasks, blind sole-task hidden, scene/token blocked, duplicate active run blocked, and catalyst blocked.
- [x] Implement start-attempt flow for pause, duplicate active runs, missing catalysts, hidden tasks, disabled records, scene/token access failure, missing references, selected-task-only misconfiguration, and blind blocked secrecy before terminal side effects. Non-timed tasks now resolve immediately into routed/progressive terminal outcomes, persist planned `createdResults`, `usedCatalysts`, and `checkResult` in terminal history before post-history commits, and block result/catalyst/failure-feedback side effects if terminal persistence fails. Success creates result items only after terminal history persists; failure writes failed terminal history, creates no result items, and then applies terminal catalyst behavior plus configured/default feedback. Bootstrap/ready/updateWorldTime hook wiring, narrow global accessors, and dedicated UI/app registration are implemented.
- [x] Validate and consume gathering catalysts only against the selected acting actor; do not reuse crafting component-source actor aggregation semantics for gathering. Terminal catalyst usage happens after terminal outcome resolution.
- [x] Implement immediate gathering resolution for tasks without `timeRequirement`, including routed/progressive outcome handling, result item creation on success only after terminal persistence, catalyst application on terminal attempts after terminal persistence, failed-outcome configured/default feedback, terminal history writes with planned refs, selected-task validation for invalid `failureOutcome` plus reserved/duplicate result-group names, non-GM blind redaction, and GM blind inspectability.
- [x] Implement timed gathering run creation for tasks with `timeRequirement`, persisting `waitingTime` runs with normalized world-time gates after start guards pass.
- [x] Implement waiting-run backend completion through `processWorldTime(worldTime)`, including successful completion, failure completion, terminal cancellation when references disappear before resume, and misconfiguration-abort cleanup when GM edits leave the task invalid before resume.
- [x] On resume-time misconfiguration, clear the active run without creating terminal history, result items, catalyst usage, or failure feedback, surface GM-fix-required diagnostics through the runtime result, and require a fresh manual start after repair.
- [x] Wire gathering collaborators into module bootstrap after crafting systems load, load the environment store, pass cleanup callbacks through to the run manager, expose narrow `game.fabricate` gathering APIs/getters without a raw `GatheringEngine` accessor, and dispatch ready/updateWorldTime processing through isolated crafting, salvage, and gathering callbacks.
- [x] Stop after backend/runtime work and verify the dedicated runtime test slice before UI implementation continues.

## GM Admin UI

- [x] Expose a localized `Gathering` feature card in system settings so GMs can enable `features.gathering` and reach the gated `Environments` tab.
- [x] Add the GM admin `Environments` foundation tab gated by selected-system `features.gathering === true`, backed by admin-store state that clones list/draft records before exposing them and falls back to a valid visible `activeTab` when `Environments` is unavailable.
- [x] Expand the GM admin `Environments` tab to an environment-level editor foundation for name, description, enabled state, `selectionMode`, and `sceneUuid`, backed by selected-draft dirty state.
- [x] Provide visible save/cancel affordances for the selected environment draft.
- [x] Persist new environments as disabled draft shells with one disabled placeholder task and immediately identified placeholder result group for validation compatibility/pre-save editing; these shells are not configured player-visible gathering paths until configured and enabled by the GM.
- [x] Route environment duplicate, delete, and reorder through environment-store methods; require delete confirmation before store cleanup removes referenced gathering runs.
- [x] Add task-list CRUD and base task fields: add/select/duplicate/delete/reorder tasks; edit `name`, `description`, `img`, `enabled`, and `resolutionMode`; preserve existing nested task configuration; and keep save flowing through the environment-store validation boundary.
- [x] Add remaining advanced task authoring components for time requirements, failure outcomes, and task-level validation/accessibility.
  - [x] Add GM result-group authoring for the selected gathering task, including result-group add/rename/delete/reorder and result add/edit/delete/reorder for component-based results with editable `componentId` and `quantity`.
  - [x] Add catalyst authoring for selected gathering tasks.
  - [x] Add visibility-gate authoring for selected gathering tasks.
  - [x] Add routed result-selection provider authoring and progressive check/award-mode authoring for selected gathering tasks.
  - [x] Add time-requirement authoring for selected gathering tasks.
  - [x] Add failure-outcome authoring for selected gathering tasks.
  - [x] Add task-level validation/accessibility presentation once the advanced fields are editable.
- [x] Confirm before tab navigation, system switch, or app close when dirty edits exist.
- [x] Force the admin shell back to a valid visible tab when `Environments` disappears after system switch or `features.gathering` toggles off, and reset/constrain `activeTab` accordingly.
- [x] Block GM saves when environment/task validation fails, with localized validation summary, inline field errors, `aria-invalid`, `aria-describedby`, keyboard jump to the first invalid field after a failed save, and persistent stale linked-scene/system warnings.
- [x] Make the editor responsive in narrow Foundry windows using app/container-width behavior: stack list/editor panes, keep independent scrolling panes where needed, and keep primary save actions reachable without layout breakage.
- [x] Stop after GM admin UI work and verify admin store/component tests before player app work continues.

## Player App

- [x] Register a dedicated gathering app through `appFactory` and add the Items Directory `Gathering` action gated by at least one normalized system with `features.gathering === true`.
- [x] Add the dedicated player gathering app and store with actor selection, `lastGatheringActor` persistence/cleanup, environment/task browsing, attemptability-state messaging, active timed runs, and history/feedback surfaces.
- [x] Keep scene/token-gated environments listable in the player app and display localized blocked reasons instead of hiding them.
- [x] Apply blind-environment secrecy everywhere player-facing by using localized generic labels for action buttons, duplicate-run blockers, active runs, history rows, notifications, and terminal feedback; real task names remain GM-only.
- [x] Implement blind-environment labels from current environment/task selection mode at render time so the player app does not depend on extra persisted blind-summary fields.
- [x] Show clear empty/blocked states for no selectable actors, invalid remembered actor, no environments configured, no visible targeted tasks, and blind sole-task hidden.
- [x] Make active runs/history collapse to a one-column layout in narrow Foundry windows using the gathering app container width.

## Verification

- [x] Add unit tests for settings keys, `features.gathering` normalization, and narrowed `lastGatheringActor` cleanup.
- [x] Add unit tests for environment validation, duplication semantics, duplicate/delete isolation, and destructive cleanup boundaries.
- [x] Add unit tests asserting the canonical persisted `Actor.flags.fabricate.gatheringRuns` shape and guarding against double-prefixed helper writes.
- [x] Add unit tests for `dnd5e`, `pf2e`, and `macro` visibility gates plus `dnd5e`, `pf2e`, and `macro` gathering checks through the dedicated evaluator seam, including neutral value-only checks and diagnostic result shapes.
- [x] Add unit tests for player-visible listing and attemptability-state reporting, including scene/token gating as listable-but-blocked.
- [x] Add unit tests for `startAttempt` ordering, immediate terminal success/failure, planned terminal history refs before post-history commits, terminal persistence failure preventing irreversible side effects, invalid `failureOutcome` aborts, timed `waitingTime` run creation without `usedCatalysts` or `createdResults`, blind failure redaction, run-creation failure handling, and no terminal side effects before terminal resolution.
- [x] Add unit tests for acting-actor-only catalyst validation/consumption.
- [x] Add unit tests for backend timed completion/resume: matured success/failure, non-matured runs ignored, missing-reference cancellation, resume-time misconfiguration active-run clearing without history/results/catalyst/feedback writes, fresh manual restart after repair, `completeRun` null/throw side-effect blocking, non-GM blind timed redaction, and timed runtime outcome handling. Run-manager-only coverage for direct terminal history writes, waiting gates, cleanup by system/environment/task, terminal history ordering, and 50-entry retention is complete.
- [x] Add bootstrap/accessor unit coverage confirming collaborator construction after systems load, cleanup callback wiring to the run manager, narrow `listGatheringForActor`/`startGatheringAttempt` public APIs with current-viewer enforcement, store/run/evaluator getters, no public raw `GatheringEngine` accessor, and isolated ready/updateWorldTime gathering processing.
- [x] Add source/component-store contract coverage for the GM `Environments` foundation tab: feature gating, non-mutating cloned list/draft state, store injection, localization keys, and valid-tab fallback.
- [x] Add component contract coverage that the system settings UI exposes the `Gathering` feature toggle.
- [x] Add component/store tests for admin environment-level dirty-state handling, store-backed create/duplicate/delete/reorder, task-list CRUD/base-field edits, save/cancel, delete confirmation, placeholder draft-shell creation, and nested task configuration preservation.
- [x] Add component/store tests for selected-task result-group authoring, component-based result editing, callback wiring, nested task configuration preservation, managed item option flow, progressive difficulty display, and immediate placeholder result-group IDs.
- [x] Add component/store tests for blind-vs-targeted player UI, remaining advanced task authoring beyond result-selection/check/award controls, validation accessibility state, and narrow-window responsive layout behavior.
- [x] Add at least one runtime/integration test for scene-linked gathering and one hook-driven timed completion path.
- [x] Add a regression guard confirming harvesting remains modeled as recipe or salvage data rather than a separate gathering runtime path.
- [x] Run `npm test`.
- [x] Run `npm run build`.
- [ ] Conditional: run `npm run test:foundry` only when live scene/token gating, hook-driven timed completion, or reproducible UI screenshots require Foundry runtime validation. Closeout did not require it because scene-linked gathering and hook-driven timed completion already have automated integration coverage, and the responsive UI slice is covered by container-query contract tests rather than live screenshots.

Closeout gate results on 2026-04-28:

- `npm test` passed: 138 tests, 0 failures.
- `npm run build` passed. It still emits pre-existing unrelated Svelte accessibility warnings in `src/ui/svelte/apps/AlchemyTab.svelte` and `src/ui/svelte/apps/ComponentPalette.svelte`.
- `npm run test:foundry` was not run for this closeout because no current change requires live Foundry scene/token validation or reproducible screenshots beyond the existing automated integration and container-query coverage.
