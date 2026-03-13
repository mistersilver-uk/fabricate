# Specification 002: Data Models

## Purpose

Define Fabricate data models, persistence contracts, and macro contracts.
All stored entities are JSON-serializable and safe to persist via `game.settings` and flags.
All settings keys in this specification use the literal `fabricate.*` namespace.

Behavioural semantics are defined in:

- `004-resolution-modes.md`
- `005-recipes-and-steps.md`
- `006-recipe-visibility.md`
- `007-destructive-changes-and-migrations.md`
- `009-gathering-and-harvesting.md`

## CraftingSystem

```js
CraftingSystem = {
  id: string,
  name: string,
  description?: string,

  // System-level invariant for all recipes in this crafting system.
  // Mode semantics and validation are defined in 004.
  resolutionMode: "simple" | "routed" | "progressive" | "alchemy",

  features: {
    recipeCategories: boolean,
    itemTags: boolean,
    essences: boolean,
    propertyMacros: boolean,
    effectTransfer: boolean,
    multiStepRecipes: boolean,
    gathering: boolean, // default false
    salvage: boolean, // default false
  },

  categories: string[], // custom recipe categories only; reserved "general" is implicit
  itemTags: string[],

  // Present only when features.essences is true.
  essences?: Record<string, EssenceDefinition>,

  components: Component[],

  // Present only when features.salvage is true.
  salvageResolutionMode: "simple" | "routed" | "progressive",

  salvageCraftingCheck: {
    enabled: boolean,
    macroUuid?: string,
    successMacroUuid?: string,
    failureMacroUuid?: string,
    consumption: {
      consumeComponentOnFail: boolean,  // default true
      consumeCatalystsOnFail: boolean,  // default false
    },
    outcomes?: string[],               // routed mode
    progressive?: {
      awardMode: "partial" | "equal" | "exceed",
      allowPlayerReorder: boolean,
    },
  },

  craftingCheck: {
    enabled: boolean,
    macroUuid?: string,
    successMacroUuid?: string,
    failureMacroUuid?: string,

    consumption: {
      consumeIngredientsOnFail: boolean, // default true
      consumeCatalystsOnFail: boolean,   // default false
    },

    // Routed mode (macroOutcome provider may return one of these, optional)
    outcomes?: string[],

    // Progressive mode
    progressive?: {
      awardMode: "partial" | "equal" | "exceed",
      allowPlayerReorder: boolean, // default false
    },
  },

  recipeVisibility: {
    listMode: "global" | "player" | "knowledge",  // default "global"

    // Required only when listMode === "knowledge"; ignored in "global" and "player" modes.
    knowledge?: {
      mode: "item" | "learned" | "itemOrLearned",

      item?: {
        limitUses: boolean,
        maxUses?: number,
        destroyWhenExhausted?: boolean,
      },

      learn?: {
        consumeOnLearn: boolean, // default true
        dragDropEnabled: boolean, // default true; controls actor-drop auto-learn behaviour
      },
    },
  },

  // Present only when resolutionMode === "alchemy".
  alchemy?: {
    learnOnCraft: boolean, // default false
    consumeOnFail: boolean, // default true
    showAttemptHistoryToPlayers: boolean, // default true
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

### Requirements

1. Every crafting system has a reserved effective recipe category named `general` (`General` in UI copy). It is always enabled and cannot be removed.
2. `CraftingSystem.categories` stores only additional user-defined recipe categories. The reserved `general` category must not be persisted in that array.
3. `Recipe.category` defaults to `general`.
4. If `features.recipeCategories` is false, custom recipe categories are ignored at runtime and recipes resolve under `general`.
5. If `features.itemTags` is false, tag-based ingredient placeholders are invalid.
6. `categories` and `itemTags` should be normalized to unique, trimmed strings.
7. `resolutionMode` must be one of `"simple"`, `"routed"`, `"progressive"`, or `"alchemy"`.
8. If `resolutionMode === "alchemy"`:
   - `features.multiStepRecipes` must be `false`.
   - `alchemy` config must be present; missing values use defaults (`learnOnCraft: false`, `consumeOnFail: true`, `showAttemptHistoryToPlayers: true`).
9. If `features.gathering` is false, gathering environments and gathering tasks for that system are inert and hidden from normal UI flows.

### Recipe Visibility Requirements

1. `listMode` must be one of `"global"`, `"player"`, or `"knowledge"`. Invalid or missing values default to `"global"`.
2. The `knowledge` sub-object is only meaningful when `listMode === "knowledge"`.
3. When `listMode === "global"`, all enabled recipes are visible to all users without restriction or knowledge filtering.
4. `knowledge.learn.dragDropEnabled` controls automatic learning from actor item drops when knowledge learning is enabled; default is `true`.
5. If `knowledge.learn.dragDropEnabled` is `false`, automatic actor-drop learning is disabled and manual learn UI affordances must be used.

## EssenceDefinition

### Purpose

Define one essence type used by components and recipe requirements.

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

## Component

### Purpose

Represent one curated item entry available to recipes and salvage operations.

### Properties

```js
Component = {
  id: string,
  name: string,
  sourceItemUuid: string | null,
  tags: string[],
  essences: { [essenceId: string]: number },
  difficulty?: number, // only used in progressive mode

  salvage?: {
    enabled: boolean,              // default false
    ingredientQuantity: number,    // default 1
    catalysts: Catalyst[],
    resultGroups: ResultGroup[],
    outcomeRouting?: { [outcome: string]: string },  // routed only
    timeRequirement?: TimeRequirement,
    currencyRequirement?: CurrencyRequirement,
  },
}
```

### Requirements

1. `difficulty` is only used in progressive mode.
2. If set, `difficulty` must be an integer >= 1.
3. Each essence key must exist in `CraftingSystem.essences` when essences are enabled.
4. `salvage` is only valid when `CraftingSystem.features.salvage` is true.
5. When `salvage.enabled` is true, `salvage.resultGroups` must contain at least one result group.
6. `salvage.outcomeRouting` is only valid when `salvageResolutionMode` is `"routed"`.
7. `salvage.ingredientQuantity` must be a positive integer.

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
  category: string,

  // Multi-step mode
  steps?: Step[],

  // Single-step mode
  ingredientSets?: IngredientSet[],
  resultGroups?: ResultGroup[],

  transferEffects: boolean,
  catalysts: Catalyst[], // defines catalysts that apply to all ingredient groups across all steps in a recipe

  // Routed/alchemy result-group selection
  resultSelection?: {
    provider: "ingredientSet" | "macroOutcome" | "rollTableOutcome",

    // provider = "macroOutcome"
    // If present, overrides CraftingSystem.craftingCheck.macroUuid for this recipe.
    macroUuid?: string,

    // provider = "rollTableOutcome"
    rollTableUuid?: string,
  },

  visibility?: {
    restricted: boolean,
    allowedUserIds?: string[],  // Required when restricted is true. Empty array = hidden from all non-GM users.
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
3. `resultSelection.provider` is required when `CraftingSystem.resolutionMode` is `routed` or `alchemy`.
4. `resultSelection.provider` value constraints:
   - `ingredientSet`: each `IngredientSet` must resolve deterministically to exactly one `ResultGroup` (via `IngredientSet.resultGroupId`, or implicitly when only one result group exists).
   - `macroOutcome`: a check macro must be resolvable (`Recipe.resultSelection.macroUuid` or fallback to `CraftingSystem.craftingCheck.macroUuid`).
   - `rollTableOutcome`: `Recipe.resultSelection.rollTableUuid` is required.
5. `ResultGroup.name` values must be unique per recipe under trim-normalized, case-insensitive comparison.
6. `ResultGroup.name` values may not be reserved routing keywords under trim-normalized, case-insensitive comparison:
   - failure keywords: `fail`, `failed`, `failure`, `f`, `miss`, `missed`, `m`, `nothing`, `none`, `whiff`, `whiffed`, `hazard`, `danger`, `complication`, `trap`, `oops`
7. If `transferEffects` is true and essences are enabled, transfer behaviour follows `005-recipes-and-steps.md`.
8. If `visibility.restricted` is true, `visibility.allowedUserIds` must be present as an array. An empty array is valid and means no non-GM user may see the recipe.
9. If knowledge mode includes item matching or learning, `linkedRecipeItemUuid` should be configured for player craftability.
10. If `linkedRecipeItemUuid` is configured and does not resolve, validation must warn.

### Validation Guidance

Shape validation (invalid):
- `visibility.restricted` is `true` but `allowedUserIds` is missing, `null`, or not an array.

Valid-but-hidden configuration:
- `visibility.restricted` is `true` and `allowedUserIds` is `[]`. The recipe is hidden from all non-GM users. GM can still view and manage the recipe.

## Recipe Item Identity

### Purpose

Define matching between a recipe's linked template and owned inventory items.

### Canonical Link

- `Recipe.linkedRecipeItemUuid` stores the canonical template reference to the recipe item.
- It may point to a world item or a compendium item.

### Match Rule

A candidate owned item matches when either condition is true:

1. `ownedItem.uuid === recipe.linkedRecipeItemUuid`
2. `ownedItem._stats.compendiumSource === recipe.linkedRecipeItemUuid`
3. `ownedItem.flags.core.sourceId === recipe.linkedRecipeItemUuid` (legacy fallback)

Foundry v12+ uses `_stats.compendiumSource`; Foundry v11 and earlier used `flags.core.sourceId`.
Runtime implementations should call the shared source UUID resolver defined in `006-recipe-visibility.md`.

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
    minutes?: number,
    hours?: number,
    days?: number,
    months?: number,
    years?: number,
  },
  currencyRequirement?: {
      unit: string // varies by game system
      amount: number,
  },
}
```

