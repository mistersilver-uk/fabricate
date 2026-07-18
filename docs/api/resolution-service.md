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

**Returns:** `string`.
One of "simple", "routedByIngredients", "routedByCheck", "progressive", or "alchemy".

{: .note }
> The legacy modes "mapped" and "tiered" are normalised on load.
> "mapped" becomes "routedByIngredients" and "tiered" becomes "routedByCheck".
> The single legacy "routed" token is also retired.
> A persisted "routed" system is migrated to one of the two routed modes by the data migration, and an un-migrated "routed" token read at runtime falls back to "routedByIngredients".

### getProvider(recipe)

Returns a recipe's legacy `resultSelection.provider`, or `null` when it has none.

{: .note }
> The per-recipe result-selection provider is retired.
> Alchemy routing moved to the system-level alchemy check mode (`system.alchemy.checkMode`), and the routed crafting modes derive their routing basis from the system mode.
> No live resolution mode carries a `resultSelection.provider`, so this returns `null` for current recipes.

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

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Mode | Rules |
|:-----|:------|
| Simple | Exactly 1 ingredient set, exactly 1 result group |
| `routedByIngredients` | 1+ ingredient sets, 1+ result groups, each `IngredientSet.resultGroupId` references a real result group. The crafting check is optional. |
| `routedByCheck` | 1+ ingredient sets, 1+ result groups, result group names are unique (case-insensitive) and do not use reserved keywords. The routed crafting check roll formula is required at the system level, surfaced as a system blocker rather than a per-recipe error. |
| Progressive | Exactly 1 ingredient set, exactly 1 result group, checks enabled, progressive config exists, all result difficulties >= 1 |
| Alchemy | Exactly 1 ingredient set. Result groups follow the system's `alchemy.checkMode`: `none` needs one success group; `simple` needs a success group plus the reserved failure group (`role: 'failure'`), whose absence is tolerated; `tiered` needs 1+ groups with valid outcome-tier assignment. Both mandatory check modes require an authored roll formula at the system level, surfaced as an `alchemyCheckNoFormula` system blocker: `simple` requires `craftingCheck.simple.rollFormula` and `tiered` requires `craftingCheck.routed.rollFormula`. `none` needs no check. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

The routing basis is a property of the mode, not a per-recipe provider.
`routedByIngredients` routes by `IngredientSet.resultGroupId`, and `routedByCheck` routes by the system's routed crafting-check outcome.
The unique-name and reserved-keyword rules apply under `routedByCheck` (and alchemy in `tiered` check mode), which route by result group name.
Reserved keywords cover three families.
The fail family is `fail`, `failed`, `failure`, `f`.
The hazard family is `hazard`, `danger`, `complication`, `trap`, `oops`, and it also routes a check outcome to the failure path.
The miss family is `miss`, `missed`, `m`, `nothing`, `none`, `whiff`, `whiffed`.
A `routedByCheck` recipe (or step) with exactly one result group needs no outcome mapping.
The single group is produced on any non-failure outcome and yields nothing on a reserved failure keyword.

### validateSalvage(component, system)

Validates a component's salvage configuration against the system's `salvageResolutionMode` rules.
Analogous to `validateRecipe` but operates on salvage-specific data shapes.

Returns early as valid when the component has no `salvage` data or when `system` is `null`.
Rejects "mapped" mode immediately, as mapped mode is not supported for salvage.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Parameter | Type | Required | Description |
|:----------|:-----|:---------|:------------|
| `component` | `object` | Yes | The component whose salvage configuration to validate. Must have a `salvage.resultGroups` array for validation to proceed. |
| `system` | `object` | Yes | The crafting system that owns the component. Supplies `salvageResolutionMode` and `salvageCraftingCheck`. Pass `null` to skip validation entirely. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

**Returns:** `{ valid: boolean, errors: string[] }`

```javascript
Hooks.once('fabricate.ready', () => {
  const svc = game.fabricate.getResolutionModeService();
  const mgr = game.fabricate.getCraftingSystemManager();
  const system = mgr.getSystem('my-alchemy-system');
  const component = system?.components?.find(c => c.id === 'silver-ore-component-id');

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
| Routed | At least 1 result group present, and (when the routed salvage check declares outcome tiers) every success tier name must map to a valid result group ID in `component.salvage.outcomeRouting` with no routes pointing at a missing group, since routing keys on the routed check's outcome-tier names. |
| Progressive | A progressive salvage check roll formula must be configured (`salvageCraftingCheck.progressive.rollFormula`), exactly 1 result group required, the group must contain at least 1 ordered result, and every result must reference a component with `difficulty >= 1`. |

**Error message examples:**

- `'Mapped mode is not supported for salvage'`
- `'Salvage for "Silver Ore" must have exactly 1 result group in simple mode'`
- `'Routed salvage mode requires crafting checks enabled'`
- `'Routed salvage mode requires at least one declared outcome'`
- `'Outcome "pass" must map to a valid salvage result group for "Silver Ore"'`
- `'Progressive salvage mode requires crafting checks enabled'`
- `'Progressive salvage mode requires salvageCraftingCheck.progressive configuration'`
- `'Salvage for "Silver Ore" requires ordered results in progressive mode'`
- `'Result 1 references component without valid difficulty for salvage on "Silver Ore"'`

A message identifies the component by its author-given name and identifies an offending progressive result by its 1-based position.
When a component has no author-given name, the message uses a name-free phrase such as `this component` rather than the component's internal id.

### resolveResultGroups(params)

Determines which result groups to create based on the resolution mode and crafting check result.
This dispatches on the system's resolution mode.
`routedByIngredients` routes by the chosen ingredient set's `resultGroupId`, and `routedByCheck` routes by the crafting-check outcome.
Alchemy dispatches on the system-level `alchemy.checkMode`.
`none` and a passed `simple` check route to the success group, a failed `simple` check routes to the reserved `role: 'failure'` group (nothing when it is empty or absent), and `tiered` routes by the routed-check outcome exactly like `routedByCheck`.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `params.recipe` | `Recipe` | The recipe |
| `params.step` | `object` | The current step |
| `params.ingredientSet` | `IngredientSet` | The selected ingredient set |
| `params.checkResult` | `object` | The crafting check result |
| `params.selectedResultGroupId` | `string` | Player-selected result group (`routedByIngredients` mode only) |

**Returns:** `{ groups: object[], meta: object }`

### validateCheckResult(params)

Validates that a crafting check result has the correct shape for the recipe's mode.
`routedByCheck` requires a non-empty outcome to route by.
Alchemy requires a non-empty outcome only when the system's `alchemy.checkMode` is `tiered`; `none` and `simple` always validate.
Progressive requires a finite numeric value.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `params.recipe` | `Recipe` | The recipe |
| `params.checkResult` | `object` | The check result to validate |

**Returns:** `boolean`
