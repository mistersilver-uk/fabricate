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
- Runtime resolution MUST use the active step's fields: `ingredientSets`, `resultGroups`, `toolIds`, `timeRequirement`, and `currencyRequirement`.
- Recipe-level fields serve as fallback ONLY for implicit single-step recipes (where `steps` is empty and the recipe-level fields form one implicit step).
- Step-level fields always take priority. Recipe-level fields are never merged into or combined with step-level fields.
- Recipe-level `toolIds` defined outside any step are additive: they apply to every step in addition to each step's own `toolIds`.

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

**Authoring incomplete-shell contract** (GM authoring path):
- The single-step and multi-step completeness rules above (at least one ingredient set / result group / ordered result) are the *craftability* contract enforced by `Recipe.validate()`.
- The GM authoring path MAY persist a structurally consistent recipe that does not yet satisfy completeness — an *incomplete shell* (e.g. created by "+ Create recipe" then edited for identity only). Persistence gates on structural validity (`Recipe.validateStructure()`) only; structural-integrity errors still block persistence.
- A shell is NOT craftable: `CraftingEngine.craft()` rejects it with the completeness error from `Recipe.validate()` — the load-bearing gate for every incomplete shape, including a shell that has ingredient sets but no result groups. `RecipeManager.evaluateCraftability` additionally returns `canCraft: false` for shells with no ingredient sets (its empty-ingredient-set guard), but that guard alone does not catch a shell whose only gap is missing result groups; `craft()`'s `Recipe.validate()` does. Completing the recipe (adding the missing ingredient sets/result groups) is what makes it craftable.
- Incompleteness is *derived* from the recipe's structure, not stored: an implicit recipe is incomplete when it has no ingredient sets or no result groups; an explicit multi-step recipe is incomplete when any step is missing an ingredient set or result group.

## Step Structure

Each step can define:

- `ingredientSets`
- `resultGroups`
- optional `timeRequirement`
- optional `currencyRequirement`

## Ingredient and Tool Semantics

- A recipe/step is craftable when at least one `IngredientSet` is satisfied (OR across sets).
- Within an `IngredientSet`, all `ingredientGroups` must be satisfied (AND across groups).
- Within an `IngredientGroup`, any one option in `options` satisfies the group (OR within group).
- AND-across-ingredient-sets is not supported.
- OR groups are always enabled and are not feature-toggled.
- Tag-placeholder ingredients (`Ingredient.match.type === "tags"`) are always supported, including simple recipes, when their tag IDs exist in the crafting system's `itemTags` list.
- **Tools** are the required-but-not-always-consumed, potentially-breakable prerequisite primitive (replacing recipe-side catalysts). They are referenced by id at recipe level, step level, and ingredient-set level via `toolIds`; the applicable set for an ingredient set is the union of those ids resolved against the per-system Tools library (`RecipeManager.getToolsForSet`). Every applicable Tool must be present (matched via the shared tool matcher) and pass its optional `requirement` before the recipe is craftable; `RecipeManager.evaluateCraftability` returns `toolStates` and `missing.tools`.
- `CraftingEngine` validates Tools (`_validateTools`) and, on a committed craft, applies tool usage/breakage through the shared breakage runtime (`src/toolBreakageRuntime.js`), recording `usedTools` evidence. Tool usage/breakage is tracked on owned item instances.
- A **virtual-present** Tool injected by a canvas Tool station (keyed by `componentId`, system-scoped) satisfies a Tool prerequisite without the actor owning the item and is excluded from usage and breakage.

## Execution Lifecycle

### Start or Resume

1. Resolve recipe and active step.
2. Re-check visibility/knowledge guards from `006-recipe-visibility.md`.
3. Validate actor and component sources.

### Pre-Resolution Validation

1. Validate ingredient/tool availability.
2. Validate optional essence requirements when enabled.
3. Validate step-level time/currency requirements when enabled.

### Check and Resolution

1. If checks are enabled, execute the provided crafting check macro.
2. Resolve result group by active mode rules in `004-resolution-modes.md`.

