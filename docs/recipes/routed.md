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
You pick how the result is selected in one of two ways.

---

## Choosing the result

### By ingredient choice

The player's choice of ingredients decides the result, with no crafting check involved.
Each ingredient set is tied to a result, so changing the materials changes what is produced.

Use this when different materials should make different things.
For example, the same gold band could become a Ring of Fire Resistance with a ruby, or a Ring of Frost Resistance with a sapphire.

### By skill-check outcome

A crafting check is rolled at the moment of crafting, and its outcome decides the result.
A crafting check is required.

The check rolls the routed crafting check you configured on the system, then maps the roll to one of the named outcome tiers you defined there.
The matched tier's name is the outcome that selects the result.
The base difficulty comes from the recipe's selected tier, or from a dynamic difficulty if you set one up, the same way a simple check resolves its difficulty.
A recipe tier or dynamic difficulty shifts every outcome threshold up or down together.

Use this when the quality of the result should depend on a roll.
For example, a forging recipe might give a Masterwork Longsword on a great roll, a plain Longsword on an average one, and a Bent Blade on a poor one.

---

## How outcomes match results

You can tie each result set to a specific outcome tier.
In the recipe editor, the result set's **Produced on outcome** control lists the success tiers from the routed crafting check.
When a result set is assigned to an outcome tier this way, a craft that rolls that tier produces that result set.
This explicit assignment takes priority over name matching.

When a recipe does not assign any result set to an outcome tier, the outcome name is matched to a result by name instead.
Upper and lower case and surrounding spaces are ignored, so each result needs a name that is unique once case is ignored.
This unique-name rule applies to both selection methods, so no two results may share a name once case is ignored.

A few names are reserved so a recipe can fail or come up empty without a separate check.
These reserved names cannot be used as a result name in either selection method.

| Reserved name | What happens |
|:--------------|:-------------|
| fail, failed, failure, f | The craft takes the failure path |
| hazard, danger, complication, trap, oops | The craft takes the failure path |
| miss, missed, m, nothing, none, whiff, whiffed | The craft produces nothing |

If an outcome is neither a reserved name nor one of your result names, the craft stops and reports a setup problem rather than treating it as a player failure.

In a multi-step recipe, each step can use its own selection method and falls back to the recipe's setting when it has none.

---

## Checking your routing in the editor

When a recipe routes by skill-check outcome, the recipe editor's **Validation** tab checks the wiring between outcome tiers and result sets and warns about two common gaps.

- A result set that is not assigned to any check outcome.
  It will never be produced, so a check that succeeds can silently make nothing.
  Assign the result set to an outcome tier, or switch it to name matching.
  This warning also appears when a result set is only assigned to an outcome tier that has since been deleted.
- A success outcome tier that no result set produces.
  A craft that rolls that tier resolves to nothing.
  Add a result set for that outcome, or remove the tier from the routed crafting check if you no longer need it.

These are warnings, not blockers.
The recipe still saves, but the gaps are worth closing before players craft it.

---

## Choosing an option

Pick **ingredient choice** when the materials a player brings should determine the output, with no roll.
Pick **skill-check outcome** when result quality should depend on a roll and you want distinct named outcomes rather than just pass or fail.

Recipes can be authored through the API only today.
See the [Recipe Manager API reference]({% link api/recipe-manager.md %}) for the methods that create and configure recipes.

---

## See Also

- [Simple Mode]({% link recipes/simple.md %}): one set of ingredients and one result, with an optional pass or fail check.
- [Progressive Mode]({% link recipes/progressive.md %}): a skill-check value buys results in difficulty order.
- [Crafting Checks]({% link crafting-checks.md %}): how crafting checks are configured.
