# Tasks

## OpenSpec And Review

- [x] Run plan-review with `fabricate_domain_expert`, `fabricate_ux_designer`, and `fabricate_quality_engineer`.
- [x] Revise `proposal.md`, `design.md`, and spec deltas until every plan reviewer approves.
- [x] Confirm the first implementation slice scope before code changes begin. Confirmed slice (#257): all of Phase 1, plus the Phase 2 `Travel` route (party management with travel-actor assignment and current-region overrides) and a minimal name-only region quick list inside the Travel route. The full Region editor route, environment availability editor controls, region discovery controls, and the player travel view remain Phase 2 follow-ups. The party travel slot is a **travel actor UUID** (`travelActorUuid`) — the actor that represents the party on a campaign map — not a placed token UUID.

## Phase 1 - Manual Regions And Parties

- [x] Add `GatheringRegion` normalization, validation, persistence, import/export support, and stale-reference handling.
- [x] Add `GatheringParty` normalization, validation, world-level persistence, and stale actor repair evidence. Parties are excluded from crafting-system import/export.
- [x] Enforce exactly one travel actor per enabled party and one enabled party per travel actor.
- [x] Enforce one enabled party per actor member and preserve existing blind-task `revealScope: "party"` semantics.
- [x] Add per-system `GatheringRegionSettings` with `revealMode` defaulting to `manual` and modifier visibility defaulting to visible.
- [x] Add actor-flag helpers for discovered gathering regions keyed by crafting system.
- [x] Add current-region resolver with GM manual override precedence and no token automation requirement.
- [x] Add environment availability evaluation by included/excluded region ids and included/excluded biome ids.
- [x] Define and test exclusion-only availability as global except matching excluded current regions/biomes.
- [x] Preserve existing environment `region` / `biomes` metadata as compatibility data.
- [x] Add redaction-safe unavailable travel guidance for known, secret, and undiscovered regions.
- [x] Re-evaluate location availability in start-attempt guards so stale listing state cannot start invalid location-gated attempts.
- [x] Unit tests: region normalization, party/travel-actor uniqueness, actor membership uniqueness, stale references, discovery flags, region settings defaults, manual override precedence, availability inclusion/exclusion, exclusion-only behavior, start-guard revalidation, secret destination redaction, no secret name/id DOM leakage, and compatibility with ungated legacy environments.

## Phase 2 - GM And Player UI

(First slice #257 ships only the `Travel` route and its name-only region quick list. The remaining Phase 2 items are follow-ups and stay unchecked.)

- [ ] Add a GM Region management surface under the selected system's Gathering area.
- [x] Add a `Travel` route under the selected system's Gathering submenu for party management and selected-system current-region override evidence. (Ships in the first slice with #257, including a minimal name-only region quick list.)
- [ ] Add region editor controls for name, description, image, enabled state, secret state, biomes, ordering, and future Scene Region mapping evidence.
- [ ] Add environment editor controls for included regions, included biomes, explicit excluded regions, and explicit excluded biomes.
- [ ] Add low-burden setup cards/checklists for create region, optionally gate environments, create party, assign travel actor, and set current region.
- [x] Add a GM Travel management surface for actor membership and travel-actor assignment.
- [x] Add current-region override controls per party and selected gathering system.
- [x] Add accessible picker alternatives, keyboard remove/repair/reveal/hide actions, inline duplicate-travel-actor/duplicate-actor errors, and focus preservation. (Travel-route scope shipped; reveal/hide actions land with the later Region discovery surface.)
- [ ] Show players their selected actor's party, current region, current-region source, and unavailable travel guidance.
- [ ] Show undiscovered placeholders for secret regions without leaking secret names.
- [x] Add narrow app-width wrapping/stacking behavior for Region, Travel, environment availability, current-region chips, and multi-destination guidance. (Travel route + region quick list shipped; environment-availability/player surfaces follow with their views.)
- [x] Component tests for region editor, environment availability controls, Travel setup keyboard flows, party assignment, duplicate actor/travel-actor errors, override controls, redaction-safe DOM output, and player guidance. (Shipped for the Travel route, party assignment, duplicate-actor/travel-actor errors, override controls, and the admin store; region-editor/environment-availability/player-guidance component tests land with those views.)

## Phase 3 - Scene Region Automation

- [ ] Add Fabricate mapping support between `GatheringRegion` records and Foundry V13 Scene Region document UUIDs.
- [ ] Add runtime listener/service for movement of the travel actor's placed token(s) through mapped Scene Regions.
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

- [x] Run `npm test`.
- [x] Run `npm run build`.
- [ ] For UI-changing implementation slices, run screenshot planning, local Foundry smoke capture, screenshot publishing, and screenshot cleanup per `docs/agents/ui-pr-screenshots.md`.
- [x] Add the Travel route's container selector to the smoke harness layout-stability allow-list (`assertManagerLayoutStable` in `scripts/foundry-test-run.mjs`) and verify manager contract/launch-readiness component tests that enumerate gathering nav items still pass.
- [x] Run implementation review with reviewer, UX, and quality coverage.

## Docs Loop

- [x] Update canonical specs after implementation if the approved design changes. (Folded shipped Phase 1 + Travel-route behavior into `openspec/specs/data-models`, `gathering-and-harvesting`, `ui-integration`, and `overview`; later-phase behavior marked planned/not-yet-shipped.)
- [x] Update `DOMAIN.md` with Region, Biome, Environment, Party, and discovery boundaries.
- [x] Update user docs for Regions, Parties, current-region override, secret discovery, and Scene Region automation. (`docs/gathering-regions.md` added; `docs/api/index.md`, `docs/gathering-environments.md`, `docs/index.md` updated; Scene Region automation documented as a later phase.)
- [x] Update JSDoc/public API docs for new gathering region, party, discovery, and current-location services. (New modules shipped with full JSDoc; `GatheringEngine` class doc extended for the `locationResolver` collaborator.)