### Apply Effects

1. Consume ingredients and apply tool usage/breakage (destroying or flagging-broken exhausted tools) according to success/failure policy.
2. Build result item payloads.
3. Apply property macros per result item when enabled.
4. Create result items.
5. Execute success macro or failure macro.

### Run Progression

- On step success, advance to the next step.
- When the last step succeeds, mark run complete and clean up run state.
- On step failure, mark run failed and clean up run state.

## Alchemy Execution Lifecycle

Applies only when `CraftingSystem.resolutionMode === "alchemy"`.

### Preconditions

1. `features.multiStepRecipes` must be `false`.
2. Candidate recipes must satisfy alchemy signature uniqueness invariants from `002` and `004`.

### Attempt Flow

1. Collect submitted ingredients from actor/component sources.
2. Resolve a unique matching signature.
3. If no signature matches:
   - return user-facing failure message,
   - consume submitted ingredients,
   - record the attempt as failed run history.
4. If signature matches:
   - resolve the target recipe + ingredient set,
   - execute provider-specific routing (`ingredientSet`, `macroOutcome`, or `rollTableOutcome`),
   - if routed output does not resolve to a valid result group, abort with crafting-system misconfiguration error and do not apply player-failure consumption,
   - if routing returns a reserved failure keyword, apply alchemy failure policy (`consumeOnFail`, default true),
   - on success, consume inputs and create outputs normally.
5. Learn flow:
   - recipes are learned only on successful completion,
   - learning runs only when `alchemy.learnOnCraft === true`.
6. Visibility flow:
   - when `learnOnCraft === false`, recipes remain hidden to non-GM users.

### History Recording

1. Completed crafts and failed attempts are recorded.
2. Failed attempts include no-signature failures and failed checks.
3. Player history visibility is controlled by `alchemy.showAttemptHistoryToPlayers`.

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

1. Determine contributing essence IDs from resolved ingredients using the same item-flag-first, component-definition-fallback essence resolution used by craftability checks.
2. For each contributing essence, resolve the essence source from `EssenceDefinition.sourceComponentId` when present, then from that component's `sourceItemUuid` or compatible source evidence when available.
3. If no source component is configured, use legacy `EssenceDefinition.sourceItemUuid` as compatibility input when it resolves directly to a Foundry item.
4. Skip stale source components, missing source item UUIDs, and unresolved legacy source UUIDs without throwing.
5. Transfer collected effects to created result items using the standard effect-transfer pipeline.

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
- `CraftingSystem.salvageResolutionMode` must be one of: `"simple"`, `"routed"`, `"progressive"`. Alchemy is not supported for salvage because salvage always operates on one known component, not blind ingredient submission.

### Implicit Ingredient

Salvage has a single implicit ingredient: `N × this component`, where `N = Component.salvage.ingredientQuantity`. The actor must own at least `N` instances of the component's source item.

### Lifecycle

Salvage is a single-step operation (no multi-step salvage):

1. **Validate**: Confirm the actor owns sufficient quantity of the component and all required Tools (`salvage.toolIds`).
2. **Time Gate** (if `Component.salvage.timeRequirement` is present): Create an active salvage run in `waitingTime` status and defer completion until the required world time has elapsed.
3. **Check** (if `salvageCraftingCheck.enabled`): Execute the salvage crafting check macro.
4. **Resolve**: Determine result group by `salvageResolutionMode` rules (same as recipe resolution per `004-resolution-modes.md`, but using salvage-specific settings).
5. **Consume**: `ingredientQuantity` is always 1 for salvage. Remove that many instances of the component from the actor's inventory. Apply tool usage/breakage as applicable.
6. **Create**: Create result items on the actor.

If `Component.salvage.timeRequirement` is absent, salvage resolves immediately.
If it is present, the run must resume automatically when world time reaches the derived completion timestamp, following the same startup and `updateWorldTime` re-check pattern used for crafting time gates.

### Resolution Mode Application

