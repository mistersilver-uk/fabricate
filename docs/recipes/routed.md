---
layout: default
title: Routed Modes
parent: Recipes
nav_order: 2
---

# Routed Modes

Routed crafting lets one recipe produce different results, with the result chosen at the moment of crafting.
Use it whenever a single crafting process can lead to more than one outcome.

A routed recipe has one or more ingredient sets and one or more result groups, and exactly one result group is produced per craft.
There are two routed resolution modes, and you pick one as the system's **Recipe resolution mode**.

- **Routed by ingredients** selects the result from the ingredients the player uses.
- **Routed by check** selects the result from a crafting-check outcome.

The choice is a property of the whole crafting system, not of each recipe.
Every recipe in the system follows the system's mode.

---

## Routed by ingredients

The player's choice of ingredients decides the result.
Each ingredient set is tied to a result group, so changing the materials changes what is produced.

Use this when different materials should make different things.
For example, the same gold band could become a Ring of Fire Resistance with a ruby, or a Ring of Frost Resistance with a sapphire.

The crafting check is **optional** in this mode, the same as Simple mode.
It is authored on the **Crafting check** page with the same pass or fail editor Simple mode uses: a roll formula, a DC, a meet or exceed comparison, a static or dynamic difficulty, and per-recipe check tiers.
If you configure a roll formula, the check still rolls when a player crafts, but it never changes which result group is produced.
If you configure no roll formula, the craft proceeds with no check.
Because it uses the same pass or fail check as Simple mode, a Routed by ingredients recipe can pick a per-recipe **Check tier** to shift its DC (but not the outcome-tier controls used by Routed by check).

When a recipe has a single result group, you do not need to tie an ingredient set to it.
The single result group is produced whenever the recipe is crafted.

---

## Routed by check

A crafting check is rolled at the moment of crafting, and its outcome decides the result.
A crafting check is **required** in this mode.

