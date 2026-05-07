# Tasks

## Planning

- [x] Read `AGENTS.md`.
- [x] Read existing `openspec/changes/rich-gathering-environments/` docs and deltas.
- [x] Read canonical gathering and UI integration specs.
- [x] Inspect current gathering runtime, environment store, rich state service, Manager V2, player app, styles, localization, and tests at a planning level.
- [x] Load `javascript-structural-design` for module-boundary planning.
- [x] Resolve auto-spawn agent roster from `AGENTS.md`.
- [x] Update `proposal.md`, `design.md`, and `tasks.md` for the user-supplied end-to-end brief.
- [ ] Run plan review loop with `fabricate_domain_expert`, `fabricate_ux_designer`, and `fabricate_quality_engineer`.
- [ ] Revise plan docs for plan-review findings, up to 3 iterations.

## Implementation Entry Criteria

- [ ] Plan review emits `APPROVED` from all resolved plan-review agents.
- [x] Decide reusable task storage location: dedicated world setting keyed by crafting system for this slice, with system-record promotion deferred.
- [x] Decide hazard storage location and first-slice hazard capabilities: same dedicated setting keyed by crafting system, nested hazard authoring allowed under Gathering Tasks.
- [x] Decide whether d100 is a new `resolutionMode` or a gathering-only routed subtype: `resolutionMode: "d100"` for reusable gathering-native tasks, while routed/progressive remain compatibility modes.
- [x] Decide global condition persistence location and provider contract: dedicated gathering config world setting, manual mode first, provider integration deferred.
- [x] Decide minimum chat output scope for first end-to-end implementation: no mandatory chat output in this slice; persist chat ids/evidence only when later chat creation is enabled.
- [x] Confirm no new npm dependency is required.
- [ ] Confirm screenshot harness: Vite/happy-dom where sufficient, Foundry Playwright where runtime or pointer behavior requires it.

## Implementation Plan

- [x] Add reusable gathering task library normalization, validation, persistence, clone/delete, usage lookup, and backward-compatible inline-task handling.
- [x] Add reusable gathering hazard library normalization, validation, persistence, clone/delete, usage lookup, and player-safe redaction helpers.
- [x] Add global gathering condition state and environment inheritance/override resolution.
- [x] Add d100 gathering resolution validation and runtime resolver with deterministic tests for drop-row and hazard selection.
- [x] Wire task placements into environment listing/start without breaking legacy embedded tasks.
- [x] Extend start/list guard output with paused-game listing blockers.
- [ ] Extend rich attempt evidence with condition source, reusable task ids, d100 roll/drop-row, hazard outcome, and chat ids where applicable.
- [ ] Add hazard resolution hooks/API surface with integration error isolation.
- [ ] Add chat message creation after accepted/persisted gathering lifecycle transitions.
- [ ] Add GM APIs for task library, hazard library, global condition update, manual restock/recharge, stamina adjustment, and blind reveal/reset where missing.
- [ ] Promote Manager V2 `Environments`, `Gathering Tasks`, and `Gathering Settings` routes from placeholders/deferred views to feature-gated routes.
- [x] Build Manager V2 Environments composition UI for attaching reusable tasks, editing first-row d100 drop data, global condition controls, and hazard links.
- [ ] Build Manager V2 Tasks UI for reusable task authoring, d100 drop rows, result references, catalysts, economy defaults, visibility, hazards, and usage evidence.
- [ ] Build Manager V2 Settings UI for global weather/time, economy defaults, stamina defaults, d100 drop-row templates, chat settings, and developer/API evidence.
- [ ] Extend Player Gathering app display for global/environment conditions, reusable task evidence, d100 drop rows where safe, hazard/risk evidence, paused blocker, active runs, history, and chat/log links.
- [ ] Preserve blind redaction across listings, start responses, active runs, history, chat, hazards, d100 drop rows, blockers, and provider diagnostics.
- [x] Add localization for all new labels, validation messages, blockers, tooltips, and chat/log text.
- [x] Add CSS using existing flat Manager V2 and gathering app patterns.

## Test Plan

