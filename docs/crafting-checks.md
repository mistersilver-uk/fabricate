---
layout: default
title: Crafting Checks
nav_order: 3.1
---

# Crafting Checks

Crafting checks let you gate recipe outcomes on a player roll.

When a crafting system uses the Routed by check resolution mode, or the Progressive resolution mode, a check is required to determine which result the crafter receives.
The check is configured at the system level on the **Crafting** page of the **Checks** screen in the Crafting Admin panel.
That page's shape follows the system's resolution mode: simple and Routed by ingredients author a pass or fail check, Routed by check authors named outcome tiers, and progressive rolls for a numeric value.
Alchemy follows its own Alchemy check setting: No check has nothing to author, Simple check authors a pass or fail check, and Tiered check authors named outcome tiers.
The pass or fail check is optional in simple and Routed by ingredients modes.
In Alchemy mode a check is required whenever the Alchemy check is Simple or Tiered, and there is no check when it is No check.
The outcome-tier check is required in Routed by check mode.
Each attempt runs the check automatically, before any materials are consumed.

## The Checks screen

**Checks** in the Crafting Admin panel's left rail opens into one page per activity.
Select **Checks** to expand it, then choose **Crafting**, **Salvage**, **Gathering**, or **Validation**.
Salvage and Gathering appear only while those features are switched on for the system.

Each activity page is a single editor divided into five sections, which you move between along the strip across the top of the page.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Section | What it holds |
|:--------|:--------------|
| **The roll** | The formula that is rolled, and the difficulty it is measured against. |
| **Outcomes** | What each result of the roll produces. On a routed check that is the outcome tiers, on a simple check the two pass or fail outcomes, and on a progressive check the award mode. |
| **Triggers** | Conditions that override what the roll would otherwise produce. |
| **Modifiers** | Which of the system's named modifiers this check adds to the roll, and how they combine. |
| **On failure** | What a failed check costs the character. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

A section that cannot apply in the current resolution mode says so in place of its controls, rather than disappearing.
When an optional check is switched off, the page collapses to a single section offering **Turn this check on**.

### Issue counts and unsaved edits

Fabricate checks each activity page as you edit it.
A section with something to fix carries a dot on the strip, and the same issue is counted on that activity's entry in the rail.
Open that section and it states each of its own issues in full, in the same words the **Validation** page uses, so a dot never leaves you to go looking for what it meant.
The **Checks** entry itself totals the counts of the activity pages it is showing you, so a hidden feature's stale issues never badge a page you cannot open to clear them.
**Validation** restates that same total, so it is never added on top of it.

Those counts and dots read your **unsaved** edits, so you can see what an edit would fix before committing to it.
Enabling a crafting system reads what is saved instead, so save the checks before enabling the system.
The **Validation** page says so in as many words when your edits are clean but not yet saved.

One **Save checks** button saves every activity you edited, not only the one you are looking at.
Your edits survive moving between the four Checks pages.
Leaving Checks for another screen with unsaved edits asks first, names which activities are affected, and offers to save them, discard them, or stay where you are.

### The Validation page

**Validation** gathers every issue across the crafting, salvage, and gathering checks into one list, grouped by activity and rated **Pass**, **Warning**, or **Blocks enable**.
Selecting an issue takes you to the page and section that raised it.
A blocking issue never stops you saving, only enabling the system.

### The panel beside the page

The panel to the right of each activity page carries links to this documentation and to the quickstart, the check's on or off switch, and a **This check** summary of its formula, outcome tiers, triggers, and applied modifiers.
It also carries **Preview as**, **Outcome preview**, and **Chance per outcome**.
Those three are planned and not yet available, so each states what it will do and offers no controls yet.

## Dynamic DC macros

A GM can have a Macro calculate the difficulty for each crafting attempt.
On **Checks › Crafting**, open **The roll** section, find the **Difficulty** card and choose **Dynamic** under **DC source**.
Then drag the Script Macro you want to use into the **DC macro** area below it.
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

This interactive prompt is the default when you craft from the Crafting tab, salvage from the Salvage tab, or gather from the Gathering screen.
It applies to the crafting, salvage, and gathering checks that run through the shared check step.
A bulk salvage prompts once for the whole batch, and applies that one answer to every roll in it.
That one prompt sets the bonus, the roll mode and advantage only.
See [Salvage]({% link salvage.md %}) for the batch behaviour.
Some rolls never prompt:

