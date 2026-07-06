# Specification 004: Resolution Modes

## Purpose

Define semantics and validation rules for crafting-system resolution modes.
A crafting system has exactly one mode, and every recipe/step in that system must conform to it.

## Mode Invariant

- `CraftingSystem.resolutionMode` is system-wide.
- Recipes cannot mix resolution modes inside one crafting system.
- Mode changes are **migration-first** and governed by
  `007-destructive-changes-and-migrations.md`:
  recipes are migrated to fit the new mode wherever possible and a recipe is
  deleted only when a per-recipe *structural* constraint of the target mode cannot
  be satisfied by seeding the alchemy provider or clearing the result selection.
  System-level gaps (a target mode that needs a check the system has not
  configured, an alchemy signature collision, ...) never delete a recipe; they are
  surfaced as system-validation issues that gate visibility, not deletion.
- **Migratability matrix (normative).**
  The columns are the *target* mode and the rows the *source* mode.
  RI = `routedByIngredients`, RC = `routedByCheck`.
  "seed" seeds the alchemy `resultSelection.provider` — `ingredientSet`/`check`
  when the source is the matching routed mode, otherwise `check` when the system
  has a usable crafting check, else `ingredientSet`
  (alchemy is the only mode that still routes via a recipe-level provider);
  "clear" sets `resultSelection` to `null`;
  "carry" keeps the recipe verbatim;
  "reconcile" means the recipe survives but its stale routing is surfaced as a
  re-authoring validation issue, never silently mis-routed;
  "1×1" means the recipe has exactly one ingredient set and one result group.

  | From \ To             | `simple`                     | `routedByIngredients`        | `routedByCheck`                          | `progressive`                | `alchemy`                                                           |
  |-----------------------|------------------------------|------------------------------|------------------------------------------|------------------------------|--------------------------------------------------------------------|
  | `simple`              | —                            | clear                        | clear; reconcile                         | clear                        | seed                                                               |
  | `routedByIngredients` | clear if 1×1 else **delete** | —                            | carry; reconcile                         | clear if 1×1 else **delete** | seed provider=`ingredientSet`, carry if single-step else **delete** |
  | `routedByCheck`       | clear if 1×1 else **delete** | carry; reconcile             | —                                        | clear if 1×1 else **delete** | seed provider=`check`, carry if single-step else **delete**         |
  | `progressive`         | clear                        | clear                        | clear; reconcile                         | —                            | seed                                                               |
  | `alchemy`             | clear if 1×1 else **delete** | clear (drop provider), carry | clear (drop provider), carry; reconcile  | clear if 1×1 else **delete** | —                                                                  |

  The only structural delete causes are: narrowing into `simple`/`progressive`
  (which require 1×1) from a recipe with more than one ingredient set or result
  group, and moving a multi-step recipe into `alchemy` (which has no multi-step
  support).
  `RI↔RC` never deletes (`carry`); it reconciles stale routing.
  Re-running a `carry` migration with no reconcile pending is a no-op (idempotent).
- Mode *cardinality* checks (e.g. "must have exactly/at least N ingredient set/result group", progressive "requires ordered results") are *completeness* and are waived under structural-only validation (`ResolutionModeService.validateRecipe(recipe, { requireComplete: false })`, used when persisting an authoring incomplete shell); mode *reference-integrity* checks always apply, per mode: `routedByIngredients` checks the invalid `resultGroupId` integrity, and `routedByCheck` checks the reserved/duplicate `ResultGroup.name`. (The routed modes carry no `resultSelection.provider`, so there is no provider value to validate.) (Legacy `mapped`/`tiered` are not live modes; they are accepted only as one-time migration inputs per `007-destructive-changes-and-migrations.md §Resolution-Model Migration`, which hard-migrates `mapped → routedByIngredients` and `tiered → routedByCheck`.)

## Mode Matrix

| Mode                  | Ingredient Sets | Result Groups               | Check Requirement  | Routing Basis                       |
|-----------------------|-----------------|-----------------------------|--------------------|-------------------------------------|
| `simple`              | exactly 1       | exactly 1                   | optional           | single result group                 |
| `routedByIngredients` | one or more     | one or more                 | optional           | `IngredientSet.resultGroupId`       |
| `routedByCheck`       | one or more     | one or more                 | required           | system routed-check outcome         |
| `progressive`         | exactly 1       | exactly 1 (ordered results) | required           | numeric value spending              |
| `alchemy`             | one or more     | one or more                 | provider-dependent | recipe `resultSelection.provider`   |

## Player-Facing Mode Labels

