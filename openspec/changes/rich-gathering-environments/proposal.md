# Proposal: Rich Gathering Environments End To End

## Summary

Complete rich gathering environments as an end-to-end feature. GMs author reusable gathering tasks and hazards, compose them into environment locations, set global gathering conditions such as weather and time, and expose a gathering-native player workflow that resolves attempts through d100 item drop rows and matched hazard drop-rate rolls while preserving existing routed/progressive gathering compatibility.

The current codebase already contains a first rich-gathering slice: additive environment metadata, node/stamina/attempt evidence, Manager V2 environment editing, and the Player Gathering app shell. This change plans the remaining production work needed to make the feature cohesive, reusable, and shippable.

No GitHub issue number was supplied for this planning pass.

## Motivation

The existing gathering model supports environment-owned tasks and the current first rich slice adds place metadata and some economy evidence. It still leaves several gaps for actual GM use:

- Gathering tasks are embedded inside environments, so a GM cannot maintain a reusable task library and place the same forage, mine, scavenge, or harvest task in multiple environments.
- Hazards are described only as failure or encounter-adjacent data, not reusable authored records that can be attached to environments or tasks.
- Weather and time are environment-local fields, while the requested workflow needs global gathering conditions that can be inherited by many environments and overridden where needed.
- Resolution still behaves like generic routed/progressive crafting resolution. The requested gathering experience needs a d100-native outcome model with ordered item drop rows, item selection modes, matched hazard rolls, hazard policies, and empty-handed outcomes.
- Player attempts are rejected when the game is paused, but the Player Gathering app needs a clear paused-game blocker before the player reaches an attempt failure.
- Manager V2 needs complete Environments, Tasks, and Settings surfaces for authoring and operating the feature.
- The player app needs to display environment conditions, reusable task evidence, hazards, d100 drop evidence, blockers, active attempts, and logs without leaking hidden blind-task data.

## Goals

- Add a reusable GM-authored gathering task library scoped to a crafting system.
- Add a reusable GM-authored gathering hazard library scoped to a crafting system.
- Allow environments to compose reusable task definitions with per-environment overrides for availability, conditions, hazard weights, node counts, stamina, attempt limits, and result tuning.
- Define global gathering conditions for weather and time, with environment override/inheritance semantics.
- Add a gathering-native d100 resolution mode that does not require GMs to model gathering outcomes as generic routed result-group names.
- Preserve legacy routed/progressive gathering tasks and the existing immediate/timed lifecycle.
- Surface a player-safe paused-game blocker in listing state and the Player Gathering app.
- Promote Manager V2 feature routes for Environments, Tasks, and Gathering Settings with feature-gated navigation, route normalization, breadcrumbs, focused components, localization, CSS, and tests.
- Display rich environment/task/hazard/condition evidence in the Player Gathering app with blind redaction.
- Define screenshot acceptance criteria before implementation.
- Keep the implementation system-agnostic and Foundry V13-compatible.

## Non-Goals

- Do not add standalone harvesting. Harvesting remains recipe or salvage data.
- Do not build travel maps, hex crawls, pathfinding, or a calendar/weather simulation engine.
- Do not hardcode dnd5e, pf2e, or other system-specific formulas in Fabricate core.
- Do not replace existing routed/progressive gathering resolution.
- Do not require environments to be linked to scenes.
- Do not expose hidden blind-task names, results, hazards, or provider diagnostics to non-GM users.
- Do not add npm dependencies unless a later implementation plan revision explains the need.

## Scope

In scope for implementation planning:

- OpenSpec change docs under `openspec/changes/rich-gathering-environments/`.
- Canonical spec updates during the docs/domain loop after implementation.
- Gathering domain model extensions under future `src/systems/` work.
- Manager V2 Environments, Tasks, and Gathering Settings routes.
- Player Gathering app display and blocker behavior.
- Localization and style updates required by those UI changes.
- Unit, store, mounted/component, build, and screenshot validation.

Out of scope for this planning pass:

- Production code edits.
- Runtime documentation edits.
- Data migrations that rewrite existing saved environments eagerly.
- Compatibility metadata changes unless implementation introduces new Foundry API requirements.

## Existing Baseline

The repo currently has:

- `GatheringEnvironmentStore` normalization and validation for rich environment fields, node config, attempt limits, blind selection, reveal config, encounter config, chat settings, risk, economy mode, and conditions.
- `GatheringRichStateService` for actor stamina state, node restock, environment condition updates, blind reveal state, and rich attempt evidence.
- `GatheringEngine` listing/start flow with pause, scene/token, visibility, catalyst, rich node/stamina/attempt blockers, immediate/timed resolution, and blind redaction.
- Manager V2 environment browser/edit views.
- Player Gathering app search/filter/detail/log shell with stamina and condition evidence.

This plan treats those as a first slice, not as complete end-to-end delivery.

## Affected Future Surfaces

Expected production implementation surfaces:

- `src/systems/GatheringEnvironmentStore.js`
- `src/systems/GatheringEngine.js`
- `src/systems/GatheringRichStateService.js`
- new or focused `src/systems/` modules for task library, hazard library, condition state, and d100 resolution
- `src/gatheringBootstrapAdapters.js`
- `src/main.js`
- `src/ui/SvelteCraftingSystemManagerV2App.svelte.js`
- `src/ui/SvelteGatheringApp.svelte.js`
- `src/ui/svelte/apps/manager-v2/`
- `src/ui/svelte/apps/GatheringAppRoot.svelte`
- `src/ui/svelte/stores/adminStore.js`
- `src/ui/svelte/stores/gatheringStore.js`
- `styles/fabricate.css`
- `lang/en.json`
- focused tests under `tests/`

## Resolved Agent Roster

Routing table results for this change:

- Planning: `fabricate_orchestrator`
- Plan review: `fabricate_domain_expert`, `fabricate_ux_designer`, `fabricate_quality_engineer`
- Implementation: `fabricate_implementer`
- Post-implementation review: `fabricate_reviewer`, `fabricate_ux_designer`, `fabricate_quality_engineer`
- Documentation loop: `fabricate_domain_expert`, `fabricate_docs_writer`

The `javascript-structural-design` skill is required because implementation will introduce or reshape JavaScript module boundaries for reusable task/hazard libraries, global condition state, d100 resolution, and runtime collaborator wiring.

## Acceptance Criteria

- GMs can create reusable gathering tasks and hazards, then attach them to multiple environments with per-environment overrides.
- Global weather/time conditions affect listing and attempts according to configured inheritance/override rules.
- d100 gathering resolution supports ordered item drop rows, `highestRankedDrop` and `allDrops` selection, matched hazard rolls, success-with-hazard and failure-with-hazard policies, empty-handed outcomes, and player-safe result summaries.
- Player listing and start actions show a paused-game blocker without committing any start side effects.
- Manager V2 exposes Environments, Tasks, and Gathering Settings routes as real feature-gated routes.
- The Player Gathering app shows rich environment/task/hazard/condition evidence and logs while preserving blind redaction.
- Existing routed/progressive gathering environments still load and resolve.
- Unit, mounted/component, build, and screenshot gates pass before implementation review.
