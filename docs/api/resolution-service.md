---
layout: default
title: ResolutionModeService
parent: API Reference
nav_order: 6
---

# ResolutionModeService

Validates recipes against their resolution mode rules and resolves which result groups to produce.

**Access:** `game.fabricate.getResolutionModeService()`

---

## Methods

### getMode(recipe)

Returns the resolution mode for a recipe (derived from its crafting system).

**Returns:** `string` -- `"simple"`, `"routed"`, or `"progressive"`

{: .note }
> The legacy modes `"mapped"` and `"tiered"` are normalised to `"routed"` on load. `getMode()` always returns `"routed"` for recipes that were previously `"mapped"` or `"tiered"`.

### getProvider(recipe)

Returns the result-selection provider for a routed recipe.

**Returns:** `string` -- `"ingredientSet"`, `"macroOutcome"`, or `"rollTableOutcome"`, or `null` for non-routed recipes.

### validateRecipe(recipe)

Validates that a recipe's structure is valid for its resolution mode.

**Returns:** `{ valid: boolean, errors: string[] }`

```javascript
Hooks.once('fabricate.ready', () => {
  const svc = game.fabricate.getResolutionModeService();
  const result = svc.validateRecipe(myRecipe);
  if (!result.valid) {
    result.errors.forEach(e => console.warn(e));
  }
});
```

**Validation rules by mode:**

| Mode | Rules |
|:-----|:------|
| Simple | Exactly 1 ingredient set, exactly 1 result group |
| Routed (`ingredientSet`) | 1+ ingredient sets, 1+ result groups, `resultGroupId` references are valid; result group names must be unique (case-insensitive) |
| Routed (`macroOutcome`) | 1+ ingredient sets, 1+ result groups, checks enabled, `resultSelection.macroUuid` present or system fallback set, result group names are unique and do not use reserved keywords |
| Routed (`rollTableOutcome`) | 1+ ingredient sets, 1+ result groups, `resultSelection.rollTableUuid` present, result group names are unique and do not use reserved keywords |
| Progressive | Exactly 1 ingredient set, exactly 1 result group, checks enabled, progressive config exists, all result difficulties >= 1 |

### validateSalvage(component, system)

Validates a component's salvage configuration against the system's `salvageResolutionMode` rules.
Analogous to `validateRecipe` but operates on salvage-specific data shapes.

Returns early as valid when the component has no `salvage` data or when `system` is `null`.
Rejects `"mapped"` mode immediately, as mapped mode is not supported for salvage.

| Parameter | Type | Required | Description |
|:----------|:-----|:---------|:------------|
| `component` | `object` | Yes | The component whose salvage configuration to validate. Must have a `salvage.resultGroups` array for validation to proceed. |
| `system` | `object` | Yes | The crafting system that owns the component. Supplies `salvageResolutionMode` and `salvageCraftingCheck`. Pass `null` to skip validation entirely. |

**Returns:** `{ valid: boolean, errors: string[] }`

```javascript
Hooks.once('fabricate.ready', () => {
  const svc = game.fabricate.getResolutionModeService();
  const system = game.fabricate.getCraftingSystem('my-alchemy-system');
  const component = game.fabricate.getComponent('silver-ore-uuid', 'my-alchemy-system');

  const result = svc.validateSalvage(component, system);
  if (!result.valid) {
    result.errors.forEach(e => ui.notifications.warn(e));
  }
});
```

**Validation rules by salvage mode:**

| Mode | Rules |
|:-----|:------|
| Simple | Exactly 1 result group required. |
| Routed | Crafting checks must be enabled (via `salvageCraftingCheck.enabled: true` or a non-null `macroUuid`), at least 1 outcome declared, at least 1 result group present, and every declared outcome must map to a valid result group ID in `component.salvage.outcomeRouting`. |
| Progressive | Crafting checks must be enabled, `salvageCraftingCheck.progressive` config must be present, exactly 1 result group required, the group must contain at least 1 ordered result, and every result must reference a component with `difficulty >= 1`. |

**Error message examples:**

- `'Mapped mode is not supported for salvage'`
- `'Salvage for "Silver Ore" must have exactly 1 result group in simple mode'`
- `'Routed salvage mode requires crafting checks enabled'`
- `'Routed salvage mode requires at least one declared outcome'`
- `'Outcome "pass" must map to a valid salvage result group for "Silver Ore"'`
- `'Progressive salvage mode requires crafting checks enabled'`
- `'Progressive salvage mode requires salvageCraftingCheck.progressive configuration'`
- `'Salvage for "Silver Ore" requires ordered results in progressive mode'`
- `'Result "r-1" references component without valid difficulty for salvage on "Silver Ore"'`

### resolveResultGroups(params)

Determines which result groups to create based on the resolution mode and crafting check result.
For routed recipes, dispatches on `recipe.resultSelection.provider`.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `params.recipe` | `Recipe` | The recipe |
| `params.step` | `object` | The current step |
| `params.ingredientSet` | `IngredientSet` | The selected ingredient set |
| `params.checkResult` | `object` | The crafting check result |
| `params.selectedResultGroupId` | `string` | Player-selected result group (routed `ingredientSet` provider only) |

**Returns:** `{ groups: object[], meta: object }`

### validateCheckResult(params)

Validates that a crafting check result has the correct shape for the recipe's mode.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `params.recipe` | `Recipe` | The recipe |
| `params.checkResult` | `object` | The check result to validate |

**Returns:** `boolean`
