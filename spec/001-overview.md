# Specification 001: Project Overview

## Purpose

Fabricate v2 is a system-agnostic crafting module for Foundry VTT that lets GMs define crafting systems, curate managed item libraries, and provide players with clear crafting workflows.

## Core Principles

### System Agnostic

- Works with any game system (D&D 5e, Pathfinder, Savage Worlds, etc.)
- No hardcoded system-specific logic
- GMs define outcome logic through configurable macros
- Prefer Foundry core APIs/styles before custom UI

### Progressive Complexity

- **Simple Recipes**: One ingredient set, one result path, minimal options
- **Complex Recipes** (system toggle): Multiple ingredient sets, multiple results, variable/routed outcomes
- Optional system features are explicitly enabled per crafting system

### Player Accessible

- GMs define systems and recipes
- Players craft through a clear, constrained UI
- Requirements/results are explained without exposing disabled features

## Architecture

### Module Structure

```text
fabricate-v2/
|-- src/
|   |-- models/         # Data models (Recipe, IngredientSet, Result, Catalyst, CraftingSystem)
|   |-- systems/        # Core systems (RecipeManager, CraftingEngine, CraftingSystemManager)
|   |-- ui/             # User interfaces (CraftingApp, RecipeManagerApp, RecipeEditorApp)
|   |-- utils/          # Utilities (macro execution helpers, validation helpers)
|   `-- main.js         # Module entry point
|-- styles/             # CSS
|-- templates/          # Handlebars templates
|-- examples/           # Example macros
`-- spec/               # Specifications
```

### Core Components

**Data Models**

- `CraftingSystem` - System-wide feature toggles, checks/outcomes config, managed item library
- `EssenceDefinition` - System-defined essence catalog entry (name, description, optional associated item)
- `SystemItem` - Curated item entry used by recipes
- `Recipe` - Recipe definition scoped to a crafting system
- `IngredientSet` - One required ingredient/catalyst bundle
- `Ingredient` - Required consumable managed item
- `Catalyst` - Required non-consumable managed item
- `Result` - Item produced by crafting

**Systems**

- `CraftingSystemManager` - Crafting system CRUD and item-library management
- `RecipeManager` - Recipe CRUD and storage
- `CraftingEngine` - Validation, checks, execution, result creation

**UI**

- `CraftingApp` - Player crafting interface
- `RecipeManagerApp` - GM system/item/recipe administration
- `RecipeEditorApp` - GM recipe authoring

## Data Flow

1. **Crafting System Definition (GM)**
   - GM creates a crafting system.
   - GM enables optional features through vertical feature cards (categories, item tags, essences, complex recipes, property macros, crafting checks, outcome routing).
   - GM configures allowed values where relevant (categories, item tags, essence definitions, check outcomes).
   - GM curates managed items from world/compendium drops.
2. **Recipe Definition (GM)**
   - GM creates recipes scoped to one crafting system.
   - Recipe editor only shows controls for enabled system features.
   - If complex recipes are disabled, editor only permits first ingredient set and first result path.
3. **Crafting (Player)**
   - Player opens crafting UI, selects actors, selects recipe, crafts.
   - Engine validates requirements, evaluates optional crafting check macro, and resolves outcome.
   - Engine applies optional property-calculation macro(s) to produced results.
   - Essence quantities can be satisfied by "raw essence" items in the ingredient pool (for example, vial/crystal variants with different amounts).
   - If effect transfer is enabled, essence-associated item effects can be transferred to results.
   - Items are consumed/retained per recipe rules and results are created.

## Foundry Integration

### UI Integration

- Items Directory: `Craft Item` button
- GM admin via `Crafting Admin` application
- ApplicationV2 APIs (Foundry v13+)

### Data Storage

- Crafting systems: `fabricate-v2.craftingSystems`
- Recipes: `fabricate-v2.recipes`
- User prefs: `fabricate-v2.lastCraftingActor`, `fabricate-v2.lastComponentSources`, `fabricate-v2.lastManagedCraftingSystem`

### Permissions

- GMs manage systems/items/recipes
- Players craft using owned actors
- Foundry ownership/permission model is respected

## Versioning

- Semantic versioning for module releases
- Foundry compatibility declared in `module.json`
- Backwards compatibility is not required before first stable release
