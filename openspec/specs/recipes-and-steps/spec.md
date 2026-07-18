# Recipes and Steps

## Purpose

Define recipe structure, step execution lifecycle, and recipe-run behaviour.
This spec does not redefine mode semantics; mode-specific resolution is defined in `resolution-modes/spec.md`.

## Recipe Structure

- Recipes belong to exactly one crafting system.
- If `features.multiStepRecipes === false`, a recipe behaves as one implicit step backed by recipe-level fields.
- If `features.multiStepRecipes === true`, a recipe has explicit ordered `steps` and must keep at least one step.

### Multi-Step Recipe Field Precedence

When `features.multiStepRecipes === true` and `recipe.steps.length > 0`, the recipe is an **explicit multi-step recipe**.
The following rules apply:

- Recipe-level `ingredientSets` and `resultGroups` MAY be empty arrays or absent entirely.
- Runtime resolution MUST use the active step's fields: `ingredientSets`, `resultGroups`, `toolIds`, and `timeRequirement`.
- Recipe-level fields serve as fallback ONLY for implicit single-step recipes (where `steps` is empty and the recipe-level fields form one implicit step).
- Step-level fields always take priority.
Recipe-level fields are never merged into or combined with step-level fields.
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
- The GM authoring path MAY persist a structurally consistent recipe that does not yet satisfy completeness — an *incomplete shell* (e.g. created by "+ Create recipe" then edited for identity only).
Persistence gates on structural validity (`Recipe.validateStructure()`) only; structural-integrity errors still block persistence.
- A shell is NOT craftable: `CraftingEngine.craft()` rejects it with the completeness error from `Recipe.validate()` — the load-bearing gate for every incomplete shape, including a shell that has ingredient sets but no result groups. `RecipeManager.evaluateCraftability` additionally returns `canCraft: false` for shells with no ingredient sets (its empty-ingredient-set guard), but that guard alone does not catch a shell whose only gap is missing result groups; `craft()`'s `Recipe.validate()` does.
Completing the recipe (adding the missing ingredient sets/result groups) is what makes it craftable.
- Incompleteness is *derived* from the recipe's structure, not stored: an implicit recipe is incomplete when it has no ingredient sets or no result groups; an explicit multi-step recipe is incomplete when any step is missing an ingredient set or result group.

## Step Structure

Each step can define:

- `ingredientSets`
- `resultGroups`
- optional `timeRequirement`

## Ingredient and Tool Semantics

