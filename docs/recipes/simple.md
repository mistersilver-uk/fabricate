---
layout: default
title: Simple Mode
parent: Recipes
nav_order: 1
---

# Simple Mode

The simplest resolution mode.
One ingredient set, one result group, optional pass/fail check.

---

## Rules

- Exactly **one** ingredient set
- **One** result group, and a second **On a failed check** group when the system lets a failed check produce something
- Crafting check is optional (pass/fail only)

{% include screenshot.html case="player-crafting-simple" caption="A simple recipe ready to craft in the Crafting tab." %}

## Example: Healing Potion

A basic alchemy recipe:

| Ingredients | Result |
|:------------|:-------|
| 2x Moonpetal Herb | 1x Healing Potion |
| 1x Empty Vial | |

### Creating the recipe

This recipe has one ingredient set with two groups, a "Herbs" group (2x Moonpetal Herb) and a "Container" group (1x Empty Vial), and one result group producing 1x Healing Potion.
You author it on the Ingredients and Results tabs of the recipe editor in the Crafting Admin panel.
The public API can create and configure recipes too.
See the [API reference]({% link api/recipe-manager.md %}) for those methods.

## With an Optional Check

If crafting checks are enabled on the system, simple mode uses pass/fail:

- **Pass**: ingredients are consumed and results are created
- **Fail**: what the attempt costs depends on your consumption-on-failure settings, and what it produces depends on whether the system lets a failed check produce a result

What a failure costs and what it produces are separate settings, so you can have either, both, or neither.
When failed checks are allowed to produce something, the results tab gains a second **On a failed check** group holding what the failure hands back.

The crafting check decides whether the attempt passes or fails.
See [Crafting Checks]({% link crafting-checks.md %}) for how checks work.

---

## See Also

- [Routed Modes]({% link recipes/routed.md %}): produce different results from one recipe, chosen by ingredients or a skill check.
- [Crafting Checks]({% link crafting-checks.md %}): how crafting checks are configured.
