# Specification 002: Data Models

## Purpose

Define the data models for Fabricate, including validation rules and macro contracts.
All stored entities are JSON-serializable and must be safe to persist via `game.settings`.

## CraftingSystem

```js
CraftingSystem = {
  id: string,
  name: string,
  description?: string,

  // System-level invariant: all recipes must use this mode
  // - `simple`: a recipe has 1 ingredient set and 1 result group. Crafting checks are optional pass/fail.
  // - `mapped`: a recipe has 1 or more ingredient sets and 1 or more result groups.
  // Each ingredient set can specify a result group.
  // If none is specified the player chooses.
  // Crafting checks are optional pass/fail.
  // - `tiered`: a recipe has 1 or more ingredient sets and 1 or more result groups.
  // Crafting checks are mandatory, and must return a valid outcome from the list of outcomes defined in the crafting check.
  // Recipe defines outcome-to-result-group mappings.
  // - `progressive`: a recipe has 1 ingredient set and 1 result group containing ordered results.
  // In this mode, system items used as results must have a "difficulty" property (minimum value 1), which is otherwise ignored and not displayed.
  // This difficulty value should be set on the item for consistency across recipes, but should be displayed in the recipe editor and crafting UI.  
  // Crafting checks are mandatory and must return a numeric value.
  // The check value is compared to result difficulties and check award mode to determine the final results.
  resolutionMode: "simple" | "mapped" | "tiered" | "progressive",

  features: {
    essences: boolean,
    propertyMacros: boolean,
    effectTransfer: boolean,
    multiStepRecipes: boolean, // Allow recipes to have multiple sequential steps
  },

  categories: string[],
  itemTags: string[],

  essences?: Record<string, EssenceDefinition>, // only if features.essences

  // Managed items library
  managedItems: SystemItem[],

  // Check configuration (behaviour depends on resolutionMode)
  craftingCheck: {
    enabled: boolean,

    // Macro that performs the check
    // - simple/mapped: optional pass/fail check
    // - tiered: required, must return an outcome from the outcomes list
    // - progressive: required, must return a numeric value
    macroUuid?: string,

    // Universal: macro executed after a successful step completes (after items consumed/created)
    successMacroUuid?: string,

    // Universal: macro executed when a step fails due to check failure or contract failure
    failureMacroUuid?: string,

    // Universal: consumption behaviour on failure
    consumption: {
      consumeIngredientsOnFail: boolean,  // default true
      consumeCatalystsOnFail: boolean,    // default false
    },

    // Tiered-only: declared outcomes; macro must return one of these in tiered mode
    outcomes?: string[],

    // Progressive-only: system-level progressive behaviour
    progressive?: {
      awardMode: "partial" | "equal" | "exceed",
      allowPlayerReorder: boolean,        // default false
    },
  },

  // Recipe visibility and knowledge configuration
  recipeVisibility: {
    // Base listing behaviour for recipes in this system:
    // - "player": Recipes are only visible to specific players chosen by the GM, or to all players if no visibility is defined.
    // - "knowledge": list only recipes the viewer can access
    listMode: "player" | "knowledge",

    // Knowledge gating options (optional, only used when listMode === "knowledge")
    knowledge?: {
      // How knowledge is obtained/validated
      // - "item": Recipes must be linked to a recipe item to be craftable. That item must be in the crafting actor's inventory.
      // - "learned": Recipes must be linked to a recipe item and learned by the crafting actor by using (optionally consuming) the recipe item.
      // - "itemOrLearned": A hybrid of item and learned modes, where the recipe is visible if either the item is present or the recipe is learned by the actor.
      mode: "item" | "learned" | "itemOrLearned",

      // When mode includes "item":
      item?: {
        limitUses: boolean, // If true, the recipe item can only be used a limited number of times before it is consumed.
        maxUses?: number, // Maximum number of times the item can be used to craft the recipe if limitUses is true.
      },

      // When mode includes "learned":
      learn?: {
        consumeOnLearn: boolean, // If true, consume the recipe item when learning. Default: true.
      },
    },
  },

  // Recipe visibility and knowledge configuration
  recipeVisibility: {
    // Base listing behaviour for recipes in this system:
    // - "player": Recipes are only visible to specific players chosen by the GM, or to all players if no visibility is defined.
    // - "knowledge": list only recipes the viewer can access
    listMode: "player" | "knowledge",

    // Knowledge gating options (optional, only used when listMode === "knowledge")
    knowledge?: {
      // How knowledge is obtained/validated
      // - "item": Recipes must be linked to a recipe item to be craftable. That item must be in the crafting actor's inventory.
      // - "learned": Recipes must be linked to a recipe item and learned by the crafting actor by using (optionally consuming) the recipe item.
      // - "itemOrLearned": A hybrid of item and learned modes, where the recipe is visible if either the item is present or the recipe is learned by the actor.
      mode: "item" | "learned" | "itemOrLearned",

      // When mode includes "item":
      item?: {
        limitUses: boolean, // If true, the recipe item can only be used a limited number of times before it is consumed.
        maxUses?: number, // Maximum number of times the item can be used to craft the recipe if limitUses is true.
      },

      // When mode includes "learned":
      learn?: {
        consumeOnLearn: boolean, // If true, consume the recipe item when learning. Default: true.
      },
    },
  },

  // Recipe visibility and knowledge configuration
  recipeVisibility: {
    // Base listing behaviour for recipes in this system:
    // - "player": Recipes are only visible to specific players chosen by the GM, or to all players if no visibility is defined.
    // - "knowledge": list only recipes the viewer can access
    listMode: "player" | "knowledge",

    // Knowledge gating options (optional, only used when listMode === "knowledge")
    knowledge?: {
      // How knowledge is obtained/validated
      // - "item": Recipes must be linked to a recipe item to be craftable. That item must be in the crafting actor's inventory.
      // - "learned": Recipes must be linked to a recipe item and learned by the crafting actor by using (optionally consuming) the recipe item.
      // - "itemOrLearned": A hybrid of item and learned modes, where the recipe is visible if either the item is present or the recipe is learned by the actor.
      mode: "item" | "learned" | "itemOrLearned",

      // When mode includes "item":
      item?: {
        limitUses: boolean, // If true, the recipe item can only be used a limited number of times before it is consumed.
        maxUses?: number, // Maximum number of times the item can be used to craft the recipe if limitUses is true.
      },

      // When mode includes "learned":
      learn?: {
        consumeOnLearn: boolean, // If true, consume the recipe item when learning. Default: true.
      },
    },
  },

  // Optional step requirements: time/currency
  requirements: {
    time: {
      enabled: boolean, // default false
      // For now, Fabricate will use `now + timeRequirement` to determine when a step finishes
      // The `gameWorldTimeUpdated` hook will be used to update the step's completion status when the world time changes to equal or exceed the step's target time
    },

    currency: {
      enabled: boolean,
      provider: "system" | "macro",

      // provider="system"
      systemAdapter?: "dnd5e" | "pf2e",

      // provider="macro"
      checkCurrencyMacroUuid?: string, // (actor, requiredAmount) => boolean
      decrementCurrencyMacroUuid?: string, // (actor, amount) => void
      formatCurrencyMacroUuid?: string, // (amount) => string
    },
  },
}
```

