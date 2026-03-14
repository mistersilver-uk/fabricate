---
layout: default
title: Alchemy Mode
parent: Recipes
nav_order: 6
---

# Alchemy Mode

Alchemy mode turns recipe crafting into a discovery game. Players cannot see recipe names or ingredient lists up front. Instead, they select components from a palette on their Alchemy workspace and submit them. If the combination matches a recipe, the craft succeeds. If it does not match, the items may be silently consumed.

Use alchemy mode for systems where recipes are secrets — a witch's grimoire, an experimental alchemist's bench, or any scenario where players are meant to experiment rather than follow a known formula.

---

## The Alchemy Tab

When your world has at least one alchemy-mode crafting system, the Crafting App shows a tabbed layout. The **Alchemy** tab is the workspace for experimental crafting. If you also have non-alchemy crafting systems, the **Crafting** tab holds the normal recipe list. If you only have alchemy systems, only the Alchemy tab is shown (no tab bar appears).

### Selecting a System

If multiple alchemy systems exist, a drop-down appears at the top of the Alchemy tab. Choosing a system loads that system's components into the palette and updates the Discovered Recipes panel on the right. Your last selection is remembered between sessions.

### The Component Palette

The left side of the tab shows every component that belongs to the selected alchemy system. Each tile displays:

- The component's item image.
- The component's name.
- A quantity badge showing how many are available to use (inventory minus what is already on the workbench).

Tiles with zero available quantity are dimmed and cannot be clicked.

- **Left-click** a tile to add one of that component to the workbench.
- **Right-click** a workbench chip (or a palette tile that is already on the workbench) to remove one.

### The Workbench

Below the palette is the **Workbench** bar. It shows the components you have staged for a crafting attempt as labelled chips (`Nightshade x2`, `Moonwater x1`, etc.).

| Button | Action |
|:-------|:-------|
| **Craft** | Submit the current workbench contents. Fabricate matches them against all enabled recipes in the selected system. |
| **Trash icon** | Clear all chips from the workbench without crafting. |
| **Right-click a chip** | Remove one unit of that component from the workbench. |

Fabricate enforces a maximum of your current available inventory per component — you cannot stage more than you own.

### Discovered Recipes Panel

The right side of the tab shows the **Discovered Recipes** panel. This panel only has content when `learnOnCraft` is enabled and a player has previously discovered recipes in the selected system. GMs always see all recipes.

For each discovered recipe the panel shows:

- The recipe image and name.
- A status badge — **Available** (green) if you have all the required components right now, or **Missing materials** (grey) if you do not.
- An **Auto-fill** button (funnel icon) that instantly populates the workbench with the correct components for that recipe.

You can filter the list using the search bar and the **Craftable only** toggle.

---

## Auto-Fill

Clicking the **Auto-fill** button on a discovered recipe clears the workbench and then populates it with the best ingredient set for that recipe that can be satisfied from your current inventory.

The algorithm:

1. Tries each of the recipe's ingredient sets in order.
2. Uses the first set that can be fully satisfied from inventory.
3. If no set is fully satisfiable, uses the set with the fewest missing groups and notifies you how many ingredient groups could not be fulfilled.

Craftability for the Discovered Recipes panel is evaluated against your **full inventory**, not inventory minus whatever is already staged on the workbench.

---

## How It Works

1. The GM creates a crafting system and sets its **Resolution Mode** to `alchemy`.
2. Players open the Crafting App and select the **Alchemy** tab.
3. Players click components in the palette to stage them on the workbench.
4. Players click **Craft**. Fabricate matches the staged components against all enabled recipes in the system.
5. If a matching recipe is found, the normal crafting flow runs (ingredients consumed, results created).
6. If no recipe matches, the attempt ends. Depending on system configuration, the submitted items may or may not be consumed.

---

## Signature Matching

Fabricate identifies a recipe match by comparing the staged components against the **component signatures** of each recipe in the system. A signature is the set of components that satisfy a recipe's ingredient groups.

- Each ingredient group must be satisfied by at least one staged component whose source-reference chain overlaps a component in that group.
- Fabricate checks the staged item's live UUID, canonical source UUID, and the component's `sourceUuid`, `sourceItemUuid`, and `fallbackItemIds`.
- If all groups in an ingredient set are satisfied, the recipe is considered a match and crafting proceeds using that ingredient set.
- Recipes are checked in order; the first match is used.

