# Specification 005: Recipes and Steps

## Purpose

Define recipe structure, step execution lifecycle, and recipe-run behaviour.
This spec does not redefine mode semantics; mode-specific resolution is defined in `004-resolution-modes.md`.

## Recipe Structure

- Recipes belong to exactly one crafting system.
- If `features.multiStepRecipes === false`, a recipe behaves as one implicit step backed by recipe-level fields.
- If `features.multiStepRecipes === true`, a recipe has explicit ordered `steps` and must keep at least one step.

### Multi-Step Recipe Field Precedence

When `features.multiStepRecipes === true` and `recipe.steps.length > 0`, the recipe is an **explicit multi-step recipe**. The following rules apply:

- Recipe-level `ingredientSets` and `resultGroups` MAY be empty arrays or absent entirely.
- Runtime resolution MUST use the active step's fields: `ingredientSets`, `resultGroups`, `catalysts`, `timeRequirement`, `currencyRequirement`, and `outcomeRouting`.
- Recipe-level fields serve as fallback ONLY for implicit single-step recipes (where `steps` is empty and the recipe-level fields form one implicit step).
- Step-level fields always take priority. Recipe-level fields are never merged into or combined with step-level fields.
- Recipe-level `catalysts` defined outside any step are additive: they apply to every step in addition to each step's own catalysts.

### Validation Contracts

Validation rules differ between single-step and explicit multi-step recipes:

**Single-step (implicit) contract** (`steps` is empty):
- Recipe-level `ingredientSets` MUST have at least one entry.
- Recipe-level `resultGroups` MUST have at least one entry.
- Recipe-level fields define the single implicit step.

**Explicit multi-step contract** (`steps.length > 0`):
- `steps` array MUST have at least one entry.
- Each step MUST have at least one `ingredientSet` with at least one `ingredientGroup`.
- Each step MUST have at least one `resultGroup` with at least one result.
- Recipe-level `ingredientSets` and `resultGroups` are NOT validated and MAY be empty or absent.
- Recipe-level `resultGroups` requirement is waived when explicit steps are present.

## Step Structure

Each step can define:

- `ingredientSets`
- `resultGroups`
- optional `timeRequirement`
- optional `currencyRequirement`
- optional `outcomeRouting` (tiered override)

## Ingredient and Catalyst Semantics

- A recipe/step is craftable when at least one `IngredientSet` is satisfied (OR across sets).
- Within an `IngredientSet`, all `ingredientGroups` must be satisfied (AND across groups).
- Within an `IngredientGroup`, any one option in `options` satisfies the group (OR within group).
- AND-across-ingredient-sets is not supported.
- OR groups are always enabled and are not feature-toggled.
- Tag-placeholder ingredients (`Ingredient.match.type === "tags"`) are supported when `features.itemTags` is enabled, including simple recipes.
- Catalysts are defined at the recipe level, step level, and inside each `IngredientSet.catalysts`.
- Catalyst degradation/usage is tracked on owned item instances.

## Execution Lifecycle

### Start or Resume

1. Resolve recipe and active step.
2. Re-check visibility/knowledge guards from `006-recipe-visibility.md`.
3. Validate actor and component sources.

### Pre-Resolution Validation

1. Validate ingredient/catalyst availability.
2. Validate optional essence requirements when enabled.
3. Validate step-level time/currency requirements when enabled.

### Check and Resolution

1. If checks are enabled, execute the provided crafting check macro.
2. Resolve result group by active mode rules in `004-resolution-modes.md`.
3. For tiered mode, use step-level routing if present; otherwise recipe-level routing.

### Apply Effects

1. Consume ingredients and destroy exhausted catalysts according to success/failure policy.
2. Build result item payloads.
3. Apply property macros per result item when enabled.
4. Create result items.
5. Execute success macro or failure macro.

### Run Progression

- On step success, advance to the next step.
- When the last step succeeds, mark run complete and clean up run state.
- On step failure, mark run failed and clean up run state.

