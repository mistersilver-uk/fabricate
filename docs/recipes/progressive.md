---
layout: default
title: Progressive Mode
parent: Recipes
nav_order: 3
---

# Progressive Mode

A crafting check returns a numeric **value** that is spent to "buy" results in order of their difficulty.

---

## Rules

- Exactly **one** ingredient set
- Exactly **one** result group with **ordered** results
- A crafting check is **required**
- The check reports either a success with a numeric value or a failure
- Each result points to a managed component with a difficulty of at least 1
- Results are taken in order, and the check value is spent against each result's difficulty

## Award Modes

The system's award mode setting controls how the check value is spent:

| Mode | Rule | Partial Credit |
|:-----|:-----|:---------------|
| Equal | Award when the value left is at least the difficulty | No |
| Exceed | Award only when the value left is greater than the difficulty | No |
| Partial | Award when the value left is at least the difficulty, and the last result gets partial credit if any value is left over | Yes |

### Example with Equal mode

Check value: **15**.
Results in order:

| Result | Difficulty | Remaining Before | Awarded? | Remaining After |
|:-------|:-----------|:-----------------|:---------|:----------------|
| Iron Filings | 3 | 15 | Yes | 12 |
| Steel Ingot | 5 | 12 | Yes | 7 |
| Fine Steel Ingot | 5 | 7 | Yes | 2 |
| Masterwork Ingot | 8 | 2 | No (2 < 8) | 2 |

The player receives Iron Filings, Steel Ingot, and Fine Steel Ingot.

## The Check

A progressive check rolls a skill check and reports a numeric value (the total of the roll) on success, or a failure.
That value is spent against the ordered results.
See [Crafting Checks]({% link crafting-checks.md %}) for how checks work and what they report.

## Player Reorder

When the crafting system allows it, players can reorder the results before the check.
This lets them prioritise which items they want to attempt first.

Each player's chosen order is remembered per recipe on their own device.

## Creating a Progressive Recipe

A progressive recipe has one ingredient set and one result group whose results are listed in difficulty order.
For example, this means Iron Filings, then Steel Ingot, then Fine Steel Ingot, then Masterwork Ingot.
Recipes can be authored through the API only.
See the [API reference]({% link api/recipe-manager.md %}) for the methods that create and configure recipes.

{: .note }
> Each result must point to a managed component with a difficulty of at least 1.

## Setting Component Difficulty

A result's difficulty is a property of the managed component it points to, not of the recipe, so you set it on the component itself.
When the system's recipe resolution mode is Progressive, you can set it from the GM admin panel without the API.
Open the **Items** tab, open a component for edit, and use the **Progressive difficulty** card in the right-hand inspector.
Enter a whole number of 1 or greater, or leave it blank to clear the value.
The change is saved straight away.

A component with no difficulty is excluded from progressive results, so every result component needs a difficulty of at least 1.

## When to Use Progressive Mode

Progressive mode is ideal when:

- Higher skill checks should yield more and better results
- You want a "spend your roll" mechanic
- Crafting should feel like a graduated outcome, not just pass/fail

---

## See Also

- [Multi-Step Recipes]({% link recipes/multi-step.md %}): combine multiple steps into a single recipe workflow.
- [Crafting Checks]({% link crafting-checks.md %}): configure the progressive check roll formula.
- [Recipes overview]({% link recipes/index.md %}): compare all resolution modes side by side.