### Requirements

1. `timeRequirement` is a duration declaration, not an absolute timestamp.
2. If present, at least one of `minutes`, `hours`, `days`, `months`, `years` must be a positive number.
3. Runtime execution normalises duration fields to a world-time target timestamp for gate evaluation.

## IngredientSet

### Purpose

Represent one ingredient/catalyst bundle.

### Properties

```js
IngredientSet = {
  id: string,
  name: string,
  ingredientGroups: IngredientGroup[],
  essences: { [essenceId: string]: number },
  catalysts: Catalyst[],

  // Routed/alchemy: used when resultSelection.provider === "ingredientSet"
  resultGroupId?: string,
}
```

### Requirements

1. `ingredientGroups` must contain at least one `IngredientGroup`.
2. Ingredient-set evaluation is always OR-across-sets at recipe/step level.
3. AND-across-ingredient-sets is not supported.

## IngredientGroup

### Purpose

Represent one required ingredient slot where at least one option must be satisfied.

### Properties

```js
IngredientGroup = {
  id: string,
  name?: string,
  options: Ingredient[], // OR options; one option satisfies the group
}
```

### Requirements

1. `options` must contain at least one `Ingredient`.
2. A group is satisfied when any one option is satisfied.
3. All groups in an `IngredientSet` must be satisfied.
4. OR-group semantics are always enabled and are not controlled by a feature toggle.