## Time and Currency Requirements

- If the system-level requirement toggle is disabled, step-level values are ignored.
- `timeRequirement` stores duration fields (`minutes`, `hours`, `days`, `months`, `years`) to capture GM intent.
- Runtime execution normalizes duration fields to a world-time target timestamp for gate checks.
- A step with time gating is incomplete until world time reaches the target completion timestamp.
- Fabricate listens to the `updateWorldTime` hook, and checks game time on startup, to mark recipes and steps with a time requirement as completed, and subsequently notify users.
- Currency provider behaviour is configured by `CraftingSystem.requirements.currency`:
  - `system`: use adapter.
  - `macro`: use configured macros.

## Effect Transfer Semantics

When `recipe.transferEffects === true` and essences are enabled:

1. Determine contributing essence IDs from resolved ingredients.
2. For each contributing essence, if `EssenceDefinition.sourceItemUuid` resolves, collect active effects from that item.
3. Transfer collected effects to created result items using the standard effect-transfer pipeline.

Transfer scaling by essence quantity is out of scope for this phase.

## Persistence and Run State

- In-progress runs may be stored under `Actor.flags.fabricate.craftingRuns`.
- Run records should include recipe ID, current step index, selected ingredient data, and time-gate state.
- Runs must be cleaned up when recipe/system destructive operations invalidate them (see `007`).

## Run-History Retention

The actor-flag shape for `craftingRuns` and `salvageRuns` is defined in `002-data-models.md`.

### Retention Limit

- Both `craftingRuns.history` and `salvageRuns.history` are capped at a maximum of **50** entries per actor.
- The limit is a fixed module constant, not user-configurable.
- The default value is **50**.

### Ordering

- History arrays are ordered **most-recent-first** (newest entry at index 0).
- When a run reaches a terminal status (`succeeded`, `failed`, or `cancelled`), it is removed from `active` and prepended to `history`.

### Truncation Behaviour

- After prepending a new entry, if `history.length` exceeds the retention limit, the array is truncated to the limit length by discarding the oldest entries (those at the highest indices).
- Truncation is applied immediately on every terminal-state transition; no deferred cleanup.

## Salvage Execution

### Purpose

Define the lifecycle and semantics for salvage operations — the inverse of crafting. Instead of combining ingredients into a result, salvage decomposes a single component into one or more results.

### Prerequisites

- `CraftingSystem.features.salvage` must be true.
- `Component.salvage.enabled` must be true.
- `CraftingSystem.salvageResolutionMode` must be one of: `"simple"`, `"tiered"`, `"progressive"`. Mapped mode is not supported for salvage.

### Implicit Ingredient

Salvage has a single implicit ingredient: `N × this component`, where `N = Component.salvage.ingredientQuantity`. The actor must own at least `N` instances of the component's source item.

### Lifecycle

Salvage is a single-step operation (no multi-step salvage):

1. **Validate**: Confirm the actor owns sufficient quantity of the component and all required catalysts.
2. **Check** (if `salvageCraftingCheck.enabled`): Execute the salvage crafting check macro.
3. **Resolve**: Determine result group by `salvageResolutionMode` rules (same as recipe resolution per `004-resolution-modes.md`, but using salvage-specific settings).
4. **Consume**: Remove `ingredientQuantity` instances of the component from the actor's inventory. Degrade/exhaust catalysts as applicable.
5. **Create**: Create result items on the actor.

### Resolution Mode Application

- **Simple**: One result group. Optional pass/fail check. On success, produce the single result group.
- **Tiered**: Check is mandatory. Check macro returns `outcome`. `Component.salvage.outcomeRouting` maps outcomes to result groups.
- **Progressive**: One result group with ordered results. Check is mandatory. Check macro returns numeric `value`. Awards are evaluated using `salvageCraftingCheck.progressive.awardMode`.

### Macro Contracts

Salvage check macros receive the same contract shape as crafting check macros (see spec/002 Macro Contracts), with the following substitutions:

