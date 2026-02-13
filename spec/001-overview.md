# Specification 001: Project Overview

## Purpose

Fabricate v2 is a universal, system-agnostic crafting module for Foundry VTT that allows Game Masters to define any crafting system for any tabletop RPG, and enables players to craft items in-game.

## Core Principles

### System Agnostic

- Works with any game system (D&D 5e, Pathfinder, Savage Worlds, etc.)
- No hardcoded system-specific logic
- Prefer to use Foundry's core APIs and styles before creating custom elements

### Progressive Complexity

- **Simple Mode**: Basic recipe definition (A + B = C)
- **Advanced Mode**: Variable outputs, catalysts, essences, effect transfer, formulas

### Player Accessible

- GMs define recipes
- Players access crafting through UI
- Clear feedback on requirements and results

## Architecture

### Module Structure

```text
fabricate-v2/
|-- src/
|   |-- models/         # Data models (Recipe, Ingredient, Catalyst)
|   |-- systems/        # Core systems (RecipeManager, CraftingEngine)
|   |-- ui/             # User interface (CraftingApp, ActorSelectionDialog)
|   |-- utils/          # Utilities (FormulaEvaluator)
|   `-- main.js         # Module entry point
|-- styles/             # CSS
|-- templates/          # Handlebars templates
|-- examples/           # Example macros
`-- spec/               # Specifications (this directory)
```

### Core Components

**Data Models**

- `Recipe` - Complete recipe definition
- `Ingredient` - Required consumable components
- `Catalyst` - Required non-consumable components

**Systems**

- `RecipeManager` - Recipe CRUD and storage
- `CraftingEngine` - Crafting execution

**UI**

- `CraftingApp` - Main crafting interface with in-app actor selection

**Utilities**

- `FormulaEvaluator` - Safe mathematical expression evaluation

## Technology Stack

- **Foundry VTT**: v12 and v13 compatible
- **Build System**: Vite (ES modules)
- **Templates**: Handlebars
- **UI Framework**: Foundry ApplicationV2

## Data Flow

1. **Recipe Definition** (GM)
   - GM creates recipe via RecipeManager
   - Recipe stored in world settings
   - Recipe available to all players

2. **Crafting** (Player)
   - Player clicks "Craft Item" button in Items sidebar
   - CraftingApp opens with smart defaults
   - Player selects crafting actor (where results go)
   - Player selects component source actors (where ingredients come from)
   - Player views available recipes based on selected sources
   - Player selects recipe and initiates craft
   - CraftingEngine validates and executes
   - Items consumed from source actors, new items added to crafting actor

3. **Advanced Features**
   - Catalyst validation (non-consumable requirements)
   - Variable output calculation (formulas)
  - Effect transfer (ingredients -> result)
   - Tag-based ingredient matching

## Foundry Integration

### UI Integration

- **Items Directory**: "Craft Item" button in header
- **System Agnostic**: Direct DOM injection (works with any system)
- **v12/v13 Compatible**: Handles both Application and ApplicationV2

### Data Storage

- Recipes stored in world settings (`fabricate-v2.recipes`)
- Item tags stored in item flags (`fabricate-v2.tags`)
- Item tiers stored in item flags (`fabricate-v2.tier`)
- Item essences stored in item flags (`fabricate-v2.essences`)
- User preferences stored in client settings (`fabricate-v2.lastCraftingActor`, `fabricate-v2.lastComponentSources`)

### Permissions

- GMs can create/edit/delete recipes
- Players can view recipes and craft (if they have owned actors)
- Respects Foundry's ownership system

## Versioning

- **Module Version**: Semantic versioning (MAJOR.MINOR.PATCH)
- **Foundry Compatibility**: Specified in module.json
- **API Stability**: Public API (game.fabricate) follows semver

## Future Considerations

- Recipe categories and filtering
- Skill checks and DC requirements
- Crafting time and progress tracking
- Batch crafting (multiple quantities)
- Recipe discovery system
- Crafting stations/locations
- Component quality tiers affecting output
