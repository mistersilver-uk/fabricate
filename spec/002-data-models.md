# Specification 002: Data Models

## Purpose

Define Fabricate data models, persistence contracts, and macro contracts.
All stored entities are JSON-serializable and safe to persist via `game.settings` and flags.

Behavioural semantics are defined in:

- `004-resolution-modes.md`
- `005-recipes-and-steps.md`
- `006-recipe-visibility.md`
- `007-destructive-changes-and-migrations.md`

## CraftingSystem

```js
CraftingSystem = {
  id: string,
  name: string,
  description?: string,

  // System-level invariant for all recipes in this crafting system.
  // Mode semantics and validation are defined in 004.
  resolutionMode: "simple" | "mapped" | "tiered" | "progressive",

  features: {
    essences: boolean,
    propertyMacros: boolean,
    effectTransfer: boolean,
    multiStepRecipes: boolean,
  },

  categories: string[],
  itemTags: string[],

  // Present only when features.essences is true.
  essences?: Record<string, EssenceDefinition>,

  managedItems: SystemItem[],

  craftingCheck: {
    enabled: boolean,
    macroUuid?: string,
    successMacroUuid?: string,
    failureMacroUuid?: string,

    consumption: {
      consumeIngredientsOnFail: boolean, // default true
      consumeCatalystsOnFail: boolean,   // default false
    },

    // Tiered mode
    outcomes?: string[],

    // Progressive mode
    progressive?: {
      awardMode: "partial" | "equal" | "exceed",
      allowPlayerReorder: boolean, // default false
    },
  },

  recipeVisibility: {
    listMode: "player" | "knowledge",

    // Optional when listMode === "knowledge"
    knowledge?: {
      mode: "item" | "learned" | "itemOrLearned",

      item?: {
        limitUses: boolean,
        maxUses?: number,
        destroyWhenExhausted?: boolean,  
      },

      learn?: {
        consumeOnLearn: boolean, // default true
      },
    },
  },

  requirements: {
    time: {
      enabled: boolean, // default false
    },

    currency: {
      enabled: boolean,
      provider: "system" | "macro",

      // provider = "system"
      systemAdapter?: "dnd5e" | "pf2e",

      // provider = "macro"
      checkCurrencyMacroUuid?: string,     // (actor, requiredAmount) => boolean
      decrementCurrencyMacroUuid?: string, // (actor, amount) => void
      formatCurrencyMacroUuid?: string,    // (amount) => string
    },
  },
}
```

## EssenceDefinition

### Purpose

Define one essence type used by system items and recipe requirements.

### Properties

```js
EssenceDefinition = {
  id: string,
  name: string,
  icon: string,
  description?: string,
  sourceItemUuid?: string,
}
```

## SystemItem

### Purpose

Represent one curated item entry available to recipes.

### Properties

```js
SystemItem = {
  id: string,
  name: string,
  sourceItemUuid: string | null,
  tags: string[],
  essences: { [essenceId: string]: number },
  difficulty?: number, // only used in progressive mode
}
```

### Requirements

1. `difficulty` is only used in progressive mode.
2. If set, `difficulty` must be an integer >= 1.
3. Each essence key must exist in `CraftingSystem.essences` when essences are enabled.

## Recipe

### Purpose

Represent a complete recipe with inputs, outputs, and visibility settings.

### Properties

```js
Recipe = {
  id: string,
  name: string,
  description: string,
  craftingSystemId: string,
  enabled: boolean,
  category: string | null,

  // Multi-step mode
  steps?: Step[],

  // Single-step mode
  ingredientSets?: IngredientSet[],
  resultGroups?: ResultGroup[],

  transferEffects: boolean,
  catalysts: Catalyst[], // defines catalysts that apply to all ingredient groups across all steps in a recipe

  // Tiered routing
  outcomeRouting?: {
    [outcome: string]: string, // outcome -> resultGroupId
  },

  visibility?: {
    restricted: boolean,
    allowedUserIds?: string[],
  },

  // Canonical recipe-item template reference (world or compendium UUID)
  linkedRecipeItemUuid?: string,

  locked: boolean,

  metadata: {
    created: number,
    modified: number,
    author: string,
    version: string,
  },
}
```

### Requirements

1. Recipe must include at least one ingredient set and at least one result group, either at recipe level (single-step mode) or within steps (multistep mode).
2. Resolution-mode constraints are defined in `004-resolution-modes.md`.
3. If `outcomeRouting` is used, keys must exist in `CraftingSystem.craftingCheck.outcomes`.
4. If `transferEffects` is true and essences are enabled, transfer behaviour follows `005-recipes-and-steps.md`.
5. If `visibility.restricted` is true, `visibility.allowedUserIds` is required.
6. If knowledge mode includes item matching or learning, `linkedRecipeItemUuid` should be configured for player craftability.
7. If `linkedRecipeItemUuid` is configured and does not resolve, validation must warn.

