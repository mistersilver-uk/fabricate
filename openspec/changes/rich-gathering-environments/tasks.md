# Tasks

## Planning

- [x] Review the Actor Gathering App reference image.
- [x] Read canonical gathering, player gathering UI, and actor flag specs.
- [x] Create a separate OpenSpec change for rich gathering rather than modifying the manager-v2 visual-only change.
- [x] Record keep/change/discard review notes for the Actor Gathering App reference.
- [x] Define domain deltas for regions, biomes, conditions, nodes, respawn, risk, encounters, and stamina.
- [x] Define UI deltas for GM environment management and the Actor Gathering app.
- [x] Add natural dnd5e/pf2e expressions and custom macro alternatives for rich gathering formulas.
- [x] Add manual-only and automatic stamina regeneration controls plus GM manual stamina setting.
- [x] Add multi-task blind environments with optional progressive reveal.
- [x] Add task attempt limits with time windows, probabilistic recharge, manual recharge, and hybrid recharge.
- [x] Add developer hooks/API and gathering chat message requirements.

## Implementation Entry Criteria

- [x] Decide whether this ships as one large feature or staged slices: staged phases, with core API/runtime first, Manager V2 GM UI second, and Actor Gathering app third.
- [x] Decide whether region/biome values are free-text, system-owned vocabularies, or world-owned vocabularies for the first implementation: environment-local strings first.
- [x] Decide whether stamina uses Fabricate actor flags by default, game-system provider resources by default, or a selectable provider model: selectable provider model, defaulting to Fabricate actor flags when stamina is enabled and no external provider is configured.
- [x] Decide rollback semantics for stamina spend and node depletion when an accepted attempt fails during history/result/catalyst commit: no irreversible stamina/node/result/catalyst side effect may occur before terminal history persists; failed post-history commits must leave auditable evidence and avoid result/catalyst side effects.
- [x] Decide whether condition state is environment-local, globally inherited, or integration-driven: environment-local first, with provider/integration hooks reserved.
- [x] Decide stable public hook names and API method names before implementation: use `fabricate.gathering.*` hook names and add narrow `game.fabricate` rich gathering methods for GM state, node restock, attempt recharge, stamina adjustment, condition update, and blind reveal.
- [x] Decide default blind task-selection strategies and reveal scopes for first implementation: default unrevealed selection is first available task; reveal scope defaults to actor when progressive reveal is enabled.
- [x] Decide chat message event defaults and whether they are system-level, environment-level, or task-level settings: disabled unless explicitly enabled at environment/task event settings.
- [x] Add migration/defaulting plan before editing production data models: additive normalization only; legacy environments are not rewritten until saved and load with neutral defaults.

## Current Implementation Progress

- [x] Implemented the first core API/runtime slice: additive rich environment/task normalization, player-safe listing metadata, blocker evaluation for node availability/stamina/attempt limits, rich run evidence persistence, GM state APIs, and `fabricate.gathering.*` hook dispatch points.
- [x] Implemented the first Manager V2 GM UI slice: rich environment metadata fields, condition fields, task economy controls, and environment risk/region/biome filters.
- [x] Implemented the first Player Gathering app slice: environment search/filtering, environment imagery/region/biome/risk/condition display, stamina summary display, and task economy evidence.
- [x] Added focused unit/component coverage for additive rich metadata normalization, blind multi-task validation, rich blocker ordering, existing listing/start/finish compatibility, bootstrap API exposure, and affected app contracts.

## Future Implementation Plan

- [x] Extend gathering environment normalization and validation with additive fields for region, biome, image, conditions, risk, economy, node availability, respawn, encounter hooks, and stamina cost.
- [ ] Complete runtime services for elapsed/probabilistic node respawn evaluation and persisted respawn rolls.
- [ ] Complete runtime services for time-window attempt counters, probabilistic recharge, manual recharge UX/API, and persisted recharge rolls.
- [ ] Complete runtime services for stamina regeneration modes, external provider/system formula evaluation, and regeneration history.
- [x] Add runtime services for blind multi-task selection, progressive reveal, reveal scopes, manual reveal, and reset/revoke reveal.
- [x] Add first-slice public APIs and hook dispatch for rich gathering listing, guards, stamina, nodes, attempt limits, conditions, and blind reveal.
- [ ] Complete public APIs and hook dispatch for condition modifiers, encounters, chat output, provider formula evaluation, and advanced recharge/respawn events.
- [x] Extend `listGatheringForActor` to return player-safe environment metadata, region/biome filters, condition summaries, risk summaries, node availability, attempt-limit blockers, stamina blockers, revealed blind tasks, generic blind actions, and hidden-task redaction.
- [x] Extend `startGatheringAttempt` guard order to include attempt limits, stamina, node availability, rich evidence capture, and commit-after-history ordering.
- [ ] Complete `startGatheringAttempt` integrations for encounter hooks, condition modifiers, and chat output.
- [x] Extend active/history gathering run records with economy evidence: stamina spent, node consumed/restored, attempt counter/recharge state, condition snapshot, risk level, encounter outcome, chat message ids where relevant, reveal events, and redaction-safe display data.
- [x] Build first-slice GM manager-v2 rich environment browse/edit surfaces with region/biome/risk/condition filters, task node controls, respawn policy controls, attempt-limit controls, and stamina economy settings.
- [ ] Complete GM manager-v2 rich controls for blind reveal operations, expression/macro providers, manual restock/recharge flows, encounter table configuration, chat settings, and developer/API evidence.
- [x] Build first-slice Actor Gathering app redesign with environment browser, task list, stamina summary, rich evidence chips, and narrow responsive layout.
- [ ] Complete Actor Gathering detail/evidence panel polish and active/log tab rich evidence display.
- [x] Add localization for all new labels, states, validation messages, tooltips, and hidden/redacted copy.
- [x] Add first-slice unit tests for rich normalization, node/stamina/attempt blockers, bootstrap APIs, listing compatibility, and hidden-task redaction compatibility.
- [ ] Add remaining unit tests for elapsed/probabilistic node respawn, manual restock UX/API, probabilistic persistence, attempt recharge, stamina regeneration/provider formulas, condition modifiers, encounter hooks, chat output, API permission edge cases, and hook isolation.
- [ ] Add mounted tests for GM rich environment editor and Actor Gathering app.
- [ ] Add Foundry Playwright smoke tests and screenshots for GM rich environment editing and Actor Gathering normal/narrow states.

## Scope Decisions

- [ ] Do not introduce standalone harvesting; keep harvesting as recipe or salvage.
- [ ] Do not require scene links for environments.
- [ ] Do not hardcode weather, time, or stamina formulas for specific game systems in core.
- [ ] Do not expose blind task identity or hidden result metadata to non-GM users.
- [ ] Do not make encounter automation mandatory.
- [ ] Do not make automatic stamina regeneration mandatory.
- [ ] Do not require blind environments to progressively reveal tasks.

## Verification For This Planning Change

- [x] `git diff --check -- openspec/changes/rich-gathering-environments`
- [x] Manual review of this change against `openspec/specs/gathering-and-harvesting/spec.md` and `openspec/specs/ui-integration/spec.md`.
