# Specification 002: Data Models

## Purpose

Define the data structures for crafting systems, managed items, recipes, ingredients, and catalysts that support both simple and advanced crafting scenarios.

## CraftingSystem

### Purpose

Represents a GM-defined crafting system containing rules, configuration, and the managed item library.

### Properties

```javascript
{
  id: string,                    // Unique identifier
  name: string,                  // Display name
  description: string,           // System description
  enabled: boolean,              // Whether this system is active
  advancedOptionsEnabled: boolean, // Enables tags/essences/categories/tiers

  // System-wide configuration (only when advanced options are enabled)
  categories: string[],          // Recipe categories (optional)
  tags: string[],                // Allowed tags (optional)
  essences: string[],            // Allowed essences (optional)
  tiers: string[],               // Allowed tiers (optional)

  // Difficulty model and rules (future UI)
  difficulty: {
    base: number,
    tierWeight: number,
    tagWeights: Object,
    essenceWeights: Object
  },

  // Managed items
  items: SystemItem[]
}
```

## SystemItem

### Purpose

Represents a curated item entry within a crafting system.

### Properties

```javascript
{
  id: string,           // Unique identifier within the system
  name: string,         // Display name
  img: string,          // Image path
  sourceUuid: string?,  // Optional Foundry Source UUID
  tier: string?,        // Optional tier
  tags: string[],       // Optional tags (system-defined)
  essences: Object      // Optional essences (system-defined)
}
```

## Recipe

### Purpose

Represents a complete crafting recipe with inputs (ingredients, catalysts) and output (result item or items).

### Properties

```javascript
{
  id: string,                    // Unique identifier (UUID) for the recipe
  name: string,                  // Display name
  description: string,           // Recipe description
  category: string,              // Optional category (from crafting system)
  craftingSystemId: string,      // Owning crafting system
  enabled: boolean,              // Whether recipe is active

  // Input requirements (at least one set must be satisfied)
  ingredientSets: IngredientSet[], // Alternative ingredient combinations
  catalysts: Catalyst[],           // Legacy; migrated into ingredient sets

  // Output (multiple items can be produced)
  results: Result[],               // Items to create

  // Recipe behavior
  isVariable: boolean,             // Whether output varies based on inputs
  transferEffects: boolean,        // Transfer effects from ingredients to results
  requiresAllSets: boolean,        // false = OR logic, true = AND logic (default: false)

  // Metadata
  metadata: {
    created: number,
    modified: number,
    author: string,
    version: string
  }
}
```

### Requirements

1. Must have at least one ingredient set
2. Must have at least one result
3. Results must reference either `systemItemId` or `itemUuid`
4. If `isVariable` is true, each ingredient set must have valid `resultMapping` IDs

## IngredientSet

### Purpose

Represents a set of ingredients that can satisfy a recipe's input requirements. Multiple ingredient sets allow recipes to accept alternative combinations (e.g., "2xA OR 1xB + 1xC").

### Properties

```javascript
{
  id: string,
  name: string,
  ingredients: Ingredient[],     // Item or tag/tier requirements
  essences: {                    // Required essences (from ingredient properties)
    [essenceType]: number
  },
  catalysts: Catalyst[],         // Catalysts required for this ingredient set
  resultMapping: string[]        // Result IDs to produce when this set is used (for variable recipes)
}
```

## Result

### Purpose

Represents an item produced by a recipe. Recipes can produce multiple different items.

### Properties

```javascript
{
  id: string,                    // Unique identifier within the recipe
  systemItemId: string | null,   // Managed item reference
  itemUuid: string | null,       // Foundry Source UUID (fallback)
  quantity: number,              // Number of items created (default: 1)
  propertyFormulas: {            // Dynamic property calculation
    [propertyPath]: string
  }
}
```

### Requirements

1. Must reference `systemItemId` or `itemUuid`
2. `quantity` must be positive

## Ingredient

### Purpose

Represents a required consumable component for crafting.

### Properties

```javascript
{
  systemItemId: string | null, // Managed item reference
  itemUuid: string | null,     // Foundry Source UUID (fallback)
  quantity: number,
  tag: string | null,          // Tag for flexible matching (e.g., "armour:leather")
  tier: string | null,         // Quality tier (e.g., "common")
  alternatives: Ingredient[],  // Alternative ingredients
  extractEffects: boolean
}
```

### Requirements

1. At least one of `systemItemId`, `itemUuid`, or `tag` must be set
2. `quantity` must be positive

## Catalyst

### Purpose

Represents a required non-consumable component (tools, workstations, etc.).

### Properties

```javascript
{
  systemItemId: string | null, // Managed item reference
  itemUuid: string | null,     // Foundry Source UUID (fallback)
  tag: string | null,
  required: boolean,
  mustBeEquipped: boolean,
  degradesOnUse: boolean,
  degradeAmount: number
}
```

### Requirements

1. At least one of `systemItemId`, `itemUuid`, or `tag` must be set
2. If `degradesOnUse`, item must have a quantity or uses system

## Item Flags

### Tags Flag

```javascript
item.setFlag('fabricate-v2', 'tags', ['metal', 'ore', 'iron']);
```

### Tier Flag

```javascript
item.setFlag('fabricate-v2', 'tier', 'rare');
```

### Essences Flag

```javascript
item.setFlag('fabricate-v2', 'essences', {
  'light': 2,
  'fire': 1
});
```
