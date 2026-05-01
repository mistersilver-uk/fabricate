# Proposal: Issue #179 Gathering Environments Runtime

## Summary

Implement the canonical gathering environment workflow by adding the missing settings, normalized feature handling, GM environment administration surface, player gathering app entry point, runtime execution flow, and persistence required by `openspec/specs/gathering-and-harvesting/spec.md`.

## Motivation

- The gathering specification is canonical, but runtime code does not register `fabricate.gatheringEnvironments` or `fabricate.lastGatheringActor`.
- `CraftingSystemManager` does not currently normalize `features.gathering`, so systems cannot reliably enable the feature.
- The Items Directory exposes crafting management, but not a gathering entry point gated by enabled gathering systems.
- The Svelte GM admin has no `Environments` tab despite the canonical UI requirement.
- There is no gathering environment persistence, validation, runtime execution, actor-run persistence, or time-gate completion path.

## Scope

- Add settings and normalization needed to persist gathering environments and remember the last gathering actor.
- Add a dedicated gathering environment persistence/validation seam for GM CRUD, duplicate, reorder, and cleanup operations.
- Add a dedicated gathering runtime seam for player listing, attemptability evaluation, start, immediate resolution, timed completion, and actor run history.
- Add a GM system-settings toggle for `features.gathering` and the GM `Environments` admin tab for systems with `features.gathering === true`.
- Add the player-facing gathering app and Items Directory button when at least one system exposes gathering.
- Add focused coverage for model normalization, environment validation, runtime gating, task resolution, persistence, and UI gating.

## Out Of Scope

- Creating a standalone harvesting subsystem.
- Changing ingredient-set, recipe, salvage, or alchemy semantics.
- Adding map authoring, travel simulation, encounters, or hardcoded system-specific skill logic.
- Replacing the existing crafting app shell or merging gathering into the crafting route.
- Adding npm dependencies.

## Spec Notes

This change is primarily an implementation-compliance change against existing canonical specs:

- `openspec/specs/gathering-and-harvesting/spec.md`
- `openspec/specs/ui-integration/spec.md`
- `openspec/specs/overview/spec.md`
- `openspec/specs/data-models/spec.md`

The delta spec in this change folder narrows the implementation handoff by making the required runtime seams and persistence boundaries explicit.

## Affected Surfaces

- `src/config/settings.js` and preference cleanup for the new world/client settings
- `src/systems/` gathering persistence, run persistence, gate/check evaluation, and runtime execution collaborators
- `src/main.js` and `src/ui/appFactory.js` for bootstrap, app registration, and Items Directory wiring
- `src/ui/` and `src/ui/svelte/` for the GM `Environments` tab and dedicated player gathering app
- focused `tests/` coverage for normalization, validation, cleanup, runtime resolution, and UI gating

## Implementation Split

Recommended handoff order:

1. Data/runtime slice: settings, feature normalization, environment store, run manager, runtime service, startup/time-advance wiring, and cleanup behavior.
2. GM admin slice: `Environments` tab, environment/task editor workflows, duplication semantics, validation presentation, responsive/error affordances, and save blocking.
3. Player app slice: Items Directory `Gathering` action, dedicated gathering app, actor preference handling, listable-but-blocked environment/task presentation, active/history presentation, and immediate/timed attempt flows.

This can land in one implementer-owned change or as backend-first plus UI follow-up if the write sets stay disjoint.

## Verification Gates

- `npm test`
- `npm run build`
- `npm run test:foundry` only when the implementation needs live Foundry confirmation for scene/token gating, world-time completion wiring, or reproducible UI screenshots; container-query responsive contract coverage does not require live screenshots by itself

## Implementer Entry Criteria

- Issue `#179` remains the only active scope.
- The implementer reads this change folder and the canonical gathering/UI/data/destructive specs before touching runtime code.
- The implementer confirms whether the work will land as one PR or as separate backend and UI PRs with non-overlapping write sets.
