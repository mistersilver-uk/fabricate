# Tasks

## OpenSpec And Review

- [x] Run plan-review with `fabricate_domain_expert`, `fabricate_ux_designer`, and `fabricate_quality_engineer`.
- [x] Revise `proposal.md`, `design.md`, and spec deltas until every plan reviewer approves.
- [ ] Confirm the first implementation slice scope before code changes begin.

## Phase 1 - Manual Regions And Parties

- [ ] Add `GatheringRegion` normalization, validation, persistence, import/export support, and stale-reference handling.
- [ ] Add `GatheringParty` normalization, validation, persistence, import/export support, and stale actor/token repair evidence.
- [ ] Enforce exactly one travel token per enabled party and one enabled party per travel token.
- [ ] Enforce one enabled party per actor member and preserve existing blind-task `revealScope: "party"` semantics.
- [ ] Add per-system `GatheringRegionSettings` with `revealMode` defaulting to `manual` and modifier visibility defaulting to visible.
- [ ] Add actor-flag helpers for discovered gathering regions keyed by crafting system.
- [ ] Add current-region resolver with GM manual override precedence and no token automation requirement.
- [ ] Add environment availability evaluation by included/excluded region ids and included/excluded biome ids.
- [ ] Define and test exclusion-only availability as global except matching excluded current regions/biomes.
- [ ] Preserve existing environment `region` / `biomes` metadata as compatibility data.
- [ ] Add redaction-safe unavailable travel guidance for known, secret, and undiscovered regions.
- [ ] Re-evaluate location availability in start-attempt guards so stale listing state cannot start invalid location-gated attempts.
- [ ] Unit tests: region normalization, party/token uniqueness, actor membership uniqueness, stale references, discovery flags, region settings defaults, manual override precedence, availability inclusion/exclusion, exclusion-only behavior, start-guard revalidation, secret destination redaction, no secret name/id DOM leakage, and compatibility with ungated legacy environments.

## Phase 2 - GM And Player UI

- [ ] Add a GM Region management surface under the selected system's Gathering area.
- [ ] Add a `Travel` route under the selected system's Gathering submenu for party management and selected-system current-region override evidence.
- [ ] Add region editor controls for name, description, image, enabled state, secret state, biomes, ordering, and future Scene Region mapping evidence.
- [ ] Add environment editor controls for included regions, included biomes, explicit excluded regions, and explicit excluded biomes.
- [ ] Add low-burden setup cards/checklists for create region, optionally gate environments, create party, assign token, and set current region.
- [ ] Add a GM Travel management surface for actor membership and placed travel-token assignment.
- [ ] Add current-region override controls per party and selected gathering system.
- [ ] Add accessible picker alternatives, keyboard remove/repair/reveal/hide actions, inline duplicate-token/duplicate-actor errors, and focus preservation.
- [ ] Show players their selected actor's party, current region, current-region source, and unavailable travel guidance.
- [ ] Show undiscovered placeholders for secret regions without leaking secret names.
- [ ] Add narrow app-width wrapping/stacking behavior for Region, Travel, environment availability, current-region chips, and multi-destination guidance.
- [ ] Component tests for region editor, environment availability controls, Travel setup keyboard flows, party assignment, duplicate actor/token errors, override controls, redaction-safe DOM output, and player guidance.

## Phase 3 - Scene Region Automation

- [ ] Add Fabricate mapping support between `GatheringRegion` records and Foundry V13 Scene Region document UUIDs.
- [ ] Add runtime listener/service for party travel token movement through mapped Scene Regions.
- [ ] Resolve overlapping mapped Scene Regions by merging all matching Fabricate regions for the active crafting system.
- [ ] Update party current-region evidence and actor discovery when automation is enabled.
- [ ] Add GM controls for reveal mode: manual only, reveal on party token entry, or always visible.
- [ ] Unit/integration tests for mapped Scene Region resolution, overlap merging, entry discovery, stale mapping handling, and manual override precedence over token automation.

## Phase 4 - Region Modifiers

- [ ] Add modifier normalization and validation for supported modifier kinds and operations.
- [ ] Apply region modifiers during player listing and immediate attempt resolution without rewriting source records.
- [ ] Snapshot current region ids and modifier evidence on gathering run start.
- [ ] Define and implement timed-run behavior for start-time vs completion-time location evidence.
- [ ] Add player/GM modifier visibility setting, defaulting to visible.
- [ ] Tests for hazard chance, drop rate, yield/difficulty where implemented, clamping, stacking, hidden modifier redaction, and history snapshot stability.

## Validation Gates

- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] For UI-changing implementation slices, run screenshot planning, local Foundry smoke capture, screenshot publishing, and screenshot cleanup per `docs/agents/ui-pr-screenshots.md`.
- [ ] Run implementation review with reviewer, UX, and quality coverage.

## Docs Loop

- [ ] Update canonical specs after implementation if the approved design changes.
- [ ] Update `DOMAIN.md` with Region, Biome, Environment, Party, and discovery boundaries.
- [ ] Update user docs for Regions, Parties, current-region override, secret discovery, and Scene Region automation.
- [ ] Update JSDoc/public API docs for new gathering region, party, discovery, and current-location services.