The `resolutionMode` token is system-internal and must never surface raw in player UI.
The player-facing Journal screen (see `003-ui-integration.md` *Journal App*) maps each mode to a localized display label through a frozen label-key map (`RunJournalBuilder.MODE_LABEL_KEYS`), resolved against the `FABRICATE.App.Journal.Mode.*` localization keys.

| Mode                  | Localization key                                 | Player label          |
|-----------------------|--------------------------------------------------|-----------------------|
| `simple`              | `FABRICATE.App.Journal.Mode.Standard`            | Standard (DC)         |
| `routedByIngredients` | `FABRICATE.App.Journal.Mode.RoutedByIngredients` | Routed by Ingredients |
| `routedByCheck`       | `FABRICATE.App.Journal.Mode.RoutedByCheck`       | Routed by Check       |
| `progressive`         | `FABRICATE.App.Journal.Mode.Progressive`         | Progressive           |
| `alchemy`             | `FABRICATE.App.Journal.Mode.Alchemy`             | Alchemy               |

- There is no canonical "Standard" resolution mode.
`simple` (a DC pass/fail check) renders as "Standard (DC)" for players, even though its internal token stays `simple`.
- A run whose recipe resolves to an unknown or absent mode falls back to the `simple` ("Standard (DC)") label rather than emitting a raw token.

## Simple Mode

### Semantics

- One ingredient set and one result group.
- Optional pass/fail crafting check.
- On success, produce the single result group.

### Validation

- Exactly one `IngredientSet`.
- Exactly one `ResultGroup`.
- The crafting check is optional: it runs only when `craftingCheck.simple.rollFormula` is authored (the engine rolls the formula and resolves pass/fail against the DC).
With no authored formula the attempt proceeds with no check; there is no macro-return contract.

## Routed by Ingredients Mode (`routedByIngredients`)

### Semantics

- Multiple ingredient sets and result groups are allowed.
- The routing basis is a property of the **mode** (not a per-recipe provider): routing uses `IngredientSet.resultGroupId`.
The mode carries no `resultSelection`.
- **Single-selection semantics: exactly one result group is selected per craft attempt, determined by the chosen ingredient set.
No other result groups are awarded.**
- The crafting check is **optional**, matching `simple` mode: it runs only when `craftingCheck.routed.rollFormula` is authored; with no authored formula the attempt proceeds with no check.
The check never changes which result group is produced.

### Routing

- Routing uses `IngredientSet.resultGroupId`.
- If there is only one result group, explicit mapping may be omitted.
- If there are multiple result groups, every satisfiable ingredient set must resolve to exactly one group.

### Validation

- At least one `IngredientSet`.
- At least one `ResultGroup`.
- Reference integrity (always applies): each `IngredientSet.resultGroupId` must point at a real `ResultGroup` in scope.
- This mode never raises `routedCheckNoFormula`: a missing routed roll formula simply means no check runs.

## Routed by Check Mode (`routedByCheck`)

### Semantics

