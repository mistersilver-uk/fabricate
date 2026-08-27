---
layout: default
title: Player App
nav_order: 14
has_children: true
---

# Player App

Everything in this section describes the window your **players** use, rather than the GM's Crafting System Manager.

Players conduct the whole loop in a single Fabricate window, opened from the **Crafting** action in the Items Directory.
The window carries one tab per activity, and a tab is only offered when at least one crafting system the player can see enables it.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Tab | What players do there | Reference |
|:----|:----------------------|:----------|
| **Crafting** | Browse recipes, pick an actor and component sources, roll the crafting check, and craft. | [Recipes]({% link crafting/recipes/index.md %}), [Checks]({% link checks/index.md %}) |
| **Alchemy** | Submit a combination of items and let Fabricate match it against known recipe signatures. | [Alchemy Mode]({% link crafting/recipes/alchemy.md %}) |
| **Gathering** | Choose an environment and a task, spend stamina, and roll for drops. | [Gathering]({% link gathering/index.md %}) |
| **Inventory** | Inspect owned items, learn recipes from books and scrolls, and salvage components. | [Salvage]({% link components/salvage.md %}), [Knowledge]({% link crafting/knowledge.md %}) |
| **Journal** | Monitor crafting, gathering, and salvage runs, and continue multi-step crafting runs. | [Journal]({% link player-app/journal.md %}) |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

A **Shopping List** sits alongside the Crafting tab, so a player can queue several recipes and see one consolidated list of what they still need.
See [Shopping List]({% link player-app/shopping-list.md %}).

Which recipes a player sees in the Crafting tab is decided by the system's visibility mode.
See [Settings]({% link crafting/settings.md %}) for the modes, and [Access]({% link crafting/access.md %}) for per-recipe grants.
