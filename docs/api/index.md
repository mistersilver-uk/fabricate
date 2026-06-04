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

### Services And Runtime Methods

```javascript
game.fabricate.getRecipeManager()          // Recipe CRUD and queries
game.fabricate.getCraftingEngine()          // Execute crafting
game.fabricate.getCraftingSystemManager()   // System and component CRUD
game.fabricate.getCraftingRunManager()      // Multi-step run management
game.fabricate.getGatheringEnvironmentStore() // Gathering environment persistence
game.fabricate.getGatheringRunManager()     // Gathering run persistence
game.fabricate.getGatheringGateAndCheckEvaluator() // Gathering gate/check evaluation
game.fabricate.listGatheringForActor({ actor }) // Player-visible gathering listing
game.fabricate.startGatheringAttempt({ actor, environmentId, taskId }) // Start gathering
game.fabricate.listSelectableActors()       // Player-character actors for the actor-selection bar
game.fabricate.getSelectedGatheringActorId() // Persisted remembered gathering actor id
game.fabricate.setSelectedGatheringActorId(id) // Persist the remembered gathering actor id
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
  Recipe, Ingredient, IngredientGroup, Catalyst,
  RecipeManager, CraftingEngine, CraftingSystemManager,
  CraftingRunManager, SalvageRunManager,
  GatheringEnvironmentStore, GatheringRunManager,
  GatheringGateAndCheckEvaluator, GatheringEngine,
  RecipeVisibilityService, ResolutionModeService,
  SignatureValidator, ItemPilesIntegration,
  getCraftingAppClass, getGatheringAppClass,
  getRecipeManagerAppClass, getRecipeEditorAppClass,
  CompendiumImporter, CraftingSystemExporter
} = game.fabricate.api;
```

### Gathering Runtime Facade

Use the public `game.fabricate` methods when macros or integrations need to list or start gathering for the current user. The raw gathering engine is not exposed as a service accessor; these facade methods inject the current Foundry user as the viewer before delegating to runtime internals.

```javascript
Hooks.once('fabricate.ready', async () => {
  const actor = game.user.character;
  const listing = await game.fabricate.listGatheringForActor({ actor });

  const environment = listing.environments[0];
  const task = environment?.tasks?.[0];
  if (environment && task?.attemptable) {
    await game.fabricate.startGatheringAttempt({
      actor,
      environmentId: environment.id,
      taskId: task.id
    });
  }
});
```

`listGatheringForActor` returns the current browsing state plus `activeRuns` and recent `history` for the selected actor. Those run lists are retained even when no environment/task rows are currently browseable because the actor is blocked, the environment list is empty, or visibility gates hide all tasks. For non-GM blind or missing-environment rows, the runtime redacts task IDs, result details, catalyst details, diagnostics, and check internals.

When `rememberedActorId` is omitted from `listGatheringForActor` options, it defaults to the persisted last-gathering selection (`getSelectedGatheringActorId()`), so a fresh listing honors the remembered actor. Passing an explicit `rememberedActorId` always overrides that default — including an explicit `null`, which forces no remembered actor.

### Actor Selection

These methods back the unified Fabricate window's actor-selection bar and persist the remembered gathering actor:

```javascript
Hooks.once('fabricate.ready', () => {
  // Player-safe display data for the actor-selection bar.
  const actors = game.fabricate.listSelectableActors();
  // -> [{ id, uuid, name, img }, …]

  const current = game.fabricate.getSelectedGatheringActorId(); // '' when unset
  game.fabricate.setSelectedGatheringActorId(actors[0]?.id ?? '');
});
```

- `listSelectableActors()` returns the current user's selectable **player characters** (`actor.type === 'character'`) — owned actors for players, all for GMs. Each record is redaction-safe display data containing only `{ id, uuid, name, img }`; no other actor internals are exposed. This selection list is narrower than gathering attempt authorization: an owned non-player-character actor stays attempt-authorized through `listGatheringForActor` / `startGatheringAttempt` but does not appear in the bar.
- `getSelectedGatheringActorId()` reads the persisted remembered selection from the `fabricate.lastGatheringActor` client setting, returning `''` when unset.
- `setSelectedGatheringActorId(id)` persists the remembered selection to that same client setting.

## Data Persistence

Fabricate stores data in Foundry's settings and flags:

| Location | Key | Contents |
|:---------|:----|:---------|
| World setting | `fabricate.craftingSystems` | All crafting system configurations |
| World setting | `fabricate.recipes` | All recipes |
| World setting | `fabricate.gatheringEnvironments` | Gathering environment and task configurations |
| World setting | `fabricate.gatheringConfig` | Gathering library, rules, condition vocabularies, and per-system gathering configuration |
| World setting | `fabricate.migrationVersion` | Last completed Fabricate data migration version |
| World setting | `fabricate.theme` | Active product UI theme (`Fabricate` by default; other presets are `Mythwright`, `Ironblood Forge`, `Hearth & Herb`, `Starglass Arcana`, and the fixed Foundry-inspired `Foundry Native` palette) |
| World setting | `fabricate.experimentalFeatures` | Reserved future experimental feature switch, disabled by default |
| Client setting | `fabricate.lastCraftingActor` | Last selected crafting actor UUID |
| Client setting | `fabricate.lastGatheringActor` | Last selected gathering actor ID |
| Client setting | `fabricate.lastComponentSources` | Last selected source actor UUIDs |
| Client setting | `fabricate.lastManagedCraftingSystem` | Last viewed system in GM admin |
| Client setting | `fabricate.lastAlchemySystem` | Last selected alchemy system in the Alchemy tab |
| Client setting | `fabricate.favouriteRecipes` | Favourite recipe IDs for the current client |
| Client setting | `fabricate.recentlyCrafted` | Recently crafted recipe entries for the current client |
| Client setting | `fabricate.progressiveResultOrder` | Per-recipe player reorder preferences for progressive mode results (Object, default `{}`) |
| Actor flag | `fabricate.craftingRuns.active` | In-progress crafting runs |
| Actor flag | `fabricate.craftingRuns.history` | Completed crafting runs |
| Actor flag | `fabricate.gatheringRuns.active` | In-progress gathering runs |
| Actor flag | `fabricate.gatheringRuns.history` | Completed gathering runs |
| Actor flag | `fabricate.learnedRecipes` | Learned recipe records |
| Item flag | `fabricate.catalystItemUsage` | `{ timesUsed }` for catalyst tracking |
| Item flag | `fabricate.recipeItemUsage` | `{ timesUsed }` for recipe item tracking |

## Hooks

| Hook | When | Payload |
|:-----|:-----|:--------|
| `fabricate.ready` | After module initialisation and guarded startup world-time processing complete | None |

Startup world-time processing awaits crafting, salvage, and gathering settlement before `fabricate.ready` fires. Later Foundry `updateWorldTime` events dispatch the same processors without blocking the hook; individual processor failures are caught and logged so one subsystem does not prevent the others from running.
