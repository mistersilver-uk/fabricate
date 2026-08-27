---
layout: default
title: Checks
nav_order: 10
has_children: true
---

# Checks

**Checks** in the Crafting Admin panel's left rail is where you author the rolls that gate what an activity produces.
Each activity has its own page, and this page covers what they all share: the shape of the editor, and the named-modifier library every one of them selects from.

For an activity's own rules, see [Crafting]({% link checks/crafting.md %}), [Salvage]({% link checks/salvage.md %}), or [Gathering]({% link checks/gathering.md %}).

---

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

{% include screenshot.html case="manager-checks-validation" %}

### The panel beside the page

The panel to the right of each activity page carries links to this documentation and to the quickstart, the check's on or off switch, and a **This check** summary of its formula, outcome tiers, triggers, and applied modifiers.
It also carries **Preview as**, **Outcome preview**, and **Chance per outcome**.
Those three are planned and not yet available, so each states what it will do and offers no controls yet.

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
Each shows the library read-only and links to World › Rules & Resources › Modifiers.

Because an eligible modifier never appears in the formula you type, **The roll** section restates it for you.
Under the formula field, **What actually gets rolled** shows the same formula with each applied modifier beside it and names the rule that combines them.

### Defining modifiers

Open **System settings** for the crafting system and find the **Modifiers** card, then choose **Add modifier**.
Each entry has an **Icon**, a **Label** such as Medicine or Herbalism, and an **Expression**.
Write a character-data path with its leading `@` — for example `@abilities.med.mod` — because the field supplies nothing for you.
A number or a dice expression takes no `@` at all: write `2` or `1d4` as they stand, and `@abilities.med.mod + 1d4` mixes the two.
There is nothing to add to the roll formula: an entry that is eligible applies automatically.

This is the same library gathering drop rows and events reference for their d100 chances, so a modifier is defined once and used wherever it makes sense.

{% include screenshot.html case="manager-checks-crafting-modifiers" %}

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
Upgrading again merges it with the gathering character-modifier library, so one **Modifiers** library serves checks, drop rows, events and stamina costs alike.
Upgrading once more moves that library out of the crafting system entirely, to **World > Rules & Resources > Modifiers**, because a modifier resolves against a character rather than against a crafting system.
Every move is automatic and needs nothing from you.

Where a gathering modifier shared an id with a check modifier, Fabricate keeps both, renames the gathering one, repoints every reference to it, and tells you which systems were affected so you can review the names.

Where two crafting systems had modifiers that shared an id but were **defined differently**, only one definition survives the move to the world library, and Fabricate names them so you can check.
Nothing breaks visibly in that case — the reference still resolves — but it now resolves to the other system's version of the rule.

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
The library is authored once, in World › Rules & Resources › Modifiers.
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

Each library entry may carry a **Minimum** and a **Maximum**, in World › Rules & Resources › Modifiers where the library is authored.
They clamp what **that one modifier** contributes, after its expression is worked out and before the modifiers are combined — so a maximum of `+5` caps that entry at `+5` whether the rule sums the eligible set or takes the largest of it.

**Leave either field empty for no bound on that side.**
An empty field is a real setting, not an unanswered question, exactly as **Maximum picks** is; a bound of `0` is a real bound and is kept.

If you set a minimum **above** the maximum, that modifier contributes **nothing at all** until you fix the two values, and the **Validation** page of Checks reports it as a blocking issue.
Fabricate deliberately does not quietly swap them round: that would roll a number you never asked for.

A bound that is too large or too small to appear in a dice formula — anything Foundry would have to write in exponent notation, such as `1e21` — is blocked the same way, with its own message, and the row says so where you typed it.
Only that entry is refused; the other modifiers on the roll are unaffected.

### One library, three activities

Crafting, Salvage and Gathering all select over the same library.
Each **Named modifiers** card shows every entry read-only — its name, its expression and a bounds chip such as `-1 to +6` — with a link to World › Rules & Resources › Modifiers to edit them.
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
