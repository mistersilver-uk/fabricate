# Proposal: Rich Gathering Environments

## Summary

Expand Fabricate gathering from a thin environment/task wrapper into a richer fantasy-facing subsystem for places, resource nodes, environmental conditions, risk, and actor stamina. The new direction is informed by the Actor Gathering App reference at `openspec/changes/fabricate-ui-design-system-manager-v2/references/Actor Gathering App.png`.

This is planning and specification work only. It does not edit production UI code.

## Motivation

The current gathering model is intentionally narrow: an environment can be scene-gated and contains targeted or blind tasks, each task resolves through routed or progressive result logic. That is functional, but it still feels close to roll-table execution with a scene check.

The new design pushes gathering toward a more engaging game-world activity:

- Environments are places players can browse and search, not merely scene links.
- Regions and biomes make gathering feel grounded in the campaign world.
- Resource nodes let GMs control availability, counts, depletion, and respawn.
- Time of day and weather can modify yields and availability.
- Risk levels and encounter tables let gathering carry tension.
- Stamina-based gathering can replace or augment time/node respawn loops for groups that want faster expedition gameplay.
- Blind environments can contain multiple hidden tasks and optionally reveal those tasks through play.
- Public hooks, APIs, and chat output make gathering extensible for system and module developers.

## Goals

- Define rich `GatheringEnvironment` extensions for region, biome, imagery, risk, optional scene linkage, time of day, weather, and player-facing search/filter metadata.
- Define resource-node semantics for gathering tasks: node counts, availability, depletion, respawn policies, manual GM restock, and probabilistic world-time restock.
- Define condition modifiers for time of day and weather that can alter task availability, yield, risk, stamina cost, or difficulty without hardcoding a game system.
- Define encounter/risk hooks for gathering attempts without turning Fabricate into a full travel simulator.
- Define optional stamina-based gathering as a system-level gathering economy that can be used instead of, or alongside, world-time task duration and node respawn.
- Define natural dnd5e/pf2e expression support and macro alternatives for checks, modifiers, stamina, and recharge rules.
- Define manual-only and automatic stamina regeneration modes plus GM controls for manually setting gathering stamina.
- Define blind environment support for multiple hidden tasks and progressive task reveal.
- Define task attempt limits with time windows, probabilistic recharge, manual recharge, or hybrid recharge.
- Define rich developer hooks, programming interfaces, and chat message output for gathering attempts.
- Define GM app surfaces for authoring and controlling environments, regions, nodes, weather/time, risk, encounters, and manual restock.
- Define Actor Gathering app surfaces for browsing environments, selecting tasks, viewing stamina, seeing risk/conditions, starting attempts, and reviewing logs.
- Preserve the existing gathering lifecycle until this change is implemented; current fields remain backward-compatible inputs.

## Non-Goals

- Do not introduce a standalone harvesting subsystem. Harvesting remains recipe or salvage data.
- Do not add hardcoded dnd5e, pf2e, or other system-specific stamina formulas in core.
- Do not require environments to be linked to Foundry scenes.
- Do not implement hex maps, travel pathfinding, random overland navigation, or campaign calendar replacement.
- Do not expose hidden blind-task details to non-GM users.
- Do not make encounter generation mandatory for gathering.
- Do not make automatic stamina regeneration mandatory.
- Do not require blind environments to reveal tasks; progressive reveal is optional.

## Scope

In scope:

- `openspec/changes/rich-gathering-environments/`
- Gathering domain deltas for environment metadata, nodes, respawn, conditions, risk, encounters, and stamina.
- UI deltas for GM gathering environment management and the Actor Gathering app.
- Implementation planning and validation criteria for a future feature slice.

Out of scope:

- Production `src/`, `styles/`, `tests/`, `lang/`, and docs changes.
- Data migrations.
- Foundry compatibility metadata changes.

## Affected Future Surfaces

Future implementation is expected to touch:

- `openspec/specs/gathering-and-harvesting/spec.md`
- `openspec/specs/ui-integration/spec.md`
- `src/systems/` gathering runtime and stores
- `src/ui/svelte/apps/manager-v2/` environment browse/edit views
- `src/ui/svelte/apps/` Actor Gathering app components
- `src/ui/svelte/stores/` gathering and admin store derivations
- `lang/en.json`
- `styles/fabricate.css`
- unit, mounted, and Foundry screenshot tests

## Acceptance Criteria

- The delta spec defines the new domain concepts without ambiguity about what is optional, what is system-owned, and what is runtime-owned.
- The GM app requirements explain how GMs author regions, conditions, nodes, respawn, risk, encounter tables, and stamina mode.
- The Actor Gathering app requirements explain how players browse environments and tasks while respecting visibility, risk, stamina, node availability, and hidden blind-task rules.
- The delta includes developer-facing hooks/APIs and chat message requirements for gathering attempts.
- The design preserves existing gathering behavior for legacy environments until migration or defaults are explicitly implemented.