## EssenceDefinition

### Purpose

Defines one essence type used by system items and recipe requirements.

### Properties

```javascript
EssenceDefinition = {
   id: string,            // key in the essences map
   name: string,
   description?: string,

   // Optional: used for "raw essence" items and active effect transfer from essences to results
   sourceItemUuid?: string,
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

  // Multi-step recipes (if features.multiStepRecipes is enabled)
  // If disabled, recipe has exactly one implicit step with these fields
  steps?: Step[],

  // Single-step recipe fields (used when features.multiStepRecipes is false)
  ingredientSets?: IngredientSet[],
  resultGroups?: ResultGroup[],
  requiresAllSets?: boolean,     // false => OR, true => AND

  // Effect transfer (when features.effectTransfer is enabled)
  transferEffects: boolean,

  // Tiered mode: mapping from crafting check outcomes to result groups
  // Only used when resolutionMode === "tiered"
  outcomeRouting?: {
    [outcome: string]: string   // outcome -> resultGroupId
  },

  // Recipe visibility (based on system recipeVisibility configuration)
  visibility?: {
    restricted: boolean, // If true, only allowedUserIds can see this recipe (default false)
    allowedUserIds?: string[], // Foundry user IDs
  },

  // Optional linkage to a recipe item (used when system knowledge mode includes item)
  linkedRecipeItemUuid?: string, // UUID for an Item (world item or compendium entry)

  // Allows a GM to make visible recipes unusable by players
  locked: boolean, // Default: false

  metadata: {
    created: number,
    modified: number,
    author: string,
    version: string
  }
}
```

### Requirements

1. Must have at least one ingredient set (or at least one step with ingredient sets).
2. Must have at least one result group with at least one result (or at least one step with result groups).
3. Resolution mode constraints:
   - **simple**: exactly one ingredient set and exactly one result group
   - **mapped**: one or more ingredient sets, each with optional resultGroupId; one or more result groups
   - **tiered**: one or more ingredient sets; one or more result groups; outcomeRouting must map all craftingCheck.outcomes
   - **progressive**: exactly one ingredient set and exactly one result group with ordered results
4. If `outcomeRouting` is used, all keys must exist in `CraftingSystem.craftingCheck.outcomes`.
5. If `transferEffects` is true and `features.essences` is enabled, eligible essence-associated item effects are included in transfer.
6. If `visibility.restricted` is true, `visibility.allowedUserIds` must be provided.
7. If system `recipeVisibility.knowledge` mode includes "item" or "learned", recipes should have `linkedRecipeItemUuid` set to be craftable by players.

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
  degradesOnUse: boolean,
  maxUses: number | null
}
```

### Requirements

1. `systemItemId` is required.
2. If `degradesOnUse` is true, fabricate must track uses of the catalyst in item flags (there is no system-agnostic way to do this yet).

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
