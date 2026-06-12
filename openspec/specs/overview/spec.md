# Specification 001: Project Overview

## Purpose

Fabricate is a system-agnostic crafting module for Foundry VTT.
It enables GMs to define crafting systems, curate managed item libraries, and provide players with consistent crafting workflows.

Fabricate supports:

- GM-defined crafting systems and recipes with explicit resolution modes
- Configurable recipe visibility and knowledge gating
- Multi-step crafting processes
- Optional crafting check macros
- Optional success and failure macros
- Optional essences and effect transfer
- Optional time and currency requirements

## Core Principles

### System Agnostic

- No hardcoded game-system mechanics in core logic.
- System integrations are optional adapters or macros.
- Prefer Foundry core APIs before custom integrations.

### Progressive Complexity

- GMs can start simple and enable features incrementally.
- UI hides controls for disabled features.
- Defaults should produce usable baseline behaviour.

### Deterministic and Testable

- Behaviour is driven by explicit settings and contracts.
- Inputs and outputs are validated.
- Failures are surfaced clearly.
- Automated tests protect against regressions.

## Architecture

1. Data layer
   - Stores crafting systems and recipes in world settings.
   - Stores user preferences in client settings.
   - Stores actor-scoped crafting runs in actor flags (active and history).
2. Engine layer
   - Validates requirements.
   - Resolves results by resolution mode.
   - Executes macros.
   - Applies consumption rules and creates results.
3. UI layer
   - GM admin for systems/items/recipes.
   - Player crafting app for actor selection and execution.

## Key Concepts

### Crafting Systems

A crafting system defines:

- one system-wide resolution mode (`simple`, `routed`, `progressive`, `alchemy`)
- optional feature toggles
- check behaviour and macros
- failure/success hooks
- requirement providers (time/currency)
- recipe visibility mode
- recipe-level routed result selection providers (`ingredientSet`, `macroOutcome`, `rollTableOutcome`) when mode is `routed` or `alchemy`

Changing resolution mode is destructive and governed by `007-destructive-changes-and-migrations.md`.

### Resolution Modes

- `simple`
- `routed`
- `progressive`
- `alchemy`

Mode semantics and validation are defined in `004-resolution-modes.md`.

### Recipes and Steps

Recipes can be implicit single-step or explicit multistep.
Execution lifecycle semantics are defined in `005-recipes-and-steps.md`.

### Recipe Visibility and Learning

Visibility and craftability are determined by per-system visibility settings and per-recipe settings.
Item-based knowledge matching is identity-based and supports direct UUID plus source UUID matching (`_stats.compendiumSource` with legacy `flags.core.sourceId` fallback).
Behaviour is defined in `006-recipe-visibility.md`.

## Data Flow

1. GM defines a crafting system.
2. GM creates recipes scoped to that system.
3. Player selects actor/sources and executes crafting.
4. Engine validates, resolves, applies consumption, and creates results.

## Foundry Integration

### Settings

All settings keys use the literal `fabricate.*` namespace.

World:

- `fabricate.craftingSystems`
- `fabricate.recipes`
- `fabricate.gatheringEnvironments`
- `fabricate.gatheringConfig`
- `fabricate.gatheringParties` for world-level Fabricate-managed gathering parties (excluded from crafting-system import/export)
- `fabricate.migrationVersion`
- `fabricate.theme` for the active Fabricate UI theme preset (`Fabricate` by default, plus `Mythwright`, `Ironblood Forge`, `Hearth & Herb`, `Starglass Arcana`, and the fixed Foundry-inspired `Foundry Native` preset)
- `fabricate.experimentalFeatures` for future experimental feature gates, disabled by default

Client:

- `fabricate.lastCraftingActor`
- `fabricate.lastGatheringActor`
- `fabricate.lastComponentSources`
- `fabricate.lastManagedCraftingSystem`
- `fabricate.lastAlchemySystem`
- `fabricate.favouriteRecipes`
- `fabricate.recentlyCrafted`
- `fabricate.progressiveResultOrder`

### Actor Flags

- `flags.fabricate.craftingRuns.active` for resumable in-progress runs
- `flags.fabricate.craftingRuns.history` for completed/failed/cancelled run history
- `flags.fabricate.gatheringRuns.active` for in-progress time-gated gathering runs
- `flags.fabricate.gatheringRuns.history` for completed/failed/cancelled gathering run history
- `flags.fabricate.learnedRecipes` for learned recipe records
- `flags.fabricate.discoveredGatheringRealms` for actor-scoped gathering realm discovery (keyed by system then realm)

Clean-up semantics for stale runs/learned records are defined in `007-destructive-changes-and-migrations.md`.

## Permissions

- GMs manage systems, managed items, and recipes.
- Players craft with actors they own.
- Foundry ownership and permission rules are respected.

## Versioning

- Semantic versioning for module releases.
- Foundry compatibility declared in `module.json`.
- Before the first stable release, backwards compatibility is not guaranteed.
