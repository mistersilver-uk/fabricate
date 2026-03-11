# Specification 004: Resolution Modes

## Purpose

Define semantics and validation rules for crafting-system resolution modes.
A crafting system has exactly one mode, and every recipe/step in that system must conform to it.

## Mode Invariant

- `CraftingSystem.resolutionMode` is system-wide.
- Recipes cannot mix resolution modes inside one crafting system.
- Mode changes are destructive and governed by `007-destructive-changes-and-migrations.md`.

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
- If checks are enabled, macro must return the simple contract from `002-data-models.md`.

## Routed Mode

### Semantics

- Multiple ingredient sets and result groups are allowed.
- Result-group resolution is recipe-level via `Recipe.resultSelection.provider`.
- **Single-selection semantics: exactly one result group is selected per craft attempt, determined by the check outcome or provider. No other result groups are awarded.**
- Supported providers:
  - `ingredientSet`
  - `macroOutcome`
  - `rollTableOutcome`

### Provider: `ingredientSet`

- Routing uses `IngredientSet.resultGroupId`.
- If there is only one result group, explicit mapping may be omitted.
- If there are multiple result groups, every satisfiable ingredient set must resolve to exactly one group.

### Provider: `macroOutcome`

- A crafting check macro is required (`Recipe.resultSelection.macroUuid` or system fallback).
- Macro return contract is object-based: `{ success, outcome, description? }`.
- `outcome` is trim-normalized and case-insensitive.
- Resolution rules:
  1. If `outcome` is a reserved failure keyword (`fail`, `failed`, `failure`, `f`, `miss`, `missed`, `m`, `nothing`, `none`, `whiff`, `whiffed`, `hazard`, `danger`, `complication`, `trap`, `oops`), execution takes failure path.
  2. Otherwise, `outcome` must match exactly one `ResultGroup.name` under the same normalization.
  3. If no result-group name matches, execution aborts with crafting-system misconfiguration error (not a player failure outcome).

### Provider: `rollTableOutcome`

- `Recipe.resultSelection.rollTableUuid` is required.
- Engine draws exactly once per attempt.
- Drawn result `name` is trim-normalized and case-insensitive, then interpreted with the same reserved-keyword and result-group-name rules as `macroOutcome`.
- If no result-group name matches and no reserved keyword applies, execution aborts with crafting-system misconfiguration error (not a player failure outcome).

### Validation

- At least one `IngredientSet`.
- At least one `ResultGroup`.
- `resultSelection.provider` must be one of the three supported values.
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
- **All result groups whose difficulty threshold is met or exceeded are awarded, not just the highest matching group. This is the key distinction from `routed` mode, which selects exactly one result group.**

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
- `CraftingSystem.craftingCheck.enabled` must be true.
- `CraftingSystem.craftingCheck.progressive` must exist.
- Check macro must return progressive check contract with numeric `value`.

## Alchemy Mode

### Semantics

- Player submits ingredient combinations directly instead of selecting a visible recipe.
- Recipes remain hidden by default for non-GM users.
- Result-group selection uses recipe-level providers (`ingredientSet`, `macroOutcome`, `rollTableOutcome`) with the same provider contracts as routed mode.
- Multi-step recipes are not supported.
- `consumeOnFail` defaults to true for failed attempts.

### Signature Resolution

- Matching is based on satisfiable signatures from ingredient groups/options.
- Signature overlap is invalid across all recipes in the system.
- No-signature-match is treated as a failed attempt:
  - player sees a specific failure message,
  - submitted ingredients are consumed.
- If a signature matches but routed outcome/name cannot resolve to a valid `ResultGroup`, treat as crafting-system misconfiguration error:
  - abort without applying player-failure consumption,
  - return actionable diagnostics for GM correction.

### Validation

- `features.multiStepRecipes` must be false.
- All recipes must satisfy alchemy-wide signature uniqueness invariants.
- Any signature collision blocks save/import operations system-wide until resolved.

## Testing Requirements

- Unit tests per mode for cardinality and routing validation.
- Unit tests for provider-specific routed behavior (`ingredientSet`, `macroOutcome`, `rollTableOutcome`).
- Unit tests for reserved failure keyword handling and result-group name matching normalization.
- Unit tests for progressive award modes (`partial`, `equal`, `exceed`).
- Integration tests validating mode-specific behavior in full crafting flow.
- Integration tests for alchemy no-signature failure behavior (failure message + ingredient consumption).
- Integration tests for alchemy routing-mismatch misconfiguration behavior (error + no player-failure consumption).
- Integration tests for alchemy uniqueness blocking semantics in save/import workflows.
