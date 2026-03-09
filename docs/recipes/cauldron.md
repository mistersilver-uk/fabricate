---
layout: default
title: Cauldron Mode
parent: Recipes
nav_order: 6
---

# Cauldron Mode

Cauldron mode turns recipe crafting into a discovery game. Players cannot see recipe names or ingredient lists. Instead, they drag items into the cauldron and submit them. If the combination matches a recipe, the craft succeeds. If it does not match, the items may be silently consumed.

Use cauldron mode for systems where recipes are secrets — a witch's grimoire, an experimental alchemist's bench, or any scenario where players are meant to experiment rather than follow a known formula.

---

## How It Works

1. The GM creates a crafting system and sets its **Resolution Mode** to `cauldron`.
2. Players open the Crafting App and see a **Cauldron** panel instead of the normal recipe list.
3. Players drag inventory items into the cauldron from their character sheet or inventory.
4. Players click **Submit**. Fabricate matches the submitted items against all enabled recipes.
5. If a matching recipe is found, the normal crafting flow runs (ingredients consumed, results created).
6. If no recipe matches, the attempt ends. Depending on system configuration, the submitted items may or may not be consumed.

---

## Signature Matching

Fabricate identifies a recipe match by comparing the UUIDs of submitted items against the **component signatures** of each recipe in the system. A signature is the set of components that satisfy a recipe's ingredient groups.

- Each ingredient group must be satisfied by at least one submitted item whose `sourceItemUuid` (or `sourceUuid`) matches a component in that group.
- If all groups in an ingredient set are satisfied, the recipe is considered a match and crafting proceeds using that ingredient set.
- Recipes are checked in order; the first match is used.

{: .note }
> Cauldron matching uses the component's `sourceItemUuid` field (the item from which the component was derived) to identify submitted items. If a component's `sourceItemUuid` is not set, it cannot be matched in cauldron mode.

---

## Consume on Fail

By default, when no recipe matches, Fabricate removes the submitted items from the component source actors. You can change this by setting `system.cauldron.consumeOnFail` to `false`.

| `consumeOnFail` value | Behaviour on no-match |
|:----------------------|:----------------------|
| `true` (default) | Submitted items are deleted from actor inventory |
| `false` | Submitted items are left intact; no items are consumed |

To configure via the API:

```javascript
Hooks.once('fabricate.ready', async () => {
  const mgr = game.fabricate.getCraftingSystemManager();
  // Disable consume-on-fail for a cauldron system
  await mgr.updateSystem('my-cauldron-system-id', {
    cauldron: { consumeOnFail: false }
  });
});
```

---

## Learn on Craft

When `system.cauldron.learnOnCraft` is `true`, a player who successfully discovers a recipe has that recipe added to their learned-recipes flag. On all subsequent sessions that player can see the discovered recipe in a separate list — they have unlocked the formula.

| `learnOnCraft` value | Behaviour on success |
|:---------------------|:---------------------|
| `false` (default) | Every attempt is anonymous; players never see recipe names |
| `true` | Discovered recipes are written to `actor.flags.fabricate.learnedRecipes`; the player can see them on future visits |

```javascript
Hooks.once('fabricate.ready', async () => {
  const mgr = game.fabricate.getCraftingSystemManager();
  await mgr.updateSystem('my-cauldron-system-id', {
    cauldron: { learnOnCraft: true }
  });
});
```

---

## Setting Up a Cauldron System

### In the GM Admin Panel

1. Open **Manage Crafting Systems** from the Items sidebar.
2. Click **Create System** and give it a name (e.g. "Witch's Cauldron").
3. In the **System Settings** card, set **Resolution Mode** to `cauldron`.
4. Add your managed components (ingredients) in the **Components** tab using drag-and-drop from the Items sidebar.
5. Create recipes in the normal recipe editor. Ingredient sets define the hidden signatures that players must discover by experiment. Result groups define what is produced on a successful match.
6. Enable each recipe. Disabled recipes are never matched.

{: .warning }
> Changing the resolution mode on an existing system that has recipes will delete those recipes, because their configuration may be incompatible with the new mode. You will be asked to confirm.

### Configuring the cauldron sub-object via API

```javascript
Hooks.once('fabricate.ready', async () => {
  const mgr = game.fabricate.getCraftingSystemManager();
  await mgr.updateSystem('my-cauldron-system-id', {
    cauldron: {
      consumeOnFail: true,   // consume items when no recipe matches
      learnOnCraft: true     // write discovered recipes to actor flags
    }
  });
});
```

---

## Visibility Rules

In cauldron mode, recipe visibility follows special rules regardless of the system's `recipeVisibility.listMode`:

| Viewer | Visibility |
|:-------|:-----------|
| GM | All recipes visible (for authoring and debugging) |
| Player (`learnOnCraft: false`) | No recipes visible |
| Player (`learnOnCraft: true`, recipe not yet discovered) | Recipe not visible |
| Player (`learnOnCraft: true`, recipe previously discovered) | Recipe visible and craftable |

---

## What's Next?

- [Simple Mode]({% link recipes/simple.md %}) — standard A + B = C crafting without hidden signatures
- [Visibility & Knowledge]({% link visibility.md %}) — the full recipe knowledge system (learn by item, learn by flag)
- [Crafting Systems]({% link crafting-systems.md %}) — all system-level settings and feature toggles
