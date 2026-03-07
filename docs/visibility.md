---
layout: default
title: Visibility & Knowledge
nav_order: 7
---

# Visibility & Knowledge

Fabricate supports three approaches to controlling which recipes players can see and craft: **global**, **player lists**, and **knowledge gating**. The approach is configured per crafting system via the `listMode` setting.

---

Picture a campaign where novice adventurers know only basic recipes -- a healing salve and a simple torch -- while a master artificer has unlocked legendary weapon blueprints through months of questing. Fabricate's visibility system lets you control exactly this: which recipes each player can see and when new ones become available. You might make every recipe visible from the start for a casual game, hand-pick recipes per player for tighter narrative control, or gate discovery behind owning an in-world "recipe scroll" that a player finds in a dragon's hoard. The [list modes below](#list-modes) walk through each approach, starting with the three modes you can set on a crafting system.

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

An owned item matches a recipe's `linkedRecipeItemUuid` when either:

1. The owned item's UUID exactly equals `linkedRecipeItemUuid`
2. The owned item's `flags.core.sourceId` equals `linkedRecipeItemUuid`

The `sourceId` matching is important because when items are dragged from compendiums to character sheets, Foundry creates a new item with a new UUID but preserves the original UUID as `sourceId`.

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

1. Player sees a recipe with a "Learn" action in the crafting app
2. Preconditions: recipe has a `linkedRecipeItemUuid`, player owns a matching item, recipe not yet learned
3. Player clicks "Learn" and confirms
4. The recipe is recorded in the actor's flags:

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

Dragging a recipe item onto a crafting actor's sheet is a required learning pathway. Fabricate registers a drop handler on all actor sheets: when a valid recipe item is dropped onto an actor, it triggers recipe learning automatically — no button click required.

Only actor-bound drop targets are considered for learning. If the drop target cannot be resolved to an actor, or the current user lacks permission to update that actor, the learning path is skipped silently.

#### How Matching Works for Dropped Items

A dropped item is matched against all recipes in the crafting system. A recipe matches when either condition is true:

1. The dropped item's UUID equals `recipe.linkedRecipeItemUuid`
2. The dropped item's `flags.core.sourceId` equals `recipe.linkedRecipeItemUuid`

Both UUID identity and `core.sourceId` ancestry are always evaluated. A match on either is sufficient. This means items dragged directly from the world and items originally copied from a compendium are both recognised.

#### Recipe Book Items

A single dropped item can match more than one recipe. When this happens, the actor learns every matched recipe in a single operation. This makes it straightforward to create "recipe book" items — one Alchemist's Compendium, for example, might unlock Healing Salve, Antitoxin, and Smokestick all at once.

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
- Show a "Locked" badge in the crafting app

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

- [Recipes overview]({% link recipes/index.md %}) -- create and edit recipes, including visibility configuration in the recipe editor.
- [Crafting Systems]({% link crafting-systems.md %}) -- configure system-level visibility settings and feature toggles.
- [Macros & Examples]({% link macros/index.md %}) -- automate visibility and knowledge workflows with macros.
