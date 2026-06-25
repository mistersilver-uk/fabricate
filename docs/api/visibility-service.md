---
layout: default
title: RecipeVisibilityService
parent: API Reference
nav_order: 5
---

# RecipeVisibilityService

Evaluates recipe visibility, knowledge access, and handles recipe learning.

**Access:** `game.fabricate.getRecipeVisibilityService()`

---

## Methods

### getVisibleRecipes(params)

Returns recipes visible to the viewer with access details.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `params.viewer` | `User` | The viewing user |
| `params.craftingSystemId` | `string` | System to query |
| `params.craftingActor` | `Actor` | The crafting actor |
| `params.componentSourceActors` | `Actor[]` | Source actors |

**Returns:** `object[]`.
Each entry includes `{ recipe, visible, craftable, reason, knowledge }`.

### evaluateRecipeAccess(params)

Full visibility and access evaluation for a single recipe.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `params.recipe` | `Recipe` | The recipe |
| `params.viewer` | `User` | The viewing user |
| `params.craftingActor` | `Actor` | The crafting actor |
| `params.componentSourceActors` | `Actor[]` | Source actors |

**Returns:** `{ visible: boolean, craftable: boolean, reason: string, knowledge: object }`

Possible `reason` values:

- `"ok"` means visible and craftable.
- `"visibility"` means blocked by player list.
- `"knowledge"` means blocked by knowledge requirements.
- `"locked"` means the recipe is locked (non-GM).
- `"missing-system"` means the recipe's system was not found.

### evaluateKnowledgeAccess(params)

Checks whether a user has knowledge of a recipe.

**Returns:** `{ granted: boolean, reason: string, hasLearned: boolean, hasMatchedItem: boolean, matchedItems: Item[] }`

### guardCraftStart(params)

Guard check before starting or resuming a crafting run.
Blocks the action if visibility requirements are not met.

**Returns:** `{ allowed: boolean, reason: string }`

```javascript
const vis = game.fabricate.getRecipeVisibilityService();
const guard = vis.guardCraftStart({
  viewer: game.user,
  recipe: myRecipe,
  craftingActor: actor,
  componentSourceActors: [actor]
});

if (!guard.allowed) {
  ui.notifications.warn(`Cannot craft: ${guard.reason}`);
}
```

### learnRecipe(params)

Records a recipe as learned for the crafting actor.
Optionally consumes the recipe item.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `params.viewer` | `User` | The user |
| `params.recipe` | `Recipe` | The recipe to learn |
| `params.craftingActor` | `Actor` | The actor who learns it |
| `params.componentSourceActors` | `Actor[]` | Source actors (for item matching) |

**Returns:** `Promise<{ success: boolean, message: string, messageData?: object }>`

`message` is an i18n key such as `FABRICATE.Knowledge.AlreadyLearned`.
UI callers are expected to localize it at the presentation boundary, using `messageData` for interpolation when present.

### cleanupLearnedRecipes(validRecipeIds)

Removes learned records for recipes that no longer exist.

**Returns:** `Promise<void>`
