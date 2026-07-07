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

Set the crafting system's **List Mode** to **Knowledge**.
Players will only see recipes they have learned or whose recipe item they possess.

## Steps

1. Open the Crafting Admin panel, select your system, and go to the **Recipe Visibility** card.
2. Change the **List Mode** to **Knowledge**.
3. Choose a **Knowledge Source**.
   The options are **Item** (must own a linked item), **Learned** (must explicitly learn), or **Item or Learned** (either).
4. For each recipe, open the recipe editor and drag an item onto the **Recipe item** card to link a scroll or manual to it.
5. Optionally turn on **Consume on Learn** if you want recipe scrolls to be one-time-use.
6. Optionally cap how many recipes a book teaches by turning on **Limited recipes learned per item**, then set **Maximum recipes** and, if you like, **Delete when spent**.
7. Players can now discover recipes by finding recipe items in the world.
   Dropping an uncapped recipe item on a character auto-learns its recipes, and any owned recipe item can be learned from the **Inventory** tab of the Fabricate window (the only way to learn from a capped book).

## Learn more

- [Visibility & Knowledge]({% link visibility.md %})
- [Visibility & Knowledge: Knowledge Modes]({% link visibility.md %}#knowledge-modes)
- [Recipes: linking a recipe item]({% link recipes/index.md %}#recipe-structure)
