---
layout: default
title: Crafting Checks
nav_order: 3.1
---

# Crafting Checks

Crafting checks let you gate recipe outcomes on a player roll.
Checks are currently only available through the API.

When a crafting system uses the Routed resolution mode with the skill-check outcome option, or the Progressive resolution mode, a check is required to determine which result the crafter receives.
The check is configured at the system level.
Each attempt runs the check automatically, before any materials are consumed.

Developers configuring a custom check for a non-D&D-5e system should refer to the API reference for the expected setup.

---

## See Also

- [Crafting Systems]({% link crafting-systems.md %}). Configure resolution mode, feature toggles, and system-level settings.
- [Salvage]({% link salvage.md %}). Configure salvage checks, which use a separate check to gate salvage outcomes.
- [Recipes]({% link recipes/index.md %}). Understand the Routed and Progressive resolution modes that require a crafting check.
