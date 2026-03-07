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

Switch the crafting system to **tiered** or **progressive** resolution mode, write a Foundry macro that performs the roll and returns the result in the expected shape, then assign that macro's UUID to the system's crafting check configuration.

## Steps

1. Open the Crafting Admin panel, select your system, and change the **Resolution Mode** to Tiered or Progressive.
2. Create a new Script macro in Foundry. For tiered mode, return `{ success: boolean, outcome: string }`; for progressive mode, return `{ success: boolean, value: number }`.
3. In the system's **Crafting Check** settings, paste the macro's UUID into the **Check Macro** field and enable checks.
4. (Optional) Assign success and failure macro UUIDs for post-check side effects.
5. Configure `consumeIngredientsOnFail` and `consumeCatalystsOnFail` under Consumption on Failure.

## Learn more

- [Crafting Checks]({% link crafting-checks.md %})
- [Tiered Mode]({% link recipes/tiered.md %})
- [Progressive Mode]({% link recipes/progressive.md %})
- [Macros -- Crafting Check contract]({% link macros/index.md %}#crafting-check-macro)
