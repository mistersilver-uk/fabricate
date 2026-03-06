# Specification 004: Resolution Modes

## Purpose

Define the semantics and validation rules for crafting-system resolution modes.
A crafting system has exactly one mode, and every recipe/step in that system must conform to it.

## Mode Invariant

- `CraftingSystem.resolutionMode` is system-wide.
- Recipes cannot mix modes inside one crafting system.
- Mode changes are destructive and governed by `007-destructive-changes-and-migrations.md`.

## Mode Matrix

| Mode          | Ingredient Sets | Result Groups               | Check Requirement | Routing Basis          |
|---------------|-----------------|-----------------------------|-------------------|------------------------|
| `simple`      | exactly 1       | exactly 1                   | optional          | single result group    |
| `mapped`      | one or more     | one or more                 | optional          | ingredient set mapping |
| `tiered`      | one or more     | one or more                 | required          | check outcome mapping  |
| `progressive` | exactly 1       | exactly 1 (ordered results) | required          | numeric value spending |

## Simple Mode

### Semantics

- One ingredient set and one result group.
- Optional pass/fail crafting check.
- On success, produce the single result group.

### Validation

- Exactly one `IngredientSet`.
- Exactly one `ResultGroup`.
- If check enabled, macro must return simple/mapped check contract.

## Mapped Mode

### Semantics

- Multiple ingredient sets and result groups are allowed.
- `IngredientSet.resultGroupId` may force a result group.
- If no mapped group is set for the chosen set, player chooses a result group.
- Optional pass/fail crafting check.

### Validation

- At least one `IngredientSet`.
- At least one `ResultGroup`.
- If `resultGroupId` is set, it must reference an existing result group.
- If check enabled, macro must return simple/mapped check contract.

## Tiered Mode

### Semantics

- Check is mandatory.
- Check macro returns `outcome`.
- Routing maps an outcome to a result group:
  - Step-level `Step.outcomeRouting` if present.
  - Otherwise, recipe-level `Recipe.outcomeRouting`.

### Validation

- At least one `IngredientSet`.
- At least one `ResultGroup`.
- `CraftingSystem.craftingCheck.enabled` must be true.
- `CraftingSystem.craftingCheck.outcomes` must exist and be non-empty.
- Every declared outcome must map to a valid result group in active routing.
- Check macro must return a tiered check result matching the defined contract.

## Progressive Mode

### Semantics

- Exactly one ingredient set and one result group.
- The result order is meaningful.
- Each result references a `Component` with `difficulty >= 1`.
- Check is mandatory and returns numeric `value`.
- Awarding evaluates ordered results using `awardMode`.

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

## Testing Requirements

- Unit tests per mode for cardinality and routing validation.
- Unit tests for progressive award modes (`partial`, `equal`, `exceed`).
- Integration tests validating mode-specific behaviour in full crafting flow.
