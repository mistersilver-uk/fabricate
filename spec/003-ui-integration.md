# Specification 003: UI Integration

## Purpose

Define how Fabricate v2 integrates with Foundry VTT's user interface in a system-agnostic way.

## Integration Points

### Items Directory Buttons

**Location**: Items sidebar header (next to "Create Item")

**Buttons**:
- Craft Item (all users)
- Manage Recipes (GMs only)

**Implementation**: Direct DOM injection

## GM Crafting Admin

### Crafting Admin Window

- Tabs: Systems, Items, Recipes, Rules
- System selection in left sidebar

### Systems Tab

- Name and description (full-width, stacked)
- "Show advanced options" toggle
- Advanced options (when enabled): categories, tags, essences, tiers
- Each advanced option is managed as a simple list

### Items Tab

- Drag-and-drop items from sidebar/compendiums to build a system item library
- Searchable visual grid of system items
- Deleting a system item removes it from recipes and disables invalid recipes

### Recipes Tab

- Recipes scoped to the selected crafting system
- Import/export scoped by system

## Recipe Editor

### Philosophy

- Drag-and-drop first: users add ingredients, catalysts, and results by dropping items
- No placeholder rows are required to assign items
- Minimal valid recipe: at least one ingredient set and at least one result

### Layout

- Two-column layout (form + system items picker)
- System items picker remains visible and scrollable

### Ingredients

- Item Ingredients: managed items with quantity
- Tag/Tier Requirements: alternatives to items (no item selected)
- Essences are defined at the ingredient set level

### Catalysts

- Catalysts are per-ingredient-set
- Drag-and-drop adds a row if one does not exist

### Results

- Multiple results supported
- Dropping an item creates a result entry

## Crafting App (Player)

- Actor selection happens in-app
- Recipes filtered by availability with the selected component sources
- Recipes do not depend on any game system; GMs define formulas/macros as needed

## Data Storage

- Crafting systems: `fabricate-v2.craftingSystems`
- Recipes: `fabricate-v2.recipes`
- User preferences: `fabricate-v2.lastCraftingActor`, `fabricate-v2.lastComponentSources`, `fabricate-v2.lastManagedCraftingSystem`

## Compatibility

- Foundry v13 minimum (ApplicationV2)
- Works across systems using Foundry core APIs
