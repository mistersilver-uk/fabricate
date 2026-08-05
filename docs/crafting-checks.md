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

## Dynamic DC macros

A GM can have a Macro calculate the difficulty for each crafting attempt.
On the **Crafting check** page, open the **DC source** card and choose **Dynamic**.
Then drag the Script Macro you want to use into the **DC macro** area.
The macro calculates only the DC.
It does not roll the check or choose the crafting result.
If no Macro is linked, the Macro fails, or it cannot provide a usable number, Fabricate uses the configured static DC instead.
See the [Dynamic DC Macro API example]({% link api/crafting-engine.md %}#dynamic-dc-macro) for the supported inputs and a working Script Macro.

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

## Check modifiers

A crafting check's roll formula can add in a named modifier from the crafter through the `@craftingmod` placeholder, the same way it can use `@abilities.str.mod` or any other roll-data path your game system exposes.
The **Check modifiers** card on the **Crafting check** page defines the catalogue of modifiers a system's checks can draw on.
The card only appears when the active crafting check has an authored roll formula, the same rule the failure-consumption toggles follow.
Check modifiers are a crafting-only feature.
Salvage and gathering checks do not use them.

### Defining check modifiers

On the **Check modifiers** card, choose **Add modifier** to add an entry.
Each entry has an **Icon**, a **Label** such as Medicine or Herbalism, and an **Expression**, a roll-data path resolved against the crafter, for example `abilities.med.mod`.
Reference `@craftingmod` in the check's roll formula wherever you want the resolved value to apply.
A roll formula with no `@craftingmod` placeholder ignores the catalogue entirely.

### The default eligible set

Not every modifier in the catalogue has to count on every recipe.
The **Default modifiers** picker, below the catalogue, sets which modifiers are on by default for the whole system.
A recipe can override this default set on its own **Overview** tab, under **Check modifiers**.
Choose **Eligible modifiers** there to pick a different set for that recipe alone, or leave it inheriting the system default.
The recipe-level **Check modifiers** control only appears when the system has at least one modifier in its catalogue.

### Combining modifiers

The **Default combination** setting on the **Check modifiers** card decides how the eligible modifiers combine into `@craftingmod`.
A recipe can also override the combination on its own **Overview** tab, alongside its eligible-set override.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Combination | What it does | When you would want it |
|:------------|:-------------|:------------------------|
| **Add all** | Sums every eligible modifier. | The recipe rewards stacking every relevant skill or tool bonus at once. |
| **Highest** | Uses only the single largest eligible modifier, as a plain number, not a keep-highest dice roll. | Several skills can substitute for each other, and only the best should count. |
| **By recipe** | Sums whichever modifiers the recipe itself has selected as eligible. | Different recipes in the same system need different modifiers to matter, with no player choice involved. |
| **Player picks** | The player chooses exactly one eligible modifier at roll time. | You want the player to decide, in the moment, which of their skills they are relying on for that attempt. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

### Player picks

**Player picks** is the only combination that is not fully decided ahead of the roll.
It only prompts the player when all of the following are true for that attempt: the roll happens through the interactive dialog described above, the check's roll formula contains `@craftingmod`, the effective combination (the recipe's own override, or otherwise the system default) is **Player picks**, and at least two modifiers are eligible for that recipe.
When any of those is not true, for example a recipe with only one eligible modifier, or a Macro rolling the check directly, the check resolves exactly as **Highest** instead, with no prompt.

When the player is prompted, the roll dialog adds a **Check modifier** choice below the formula, listing each eligible modifier by icon, label, and its resolved value.
The highest-valued modifier is pre-selected, so a player who just clicks **Roll** without changing the selection gets the same result as **Highest** would have given.
Because the chosen value is not known until the player picks it, the formula preview shows **(modifier)** in that spot instead of a number, until the player confirms a choice.

## How a routed check is rolled

In a Routed by check system, the crafting check rolls its configured expression at the moment of crafting and maps the total onto one of the outcome tiers you defined.
That tier's name is the outcome that selects the result set, after any [tier step](#tier-stepping) a matching trigger applies.
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
The player's check card shows this resolved difficulty-tier DC, the same number the interactive roll prompt uses and the chat card reports.

