---
layout: default
title: Simple Mode
parent: Recipes
nav_order: 1
---

# Simple Mode

The simplest resolution mode. One ingredient set, one result group, optional pass/fail check.

---

## Rules

- Exactly **one** ingredient set
- Exactly **one** result group
- Crafting check is optional (pass/fail only)

## Example: Healing Potion

A basic alchemy recipe:

| Ingredients | Result |
|:------------|:-------|
| 2x Moonpetal Herb | 1x Healing Potion |
| 1x Empty Vial | |

### Creating the recipe

This recipe has one ingredient set with two groups, a "Herbs" group (2x Moonpetal Herb) and a "Container" group (1x Empty Vial), and one result group producing 1x Healing Potion.
Recipes can be authored through the API only.
See the [API reference]({% link api/recipe-manager.md %}) for the methods that create and configure recipes.

## With an Optional Check

If crafting checks are enabled on the system, simple mode uses pass/fail:

- **Pass**: ingredients are consumed and results are created
- **Fail**: behaviour depends on your consumption-on-failure settings

The crafting check decides whether the attempt passes or fails.
See [Crafting Checks]({% link crafting-checks.md %}) for how checks work.

---

## See Also

- [Routed Mode]({% link recipes/routed.md %}): produce different results from one recipe, chosen by ingredients or a skill check.
- [Crafting Checks]({% link crafting-checks.md %}): how crafting checks are configured.
