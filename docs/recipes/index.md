---
layout: default
title: Recipes
nav_order: 4
has_children: true
---

# Recipes

A recipe defines what ingredients are needed and what results are produced.
Recipes belong to a crafting system and follow that system's resolution mode.
They can currently only be authored through the API.

---

## What a Recipe Contains

Every recipe brings together a few things.

- A name and a piece of flavour text that describe it.
- An optional category that helps you organise recipes, when your crafting system groups recipes by category.
- The ingredients it needs, made up of one or more sets of required materials.
- The results it produces, made up of one or more groups of items.
- Any tools it requires, such as a forge or a cauldron, which are needed but not consumed.
- Whether active effects carried by the ingredients are copied onto the results.
- Whether the recipe is enabled, which controls if it can be crafted.
- Whether the recipe is locked, which lets players see it exists but stops anyone other than the GM from crafting it.
- Who can see it, which is set by the crafting system's visibility settings.
- For a recipe that teaches itself through an in-world item, the item that unlocks it for knowledge-based visibility.
- For a routed recipe, how the result is chosen when more than one outcome is possible.

{: .note }
> For multi-step recipes, the ingredients and results are defined on each individual step rather than on the recipe as a whole.
See [Multi-Step Recipes]({% link recipes/multi-step.md %}) for details.

## Enabling and Disabling Recipes

Whether a recipe is enabled controls whether it can be crafted.
A disabled recipe is hidden from players, but it remains available through the API.

**Why disable rather than delete?** Disabling is non-destructive.
You can hide a recipe from players while you are still configuring it, or temporarily remove it from circulation without losing its ingredient and result configuration.

**Programmatically.** You can switch a recipe between enabled and disabled through the API.
See the [Recipe Manager API reference]({% link api/recipe-manager.md %}) for the method that updates a recipe.

## Ingredient Semantics

Ingredients are organised in a three-level hierarchy:

- **Ingredient Sets** (OR, any one set satisfies the recipe)
  - **Ingredient Groups** (AND, all groups in the set must be satisfied)
    - **Options** (OR, any one option satisfies the group)

**Example:** A sword recipe might accept either iron or steel:

- **Ingredient Set "Metal Sword"**
  - **Group "Metal"** (need any one of):
    - Option: 3x Iron Ingot
    - Option: 2x Steel Ingot
  - **Group "Handle"** (need any one of):
    - Option: 1x Oak Wood
    - Option: 1x Leather Wrap

The recipe is craftable if the player has materials to satisfy all groups in at least one set.

### Ingredient Matching

Each ingredient option decides how it is matched against the items a player is carrying.

- Match a specific component managed by the crafting system.
- Match any item that carries a given set of tags.

## Resolution Modes

The resolution mode determines how ingredients map to results:

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Mode                                             | Sets | Result Groups | Check Required     | Use When                                                      |
|:-------------------------------------------------|:-----|:--------------|:-------------------|:--------------------------------------------------------------|
| [Simple]({% link recipes/simple.md %})           | 1    | 1             | Optional           | Basic A + B = C crafting                                      |
| [Routed]({% link recipes/routed.md %})           | 1+   | 1+            | Provider-dependent | Ingredient choice or skill check selects the result           |
| [Progressive]({% link recipes/progressive.md %}) | 1    | 1 (ordered)   | **Yes**            | Skill check value "buys" results in order                     |
| [Alchemy]({% link recipes/alchemy.md %})         | 1+   | 1+            | Optional           | Players experiment with ingredients. Recipe names are hidden  |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

## Multi-Step Recipes

When multi-step recipes are enabled, recipes can have several sequential steps.
Each step has its own ingredients, results, required tools, and optional time and currency requirements.
Conceptually, each step is a separate recipe that is part of a larger recipe.
You could achieve the same outcome using multiple recipes.

See [Multi-Step Recipes]({% link recipes/multi-step.md %}) for details.

## Tools

Tools are items required for crafting but not consumed, such as a blacksmith's forge, an alchemist's cauldron, or a wizard's staff.
A recipe can require tools for the whole recipe, for a single step, or for a particular ingredient set.

See [Tools]({% link tools.md %}) for configuration, requirement gates, breakage modes, and usage tracking. (Tools replaced the retired Catalyst concept in version 0.6.0.)

## Current Crafting Surface

Recipes are authored mainly through the API today.
An early GM recipe editor is also available in the Crafting Admin panel.
It can edit a recipe's identity (name, description, image, and whether it is on or off) and link a recipe item to it.
Full recipe authoring through the editor, including ingredients, steps, results, and visibility controls, is still in progress.
Runtime crafting is available through the public API.
See the [Crafting Engine API reference]({% link api/crafting-engine.md %}) and the [Recipe Manager API reference]({% link api/recipe-manager.md %}) for the methods that create recipes, check craftability, and run a craft.

{: .note }
> A player-facing Crafting tab is planned and not yet available.
Recipe crafting works through the API today.