**Fixed** tiers own non-overlapping segments of the roll value range instead.
Each tier covers a fixed span of possible roll totals, and the roll is matched to whichever tier's range contains its total.
A fixed check has no DC, so the recipe tier and dynamic difficulty do not move its thresholds.
The check editor hides the **DC** and the meet-or-exceed comparison when a Routed by check system uses fixed tiers, because a DC is meaningless in that mode.
The player's check card and the interactive roll prompt likewise drop the DC chip for a fixed routed check.

Fixed tiers are shared across every recipe in the system.
A recipe can still carry its own difficulty on top of a fixed check by setting a minimum success tier.
See [Minimum success tier for fixed routed checks]({% link recipes/routed.md %}#minimum-success-tier-for-fixed-routed-checks).

Developers configuring a custom check for a non-D&D-5e system should refer to the API reference for the expected setup.

### Tier stepping

A check trigger can move the outcome tier a roll landed on.
This is the trigger's **Tier step** setting, and it replaces the old system-wide **Natural tier stepping** toggle.

You author it on the trigger itself, next to the condition that trigger watches, so you choose the dice, the values, and how far the tier moves.
It is available on every Routed by check crafting, salvage, and gathering check, with Relative or Fixed tiers alike.
See [Tool breakage triggers](#tool-breakage-triggers) for how a trigger's condition is authored; a trigger does not have to break anything to step a tier.

Each trigger's **Tier step** offers four choices:

- **No step** leaves the tier alone, and is the default.
- **Step up** moves the tier up by the number of steps you set.
- **Step down** moves it down by that number.
- **Target tier** moves it to one named tier you pick, whatever the roll landed on.

For example, say your check has the tiers Ruined, Poor, Fine, and Masterwork, and you want a fumble to spoil the work.
Add a trigger that watches the d20 group for a 1 and set its **Tier step** to **Step down 1**.
A roll that would have landed on **Poor** now lands on **Ruined** instead.
Add a second trigger watching that group for a 20 and set it to **Step up 1**, and a natural 20 that landed on Fine now produces Masterwork.

A step does not have to key off the dice at all.
Set a trigger's **When** to **Outcome tier**, tick **Poor**, and set its **Tier step** to **Step down 1**, and every roll that lands on Poor slides to Ruined whatever the dice showed.
An outcome-tier trigger can step the tier even though it can never force the outcome; see [Tool breakage triggers](#tool-breakage-triggers) for the full **When** list.

Several triggers can match the same roll, and their steps combine.
Up and down steps add together, so two triggers each stepping up one move the tier up two, and one up and one down cancel out and change nothing.
If more than one matching trigger sets a **Target tier**, the lowest of those tiers wins, so competing targets never depend on the order you added the triggers in.
A target is applied first, and any up or down steps then move on from there.

A step that would run off the end of the tier list stops at the highest or lowest tier rather than doing nothing.
**Step up 3** from the second-highest tier lands on the highest.

A **Target tier** naming a tier the check no longer has does nothing at all.
This is easy to reach by accident, because switching a check between Relative and Fixed tiers replaces the whole tier list.
The trigger shows the missing tier and the check's **Validation** tab warns you about it, so pick one of the check's current tiers to fix it.

A trigger's condition always looks at the tier the dice landed on, never at the tier a step produced.
That means an outcome-tier condition can drive a step, and steps can never chain into each other.

A trigger that forces the outcome still decides success or failure.
A step then moves the tier only among the tiers that share that result: a forced success stays on a successful tier and a forced failure stays on a failing one.
So a step can never turn an **Automatic success** into a failed craft, and the tier name a player sees always agrees with the result they got.
Where no outcome is forced, the tier after stepping decides everything — whether the craft succeeds, which result set it produces, and whether tools break — so a step down onto a failing tier does fail the craft.

A recipe's minimum success tier on a Fixed check is judged after stepping.
A step down can therefore push a craft below the recipe's minimum, and a step up can lift it over.
See [Minimum success tier for fixed routed checks]({% link recipes/routed.md %}#minimum-success-tier-for-fixed-routed-checks).

If the roll matched no tier at all — a Fixed check whose total falls outside every range you authored — nothing steps, **Target tier** included.
Author a range that covers those totals instead of relying on a step.

When a step actually changes the tier, the crafting or salvage result explains the step in chat.
A **Step up** or **Step down** note says how many tiers it moved.
A **Target tier** note just says the roll was moved to the target tier.
A step that changes nothing says nothing.
Gathering checks step their tier the same way, but do not report the step in chat.

**If you already had Natural tier stepping switched on**, Fabricate converts it for you.
The next time the system is loaded, that check gains two triggers: one watching the first d20 group for a 20 that steps up one, and one watching it for a 1 that steps down one.
Nothing is lost, you do not need to do anything, and you can now edit, delete, or extend those triggers like any others.

## Failure consumption policy

When a crafting check fails, you decide what happens to the recipe's ingredients and its required Tools.
Two toggles on the **Crafting check** page set this policy for the whole system.

- **Consume ingredients on a failed check** is on by default.
The recipe's ingredients are used up even when the crafting check fails.
Turn it off to return the ingredients on a failed check, so a failed attempt costs the crafter nothing.
- **Break tools on a failed check** is off by default.
Turn it on to allow normal Tool breakage evaluation after the crafting check fails.

This policy applies to every failed crafting check in the system, across the simple, Routed by ingredients, Routed by check, and Progressive modes.
It does not appear in Alchemy mode, where a failed brew follows the system's own [Consume on Fail]({% link recipes/alchemy.md %}#consume-on-fail) setting instead.
Salvage failures follow their own separate policy, so this control does not change what a failed salvage consumes.
See [Salvage]({% link salvage.md %}).

The **Break tools on a failed check** toggle permits breakage on the failure path.
The system's breakage source still decides whether Tool-specific mechanics or matching check triggers determine the break.

## Tool breakage triggers

You can let a check decide whether the required Tools break for an attempt, so the same roll that picks the result also decides whether the Tools survive.

A check's trigger list is one list with three effects per trigger: forcing the outcome, stepping the outcome tier (see [Tier stepping](#tier-stepping)), and breaking Tools.
This section covers the last of them and the conditions all three share.
Only the Tool-breaking effect depends on the system's breakage source; a trigger can force an outcome or step a tier whatever that source is set to.

Breaking Tools from a check is only available when the system's **Tool breakage source** is set to **Check-driven**.
You set that on the system's **Tools** page (see [Tool breakage source]({% link tools.md %}#tool-breakage-source)).
While the source is **Tool-specific**, each Tool decides for itself and the break-Tools option is hidden from every trigger.

When the source is **Check-driven**, each check editor can include Tool breakage on its check triggers.
An empty trigger list does nothing, so choose **Add trigger** to author the first condition.

A check can hold any number of triggers.
The Tools break when any one of them matches, so triggers stack as an "or".

For each trigger you choose what to watch with the **When** setting:

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| When | Matches on |
|:-----|:-----------|
| Roll total | The check's rolled total. |
| Dice group | One group of dice in the formula. Pick the group, then a measure: the group total, any die, all dice, the lowest die, or the highest die. |
| Awarded value | The numeric value a progressive check awards. Available on progressive checks only. On a critical roll this can differ from the raw roll total, so a roll-total trigger and an awarded-value trigger can resolve differently on the same roll. |
| Outcome tier | One or more of the named outcome tiers. Available on routed checks only. A successful tier can break Tools just as a failing one can. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

Roll-total, awarded-value, and dice-group triggers then take a comparison (such as equals, at most, or at least) and a value to compare against.

A trigger marked to break Tools breaks every required **Breakable** Tool for the attempt.
There is no per-Tool targeting.
Set a Tool to **Immune** in its **Breakage** tab to exclude it while keeping its Tool-specific mechanic stored for a later authority change.

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
