# Tasks

## Planning

- [x] Review the Actor Gathering App reference image.
- [x] Read canonical gathering, player gathering UI, and actor flag specs.
- [x] Create a separate OpenSpec change for rich gathering rather than modifying the manager-v2 visual-only change.
- [x] Record keep/change/discard review notes for the Actor Gathering App reference.
- [x] Define domain deltas for regions, biomes, conditions, nodes, respawn, risk, encounters, and stamina.
- [x] Define UI deltas for GM environment management and the Actor Gathering app.

## Implementation Entry Criteria

- [ ] Decide whether this ships as one large feature or staged slices: environment metadata first, node/respawn second, stamina third, risk/encounters fourth.
- [ ] Decide whether region/biome values are free-text, system-owned vocabularies, or world-owned vocabularies for the first implementation.
- [ ] Decide whether stamina uses Fabricate actor flags by default, game-system provider resources by default, or a selectable provider model.
- [ ] Decide rollback semantics for stamina spend and node depletion when an accepted attempt fails during history/result/catalyst commit.
- [ ] Decide whether condition state is environment-local, globally inherited, or integration-driven.
- [ ] Add migration/defaulting plan before editing production data models.

## Future Implementation Plan

- [ ] Extend gathering environment normalization and validation with additive fields for region, biome, image, conditions, risk, economy, node availability, respawn, encounter hooks, and stamina cost.
- [ ] Add runtime services for node availability, depletion, manual restock, world-time respawn evaluation, and persisted respawn rolls.
- [ ] Add runtime services for stamina balance, spend, regeneration, manual adjustment, and provider/system formula evaluation.
- [ ] Extend `listGatheringForActor` to return player-safe environment metadata, region/biome filters, condition summaries, risk summaries, node availability, stamina blockers, and hidden-task redaction.
- [ ] Extend `startGatheringAttempt` guard order to include stamina, node availability, risk/encounter hooks, and condition modifiers.
- [ ] Extend active/history gathering run records with economy evidence: stamina spent, node consumed/restored, condition snapshot, risk level, encounter outcome, and redaction-safe display data.
- [ ] Build GM manager-v2 rich environment browse/edit surfaces with region/biome/risk/condition filters, task node controls, respawn policy controls, manual restock, encounter table configuration, and stamina economy settings.
- [ ] Build Actor Gathering app redesign with environment browser, task list, detail/evidence panel, stamina summary, active/log tabs, and narrow responsive layout.
- [ ] Add localization for all new labels, states, validation messages, tooltips, and hidden/redacted copy.
- [ ] Add unit tests for node respawn, manual restock, probabilistic persistence, stamina spend/regeneration, condition modifiers, risk hooks, encounter hooks, and hidden-task redaction.
- [ ] Add mounted tests for GM rich environment editor and Actor Gathering app.
- [ ] Add Foundry Playwright smoke tests and screenshots for GM rich environment editing and Actor Gathering normal/narrow states.

## Scope Decisions

- [ ] Do not introduce standalone harvesting; keep harvesting as recipe or salvage.
- [ ] Do not require scene links for environments.
- [ ] Do not hardcode weather, time, or stamina formulas for specific game systems in core.
- [ ] Do not expose blind task identity or hidden result metadata to non-GM users.
- [ ] Do not make encounter automation mandatory.

## Verification For This Planning Change

- [x] `git diff --check -- openspec/changes/rich-gathering-environments`
- [x] Manual review of this change against `openspec/specs/gathering-and-harvesting/spec.md` and `openspec/specs/ui-integration/spec.md`.