- **Simple**: One result group. Optional pass/fail check. On success, produce the single result group.
- **Routed**: Check is mandatory. Check macro returns `outcome`. `Component.salvage.outcomeRouting` maps outcomes to result groups.
- **Progressive**: One result group with ordered results. Check is mandatory. Check macro returns numeric `value`. Awards are evaluated using `salvageCraftingCheck.progressive.awardMode`.

### Macro Contracts

Salvage check macros receive the same contract shape as crafting check macros (see `openspec/specs/data-models/spec.md`, Macro Contracts), with the following substitutions:

- `recipe` is replaced by `component` (the component being salvaged).
- `candidateIngredientSet` is replaced by `salvageInput` containing `{ componentId, quantity }`.
- `step` is omitted (salvage is single-step).

Success and failure macros follow the same contracts as crafting, substituting `component` for `recipe` and omitting `step`.

### Failure Consumption Policy

- `salvageCraftingCheck.consumption.consumeComponentOnFail`: if true (default), the component is consumed even on failure.
- `salvageCraftingCheck.consumption.consumeCatalystsOnFail`: a **legacy-named** key (retained to avoid a persisted-key migration); if false (default), Tools are not consumed/broken on failure. Read it as "consume/break tools on fail".

When `Component.salvage.timeRequirement` is present, these policies are evaluated when the timed salvage run completes, not when it is first started.

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

  status: "inProgress" | "waitingTime" | "succeeded" | "failed" | "cancelled",

  startedAt: number,
  updatedAt: number,
  finishedAt?: number,

  timeGate?: {
    requiredSeconds: number,
    availableAt: number,
    initiatedAt: number,
  },

  lastCheckResult?: {
    success: boolean,
    reason: string,
    outcome?: string, // routed mode
    value?: number,   // progressive mode
    data?: object,
  },

  consumedComponents?: Array<{
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
}
```

### Destructive Change Rules

- **Mode change** (`salvageResolutionMode`): Disables any `Component.salvage` definitions that are invalid under the new mode (e.g., switching from routed to simple invalidates salvage defs with outcome routing). Affected components have `salvage.enabled` set to false.
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
- Unit tests for routed provider resolution (`ingredientSet`, `macroOutcome`, `rollTableOutcome`).
- Unit tests for time/currency gate checks.
- Integration tests for end-to-end multistep crafting, resume, and completion.
- Unit tests for alchemy no-signature handling (failure + ingredient consumption + history entry).
- Unit tests for alchemy routing-mismatch handling (misconfiguration error + no player-failure consumption).
- Unit tests for alchemy failure consumption defaults and overrides.
- Unit tests for no-multi-step enforcement in alchemy mode.
- Integration tests for alchemy learn-on-success visibility behavior.
- Unit tests for salvage lifecycle (validate, check, resolve, consume, create).
- Unit tests for salvage resolution modes (simple, routed, progressive).
- Unit tests for salvage time-gated runs when `Component.salvage.timeRequirement` is present.
- Unit tests for timed salvage completion after world-time advancement.
- Unit tests for salvage destructive change handling.
- Unit tests for validation accepting empty recipe-level `ingredientSets` and `resultGroups` when explicit steps are present.
- Unit tests for validation rejecting empty step-level `ingredientSets` or `resultGroups` within explicit steps.
- Unit tests for `getExecutionSteps()` returning step-level data and ignoring empty recipe-level fields for multi-step recipes.
- Regression test: an explicit multi-step recipe with empty recipe-level sets and fully populated steps passes validation and crafts successfully end-to-end.
- UI render tests: recipe detail view does not render empty sections when recipe-level sets are absent and steps are present.
- Unit tests for run-history ordering: the newest terminal run appears at index 0 in `history`.
- Unit tests for retention-limit boundary: inserting the 51st entry causes the oldest entry to be discarded, and `history.length` never exceeds 50.
- Unit tests confirming truncation applies identically to both `craftingRuns.history` and `salvageRuns.history`.
