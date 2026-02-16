# Specification 001: Project Overview

## Purpose

Fabricate is a system-agnostic crafting module for Foundry VTT.
It enables GMs to define crafting systems, curate managed item libraries, and provide players with clear, consistent crafting workflows.

Fabricate supports:

- GM-defined crafting systems and recipes
- Configurable requirements for accessing recipes
- Multi-step crafting processes
- Optional check macros for crafting checks
- Optional failure macros for mishaps/volatility/custom behaviour
- Optional success macros for additional custom behaviour on success after items are consumed and created
- Optional essences and effect transfer
- Optional time and currency requirements via system adapters or macros

## Core Principles

### System Agnostic

- Works with any game system.
- No hardcoded system mechanics in core logic.
- System-specific integrations are optional adapters (e.g., dnd5e/pf2e currency).
- GMs can supply macros to implement system-specific details where needed.
- Prefer Foundry core APIs and UI conventions before custom UI.

### Progressive Complexity

- GMs can start simple and enable features over time.
- UI only shows controls that are enabled for the crafting system.
- Defaults should produce usable behaviour with minimal configuration.

### Deterministic and Testable

- Behaviour is defined by explicit settings and explicit macro contracts.
- Inputs/outputs are validated.
- Failures are surfaced clearly to users.
- Automated tests protect against regressions.

## Architecture

Fabricate is conceptually split into:

1. **Data Layer**

   - Stores crafting systems and recipes using `game.settings`.
   - Stores user preferences using `game.settings` (client scope).
   - Optionally stores in-progress crafting runs on actors (actor flags).

2. **Engine Layer**

   - Validates requirements.
   - Resolves step results according to the crafting system’s resolution mode.
   - Executes macros (check macros, property macros, failure macros).
   - Applies consumption rules (on success and failure).
   - Creates resulting Items/effects.

3. **UI Layer**

   - GM Admin: manage crafting systems, managed items, recipes.
   - Player Crafting App: select actor, recipe, and execute steps.

## Key Concepts

### Crafting Systems

A crafting system defines:

- A single **resolution mode** used by all recipes in the system.
- Recipe categories (e.g., `armour`, `weapon`, `consumable`) for filtering.
- Tags for items (e.g., `armour:leather`, `metal`, `consumable:potion`) for filtering and matching requirements.
- Which optional features are enabled (essences, property macros, effect transfer).
- How checks behave (pass/fail, tiered, progressive), and what macros are used.
- Universal failure behaviour (consumption policy + optional failure macro).
- Universal success behaviour with the ability to modify consumption and creation (optional success macro).
- Whether time/currency requirements are enabled, and how they are integrated (adapters/macros).

Changing a crafting system’s resolution mode is destructive and deletes recipes in that system.

### Resolution Mode (System-Level Invariant)

Each crafting system has exactly one resolution mode:

- `simple`
- `mapped`
- `tiered`
- `progressive`

All recipes in the system must conform to that resolution mode for step results selection.
Details are defined in **004-resolution-modes.md**.

### Multi-step Recipes

All recipes are defined as one or more steps.
Simple recipes have only one step, and users are not presented with the option to add additional steps unless they enable steps on the recipe.
GMs can add additional steps for more complex crafting processes.
Each step can define:

- Ingredients (as one or more alternative ingredient sets).
- Catalysts.
- Optional time and currency requirements (if enabled for the system).
- Step results (expressed according to the system’s resolution mode).

Details are defined in **005-recipes-and-steps.md**.

### Recipe Visibility

Players can view recipes that they have access to, based on the recipe’s visibility settings and the player’s permissions (for each recipe).
Optionally, crafting systems can require players to either possess a specific item (representing, and linked to the recipe) or learn the recipe.
Crafting systems can configure whether learning a recipe consumes the recipe item.
Details are defined in **006-recipe-visibility.md**.

## Data Flow

1. **Crafting System Definition (GM)**

   - GM creates a crafting system.
   - GM selects the system’s resolution mode.
   - GM enables optional features and configures their settings.
   - GM curates managed items from world/compendia.

2. **Recipe Definition (GM)**

   - GM creates recipes scoped to one crafting system.
   - Recipe editor only shows controls for enabled system and recipe features.
   - Steps and step results must conform to the system resolution mode.

3. **Crafting (Player)**

   - Player opens crafting UI, selects crafting actor and component sources (owned actors).
   - Player selects a recipe and starts or resumes a crafting run.
   - Player executes the crafting process, or if the recipe has multiple steps, executes the next step.
   - If the step has time requirements, the player is prompted to wait for the game world to reach the required time.
   - Engine validates requirements, runs checks (if configured), resolves results, applies macros, consumes items/currency, and creates results.
   - On failure, engine applies failure consumption policy and runs failure macro (if configured).

## Foundry Integration

### Settings

- World scope:

   - Crafting systems: `fabricate.craftingSystems`
   - Recipes: `fabricate.recipes`

- Client scope:

   - User prefs: `fabricate.lastCraftingActor`, `fabricate.lastComponentSources`, `fabricate.lastManagedCraftingSystem`
   - Optional: per-user progressive ordering prefs (see 003 and 004)

### Actor Flags (Optional)

If implementing resumable multi-step crafting runs:

- Actor flag namespace: `flags.fabricate.craftingRuns`
- Each run references a recipe and stores current step, selections, and step state.
- Time to complete is stored in the run flags and checked when the game world time changes.
- Runs must be cleaned up on recipe deletion or system destructive changes.
- If recipes can be learned by players, the information about which recipes they have learned should be stored in actor flags under the `fabricate.recipes` namespace.

## Permissions

- GMs manage crafting systems, managed items, and recipes.
- Players craft using owned actors.
- Foundry ownership and permissions are respected.

## Versioning

- Semantic versioning for module releases.
- Foundry compatibility declared in `module.json`.
- Backwards compatibility is not required before first stable release.
