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

- [ ] Decide whether this ships as one large feature or staged slices: environment metadata first, node/respawn second, stamina third, risk/encounters fourth.
- [ ] Decide whether region/biome values are free-text, system-owned vocabularies, or world-owned vocabularies for the first implementation.
- [ ] Decide whether stamina uses Fabricate actor flags by default, game-system provider resources by default, or a selectable provider model.
- [ ] Decide rollback semantics for stamina spend and node depletion when an accepted attempt fails during history/result/catalyst commit.
- [ ] Decide whether condition state is environment-local, globally inherited, or integration-driven.
- [ ] Decide stable public hook names and API method names before implementation.
- [ ] Decide default blind task-selection strategies and reveal scopes for first implementation.
- [ ] Decide chat message event defaults and whether they are system-level, environment-level, or task-level settings.
- [ ] Add migration/defaulting plan before editing production data models.

## Future Implementation Plan

- [ ] Extend gathering environment normalization and validation with additive fields for region, biome, image, conditions, risk, economy, node availability, respawn, encounter hooks, and stamina cost.
- [ ] Add runtime services for node availability, depletion, manual restock, world-time respawn evaluation, and persisted respawn rolls.
- [ ] Add runtime services for attempt limits, time-window counters, probabilistic recharge, manual recharge, and persisted recharge rolls.
- [ ] Add runtime services for stamina balance, spend, regeneration mode, manual set/add/subtract, provider/system formula evaluation, and regeneration history.
- [ ] Add runtime services for blind multi-task selection, progressive reveal, reveal scopes, manual reveal, and reset/revoke reveal.
- [ ] Add public APIs and hook dispatch for rich gathering listing, guards, modifiers, stamina, nodes, attempt limits, encounters, chat, and blind reveal.
- [ ] Extend `listGatheringForActor` to return player-safe environment metadata, region/biome filters, condition summaries, risk summaries, node availability, attempt-limit blockers, stamina blockers, revealed blind tasks, generic blind actions, and hidden-task redaction.
- [ ] Extend `startGatheringAttempt` guard order to include attempt limits, stamina, node availability, risk/encounter hooks, condition modifiers, and chat output.
- [ ] Extend active/history gathering run records with economy evidence: stamina spent, node consumed/restored, attempt counter/recharge state, condition snapshot, risk level, encounter outcome, chat message ids where relevant, reveal events, and redaction-safe display data.
- [ ] Build GM manager-v2 rich environment browse/edit surfaces with region/biome/risk/condition filters, task node controls, respawn policy controls, attempt-limit controls, blind reveal controls, expression/macro provider controls, manual restock, encounter table configuration, chat settings, developer/API evidence, and stamina economy settings.
- [ ] Build Actor Gathering app redesign with environment browser, task list, detail/evidence panel, stamina summary, active/log tabs, and narrow responsive layout.
- [ ] Add localization for all new labels, states, validation messages, tooltips, and hidden/redacted copy.
- [ ] Add unit tests for node respawn, manual restock, probabilistic persistence, attempt limits/recharge, stamina spend/manual set/regeneration, expression/macro providers, condition modifiers, blind reveal, risk hooks, encounter hooks, chat output, API permission enforcement, hook isolation, and hidden-task redaction.
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