- Multiple ingredient sets and result groups are allowed.
- The routing basis is a property of the **mode** (not a per-recipe provider): the system-level routed crafting-check outcome routes to a `ResultGroup`.
The mode carries no `resultSelection`.
- **Single-selection semantics: exactly one result group is selected per craft attempt, determined by the check outcome.
No other result groups are awarded.**
- The crafting check is **required**.
The outcome is produced by the system's configured routed crafting check, whose required field is an authored `craftingCheck.routed.rollFormula`.
- `outcome` is trim-normalized and case-insensitive.
- **Relative tier clamp:** when the routed check uses **relative** outcome tiers and the rolled total meets no tier's effective threshold (`baseDc + outcome.dc`), the outcome is the lowest (closest) tier rather than an empty/null outcome, so a recipe tier or dynamic DC that raises the base difficulty never yields a rolled-but-unrouted craft.
The clamp is relative-only; **fixed** tiers keep the "outside every range → no outcome" behaviour (their ranges are authored explicitly).
- **Fixed tiers carry no DC.**
Fixed outcome tiers own explicit, non-overlapping `[start, end]` value ranges and the roll total is matched by range, so the check DC and the meet/exceed `thresholdMode` comparison are unused in fixed mode — DC and the comparison are relative-only.
The DC still governs `routedByIngredients` (whose pass/fail gate compares the roll against it) and relative-type routed checks; only `routedByCheck` with `type: "fixed"` drops it.
- **Per-recipe minimum success tier (fixed only).**
A `routedByCheck` recipe MAY carry an optional `minSuccessOutcomeId` referencing a fixed success outcome tier id; fixed tiers rank by their `start` value.
When set, a craft whose naturally-rolled tier ranks below the required tier — or whose total lands outside every fixed range, so no tier matched at all — fails outright: `success: false`, no outcome routes, and the recipe takes its normal failure/consumption path with no success result.
Because no tier routes on this failure, the rolled tier's own `breakTools` flag is dropped (the per-tier breakage bridge fires only for a routed tier); independent dice-group / roll-total breakage triggers are unaffected.
The default (null/unset) imposes no override, so the outcome is the tier actually rolled.
A forced-outcome trigger (a natural crit) bypasses the gate — a natural crit is never downgraded by a recipe minimum.
A stale or unknown `minSuccessOutcomeId` no-ops.
The gate is fixed-type only; relative-type routed checks ignore it.
It is enforced in the shared routed-check runner (`runFormulaRouted`) through an optional minimum-tier parameter that is no-op by default, so salvage and gathering routed checks are unaffected — only the crafting `routedByCheck` caller threads the recipe's minimum.
- **Single-result-group exemption (mirrors `routedByIngredients`):** when a step (or an implicit recipe) has exactly one result group, no outcome/tier mapping is required.
A non-failure outcome produces that single group (`disposition: success`); a failure/miss keyword produces nothing (failure path).
Resolution never aborts with a misconfiguration for an unmatched success outcome when there is exactly one result group.
- Resolution rules (applied per step/scope; "exactly one result group" is evaluated per step for multi-step recipes):
  1. Explicit tier assignment wins: when the outcome resolves to a routed-check outcome tier id, the result group listing that tier id in `checkOutcomeIds` is selected.
  2. If `outcome` is a reserved failure keyword (`fail`, `failed`, `failure`, `f`, `miss`, `missed`, `m`, `nothing`, `none`, `whiff`, `whiffed`, `hazard`, `danger`, `complication`, `trap`, `oops`), execution takes the failure path.
  3. If the scope has exactly one result group, that single group is produced for any non-failure outcome (no mapping required).
  4. Otherwise, with multiple result groups, `outcome` must match exactly one `ResultGroup.name` under the same normalization.
  5. If multiple result groups are present and no result-group name matches, execution aborts with crafting-system misconfiguration error (not a player failure outcome).

### Validation

- At least one `IngredientSet`.
- At least one `ResultGroup`.
- **One result group → no mapping required:** a step with exactly one result group needs no outcome/tier mapping; it is produced on any non-failure outcome and yields nothing on a failure keyword.
Outcome/tier mapping is required only when a step has multiple result groups (each success outcome must route to a group), and the `recipe-visibility` readiness warnings (`unroutedResultGroup`, `unproducedOutcomeTier`) do not fire for single-result-group steps.
- Reference integrity (always applies): `ResultGroup.name` values must be unique under trim-normalized, case-insensitive comparison, and may not be any reserved failure keyword.
- A missing routed crafting check (`craftingCheck.routed.rollFormula` unauthored) is an **unconditional system-level blocker** (`routedCheckNoFormula`), independent of any recipe — every recipe in this mode routes by the check, so no craft can resolve without it (see `recipe-visibility`).
A `routedByCheck` recipe is otherwise structurally valid regardless of the check configuration; the formula requirement is a system-level concern, not a per-recipe validation error.

## Progressive Mode

### Semantics

- Exactly one ingredient set and one result group.
- The result order is meaningful.
- Result entries carry no quantity: awarding spends the budget against each entry once, so the same `Component` may appear multiple times and repetition is how a recipe asks for more of a result.
Each awarded entry grants a single item (any legacy authored quantity is normalized to 1).
- Each result references a `Component` with `difficulty >= 1`.
- Check is mandatory and returns numeric `value`.
- Awarding evaluates ordered results using `awardMode`.
- **All result groups whose difficulty threshold is met or exceeded are awarded, not just the highest matching group.
This is the key distinction from the routed modes, which select exactly one result group.**

### Award Modes

Let `remaining = check.value` and `cost = result.component.difficulty`.

- `equal`: award result when `remaining >= cost`; then `remaining -= cost`.
- `exceed`: award result when `remaining > cost`; then `remaining -= cost`.
- `partial`:
  - if `remaining >= cost`, award and decrement.
  - else if `remaining > 0`, award the current result (with only partial credit), set `remaining = 0`, stop.
  - else stop.

### Player Reorder

- If `allowPlayerReorder` is false, recipe-defined order is authoritative.
- If true, player may reorder before execution; the reordered list is used for award evaluation.

### Validation

