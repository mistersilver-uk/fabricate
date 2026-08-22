---
layout: default
title: RecipeManager
parent: API Reference
nav_order: 1
---

# RecipeManager

Handles recipe CRUD operations, filtering, and craftability checks.

**Access:** `game.fabricate.getRecipeManager()`

---

## Methods

### createRecipe(recipeData, options)

Creates a new recipe.
GM only.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `recipeData` | `object` | Recipe data (see [Recipe model]({% link api/models.md %}#recipe)) |
| `options.notify` | `boolean` | Optional. Set to `false` for batch callers that emit their own summary notification. Defaults to `true`. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

**Returns:** `Promise<Recipe>`

```javascript
const rm = game.fabricate.getRecipeManager();
const recipe = await rm.createRecipe({
  name: 'Healing Potion',
  craftingSystemId: 'alchemy-system-id',
  ingredientSets: [/* ... */],
  resultGroups: [/* ... */]
});
console.log(`Created: ${recipe.id}`);
```

### updateRecipe(recipeId, updates, options)

Updates an existing recipe.
GM only.
Merges `updates` into the current recipe data.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `recipeId` | `string` | Recipe ID |
| `updates` | `object` | Partial recipe data to merge |
| `options.notify` | `boolean` | Optional. Set to `false` for batch callers that emit their own summary notification. Defaults to `true`. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

**Returns:** `Promise<Recipe>`

### deleteRecipe(recipeId, options)

Deletes a recipe.
GM only.
Also cleans up associated runs and learned entries.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `recipeId` | `string` | Recipe ID |
| `options.notify` | `boolean` | Optional. Set to `false` for batch callers that emit their own summary notification. Defaults to `true`. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

**Returns:** `Promise<object>`

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Field | Type | Description |
|:------|:-----|:------------|
| `deleted` | `number` | Recipes actually deleted. `0` when the id resolved to nothing. |
| `recipeIds` | `string[]` | The ids that were deleted. |
| `recipeItemsAffected` | `number` | Books and scrolls that carried the recipe and no longer offer it. Counted on either membership basis. |
| `recipeItemsRewritten` | `number` | Recipe item definitions the prune actually rewrote. `0` on a legacy-basis system, where the membership lived on the recipe and dies with it. |
| `learnersAffected` | `number` | Characters, among those the calling client may write, who had learned the recipe. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

`recipeItemsAffected` and `recipeItemsRewritten` are deliberately separate numbers.
The first is what a GM needs to hear; the second is what the write did.
They are equal on the `recipeIds` membership basis and differ on the legacy basis.

This previously returned `Promise<void>`.
The change is additive — the returned object is truthy, so a caller testing the result for success is unaffected.

When `notify` is not `false`, recipe create, update, and delete calls emit the same single-recipe success notifications as the UI.

### getRecipe(recipeId)

Retrieves a single recipe by ID.

**Returns:** `Recipe | null`

### getRecipes(filters)

Returns recipes matching the given filters.

| Filter | Type | Description |
|:-------|:-----|:------------|
| `category` | `string` | Filter by category |
| `craftingSystemId` | `string` | Filter by system |
| `system` | `string` | Filter by game system |
| `enabled` | `boolean` | Filter by enabled state |
| `tags` | `string[]` | Filter by tags |
| `search` | `string` | Text search on name/description |

**Returns:** `Recipe[]`

```javascript
const potions = rm.getRecipes({
  category: 'potions',
  craftingSystemId: 'alchemy-system-id',
  enabled: true
});
```

### getAvailableRecipes(componentSourceActors)

Returns recipes that can be crafted with the given actors' inventories.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `componentSourceActors` | `Actor \| Actor[]` | Actor(s) supplying ingredients |

**Returns:** `Recipe[]`

### canCraft(componentSourceActors, recipe)

Checks if a recipe can be crafted and reports what's missing.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `componentSourceActors` | `Actor \| Actor[]` | Actor(s) supplying ingredients |
| `recipe` | `Recipe` | The recipe to check |

**Returns:** `{ canCraft: boolean, satisfiableSet: IngredientSet | null, missing: object }`

The `missing` object contains:

- `missing.ingredients` is an array of `{ ingredient, need, have }`.
- `missing.tools` is an array of unmet required Tool objects (resolved from `toolIds`).
- `missing.essences` is an array of `{ essenceId, need, have }`.

Use `resolveComponentName(recipe, ingredient.match.componentId)` to get a human-readable component name from a missing ingredient entry.
`ingredient.getDescription()` returns generic text describing the ingredient match type (e.g. "component" or "specific item") and is not suitable for display.

```javascript
const rm = game.fabricate.getRecipeManager();
const check = rm.canCraft(actor, recipe);
if (!check.canCraft) {
  check.missing.ingredients.forEach(m => {
    const name = rm.resolveComponentName(recipe, m.ingredient.match?.componentId);
    console.log(`Need ${m.need}x ${name}, have ${m.have}`);
  });
}
```

### resolveComponentName(recipe, componentId)

Resolves a human-readable display name for a component referenced by a recipe.

Looks up `componentId` in the recipe's owning crafting system.
Returns the component's `name` field if found.
Falls back to the localised string `FABRICATE.Labels.UnknownComponent` ("Unknown Component") when the component does not exist or `componentId` is null.

This is a synchronous method and does not fetch from Foundry's item database.
Use `resolveComponentNameAsync` when the component has a `registeredItemUuid` and you need the linked item's name.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `recipe` | `Recipe` | The recipe that references the component |
| `componentId` | `string \| null` | The component ID to resolve |

**Returns:** `string`

```javascript
const rm = game.fabricate.getRecipeManager();
const name = rm.resolveComponentName(recipe, 'iron-ingot-component-id');
console.log(name); // e.g. "Iron Ingot"
```

### resolveComponentNameAsync(recipe, componentId)

Async variant of `resolveComponentName`.
Attempts to resolve the component's `registeredItemUuid` via `fromUuid()` first and returns the linked item's name when found.
Falls back to the component's stored `name`, then to "Unknown Component" on broken references.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `recipe` | `Recipe` | The recipe that references the component |
| `componentId` | `string \| null` | The component ID to resolve |

**Returns:** `Promise<string>`

### resolveComponentImg(recipe, componentId)

Returns the image path for a component referenced by a recipe.
Falls back to a default component icon when the component is not found or has no image set.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `recipe` | `Recipe` | The recipe that references the component |
| `componentId` | `string \| null` | The component ID to resolve |

**Returns:** `string`

### resolveResultDescription(recipe, componentId, quantity)

Returns a formatted result description in the form `Nx Name`, where `N` is the quantity and `Name` is resolved via `resolveComponentName`.
Falls back to "Unknown Component" when the component is not found.

| Parameter | Type | Required | Description |
|:----------|:-----|:---------|:------------|
| `recipe` | `Recipe` | Yes | The recipe containing the result |
| `componentId` | `string \| null` | Yes | The component ID of the result |
| `quantity` | `number` | No (default `1`) | The result quantity |

**Returns:** `string`

```javascript
const rm = game.fabricate.getRecipeManager();
const desc = rm.resolveResultDescription(recipe, 'healing-potion-id', 2);
console.log(desc); // "2x Healing Potion"
```

### resolveRecipeIcon(recipe)

Returns a display icon path for the recipe (synchronous).

Precedence:

1. `recipe.img` when it is set and is not the system default bag icon.
2. A fallback document icon otherwise.

For the full fallback chain including the linked recipe item's image, use `resolveRecipeIconAsync`.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `recipe` | `Recipe` | The recipe to resolve an icon for |

**Returns:** `string`

### resolveRecipeIconAsync(recipe)

Returns a display icon path for the recipe, with full fallback chain (async).

Precedence:

1. `recipe.img` when it is set and is not the system default bag icon.
2. The `img` of the item resolved from `recipe.linkedRecipeItemUuid` via `fromUuid()`.
3. A fallback document icon.

Broken `linkedRecipeItemUuid` references are caught and silently skipped.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `recipe` | `Recipe` | The recipe to resolve an icon for |

**Returns:** `Promise<string>`

```javascript
const rm = game.fabricate.getRecipeManager();
const icon = await rm.resolveRecipeIconAsync(recipe);
// Use icon as the src of an <img> element in your UI
```

### exportRecipes(recipeIds)

Exports recipes as JSON-serialisable objects.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `recipeIds` | `string[] \| null` | Recipe IDs to export, or `null` for all |

**Returns:** `object[]`

### importRecipes(recipesData, overwrite)

Imports recipes from JSON.
GM only.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `recipesData` | `object[]` | Array of recipe data objects |
| `overwrite` | `boolean` | Whether to overwrite existing recipes with the same ID |

**Returns:** `Promise<{ imported: number, skipped: number, total: number, conflicts: object[] }>`

Each recipe that cannot be imported is skipped and recorded in `conflicts`.
A conflict has `recipeId`, `recipeName`, and one of three `reason` values.
`"invalid"` means activation validation failed, and the entry also carries the validation `errors`.
`"signature-conflict"` means the recipe is well formed but its ingredient signature is inseparable from an already-enabled recipe in the same alchemy system; it also carries the validation `errors`.
`"duplicate-id"` means a recipe with the same ID already exists and `overwrite` is `false`.

The import emits one aggregate success notification with the imported and skipped counts.
It does not emit per-recipe create/update notifications.
When there are conflicts it also emits one aggregated conflict-report warning that names each skipped recipe and its reason, so duplicate-ID skips are no longer silent.

### getSignatureConflicts(recipe, options)

Returns the ingredient-signature conflicts a candidate recipe would have if it were saved and enabled right now, in the same order a full audit of the system would report them.
This is the same check the enable gate applies to `createRecipe`, `updateRecipe`, and `importRecipes`, exposed so a caller can preview it against a recipe that has not been saved.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `recipe` | `object` | A recipe, or the JSON of one. Must carry `id`, `name`, `enabled`, and `ingredientSets`. |
| `options.systemId` | `string` | Optional. Defaults to `recipe.craftingSystemId`. Pass this explicitly for a draft whose JSON does not carry `craftingSystemId`. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

**Returns:** `{ code: string|null, params: object, message: string }[]`

<!-- markdownlint-disable markdownlint-sentences-per-line -->

Empty for a non-alchemy system, an unknown crafting system, or a recipe with no conflicts.
Only alchemy systems infer which recipe is being crafted from the submitted ingredients, so signature uniqueness is enforced there alone.
A `recipe` that has never been saved is evaluated exactly as if it had already been saved and enabled, so a brand-new recipe whose ingredient sets collide with an already-enabled recipe is reported here, before `createRecipe` or `importRecipes` would refuse it.
Do not treat "not yet saved" as "cannot conflict".

<!-- markdownlint-enable markdownlint-sentences-per-line -->

Each conflict's `message` is default English.
`code` and `params` let a caller localize it.
Do not mutate a conflict's `params` object: for a recipe whose ingredient sets already match its saved copy, it may be the same object the manager retains internally.

```javascript
const rm = game.fabricate.getRecipeManager();
const draft = { ...recipe, ingredientSets: editedSets };
const conflicts = rm.getSignatureConflicts(draft, { systemId: recipe.craftingSystemId });
conflicts.forEach((conflict) => console.log(conflict.message));
```
