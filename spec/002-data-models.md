# Specification 002: Data Models

## Purpose

Define data structures for crafting systems, managed items, recipes, and macro-driven crafting behavior.

## CraftingSystem

### Purpose

Represents a GM-defined crafting system with feature toggles, optional value catalogs, and managed items.

### Properties

```javascript
{
  id: string,
  name: string,
  description: string,
  enabled: boolean,
  advancedOptionsEnabled: boolean,

  features: {
    categories: boolean,        // Enables recipe category field/filtering
    itemTags: boolean,          // Enables item-tag management (items tab only)
    essences: boolean,          // Enables essence requirements on ingredient sets
    complexRecipes: boolean,    // Enables multiple ingredient sets/results and routing
    propertyMacros: boolean,    // Enables macro-based result property calculation
    craftingChecks: boolean,    // Enables system-level crafting check macro
    outcomeRouting: boolean     // Enables routing result groups by check outcome
  },

  categories: string[],          // Optional recipe categories
  itemTags: string[],            // Optional tags for item organization/search in Items tab
  essences: EssenceDefinition[], // Allowed essence catalog

  craftingCheck: {
    mode: "passFail" | "tiered",
    macroUuid: string | null,   // Macro to execute for crafting checks
    outcomes: string[]          // Allowed outcomes (e.g. ["fail","pass"] or ["low","high"])
  },

  items: SystemItem[]
}
```

## EssenceDefinition

### Purpose

Defines one essence type used by system items and recipe requirements.

### Properties

```javascript
{
  id: string,                     // Stable key used in quantity maps
  name: string,                   // Display name
  description: string,            // Help text shown in admin/editor/player UI
  associatedSystemItemId: string | null // Optional managed item associated with this essence
}
```

## SystemItem

### Purpose

Represents a curated item entry used by recipes.

### Properties

```javascript
{
  id: string,
  name: string,
  img: string,
  sourceUuid: string | null,
  tags: string[],               // For item categorization/sorting/search only
  essences: { [essenceId: string]: number }
}
```

## Recipe

### Purpose

Represents a complete recipe with inputs and outputs, plus optional routing/check integration.

### Properties

```javascript
{
  id: string,
  name: string,
  description: string,
  craftingSystemId: string,
  enabled: boolean,
  category: string | null,

  ingredientSets: IngredientSet[],
  resultGroups: ResultGroup[],

  requiresAllSets: boolean,     // false => OR, true => AND
  transferEffects: boolean,

  // Optional routing by check outcome (when enabled on system)
  outcomeRouting: {
    [outcome: string]: string   // outcome -> resultGroupId
  } | null,

  metadata: {
    created: number,
    modified: number,
    author: string,
    version: string
  }
}
```

### Requirements

1. Must have at least one ingredient set.
2. Must have at least one result group with at least one result.
3. If system `features.complexRecipes` is `false`, recipe must use:
   - exactly one ingredient set
   - exactly one result group
4. If `outcomeRouting` is used, all keys must exist in `CraftingSystem.craftingCheck.outcomes`.
5. If `transferEffects` is true and `features.essences` is enabled, eligible essence-associated item effects are included in transfer.

## IngredientSet

### Purpose

Represents one required ingredient/catalyst bundle.

### Properties

```javascript
{
  id: string,
  name: string,
  ingredients: Ingredient[],
  essences: { [essenceId: string]: number }, // Only when system features.essences is true
  catalysts: Catalyst[]
}
```

## Ingredient

### Purpose

Represents a required consumable managed item.

### Properties

```javascript
{
  systemItemId: string,         // Required
  quantity: number,
  extractEffects: boolean
}
```

### Requirements

1. `systemItemId` is required.
2. `quantity` must be positive.
3. Each `IngredientSet.essences` key must exist in `CraftingSystem.essences`.
4. Essence quantity values in `IngredientSet.essences` and `SystemItem.essences` must be positive numbers.

## Catalyst

### Purpose

Represents a required non-consumable managed item.

### Properties

```javascript
{
  systemItemId: string,         // Required
  required: boolean,
  mustBeEquipped: boolean,
  mustBeInInventory: boolean,
  proximityRequired: boolean,
  proximityDistance: number,
  degradesOnUse: boolean,
  maxUses: number | null
}
```

### Requirements

1. `systemItemId` is required.
2. If `degradesOnUse` is true, target item must support consumption/usage tracking.

## ResultGroup

### Purpose

Groups one or more results so recipes can produce different output sets.

### Properties

```javascript
{
  id: string,
  name: string,
  results: Result[]
}
```

## Result

### Purpose

Represents one produced item.

### Properties

```javascript
{
  id: string,
  systemItemId: string,         // Required managed item reference
  quantity: number,

  // Optional macro used to compute property updates for this result
  propertyMacroUuid: string | null
}
```

### Requirements

1. `systemItemId` is required.
2. `quantity` must be positive.
3. `propertyMacroUuid` may only be set when system `features.propertyMacros` is true.

## Macro Contracts

### Crafting Check Macro Contract

Input context must include:

- `recipe`
- `craftingSystem`
- `craftingActor`
- `componentSourceActors`
- `ingredientPool` (resolved/consumed and available ingredient metadata)
- `candidateIngredientSet`
- `resolvedEssences` (aggregated essence totals for selected ingredient pool)

Return shape:

```javascript
{
  success: boolean,
  outcome: string,              // Must be in craftingCheck.outcomes
  data?: object                 // Optional payload passed to property macros
}
```

### Property Macro Contract

Input context must include:

- `recipe`
- `craftingSystem`
- `craftingActor`
- `ingredientPool`
- `resolvedIngredients`
- `resolvedCatalysts`
- `resolvedEssences`
- `essenceSources` (essenceId -> source item breakdown)
- `checkResult` (output from crafting check macro, if enabled)
- `result` (current result descriptor)

Return shape:

```javascript
{
  [propertyPath: string]: any
}
```

Returned map is merged into created item data before document creation.

## Essence Effect Transfer Rule

When `recipe.transferEffects` is true and `features.essences` is enabled:

1. Determine contributing essence IDs from resolved ingredients.
2. For each contributing essence ID, if `associatedSystemItemId` exists and resolves, collect active effects from that associated item.
3. Transfer those effects to result items via the standard effect-transfer pipeline.

Effect transfer quantity scaling for essence-associated items is out of scope for this phase (transfer occurs once per contributing essence type).
