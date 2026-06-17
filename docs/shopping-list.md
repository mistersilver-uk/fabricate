---
layout: default
title: Shopping List
nav_order: 9
---

# Shopping List

The shopping list is a planned player-facing planning tool for the Crafting tab.
The intended workflow is to add recipes, set how many times you want to craft each one, and see a single consolidated table of every material you need.
That table shows what you already have, what you still need, and how much is missing.

The UI is not currently available.
Fabricate does include a tested internal aggregation utility, `aggregateShoppingList(entries, recipeManager, componentSourceActors)`, which integrations can study or reuse at their own risk, but it is not yet exposed as a stable public API contract.

---

## Current Status

Current support:

- recipes can be authored through the API only
- recipe craftability can be evaluated through the recipe API only
- crafting runs can be executed through `fabricate.craft(actor, recipeId, options)`
- shopping-list material aggregation exists in the API, but is not yet presented to players

Planned UI support:

- add and remove recipes from recipe cards
- adjust planned craft quantities
- show consolidated ingredients, essences, and catalysts
- highlight ready and missing materials
- clear the list when the Crafting window closes

## See Also

- [Recipes]({% link recipes/index.md %}) covers current recipe authoring and API crafting.
- [Visibility & Knowledge]({% link visibility.md %}) lets you control which recipes are visible to which players.
- [Tools]({% link tools.md %}) lets you configure the reusable, breakable tools that appear in the Required Tools section.
