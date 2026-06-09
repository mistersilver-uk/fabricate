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
    recipeCategories: true, // compatibility alias; always enabled
    itemTags: true, // compatibility alias; always enabled
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
  recipeItemDefinitions: RecipeItemDefinition[],

  // Present only when features.salvage is true.
  salvageResolutionMode: "simple" | "routed" | "progressive",

  salvageCraftingCheck: {
    enabled: boolean,
    macroUuid?: string,
    successMacroUuid?: string,
    failureMacroUuid?: string,
    consumption: {
      consumeComponentOnFail: boolean,  // default true
      consumeCatalystsOnFail: boolean,  // default false; LEGACY-NAMED key — now governs TOOL usage/breakage on fail (see note below)
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
      consumeCatalystsOnFail: boolean,   // default false; LEGACY-NAMED key — now governs TOOL usage/breakage on fail (see note below)
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
4. Recipe categories are always enabled. Legacy persisted `features.recipeCategories`, `features.categories`, and `enableCategories` values are compatibility inputs only; normalization must emit enabled category aliases.
5. Item tags are always enabled. Legacy persisted `features.itemTags` and `enableTags` values are compatibility inputs only; normalization must emit enabled item-tag aliases.
6. `categories` and `itemTags` should be normalized to unique, trimmed strings.
7. `resolutionMode` must be one of `"simple"`, `"routed"`, `"progressive"`, or `"alchemy"`.
8. If `resolutionMode === "alchemy"`:
   - `features.multiStepRecipes` must be `false`.
   - `alchemy` config must be present; missing values use defaults (`learnOnCraft: false`, `consumeOnFail: true`, `showAttemptHistoryToPlayers: true`).
9. If `features.gathering` is false, gathering environments and gathering tasks for that system are inert and hidden from normal UI flows.
10. `recipeItemDefinitions` are distinct from `components`; a recipe item definition must not be treated as a crafting ingredient/result component unless it is also intentionally imported as a component.
11. `RecipeItemDefinition.id` values must be unique within a crafting system.
12. `RecipeItemDefinition.sourceItemUuid` values should be unique within a crafting system so one system recipe item can be reused across multiple recipes.
13. **`consumption.consumeCatalystsOnFail` is a legacy-named flag.** Following the Catalyst retirement, the persisted config key `consumption.consumeCatalystsOnFail` (on both `craftingCheck.consumption` and `salvageCraftingCheck.consumption`) was **retained by name** but now governs **Tool usage/breakage on a failed craft or salvage** (read it as "consume/break tools on fail"). It defaults to `false` (tools are not consumed/broken on failure unless enabled). The persisted key was deliberately **not** renamed because renaming a persisted setting key would require its own migration; the in-code semantics are tool-oriented while the wire key stays `consumeCatalystsOnFail`.

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
  sourceComponentId?: string | null,
  sourceItemUuid?: string | null, // compatibility alias; may contain a legacy component id
  associatedSystemItemId?: string | null, // compatibility alias for sourceComponentId
}
```

### Requirements

1. `sourceComponentId` is the canonical in-system managed component reference for an essence source.
2. `associatedSystemItemId` is a compatibility alias for `sourceComponentId`.
3. Legacy `sourceItemUuid` values that match a managed component id are treated as source component ids during normalization and display.
4. If an essence source component cannot be resolved, stored source evidence is retained so GM UI can show a stale-but-readable source state.

## RecipeItemDefinition

### Purpose

Define one curated knowledge item available for recipe visibility and learning flows.

### Properties

```js
RecipeItemDefinition = {
  id: string,
  name: string,
  img: string,
  description?: string,
  sourceItemUuid: string,
}
```

### Requirements

1. `sourceItemUuid` points to the canonical world or compendium item template used for recipe-item matching.
2. New recipe item definitions are created from dropped or selected Foundry items; manual UUID entry is not part of the canonical UI flow.
3. If the source template later becomes unresolved, the stored `sourceItemUuid` is retained and the definition becomes stale-but-readable.
4. Multiple recipes may reference the same recipe item definition. This is the canonical way to model shared formulas, books, schematics, or recipe scrolls.

## Component

### Purpose

Represent one curated item entry available to recipes and salvage operations.

### Properties

```js
  Component = {
    id: string,
    name: string,
    img: string,
    description?: string,
    sourceItemUuid: string | null,
    tags: string[],
  essences: { [essenceId: string]: number },
  difficulty?: number, // only used in progressive mode

  salvage?: {
    enabled: boolean,              // default false
    ingredientQuantity: number,    // default 1
    toolIds: string[],             // references to per-system library Tools
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
6. Runtime essence matching, craftability checks, discovered-recipe craftability, crafting-check contexts, and effect-transfer contexts must count `Component.essences` for actor items that match the component by source reference or name. Explicit `fabricate.essences` item flags remain a compatibility override for that item.
7. `salvage.outcomeRouting` is only valid when `salvageResolutionMode` is `"routed"`.
8. `salvage.ingredientQuantity` must be a positive integer.
9. If a linked source item updates its name, image, or description, managed components that match the item's live UUID, canonical source UUID, or fallback source references must refresh their stored `name`, `img`, and display-safe plain-text `description` from the linked item.

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
  toolIds: string[], // references library Tools that apply to all ingredient sets across all steps in this recipe

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

  // Canonical recipe-item definition reference inside the owning crafting system
  recipeItemId?: string,

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
9. If knowledge mode includes item matching or learning, `recipeItemId` should be configured for player craftability.
10. If `recipeItemId` is configured and the referenced `RecipeItemDefinition` does not exist, validation must warn.
11. If `recipeItemId` is configured and the referenced `RecipeItemDefinition.sourceItemUuid` is stale or no longer resolves, validation must warn.

### Validation Guidance

Shape validation (invalid):
- `visibility.restricted` is `true` but `allowedUserIds` is missing, `null`, or not an array.

Valid-but-hidden configuration:
- `visibility.restricted` is `true` and `allowedUserIds` is `[]`. The recipe is hidden from all non-GM users. GM can still view and manage the recipe.

## Recipe Item Identity

### Purpose

Define matching between a recipe's system-managed recipe item definition and owned inventory items.

### Canonical Link

- `Recipe.recipeItemId` stores the reference to a `CraftingSystem.recipeItemDefinitions[].id` entry.
- `RecipeItemDefinition.sourceItemUuid` stores the canonical template reference to the recipe item.
- The template may point to a world item or a compendium item.

### Match Rule

A candidate owned item matches when either condition is true:

1. `ownedItem.uuid === recipeItemDefinition.sourceItemUuid`
2. `ownedItem._stats.compendiumSource === recipeItemDefinition.sourceItemUuid`
3. `ownedItem.flags.core.sourceId === recipeItemDefinition.sourceItemUuid` (legacy fallback)

Foundry v12+ uses `_stats.compendiumSource`; Foundry v11 and earlier used `flags.core.sourceId`.
Runtime implementations should call the shared source UUID resolver defined in `006-recipe-visibility.md`.

### Match Context Contract

Defines the information necessary to make a determination about whether an owned inventory item matches, and therefore represents, a recipe in an actor's inventory.
This structure need not explicitly appear in implementation.

```js
RecipeItemMatchContext = {
  recipeItemId: string,
  recipeItemSourceUuid: string,
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
  toolIds: string[], // references library Tools that apply to all ingredient sets in this step

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

Represent one ingredient bundle with optional per-set Tool prerequisites.

### Properties

```js
IngredientSet = {
  id: string,
  name: string,
  ingredientGroups: IngredientGroup[],
  essences: { [essenceId: string]: number },
  toolIds: string[], // references library Tools required for this ingredient set

  // Routed/alchemy: used when resultSelection.provider === "ingredientSet"
  resultGroupId?: string,
}
```

### Requirements

1. `ingredientGroups` must contain at least one `IngredientGroup`, unless `essences` contains one or more positive requirements.
2. Ingredient-set evaluation is always OR-across-sets at recipe/step level.
3. AND-across-ingredient-sets is not supported.
4. `toolIds` normalizes to `[]` when absent; each id coerces to a trimmed string and empties are dropped. The applicable Tool set for an ingredient set is the union of recipe-level, step-level, and ingredient-set-level `toolIds`, resolved against the per-system Tools library; ids that miss the library are logged and dropped.

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
6. Tag placeholder ingredients are valid in all resolution modes, including `simple`.

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

## Tool

### Purpose

Represent one reusable, potentially-breakable prerequisite entry in a crafting system's
per-system Tools library. A Tool is the single shared **required-but-not-always-consumed**
primitive spanning **both** crafting (recipe / step / ingredient-set / salvage `toolIds`)
**and** gathering (`task.toolIds`). It replaces the retired Catalyst concept. Tools may
break across attempts and may require an actor-side expression to be truthy before they can
be used. Inline per-recipe / per-task tool authoring is not the canonical model — references
are always by id into the per-system library.

### Properties

```js
Tool = {
  componentId: string,
  requirement: null | {
    provider: "dnd5e" | "pf2e" | "macro",
    formula?: string,
    macroUuid?: string,
  },
  breakage: {
    mode: "limitedUses" | "breakageChance" | "diceExpression",
    maxUses?: number | null,         // limitedUses; null means unlimited
    breakageChance?: number,         // breakageChance; integer 0..100
    formula?: string,                // diceExpression
    threshold?: number,              // diceExpression; broken when result < threshold
  },
  onBreak: {
    mode: "destroy" | "flagBroken" | "replaceWith",
    replacementComponentId?: string  // replaceWith; must !== componentId
  }
}
```

### Requirements

1. `componentId` is required.
2. Tools are **SYSTEM-OWNED**: the single canonical library lives on the crafting-system object as `system.tools` (persisted in the `craftingSystems` setting, populated by `CraftingSystemManager._normalizeSystem`). Every consumer reads this one source — the recipe/step/ingredient-set/salvage tool gate (`RecipeManager`, `CraftingEngine`), the canvas interactable browser and item-drop resolution, and gathering. Gathering composition (`GatheringRichStateService.composeEnvironment`) sources `task.toolIds` lookups from `system.tools` (exposed on the composed environment as the non-enumerable `__libraryTools` map); it does **not** read a gathering-scoped tools copy. The 0.6.0 Catalyst→Tool migration writes migrated crafting Tools onto `system.tools`; the 0.7.0 migration reconciles any UI-authored `gatheringConfig.systems[id].tools` onto `system.tools` (dedupe by id, the system tool wins) and clears the gathering-config copy, so `system.tools` is the sole library going forward.
3. A referenced Tool is always required: it must be present and pass its optional `requirement` before crafting or a gathering attempt may proceed. A reference whose id no longer resolves in its library, or that resolves to a disabled tool, blocks the attempt with `TOOL_BLOCKED`.
4. `requirement` is optional. When present, the provider must be `dnd5e`, `pf2e`, or `macro`. Macro requirements require a non-empty `macroUuid`; system requirements require a non-empty `formula`.
5. Exactly one `breakage.mode` is configured per tool:
   - `limitedUses`: `maxUses` is null or a positive integer. Tool usage is tracked on the owned item via `flags.fabricate.toolUsage = { timesUsed }`. The tool breaks once `timesUsed >= maxUses` (after the per-attempt increment).
   - `breakageChance`: `breakageChance` is an integer in `0..100`. The tool breaks when `Math.random() * 100 < breakageChance` (so `0` never breaks and `100` always breaks).
   - `diceExpression`: `formula` is a non-empty Foundry roll formula evaluated against the actor's roll data; `threshold` is a finite number. The tool breaks when the numeric result is `< threshold`.
6. Exactly one `onBreak.mode` is configured per tool. `replaceWith` requires `replacementComponentId !== componentId`.
7. `flags.fabricate.toolBroken === true` on an owned item disqualifies it from satisfying a tool's presence gate until the flag is cleared.
8. A **virtual-present** Tool injected by a canvas Tool station (keyed by `componentId`, system-scoped via `presentTools = { systemId, componentIds }`) satisfies a Tool prerequisite without the actor owning the item and is excluded from usage and breakage. The match fires only when the evaluated recipe/task's own crafting system equals the active tool's `systemId`.

### Validation Matrix

| Field                                  | Valid values                                       | Invalid values            |
|----------------------------------------|----------------------------------------------------|---------------------------|
| `componentId`                          | non-empty string                                   | empty or missing          |
| `requirement.macro.macroUuid`          | non-empty string                                   | empty                     |
| `requirement.dnd5e/pf2e.formula`       | non-empty string                                   | empty                     |
| `breakage.limitedUses.maxUses`         | null or positive integer                           | `0`, negative, fractional |
| `breakage.breakageChance.breakageChance` | integer `0..100`                                 | non-integer, out of range |
| `breakage.diceExpression.formula`      | non-empty string                                   | empty                     |
| `breakage.diceExpression.threshold`    | finite number                                      | non-finite                |
| `onBreak.replaceWith.replacementComponentId` | non-empty, must differ from `componentId`    | empty, equal to `componentId` |

## Gathering Drop Reference

### Purpose

Represent one reward row target on a d100 gathering task. The row shape remains a component reference or a direct Foundry Item UUID so existing task data can keep using either reward source.

### Properties

```js
GatheringDropReference = {
  componentId?: string,
  itemUuid?: string,
  quantity: number,
  dropRate: number,
}
```

### Requirements

1. `quantity` must be positive.
2. `dropRate` must be an integer from `0` to `100`.
3. A persisted, imported, or seeded row must have at least one resolvable reward target path:
   - `componentId` resolves to a component in the owning crafting system.
   - `itemUuid` resolves through Foundry UUID lookup to an Item document.
4. Rows with neither target, stale component ids, or unresolved item UUIDs are invalid at import/save/seed boundaries.

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
  usedTools?: Array<{
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

### Tool Item Usage Flag

Tracks how many times an owned tool item has been used. Written only by the `limitedUses` breakage mode.

```js
Item.flags.fabricate.toolUsage = {
  timesUsed: number,
}
```

Requirements:

1. `timesUsed` must be a non-negative integer.
2. Usage is tracked per owned item instance.
3. The `breakageChance` and `diceExpression` breakage modes do not write this flag.
4. **Legacy catalyst-usage fallback.** When `flags.fabricate.toolUsage` is absent, the runtime MUST fall back to reading the legacy `flags.fabricate.catalystItemUsage = { timesUsed }` flag so in-flight per-item usage counters survive the 0.6.0 Catalyst→Tool migration without an item-flag rewrite. This fallback is meaningful **only** for migrated `limitedUses` tools (mapped from `degradesOnUse: true`); presence-only tools (`breakageChance: 0`, mapped from `degradesOnUse: false`) never read or write usage. The first post-migration `applyUsage` on a `limitedUses` tool writes `toolUsage` (authoritative thereafter); the legacy `catalystItemUsage` flag is never back-filled or cleared — once `toolUsage` exists it wins and the fallback path is not re-entered. The legacy `catalystUses` bare-number flag is read and coerced to the `{ timesUsed }` shape under the same fallback.

### Tool Broken Flag

Set by the `flagBroken` on-break action to mark an item as unusable as a tool until a GM clears the flag.

```js
Item.flags.fabricate.toolBroken = true
```

Requirements:

1. When set to `true`, the item does not satisfy a crafting or gathering tool presence gate.
2. The flag is not cleared by Fabricate; the GM clears it via the Foundry item flag editor (or future repair flow).

## Canvas Interactables

### Purpose

Bring crafting/gathering onto the Foundry VTT canvas as **Interactables** — drag-and-drop placements for Tool stations and Gathering-Task resource nodes. A Fabricate Canvas Interactable is **region-first**: it is a **Scene Region** carrying a custom **`fabricate.interactable` Region Behaviour** (a `RegionBehaviorType`) that OWNS the authoritative state. A **linked visual** (Tile by default; optionally a Drawing or an existing GM-placed Token) is **presentation-only**. **No synthetic actor or proxy token is ever created.** A GM drags a Tool / Gathering-Task entry from the GM-only scene-control Interactable browser (or drags a tool-linked Item) onto the canvas; a Region + behaviour + linked Tile is spawned (or a **region-only** interactable with no visible marker). Spawning is **GM-only**. Activation is **token presence**: a controlled token entering the region offers the controlling player a non-blocking interact prompt (see `gathering-and-harvesting` and `ui-integration` for the activation pipeline).

### Interactable Region Behaviour (`fabricate.interactable`)

The behaviour is registered via the module manifest (`documentTypes.RegionBehavior.interactable`) + `CONFIG.RegionBehavior.dataModels`. All authoritative per-interactable state lives in the behaviour `system`:

```js
behavior.system = {
  interactableType: "tool" | "gatheringTask",
  sourceUuid: string,                 // the Fabricate Tool / Gathering Task source identity
  systemId: string,
  toolId: string|null,                // tool interactables
  taskId: string|null,                // gatheringTask interactables
  environmentId: string|null,         // resolved at drop (gatheringTask only)
  name: string,
  presentation: { promptText: string|null, hidden: boolean },
  linkedVisual: {
    uuid: string|null,
    documentName: "Tile" | "Drawing" | "Token" | null,
    mode: "marker" | "none",          // "none" = region-only (no visible marker)
    missingPolicy: "ignore" | "warn" | "recreate"
  },
  node: NodeState|null,               // gatheringTask only; per-behaviour node snapshot
  state: {
    enabled: boolean, consumed: boolean, locked: boolean,
    uses: { max: number|null, used: number },
    cooldown: { seconds: number|null, lastUsedWorldTime: number|null }
  },
  activation: { trigger: "regionEnter", audience: "players" | "all" }
}
```

Built/read via `src/canvas/regions/interactableRegionFlags.js`; the class + CONFIG registration live in `src/canvas/regions/FabricateInteractableRegionBehavior.js`.

Requirements:

1. `interactableType`, `sourceUuid`, and `systemId` are required; `toolId`/`taskId`, `environmentId`, and `node` are scoped by `interactableType`. Tool interactables inject a session-scoped `activeCanvasTool` (virtual-present) on activation; gathering-task interactables open the gathering app for that task and environment, passing the per-behaviour node state as a `nodeStateOverride`.
2. Spawning is **GM-only**.
3. Deleting the linked visual does NOT destroy the interactable; recovery is governed by `linkedVisual.missingPolicy`. **Region-only** (`mode: "none"`) is supported — the interactable works with no visible marker.

### Linked Visual reverse flags (presentation-only)

The linked visual (Tile / Drawing / Token) carries only a reverse pointer back at its owning Region + Behaviour; it holds NO interactable state of its own:

```js
visual.flags.fabricate = {
  isInteractableVisual: true,
  linkedRegionUuid: string,
  linkedBehaviorId: string
}
```

Built/read via `buildLinkedVisualFlags` / `readLinkedVisualRef` in `src/canvas/regions/interactableRegionFlags.js`; created/relinked/recreated via `src/canvas/linkedVisuals/linkedInteractableVisual.js`.

Requirements:

1. The default marker is a **Tile**; a **Drawing** (labelled zone) and an **existing GM-placed Token** are also supported. The reverse flag makes a Tile/Token HUD "Configure Fabricate Interactable" entry resolve.
2. A linked **Token** is the GM's own document: depletion **never** mutates or deletes it by default (see Depleted Behavior).
3. A missing linked visual resolves cleanly to null — the interactable still functions (the central advantage of the region-first model).

### Per-Behaviour Node State (`behavior.system.node`)

A gathering-task interactable owns its own depletion/respawn state on the behaviour (`behavior.system.node`), **independent of** `environment.nodeRuntime[taskId]`.

Requirements:

1. `node` is a **snapshot of the task's node CONFIG at drop time** (`current` seeded to `max`), normalized through the existing `normalizeNodeConfig` / `normalizeRespawn` helpers, and using calendar-aware world-time respawn (same resolution as resource-node respawn). A task with no node config yields `null` — an UNLIMITED gathering point (no depletion, no respawn, no node writes).
2. Tool requirements are **NOT** snapshotted into `node`; they resolve from `task.toolIds` against the system-owned Tools library (`system.tools`) at attempt time (so library edits to a Tool propagate to placed interactables).
3. The node is depleted when `node.current <= 0` — one shared definition used by both the count logic and the depleted-visual apply.
4. When a per-behaviour node state is present for an attempt or listing, it takes precedence over `environment.nodeRuntime[taskId]` (threaded as a `nodeStateOverride`).
5. All writes to `behavior.system.node` are routed through the active GM over the `module.fabricate` socket; only `game.users.activeGM` applies the behaviour update (a GM client applies its own write locally without a socket round-trip). A world-time respawn pass iterates placed region behaviours, active-GM only. Depletion reflects onto the linked visual (see Depleted Behavior).

### Depleted Behavior (gathering-task node config)

```js
depletedBehavior = {
  swapImage?: string | null,   // Tile texture swapped while depleted
  postfixName?: boolean,       // append "(depleted)" label (Drawing label only)
  deleteToken?: boolean,       // terminal: visual deleted on depletion (Tile/Drawing only)
  tokenHide?: boolean,         // Token-only opt-in: reversibly hide the linked Token
}
```

Requirements:

1. `depletedBehavior` is authored on the gathering-task node config and normalized in the admin store (unknown/empty fields normalize away). It is **orthogonal** to `depletionTiming` (`onStart` / `onSuccess`): `depletedBehavior` describes what happens to the *linked visual* when the node is depleted, while `depletionTiming` describes *when* a node decrements. Both key off the same `node.current <= 0` trigger.
2. The depleted DECISION is pure and reflects onto the linked visual per its `documentName`:
   - **Tile** — `swapImage` swaps the texture (prior image stashed in `flags.fabricate.nodeOriginal`, restored on respawn).
   - **Drawing** — depletion HIDES the drawing (`hidden:true`, reversible), optionally appending a `(depleted)` label.
   - **Token** — **SAFE no-op by default**: a linked existing Token is the GM's own document and is NEVER mutated or deleted by depletion. `deleteToken` is deliberately IGNORED for a Token. The single opt-in is `tokenHide: true`, which reversibly hides the token on depletion and shows it again on respawn (the only state it ever touches; the prior `hidden` state is stashed in `flags.fabricate.nodeOriginal`).
3. `deleteToken` is **terminal** (no revert; respawn no-ops against a deleted/missing visual) and **mutually exclusive** with `swapImage` / `postfixName`: when set those fields are dead config (the editor greys them out and the normalizer drops them). It deletes a Tile/Drawing only.
4. All depleted-behavior visual mutations are applied through the active GM via the `module.fabricate` socket, on the same routing path as the node writes. A missing linked visual is a clean no-op.

### Session-Scoped Active Canvas Tool (`activeCanvasTool`)

Activating a Tool interactable injects a **virtual-present** tool into the crafting/gathering availability checks instead of minting a synthetic `Item`.

Requirements:

1. The virtual-present payload is system-scoped: `presentTools = { systemId, componentIds }`. A virtual-present match fires only when the evaluated task/recipe's own crafting system id equals the active tool's `systemId`, so a station tool from system A cannot satisfy a system-B prerequisite sharing the same `componentId` string.
2. A virtual-present tool is treated as satisfied **without the actor owning the item** and is **excluded from breakage and usage** (it is the station's tool, not the actor's).
3. `activeCanvasTool` is session-scoped on the `SvelteFabricateApp` instance (set in `show(tab, { activeCanvasTool })`, cleared on close), system-scoped per the rule above, and never written to any persisted run record. With no active tool the payload is null (inert).
4. UI placement: when an active tool is set it is surfaced as a status chip in the tab header bar's right-side context cluster (alongside gathering's weather/time/region), implemented in `ActorSelectTopBar`. The Crafting and planned Alchemy tabs should place the chip in their own header right bar once those headers exist.

### Drop-Time Environment Resolution Precedence

When a Gathering-Task Interactable is dropped, its `environmentId` is resolved by this precedence chain (pure decision in `src/canvas/environmentResolution.js`):

1. **Tagged Scene Region** — the drop point falls inside a Foundry Scene Region flagged `flags.fabricate.environmentId`. One unambiguous existing hit auto-resolves (a `ui.notifications.info` names the resolved environment); multiple hits are ambiguous and fall through to the dialog.
2. **Task `defaultEnvironmentId`** — the task's new optional placement-hint field (a single existing id; a stale id falls through).
3. **GM dialog** — neither auto-source resolved (or the region was ambiguous). Cancel **aborts the spawn** (no region is created).

Holding **Alt** during the drop always **forces the GM dialog**, bypassing tiers 1 and 2.

Note the two distinct uses of an environment id at different lifecycle stages: a **Scene Region `flags.fabricate.environmentId`** is a *drop-time placement* hint used only to resolve which environment a dropped interactable belongs to, whereas `environment.sceneUuid` is the *runtime gathering gate* that ties a composed environment to a scene during attempt validation. They are unrelated mechanisms.

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
- `resolvedTools`
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
- `consumedTools`
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
- `consumedTools`

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
| Tool | `componentId` | Managed item reference |
| Ingredient | `match.type = "component"` | Match type for component-based ingredients |
| Ingredient | `match.componentId` | Component reference inside match object |
| Result | `componentId` | Produced item component reference |
| CraftingSystem | `components` | Array of managed item entries |
| CraftingSystem | `recipeItemDefinitions` | Array of managed recipe-item entries |
| IngredientSet | `ingredientGroups` | Array of ingredient group objects |
| Recipe | `resultGroups` | Array of result group objects |
| Recipe | `recipeItemId` | Recipe item definition reference |
| EssenceDefinition | `sourceComponentId` | Managed component source reference |
| EssenceDefinition | `sourceItemUuid` | Resolved or legacy template item evidence for effect transfer |
| Component | `sourceItemUuid` | Template item reference |
| RecipeItemDefinition | `sourceItemUuid` | Template item reference |
| CraftingSystem | `itemTags` | Array of tag strings |
| Item flag | `toolUsage.timesUsed` | Tool usage tracking (legacy `catalystItemUsage.timesUsed` read as fallback) |

### Legacy Read Aliases

The following legacy aliases are accepted by constructors and normalization functions and are normalized to their canonical counterparts on read:

| Legacy Alias | Canonical Form | Context | Normalization |
|-------------|---------------|---------|---------------|
| `systemItemId` | `componentId` | Tool, Ingredient, Result | Constructor reads `systemItemId` as fallback; normalized to `componentId` |
| `match.type = "systemItem"` | `match.type = "component"` | Ingredient.match | Constructor and migration rewrite type to `"component"` |
| `match.systemItemId` | `match.componentId` | Ingredient.match | Constructor reads as fallback for `componentId` |
| `managedItems` | `components` | CraftingSystem | Normalization and migration rename to `components` |
| `ingredients` (flat array) | `ingredientGroups` | IngredientSet | Constructor wraps each ingredient into a single-option group |
| `results` (flat array) | `resultGroups` | Recipe | Constructor wraps into a single result group |
| `associatedSystemItemId` | `sourceComponentId` | EssenceDefinition | Normalization reads as fallback for the managed source component reference |
| `associatedSystemItemId` | `sourceItemUuid` | Component | Constructor reads as fallback for `sourceItemUuid` |
| `tags` | `itemTags` | CraftingSystem | Normalization reads `tags` as fallback for `itemTags` |
| `catalystItemUsage` / `catalystUses` (bare number) | `toolUsage.timesUsed` | Item flag | Runtime reads `toolUsage` first; when absent, falls back to `catalystItemUsage` (and the bare-number `catalystUses`, coerced to `{ timesUsed }`) so migrated `limitedUses` tools preserve in-flight usage. Legacy flag is never back-filled or cleared. |
| `sourceUuid` | `sourceItemUuid` | Component | Normalization reads as fallback |
| `linkedRecipeItemUuid` | `recipeItemId` | Recipe | Migration/import paths synthesize or resolve a `RecipeItemDefinition` by `sourceItemUuid` within the recipe's crafting system |

### Transitional Write Aliases (Scheduled for Removal)

The following aliases are currently emitted in `toJSON()` / normalization output alongside their canonical counterparts. These are transitional and will be removed in a future version once all dependent UI code paths have been updated:

- `systemItemId` (emitted alongside `componentId` in Tool, Ingredient, Result)
- `ingredients` (emitted alongside `ingredientGroups` in IngredientSet)
- `results` (emitted alongside `resultGroups` in Recipe)
- `associatedSystemItemId` (emitted alongside `sourceComponentId` in EssenceDefinition and alongside `sourceItemUuid` in Component)
- `tags` (emitted alongside `itemTags` in CraftingSystem normalization)
- `sourceUuid` (emitted alongside `sourceItemUuid` in Component normalization)
- UI convenience aliases (`enableTags`, `enableEssences`, `enableCategories`, `enableMultiStepRecipes`, `advancedOptionsEnabled`)

These transitional aliases exist solely for UI code paths that have not yet been updated. They do not represent the canonical data contract and must not be relied upon by new code.

### Retired Aliases (Fully Removed)

The following aliases **must not be emitted by new code** and must be stripped on import/export for backward compatibility with data written by older versions:

| Retired Alias | Removed In | Notes |
|--------------|-----------|-------|
| `enableTiers` | #105 | Tiered crafting mode was removed; this field was hardcoded to `false` and never functionally active. |
| `tiers` | #105 | Tiered crafting mode was removed; this field was hardcoded to `[]` and never functionally active. |

### Testing Requirements

Tests must include:

- Backward-compatible read tests: constructing models from legacy-only data (e.g., `systemItemId` without `componentId`) must produce correct canonical state.
- Canonical-write assertions: `toJSON()` output must include all canonical fields with correct values.
- Migration idempotency: running the `migrateComponentId` migration on already-migrated data must produce identical output.
- Round-trip integrity: `Model.fromJSON(model.toJSON())` must preserve all canonical fields.