## Recipe Item Identity

### Purpose

Define matching between a recipe's linked template and owned inventory items.

### Canonical Link

- `Recipe.linkedRecipeItemUuid` stores the canonical template reference to the recipe item.
- It may point to a world item or a compendium item.

### Match Rule

A candidate owned item matches when either condition is true:

1. `ownedItem.uuid === recipe.linkedRecipeItemUuid`
2. `ownedItem.flags.core.sourceId === recipe.linkedRecipeItemUuid`

`core.sourceId` is expected to propagate across duplication chains.
Any modules that do not follow this pattern when creating items will break Fabricate's item identification logic.

### Match Context Contract

Defines the information necessary to make a determination about whether an owned inventory item matches, and therefore represents, a recipe in an actor's inventory.
This structure need not explicitly appear in implementation.

```js
RecipeItemMatchContext = {
  linkedRecipeItemUuid: string,
  candidateItemUuid: string,
  candidateSourceId: string | null,
  isMatch: boolean,
}
```

## Step

### Purpose

Represent one step in a multistep recipe.

### Properties

```js
Step = {
  id: string,
  name: string,
  description?: string,

  ingredientSets: IngredientSet[],
  resultGroups: ResultGroup[],
  catalysts: Catalyst[], // defines catalysts that apply to all ingredient sets in this step

  timeRequirement?: {
    unit: "second" | "minute" | "hour" | "day" | "week" | "month",
    amount: number,
  },
  currencyRequirement?: {
      unit: string // varies by game system
      amount: number,
  },

  // Tiered routing override
  outcomeRouting?: {
    [outcome: string]: string,
  },
}
```

## IngredientSet

### Purpose

Represent one ingredient/catalyst bundle.

### Properties

```js
IngredientSet = {
  id: string,
  name: string,
  ingredients: Ingredient[],
  essences: { [essenceId: string]: number },
  catalysts: Catalyst[],

  // Mapped mode
  resultGroupId?: string,
}
```

## Ingredient

### Purpose

Represent one consumable ingredient requirement.

### Properties

```js
Ingredient = {
  systemItemId: string,
  quantity: number,
  extractEffects: boolean,
}
```

### Requirements

1. `systemItemId` is required.
2. `quantity` must be positive.

## Catalyst

### Purpose

Represent one non-consumable catalyst requirement.

### Properties

```js
Catalyst = {
  systemItemId: string,
  degradesOnUse: boolean,
  destroyWhenExhausted: boolean,
  maxUses: number | null,
}
```

### Requirements

If present in the specification for a recipe, step, or ingredient set a catalyst is always required.

1. `systemItemId` is required.
2. If `degradesOnUse` is true, catalyst usage must be tracked on the owned item instance.

## ResultGroup

### Purpose

Group one or more results.

### Properties

```js
ResultGroup = {
  id: string,
  name: string,
  results: Result[],
}
```

## Result

### Purpose

Represent one produced item.

### Properties

```js
Result = {
  id: string,
  systemItemId: string,
  quantity: number,
  propertyMacroUuid: string | null,
}
```

### Requirements

1. `systemItemId` is required.
2. `quantity` must be positive.
3. `propertyMacroUuid` is only valid when `features.propertyMacros` is true.

## CraftingRun

### Purpose

Represent one actor-scoped crafting execution instance, including resumable in-progress state and final outcome metadata for history.

### Properties

```js
CraftingRun = {
  id: string,
  actorUuid: string,
  userId: string, // initiating user

  craftingSystemId: string,
  recipeId: string,

  status: "inProgress" | "waitingTime" | "succeeded" | "failed" | "cancelled",

  startedAt: number,
  updatedAt: number,
  finishedAt?: number,

  currentStepIndex: number | null,
  steps: CraftingRunStepState[],

  componentSourceActorUuids: string[],
}
```

### Requirements

1. `id` must be unique within `Actor.flags.fabricate.craftingRuns.active` and within the actor's history entries.
2. `currentStepIndex` must be `null` for terminal statuses (`succeeded`, `failed`, `cancelled`).
3. `status` must be `waitingTime` when progression is blocked only by elapsed time.
4. `finishedAt` is required for terminal statuses and must be absent for non-terminal statuses.

## CraftingRunStepState

### Purpose

Represent current and historical execution state for one recipe step within a crafting run.

### Properties

```js
CraftingRunStepState = {
  stepId: string,
  stepName: string,
  index: number,

  status: "pending" | "inProgress" | "waitingTime" | "succeeded" | "failed",

  startedAt?: number,
  updatedAt: number,
  completedAt?: number,

  // Time gate tracking (for step.timeRequirement)
  timeGate?: {
    requiredSeconds: number,
    availableAt: number, // timestamp when step can complete
    initiatedAt: number, // timestamp when step began
  },
    
  selectedIngredientSetId?: string,

  lastCheckResult?: {
    success: boolean,
    reason: string,   // user-friendly text returned by the macro explaining the result 
    outcome?: string, // tiered mode
    value?: number,   // progressive mode
    data?: object,
  },

  consumedIngredients?: Array<{
    actorUuid: string,
    systemItemId: string,
    quantity: number,
  }>,
  usedCatalysts?: Array<{
    actorUuid: string,
    systemItemId: string,
    quantity: number,
  }>,
  createdResults?: Array<{
    actorUuid: string,
    systemItemId: string,
    quantity: number,
  }>,
}
```

