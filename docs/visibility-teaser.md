---
layout: default
title: Teaser Mode
nav_order: 8
parent: Visibility & Knowledge
---

# Teaser Mode

Teaser mode is an optional layer on top of the standard [visibility modes]({% link visibility.md %}).
When enabled on a crafting system, the visibility service can return undiscovered recipes as **teasers**.
Players may be allowed to know a recipe exists, while full ingredients, results, or details remain hidden.
As players gather fragments or reach discovery thresholds, hidden fields are progressively revealed until the recipe is fully unlocked.

Use teaser mode when you want discovery to be gradual.
Players can see that "Philosopher's Stone" exists and that they are 2 of 5 fragments away from learning it, but cannot yet see what it requires.

{: .note }
> Teaser mode requires setting the crafting system to teaser mode.
The existing global, player, and knowledge modes continue to work unchanged when teaser mode is off.

---

## How Teaser Mode Works

1. The GM sets the crafting system to teaser mode through the API (`CraftingSystemManager` / `saveVisibilityConfig`).
   The Recipe Visibility card on the System settings tab covers global, player, and knowledge modes; a teaser option in that card is planned.
2. For each recipe, the GM chooses which details to hide, how much discovery progress is needed to unlock the recipe fully, and an optional teaser description shown to players before unlock.
3. Players see the recipe with only the permitted details revealed.
4. When a player's discovery progress for a recipe reaches the required amount, the recipe becomes fully visible and craftable.

---

## Discovery Modes

You choose how players build up discovery progress for the system.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Discovery method | Description |
|:-----------------|:------------|
| Manual | The GM sets a progress value for each player and recipe. Progress changes when the GM edits it in the **Teaser Progress Editor**. |
| Fragments | Players gain discovery progress by acquiring specific in-world items called **fragments**. Each fragment grants a set amount of progress when the player adds it to their inventory. |
| Both | Manual progress and fragment progress add together. Both pathways contribute to the same total. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

---

## System Configuration

Set the system to teaser mode through the API (the Recipe Visibility card does not yet offer teaser as a mode).
Teaser mode reveals a **Teaser Config** section where you can:

- Turn teaser mode on, which must be on for teaser recipes to appear as teasers rather than being hidden.
- Choose the discovery method: manual, fragments, or both (see the table above).
- Define the fragments players can find, when you are using the fragments or both methods.

### Fragment Definitions

Each fragment you define has:

- An optional name shown to the GM.
- The in-world item that triggers discovery when a player acquires it.
- The recipes that gain progress when this fragment is found.
- How much discovery progress the fragment grants, which defaults to one.
- An optional label shown to the GM in the fragment editor.

---

## Recipe Configuration

For each recipe, the GM uses the recipe editor's **Teaser** tab, which appears when the system is in teaser mode, to set:

- Which details are hidden from players until the recipe is unlocked.
You can hide the ingredients, the results, the description, the tools, and the essences.
- How much discovery progress is required for full discovery.
When a player reaches this amount, every hidden detail is shown and the recipe becomes craftable.
- A teaser description shown to players in place of the real description while the recipe is still locked.

**Example:** A recipe that hides its ingredients and results and needs three points of progress shows the recipe name and teaser description to players, but hides the ingredient list and result list until they build up three discovery progress points.

---

## Fragment Discovery (Automatic)

When the discovery method is fragments or both, Fabricate watches for items being added to actors.
When an actor receives a fragment item, or a copy of one, discovery progress goes up automatically for that actor on every recipe that fragment feeds.

Players do not need to take any additional action.
Simply receiving the item is enough to trigger discovery.

---

## GM: Managing Progress Manually

When the discovery method is manual or both, GMs can set discovery progress for each player and recipe using the **Teaser Progress Editor**:

1. Open the **Recipe Visibility** card in the Crafting Admin panel.
2. Select a recipe in teaser mode and click **Manage Progress**.
3. The Teaser Progress Editor shows a list of actors with their current discovery progress.
4. Edit the progress value and save.

Each actor remembers its own discovery progress for each recipe.

---

## Planned Player Experience

A player-facing presentation of teaser recipes is planned and not yet available.
It will use teaser cards with progress bars that show how close a player is to the amount needed for full discovery, before switching to the full recipe content on unlock.

---

## Configuring via the API

Teaser mode can also be configured through the API: set a system to teaser mode along with its teaser settings (whether teaser mode is on, the discovery method, and the fragment definitions), and set each player's discovery progress through the visibility service.
See the [CraftingSystemManager API]({% link api/system-manager.md %}) and the [Recipe Visibility Service API]({% link api/visibility-service.md %}).

---

## See Also

- [Visibility & Knowledge]({% link visibility.md %}).
The full visibility system including global, player, and knowledge modes.
- [Recipes]({% link recipes/index.md %}).
Configure recipe fields controlled by teaser mode.
- [Crafting Systems]({% link crafting-systems.md %}).
All system-level settings and feature toggles.