- A recipe/step is craftable when at least one `IngredientSet` is satisfied (OR across sets).
- Within an `IngredientSet`, all `ingredientGroups` must be satisfied (AND across groups).
- Within an `IngredientGroup`, any one option in `options` satisfies the group (OR within group).
- **Order-independence (the user-facing guarantee):** an ingredient set is satisfiable iff there EXISTS an assignment of items to its AND-groups that satisfies every group (one option each, respecting per-option quantity and the shared no-double-count ledger).
The resolver finds such an assignment whenever one exists — including reassigning a dual-purpose item (one that could satisfy more than one group) away from the group that would strand another — so craftability does NOT depend on inventory or group iteration order.
- **Items strictly beat currency (the ordering MECHANISM):** a currency option is chosen for a group only when no item/essence assignment across the set can satisfy that group; currency options (free — no ledger draw) are considered only after every item/essence branch is exhausted.
- **Deterministic pick:** the greedy author-order assignment whenever one satisfies (byte-for-byte the pre-663 behaviour, zero churn), otherwise the first satisfying assignment found by an item-level search under a fixed author-order traversal (per group, non-currency options in author order then currency; per option, the greedy item subset first then alternatives).
The search is bounded by a generous node/subset safeguard; on the rare bound-hit it degrades to the greedy author-order pass (never worse than the pre-663 behaviour, never a double-count) — an implementation safeguard, not user-facing behaviour.
- A player MAY override which option a multi-option group consumes, and — for a tag option matching more than one held stack — which specific held item, via `IngredientSet.resolveIngredientSelection`'s `optionOverrides` argument (keyed by `group.id` → `{ optionIndex, heldItemId? }`).
An override is honoured whether satisfiable or not: a satisfiable option wins; an insufficient option reports that option's have/need and blocks the craft with the missing-materials message (it is never silently redirected to a different option).
An explicit override MAY select a currency alternative over an available item option (routing to `currencySpends` when affordable); with no override the default items-first resolution is byte-for-byte unchanged.
The same override threads through both the display (`RecipeManager.evaluateCraftability`) and the engine consumption (`CraftingEngine`), so the ingredient tiles always reflect the option/stack the craft consumes.
- AND-across-ingredient-sets is not supported.
- OR groups are always enabled and are not feature-toggled.
- Tag-placeholder ingredients (`Ingredient.match.type === "tags"`) are always supported, including simple recipes, when their tag IDs exist in the crafting system's `itemTags` list.
- An `IngredientGroup` option MAY be an essence alternative (`Ingredient.match.type === "essence"`), consuming essence-carrying items to meet `match.amount`, and participates in `optionOverrides` like any other option — so "component OR essence" is authorable.
The legacy per-set `IngredientSet.essences` map is a back-compat read for one release (the 1.17.0 migration folds each positive entry into a single-option essence group).
- **Tools** are the required-but-not-always-consumed, potentially-breakable prerequisite primitive (replacing recipe-side catalysts).
They are referenced by id at recipe level, step level, and ingredient-set level via `toolIds`; the applicable set for an ingredient set is the union of those ids resolved against the per-system Tools library (`RecipeManager.getToolsForSet`).
Every applicable Tool must be present (matched via the shared tool matcher) and pass its optional `requirement` before the recipe is craftable; `RecipeManager.evaluateCraftability` returns `toolStates` and `missing.tools`.
- `CraftingEngine` validates Tools (`_validateTools`) and, on a committed craft, applies tool usage/breakage through the shared breakage runtime (`src/toolBreakageRuntime.js`), recording `usedTools` evidence.
Tool usage/breakage is tracked on owned item instances.
- A `toolIds` entry resolves to a first-class per-system library Tool that carries its OWN source references and durable `flags.fabricate.roles[systemId].toolId` identity (issue 561); tool presence and breakage selection match the owned item against the Tool's own identity, not through a managed component.
- Tool **presence** validation matches via the wide shared tool matcher (durable `roles[systemId].toolId`, the Tool's own source references, then the Tool's snapshot-name fallback), but the item **selected for usage or breakage** must additionally match the tool by **durable-identity matching** per `data-models` (the Tool's own `roles[systemId].toolId`, or the item's own uuid/compendium source — never a transitive `_stats.duplicateSource` reference and never name alone).
A presence-only match is spared from usage/breakage and recorded as skipped, and where an actor owns both, the durable-identity item is the one used or broken.
- A **virtual-present** Tool injected by a canvas Tool station (keyed by `componentId`, system-scoped) satisfies a Tool prerequisite without the actor owning the item and is excluded from usage and breakage.

## Execution Lifecycle

### Start or Resume

1. Resolve recipe and active step.
2. Re-check visibility/knowledge guards from `recipe-visibility/spec.md`.
3. Validate actor and component sources.

### Pre-Resolution Validation

1. Validate ingredient/tool availability, including essence-option requirements inside ingredient-set resolution (an essence option is satisfied by consuming essence-carrying items to meet `match.amount`).
2. Honor the legacy per-set essence map for one release (back-compat read) alongside the essence options.
3. Validate step-level time requirements when enabled.

### Check and Resolution