## Ingredient

### Purpose

Represent one consumable ingredient requirement.

### Properties

```js
Ingredient = {
  quantity: number,
  extractEffects: boolean,

  match: {
    type: "component" | "tags",

    // type = "component"
    componentId?: string,

    // type = "tags"
    tags?: string[],
    tagMatch?: "any" | "all", // default "any"
  },
}
```

### Requirements

1. `quantity` must be positive.
2. `match.type` is required.
3. If `match.type === "component"`, `match.componentId` is required.
4. If `match.type === "tags"`, `match.tags` must contain one or more tag IDs.
5. Tag IDs in `match.tags` must exist in `CraftingSystem.itemTags`.
6. When `features.itemTags` is true, tag placeholder ingredients are valid in all resolution modes, including `simple`.

## Alchemy Signature Uniqueness (Validation Contract)

### Purpose

Define the save/import invariant that guarantees deterministic ingredient-signature resolution in alchemy mode.

### Contract

1. Applies only when `CraftingSystem.resolutionMode === "alchemy"`.
2. Scope is all recipes in the crafting system.
3. Signature overlap is based on satisfiable ingredient assignments, not just textual equality.
4. Matching expansion must include:
   - direct component matches (`match.type === "component"`)
   - tag matches (`match.type === "tags"`) expanded against current system components/tags.
5. Ingredient groups may resolve to the same component ID when inventory quantity is sufficient to satisfy the aggregate quantity across those groups.
6. Any overlapping satisfiable signatures between ingredient sets in the same system are invalid.
7. Save is blocked for any collision in the system, including when editing an unrelated recipe.
8. Import behavior is partial:
   - non-conflicting recipes are imported,
   - conflicting recipes are rejected,
   - one aggregated conflict report is returned at completion.

## Catalyst

### Purpose

Represent one non-consumable catalyst requirement.

### Properties

```js
Catalyst = {
  componentId: string,
  degradesOnUse: boolean,
  destroyWhenExhausted: boolean,
  maxUses: number | null,
}
```

### Requirements

If present in the specification for a recipe, step, or ingredient set a catalyst is always required.

1. `componentId` is required.
2. If `degradesOnUse` is true, catalyst usage must be tracked on the owned item instance.
3. `maxUses` validation is scoped to `degradesOnUse === true`:
   - When `degradesOnUse` is true and `maxUses` is not null, `maxUses` must be a positive integer (>= 1).
   - When `degradesOnUse` is true and `maxUses` is null, the catalyst degrades but has unlimited uses.
   - When `degradesOnUse` is false, `maxUses` is ignored for validation purposes and has no runtime effect.
