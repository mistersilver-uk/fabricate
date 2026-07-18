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
- `"gm"` means an alchemy recipe seen by a GM, who has every recipe revealed and craftable.
- `"alchemy-revealed"` means an alchemy recipe revealed to the viewer in the Known list.
- `"alchemy-unrevealed"` means an alchemy recipe not yet revealed to the viewer.

**Alchemy mode is reveal-not-gate.**
For a system whose `resolutionMode` is `"alchemy"`, `visible` reflects only whether the recipe is revealed in the player's Known list, and `craftable` is always `true` for a non-GM regardless of reveal state.
Brewing is gated solely by a matched ingredient signature, never by visibility.
The system's `visibilityMode` selects the reveal source: `global` reveals brew-discovered recipes, `item` reveals a linked book or scroll held on the crafting actor or a component source, `knowledge` reveals a learned recipe, and `restricted` (surfaced as "Manual" in the alchemy manager) reveals a recipe granted on the Access tab.
Brew-discovery (`alchemy.learnOnCraft`) reveal is unioned across every mode, and `learnOnCraft` governs only whether a matched brew records that discovery, never whether a recipe is craftable.
For non-alchemy modes `craftable` still follows the mode's gating rules, and `guardCraftStart` re-runs the same evaluation before a run starts.

### evaluateKnowledgeAccess(params)

Checks whether a user has knowledge of a recipe.

**Returns:** `{ granted: boolean, reason: string, hasLearned: boolean, hasMatchedItem: boolean, matchedItems: Item[] }`

### guardCraftStart(params)

Guard check before starting or resuming a crafting run.
For a non-GM it first runs a system-validity check on the recipe's crafting system.
When the system has a blocker that makes it unusable it returns `craftable: false` with reason `"system-invalid"`, and when this specific recipe is individually hidden it returns reason `"visibility"`.
This runs even when the recipe is targeted directly, so a non-GM cannot bypass visibility by passing a recipe that never appeared in their listing.
A GM bypasses this check so they can still reach a broken system to diagnose it.
It then delegates to `evaluateRecipeAccess`, so it otherwise returns the same access object and blocks the action when `craftable` is `false`.
For an alchemy system `craftable` is always `true` for a non-GM once the system-validity check passes, so this guard never blocks a valid brew on visibility.

**Returns:** `{ visible: boolean, craftable: boolean, reason: string, knowledge: object }`

```javascript
const vis = game.fabricate.getRecipeVisibilityService();
const guard = vis.guardCraftStart({
  viewer: game.user,
  recipe: myRecipe,
  craftingActor: actor,
  componentSourceActors: [actor]
});

if (!guard.craftable) {
  ui.notifications.warn(`Cannot craft: ${guard.reason}`);
}
```

### learnRecipe(params)

Records a recipe as learned for the crafting actor.
Optionally consumes the recipe item.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `params.recipe` | `Recipe` | The recipe to learn |
| `params.craftingActor` | `Actor` | The actor who learns it |
| `params.componentSourceActors` | `Actor[]` | Source actors (for item matching) |

The crafting actor (or one of the source actors) must own a matching recipe item for learning to succeed.
This requirement applies to every caller, including a GM.

**Returns:** `Promise<{ success: boolean, message: string, messageData?: object }>`

`message` is an i18n key such as `FABRICATE.Knowledge.AlreadyLearned`.
UI callers are expected to localize it at the presentation boundary, using `messageData` for interpolation when present.

### cleanupLearnedRecipes(validRecipeIds)

Removes learned records for recipes that no longer exist.

**Returns:** `Promise<void>`
