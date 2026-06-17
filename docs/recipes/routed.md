---
layout: default
title: Routed Mode (Roll Table)
parent: Recipes
nav_order: 4
---

# Routed Mode: Roll Table Provider

A FoundryVTT roll table is drawn once per crafting attempt, and the drawn result's name determines which result group is produced.
The outcome is matched against result group names ignoring upper and lower case, using the same reserved words as the Macro Outcome option.

---

## Rules

- **One or more** ingredient sets
- **One or more** result groups
- The result selection must use the Roll Table option
- You must choose which FoundryVTT roll table to draw from
- The table is drawn exactly once per attempt
- Surrounding spaces are trimmed from the drawn result's name, and it is matched against result group names ignoring upper and lower case
- Result group names must be unique when upper and lower case are ignored
- Result group names may not use the reserved fail or miss words listed below

### Reserved Outcome Names

| Outcome name | Behaviour |
|:--------|:----------|
| fail, failed, failure, f | The craft takes the failure path |
| miss, missed, m, nothing, none, whiff, whiffed | The craft produces nothing (a failure with no result) |

If the drawn result name is neither a reserved word nor the name of a result group, the craft stops with a misconfiguration error.

## Example: Random Potion Brewing

A routed system where brewing a potion draws from a roll table to determine which potion is produced:

| Roll Table Result | Result Group | Output |
|:------------------|:-------------|:-------|
| Healing | Healing result | 1x Potion of Healing |
| Fire | Fire result | 1x Potion of Fire Breath |
| Invisibility | Invisibility result | 1x Potion of Invisibility |
| fail | (reserved) | Craft fails, ingredients consumed |

### Creating the Recipe

The recipe uses the Roll Table option with the table you want to draw from, one ingredient set, and one result group per drawable outcome (Healing, Fire, Invisibility).
Recipes can be authored through the API only.
See the [API reference]({% link api/recipe-manager.md %}) for the methods that create and configure recipes.

## Setting Up the Roll Table

In FoundryVTT, create a roll table whose result names match your result group names (upper and lower case are ignored).
You can also add entries named with the reserved fail or miss words to give the craft a chance of failure without a crafting check.

1. Open **Roll Tables** in the sidebar
2. Create a new table
3. Add results whose **Text** values match your recipe's result group names
4. Note the table's identifier from its sheet header (right-click the title)
5. Point the recipe's roll table option at that table

## When to Use the Roll Table Provider

The Roll Table option is ideal when:
- Crafting outcomes should feel random or mysterious
- You want FoundryVTT's native probability weighting on roll tables
- You do not need a player-facing skill check, but still want variable results

---

## See Also

- [Routed Mode (Macro Outcome)]({% link recipes/macro-outcome.md %}): a crafting check macro's named outcome selects the result group.
- [Routed Mode (Ingredient Set)]({% link recipes/mapped.md %}): the player's ingredient choice selects the result group.
- [Progressive Mode]({% link recipes/progressive.md %}): check values are spent to buy results in difficulty order.
