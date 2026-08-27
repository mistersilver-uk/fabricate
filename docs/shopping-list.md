---
layout: default
title: Shopping List
nav_order: 9
---

# Shopping List

The shopping list is a planning tool in the **Crafting** tab.
Add recipes, set how many times you want to craft each one, and see a single consolidated list of every material you still need.
The list shows what you already have, what you still need, and how much is missing.

It sits in the right-hand column of the Crafting tab and is the default view there when you are not looking at a finished run.

---

## Using the shopping list

- Add a recipe to the list from its card with **Add to shopping list**.
- Left-click a queued recipe row to add another craft of it, and right-click to remove one.
- Use the **×** on a row to drop that recipe from the list.
- Clear the whole list with **Clear shopping list**.

The list shows three summary cards at the top, for the recipes you have queued, the components you are still missing, and the tools you cannot yet use.
Below them it lists the components and essences you still need to acquire, and the tools you need to acquire or repair.
Components you already own in full drop off the list, so only shortfalls remain.

{% include screenshot.html case="player-crafting-essence-shopping" caption="A queued recipe and the two shortfalls it left behind, an ingot and an essence amount." %}

A recipe you can already make adds nothing to the list.
Its requirements instead resolve to a plain account of what the craft is about to consume, and the list stays on its empty state.

{% include screenshot.html case="fabricate-app-shell" caption="A recipe with everything to hand, so the shopping list on the right has nothing to ask for." %}

The shopping list is scratch planning.
It clears when you close the Crafting window.

## See Also

- [Recipes]({% link recipes/index.md %}) covers current recipe authoring and API crafting.
- [Visibility & Knowledge]({% link visibility.md %}) lets you control which recipes are visible to which players.
- [Tools]({% link tools.md %}) lets you configure the reusable, breakable tools that appear in the Required Tools section.
