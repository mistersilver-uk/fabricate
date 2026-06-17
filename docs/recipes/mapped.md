---
layout: default
title: Routed Mode (Ingredient Set)
parent: Recipes
nav_order: 2
---

# Routed Mode: Ingredient Set Provider

{: .note }
> This page covers the Ingredient Set option for Routed mode, which replaces the older Mapped mode. Existing Mapped recipes are converted to Routed with the Ingredient Set option automatically when they load.

Different ingredient sets map to different result groups.
The player's choice of ingredients determines what they craft.

---

## Rules

- **One or more** ingredient sets
- **One or more** result groups
- The result selection must use the Ingredient Set option
- Each ingredient set can point to a particular result group
- If an ingredient set does not name a result group, the first result group is used
- Crafting check is optional (pass/fail only, outcome names are not used with this option)

## Example: Enchanted Ring

An enchanting recipe where different gem types produce different ring effects:

| Ingredient Set | Maps To | Result |
|:---------------|:--------|:-------|
| 1x Gold Band + 1x Ruby | Fire Ring result | 1x Ring of Fire Resistance |
| 1x Gold Band + 1x Sapphire | Ice Ring result | 1x Ring of Frost Resistance |
| 1x Gold Band + 1x Emerald | Nature Ring result | 1x Ring of Nature's Ward |

### Creating the recipe

Each ingredient set points to its matching result group.
The Fire Ring set (Gold Band + Ruby) points to the Fire Ring result, the Ice Ring set (Gold Band + Sapphire) points to the Ice Ring result, and so on, with the result selection using the Ingredient Set option.
Recipes can be authored through the API only.
See the [API reference]({% link api/recipe-manager.md %}) for the methods that create and configure recipes.

## When to Use the Ingredient Set Provider

The Ingredient Set option is ideal when:
- The same crafting process can produce different outputs depending on materials
- You want player agency in choosing outcomes through ingredient selection
- Different material quality should produce different results
- No skill check is needed to gate the outcome

---

## See Also

- [Routed Mode (Macro Outcome)]({% link recipes/macro-outcome.md %}): a crafting check macro's named outcome selects the result group.
- [Routed Mode (Roll Table)]({% link recipes/routed.md %}): a roll table draw selects the result group.
- [Crafting Checks]({% link crafting-checks.md %}): crafting check macro contracts.
