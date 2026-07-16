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

## What Players See

When a player opens a progressive recipe, Fabricate lists that recipe's result stages in the order they will be produced.
Each stage shows its component, its quantity, and its difficulty.

Where it can be worked out, a stage also shows a **Reached at** value.
That is the lowest check value that reaches the stage, taking the earlier stages and the system's award mode into account.
It is not a plain running total of the difficulties above it, because each award mode spends the check value differently.
A stage whose component has no valid difficulty is never produced, so it shows no **Reached at** value rather than a misleading one.

## Player Result Re-ordering

Each recipe carries an **Allow player result re-ordering** setting, which you author on the recipe's **Results** tab.
It is on by default.

When it is on, a player can put that recipe's result stages into the order they prefer.
They can drag a stage, or move it with the keyboard using the move up and move down controls on each stage.
Each move is announced for screen readers, and the **Reached at** values update to match the new order.

A player's chosen order is a standing preference, not a one-off choice for the next craft.
Fabricate remembers it and uses it every time that player crafts that recipe, until they change it again.
The order is remembered per player and per recipe, in this world only.
Other players are unaffected, and the same player in another world starts from your authored order.

When you turn the setting off, the stage list is shown in your authored order, marked **Order set by the GM**, and players cannot rearrange it.
Turning it off does not erase any order a player already chose.
Their order is simply ignored while the setting is off.

{: .note }
> Adding a new result stage to a recipe never displaces a stage a player has already ranked.
> The new stage goes to the end of that player's order, so it is produced only if check value is left over.

## Re-ordering and Salvage

Components configured for progressive salvage carry the same **Allow player result re-ordering** setting, on the component's salvage setup, and it is on by default.
There is no player-facing salvage screen today, so players have no way to choose a salvage order in the interface.
The setting is in place for when that screen ships.
A salvage run fixes the order it will use at the moment it starts, so a run that finishes later, over world time, still awards the order it began with.

## Creating a Progressive Recipe

A progressive recipe has one ingredient set and one result group whose results are listed in difficulty order.
For example, this means Iron Filings, then Steel Ingot, then Fine Steel Ingot, then Masterwork Ingot.
See the [API reference]({% link api/recipe-manager.md %}) for the methods that create and configure recipes.

{: .note }
> Each result must point to a managed component with a difficulty of at least 1.

## Setting Component Difficulty

A result's difficulty is a property of the managed component it points to, not of the recipe, so you set it on the component itself.
When the system's recipe resolution mode is Progressive, you can set it from the GM admin panel without the API.
Open the **Items** tab, open a component for edit, and use the **Progressive difficulty** card in the right-hand inspector.
Enter a whole number of 1 or greater, or leave it blank to clear the value.
The difficulty is staged with the rest of your edits and is written when you save the component.

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
