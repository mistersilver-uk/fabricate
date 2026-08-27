---
layout: default
title: Crafting
parent: Checks
nav_order: 1
---


# Crafting Checks

Crafting checks let you gate recipe outcomes on a player roll.

When a crafting system uses the Routed by check resolution mode, or the Progressive resolution mode, a check is required to determine which result the crafter receives.
The check is configured at the system level on the **Crafting** page of the **Checks** screen in the Crafting Admin panel.
That page's shape follows the system's resolution mode: simple and Routed by ingredients author a pass or fail check, Routed by check authors named outcome tiers, and progressive rolls for a numeric value.
Alchemy follows its own Alchemy check setting: Simple check authors a pass or fail check, and Tiered check authors named outcome tiers.
The pass or fail check is optional in simple and Routed by ingredients modes.
It is optional in Alchemy mode too: a Simple alchemy check has an Active switch you can turn off, which resolves every matched brew as a success.
A Tiered alchemy check is required, because it routes result sets by outcome tier and so cannot resolve without a roll.
The outcome-tier check is required in Routed by check mode.
Each attempt runs the check automatically, before any materials are consumed.

## Dynamic DC macros

A GM can have a Macro calculate the difficulty for each crafting attempt.
On **Checks › Crafting**, open **The roll** section, find the **Difficulty** card and choose **Dynamic** under **DC source**.
Then drag the Script Macro you want to use into the **DC macro** area below it.
The macro calculates only the DC.
It does not roll the check or choose the crafting result.
If no Macro is linked, the Macro fails, or it cannot provide a usable number, Fabricate falls back to the recipe's chosen difficulty tier when it has one, and to the configured static DC when it does not.
See the [Dynamic DC Macro API example]({% link api/crafting-engine.md %}#dynamic-dc-macro) for the supported inputs and a working Script Macro.

## Rolling a check from the UI

When a player crafts or gathers from the Fabricate UI, the check is rolled interactively.
Fabricate opens a small dialog that shows the check, its difficulty, and the formula about to be rolled.
The dialog has a **Roll** button, a **Cancel** button, and a **Situational bonus** field for a one-off modifier.
Type a number into **Situational bonus** to add it to this roll, for example a bonus from a spell or a helping hand.
Leave the field blank to roll the check as configured.
An entry that is not a valid modifier is ignored, and the check rolls with its base formula.

{% include screenshot.html case="player-crafting-roll-prompt" caption="The roll prompt for a crafting check that offers modifiers to pick." %}

Clicking **Roll** evaluates the check and posts the result to chat as a normal roll card.
The roll uses your current chat roll mode, so a private or blind roll stays hidden from other players in the usual way.
If the [Dice So Nice](https://foundryvtt.com/packages/dice-so-nice) module is installed, it animates the 3D dice for that roll.
Dice So Nice is optional.
Without it the roll still posts to chat as a normal roll card, just with no 3D animation.

The Crafting tab also reports the outcome in place, so a player can see what the attempt produced without leaving the window.

{% include screenshot.html case="player-crafting-roll-result" %}

Clicking **Cancel**, or dismissing the dialog, aborts the attempt with no changes.
No ingredients, currency, or Tools are consumed, and no run is recorded.

This interactive prompt is the default when you craft from the Crafting tab, salvage from the Salvage tab, or gather from the Gathering screen.
It applies to the crafting, salvage, and gathering checks that run through the shared check step.
A bulk salvage prompts once for the whole batch, and applies that one answer to every roll in it.
That one prompt sets the bonus, the roll mode and advantage only.
See [Salvage]({% link components/salvage.md %}) for the batch behaviour.
Some rolls never prompt:

- The immediate d100 gathering mode rolls without a prompt, because it resolves outside the shared check step.
- Timed and maturation crafting steps, and timed gathering tasks, do not prompt, because they resolve later when the Game Master advances world time.
- A batch with nothing in it to roll skips the prompt entirely.

Macros and automation that call Fabricate directly keep the original silent behaviour and never prompt.

## How a routed check is rolled

In a Routed by check system, the crafting check rolls its configured expression at the moment of crafting and maps the total onto one of the outcome tiers you defined.
That tier's name is the outcome that selects the result set, after any [tier step](#tier-stepping) a matching trigger applies.
See [Routed Modes]({% link crafting/recipes/routed.md %}) for how that outcome is matched to a result.

In Routed by ingredients mode the crafting check is the same optional pass or fail check that simple mode uses, not an outcome-tier check.
The ingredients used select the result.
The check only gates whether the craft succeeds, and it is optional, so with no roll formula the craft proceeds with no check.

### Relative and fixed tiers

A routed check's outcome tiers are authored as either **Relative** or **Fixed**, chosen with the **Check type** control at the top of the **Outcomes** section.
The two types map the roll to an outcome in different ways.

**Relative** tiers are positioned against a DC.
Each tier threshold is expressed relative to the recipe's difficulty, for example DC -5 or DC +10.
The base difficulty comes from the recipe's selected tier, or from a dynamic difficulty macro when you set one up.
This is the same difficulty source a simple check uses.
The recipe tier or dynamic difficulty shifts every tier threshold together, so a harder recipe makes every outcome harder to reach.
A roll that falls below every relative tier still maps to the lowest tier, so a higher difficulty never produces a craft with no outcome.
The **Difficulty** card shows the **DC** and the meet-or-exceed comparison for relative tiers, because both take part in matching.
The player's check card shows this resolved difficulty-tier DC, the same number the interactive roll prompt uses and the chat card reports.

**Fixed** tiers own non-overlapping segments of the roll value range instead.
Each tier covers a fixed span of possible roll totals, and the roll is matched to whichever tier's range contains its total.
A fixed check has no DC, so the recipe tier and dynamic difficulty do not move its thresholds.
That card hides the **DC** and the meet-or-exceed comparison when a Routed by check system uses fixed tiers, because a DC is meaningless in that mode.
The player's check card and the interactive roll prompt likewise drop the DC chip for a fixed routed check.

Fixed tiers are shared across every recipe in the system.
A recipe can still carry its own difficulty on top of a fixed check by setting a minimum success tier.
See [Minimum success tier for fixed routed checks]({% link crafting/recipes/routed.md %}#minimum-success-tier-for-fixed-routed-checks).

Developers configuring a custom check for a non-D&D-5e system should refer to the API reference for the expected setup.

### Outcome bands

The **Outcomes** section draws the tiers as one continuous **Outcome bands** strip above the tier rows, with a handle on each transition point between two neighbouring tiers.
Drag a handle, or focus it and use the arrow keys, to move that threshold.
The numbers in the tier rows remain the authority, and the strip and the rows edit the same values.

A handle can never be dragged past its neighbour, so moving one narrows a tier and never reorders your tiers.
The outermost values have no handle at all, because they are not transitions between two tiers.
The bottom of the first tier and the top of the last are set in the rows.
On a relative check the handles read the difficulty numbers the offsets resolve to, while the rows read the offsets you authored.
**Preview against**, above the strip, chooses which difficulty they resolve against.
It offers the check's own DC, which is the default, and each named difficulty tier the check carries, each labelled with its DC.
It appears only once the check has at least one tier to offer, and it is a reading aid alone.
Choosing one re-labels the strip and changes nothing you have authored.

Fixed tiers must not overlap, and must leave no value between the lowest and the highest belonging to no tier.
Either fault makes the tiers impossible to draw as one strip, so the strip steps aside with a note and leaves the rows to edit.
The **Validation** page reports both as blocking issues, because a roll landing in a gap matches no tier and the attempt cannot be routed.

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
The trigger shows the missing tier and the Checks **Validation** page warns you about it, so pick one of the check's current tiers to fix it.

A trigger's condition always looks at the tier the dice landed on, never at the tier a step produced.
That means an outcome-tier condition can drive a step, and steps can never chain into each other.

A trigger that forces the outcome still decides success or failure.
A step then moves the tier only among the tiers that share that result: a forced success stays on a successful tier and a forced failure stays on a failing one.
So a step can never turn an **Automatic success** into a failed craft, and the tier name a player sees always agrees with the result they got.
Where no outcome is forced, the tier after stepping decides everything — whether the craft succeeds, which result set it produces, and whether tools break — so a step down onto a failing tier does fail the craft.

A recipe's minimum success tier on a Fixed check is judged after stepping.
A step down can therefore push a craft below the recipe's minimum, and a step up can lift it over.
See [Minimum success tier for fixed routed checks]({% link crafting/recipes/routed.md %}#minimum-success-tier-for-fixed-routed-checks).

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

## On failure

A failed check has two separate questions, and the **On failure** section of each check route asks both.
What does the failure PRODUCE, and what does it COST?
They are independent, so you can author any combination of them.

### Produce a result on a failed check

The **Produce a result on a failed check** card decides whether a failed check can still hand the crafter something — a ruined ingot, a torn hide, scraps.
It has three settings.

- **Never.** A failed check produces nothing at all.
- **Decided per recipe.** Each recipe chooses for itself, so most fail with nothing while a few still yield a failure result.
This is what a system you create now starts on.
- **Always.** Every failed check produces its failure result.

The setting **selects** a failure output you have already authored; it never invents one.
A recipe with no failure result produces nothing on a failure even under **Always**, so switching to **Always** cannot make an existing recipe start handing out items you did not write.

Where you author that output depends on the resolution mode.
In **simple** mode and in Alchemy's **Simple check** mode it is the recipe's reserved failure result set, which the Results tab draws with a danger border.
In **Routed by check** mode it is an outcome tier you have marked as a failure: while this setting permits failure results, those tiers appear in the result set's **Produced on outcome** picker and you bind a result set to them exactly as you would to a success tier.
Turn the setting back to **Never** and they stop being offered and stop routing — but nothing you authored is deleted, and it all comes back when you permit failure results again.

**Routed by ingredients** and **Progressive** have no failure outcome to mark, so the setting is inert in those modes and the section says so rather than showing a control that does nothing.
Salvage and gathering each have their own copy of this setting on their own check route.
Gathering's is inert for now: routed and progressive gathering are still being built.

### What a failure costs

Two toggles on the **On failure** section of **Checks › Crafting** set the consumption half of the policy for the whole system.

- **Consume ingredients on a failed check** is on by default.
The recipe's ingredients are used up even when the crafting check fails.
Turn it off to return the ingredients on a failed check, so a failed attempt costs the crafter nothing.
- **Break tools on a failed check** is off by default.
Turn it on to allow normal Tool breakage evaluation after the crafting check fails.

This consumption policy applies to every failed crafting check in the system, across the simple, Routed by ingredients, Routed by check, and Progressive modes.
It does not appear in Alchemy mode, where a failed brew follows the system's own [Consume on Fail]({% link crafting/recipes/alchemy.md %}#consume-on-fail) setting instead.
Salvage failures follow their own separate policy, so this control does not change what a failed salvage consumes.
The **Checks › Salvage** route's own **On failure** section is where you set it — **Consume the item on a failed check** (on by default) and **Break tools on a failed check** (off by default).
Those two settings have always been part of a salvage system; before this release there was simply no screen that showed them.
See [Salvage]({% link components/salvage.md %}).

### Upgrading from a version before 1.25.0

A system you already have keeps behaving exactly as it did: the upgrade sets **Produce a result on a failed check** to **Never** on every check it finds, on every system.
That is deliberate rather than cautious.
A salvageable item may already carry a failure result set that has never been awarded, because no version of Fabricate before this one could award one — and turning the setting on for you would start handing that loot out on every failed salvage with no warning.
Only systems you create after upgrading start on **Decided per recipe**.
Turn it on yourself, per activity, per system, when you want it.

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

When the source is **Check-driven**, each check's **Triggers** section can include Tool breakage on its triggers.
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

## Success-counting checks

Not every game measures a check as one running total against a difficulty.
Some systems roll a pool of dice and count how many of them individually clear a threshold, then compare that count against a target.
Fabricate can run this style of check today, by adding a counting suffix such as `cs` or `cf` to a die term in the formula field you already use.
This is an advanced topic that draws on nearly every earlier section of this page.

### Counting dice instead of adding them

A formula that carries a `cs` or `cf` suffix on one of its dice totals to the number of qualifying dice, rather than a sum of the dice's faces.
The **Difficulty** card's meet-or-exceed comparison then compares that count against the **DC**, so the check passes once enough dice qualify.
That is exactly the rule a dice-pool system uses.
Meet-or-exceed is already the default comparison, so nothing about that setting needs to change.
Set the **DC** to the number of qualifying dice the formula must produce.
See [Relative and fixed tiers](#relative-and-fixed-tiers), because a fixed routed check has no DC at all, so this reading does not apply there.

### Progressive checks award the count

A progressive check spends the roll's raw total as a budget against the ordered result thresholds you authored, rather than granting that many results outright.
On a counting formula that total is the number of qualifying dice, not a face sum, so it can never exceed the size of the pool.
Converting an existing progressive recipe from an additive formula to a counting one silently rescales it.
A recipe that used to spend somewhere between 2 and 20 from a `2d10` formula can now only spend somewhere between 0 and 2 from a two-die counting pool, and nothing warns you.
Re-author your award thresholds whenever you move a progressive check onto a counting formula.

### Setting the difficulty without a prompt

Named difficulty tiers on the check, together with a per-recipe tier selection, give you per-recipe difficulty with no macro at all.
You author the tiers themselves on the **Crafting** page of the **Checks** screen, where each one carries a name and the DC it puts in place of the base DC.

{% include screenshot.html case="manager-checks-crafting-recipe-tiers" caption="Two named recipe difficulty tiers on a crafting check, each with the DC a recipe picking it is measured against." %}

Where a dynamic DC macro is also in play, the recipe's chosen tier resolves first, and the macro is handed that value as its starting point.
If the macro is missing, throws, or returns something that is not a number, the tier's DC still stands.
The two features compose rather than compete.

On a simple pass/fail check, the per-recipe **Check tier** control is only offered on a recipe's **Overview** tab while that check's **DC source** is **Static**.
Switching a simple check to **Dynamic** removes that control from every recipe's **Overview** tab.
Fabricate still honours a tier a recipe already had chosen, so the composition above is real, not only theoretical.
On a simple check, choose the recipe's difficulty tier while the **DC source** is **Static**.
A tier you already chose keeps setting the starting point the macro adjusts, even after you switch that check to **Dynamic**.
See [Dynamic DC macros](#dynamic-dc-macros).

### Do not add bonuses to a counting check

Tool bonuses, eligible check modifiers, and the roll prompt's **Situational bonus** field each add a separate additive term onto the end of the rolled formula.
On an ordinary formula, that extra term improves the roll.
On a counting formula it adds free qualifying dice to the count instead, which is almost never what you want.
Do not combine bonuses with a counting formula.
Switch off any contributing check modifier entries for that activity, and tell players to leave **Situational bonus** blank when they roll a counting check.
This is a current limitation, not a permanent design choice.
A bulk salvage batch complicates that last piece of advice, because it prompts once and applies that single **Situational bonus** to every roll in the batch, counting formulas included.
Telling players to leave the field blank is not something they can act on there, because the player cannot see which entries in a batch are counting checks and which are not.
See [Check modifiers]({% link checks/index.md %}#check-modifiers) and [Rolling a check from the UI](#rolling-a-check-from-the-ui).

### Writing the qualifying threshold

The qualifying threshold in a counting formula must resolve to a single whole number.
Write either a literal number, or one character-data path on its own.
Fabricate's own formula reader recognises only those two shapes in that position.
A composed expression, such as two paths added together, anything in brackets, or anything containing a space, is not supported there.
For example, a two-die pool that qualifies when each die rolls at or under a character's skill value could use a formula that reads that skill from one character-data path, such as `2d20cs<=@skills.survival.value`.
Notice that this example qualifies by rolling low, so it is also the example that breaks the usual assumption that a higher roll is better.
When your game system does not already expose the number you need as one path, write an Active Effect that computes the value and writes it onto the character.
Your formula then reads that single path, which satisfies the one-path rule.

### When the character is missing the value

{: .note }
> A character-data path the actor does not have is substituted as zero before the roll happens.
> What that zero threshold does to the check depends on which way the comparison reads.
> On a roll-under formula such as the `cs<=` example above, a zero threshold means no die can qualify, so the check fails, and a failed check still consumes whatever the system's failure policy says it consumes.
> On the more common roll-over formula, such as `2d20cs>=@skills.survival.value` becoming `2d20cs>=0`, every die qualifies instead, so the count reaches the full pool size, and the check passes automatically when that pool size meets the authored DC, with no consuming failure to make that visible.
> Nothing blocks the roll from happening either way.
> The roll prompt shows the unresolved threshold as `NaN`, while the roll itself uses zero, so in both directions the prompt is your only warning sign.
> Check the path against the character before you rely on it in a counting formula.
> See [Rolling a check from the UI](#rolling-a-check-from-the-ui).

### Triggers on a counting check

The one-click high and low trigger presets assume the highest face is good and the lowest face is bad.
On a pool that qualifies by rolling low, that assumption is inverted, so author those triggers by hand instead of using a preset.
Be precise about what a preset actually does.
On a routed check, the high and low presets step the outcome tier up or down.
On a pass/fail or progressive check, they force a success or a failure instead.
A legacy check that had **Natural tier stepping** converted to triggers when you upgraded carries a natural-20-steps-up trigger, and that trigger is inverted on a roll-low counting pool for the same reason the presets are.
See [Tier stepping](#tier-stepping) and [Tool breakage triggers](#tool-breakage-triggers).

A roll-total trigger, and a dice-group trigger using its group total measure, both read the count of qualifying dice, not a sum of faces.
A value you wrote for a face sum will never match a counting formula's total.

The per-die measures, any die, all dice, the lowest die, and the highest die, read the individual faces the dice showed.
Fabricate does not promise that a counting suffix leaves every rolled die visible to those measures.
Treat a per-die trigger as unverified on a counting pool, and confirm it with a test roll after you move the check's formula to a counting pool.

### What the previews will tell you

Start with what the panel does when it can work the outcomes out.
The frame below is an ordinary `1d20 + @abilities.int.mod` check on a routed system, and the **Chance per outcome** panel gives each named tier its own percentage for the chosen character.

{% include screenshot.html case="manager-checks-crafting-odds-enumerable" caption="Chance per outcome, on an ordinary formula the panel can enumerate." %}

A counting formula gets none of that.
The odds histogram deliberately abstains from drawing a chart for one, and says on the panel that it has.
That is correct behaviour: the panel refuses rather than showing a chart that would be wrong.
The average reading, and any ranking built from it, are not trustworthy for a counting formula.
Do not use them to compare one check against another.

The roll prompt also withholds advantage and disadvantage on a pure counting formula, and that omission is a reassurance rather than a gap.
Advantage means rolling a second d20 and keeping the higher result, which has no meaning for a pool of dice.
Fabricate offers advantage and disadvantage whenever the authored formula contains a plain, unmodified `1d20` term, and rewrites only that term when you pick one.
A pure counting pool, such as `2d20cs>=15`, has no plain `1d20` term, so the option is withheld.
A formula that mixes a plain `1d20` with a counting pool, such as `1d20 + 2d6cs>=5`, still offers advantage and disadvantage, and the transform touches only the `1d20`.
A bulk salvage batch prompts once and applies that single advantage choice to every roll in it, so a single pure counting-formula entry anywhere in a mixed batch withholds advantage and disadvantage for the whole batch, not only for that entry.
See [Rolling a check from the UI](#rolling-a-check-from-the-ui) for how that batch prompt works.

### What a counting check cannot do

**The pool size is fixed by the formula you typed.**
There is no per-roll choice of how many dice to roll, and a player cannot add dice at the roll prompt.
In a system where spending a meta-currency to enlarge the pool is a core move, you edit the formula by hand between rolls and track that resource at the table yourself.

**Two different weights on one pool cannot be expressed.**
A counting suffix gives every qualifying die the same weight of one.
A die that should count twice under some condition has no way to show that on a counting formula.

---

## See Also

- [Crafting Systems]({% link crafting-systems/index.md %}).
Configure resolution mode, feature toggles, and system-level settings.
- [Salvage]({% link components/salvage.md %}).
Configure salvage checks, which use a separate check to gate salvage outcomes.
- [Recipes]({% link crafting/recipes/index.md %}).
Understand the Routed by check and Progressive resolution modes that require a crafting check.