The check rolls the routed crafting check you configured on the system, then maps the roll to one of the named outcome tiers you defined there.
The matched tier's name is the outcome that selects the result.
How the roll maps to a tier depends on whether the check's tiers are relative or fixed.
See [Relative and fixed tiers]({% link crafting-checks.md %}#relative-and-fixed-tiers) for the difference.

With relative tiers, the base difficulty comes from the recipe's selected tier, or from a dynamic difficulty if you set one up, the same way a simple check resolves its difficulty.
A recipe tier or dynamic difficulty shifts every outcome threshold up or down together.
A roll that falls below every tier still lands your lowest tier, so raising the difficulty never leaves a craft with no outcome at all.

With fixed tiers, each tier owns a fixed segment of the roll value range and the roll is matched by range.
A fixed check has no DC, so the recipe tier and dynamic difficulty do not change it.
A recipe can still carry its own difficulty on a fixed check by requiring a minimum success tier, described below.

Use this when the quality of the result should depend on a roll.
For example, a forging recipe might give a Masterwork Longsword on a great roll, a plain Longsword on an average one, and a Bent Blade on a poor one.

Because every recipe in this mode routes by the check, the routed crafting check is needed for the whole system to work.
A system in Routed by check mode with no routed crafting check roll formula is a system blocker, and players cannot craft any of its recipes until you configure one.
See [System Overview]({% link crafting-systems.md %}#system-overview).

### How outcomes match results

You can tie each result set to a specific outcome tier.
In the recipe editor, the result set's **Produced on outcome** control lists the success tiers from the routed crafting check.
When a result set is assigned to an outcome tier this way, a craft that rolls that tier produces that result set.
This explicit assignment takes priority over name matching.

When a recipe does not assign any result set to an outcome tier, the outcome name is matched to a result by name instead.
Upper and lower case and surrounding spaces are ignored, so each result needs a name that is unique once case is ignored.

A few names are reserved so a recipe can fail or come up empty without a separate check.
These reserved names cannot be used as a result name.

| Reserved name | What happens |
|:--------------|:-------------|
| fail, failed, failure, f | The craft takes the failure path |
| hazard, danger, complication, trap, oops | The craft takes the failure path |
| miss, missed, m, nothing, none, whiff, whiffed | The craft produces nothing |

If an outcome is neither a reserved name nor one of your result names, the craft stops and reports a setup problem rather than treating it as a player failure.

### A single result group needs no mapping

When a recipe has exactly one result group, you do not need to map outcomes to results at all.
The single result group is produced on any non-failure outcome, and nothing is produced when the outcome is a reserved failure name.
This mirrors the single-result-group rule in Routed by ingredients.
A craft that succeeds in this case never reports a setup problem, and the recipe editor raises no routing warnings for it.

In a multi-step recipe, each step is checked on its own.
A step with a single result group uses the no-mapping rule, while a step with several result groups needs each success outcome routed to a result.

### Minimum success tier for fixed routed checks

Fixed outcome tiers are shared by every recipe in the system.
A recipe can raise its own difficulty on top of that shared check by requiring a minimum success tier.

Set it with the **Minimum success tier** dropdown on the recipe editor's Overview tab.
The dropdown appears only when the system uses a Routed by check crafting check with fixed tiers.
It lists the check's success tiers from lowest to highest, and it defaults to **No override (use rolled tier)**.

While the default is selected, the recipe uses whichever tier the roll lands in, the same as any other recipe.
When you pick a minimum tier, a roll that lands below it fails the craft outright.
The craft takes its normal failure path, so ingredients are consumed and no result is produced, exactly as a failed check would.
A roll that lands on the chosen tier or higher produces its result as usual.

This lets recipes that share one fixed check carry different difficulty.
An easy recipe can leave the override off, while a demanding one can require a higher tier before it succeeds.
The setting has no effect on relative checks or in Routed by ingredients mode, which is why the control is hidden there.

---

## Checking your routing in the editor

When a recipe is in Routed by check mode and has more than one result group, the recipe editor's **Validation** tab checks the wiring between outcome tiers and result sets and warns about two common gaps.

- A result set that is not assigned to any check outcome.
  It will never be produced, so a check that succeeds can silently make nothing.
  Assign the result set to an outcome tier, or give it a name that matches an outcome.
  This warning also appears when a result set is only assigned to an outcome tier that has since been deleted.
- A success outcome tier that no result set produces.
  A craft that rolls that tier resolves to nothing.
  Add a result set for that outcome, or remove the tier from the routed crafting check if you no longer need it.

These are warnings, not blockers.
The recipe still saves, but the gaps are worth closing before players craft it.

A recipe with a single result group never raises these warnings, because it needs no mapping.

---

## Choosing a mode

Pick **Routed by ingredients** when the materials a player brings should determine the output, with no roll required.
Pick **Routed by check** when result quality should depend on a roll and you want distinct named outcomes rather than just pass or fail.

If you change the system's resolution mode later, Fabricate keeps your recipes and adapts them to the new mode wherever it can.
Switching between the two routed modes never deletes a recipe.
Routing data that no longer fits the new mode is kept and flagged in the System Overview so you can re-author it, rather than being silently mis-routed.
See [Changing the resolution mode]({% link crafting-systems.md %}#feature-toggles).

Fabricate also carries your crafting check across when you switch modes.
Routed by ingredients uses the same pass or fail check as Simple and Alchemy, while Routed by check uses named outcome tiers instead.
When you switch a system between Routed by ingredients and Routed by check, Fabricate moves the check's roll formula and DC into the new mode's **Crafting check** editor, as long as you have not already set one up there.
One case needs your attention.
If a Routed by ingredients check used a dynamic difficulty, switching into Routed by check drops the dynamic difficulty, because Routed by check does not support one.
Re-author the DC on the **Crafting check** page after switching into Routed by check so the tier check uses the difficulty you intend.

You author routed recipes in the recipe editor in the Crafting Admin panel, and the public API can create them too.
See the [Recipe Manager API reference]({% link api/recipe-manager.md %}) for those methods.

---

## See Also

- [Simple Mode]({% link recipes/simple.md %}): one set of ingredients and one result, with an optional pass or fail check.
- [Progressive Mode]({% link recipes/progressive.md %}): a skill-check value buys results in difficulty order.
- [Crafting Checks]({% link crafting-checks.md %}): how crafting checks are configured.