- [x] Unit tests for reusable task normalization, validation, duplicate/delete, usage evidence, and legacy inline-task compatibility.
- [ ] Unit tests for definition-vs-placement ID matching, override precedence, linked-definition edits propagating to multiple environments, stale/deleted definition handling, and preserving active run references.
- [x] Unit tests for hazard normalization, validation, resolution, redaction, and usage evidence.
- [x] Unit tests for global condition inheritance, overrides, provider diagnostics, and attempt snapshots.
- [x] Unit tests for d100 drop-row validation: dropRate bounds, item/component references, quantities, disabled rows, selection modes, hazard dropRate, and result references.
- [x] Unit tests for d100 runtime resolution and history-before-side-effects ordering.
- [ ] Unit tests for d100 item reference matching after placement overrides, missing/disabled/cross-system hazard references, modifier behavior, deterministic hazard selection, macro/table failure isolation, and redaction-safe history/chat evidence.
- [x] Unit tests for paused-game listing blocker and paused start rejection side-effect safety.
- [ ] Unit tests for node/stamina/attempt/hazard/chat evidence on immediate and timed attempts.
- [x] Store tests for Manager V2 route state, selected-system feature gates, task/hazard/settings actions, dirty state, and validation summaries.
- [x] Mounted/source-contract tests for Manager V2 Environments, Tasks, and Settings routes.
- [x] Mounted/source-contract tests for Player Gathering app paused state, blind redaction, d100/hazard evidence, and narrow layout.
- [x] Mounted/store tests for player region, biome, risk/status, availability, paused, and blind-redaction filter combinations; weather/time must be displayed as evidence, not filters.
- [ ] Live browser pointer hit-tests where feasible for Manager V2 nav, task attach rows, menus, disabled controls, and manual GM controls.
- [x] Run `npm test`.
- [x] Run `npm run build`.

## Screenshot Gates

- [ ] Capture Manager V2 Environments desktop screenshot proving environment composition, attached reusable tasks, global-condition inheritance, node/restock controls, and validation.
- [ ] Capture Manager V2 Tasks desktop screenshot proving reusable task list, d100 drop-row editor, hazard drop-rate controls, and result evidence.
- [ ] Capture Manager V2 Settings desktop screenshot proving global weather/time, stamina defaults, d100 drop-row defaults, chat settings, and developer/API section.
- [ ] Capture Player Gathering desktop screenshot proving first visible state, environment browser, selected environment, conditions, hazard/risk chips, task list, and start controls.
- [ ] Capture Player Gathering paused-state screenshot proving blocker visibility and disabled start actions.
- [ ] Capture Player Gathering blind-state screenshot proving generic action and redacted task/hazard/result evidence.
- [ ] Capture narrow Manager V2 screenshot around 720px wide proving stacked layout without clipping.
- [ ] Capture narrow Player Gathering screenshot around 560px wide proving scroll containment and reachable controls.

## Documentation Loop

- [x] `fabricate_domain_expert` updates canonical specs for reusable tasks, hazards, global conditions, d100 resolution, paused blocker, Manager V2 routes, and player app behavior.
- [x] `fabricate_docs_writer` updates JSDoc and docs surfaces affected by public APIs, hooks, settings, and user workflows.
- [ ] Domain expert reviews docs-writer output.
- [ ] Docs writer reviews domain/spec output.
- [ ] Iterate until both emit `DOCS APPROVED`, up to 3 iterations.

## Review Gates

- [ ] Implementation review loop with `fabricate_reviewer`, `fabricate_ux_designer`, and `fabricate_quality_engineer`.
- [ ] Resolve `NEEDS_CHANGES` findings up to 3 implementation revisions.
- [ ] Stop and escalate on any `BLOCKED` verdict.

## Plan Risks

- Reusable task placements may collide with existing environment-embedded task IDs and active run references unless placement IDs and definition IDs are kept distinct.
- Global condition state can create confusing precedence unless inheritance/override UI is explicit.
- d100 drop-row resolution may overlap with routed/progressive result authoring; the implementation needs a clear validation and display boundary.
- Hazard output can leak hidden blind-task information if redaction is not centralized.
- Chat messages must be created only after state transitions are persisted enough to avoid announcing failed commits.
- Manager V2 route promotion touches nav, routing, store state, CSS, localization, and tests, so UI review and pointer hit-tests are required.

## Loop Accounting

- Plan loop iterations completed: 0 review iterations so far; docs drafted by orchestrator and ready for plan review.
- Implementation loop iterations completed: 0; implementation has not started for this end-to-end plan.
- Documentation loop iterations completed: 0; docs loop is deferred until implementation diff exists.
