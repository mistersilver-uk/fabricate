---
layout: default
title: API Reference
nav_order: 9
has_children: true
---

# API Reference

Fabricate exposes its API through two Foundry globals:

- **`game.fabricate`** -- the main Fabricate instance with service accessors and a quick `craft()` helper
- **`globalThis.fabricate`** (alias: `fabricate`) -- convenience functions for macros
- **`game.fabricate.api`** -- constructor references for all public classes

All APIs are available after the `fabricate.ready` hook fires:

```javascript
Hooks.on('fabricate.ready', () => {
  const recipeManager = game.fabricate.getRecipeManager();
  // API is now safe to use
});
```

{: .warning }
> Do not call Fabricate APIs before the `fabricate.ready` hook. The module initialises during Foundry's `ready` hook, and services are not available until initialisation completes.

---

## Quick Reference

### Service Accessors

```javascript
game.fabricate.getRecipeManager()          // Recipe CRUD and queries
game.fabricate.getCraftingEngine()          // Execute crafting
game.fabricate.getCraftingSystemManager()   // System and managed item CRUD
game.fabricate.getCraftingRunManager()      // Multi-step run management
game.fabricate.getRecipeVisibilityService() // Visibility and knowledge
game.fabricate.getResolutionModeService()   // Mode validation and resolution
```

### Global Macro Helpers

```javascript
fabricate.createSimpleRecipe(name, ingredients, result)
fabricate.craft(actor, recipeId, options)
fabricate.listRecipes(filters)
fabricate.getAvailableRecipes(actorOrActors)
fabricate.openRecipeManager()
fabricate.listCraftingSystems()
```

### Class Constructors

```javascript
const {
  Recipe, Ingredient, IngredientGroup, IngredientSet,
  Catalyst, Result,
  RecipeManager, CraftingEngine, CraftingSystemManager,
  CraftingRunManager, RecipeVisibilityService, ResolutionModeService,
  CraftingApp, RecipeManagerApp, RecipeEditorApp
} = game.fabricate.api;
```

## Data Persistence

Fabricate stores data in Foundry's settings and flags:

| Location | Key | Contents |
|:---------|:----|:---------|
| World setting | `fabricate.craftingSystems` | All crafting system configurations |
| World setting | `fabricate.recipes` | All recipes |
| Client setting | `fabricate.lastCraftingActor` | Last selected crafting actor UUID |
| Client setting | `fabricate.lastComponentSources` | Last selected source actor UUIDs |
| Client setting | `fabricate.lastManagedCraftingSystem` | Last viewed system in GM admin |
| Client setting | `fabricate.progressiveResultOrder` | Per-recipe player reorder preferences for progressive mode results (Object, default `{}`) |
| Actor flag | `fabricate.craftingRuns.active` | In-progress crafting runs |
| Actor flag | `fabricate.craftingRuns.history` | Completed crafting runs |
| Actor flag | `fabricate.learnedRecipes` | Learned recipe records |
| Item flag | `fabricate.catalystItemUsage` | `{ timesUsed }` for catalyst tracking |
| Item flag | `fabricate.recipeItemUsage` | `{ timesUsed }` for recipe item tracking |

## Hooks

| Hook | When | Payload |
|:-----|:-----|:--------|
| `fabricate.ready` | After module initialisation completes | None |
