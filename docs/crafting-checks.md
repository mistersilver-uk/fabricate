---
layout: default
title: Crafting Checks
nav_order: 3.1
---

# Crafting Checks

Crafting checks let you gate recipe outcomes on a player roll.

When a crafting system uses the Routed resolution mode with the skill-check outcome option, or the Progressive resolution mode, a check is required to determine which result the crafter receives.
The check is configured at the system level on the **Crafting check** page in the Crafting Admin panel.
The page's shape follows the system's resolution mode: simple and alchemy author a pass or fail check, routed authors named outcome tiers, and progressive rolls for a numeric value.
Each attempt runs the check automatically, before any materials are consumed.

## How a routed check is rolled

In a routed system, the crafting check rolls its configured expression at the moment of crafting and maps the total onto one of the outcome tiers you defined.
The matched tier's name is the outcome that selects the result set.
See [Routed Mode]({% link recipes/routed.md %}) for how that outcome is matched to a result.

The base difficulty comes from the recipe's selected tier, or from a dynamic difficulty macro when you set one up.
This is the same difficulty source a simple check uses.
When the tiers are relative, the recipe tier or dynamic difficulty shifts every tier threshold together, so a harder recipe makes every outcome harder to reach.

Developers configuring a custom check for a non-D&D-5e system should refer to the API reference for the expected setup.

---

## See Also

- [Crafting Systems]({% link crafting-systems.md %}). Configure resolution mode, feature toggles, and system-level settings.
- [Salvage]({% link salvage.md %}). Configure salvage checks, which use a separate check to gate salvage outcomes.
- [Recipes]({% link recipes/index.md %}). Understand the Routed and Progressive resolution modes that require a crafting check.