- Exactly one `IngredientSet`.
- Exactly one `ResultGroup`.
- The result group contains ordered results.
- Every referenced `Component` has `difficulty >= 1`.
- `CraftingSystem.craftingCheck.progressive.rollFormula` must be authored: the progressive check is required, and the engine rolls that formula to produce the numeric `value` the awarding spends against result difficulties.
- With no authored progressive roll formula the attempt fails loudly (the required-check guard aborts with zero mutation); this surfaces as a system-level blocker, not a per-recipe validation error.

## Alchemy Mode

### Semantics

- Player submits ingredient combinations directly instead of selecting a visible recipe.
- Recipes remain hidden by default for non-GM users (see `006` for `learnOnCraft` semantics).
- Result-group selection uses recipe-level providers (`ingredientSet`, `check`); alchemy is the only mode that retains a per-recipe `resultSelection.provider`.
The `ingredientSet` provider routes by `IngredientSet.resultGroupId` and the `check` provider routes by the crafting-check outcome name (the same routing contracts the `routedByIngredients`/`routedByCheck` modes apply at the mode level).
- Multi-step recipes are not supported.
- `consumeOnFail` defaults to true for failed attempts.

### Signature Resolution

- Matching is based on satisfiable signatures from ingredient groups/options.
- A group is satisfied only when one of its options has its required `Ingredient.quantity` met by the available submitted quantity matching that option's components; submitting fewer than the required quantity does NOT satisfy the group and yields a no-signature-match failure.
- Submitted quantity is counted per submission (one submission = one unit), not by reading an item's stack `system.quantity`; the workbench is responsible for expanding a stack into one submission per unit, consistent with occurrence-based essence accumulation and submitted-ingredient consumption.
- Signature overlap is invalid across all recipes in the system.
- No-signature-match is treated as a failed attempt:
  - player sees a specific failure message,
  - submitted ingredients are consumed.
- If a signature matches but routed outcome/name cannot resolve to a valid `ResultGroup`, treat as crafting-system misconfiguration error:
  - abort without applying player-failure consumption,
  - return actionable diagnostics for GM correction.

### Alchemy UI Interaction Model

#### Component Palette

- Grid of all components in selected alchemy system owned by component source actor(s).
- Shows: image, name, available quantity (inventory minus workbench count).
- Zero-quantity components remain visible but visually distinguished.
- Left-click: add one to workbench (decrement palette quantity).
- Right-click: remove one from workbench (increment palette quantity), only if component is in workbench.
- Drag-drop from external sources remains supported.

#### The Workbench

- Session-scoped working set displayed as compact grid with quantity badges (e.g., "Iron Ore x3").
- Each unique component appears once; adding increments the badge count.
- Supports: add from palette, remove (right-click or direct action), clear all, submit.
- Submit triggers signature matching per existing Signature Resolution rules.
- On submit, a quantity badge of N contributes N unit submissions (one per unit), so occurrence-based signature matching and consumption observe the displayed quantity.

#### Alchemy System Selection

- Required when multiple alchemy-mode systems exist.
- Selector shows only `resolutionMode === "alchemy"` systems.
- Determines which components appear in palette.
- Auto-selects if exactly one alchemy system.
- Persisted in client settings (like `lastCraftingActor` and `lastComponentSources`).

#### Discovered Recipes Panel

- Panel is always visible, even when no recipes have been discovered yet.
- Shows an encouraging empty state message (e.g., "No recipes discovered yet — experiment with ingredients to discover new recipes").
- Once recipes are discovered, the empty state is replaced by the searchable list.
- "Craftable only" filter and auto-fill action are defined in `003` and `006`.

#### Tab Feature Scope

- Includes: palette, workbench, discovered recipes panel (always visible, with craftable-only filter and auto-fill), active runs, history.
- Excludes: shopping list, recipe browsing, recents, favourites.

### Validation

- `features.multiStepRecipes` must be false.
- All recipes must satisfy alchemy-wide signature uniqueness invariants.
- Any signature collision blocks save/import operations system-wide until resolved.

## Testing Requirements

- Unit tests per mode for cardinality and routing validation.
- Unit tests for mode-specific routed behavior (`routedByIngredients`, `routedByCheck`) and the alchemy providers (`ingredientSet`, `check`).
- Unit tests for reserved failure keyword handling and result-group name matching normalization.
- Unit tests for progressive award modes (`partial`, `equal`, `exceed`).
- Integration tests validating mode-specific behavior in full crafting flow.
- Integration tests for alchemy no-signature failure behavior (failure message + ingredient consumption).
- Integration tests for alchemy routing-mismatch misconfiguration behavior (error + no player-failure consumption).
- Integration tests for alchemy uniqueness blocking semantics in save/import workflows.
