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

## Recipe Structure

Every recipe has:

| Field                  | Description                                                                                                                                                   |
|:-----------------------|:--------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `name`                 | Display name                                                                                                                                                  |
| `description`          | Flavour text                                                                                                                                                  |
| `category`             | Organisational category (if `recipeCategories` is enabled)                                                                                                    |
| `enabled`              | Whether the recipe can be crafted                                                                                                                             |
| `locked`               | Prevents non-GM users from crafting                                                                                                                           |
| `craftingSystemId`     | The system this recipe belongs to                                                                                                                             |
| `ingredientSets`       | One or more sets of required ingredients (single-step recipes only, multi-step recipes define these per step)                                                 |
| `resultGroups`         | One or more groups of produced items (single-step recipes only, multi-step recipes define these per step)                                                     |
| `toolIds`              | Library Tool ids required for crafting. For multi-step recipes, recipe-level tools apply to every step (step and ingredient-set `toolIds` also apply)         |
| `transferEffects`      | Whether to copy active effects from ingredients to results                                                                                                    |
| `visibility`           | Access control (restricted, allowedUserIds)                                                                                                                   |
| `linkedRecipeItemUuid` | Item that teaches this recipe (for knowledge mode)                                                                                                            |
| `resultSelection`      | How a result group is chosen in routed mode. Contains `provider` (`"ingredientSet"`, `"macroOutcome"`, or `"rollTableOutcome"`) and provider-specific fields. |

{: .note }
> For multi-step recipes (when `multiStepRecipes` is enabled and the recipe has a `steps` array), `ingredientSets` and `resultGroups` are defined on each individual step, not on the recipe itself. Recipe-level `ingredientSets` and `resultGroups` are not required and may be empty. See [Multi-Step Recipes]({% link recipes/multi-step.md %}) for details.

## Enabling and Disabling Recipes

The `enabled` field controls whether a recipe can be crafted.
A disabled recipe is hidden from player-facing visibility checks, but it remains accessible to API consumers.

**Why disable rather than delete?** Disabling is non-destructive.
You can hide a recipe from players while you are still configuring it, or temporarily remove it from circulation without losing its ingredient and result configuration.

**Programmatically.** You can toggle the enabled state via the API.
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

Each ingredient option specifies how to match against the player's inventory:

| Match Type  | Description                                                                 |
|:------------|:----------------------------------------------------------------------------|
| `component` | Match by `componentId`, the managed component's ID in the crafting system   |
| `tags`      | Match by tags on the item                                                   |

## Resolution Modes

The resolution mode determines how ingredients map to results:

| Mode                                             | Sets | Result Groups | Check Required     | Use When                                                      |
|:-------------------------------------------------|:-----|:--------------|:-------------------|:--------------------------------------------------------------|
| [Simple]({% link recipes/simple.md %})           | 1    | 1             | Optional           | Basic A + B = C crafting                                      |
| [Routed]({% link recipes/routed.md %})           | 1+   | 1+            | Provider-dependent | Ingredient choice or skill check selects the result           |
| [Progressive]({% link recipes/progressive.md %}) | 1    | 1 (ordered)   | **Yes**            | Skill check value "buys" results in order                     |
| [Alchemy]({% link recipes/alchemy.md %})         | 1+   | 1+            | Optional           | Players experiment with ingredients. Recipe names are hidden  |

### Routed Mode Providers

In routed mode, the `resultSelection.provider` field on a recipe controls how the result group is chosen:

| Provider           | Check Required | How it works                                                                                         |
|:-------------------|:---------------|:-----------------------------------------------------------------------------------------------------|
| `ingredientSet`    | No             | The player's chosen ingredient set determines the result via `IngredientSet.resultGroupId`           |
| `macroOutcome`     | **Yes**        | A crafting check macro returns a named `outcome` and the engine matches it to a result group by name |
| `rollTableOutcome` | No             | The engine draws from a roll table. the drawn result name is matched to a result group               |

## Multi-Step Recipes

When the `multiStepRecipes` feature is enabled, recipes can have multiple sequential steps.
Each step has its own ingredient sets, result groups, tool references (`toolIds`), and optional time/currency requirements.
Conceptually, each step is a separate recipe that is part of a larger recipe.
You could achieve the same outcome using multiple recipes.

See [Multi-Step Recipes]({% link recipes/multi-step.md %}) for details.

## Tools

Tools are items required for crafting but not consumed, such as a blacksmith's forge, an alchemist's cauldron, or a wizard's staff.
A recipe requires Tools by referencing library Tool ids via `toolIds` at recipe, step, or ingredient-set granularity.

See [Tools]({% link tools.md %}) for configuration, requirement gates, breakage modes, and usage tracking. (Tools replaced the retired Catalyst concept in `0.6.0`.)

## Current Crafting Surface

Recipes can be authored through the API only today.
There is no GM recipe-editor UI.
Runtime crafting is likewise available through the public API.
See the [Crafting Engine API reference]({% link api/crafting-engine.md %}) and the [Recipe Manager API reference]({% link api/recipe-manager.md %}) for the methods that create recipes, check craftability, and run a craft.

{: .note }
> A player-facing Crafting tab is planned and not yet available. Recipe crafting works through the API today.
