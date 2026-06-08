---
layout: default
title: Visibility & Knowledge
nav_order: 7
---

# Visibility & Knowledge

Fabricate supports four approaches to controlling which recipes players can see and craft: **global**, **player lists**, **knowledge gating**, and **teaser mode**. The approach is configured per crafting system via the `listMode` setting.

---

Picture a campaign where novice adventurers know only basic recipes -- a healing salve and a simple torch -- while a master artificer has unlocked legendary weapon blueprints through months of questing. Fabricate's visibility system lets you control exactly this: which recipes each player can see and when new ones become available. You might make every recipe visible from the start for a casual game, hand-pick recipes per player for tighter narrative control, or gate discovery behind owning an in-world "recipe scroll" that a player finds in a dragon's hoard. The [list modes below](#list-modes) walk through each approach, starting with the four modes you can set on a crafting system.

## List Modes

Set `recipeVisibility.listMode` on your crafting system — either through the **Recipe Visibility** card in the Crafting Admin panel or via the API — to choose the approach.

### Global Mode (`listMode: "global"`)

All recipes in the system are visible to all users.

- No per-recipe restrictions are applied.
- The recipe editor does not show visibility controls because they have no effect in this mode.
- This is the default for all new systems and for any existing system that has not had an explicit `listMode` saved.

Use global mode when recipe discovery is not part of your game design — for example, a simple crafting system where players just need to know what they can make.

### Player Mode (`listMode: "player"`)

The GM directly controls who sees each recipe via a per-recipe allow-list.

- Each recipe has a `visibility.restricted` flag.
- When a recipe is restricted, only users whose IDs appear in `visibility.allowedUserIds` can see it.
- GMs always see all recipes.
- A restricted recipe with an empty `allowedUserIds` list is hidden from all players. This is useful while you are drafting a recipe before assigning it to specific users — it is a valid configuration and saves without error.
- The recipe list in the Crafting Admin panel shows a **Visibility** column summarising each recipe's access level.

**In the recipe editor.** When the system is in player mode, the recipe editor shows a "Restrict visibility to specific users" checkbox. When checked, a list of users appears so you can tick the ones who should have access. Leaving the user list empty is allowed.

**Simple and explicit.** Good for smaller recipe sets where you want direct control over who can see what.

### Knowledge Mode (`listMode: "knowledge"`)

Recipes are discovered through gameplay.

- Players must "know" a recipe before it appears in their list.
- Knowledge can come from **owning a recipe item**, **learning the recipe**, or **both**, depending on your `knowledge.mode` setting.
- Encourages exploration and discovery.
- The restriction UI in the recipe editor is hidden in this mode because access is always evaluated through the knowledge model, not an allow-list.

### Teaser Mode (`listMode: "teaser"`)

Recipes are partially visible to players before they are discovered. Players can see that a recipe exists — its name, category, and an optional teaser description — but hidden fields (ingredients, results, or description) are concealed until the player accumulates enough discovery progress.

- Each recipe defines which fields to hide and a `revealThreshold` (the amount of discovery progress required to fully unlock it).
- Progress accumulates via **fragments** (items linked to a UUID that grant progress automatically on acquisition) or **manual GM assignment**, or both.
- API consumers can read progress toward unlocking a teaser recipe; the planned Crafting UI will show that progress to players.
- When progress meets the threshold the recipe transitions to fully visible and craftable.

See [Teaser Mode]({% link visibility-teaser.md %}) for full configuration details.

## Knowledge Modes

When using `listMode: "knowledge"`, the `knowledge.mode` setting determines how access is evaluated:

| Mode | Access Granted When |
|:-----|:-------------------|
| `item` | Player owns a matching recipe item |
| `learned` | Recipe has been explicitly learned |
| `itemOrLearned` | Either condition is met |

## Recipe Items

A **recipe item** is a regular Foundry item linked to a recipe via `linkedRecipeItemUuid`. Think of it as a "recipe scroll" or "crafting manual".

### Linking a Recipe Item in the Editor

When a crafting system uses knowledge-mode visibility, the recipe editor shows a **Linked Recipe Item** section. There are two ways to link an item:

- **Browse Items** — opens a picker so you can select any existing world item or compendium item by UUID.
- **Create Recipe Item** — creates a new world item named `Recipe: <recipeName>` with type `loot` and automatically links it to this recipe. Use this when you want a fresh scroll or manual for the recipe without leaving the editor.

Once a UUID resolves to an item, the editor displays the item's image, name, and UUID alongside a **Clear** button. Click **Clear** to unlink the item and enter a different UUID.

If a linked item UUID is required by the system's visibility mode but has not been set, the editor shows a validation warning before you save.

### How Matching Works

An owned item matches a recipe's `linkedRecipeItemUuid` when any of the following is true:

1. The owned item's UUID exactly equals `linkedRecipeItemUuid`
2. The owned item's `_stats.compendiumSource` equals `linkedRecipeItemUuid` (Foundry v12+)
3. The owned item's `flags.core.sourceId` equals `linkedRecipeItemUuid` (Foundry v11 and earlier, legacy fallback)

When an item is dragged from a compendium to a character sheet, Foundry creates a copy with a new UUID and records the original compendium UUID as the item's source. On Foundry v12 and later this is stored in `_stats.compendiumSource`; on earlier versions it was stored in `flags.core.sourceId`. Fabricate reads both fields so that recipe scrolls work correctly regardless of which Foundry version created the owned copy.

> **Foundry v12+ note:** If a player owns a recipe scroll that was duplicated from a compendium but the recipe still shows as unknown, check that the item's `_stats.compendiumSource` field matches the `linkedRecipeItemUuid` stored on the recipe. Open the browser console and inspect `item._stats.compendiumSource` alongside `item.flags?.core?.sourceId`. If only the legacy `sourceId` field is populated (for example, on an item created on Foundry v11 that was not re-imported), the legacy fallback will still match correctly. If neither field matches, re-import the recipe item from the compendium.

### Limited Uses

Recipe items can have limited uses:

| Setting | Description |
|:--------|:------------|
| `knowledge.item.limitUses` | Enable use tracking |
| `knowledge.item.maxUses` | Maximum number of times the item grants access |
| `knowledge.item.destroyWhenExhausted` | Delete the item when uses run out |

Usage is tracked per owned item instance:

```
Item.flags.fabricate.recipeItemUsage = {
  timesUsed: <number>
}
```

When `timesUsed >= maxUses`, the item no longer grants knowledge access.

### Deterministic Selection

When multiple owned items match the same recipe, Fabricate selects deterministically:
1. Prefer the item with the highest `timesUsed` (consolidate usage)
2. Break ties by actor order (crafting actor first, then source actors)
3. Break further ties by item order within the actor

## Learning Recipes

When `knowledge.mode` is `learned` or `itemOrLearned`, players can explicitly learn recipes:

### Learn Flow

1. An owned recipe item is evaluated by `RecipeVisibilityService.learnRecipesFromOwnedItem(...)`, or an integration calls `learnRecipe(...)`.
2. Preconditions: recipe has a `linkedRecipeItemUuid`, player owns a matching item, recipe not yet learned.
3. The service records the recipe in the actor's flags.
4. The planned Crafting UI will expose this flow as a player "Learn" action.

```
Actor.flags.fabricate.learnedRecipes = {
  "<recipeId>": {
    learnedAt: <timestamp>,
    sourceItemUuid: "<the item that taught it>"
  }
}
```

### Consume on Learn

When `knowledge.learn.consumeOnLearn` is `true` (the default), the recipe item is consumed (deleted) when the player learns the recipe. This creates one-time-use "recipe scrolls".

Set `consumeOnLearn` to `false` if you want the item to persist after learning — for example, a spellbook that teaches recipes but is not destroyed in the process.

You configure `consumeOnLearn` in the **Recipe Visibility** card on the System tab of the Crafting Admin panel. The option is only shown when `listMode` is `"knowledge"`.

### Drag-and-Drop Learning

Dragging a recipe item onto a crafting actor's sheet is a required learning pathway. When a valid recipe item is dropped onto an actor, Fabricate automatically learns every matched recipe whose own crafting system has auto-learn enabled (`knowledge.learn.dragDropEnabled: true`) — no button click required for that auto-learning subset.

Only actor-bound drop targets are considered for learning. If the drop target cannot be resolved to an actor, or the current user lacks permission to update that actor, the learning path is skipped silently.

#### How Matching Works for Dropped Items

A dropped item is matched against all recipes in the crafting system. A recipe matches when any of the following is true:

1. The dropped item's UUID equals `recipe.linkedRecipeItemUuid`
2. The dropped item's `_stats.compendiumSource` equals `recipe.linkedRecipeItemUuid` (Foundry v12+)
3. The dropped item's `flags.core.sourceId` equals `recipe.linkedRecipeItemUuid` (Foundry v11 and earlier, legacy fallback)

All three fields are always evaluated. A match on any one is sufficient. This means items dragged directly from the world and items originally copied from a compendium are both recognised, across all supported Foundry versions.

#### Recipe Book Items

A single dropped item can match more than one recipe. When this happens, the actor learns every matched recipe in a single operation. This makes it straightforward to create "recipe book" items — one Alchemist's Compendium, for example, might unlock Healing Salve, Antitoxin, and Smokestick all at once.

#### Mixed-System Behavior

Recipe-item learning is evaluated per matched recipe, not once for the item as a whole. In a world with multiple crafting systems:

- Recipes from systems where `knowledge.learn.dragDropEnabled` is `true` auto-learn when the item is dropped onto the actor.
- Recipes from systems where `knowledge.learn.dragDropEnabled` is `false` are excluded from auto-learning, even if the same owned item matches them.

This means the same owned item can auto-learn some recipes immediately and still offer manual learning for other matched recipes from differently configured systems.

### Manual Learning On Owned Item Sheets

When a matched recipe belongs to a system where auto-learn is disabled (`knowledge.learn.dragDropEnabled: false`), Fabricate adds a **Learn Recipe** action to the actor-owned item sheet instead of auto-learning on drop.

- The action appears only on actor-owned item sheets.
- It appears only when the current user can update the owning actor and at least one matched recipe is manually learnable.
- The action learns only the manual-learning subset: matched recipes from systems where auto-learn is disabled.
- If the same owned item also matches recipes from auto-learn-enabled systems, those recipes still learn automatically on drop while the remaining manual-only recipes stay available from the item sheet action.

After clicking **Learn Recipe**, Fabricate asks for confirmation and then applies the same consume-on-learn behavior used by drag-and-drop learning.

#### Notifications

After a drag-and-drop learn attempt, Fabricate shows notifications for successful outcomes and stays silent for ignored outcomes:

| Outcome | Notification shown |
|:--------|:-------------------|
| **Success** | Lists each recipe learned and the actor that learned them. |
| **Partial success** | When some matched recipes were already known, only the newly learned recipes are listed. If all matches were already known, the player is notified that nothing new was learned. |
| **No match** | The drop is silently ignored for learning purposes. No notification is shown. The item is still added to the actor's inventory as normal. |
| **Precondition failure** | When the system's knowledge mode does not support learning (i.e., mode is `item` only), no learn operation occurs and no notification is shown. |

## Locked Recipes

Any recipe can be `locked` regardless of visibility mode. Locked recipes:
- Are visible to all players (so they know it exists)
- Cannot be crafted by non-GM users
- Return locked state through the visibility guard; the planned Crafting UI will show a "Locked" badge

## Crafting Guards

Before starting, resuming, or advancing a crafting run, Fabricate re-evaluates:
1. Is the recipe still visible to this user?
2. Is the recipe locked? (non-GM blocked)
3. Does the user still have knowledge access? (if applicable)

If any guard fails, the action is blocked with a notification explaining why.

## Configuring via the API

You can set visibility programmatically through the `CraftingSystemManager`:

```javascript
// Switch an Alchemy system to player-specific visibility
Hooks.once('fabricate.ready', async () => {
  const mgr = game.fabricate.getCraftingSystemManager();
  await mgr.updateSystem('alchemy-system-id', {
    recipeVisibility: { listMode: 'player' }
  });
});
```

```javascript
// Switch to knowledge mode: players must own a recipe scroll to see the recipe,
// and the scroll is consumed when they learn it.
Hooks.once('fabricate.ready', async () => {
  const mgr = game.fabricate.getCraftingSystemManager();
  await mgr.updateSystem('alchemy-system-id', {
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: {
        mode: 'itemOrLearned',
        learn: { consumeOnLearn: true }
      }
    }
  });
});
```

---

## What's next?

- [Teaser Mode]({% link visibility-teaser.md %}) -- reveal recipes gradually with fragment-based or threshold-based discovery.
- [Recipes overview]({% link recipes/index.md %}) -- create and edit recipes, including visibility configuration in the recipe editor.
- [Crafting Systems]({% link crafting-systems.md %}) -- configure system-level visibility settings and feature toggles.
- [Macros & Examples]({% link macros/index.md %}) -- automate visibility and knowledge workflows with macros.