- The immediate d100 gathering mode rolls without a prompt, because it resolves outside the shared check step.
- Timed and maturation crafting steps, and timed gathering tasks, do not prompt, because they resolve later when the Game Master advances world time.
- A batch with nothing in it to roll skips the prompt entirely.

Macros and automation that call Fabricate directly keep the original silent behaviour and never prompt.

## Check modifiers

A crafting check can add in named modifiers read from the crafter — a Medicine bonus, a Herbalism kit — without you writing anything into the roll formula.
Fabricate adds the eligible modifiers to the roll itself, each labelled so the chat card shows where the numbers came from.
The ones that work out to a plain number are summed into one term, so a roll of `1d20 + 2` with a `+3` modifier is rolled and reported as `1d20 + 2 + 3[Modifiers]`.
Each modifier that rolls dice is added as its own term beside it, so its dice stay attributable to it.
A `+3` modifier and a `1d4` one together give `1d20 + 2 + 3[Modifiers] + (1d4)[Modifiers]`.
The modifiers themselves live in **one library per crafting system**, on the **Modifiers** card of the system's **System settings** page.
The **Modifiers** section of each Checks page then decides which of them that activity applies and how they combine.
Its **Named modifiers** card lists the library and carries the switch that marks an entry eligible.
Its **How they combine** card carries the combination rule and the pick limit.
Every decision in that section is a system-level one.
A recipe never overrides it.
The most a recipe can do is pick which modifiers apply, and only when the system's combination rule asks it to.
The section renders in every resolution mode, whether or not the system's active check can use the library yet.
When it cannot, the section explains why instead of hiding, so a modifier you authored is never silently doing nothing with no indication.
Check modifiers are **not** a crafting-only feature.
Crafting, Salvage and Gathering select over the same library, each with its own rule, its own default set and its own pick cap.
See [One library, three activities](#one-library-three-activities).
**No Checks page edits an entry**, Crafting included.
Each shows the library read-only and links to System settings › Modifiers.

Because an eligible modifier never appears in the formula you type, **The roll** section restates it for you.
Under the formula field, **What actually gets rolled** shows the same formula with each applied modifier beside it and names the rule that combines them.

### Defining modifiers

Open **System settings** for the crafting system and find the **Modifiers** card, then choose **Add modifier**.
Each entry has an **Icon**, a **Label** such as Medicine or Herbalism, and an **Expression**.
Write a character-data path with its leading `@` — for example `@abilities.med.mod` — because the field supplies nothing for you.
A number or a dice expression takes no `@` at all: write `2` or `1d4` as they stand, and `@abilities.med.mod + 1d4` mixes the two.
There is nothing to add to the roll formula: an entry that is eligible applies automatically.

This is the same library gathering drop rows and events reference for their d100 chances, so a modifier is defined once and used wherever it makes sense.
The two READ it differently — a drop row works the expression out and shifts the chance by the result, while a check adds it to the roll — but **an expression that rolls dice is welcome in both**.
A check appends the dice to its own roll formula, so a `1d4` modifier is rolled once together with the check, animates like any other die, and shows on the chat card.

Two consequences are worth knowing.

- **A modifier's minimum and maximum clamp the RESULT of its roll, not the formula.**
A `1d8` capped at `+6` contributes 6 on a roll of 7 and 3 on a roll of 3, and the die still shows.
- **Where modifiers compete, they are ranked by their AVERAGE.**
Under **Highest**, and under **Player picks** when nothing prompts, `1d4` is worth 2.5 and beats a flat `+2` — the same winner every time, with no hidden roll to decide it — and the winner is then added as dice.

### Upgrading from a version before 1.21.0

Check modifiers used to reach the roll only if you ALSO typed a Fabricate-specific placeholder, `@craftingmod`, into the check's roll formula.
That placeholder is retired.
On first load after upgrading, Fabricate removes it from every stored crafting, salvage and gathering roll formula, and posts a one-time notice to the GM naming the systems it changed.
It is named here because Fabricate names it on screen too, in the message it shows against any formula still carrying it.

Three things are worth knowing before you upgrade.

- **A library you authored but never referenced now applies.** If you built one and deliberately never spent the placeholder, those modifiers were doing nothing and now add to every crafting roll.
To keep the previous total, switch every entry off on that system, or choose a combination rule whose set resolves to 0.
- **A formula that SUBTRACTED the placeholder now adds it.** A check written as `1d20 - @craftingmod` rolled `1d20 - 3` with a `+3` modifier.
It now rolls `1d20 + 3[Modifiers]`.
A formula that spent the placeholder twice counted it twice and now counts it once.
- **A placeholder Fabricate cannot lift out of the formula is left alone and reported.** The modifier is now added at the end of the roll, so the placeholder can only be removed where the end of the formula is the same answer as the spot you put it in.
That is true of `1d20 + @craftingmod` and not of much else.
It is not true of a placeholder inside a multiplication, a function argument such as `max(...)`, a dice count, or any brackets at all, nor of one written with two signs in front of it or left with a dangling operator behind it.
In every one of those cases Fabricate leaves the formula exactly as you authored it, names the system in the upgrade notice, and treats that check as having no roll formula until you rewrite it.
Fabricate's Checks **Validation** page flags any formula still containing the retired placeholder, and says which of the two happened, so a placeholder typed after the upgrade is never removed silently.

Downgrading back to 1.20.0 loses no data — your formulas and libraries are intact — but that version resolves check modifiers only through the placeholder it no longer finds, so they stop contributing until you type it back in by hand.

### Where the modifier library moved

The library used to belong to the crafting check, which made it crafting's alone.
Upgrading moves it up to the crafting system, so salvage and gathering can select over the same entries.
Upgrading again merges it with the gathering character-modifier library, so a system now carries one **Modifiers** library serving checks, drop rows, events and stamina costs alike.
Both moves are automatic and need nothing from you.
Where a gathering modifier shared an id with a check modifier, Fabricate keeps both, renames the gathering one, repoints every reference to it, and tells you which systems were affected so you can review the names.

**Downgrading past either move loses the library**, and this one is worth reading twice.
An older version does not know where the library now lives, so it drops it on first read.
Every check modifier stops contributing to every roll, and after the merge every gathering drop row, event and stamina cost loses the entry it referenced, until you author them again.
Export the system first if you intend to move a world back.

### When check modifiers do nothing

The library only changes a roll when the activity's active check rolls a formula a modifier can be added to.
When it cannot, and the library holds at least one entry, the **Modifiers** section keeps its controls and adds a notice naming which of these applies:

- The current resolution mode rolls no check at all, so there is nothing for a modifier to add to.
- The active check would roll a formula, but none is authored yet.
- The mode does roll a check, but that roll cannot take check modifiers yet.

The first two are fixed on the check itself.
Change the resolution mode to one that rolls a check, or author a roll formula for the mode you are on.

The third is gathering's d100 mode, and only gathering's d100 mode.
The d100 rolled against each drop's chance is that mode's check, so the mode does roll.
What it has no room for yet is a modifier added to that roll, so the notice states the reason rather than pointing you at a setting that would not help.

### Combination rule

The **Combination rule** setting on the **How they combine** card decides how the eligible modifiers combine into what is added to the roll.
It also decides **who chooses them, and when**.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Combination rule | Who chooses | What it does | When you would want it |
|:-----------------|:------------|:-------------|:------------------------|
| **Add all** | Nobody. The system's default set applies as it stands. | Sums every modifier in the default set. | The recipe rewards stacking every relevant skill or tool bonus at once. |
| **Highest** | Nobody. The system's default set applies as it stands. | Adds only the single best modifier in the default set. Best means highest on average, so a `1d4` beats a flat `+2`, and a winner that rolls dice is added as dice. It is not a keep-highest dice roll across the set. | Several skills can substitute for each other, and only the best should count. |
| **By recipe** / **By component** / **By gathering task** | You do, per record, on that record's own editor. | Sums the modifiers that record picked. | Different recipes (or components, or gathering tasks) in one system draw on different skills, and you want to decide that once, while authoring the record. |
| **Player picks** | The player does, at roll time. | Sums the modifiers the player picked. | You want the player to decide, in the moment, which of their skills they are relying on for that attempt. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

The combination rule is always the system's.
Neither a recipe nor a player can change it, and neither can pick modifiers under a rule that does not ask them to.
Choosing the by-record rule or **Player picks** hands out the *selection*, never the rule.

Each of the three activities — Crafting, Salvage and Gathering — carries its **own** combination rule, default set and pick cap, over **one shared library**.
The library is authored once, in System settings › Modifiers.
All three **Modifiers** sections show the same entries read-only and let you decide which of them apply there and how they combine.
The by-record rule is one rule with three labels: it reads **By recipe** on Crafting, **By component** on Salvage and **By gathering task** on Gathering, because the record doing the picking is different on each.

### The default eligible set

There is no separate "Default modifiers" picker: each library entry carries its own switch, on its own row, and the entries you switch on ARE the activity's default set.
The switch's word changes with the combination rule, because the rule is what "on" means, and its off word answers it:

- Under **Add all** an entry reads **Applied** or **Not applied** — the set that applies, to every attempt in the system.
- Under **Highest** it reads **Considered** or **Not considered** — the entries compared, of which only the largest is added.
- Under **Player picks** it reads **Selectable** or **Not selectable** — the menu the player chooses from at roll time.
- Under the by-record rule it reads **Selectable** or **Not selectable** as well, because both rules mark the entries someone else may choose from.
Here that someone is the record, choosing on its own editor, and the entries you mark are also what a record uses until it picks its own.

A sentence above the entries states which reading is in force, and it changes the moment you change the rule.

### Least and most a modifier may add

Each library entry may carry a **Minimum** and a **Maximum**, in System settings › Modifiers where the library is authored.
They clamp what **that one modifier** contributes, after its expression is worked out and before the modifiers are combined — so a maximum of `+5` caps that entry at `+5` whether the rule sums the eligible set or takes the largest of it.

**Leave either field empty for no bound on that side.**
An empty field is a real setting, not an unanswered question, exactly as **Maximum picks** is; a bound of `0` is a real bound and is kept.

If you set a minimum **above** the maximum, that modifier contributes **nothing at all** until you fix the two values, and the **Validation** page of Checks reports it as a blocking issue.
Fabricate deliberately does not quietly swap them round: that would roll a number you never asked for.

A bound that is too large or too small to appear in a dice formula — anything Foundry would have to write in exponent notation, such as `1e21` — is blocked the same way, with its own message, and the row says so where you typed it.
Only that entry is refused; the other modifiers on the roll are unaffected.

### One library, three activities

Crafting, Salvage and Gathering all select over the same library.
Each **Named modifiers** card shows every entry read-only — its name, its expression and a bounds chip such as `-1 to +6` — with a link to System settings › Modifiers to edit them.
What each activity *does* own is fully editable there: which entries apply, how they combine, and the pick cap.

**Gathering is not switched on yet.**
Progressive and routed gathering are not available yet, and while d100 resolution does roll a check — the d100 against each drop's chance — that roll cannot take check modifiers yet.
So nothing you set on the Gathering check's modifiers applies to a roll today.
The card says so.
Anything you set is saved and starts applying when those gathering modes ship.

A gathering **check** modifier and a gathering **character** modifier now come from the same library, but they are applied differently and one does not stand in for the other.
A character modifier is attached to a drop row or an event and shifts that drop's percentage chance in d100 gathering; a check modifier is selected here and adds to a rolled formula in progressive and routed gathering.
Neither applies where the other does.

### Maximum picks

Under the by-record rule and **Player picks**, the **Maximum picks** field caps how many modifiers the chooser may take.
It appears only under those two rules, because the other two have nobody to cap.

**Leave it empty for no limit.**
An empty field is a real setting, not an unanswered question: it means the recipe author, or the player, may take every eligible modifier.
Set it to **1** to get a single pick, which is the classic "choose one skill" behaviour.

Whichever rule is in force, the picks are **summed**.
A cap of 1 therefore behaves exactly like picking one modifier and using its value alone.

Lowering the cap never deletes a recipe's picks.
A recipe that already picked more modifiers than the new cap allows keeps all of them stored, and rolls only the first few, up to the cap.
Raise the cap again and the rest count once more, with nothing to re-enter.

{: .note }
> **If you are upgrading an existing world:** systems already set to **Player picks** are given a **Maximum picks** of **1**, which is the single pick that rule always meant, so nothing about them changes.
> Systems on the other three rules are left with no limit.
> Systems previously set to the by-record rule keep every modifier their recipes had picked.

### Picking per record

Under the by-record rule, each recipe's **Overview** tab gains an **Eligible modifiers** control with three choices:

- **Inherit system default** uses the entries the system has switched on.
This is what a recipe does until you change it, and the tab names the set it is inheriting.
- **Custom set** lets the recipe pick its own modifiers, up to **Maximum picks**.
It starts from whatever the recipe was already using, so customising begins from the inherited set rather than from nothing.
- **No modifiers** means exactly that: nothing is added to that recipe's check roll.
It is a deliberate choice, distinct from inheriting an empty set.

The picks are summed at roll time, and nothing is asked of the player.

**If a recipe's Eligible modifiers control is not on its Overview tab**, this section is almost always why.
The control appears only when the system's combination rule is **By recipe** and the system has at least one entry in its Modifiers library.
Salvage and Gathering have the same control on the component editor's Salvage section and in the gathering task editor, under their own activity's rule.
Under **Add all**, **Highest**, or **Player picks** the recipe has nothing to choose, so the tab shows nothing at all rather than a control the system would ignore.
Open **Checks › Crafting** for that recipe's system and look at the **Combination rule** on the **Modifiers** section.
If the rule is already **By recipe** and the control is still missing, the recipe's Overview tab shows a banner in its place naming which of the causes in [When check modifiers do nothing](#when-check-modifiers-do-nothing) applies.

Switching the system away from the by-record rule does not delete anything a record picked.
The picks stay stored and simply stop being consulted; switch back and they apply again immediately.

### Player picks

**Player picks** is the only combination rule that is not decided until the dice are about to be rolled.
It only prompts the player when all of the following are true for that attempt: the roll happens through the interactive dialog described above, the active check has a roll formula, the system's combination rule is **Player picks**, and at least two modifiers are eligible.
When any of those is not true, for example a system with only one eligible modifier, or a Macro rolling the check directly, the check resolves without a prompt to the best selection the player could legally have made.
A bulk salvage is one of those cases.
Its single batch prompt never asks for modifiers, so every roll in the batch applies that same best selection.

**Crafting and salvage prompt, and gathering does not yet.**
A gathering check under **Player picks** still applies the best selection the player could legally have made, and gains its prompt when progressive and routed gathering ship.

When the player is prompted, the roll dialog adds a **Check modifier** choice below the formula, listing each eligible modifier by icon and label.
A modifier that works out to a plain number shows that number.
A modifier that rolls dice shows the dice it will roll instead, bounds included, because the average it was ranked by is not a number the roll can produce.
With a **Maximum picks** of 1 it is a one-of list.
Above 1 it is a tick list whose heading says how many may be ticked, and further ticks are refused once the cap is reached.
The best allowed selection is pre-chosen — the highest-averaging modifiers the cap permits — so a player who just clicks **Roll** without changing anything gets the same result an unprompted craft would have produced.
Because the chosen value is not known until the player picks it, the formula preview ends in a neutral `+ (modifier)[Modifiers]` term instead of a number, until the player confirms.
The chat card names the modifiers that were picked.

## How a routed check is rolled

In a Routed by check system, the crafting check rolls its configured expression at the moment of crafting and maps the total onto one of the outcome tiers you defined.
That tier's name is the outcome that selects the result set, after any [tier step](#tier-stepping) a matching trigger applies.
See [Routed Modes]({% link recipes/routed.md %}) for how that outcome is matched to a result.

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
See [Minimum success tier for fixed routed checks]({% link recipes/routed.md %}#minimum-success-tier-for-fixed-routed-checks).

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
Two toggles on the **On failure** section of **Checks › Crafting** set this policy for the whole system.

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

---

## See Also

- [Crafting Systems]({% link crafting-systems.md %}).
Configure resolution mode, feature toggles, and system-level settings.
- [Salvage]({% link salvage.md %}).
Configure salvage checks, which use a separate check to gate salvage outcomes.
- [Recipes]({% link recipes/index.md %}).
Understand the Routed by check and Progressive resolution modes that require a crafting check.