- `recipe` is replaced by `component` (the component being salvaged).
- `candidateIngredientSet` is replaced by `salvageInput` containing `{ componentId, quantity }`.
- `step` is omitted (salvage is single-step).

Success and failure macros follow the same contracts as crafting, substituting `component` for `recipe` and omitting `step`.

### Failure Consumption Policy

- `salvageCraftingCheck.consumption.consumeComponentOnFail`: if true (default), the component is consumed even on failure.
- `salvageCraftingCheck.consumption.consumeCatalystsOnFail`: if false (default), catalysts are not degraded on failure.

### SalvageRun Actor Flag

Active and historical salvage runs are stored alongside crafting runs:

```js
Actor.flags.fabricate.salvageRuns = {
  active: {
    [runId: string]: SalvageRun,
  },
  history: SalvageRun[],
}
```

```js
SalvageRun = {
  id: string,
  actorUuid: string,
  userId: string,
  craftingSystemId: string,
  componentId: string,

  status: "inProgress" | "succeeded" | "failed" | "cancelled",

  startedAt: number,
  updatedAt: number,
  finishedAt?: number,

  lastCheckResult?: {
    success: boolean,
    reason: string,
    outcome?: string, // tiered mode
    value?: number,   // progressive mode
    data?: object,
  },

  consumedComponents?: Array<{
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
}
```

### Destructive Change Rules

- **Mode change** (`salvageResolutionMode`): Disables any `Component.salvage` definitions that are invalid under the new mode (e.g., switching from tiered to simple invalidates salvage defs with outcome routing). Affected components have `salvage.enabled` set to false.
- **Feature disable** (`features.salvage = false`): Cancels all active salvage runs. Salvage definitions on components are preserved but inert.
- **Component deletion**: Cleans up any active salvage runs referencing the deleted component.

## UI Rendering for Multi-Step Recipes

When recipe-level `ingredientSets` or `resultGroups` are empty:

- The recipe detail/summary view MUST NOT render empty ingredient or result sections. If recipe-level sets are absent, display the active step's sets or a step overview instead.
- Recipe list views SHOULD derive summary information (e.g., total ingredient count, result count) from the aggregate of all steps when recipe-level sets are empty.
- The recipe editor for multi-step recipes MUST present step-level editing controls and MUST NOT require recipe-level `ingredientSets` or `resultGroups` to be populated.
- Step navigation and status indicators MUST remain functional regardless of whether recipe-level sets are populated.

## Testing Requirements

- Unit tests for single-step and multistep behaviour.
- Unit tests for ingredient set/group semantics:
  - OR across ingredient sets
  - AND across groups within a set
  - OR within group options
- Unit tests for tiered step-level routing override.
- Unit tests for time/currency gate checks.
- Integration tests for end-to-end multistep crafting, resume, and completion.
- Unit tests for salvage lifecycle (validate, check, resolve, consume, create).
- Unit tests for salvage resolution modes (simple, tiered, progressive).
- Unit tests for salvage destructive change handling.
- Unit tests for validation accepting empty recipe-level `ingredientSets` and `resultGroups` when explicit steps are present.
- Unit tests for validation rejecting empty step-level `ingredientSets` or `resultGroups` within explicit steps.
- Unit tests for `getExecutionSteps()` returning step-level data and ignoring empty recipe-level fields for multi-step recipes.
- Regression test: an explicit multi-step recipe with empty recipe-level sets and fully populated steps passes validation and crafts successfully end-to-end.
- UI render tests: recipe detail view does not render empty sections when recipe-level sets are absent and steps are present.
- Unit tests for run-history ordering: the newest terminal run appears at index 0 in `history`.
- Unit tests for retention-limit boundary: inserting the 51st entry causes the oldest entry to be discarded, and `history.length` never exceeds 50.
- Unit tests confirming truncation applies identically to both `craftingRuns.history` and `salvageRuns.history`.
