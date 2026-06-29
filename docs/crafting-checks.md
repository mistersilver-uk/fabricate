---
layout: default
title: Crafting Checks
nav_order: 3.1
---

# Crafting Checks

Crafting checks let you gate recipe outcomes on a player roll.

When a crafting system uses the Routed by check resolution mode, or the Progressive resolution mode, a check is required to determine which result the crafter receives.
The check is configured at the system level on the **Crafting check** page in the Crafting Admin panel.
The page's shape follows the system's resolution mode: simple and alchemy author a pass or fail check, both routed modes author named outcome tiers, and progressive rolls for a numeric value.
A routed crafting check is optional in Routed by ingredients mode and required in Routed by check mode.
Each attempt runs the check automatically, before any materials are consumed.

## How a routed check is rolled

In a Routed by check system, the crafting check rolls its configured expression at the moment of crafting and maps the total onto one of the outcome tiers you defined.
The matched tier's name is the outcome that selects the result set.
See [Routed Modes]({% link recipes/routed.md %}) for how that outcome is matched to a result.

In Routed by ingredients mode the same outcome tiers can be configured, but the outcome never selects the result.
The ingredients used select the result instead, and the check is optional.

The base difficulty comes from the recipe's selected tier, or from a dynamic difficulty macro when you set one up.
This is the same difficulty source a simple check uses.
When the tiers are relative, the recipe tier or dynamic difficulty shifts every tier threshold together, so a harder recipe makes every outcome harder to reach.

Developers configuring a custom check for a non-D&D-5e system should refer to the API reference for the expected setup.

## Tool breakage triggers

You can let a check decide whether the required Tools break for an attempt, so the same roll that picks the result also decides whether the Tools survive.

This is only available when the system's **Tool breakage source** is set to **Check-driven**.
You set that on the system's **Tools** page (see [Tool breakage source]({% link tools.md %}#tool-breakage-source)).
While the source is **Tool-specific**, each Tool decides for itself and this section does not appear.

When the source is **Check-driven**, each check editor (crafting, salvage, and gathering) gains a **Tool breakage triggers** panel.
Turn it on with the **Enabled** toggle.
When you first enable it, Fabricate seeds a starter trigger for you: break the required Tools when the first d20 in the formula rolls a natural 1.
If the formula has no d20, no starter trigger is seeded and you add your own.

A check can hold any number of triggers.
The Tools break when any one of them matches, so triggers stack as an "or".
Give each trigger a label so the run and chat output can explain why the Tools broke.

For each trigger you choose what to watch with the **When** setting:

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| When | Matches on |
|:-----|:-----------|
| Roll total | The check's rolled total. |
| Dice group | One group of dice in the formula. Pick the group, then a measure: the group total, any die, all dice, the lowest die, or the highest die. This is how the natural-1 starter works. |
| Awarded value | The numeric value a progressive check awards. Available on progressive checks only. On a critical roll this can differ from the raw roll total, so a roll-total trigger and an awarded-value trigger can resolve differently on the same roll. |
| Outcome tier | One or more of the named outcome tiers. Available on routed checks only. A successful tier can break Tools just as a failing one can. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

Roll-total, awarded-value, and dice-group triggers then take a comparison (such as equals, at most, or at least) and a value to compare against.

A trigger breaks every required Tool for the attempt.
There is no per-Tool targeting.
An Immune Tool is the exception and never breaks, so set a Tool to Immune to keep it safe while the rest break.

The dice groups in a trigger come from the formula.
When the same shape appears twice (for example two separate d20 rolls), Fabricate numbers them so you can tell them apart.
Editing the formula can renumber the groups, so check your dice-group triggers after you change a check formula.

---

## See Also

- [Crafting Systems]({% link crafting-systems.md %}).
Configure resolution mode, feature toggles, and system-level settings.
- [Salvage]({% link salvage.md %}).
Configure salvage checks, which use a separate check to gate salvage outcomes.
- [Recipes]({% link recipes/index.md %}).
Understand the Routed by check and Progressive resolution modes that require a crafting check.
