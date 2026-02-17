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
      // Award mode uses a "currency spending" model where the check value is like currency.
      // Items are ordered (by GM or optionally by player if allowPlayerReorder=true).
      // Currency is "spent" sequentially on each item based on its difficulty value.
      //
      // Example: [Tooth (difficulty 5), Eye (difficulty 10), Tooth (difficulty 5)]
      //
      // - "partial": Spend currency on items in order. If you can't fully afford the next item,
      //              you still get it with "partial credit" (leftover currency counts).
      //   value=7  → Tooth (spend 5, leaving 2), Eye (costs 10 but partial credit applies) → Tooth + Eye
      //   value=15 → Tooth (spend 5, leaving 10), Eye (spend 10, leaving 0), Tooth (can't afford) → Tooth + Eye
      //
      // - "equal": Spend currency on items in order. You must have enough remaining currency
      //            to afford each item (remaining ≥ cost).
      //   value=7  → Tooth (7≥5, spend 5 leaving 2), Eye (2<10, can't afford) → Tooth only
      //   value=15 → Tooth (15≥5, spend 5 leaving 10), Eye (10≥10, spend 10 leaving 0), Tooth (0<5) → Tooth + Eye
      //
      // - "exceed": Spend currency on items in order. You must have MORE than the cost
      //             (remaining > cost, strictly greater than).
      //   value=7  → Tooth (7>5, spend 5 leaving 2), Eye (2≤10, can't afford) → Tooth only
      //   value=15 → Tooth (15>5, spend 5 leaving 10), Eye (10≤10, can't afford) → Tooth only
      //
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

  // Optional step requirements: time/currency
  requirements: {
    time: {
      enabled: boolean, // default false
      // For now, Fabricate will use `now + timeRequirement` to determine when a step finishes.
      // Recipes with a time requirement will be marked as incomplete until the target time is reached.
      // The `gameWorldTimeUpdated` hook will be used to update the step's completion status when the world time changes to equal or exceed the step's target time.
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
  essences: { [essenceId: string]: number },
  difficulty?: number,          // Progressive mode only: cost in currency spending model (minimum 1)
}
```

### Requirements

1. `difficulty` is only used when the crafting system `resolutionMode` is "progressive".
2. If set, `difficulty` must be a positive integer (minimum value 1).
3. The difficulty value represents the "cost" of the item in the progressive mode currency spending model.

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

## Step

### Purpose

Represents one step in a multi-step recipe (only used when features.multiStepRecipes is enabled).

### Properties

```javascript
{
  id: string,
  name: string,
  description?: string,

  ingredientSets: IngredientSet[],
  resultGroups: ResultGroup[],
  requiresAllSets: boolean,     // false => OR, true => AND

  // Optional step-level requirements (if enabled on system)
  timeRequirement?: number,      // Time in seconds (if requirements.time.enabled)
  currencyRequirement?: number,  // Currency cost (if requirements.currency.enabled)

  // Tiered mode: step-level outcome routing (overrides recipe-level if present)
  outcomeRouting?: {
    [outcome: string]: string   // outcome -> resultGroupId
  },
}
```

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
  catalysts: Catalyst[],

  // Mapped mode: optional link to specific result group
  // Only used when resolutionMode === "mapped"
  resultGroupId?: string,
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

## Actor Flags

### Learned Recipes Flag

Tracks which recipes an actor has learned (used when `recipeVisibility.knowledge` mode includes "learned").

#### Purpose

Stores a map of learned recipe IDs to learning metadata for each actor.

#### Properties

```javascript
Actor.flags.fabricate.learnedRecipes = {
  [recipeId: string]: {
    learnedAt: number,        // Timestamp (milliseconds since epoch)
    sourceItemUuid: string,   // UUID of the recipe item used to learn
  }
}
```

#### Requirements

1. `recipeId` must reference a valid recipe in the crafting system.
2. `learnedAt` must be a valid timestamp.
3. `sourceItemUuid` should reference the item used to learn (may be null if item was consumed or deleted).

## Item Flags

### Recipe Item Usage Flag

Tracks usage count for recipe items with limited uses (used when `knowledge.item.limitUses` is true).

#### Purpose

Stores the current usage count for a recipe item that has a usage limit.

#### Properties

```javascript
Item.flags.fabricate.recipeItemUsage = {
  timesUsed: number,  // Current usage count (starts at 0)
}
```

#### Requirements

1. `timesUsed` must be a non-negative integer.
2. Maximum uses (`maxUses`) is defined in `CraftingSystem.recipeVisibility.knowledge.item.maxUses`, not stored per-item.
3. When `timesUsed >= maxUses`, the item is considered exhausted and cannot be used for crafting.

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
- `step` (current step, if multi-step recipes are enabled)

Return shape depends on resolution mode:

**Simple/Mapped mode (pass/fail):**
```javascript
{
  success: boolean,
  data?: object                 // Optional payload passed to property macros
}
```

**Tiered mode:**
```javascript
{
  success: boolean,
  outcome: string,              // Must be in craftingCheck.outcomes
  data?: object                 // Optional payload passed to property macros
}
```

**Progressive mode:**
```javascript
{
  success: boolean,
  value: number,                // Numeric check result compared against result difficulties
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
- `step` (current step, if multi-step recipes are enabled)

Return shape:

```javascript
{
  [propertyPath: string]: any
}
```

Returned map is merged into created item data before document creation.

### Success Macro Contract

Executed after a step completes successfully (after items consumed and created).

Input context must include:

- `recipe`
- `craftingSystem`
- `craftingActor`
- `componentSourceActors`
- `step` (current step, if multi-step recipes are enabled)
- `selectedIngredientSet`
- `consumedIngredients` (items that were consumed)
- `consumedCatalysts` (catalysts that were consumed/degraded, if any)
- `createdResults` (items that were created)
- `checkResult` (output from crafting check macro, if enabled)

Return shape:

```javascript
{
  // Optional: no return value required
  // Macro can perform side effects (add buffs, XP, notifications, etc.)
}
```

### Failure Macro Contract

Executed when a step fails due to check failure or contract violation.

Input context must include:

- `recipe`
- `craftingSystem`
- `craftingActor`
- `componentSourceActors`
- `step` (current step, if multi-step recipes are enabled)
- `selectedIngredientSet`
- `failureReason` (string describing why the step failed)
- `checkResult` (output from crafting check macro, if enabled and check was executed)
- `consumedIngredients` (items consumed per consumption policy)
- `consumedCatalysts` (catalysts consumed per consumption policy)

Return shape:

```javascript
{
  // Optional: no return value required
  // Macro can perform side effects (damage, effects, notifications, etc.)
}
```

## Essence Effect Transfer Rule

When `recipe.transferEffects` is true and `features.essences` is enabled:

1. Determine contributing essence IDs from resolved ingredients.
2. For each contributing essence ID, if `sourceItemUuid` exists in the EssenceDefinition and resolves, collect active effects from that associated item.
3. Transfer those effects to result items via the standard effect-transfer pipeline.

Effect transfer quantity scaling for essence-associated items is out of scope for this phase (transfer occurs once per contributing essence type).

## Validation Rules by Resolution Mode

### Simple Mode

- Recipe must have exactly one ingredient set
- Recipe must have exactly one result group
- Crafting checks are optional
- If enabled, check macro must return simple/mapped (pass/fail) shape

### Mapped Mode

- Recipe must have one or more ingredient sets
- Recipe must have one or more result groups
- Each ingredient set may have a `resultGroupId` linking to a specific result group
- If no `resultGroupId` is specified, player chooses from available result groups
- Crafting checks are optional
- If enabled, check macro must return simple/mapped (pass/fail) shape

### Tiered Mode

- Recipe must have one or more ingredient sets
- Recipe must have one or more result groups
- Crafting checks are mandatory (`craftingCheck.enabled` must be true)
- `craftingCheck.outcomes` must be defined with at least one outcome
- `recipe.outcomeRouting` must map all outcomes to result group IDs
- Check macro must return tiered shape with valid outcome string

### Progressive Mode

- Recipe must have exactly one ingredient set
- Recipe must have exactly one result group
- Result group must contain ordered results
- Each result's associated SystemItem must have a difficulty value (minimum 1)
- Difficulty represents the "cost" in the currency spending model
- Crafting checks are mandatory (`craftingCheck.enabled` must be true)
- `craftingCheck.progressive` configuration must be present
- Check macro must return progressive shape with numeric value (the "currency" amount)
- Results are awarded according to awardMode (partial/equal/exceed) using currency spending logic
- If `allowPlayerReorder` is true, players can reorder results before crafting
