# Specification 005: Recipes and Steps

## Purpose

Define recipe structure, step execution lifecycle, and recipe-run behaviour.
This spec does not redefine mode semantics; mode-specific resolution is defined in `004-resolution-modes.md`.

## Recipe Structure

- Recipes belong to exactly one crafting system.
- If `features.multiStepRecipes === false`, a recipe behaves as one implicit step backed by recipe-level fields.
- If `features.multiStepRecipes === true`, a recipe has explicit ordered `steps` and must keep at least one step.

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

## Testing Requirements

- Unit tests for single-step and multistep behaviour.
- Unit tests for ingredient set/group semantics:
  - OR across ingredient sets
  - AND across groups within a set
  - OR within group options
- Unit tests for tiered step-level routing override.
- Unit tests for time/currency gate checks.
- Integration tests for end-to-end multistep crafting, resume, and completion.
