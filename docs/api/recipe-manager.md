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

### createRecipe(recipeData)

Creates a new recipe. GM only.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `recipeData` | `object` | Recipe data (see [Recipe model]({% link api/models.md %}#recipe)) |

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

### updateRecipe(recipeId, updates)

Updates an existing recipe. GM only. Merges `updates` into the current recipe data.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `recipeId` | `string` | Recipe ID |
| `updates` | `object` | Partial recipe data to merge |

**Returns:** `Promise<Recipe>`

### deleteRecipe(recipeId)

Deletes a recipe. GM only. Also cleans up associated runs and learned entries.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `recipeId` | `string` | Recipe ID |

**Returns:** `Promise<void>`

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
- `missing.ingredients` -- array of `{ ingredient, need, have }`
- `missing.catalysts` -- array of missing catalyst objects
- `missing.essences` -- array of `{ essenceId, need, have }`

Use `resolveComponentName(recipe, ingredient.match.componentId)` to get a human-readable component name from a missing ingredient entry. `ingredient.getDescription()` returns generic text such as "managed item" or "specific item" for component-type ingredients and is not suitable for display.

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

Looks up `componentId` in the recipe's owning crafting system. Returns the component's `name` field if found. Falls back to the localised string `FABRICATE.Labels.UnknownComponent` ("Unknown Component") when the component does not exist or `componentId` is null.

This is a synchronous method and does not fetch from Foundry's item database. Use `resolveComponentNameAsync` when the component has a `sourceUuid` and you need the linked item's name.

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

Async variant of `resolveComponentName`. Attempts to resolve the component's `sourceUuid` via `fromUuid()` first and returns the linked item's name when found. Falls back to the component's stored `name`, then to "Unknown Component" on broken references.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `recipe` | `Recipe` | The recipe that references the component |
| `componentId` | `string \| null` | The component ID to resolve |

**Returns:** `Promise<string>`

### resolveComponentImg(recipe, componentId)

Returns the image path for a component referenced by a recipe. Falls back to a default component icon when the component is not found or has no image set.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `recipe` | `Recipe` | The recipe that references the component |
| `componentId` | `string \| null` | The component ID to resolve |

**Returns:** `string`

### resolveResultDescription(recipe, componentId, quantity)

Returns a formatted result description in the form `Nx Name`, where `N` is the quantity and `Name` is resolved via `resolveComponentName`. Falls back to "Unknown Component" when the component is not found.

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

Imports recipes from JSON. GM only.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `recipesData` | `object[]` | Array of recipe data objects |
| `overwrite` | `boolean` | Whether to overwrite existing recipes with the same ID |

**Returns:** `Promise<void>`
