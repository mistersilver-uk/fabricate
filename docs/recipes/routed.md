---
layout: default
title: Routed Mode
parent: Recipes
nav_order: 2
---

# Routed Mode

Routed mode lets one recipe produce different results, with the result chosen at the moment of crafting.
Use it whenever a single crafting process can lead to more than one outcome.

A routed recipe has one or more ingredient sets and one or more result groups.
You pick how the result is selected in one of three ways.

{: .note }
> Routed mode replaces the older Mapped and Tiered modes.
> Existing recipes convert automatically when they load.

---

## Choosing the result

### By ingredient choice

The player's choice of ingredients decides the result, with no crafting check involved.
Each ingredient set is tied to a result, so changing the materials changes what is produced.

Use this when different materials should make different things.
For example, the same gold band could become a Ring of Fire Resistance with a ruby, or a Ring of Frost Resistance with a sapphire.

### By skill-check outcome

A crafting check reports a named outcome, and that outcome decides the result.
A crafting check is required.

Use this when the quality of the result should depend on a roll.
For example, a forging recipe might give a Masterwork Longsword on a great roll, a plain Longsword on an average one, and a Bent Blade on a poor one.

### By roll table

A Foundry roll table is drawn once per attempt, and the drawn entry decides the result, with no crafting check involved.

Use this when the outcome should feel random and you want Foundry's own table weighting.
For example, brewing an unstable potion might draw Healing, Fire Breath, or Invisibility from a table.
To set it up, make a roll table whose entry names match your result names, then point the recipe at that table.

---

## How outcomes match results

With the skill-check and roll-table options, the outcome name is matched to a result by name.
Upper and lower case and surrounding spaces are ignored, so each result needs a name that is unique once case is ignored.

A few names are reserved so a recipe can fail or come up empty without a separate check.

| Reserved name | What happens |
|:--------------|:-------------|
| fail, failed, failure, f | The craft takes the failure path |
| miss, missed, m, nothing, none, whiff, whiffed | The craft produces nothing |

If an outcome is neither a reserved name nor one of your result names, the craft stops and reports a setup problem rather than treating it as a player failure.

In a multi-step recipe, each step can use its own selection method and falls back to the recipe's setting when it has none.

---

## Choosing an option

Pick **ingredient choice** when the materials a player brings should determine the output, with no roll.
Pick **skill-check outcome** when result quality should depend on a roll and you want distinct named outcomes rather than just pass or fail.
Pick **roll table** when you want randomness and Foundry's table weighting without a player-facing check.

Recipes can be authored through the API only today.
See the [Recipe Manager API reference]({% link api/recipe-manager.md %}) for the methods that create and configure recipes.

---

## See Also

- [Simple Mode]({% link recipes/simple.md %}): one set of ingredients and one result, with an optional pass or fail check.
- [Progressive Mode]({% link recipes/progressive.md %}): a skill-check value buys results in difficulty order.
- [Crafting Checks]({% link crafting-checks.md %}): how crafting checks are configured.