1. If a crafting check is required or enabled, run it to produce a check result
   (`{ success, outcome, value, data }`).
   The check is **engine-evaluated** when the system's check config for the active mode
   carries a roll formula:
   the engine rolls the formula, resolves the base DC,
   maps the roll to the configured per-mode outcome, and surfaces an authored-crit/tier
   `breakTools` flag.
   - **Simple / alchemy**: roll the simple pass/fail formula and compare against the resolved DC
     (meet-or-exceed / exceed), yielding `success`.
   - **Routed by check (`routedByCheck` mode)**: roll the routed formula and map the total onto a configured
     outcome tier (relative DC deltas or fixed value ranges);
     the matched tier's NAME is the `outcome` that drives result routing.
     The base DC is resolved the SAME way as the simple check
     (the recipe's selected tier or a dynamic-DC macro, not a flat configured DC),
     so a recipe tier or dynamic DC shifts every relative threshold.
   - **Routed by ingredients (`routedByIngredients` mode)**: the result group is selected by the chosen
     ingredient set, so the check is OPTIONAL — when `craftingCheck.simple.rollFormula` is authored it runs
     as a pass/fail layer that never changes which result group is produced; with no formula no check runs.
     (It uses the shared `craftingCheck.simple` slot, not `craftingCheck.routed`.)
   - **Progressive**: roll the progressive formula;
     its total is the numeric `value` spent against ordered result difficulties.

   A crafting check is not optional-by-absence.
   Simple mode always carries a system-level check that is either active or deactivated;
   `routedByCheck` and progressive modes REQUIRE a configured check, while `routedByIngredients` (like simple) has an OPTIONAL check.
   A check is **usable** iff the active mode's check config carries an authored roll formula
   (`simple.rollFormula` / `routed.rollFormula` / `progressive.rollFormula`), in which case it is
   engine-evaluated as above; `craftingCheck.enabled` (or `features.craftingChecks`) is only the on/off toggle
   gating the OPTIONAL **simple**-mode check, not a proxy for "the check works" — `routedByIngredients` and
   alchemy-Simple run on an authored formula alone, ungated by that toggle.
   The deprecated macro / built-in adapter check sources (root `macroUuid`, `successMacroUuid`,
   `failureMacroUuid`, `checkSource`, and the `builtIn` adapter config) were removed in 1.8.0;
   there is no longer a `checkSource` axis. (The dynamic-DC macro on `simple.macroUuid` is a
   different feature and is retained.)
   A mode that requires a check but has no roll formula configured is a system misconfiguration
   surfaced by system-level validation (and a loud runtime failure), not a silent no-op.
   A `breakTools` flag is honoured for forced tool breakage ONLY from engine-evaluated
   roll-formula checks (`engineEvaluated === true`).

   The check/tier/trigger data-model shapes (`RoutedCheck`, `CheckBreakage` triggers, `thresholdMode`,
   `breakTools`, recipe tiers, dynamic DC) are defined in `data-models/spec.md`;
   the per-mode routing rules (including `ResultGroup.checkOutcomeIds` tier→result-group
   assignment) are defined in `resolution-modes/spec.md`.

2. Resolve the result group by active mode rules in `resolution-modes/spec.md`.
   For `routedByCheck` mode, an authored success-outcome tier that resolves by name but
   that no result group assigns via `checkOutcomeIds` (when the recipe otherwise uses tier
   assignment) yields a distinct **unrouted-tier** diagnostic rather than silently falling back
   to outcome-name matching;
   a recipe that uses no `checkOutcomeIds` assignment still falls back to name matching.
   A matched attempt whose outcome resolves to NO valid result group — an unrouted tier
   (above) or an unmatched success outcome name — is a crafting-system misconfiguration:
   for an instant (non-timed) step the craft aborts BEFORE any consumption (a zero-mutation
   abort — no ingredients, currency, or tools consumed or broken) and reports failure, never
   a player success with zero items.
   Timed exception: a time-gated step consumes at START (the check outcome is unknowable
   until the gate matures), so the same misconfiguration detected at FINISH records a step
   FAILURE with no refund and still reports failure — never a false success with zero items.

### Apply Effects

1. Consume ingredients and apply tool usage/breakage (destroying or flagging-broken exhausted tools) according to success/failure policy.
2. Build result item payloads.
3. Apply property macros per result item when enabled.
4. Create result items.

### Run Progression

- On step success, advance to the next step.
- When the last step succeeds, mark run complete and clean up run state.
- On step failure, mark run failed and clean up run state.

#### Player-Initiated Advance ("Trigger Next Step")

Crafting is the only player-triggerable run type.
A matured crafting step — one whose `timeGate.availableAt` has been reached, or that never carried a time gate — does NOT auto-advance: it requires a manual player trigger.
The player-facing Journal screen exposes this as a "Trigger Next Step" action (see `ui-integration/spec.md` *Journal App*).

- Triggering re-invokes the crafting flow for the run's id (`advanceCraftingRun({ actorId, runId, recipeId })` re-enters `craft(actor, recipe, { runId, componentSourceActors })`), so the same engine path that started the run advances it.
- On step success the engine advances `currentStepIndex` to the next step, or marks the run `succeeded` and cleans up run state when the last step succeeds.
- On step failure the engine fails the WHOLE run (`failed`) and cleans up run state; there is no per-step retry.
- Advancing requires ownership of BOTH the crafting actor (the craft writes results to it via `createEmbeddedDocuments`) AND every component-source actor (resolved from the run's persisted `componentSourceActorUuids`; an empty resolution falls back to the crafting actor's own inventory).
An unknown crafting actor is likewise blocked.
A non-owner is told to ask an owner or GM rather than the run advancing silently, because the craft writes directly to the actors with no socket-to-GM relay.

#### Maturity Asymmetry Between Run Types

A matured crafting step waits for the manual trigger above.
By contrast, matured gathering and salvage runs **auto-resolve** on world time: their timed-completion path resolves them without any player action (see *Salvage Execution* below and `gathering-and-harvesting/spec.md`).
The Journal therefore presents gathering and salvage runs as auto-resolving and offers them no trigger button.

## Alchemy Execution Lifecycle

Applies only when `CraftingSystem.resolutionMode === "alchemy"`.

### Preconditions

1. `features.multiStepRecipes` must be `false`.
2. Candidate recipes must satisfy alchemy signature uniqueness invariants from `data-models/spec.md` and `resolution-modes/spec.md`.

### Attempt Flow

1. Collect submitted ingredients from actor/component sources.
2. Resolve a unique matching signature.
3. If no signature matches:
   - return user-facing failure message,
   - consume submitted ingredients only when `alchemy.consumeOnFail !== false` (default true), consistent with `resolution-modes/spec.md` §Alchemy Mode,
   - record the attempt as failed run history.
4. If signature matches:
   - resolve the target recipe + ingredient set,
   - execute provider-specific routing (`ingredientSet` or `check`),
   - if routed output does not resolve to a valid result group, abort with a crafting-system misconfiguration error BEFORE any consumption — no ingredients, currency, or tools are consumed or broken — and report failure (never a player success with zero items),
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
4. A no-signature fizzle records a failed, recipe-less run-history entry (`recipeId: null`, `isFizzle: true`, `status: "failed"`).
   The entry is archived straight to history and never enters the active-runs container.
   Recording is unconditional; the entry is player-visible only when `alchemy.showAttemptHistoryToPlayers` is enabled.
   It carries no recipe or signature information, so it can never leak an undiscovered recipe, and is pruned only when its crafting system becomes invalid (not as an unknown-recipe run).

The `alchemy.showAttemptHistoryToPlayers` flag now governs two distinct concepts:

- Its existing role gates player **visibility** of the always-recorded run/attempt history (default true).
- Additionally, it gates **recording** of the per-character workbench dead-end memory (`Actor.flags.fabricate.alchemyDeadEnds`) — an append-only, deduped array of canonical `componentId:qty|...` signature keys per crafting system, written on a fizzled brew.

The dead-end memory is distinct from run history: it is leak-safe (a fizzle matches no enabled recipe, so it grants no recipe visibility) and is consumed only by the workbench status model to flip an `untried` bench to `no-reaction`.

## Time and Currency Requirements

- If the system-level requirement toggle is disabled, step-level values are ignored.
- `timeRequirement` stores duration fields (`minutes`, `hours`, `days`, `months`, `years`) to capture GM intent.
- Runtime execution normalizes duration fields to a world-time target timestamp for gate checks.
- A step with time gating is incomplete until world time reaches the target completion timestamp.
- Fabricate listens to the `updateWorldTime` hook, and checks game time on startup, to mark recipes and steps with a time requirement as completed, and subsequently notify users.

## Effect Transfer Semantics

When `recipe.transferEffects === true` and essences are enabled:

1. Determine contributing essence IDs from resolved ingredients using the same item-flag-first, component-definition-fallback essence resolution used by craftability checks.
2. For each contributing essence, resolve the essence source from `EssenceDefinition.sourceComponentId` when present, then from that component's `originItemUuid` or compatible source evidence when available.
3. If no source component is configured, use legacy `EssenceDefinition.sourceItemUuid` as compatibility input when it resolves directly to a Foundry item.
4. Skip stale source components, missing source item UUIDs, and unresolved legacy source UUIDs without throwing.
5. Transfer collected effects to created result items using the standard effect-transfer pipeline.

Transfer scaling by essence quantity is out of scope for this phase.

## Persistence and Run State

- In-progress runs may be stored under `Actor.flags.fabricate.craftingRuns`.
- Run records should include recipe ID, current step index, selected ingredient data, and time-gate state.
- Runs must be cleaned up when recipe/system destructive operations invalidate them (see `destructive-changes-and-migrations/spec.md`).

## Run-History Retention

The `craftingRuns` actor-flag shape is defined in `data-models/spec.md` (*Crafting Runs Flag*); the `salvageRuns` shape is defined in this spec (see *SalvageRun Actor Flag* below).

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

Define the lifecycle and semantics for salvage operations — the inverse of crafting.
Instead of combining ingredients into a result, salvage decomposes a single component into one or more results.

### Prerequisites

- `CraftingSystem.features.salvage` must be true.
- `Component.salvage.enabled` must be true.
- `CraftingSystem.salvageResolutionMode` must be one of: `"simple"`, `"routed"`, `"progressive"`.
Alchemy is not supported for salvage because salvage always operates on one known component, not blind ingredient submission.

### Implicit Ingredient

Salvage has a single implicit ingredient: `N × this component`, where `N = Component.salvage.ingredientQuantity`.
The actor must own at least `N` instances of the component's source item.

### Lifecycle

Salvage is a single-step operation (no multi-step salvage):

1. **Validate**: Confirm the actor owns sufficient quantity of the component and all required Tools (`salvage.toolIds`).
2. **Time Gate** (if `Component.salvage.timeRequirement` is present): Create an active salvage run in `waitingTime` status and defer completion until the required world time has elapsed.
3. **Check**: Roll the salvage check for the active `salvageResolutionMode`.
A salvage check is usable only when its mode has an authored roll formula (`salvageCraftingCheck.simple|routed|progressive.rollFormula`); the optional simple check runs only when `salvageCraftingCheck.simple.rollFormula` is authored.
Routed and progressive salvage require their roll formula and fail loudly (with zero mutation) when it is missing.
4. **Resolve**: Determine result group by `salvageResolutionMode` rules (same as recipe resolution per `resolution-modes/spec.md`, but using salvage-specific settings).
5. **Consume**: remove N = `Component.salvage.ingredientQuantity` instances (default 1, any positive integer) of the component from the actor's inventory, matching §Implicit Ingredient and `data-models/spec.md`.
Apply tool usage/breakage as applicable.
6. **Create**: Create result items on the actor.
7. **Chat**: when `features.chatOutput` is enabled, post a salvage result card on resolved success or rolled failure only (never on cancelled, misconfigured, or time-gated outcomes); card creation failures are non-fatal.
See the `ui-integration` chat card contract.

If `Component.salvage.timeRequirement` is absent, salvage resolves immediately.
If it is present, the run must resume automatically when world time reaches the derived completion timestamp, following the same startup and `updateWorldTime` re-check pattern used for crafting time gates.

### Resolution Mode Application

- **Simple**: One result group.
Optional pass/fail check.
On success, produce the single result group.
- **Routed**: Check is mandatory and requires an authored `salvageCraftingCheck.routed.rollFormula`.
  The engine-evaluated routed salvage check rolls the configured formula and maps the total onto
  an outcome tier whose NAME is the `outcome`; with no authored formula the salvage fails loudly
  (zero mutation).
  `Component.salvage.outcomeRouting` maps outcomes to result groups.
- **Progressive**: One result group with ordered results.
  Check is mandatory and requires an authored `salvageCraftingCheck.progressive.rollFormula`.
  The engine-evaluated progressive salvage check rolls the configured formula to produce the
  numeric `value`; with no authored formula the salvage fails loudly (zero mutation).
  Awards are evaluated using `salvageCraftingCheck.progressive.awardMode`.
  The order the awards are spent down is governed by `Component.salvage.allowPlayerResultReorder`
  (default `true`) — see `resolution-modes` §Player Reorder for the full contract.
  The order is read from the run record's captured `resultOrder`, never from settings, and a
  salvage with no run record uses the authored order with no settings fallback.
  The permission is gated at read time, so a GM toggling it off mid-run takes effect on that run.
  The Inventory tab's salvage panel (`InventorySalvagePanel.svelte`) is the first UI caller of
  `CraftingEngine.salvage`: players reorder Progressive stages via the store's reorder/reset
  actions persisted under the `salvage:<componentId>` scope, honouring
  `Component.salvage.allowPlayerResultReorder` (cross-reference `ui-integration` §Player Salvage Surface).
  The GM toggle is authored policy, exported and honoured.

### Failure Consumption Policy

- `salvageCraftingCheck.consumption.consumeComponentOnFail`: if true (default), the component is consumed even on failure.
- `salvageCraftingCheck.consumption.breakToolsOnFail`: if false (default), Tools are not broken on failure.
It was renamed from the legacy `consumeCatalystsOnFail` by the 1.7.0 migration (normalization still reads the legacy key as a fallback).

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
  userId: string,           // the user who STARTED the run
  craftingSystemId: string,
  componentId: string,

  // The player's progressive result order, CAPTURED at run start (a list of result ids,
  // or null when there was none). The award path reads the order from here and never
  // from settings, so a world-time resume awards down the starting user's order however
  // wins the resume race. See resolution-modes §Player Reorder.
  resultOrder?: string[] | null,

  status: "inProgress" | "waitingTime" | "succeeded" | "failed" | "cancelled",

  startedAt: number,
  updatedAt: number,
  finishedAt?: number,

  timeGate?: {
    requiredSeconds: number,
    availableAt: number,
    initiatedAt: number,
  },

  // Persisted field is `checkResult` (no `reason` key); the failure text is the
  // separate top-level `failureReason` below.
  checkResult?: {
    success: boolean,
    outcome?: string, // routed mode
    value?: number,   // progressive mode
    data?: object,
  },
  failureReason?: string, // top-level failure text (null on success)

  consumedComponents?: Array<{
    itemUuid: string, // no `actorUuid` on either salvage path
    quantity: number,
  }>,
  // Flattened tool-breakage evidence shared with crafting (written by
  // `_applyToolBreakage`). `componentId` and `broken` are load-bearing for the
  // salvage chat card and the Run Journal.
  usedTools?: Array<{
    actorUuid: string | null,
    itemUuid: string | null,
    quantity: number,
    componentId: string | null,
    broken: boolean,
    // checkDriven-only evidence and skip/marker fields, as in the crafting
    // CraftingRunStepState.usedTools shape (data-models):
    authority?: string,
    reason?: string,
    triggerId?: string,
    checkId?: string,
    virtual?: boolean,
    spared?: boolean,
    skippedImmune?: boolean,
  }>,
  createdResults?: Array<{
    itemUuid: string,
    // the producing component id, or `null` for pre-fix historical runs
    componentId: string | null,
    quantity: number,
    name?: string | null, // captured at award time; absent on pre-capture historical records
    img?: string | null,  // captured at award time; absent on pre-capture historical records
  }>,
}
```

### Destructive Change Rules

- **Mode change** (`salvageResolutionMode`): Disables any `Component.salvage` definitions that are invalid under the new mode (e.g., switching from routed to simple invalidates salvage defs with outcome routing).
Affected components have `salvage.enabled` set to false.
- **Feature disable** (`features.salvage = false`): Cancels all active salvage runs.
Salvage definitions on components are preserved but inert.
- **Component deletion**: Cleans up any active salvage runs referencing the deleted component.

## UI Rendering for Multi-Step Recipes

When recipe-level `ingredientSets` or `resultGroups` are empty:

- The recipe detail/summary view MUST NOT render empty ingredient or result sections.
If recipe-level sets are absent, display the active step's sets or a step overview instead.
- Recipe list views SHOULD derive summary information (e.g., total ingredient count, result count) from the aggregate of all steps when recipe-level sets are empty.
- The recipe editor for multi-step recipes MUST present step-level editing controls and MUST NOT require recipe-level `ingredientSets` or `resultGroups` to be populated.
- Step navigation and status indicators MUST remain functional regardless of whether recipe-level sets are populated.

## Testing Requirements

- Unit tests for single-step and multistep behaviour.
- Unit tests for ingredient set/group semantics:
  - OR across ingredient sets
  - AND across groups within a set
  - OR within group options
- Unit tests for routed resolution per mode (`routedByIngredients`, `routedByCheck`) and the alchemy check-mode matrix (`none`, `simple` pass/fail incl. the reserved failure-group path, `tiered`).
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
