---
layout: default
title: Routed Mode (Macro Outcome)
parent: Recipes
nav_order: 3
---

# Routed Mode: Macro Outcome Provider

{: .note }
> This page covers the Macro Outcome option for Routed mode. Older recipes still saved in the legacy Tiered mode are converted to Routed with the Macro Outcome option automatically when they load.

A crafting check returns a named **outcome**, and the outcome determines which result group is produced.
The outcome is matched against result group names, ignoring upper and lower case.

---

## Rules

- **One or more** ingredient sets
- **One or more** result groups
- The result selection must use the Macro Outcome option
- A crafting check is **required** (either chosen on the recipe or the system default)
- The check reports either a success with a named outcome or a failure
- Surrounding spaces are trimmed from the outcome name, and it is matched against result group names ignoring upper and lower case
- Result group names must be unique when upper and lower case are ignored
- Result group names may not use the reserved fail or miss words listed below

### Reserved Outcome Names

| Outcome name | Behaviour |
|:--------|:----------|
| fail, failed, failure, f | The craft takes the failure path |
| miss, missed, m, nothing, none, whiff, whiffed | The craft produces nothing (a failure with no result) |

If the check reports an outcome that is neither a reserved word nor the name of a result group, the craft stops with a misconfiguration error rather than treating it as a player failure.

## Example: Weapon Forging

A blacksmithing recipe where the quality of the result depends on a skill check:

| Outcome | Result |
|:--------|:-------|
| "masterwork" | 1x Masterwork Longsword |
| "standard" | 1x Longsword |
| "flawed" | 1x Bent Blade (junk) |

### The Check

Your crafting check looks at the recipe and the actors involved, and reports a named outcome.
For example, it reports Masterwork, Standard, or Flawed depending on the roll total, or a failure when the roll is too low.
The outcome name is matched against the recipe's result group names.
See [Crafting Checks]({% link crafting-checks.md %}) for how checks work and what they report.

### Creating the Recipe

The recipe uses the Macro Outcome option, an optional check of your own (leave it unset to use the system default), one ingredient set, and one result group per named outcome (Masterwork, Standard, Flawed).
Recipes can be authored through the API only.
See the [API reference]({% link api/recipe-manager.md %}) for the methods that create and configure recipes.

## Step-Level Routing Overrides

In multi-step recipes, an individual step can use its own result selection.
A step's own setting is used when present, otherwise the recipe-level setting applies.

## When to Use the Macro Outcome Provider

The Macro Outcome option is ideal when:
- Result quality should depend on a skill check
- You want distinct named outcomes (not just pass/fail)
- Different outcomes should produce fundamentally different items

---

## See Also

- [Progressive Mode]({% link recipes/progressive.md %}): check values are spent to buy results in difficulty order.
- [Crafting Checks]({% link crafting-checks.md %}): crafting check macro contracts.
- [Multi-Step Recipes]({% link recipes/multi-step.md %}): chain multiple steps with per-step outcome routing.