{: .note }
> Alchemy matching is not limited to a single UUID field. A component can still match when its live `sourceUuid` changed, as long as the staged item overlaps the component's canonical `sourceItemUuid` or any recorded fallback UUID.

---

## Consume on Fail

By default, when no recipe matches, Fabricate removes the submitted items from the component source actors. You can change this by setting `system.alchemy.consumeOnFail` to `false`.

| `consumeOnFail` value | Behaviour on no-match |
|:----------------------|:----------------------|
| `true` (default) | Submitted items are deleted from actor inventory |
| `false` | Submitted items are left intact; no items are consumed |

To configure via the API:

```javascript
Hooks.once('fabricate.ready', async () => {
  const mgr = game.fabricate.getCraftingSystemManager();
  // Disable consume-on-fail for an alchemy system
  await mgr.updateSystem('my-alchemy-system-id', {
    alchemy: { consumeOnFail: false }
  });
});
```

---

## Learn on Craft

When `system.alchemy.learnOnCraft` is `true`, a player who successfully discovers a recipe has that recipe added to their learned-recipes flag. On all subsequent sessions that player can see the discovered recipe in the **Discovered Recipes** panel — they have unlocked the formula. The Auto-fill button lets them reproduce the craft without having to experiment again.

| `learnOnCraft` value | Behaviour on success |
|:---------------------|:---------------------|
| `false` (default) | Every attempt is anonymous; players never see recipe names |
| `true` | Discovered recipes are written to `actor.flags.fabricate.learnedRecipes`; the player can see and auto-fill them in future sessions |

```javascript
Hooks.once('fabricate.ready', async () => {
  const mgr = game.fabricate.getCraftingSystemManager();
  await mgr.updateSystem('my-alchemy-system-id', {
    alchemy: { learnOnCraft: true }
  });
});
```

---

## Setting Up an Alchemy System

### In the GM Admin Panel

1. Open **Manage Crafting Systems** from the Items sidebar.
2. Click **Create System** and give it a name (e.g. "Witch's Alchemy").
3. In the **System Settings** card, set **Resolution Mode** to `alchemy`.
4. Add your managed components (ingredients) in the **Components** tab using drag-and-drop from the Items sidebar.
5. Create recipes in the normal recipe editor. Ingredient sets define the hidden signatures that players must discover by experiment. Result groups define what is produced on a successful match.
6. Enable each recipe. Disabled recipes are never matched.

{: .warning }
> Changing the resolution mode on an existing system that has recipes will delete those recipes, because their configuration may be incompatible with the new mode. You will be asked to confirm.

### Configuring the alchemy sub-object via API

```javascript
Hooks.once('fabricate.ready', async () => {
  const mgr = game.fabricate.getCraftingSystemManager();
  await mgr.updateSystem('my-alchemy-system-id', {
    alchemy: {
      consumeOnFail: true,   // consume items when no recipe matches
      learnOnCraft: true     // write discovered recipes to actor flags
    }
  });
});
```

---

## Visibility Rules

In alchemy mode, recipe visibility follows special rules regardless of the system's `recipeVisibility.listMode`:

| Viewer | Visibility in Discovered Recipes panel |
|:-------|:---------------------------------------|
| GM | All recipes visible (for authoring and debugging) |
| Player (`learnOnCraft: false`) | No recipes visible |
| Player (`learnOnCraft: true`, recipe not yet discovered) | Recipe not visible |
| Player (`learnOnCraft: true`, recipe previously discovered) | Recipe visible and auto-fillable |

---

## Data Persistence

The last selected alchemy system is persisted per client as a Foundry setting:

| Setting key | Scope | Description |
|:------------|:------|:------------|
| `fabricate.lastAlchemySystem` | Client | ID of the last alchemy system selected in the Alchemy tab |

The workbench contents are held in the Crafting App's local state only. They are cleared when you switch systems, close the app, or click the trash button.

---

## What's Next?

- [Simple Mode]({% link recipes/simple.md %}) — standard A + B = C crafting without hidden signatures
- [Visibility & Knowledge]({% link visibility.md %}) — the full recipe knowledge system (learn by item, learn by flag)
- [Crafting Systems]({% link crafting-systems.md %}) — all system-level settings and feature toggles
