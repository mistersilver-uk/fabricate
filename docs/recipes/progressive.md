---
layout: default
title: Progressive Mode
parent: Recipes
nav_order: 4
---

# Progressive Mode

A crafting check returns a numeric **value** that is spent to "buy" results in order of their difficulty.

---

## Rules

- Exactly **one** ingredient set
- Exactly **one** result group with **ordered** results
- Crafting check is **required**
- The check macro must return `{ success: true, value: <number> }` or `{ success: false }`
- Each result references a managed component with a `difficulty >= 1`
- Results are evaluated in order; the check value is spent against each result's difficulty

## Award Modes

The system's `progressive.awardMode` setting controls how the check value is spent:

| Mode | Rule | Partial Credit |
|:-----|:-----|:---------------|
| `equal` | Award when `remaining >= difficulty` | No |
| `exceed` | Award when `remaining > difficulty` (strict) | No |
| `partial` | Award when `remaining >= difficulty`; last result gets partial credit if `remaining > 0` | Yes |

### Example with `equal` mode

Check value: **15**. Results in order:

| Result | Difficulty | Remaining Before | Awarded? | Remaining After |
|:-------|:-----------|:-----------------|:---------|:----------------|
| Iron Filings | 3 | 15 | Yes | 12 |
| Steel Ingot | 5 | 12 | Yes | 7 |
| Fine Steel Ingot | 5 | 7 | Yes | 2 |
| Masterwork Ingot | 8 | 2 | No (2 < 8) | 2 |

The player receives Iron Filings, Steel Ingot, and Fine Steel Ingot.

## The Check Macro

A progressive check macro rolls a skill check and returns a numeric `value` (the total of the roll) on success, or a failure result. That value is spent against the ordered results. See [Crafting Checks]({% link crafting-checks.md %}) for the macro context and return contract.

## Player Reorder

When `progressive.allowPlayerReorder` is `true` on the crafting system, players can reorder the results before the check. This lets them prioritise which items they want to attempt first.

Reorder preferences are persisted per-recipe in client settings.

## Creating a Progressive Recipe

A progressive recipe has one ingredient set and one result group whose `results` are listed in difficulty order — for example Iron Filings, then Steel Ingot, then Fine Steel Ingot, then Masterwork Ingot. Recipes can be authored through the API only. See the [API reference]({% link api/recipe-manager.md %}) for the methods that create and configure recipes.

{: .note }
> Each result's `componentId` must reference a managed component with a `difficulty` value of at least `1`.

## When to Use Progressive Mode

Progressive mode is ideal when:
- Higher skill checks should yield more or better results
- You want a "spend your roll" mechanic
- Crafting should feel like a graduated outcome, not just pass/fail

---

## What's next?

- [Multi-Step Recipes]({% link recipes/multi-step.md %}) -- combine multiple steps into a single recipe workflow.
- [Crafting Checks]({% link crafting-checks.md %}) -- crafting check macro contracts.
- [Recipes overview]({% link recipes/index.md %}) -- compare all resolution modes side by side.