4. `destroyWhenExhausted` only has runtime effect when `degradesOnUse` is true and `maxUses` is a positive integer.

### Testing Requirements

Unit tests must cover the full `degradesOnUse` x `maxUses` validation matrix:

| `degradesOnUse` | `maxUses`        | Expected validity |
|-----------------|------------------|-------------------|
| `false`         | `null`           | valid             |
| `false`         | positive integer | valid (ignored)   |
| `false`         | `0` or negative  | valid (ignored)   |
| `true`          | `null`           | valid (unlimited) |
| `true`          | positive integer | valid             |
| `true`          | `0` or negative  | invalid           |
| `true`          | non-integer      | invalid           |

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
  componentId: string,
  quantity: number,
  propertyMacroUuid: string | null,
}
```

### Requirements

1. `componentId` is required.
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
    outcome?: string, // routed/alchemy macroOutcome mode
    value?: number,   // progressive mode
    data?: object,
  },

  consumedIngredients?: Array<{
    actorUuid: string,
    itemUuid: string,
    quantity: number,
  }>,
  usedCatalysts?: Array<{
    actorUuid: string,
    itemUuid: string,
    quantity: number,
  }>,
  createdResults?: Array<{
    actorUuid: string,
    itemUuid: string,
    quantity: number,
  }>,

  failureReason?: string,
}
```

### Requirements

1. `index` must be contiguous and zero-based within a `CraftingRun.steps` array.
2. `timeGate` is only valid when the corresponding recipe step has `timeRequirement`.
3. `timeGate.availableAt` must be `> initiatedAt` when both are present.
4. `completedAt` is required when `status` is `succeeded`, or `failed`.
5. `lastCheckResult.outcome` is only valid in routed/alchemy when provider is `macroOutcome`; `lastCheckResult.value` is only valid in progressive mode.
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
3. When a run reaches a terminal status, it must be removed from `active` and prepended to `history`.
4. History should be newest-first and capped by a configured or default limit.
5. Deleting a recipe or crafting system should clean-up its associated crafting runs, both historical and in-progress.

### Gathering Runs Flag

```js
Actor.flags.fabricate.gatheringRuns = {
  active: {
    [runId: string]: object,
  },
  history: object[],
}
```

Requirements:

1. `active` contains only non-terminal gathering runs (`inProgress` or `waitingTime`).
2. `history` contains only terminal gathering runs (`succeeded`, `failed`, `cancelled`).
3. When a gathering run reaches a terminal status, it must be removed from `active` and prepended to `history`.
4. Within one actor's `gatheringRuns.active`, at most one active run may exist for a given `taskId`.
5. Detailed `GatheringRun` shape and lifecycle semantics are defined in `009-gathering-and-harvesting.md`.

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
3. Maximum uses is configured in `Catalyst.maxUses` for each catalyst (on the recipe, step, or ingredient set). Usage tracking and exhaustion only apply when `degradesOnUse` is true.
4. When `degradesOnUse` is true and `maxUses` is not null: the item is exhausted when `timesUsed >= maxUses`.
5. If `destroyWhenExhausted` is true, the item is destroyed when exhausted.
6. When `degradesOnUse` is false, catalyst item usage flags are not written or evaluated.

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

- Simple, routed (`ingredientSet`), routed (`rollTableOutcome`), and alchemy with non-macro routing

```js
{ success: boolean, description?: string, data?: object }
```

- Routed (`macroOutcome`) and alchemy (`macroOutcome`)

```js
{ success: boolean, outcome: string, description?: string, data?: object }
```

- Progressive

```js
{ success: boolean, value: number, description?: string, data?: object }
```

Normalization and interpretation rules for `outcome` in routed/alchemy `macroOutcome`:

1. `outcome` is required and must be interpreted using trim-normalized, case-insensitive comparison.
2. Preferred reserved keyword:
   - `fail` (failed craft outcome)
3. Accepted failure aliases (same normalization rules):
   - fail-family: `fail`, `failed`, `failure`, `f`
   - miss-family compatibility aliases: `miss`, `missed`, `m`, `nothing`, `none`, `whiff`, `whiffed`
   - hazard-family compatibility aliases: `hazard`, `danger`, `complication`, `trap`, `oops`
