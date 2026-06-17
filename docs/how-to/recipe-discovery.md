---
layout: default
title: Recipe Discovery
parent: How-To Guides
nav_order: 2
---

# Recipe Discovery

## Problem

How do I make players discover recipes during play instead of seeing everything from the start?

## Short answer

Set the crafting system's **list mode** to `"knowledge"`.
Players will only see recipes they have learned or whose recipe item they possess.

## Steps

1. Open the Crafting Admin panel, select your system, and go to the **Recipe Visibility** card.
2. Change the **List Mode** to `Knowledge`.
3. Choose a **Knowledge Source**.
   The options are `item` (must own a linked item), `learned` (must explicitly learn), or `itemOrLearned` (either).
4. For each recipe, open the recipe editor and set a **Linked Recipe Item**.
   Either browse for an existing item or click **Create Recipe Item** to generate a new scroll/manual.
5. Optionally set **Consume on Learn** to `true` if you want recipe scrolls to be one-time-use.
6. Players can now discover recipes by finding recipe items in the world or learning them via drag-and-drop onto their character sheet.

## Learn more

- [Visibility & Knowledge]({% link visibility.md %})
- [Visibility & Knowledge: Knowledge Modes]({% link visibility.md %}#knowledge-modes)
- [Recipes: linkedRecipeItemUuid]({% link recipes/index.md %}#recipe-structure)
