---
layout: default
title: Crafting Checks
nav_order: 3.1
---

# Crafting Checks

Crafting checks are not yet implemented in the UI.
Once they are, they will let you gate recipe outcomes on a player roll. 
Until then, you can use the API to define a custom check.

When a crafting system uses routed mode with the `macroOutcome` provider, or progressive resolution mode, a check is required to determine which result the crafter receives.
Configure the check at the system level.
Each attempt runs the check automatically, before any materials are consumed.

---

## See Also

- [Crafting Systems]({% link crafting-systems.md %}). Configure resolution mode, feature toggles, and system-level settings.
- [Salvage]({% link salvage.md %}). Configure salvage checks, which use a separate check pipeline to gate salvage outcomes.
- [Recipes]({% link recipes/index.md %}). Understand routed and progressive resolution modes that require a crafting check.
