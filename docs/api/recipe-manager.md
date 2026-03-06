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

```javascript
const check = rm.canCraft(actor, recipe);
if (!check.canCraft) {
  check.missing.ingredients.forEach(m => {
    console.log(`Need ${m.need}x ${m.ingredient.getDescription()}, have ${m.have}`);
  });
}
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
