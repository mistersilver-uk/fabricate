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
  be satisfied by seeding a result-selection provider or clearing the routed
  selection.
  System-level gaps (a target mode that needs a check the system has not
  configured, an alchemy signature collision, ...) never delete a recipe; they are
  surfaced as system-validation issues that gate visibility, not deletion.
- **Migratability matrix (normative).**
  The columns are the *target* mode and the rows the *source* mode.
  "seed" seeds the recipe-level `resultSelection.provider`
  (`check` when the system has a usable crafting check, otherwise `ingredientSet`);
  "clear" sets `resultSelection` to `null`;
  "carry" keeps the recipe (and its routing provider) verbatim;
  "1×1" means the recipe has exactly one ingredient set and one result group.

  | From \ To     | `simple`                       | `routed` | `progressive`                  | `alchemy`                            |
  |---------------|--------------------------------|----------|--------------------------------|--------------------------------------|
  | `simple`      | —                              | seed     | clear                          | seed                                 |
  | `routed`      | clear if 1×1 else **delete**   | —        | clear if 1×1 else **delete**   | carry if single-step else **delete** |
  | `progressive` | clear                          | seed     | —                              | seed                                 |
  | `alchemy`     | clear if 1×1 else **delete**   | carry    | clear if 1×1 else **delete**   | —                                    |

  The only structural delete causes are: narrowing into `simple`/`progressive`
  (which require 1×1) from a recipe with more than one ingredient set or result
  group, and moving a multi-step recipe into `alchemy` (which has no multi-step
  support).
  Re-running a `lossless`/`carry` migration is a no-op (idempotent).
- Mode *cardinality* checks (e.g. "must have exactly/at least N ingredient set/result group", progressive "requires ordered results") are *completeness* and are waived under structural-only validation (`ResolutionModeService.validateRecipe(recipe, { requireComplete: false })`, used when persisting an authoring incomplete shell); mode *reference-integrity* checks (routed invalid/missing provider, routed invalid `resultGroupId` for the `ingredientSet` provider, routed reserved/duplicate `ResultGroup.name`) always apply. (Legacy `mapped`/`tiered` are not live modes; they are accepted only as one-time migration inputs per `007-destructive-changes-and-migrations.md §Resolution-Model Migration`, which hard-migrates them to `routed`.)

## Mode Matrix

| Mode          | Ingredient Sets | Result Groups               | Check Requirement                       | Routing Basis                           |
|---------------|-----------------|-----------------------------|-----------------------------------------|-----------------------------------------|
| `simple`      | exactly 1       | exactly 1                   | optional                                | single result group                     |
| `routed`      | one or more     | one or more                 | provider-dependent                      | recipe `resultSelection.provider`       |
| `progressive` | exactly 1       | exactly 1 (ordered results) | required                                | numeric value spending                  |
| `alchemy`     | one or more     | one or more                 | provider-dependent                      | recipe `resultSelection.provider`       |

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

## Routed Mode

### Semantics

- Multiple ingredient sets and result groups are allowed.
- Result-group resolution is recipe-level via `Recipe.resultSelection.provider`.
- **Single-selection semantics: exactly one result group is selected per craft attempt, determined by the check outcome or provider.
No other result groups are awarded.**
- Supported providers:
  - `ingredientSet`
  - `check`

### Provider: `ingredientSet`

- Routing uses `IngredientSet.resultGroupId`.
- If there is only one result group, explicit mapping may be omitted.
- If there are multiple result groups, every satisfiable ingredient set must resolve to exactly one group.

### Provider: `check`

- The system-level crafting-check outcome name routes to the `ResultGroup` of the same name.
- The outcome is produced by the system's configured routed crafting check, whose only required field is an authored `craftingCheck.routed.rollFormula`.
- A recipe that routes by the `check` provider is structurally valid regardless of the system's check configuration; whether the system has a usable routed check is a system-level concern, not a per-recipe validation error.
- `outcome` is trim-normalized and case-insensitive.
- Resolution rules:
  1. Explicit tier assignment wins: when the outcome resolves to a routed-check outcome tier id, the result group listing that tier id in `checkOutcomeIds` is selected.
  2. If `outcome` is a reserved failure keyword (`fail`, `failed`, `failure`, `f`, `miss`, `missed`, `m`, `nothing`, `none`, `whiff`, `whiffed`, `hazard`, `danger`, `complication`, `trap`, `oops`), execution takes the failure path.
  3. Otherwise, `outcome` must match exactly one `ResultGroup.name` under the same normalization.
  4. If no result-group name matches, execution aborts with crafting-system misconfiguration error (not a player failure outcome).

### Validation

- At least one `IngredientSet`.
- At least one `ResultGroup`.
- `resultSelection.provider` must be one of the two supported values (`ingredientSet`, `check`).
- The `check` provider does not require crafting checks to be "enabled" on the system; a `check`-provider recipe is structurally valid regardless of the system's check configuration.
- An unconfigured routed check (no `craftingCheck.routed.rollFormula`) surfaces as a system-level overview warning that escalates to a system-blocker once a recipe routes by the `check` provider (see `recipe-visibility`).
- Provider-specific required fields must be present.
- `ResultGroup.name` values must be unique under trim-normalized, case-insensitive comparison.
- `ResultGroup.name` may not be any reserved failure keyword.

## Progressive Mode

### Semantics

- Exactly one ingredient set and one result group.
- The result order is meaningful.
- Each result references a `Component` with `difficulty >= 1`.
- Check is mandatory and returns numeric `value`.
- Awarding evaluates ordered results using `awardMode`.
- **All result groups whose difficulty threshold is met or exceeded are awarded, not just the highest matching group.
This is the key distinction from `routed` mode, which selects exactly one result group.**

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
- Result-group selection uses recipe-level providers (`ingredientSet`, `check`) with the same provider contracts as routed mode.
- Multi-step recipes are not supported.
- `consumeOnFail` defaults to true for failed attempts.

### Signature Resolution

- Matching is based on satisfiable signatures from ingredient groups/options.
- A group is satisfied only when one of its options has its required `Ingredient.quantity` met by the available submitted quantity matching that option's components; submitting fewer than the required quantity does NOT satisfy the group and yields a no-signature-match failure.
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
- Unit tests for provider-specific routed behavior (`ingredientSet`, `check`).
- Unit tests for reserved failure keyword handling and result-group name matching normalization.
- Unit tests for progressive award modes (`partial`, `equal`, `exceed`).
- Integration tests validating mode-specific behavior in full crafting flow.
- Integration tests for alchemy no-signature failure behavior (failure message + ingredient consumption).
- Integration tests for alchemy routing-mismatch misconfiguration behavior (error + no player-failure consumption).
- Integration tests for alchemy uniqueness blocking semantics in save/import workflows.