4. If normalized `outcome` matches a reserved failure keyword, it does not route to a result group and is treated as failure.
5. Otherwise, `outcome` must equal a `ResultGroup.name` for the active recipe under the same normalization rules.
6. If a non-reserved `outcome` does not match any `ResultGroup.name`, classify as crafting-system misconfiguration error.

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

## Canonical-Write and Legacy-Read Compatibility Policy

### Policy Statement

- Canonical field names are the authoritative contract for all new model and migration design.
- Read paths (constructors, normalization) MAY accept legacy aliases for backward compatibility during migration windows.
- Legacy aliases in write output (`toJSON`) are transitional and scheduled for removal once migration coverage is confirmed.
- Runtime writers MAY temporarily dual-emit documented transitional aliases during compatibility windows.
- No new legacy aliases may be introduced unless explicitly added to this policy section with a removal plan.

### Canonical Fields

The following canonical field names must be used in all new writes:

| Model | Canonical Field | Description |
|-------|----------------|-------------|
| Catalyst | `componentId` | Managed item reference |
| Ingredient | `match.type = "component"` | Match type for component-based ingredients |
| Ingredient | `match.componentId` | Component reference inside match object |
| Result | `componentId` | Produced item component reference |
| CraftingSystem | `components` | Array of managed item entries |
| IngredientSet | `ingredientGroups` | Array of ingredient group objects |
| Recipe | `resultGroups` | Array of result group objects |
| EssenceDefinition | `sourceItemUuid` | Template item reference |
| Component | `sourceItemUuid` | Template item reference |
| CraftingSystem | `itemTags` | Array of tag strings |
| Item flag | `catalystItemUsage.timesUsed` | Catalyst usage tracking |

### Legacy Read Aliases

The following legacy aliases are accepted by constructors and normalization functions and are normalized to their canonical counterparts on read:

| Legacy Alias | Canonical Form | Context | Normalization |
|-------------|---------------|---------|---------------|
| `systemItemId` | `componentId` | Catalyst, Ingredient, Result | Constructor reads `systemItemId` as fallback; normalized to `componentId` |
| `match.type = "systemItem"` | `match.type = "component"` | Ingredient.match | Constructor and migration rewrite type to `"component"` |
| `match.systemItemId` | `match.componentId` | Ingredient.match | Constructor reads as fallback for `componentId` |
| `managedItems` | `components` | CraftingSystem | Normalization and migration rename to `components` |
| `ingredients` (flat array) | `ingredientGroups` | IngredientSet | Constructor wraps each ingredient into a single-option group |
| `results` (flat array) | `resultGroups` | Recipe | Constructor wraps into a single result group |
| `associatedSystemItemId` | `sourceItemUuid` | EssenceDefinition, Component | Constructor reads as fallback for `sourceItemUuid` |
| `tags` | `itemTags` | CraftingSystem | Normalization reads `tags` as fallback for `itemTags` |
| `catalystUses` (bare number) | `catalystItemUsage.timesUsed` | Item flag | Runtime reads legacy flag and converts to `{ timesUsed }` shape |
| `sourceUuid` | `sourceItemUuid` | Component | Normalization reads as fallback |

### Transitional Write Aliases (Scheduled for Removal)

The following aliases are currently emitted in `toJSON()` / normalization output alongside their canonical counterparts. These are transitional and will be removed in a future version once all dependent UI code paths have been updated:

- `systemItemId` (emitted alongside `componentId` in Catalyst, Ingredient, Result)
- `ingredients` (emitted alongside `ingredientGroups` in IngredientSet)
- `results` (emitted alongside `resultGroups` in Recipe)
- `associatedSystemItemId` (emitted alongside `sourceItemUuid` in EssenceDefinition, Component)
- `tags` (emitted alongside `itemTags` in CraftingSystem normalization)
- `sourceUuid` (emitted alongside `sourceItemUuid` in Component normalization)
- UI convenience aliases (`enableTags`, `enableEssences`, `enableCategories`, `enableMultiStepRecipes`, `advancedOptionsEnabled`)

These transitional aliases exist solely for UI code paths that have not yet been updated. They do not represent the canonical data contract and must not be relied upon by new code.

### Testing Requirements

Tests must include:

- Backward-compatible read tests: constructing models from legacy-only data (e.g., `systemItemId` without `componentId`) must produce correct canonical state.
- Canonical-write assertions: `toJSON()` output must include all canonical fields with correct values.
- Migration idempotency: running the `migrateComponentId` migration on already-migrated data must produce identical output.
- Round-trip integrity: `Model.fromJSON(model.toJSON())` must preserve all canonical fields.