### Requirements

1. `index` must be contiguous and zero-based within a `CraftingRun.steps` array.
2. `timeGate` is only valid when the corresponding recipe step has `timeRequirement`.
3. `timeGate.availableAt` must be `> initiatedAt` when both are present.
4. `completedAt` is required when `status` is `succeeded`, or `failed`.
5. `lastCheckResult.outcome` is only valid in tiered mode; `lastCheckResult.value` is only valid in progressive mode.
6. `failureReason` is required when `status` is `failed`.

## Actor Flags

### Crafting Runs Flag

```js
Actor.flags.fabricate.craftingRuns = {
  active: {
    [runId: string]: CraftingRun,
  },
  history: CraftingRun[],
}
```

Requirements:

1. `active` contains only non-terminal runs (`inProgress` or `waitingTime`).
2. `history` contains only terminal runs (`succeeded`, `failed`, `cancelled`).
3. When a run reaches a terminal status, it must be removed from `active` and appended to `history`.
4. History should be newest-first and capped by a configured or default limit.
5. Deleting a recipe or crafting system should clean-up its associated crafting runs, both historical and in-progress.

### Learned Recipes Flag

```js
Actor.flags.fabricate.learnedRecipes = {
  [recipeId: string]: {
    learnedAt: number,
    sourceItemUuid: string,
  },
}
```

Requirements:

1. `recipeId` must reference a valid recipe.
2. `learnedAt` must be a valid timestamp.
3. `sourceItemUuid` should reference the matched owned recipe item used to learn.

## Item Flags

### Recipe Item Usage Flag

Tracks how many time an owned item granting knowledge of a recipe has been used to craft.

```js
Item.flags.fabricate.recipeItemUsage = {
  timesUsed: number,
}
```

Requirements:

1. `timesUsed` must be a non-negative integer.
2. Usage is tracked per owned item instance.
3. Maximum uses is configured in `CraftingSystem.recipeVisibility.knowledge.item.maxUses`.
4. When `timesUsed >= maxUses`, the item is exhausted.
5. If `destroyWhenExhausted` is true, the item is destroyed when exhausted.

### Catalyst Item Usage Flag

Tracks how many times an owned item instance of a catalyst has been used.

```js
Item.flags.fabricate.catalystItemUsage = {
  timesUsed: number,
}
```

Requirements:

1. `timesUsed` must be a non-negative integer.
2. Usage is tracked per owned item instance.
3. Maximum uses is configured in `Catalyst.maxUses` for each catalyst (on the recipe, step, or ingredient group).
4. When `timesUsed >= maxUses`, the item is exhausted.
5. If `destroyWhenExhausted` is true, the item is destroyed when exhausted.

## Macro Contracts

### Crafting Check Macro Contract

Input context must include:

- `recipe`
- `craftingSystem`
- `craftingActor`
- `componentSourceActors`
- `ingredientPool`
- `candidateIngredientSet`
- `resolvedEssences`
- `step`

Return by mode:

- Simple or mapped

```js
{ success: boolean, data?: object }
```

- Tiered

```js
{ success: boolean, outcome: string, data?: object }
```

- Progressive

```js
{ success: boolean, value: number, data?: object }
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
- `essenceSources`
- `checkResult`
- `result`
- `step`

Return shape:

```js
{ [propertyPath: string]: any }
```

Returned values are merged into created item data before document creation.

### Success Macro Contract

Executed after a step succeeds and item consumption/creation is applied.

Input context must include:

- `recipe`
- `craftingSystem`
- `craftingActor`
- `componentSourceActors`
- `step`
- `selectedIngredientSet`
- `consumedIngredients`
- `consumedCatalysts`
- `createdResults`
- `checkResult`

Return: optional side effects only.

### Failure Macro Contract

Executed when a step fails.

Input context must include:

- `recipe`
- `craftingSystem`
- `craftingActor`
- `componentSourceActors`
- `step`
- `selectedIngredientSet`
- `failureReason`
- `checkResult`
- `consumedIngredients`
- `consumedCatalysts`

Return: optional side effects only.

## Behavioural Ownership

- Resolution mode semantics and mode validation: `004-resolution-modes.md`
- Recipe and step execution semantics: `005-recipes-and-steps.md`
- Recipe visibility and learning semantics: `006-recipe-visibility.md`
- Destructive changes and clean-up semantics: `007-destructive-changes-and-migrations.md`
