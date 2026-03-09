---
layout: default
title: Shopping List
nav_order: 9
---

# Shopping List

The shopping list is a planning tool built into the Crafting App. Add any number of recipes to your list, set how many times you want to craft each one, and Fabricate will show you a single consolidated table of every material you need — what you already have, what you still need, and how much is missing.

Use it when you are preparing a crafting session: collect the recipes you plan to run, then glance at the materials table to know exactly what to gather before you start.

---

## Opening the Shopping List

The shopping list panel sits at the bottom of the Crafting App. It is collapsed by default.

1. Open the **Crafting App** (Items sidebar → **Crafting**).
2. Find a recipe card and click the **cart** icon (shopping cart button) to add it to your list.
3. Click the **Shopping List** header to expand the panel.

---

## Adding and Removing Recipes

| Action | How |
|:-------|:----|
| Add a recipe | Click the cart icon on any recipe card |
| Remove a recipe | Click the **×** button on the recipe entry in the shopping list |
| Clear everything | Click the **trash** icon in the shopping list header |

Adding the same recipe a second time increases its quantity by 1 rather than creating a duplicate entry.

---

## Adjusting Quantities

Each recipe entry shows **−** and **+** buttons to change how many crafts you are planning. Setting a quantity to 0 removes the recipe from the list.

The materials table always reflects the total need across all recipes and quantities. If you plan to craft Healing Salve × 3 and Antitoxin × 2, the table shows the combined material requirement for five crafts.

---

## The Materials Table

When the panel is expanded and your list has at least one entry, the materials table appears below the recipe list.

| Column | Meaning |
|:-------|:--------|
| **Material** | Component name (or description for tag-matched ingredients) |
| **Need** | Total quantity required across all planned crafts |
| **Have** | Quantity currently owned by the selected ingredient-source actors |
| **Missing** | Need minus Have (zero means you are ready) |

Rows are colour-coded:

- **Green / check mark** — you have enough of this material.
- **Red / number** — you are still missing that many units.

### Essences

If any planned recipe requires essences, an **Essences** section appears below the ingredients table. Each essence type shows your current stock versus the total needed, in the same green/red colour scheme.

### Required Tools (Catalysts)

If any planned recipe requires catalysts, a **Required Tools** section appears. Each catalyst shows whether it is currently available in your actor's inventory.

### Summary footer

A summary line at the bottom tells you at a glance whether all materials are ready:

- **All materials available** — you can start all planned crafts right now.
- **N material(s) still needed** — the count of ingredient types, essence types, or catalysts you are short on.

---

## How Quantities are Calculated

Fabricate calls `evaluateCraftability()` for each recipe against your selected component-source actors, then multiplies the per-recipe ingredient needs by the quantity you have entered.

When the same component appears in multiple recipes, the requirements are summed under a single row. The deduplication key follows this priority:

1. `componentId` — managed component identity (most specific)
2. Item UUID
3. Ingredient description (tag-based fallback)

The **Have** column always reflects the latest inventory snapshot for the selected actors; it is not multiplied by quantity because your inventory is a shared pool.

---

## Session Scope

The shopping list is stored in the Crafting App's local state. It is cleared when you close the app. It is not persisted to actor flags or world settings.

---

## What's Next?

- [Recipes]({% link recipes/index.md %}) — how to browse and add recipes to your list.
- [Visibility & Knowledge]({% link visibility.md %}) — control which recipes are visible to which players.
- [Catalysts]({% link catalysts.md %}) — configure the required tools that appear in the catalysts section.
