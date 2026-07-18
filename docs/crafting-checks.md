---
layout: default
title: Crafting Checks
nav_order: 3.1
---

# Crafting Checks

Crafting checks let you gate recipe outcomes on a player roll.

When a crafting system uses the Routed by check resolution mode, or the Progressive resolution mode, a check is required to determine which result the crafter receives.
The check is configured at the system level on the **Crafting check** page in the Crafting Admin panel.
The page's shape follows the system's resolution mode: simple and Routed by ingredients author a pass or fail check, Routed by check authors named outcome tiers, and progressive rolls for a numeric value.
Alchemy follows its own Alchemy check setting: No check has nothing to author, Simple check authors a pass or fail check, and Tiered check authors named outcome tiers.
The pass or fail check is optional in simple and Routed by ingredients modes.
In Alchemy mode a check is required whenever the Alchemy check is Simple or Tiered, and there is no check when it is No check.
The outcome-tier check is required in Routed by check mode.
Each attempt runs the check automatically, before any materials are consumed.

## Rolling a check from the UI

When a player crafts or gathers from the Fabricate UI, the check is rolled interactively.
Fabricate opens a small dialog that shows the check, its difficulty, and the formula about to be rolled.
The dialog has a **Roll** button, a **Cancel** button, and a **Situational bonus** field for a one-off modifier.
Type a number into **Situational bonus** to add it to this roll, for example a bonus from a spell or a helping hand.
Leave the field blank to roll the check as configured.
An entry that is not a valid modifier is ignored, and the check rolls with its base formula.

Clicking **Roll** evaluates the check and posts the result to chat as a normal roll card.
The roll uses your current chat roll mode, so a private or blind roll stays hidden from other players in the usual way.
If the [Dice So Nice](https://foundryvtt.com/packages/dice-so-nice) module is installed, it animates the 3D dice for that roll.
Dice So Nice is optional.
Without it the roll still posts to chat as a normal roll card, just with no 3D animation.

Clicking **Cancel**, or dismissing the dialog, aborts the attempt with no changes.
No ingredients, currency, or Tools are consumed, and no run is recorded.

This interactive prompt is the default when you craft from the Crafting tab or gather from the Gathering screen.
It applies to the crafting, salvage, and gathering checks that run through the shared check step.
Some rolls never prompt:

- The immediate d100 gathering mode rolls without a prompt, because it resolves outside the shared check step.
- Timed and maturation crafting steps, and timed gathering tasks, do not prompt, because they resolve later when the Game Master advances world time.
- Salvage supports the prompt, but no current screen starts a salvage, so players do not see a salvage prompt today.

Macros and automation that call Fabricate directly keep the original silent behaviour and never prompt.

## How a routed check is rolled

In a Routed by check system, the crafting check rolls its configured expression at the moment of crafting and maps the total onto one of the outcome tiers you defined.
The matched tier's name is the outcome that selects the result set.
See [Routed Modes]({% link recipes/routed.md %}) for how that outcome is matched to a result.

In Routed by ingredients mode the crafting check is the same optional pass or fail check that simple mode uses, not an outcome-tier check.
The ingredients used select the result.
The check only gates whether the craft succeeds, and it is optional, so with no roll formula the craft proceeds with no check.

### Relative and fixed tiers

A routed check's outcome tiers are authored as either **Relative** or **Fixed**, chosen with the **Tier type** control in the check editor.
The two types map the roll to an outcome in different ways.

**Relative** tiers are positioned against a DC.
Each tier threshold is expressed relative to the recipe's difficulty, for example DC -5 or DC +10.
The base difficulty comes from the recipe's selected tier, or from a dynamic difficulty macro when you set one up.
This is the same difficulty source a simple check uses.
The recipe tier or dynamic difficulty shifts every tier threshold together, so a harder recipe makes every outcome harder to reach.
A roll that falls below every relative tier still maps to the lowest tier, so a higher difficulty never produces a craft with no outcome.
The check editor shows the **DC** and the meet-or-exceed comparison for relative tiers, because both take part in matching.

**Fixed** tiers own non-overlapping segments of the roll value range instead.
Each tier covers a fixed span of possible roll totals, and the roll is matched to whichever tier's range contains its total.
A fixed check has no DC, so the recipe tier and dynamic difficulty do not move its thresholds.
The check editor hides the **DC** and the meet-or-exceed comparison when a Routed by check system uses fixed tiers, because a DC is meaningless in that mode.
The player's check card and the interactive roll prompt likewise drop the DC chip for a fixed routed check.

Fixed tiers are shared across every recipe in the system.
A recipe can still carry its own difficulty on top of a fixed check by setting a minimum success tier.
See [Minimum success tier for fixed routed checks]({% link recipes/routed.md %}#minimum-success-tier-for-fixed-routed-checks).

Developers configuring a custom check for a non-D&D-5e system should refer to the API reference for the expected setup.

## Failure consumption policy

When a crafting check fails, you decide what happens to the recipe's ingredients and its required Tools.
Two toggles on the **Crafting check** page set this policy for the whole system.

- **Consume ingredients on a failed check** is on by default.
The recipe's ingredients are used up even when the crafting check fails.
Turn it off to return the ingredients on a failed check, so a failed attempt costs the crafter nothing.
- **Break tools on a failed check** is off by default.
Turn it on to break the required Tools whenever the crafting check fails.

This policy applies to every failed crafting check in the system, across the simple, Routed by ingredients, Routed by check, and Progressive modes.
It does not appear in Alchemy mode, where a failed brew follows the system's own [Consume on Fail]({% link recipes/alchemy.md %}#consume-on-fail) setting instead.
Salvage failures follow their own separate policy, so this control does not change what a failed salvage consumes.
See [Salvage]({% link salvage.md %}).

The **Break tools on a failed check** toggle is a system-wide rule that breaks every required Tool on any failed check.
It is separate from the per-trigger **Tool breakage triggers** panel below, which decides breakage from the specifics of the roll.

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
