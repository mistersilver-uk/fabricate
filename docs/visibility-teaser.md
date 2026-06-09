---
layout: default
title: Teaser Mode
nav_order: 8
parent: Visibility & Knowledge
---

# Teaser Mode

Teaser mode is an optional layer on top of the standard [visibility modes]({% link visibility.md %}). When enabled on a crafting system, the visibility service can return undiscovered recipes as **teasers** — players may be allowed to know a recipe exists, while full ingredients, results, or details remain hidden. As players gather fragments or reach discovery thresholds, hidden fields are progressively revealed until the recipe is fully unlocked.

Use teaser mode when you want discovery to be gradual: players can see that "Philosopher's Stone" exists and that they are 2 of 5 fragments away from learning it, but cannot yet see what it requires.

{: .note }
> Teaser mode requires setting `recipeVisibility.listMode` to `"teaser"` on the crafting system. The existing `global`, `player`, and `knowledge` modes continue to work unchanged when teaser mode is off.

---

## How Teaser Mode Works

1. The GM sets the crafting system's `listMode` to `"teaser"` in the **Recipe Visibility** card of the Crafting Admin panel.
2. For each recipe, the GM configures a `teaser` block: which fields to hide, a `revealThreshold` (the discovery progress required to unlock the recipe fully), and an optional `teaserDescription` shown to players before unlock.
3. API consumers receive teaser visibility state with only the permitted fields visible. The planned Crafting UI will use this state for teaser cards and progress bars.
4. When a player's discovery progress for a recipe reaches or exceeds `revealThreshold`, the recipe transitions to fully visible and craftable through the visibility guard.

---

## Discovery Modes

The system-level `teaserConfig.discoveryMode` controls how players accumulate discovery progress:

| Mode | Description |
|:-----|:------------|
| `threshold` | The GM manually sets a numeric progress value per actor per recipe. Progress increases when the GM edits it via the **Teaser Progress Editor**. |
| `fragments` | Players acquire discovery progress by obtaining specific in-world items called **fragments**. Each fragment is linked to an item UUID and grants a defined amount of progress when the player adds it to their inventory. |
| `both` | Manual threshold progress and fragment progress are additive. Both pathways contribute to the same counter. |

---

## System Configuration

Open the **Recipe Visibility** card in the Crafting Admin panel and set `listMode` to `teaser`. This reveals a **Teaser Config** section:

| Field | Description |
|:------|:------------|
| `teaserConfig.enabled` | Master toggle for teaser mode. Must be `true` for teaser recipes to render as teasers rather than hidden. |
| `teaserConfig.discoveryMode` | `threshold`, `fragments`, or `both` (see table above). |
| `teaserConfig.fragments` | Array of fragment definitions (only used when `discoveryMode` is `fragments` or `both`). |

### Fragment Definitions

Each fragment definition has:

| Field | Description |
|:------|:------------|
| `id` | Stable fragment ID. |
| `name` | Optional GM-facing name. |
| `linkedItemUuid` | UUID of the world or compendium item whose acquisition triggers discovery. |
| `recipeIds` | Recipe IDs that receive progress when this fragment is found. |
| `progressValue` | How much discovery progress this fragment grants (default: `1`). |
| `description` | Optional label shown to the GM in the fragment editor. |

---

## Recipe Configuration

For each recipe, the GM configures a `teaser` block in the recipe editor's **Teaser** tab (visible when the system is in teaser mode):

| Field | Description |
|:------|:------------|
| `teaser.hiddenFields` | Array of field names hidden from players until the recipe is unlocked. Supported values: `"ingredients"`, `"results"`, `"description"`, `"tools"`, `"essences"` (any other value is dropped on load). |
| `teaser.revealThreshold` | Numeric progress value required for full discovery. When a player's progress reaches this value, all `hiddenFields` are shown and the recipe becomes craftable. |
| `teaser.teaserDescription` | Flavour text shown to players in place of the real description while the recipe is still locked. |

**Example:** A recipe with `hiddenFields: ["ingredients", "results"]` and `revealThreshold: 3` shows the recipe name and teaser description to players, but hides the ingredient list and result list until they accumulate 3 discovery progress points.

---

## Fragment Discovery (Automatic)

When `discoveryMode` is `fragments` or `both`, Fabricate hooks into Foundry's `createItem` event via `FragmentDiscoveryHook`. When an actor receives an item whose UUID (or `_stats.compendiumSource` / `flags.core.sourceId` for compendium copies) matches a fragment definition's `linkedItemUuid`, discovery progress is automatically incremented for that actor on every recipe that references that fragment.

Players do not need to take any additional action — simply receiving the item is enough to trigger discovery.

---

## GM: Managing Progress Manually

When `discoveryMode` is `threshold` or `both`, GMs can set discovery progress per actor per recipe using the **Teaser Progress Editor**:

1. Open the **Recipe Visibility** card in the Crafting Admin panel.
2. Select a recipe in teaser mode and click **Manage Progress**.
3. The Teaser Progress Editor shows a list of actors with their current discovery progress.
4. Edit the progress value and save.

Progress is stored in actor flags:

```
Actor.flags.fabricate.discoveryProgress = {
  "<recipeId>": <number>
}
```

---

## Planned Player Experience

The planned Crafting tab will show teaser recipes in a distinct visual style:

- **Recipe name** and **category** are always shown.
- **Teaser description** replaces the normal description (if set).
- **Hidden fields** (ingredients, results, etc.) are replaced with a placeholder.
- A **progress bar** overlay will show current progress versus `revealThreshold`.
- When progress reaches the threshold, the progress bar will be replaced by normal recipe content and the recipe becomes craftable.

---

## Configuring via the API

```javascript
// Enable teaser mode on a system with fragment-based discovery
Hooks.once('fabricate.ready', async () => {
  const mgr = game.fabricate.getCraftingSystemManager();
  await mgr.updateSystem('my-alchemy-system-id', {
    recipeVisibility: {
      listMode: 'teaser',
      teaserConfig: {
        enabled: true,
        discoveryMode: 'fragments',
        fragments: [
          {
            id: 'ancient-scroll-fragment',
            name: 'Ancient Alchemical Scroll',
            linkedItemUuid: 'Item.abc123',  // UUID of "Ancient Alchemical Scroll"
            recipeIds: ['philosophers-stone-recipe-id'],
            progressValue: 1,
            description: 'Ancient Alchemical Scroll'
          }
        ]
      }
    }
  });
});
```

```javascript
// Set manual discovery progress for a player actor
Hooks.once('fabricate.ready', async () => {
  const visibilityService = game.fabricate.getRecipeVisibilityService();
  const actor = game.user.character;
  // Grant 2 progress points toward "philosophers-stone-recipe-id"
  await visibilityService.setDiscoveryProgress(
    actor,
    'philosophers-stone-recipe-id',
    2
  );
});
```

---

## What's Next?

- [Visibility & Knowledge]({% link visibility.md %}) — the full visibility system including global, player, and knowledge modes.
- [Recipes]({% link recipes/index.md %}) — configure recipe fields controlled by teaser mode.
- [Crafting Systems]({% link crafting-systems.md %}) — all system-level settings and feature toggles.
