---
layout: default
title: Skill-Check Recipes
parent: How-To Guides
nav_order: 1
---

# Skill-Check Recipes

## Problem

How do I add a skill check to a recipe so the outcome depends on a player's roll?

## Short answer

Switch the crafting system to **routed** resolution mode and select the `macroOutcome` provider (for named outcomes) or **progressive** mode (for numeric check values). Write a Foundry macro that performs the roll and returns the result in the expected shape, then assign that macro's UUID to the system's crafting check configuration.

## Steps

1. Open the Crafting Admin panel, select your system, and change the **Resolution Mode** to **Routed**.
2. In the recipe editor, set `resultSelection.provider` to `macroOutcome`. For progressive mode, switch the system mode to **Progressive** instead.
3. Create a new Script macro in Foundry. For routed macroOutcome, return `{ success: boolean, outcome: string }` where `outcome` matches a result group name (case-insensitive); for progressive mode, return `{ success: boolean, value: number }`.
4. In the system's **Crafting Check** settings, paste the macro's UUID into the **Check Macro** field and enable checks.
5. (Optional) Assign success and failure macro UUIDs for post-check side effects.
6. Configure `consumeIngredientsOnFail` and `consumeCatalystsOnFail` under Consumption on Failure.

## Learn more

- [Crafting Checks]({% link crafting-checks.md %})
- [Routed Mode (Macro Outcome)]({% link recipes/tiered.md %})
- [Progressive Mode]({% link recipes/progressive.md %})
- [Macros -- Crafting Check contract]({% link macros/index.md %}#crafting-check-macro)
