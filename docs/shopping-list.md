---
layout: default
title: Shopping List
nav_order: 9
---

# Shopping List

The shopping list is a planned player-facing planning tool for the Crafting tab. The intended workflow is to add recipes, set how many times you want to craft each one, and see a single consolidated table of every material you need — what you already have, what you still need, and how much is missing.

The UI is not currently available. Fabricate does include a tested internal aggregation utility, `aggregateShoppingList(entries, recipeManager, componentSourceActors)`, which integrations can study or reuse at their own risk, but it is not yet exposed as a stable public API contract.

---

## Current Status

Current support:

- recipes can be authored in the GM manager
- recipe craftability can be evaluated through the recipe manager
- crafts can be executed through `fabricate.craft(actor, recipeId, options)`
- shopping-list material aggregation exists as internal UI utility code

Planned UI support:

- add and remove recipes from recipe cards
- adjust planned craft quantities
- show consolidated ingredients, essences, and catalysts
- highlight ready and missing materials
- clear the list when the Crafting window closes

---

## Planned Recipe Entries

Each planned recipe entry will store:

| Field | Meaning |
|:------|:--------|
| `recipeId` | The recipe being planned |
| `quantity` | How many times the player wants to craft it |

Adding the same recipe again will increase its quantity rather than creating a duplicate entry. Setting a quantity to 0 will remove the recipe from the list.

---

## Planned Materials Table

When the panel is expanded and the list has at least one entry, the planned materials table will show:

| Column | Meaning |
|:-------|:--------|
| **Material** | Component name (or description for tag-matched ingredients) |
| **Need** | Total quantity required across all planned crafts |
| **Have** | Quantity currently owned by the selected ingredient-source actors |
| **Missing** | Need minus Have (zero means you are ready) |

Rows will be colour-coded:

- **Green / check mark** — you have enough of this material.
- **Red / number** — you are still missing that many units.

### Essences

If any planned recipe requires essences, an **Essences** section will appear below the ingredients table. Each essence type will show current stock versus the total needed.

### Required Tools (Catalysts)

If any planned recipe requires catalysts, a **Required Tools** section will appear. Each catalyst will show whether it is currently available in the selected actor's inventory.

### Summary footer

A summary line at the bottom will show whether all materials are ready:

- **All materials available** — you can start all planned crafts right now.
- **N material(s) still needed** — the count of ingredient types, essence types, or catalysts you are short on.

---

## How Quantities are Calculated

The planned UI will call `evaluateCraftability()` for each recipe against the selected component-source actors, then multiply the per-recipe ingredient needs by the entered quantity.

When the same component appears in multiple recipes, the requirements are summed under a single row. The deduplication key follows this priority:

1. `componentId` — managed component identity (most specific)
2. Item UUID
3. Ingredient description (tag-based fallback)

The **Have** column will reflect the latest inventory snapshot for the selected actors; it is not multiplied by quantity because inventory is a shared pool.

---

## Session Scope

The planned shopping list will be stored in the Crafting tab's local state. It will be cleared when the app closes and will not be persisted to actor flags or world settings.

---

## What's Next?

- [Recipes]({% link recipes/index.md %}) — current recipe authoring and API crafting.
- [Visibility & Knowledge]({% link visibility.md %}) — control which recipes are visible to which players.
- [Catalysts]({% link catalysts.md %}) — configure the required tools that appear in the catalysts section.
