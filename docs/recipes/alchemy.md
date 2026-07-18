---
layout: default
title: Alchemy Mode
parent: Recipes
nav_order: 5
---

# Alchemy Mode

Alchemy mode turns recipe crafting into a discovery game.
Players cannot see recipe names or ingredient lists up front.
Instead, a player submits a chosen combination of items to be tried.
If the combination matches a recipe, that recipe is brewed.
Depending on the system's Alchemy check setting, a match either succeeds straight away or turns on a crafting roll that decides the outcome.
If it does not match, the items may be silently consumed.

Use alchemy mode for systems where recipes are secrets, such as a witch's grimoire, an alchemist's bench, or any scenario where players are meant to experiment rather than follow a known formula.

---

## Current State

Alchemy recipes and systems are authored mainly through the API today.
The Crafting Admin panel sets the system's Alchemy check and edits a recipe's identity, its result sets, and its linked recipe item, but full recipe authoring is still in progress.
Players craft alchemy from the Alchemy Workbench, a tab in the Fabricate window.
See [The Alchemy Workbench](#the-alchemy-workbench) below.

A submitted combination is a set of items chosen by the player for a crafting character.
Fabricate uses those items to match recipes and to consume the submitted inventory when the system is set up to do so.
See the [Crafting Engine API reference]({% link api/crafting-engine.md %}) for the API used to submit a combination.

---

## How It Works

1. A crafting system is created with its resolution mode set to Alchemy.
2. A player submits a chosen combination of items for their crafting character.
3. Fabricate matches the submitted items against all enabled recipes in the system.
4. If a matching recipe is found, the system's Alchemy check decides the outcome.
   With no check the brew always succeeds and produces the recipe's result set.
   With a check the crafter rolls, and the roll decides which result set is produced.
5. If no recipe matches, the attempt ends.
   Depending on system configuration, the submitted items may or may not be consumed.

---

## How Combinations Are Matched

Fabricate finds a recipe match by comparing the submitted items against the ingredient groups of each recipe in the system.

- Each ingredient group lists one or more options, and each option asks for a component in a required quantity.
- A group is satisfied when the submitted items meet the required quantity of at least one of its options.
- The options in a group are alternatives, so satisfying any single option satisfies the whole group.
- Quantity is counted by how many matching items the player submits, so a stack of three counts as three units.
- An item is recognised whether it is the original world or compendium item, a copy of it, or an item that was duplicated from it.
- An alchemy recipe always has exactly one ingredient set, so each recipe has a single combination to match.
- If every group in that ingredient set is satisfied, the recipe is a match and crafting proceeds.
- Recipes are checked in order, and the first match is used.

{: .note }
> A submitted item still matches a component even if the item it was copied from has since changed, as long as Fabricate can trace it back to that component.

---

## The Alchemy check

The **Alchemy check** setting decides how a matched brew is resolved.
It is a system-wide setting, chosen once under **Recipe resolution** on the system's **Settings** page, and it applies to every recipe in the alchemy system.
There are three choices.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Alchemy check | What happens on a match |
|:--------------|:-------------------------------------------------------------------------------------------------|
| No check | A matched brew always succeeds and produces its single result set. There is no roll. |
| Simple check | A matched brew rolls a pass or fail check. A pass produces the success result set. A fail produces a separate failure result set. |
| Tiered check | A matched brew rolls a check with named outcome tiers. The tier that the roll lands on selects which result set is produced. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

The check applies only to a combination that matches a recipe.
A combination that matches nothing still fizzles without a roll, whatever the Alchemy check setting is.

With **No check**, each alchemy recipe has one result set, and a match always produces it.

With a **Simple check**, each recipe has two result sets, shown in the recipe editor as **On success** and **On a failed check**.
A passed roll produces the success set.
A failed roll produces the failure set.
A failed check is still a genuine outcome, not a fizzle, so the components are consumed and the recipe can still be learned.
The failure set may be left empty, in which case a failed brew consumes the components and produces nothing, but it is still recorded as a failed brew rather than a fizzle.

With a **Tiered check**, each success outcome tier is assigned its own result set, exactly the way [Routed by check]({% link recipes/routed.md %}) recipes work.
A brew that fails the tiered check produces nothing.

When the Alchemy check is Simple or Tiered a crafting check must be configured for the system.
Until one is, brews cannot resolve.
See [Crafting Checks]({% link crafting-checks.md %}) for how the check is authored and rolled.

---

## Consume on Fail

By default, when no recipe matches, Fabricate removes the submitted items from the characters that supplied them.
You can change this with the system's Consume on Fail setting.

| Consume on Fail | Behaviour on no-match |
|:----------------------|:----------------------|
| On (default) | Submitted items are removed from the character's inventory |
| Off | Submitted items are left intact, no items are consumed |

This setting lives under the system's Alchemy options.
See the [System Manager API reference]({% link api/system-manager.md %}) for the API that updates a system.

---

## Learn on Craft

When the system's Learn on Craft setting is on, a player whose combination matches a recipe has that recipe remembered for their character and revealed in their Known recipes list.
A match counts as a discovery whether or not the brew passed its check, so a failed Simple brew still reveals the recipe.
A combination that matches nothing is never a discovery and reveals nothing.

Learn on Craft only controls whether brewing reveals a recipe.
A discipline's visibility setting can also reveal recipes in other ways, such as through a book, a scroll, or a GM grant, and those work whether or not Learn on Craft is on.
See [Visibility Rules](#visibility-rules).

| Learn on Craft | Behaviour on a match |
|:---------------------|:---------------------|
| Off (default) | Brewing a match never reveals the recipe, so it is revealed only by the discipline's other visibility settings |
| On | A matched recipe is remembered for the character and revealed in their Known recipes list |

This setting also lives under the system's Alchemy options.
See the [System Manager API reference]({% link api/system-manager.md %}) for the API that updates a system.

---

## The Alchemy Workbench

The Alchemy Workbench is where players experiment with alchemy.
It is a tab in the Fabricate window, alongside Crafting, Gathering, and the other player tabs.
Open the Fabricate window, choose the Alchemy tab, then pick a character you own in the actor-selection bar at the top.

The workbench has three columns.

- **Known recipes** on the left lists every recipe this discipline has revealed to this character, with the ingredients and result for each.
See [Visibility Rules](#visibility-rules) for what "revealed" means and how a discipline decides it.
- **Workbench** in the middle is the bench where you place components and brew them.
- **Your components** on the right lists the alchemy components this character is carrying, with a search box to filter them by name.

On a narrow window the three columns stack, with the workbench on top.

The discipline's name and its **Switch discipline** button sit above the **Known recipes** heading.

### Pulling components from other characters

By default the workbench only shows the components carried by the character you selected.
A bar above the columns lets you add other characters you own as extra component sources.
Their alchemy components then appear in **Your components** alongside the selected character's, so you can brew with items spread across several characters.

### Choosing a discipline

Each alchemy crafting system is presented to players as a **discipline**.

When only one alchemy discipline is set up, the workbench opens straight into it.
When more than one exists, Fabricate first shows a **Choose a discipline** screen with a card for each one.
Each card shows the discipline's name and how many of its recipes you have discovered out of the total that exist.
Choose a card and select **Enter** to open that discipline's workbench.

Once you are in a discipline, a **Switch discipline** button lets you return to the chooser and pick another.
Switching clears the bench and your current selection, and everything on screen then refers to the new discipline.
The workbench remembers the last discipline you used on this device.

### How recipes appear in your Known list

The **Known recipes** list shows the recipes this discipline has revealed to your character.
A discipline decides what to reveal with its visibility setting, so exactly which recipes appear depends on how the GM set the discipline up.
See [Visibility Rules](#visibility-rules) for what each setting reveals.

The most common ways a recipe is revealed are:

- **By experimentation.** Combine components on the bench and brew them.
When the discipline remembers your brews, a combination that matches a recipe reveals that recipe and adds it to your Known recipes list.
- **By reading books and scrolls.** Some recipes are taught by an in-world item, such as a recipe book or a scroll.
Learn these from the **Inventory** tab, and they appear in your Known recipes list too.
See [Recipe Discovery]({% link how-to/recipe-discovery.md %}) for how books and scrolls are set up and learned.

Revealing a recipe never changes what you can brew.
A revealed recipe is simply one the workbench will name for you and can load onto the bench.
You can always brew any combination, whether or not its recipe has been revealed.

Until a recipe has been revealed to your character, the Known recipes list shows an encouraging empty state that invites you to reveal recipes.

Below the list, a count tells you how many recipes in this discipline are still hidden from you.
You are never shown the names, ingredients, or results of a recipe that has not been revealed to you.
That count is the only hint that there is more to find.

### Building a combination

Add a component to the bench by tapping it in Your components, or by dragging it onto the bench.
A grip handle on each row shows that it can be dragged.
Each component in Your components shows how many are available, which is how many you are carrying minus how many you have already placed.
Placing a component reduces the available count, and a component with none available cannot be added.
A search box above the list filters Your components by name, which helps when a character carries a lot of items.

On the bench, each component appears once with a badge counting how many you have placed.
Tap a bench component to add another of the same.
Remove a single copy with its remove-one control, by right-clicking it, or by pressing Shift while activating it.
Remove every copy of a component at once with its remove-all control.
**Clear** empties the whole bench in one step.

When the discipline uses essences, each component shows its essence icons and amounts, in Your components, on the bench, and in the result preview.
This lets you see what each ingredient contributes and what a recipe will make.

Selecting a recipe in your Known recipes list loads its ingredients onto the bench when the recipe uses a single, fixed set of components, so you can brew a recipe you already know without hunting for its parts.
A recipe that accepts alternative or optional ingredients still shows its full ingredient list for you to assemble by hand.

### Reading the status

As you build a combination, a status message describes what Fabricate can tell you about it.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Status | What it means |
|:------------|:-------------------------------------------------------------------------|
| Empty | Nothing is on the bench yet. Place components to begin. |
| Assembling | The bench is part of a recipe you know. Add the components it still needs. |
| Ready | The bench exactly matches a recipe you know. It is ready to brew. |
| Untried | You have not brewed this exact combination before. Brew it to find out what it does. |
| No reaction | You have brewed this exact combination before and it produced nothing. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

{: .note }
> For recipes that accept alternative or optional ingredients, the status can stay on **Untried** even when your combination would work.
Brewing still checks the combination properly, so you can always brew and see what happens.

### You are never told a combination does nothing until you try it

Alchemy keeps its secrets.
An undiscovered recipe and a combination that truly makes nothing look exactly the same before you brew them.
Both read as **Untried**.
The workbench never hints that a mix is a dead end, and it never hints that an undiscovered recipe is close.

A combination reads **No reaction** only after this character has already brewed that exact combination and seen it fizzle.
Fabricate remembers a character's fizzled combinations so it can tell them apart from combinations they have never tried.
This memory is kept per character, and it is turned on by the GM's **Show attempt history to players** option for the alchemy system.
When that option is off, a combination that makes nothing keeps reading as **Untried** every time, and the workbench never confirms that it is a dead end.

### Brewing

**Brew** submits the components on the bench as an attempt for the selected character.

- If the combination matches a recipe, that recipe is brewed.
Its ingredients are consumed, its results are created, and a newly discovered recipe is added to your Known recipes list.
- If the combination matches nothing, the attempt fizzles.
Whether the components are consumed then depends on the system's [Consume on Fail](#consume-on-fail) setting.

When the system's [Alchemy check](#the-alchemy-check) is Simple or Tiered, brewing a matching recipe prompts you to roll, the same way a check works elsewhere in Fabricate.
The roll decides which result set the brew produces.
A failed Simple check produces the recipe's failure result set instead of its success set, and it still counts as a brew, so the recipe can still be discovered.
A combination that fizzles never runs a check, so there is no roll when an untried mix turns out to make nothing.

A banner confirms the outcome after each brew.
It tells you whether you discovered a recipe, brewed a known one, produced a failure result because the check failed, or the mixture fizzled.

A failed brew is also recorded in the character's Journal history, whether it failed its check or fizzled with no match.
A fizzle is listed there as a generic **Failed alchemy attempt** that never names a recipe, so it cannot reveal a recipe you have not yet discovered.
Players see these history entries only when the system's **Show attempt history to players** option is on.
The GM always sees them.
See [Journal]({% link journal.md %}) for where a character's runs and attempts are listed.

---

## Setting Up an Alchemy System

To set up an alchemy system, create a crafting system with its resolution mode set to Alchemy, then choose the **Alchemy check** under **Recipe resolution** on the system's **Settings** page.
Add the managed components that act as ingredients, then author recipes.
Each recipe has a single ingredient set that defines the hidden combination players must discover by experiment, and one or more result sets that define what is produced.
With a Simple check, each recipe has an **On success** result set and a separate **On a failed check** result set.
Fill the failure set when you want a failed brew to produce something, or leave it empty to have a failed brew produce nothing.
Enable each recipe, because disabled recipes are never matched.
The system's Alchemy options carry the Consume on Fail and Learn on Craft settings.
See the [System Manager API reference]({% link api/system-manager.md %}) and the [Recipe Manager API reference]({% link api/recipe-manager.md %}) for the methods that create and configure systems and recipes.

{: .warning }
> Changing the resolution mode on an existing system that has recipes will delete those recipes, because their configuration may be incompatible with the new mode.

---

## Visibility Rules

Alchemy visibility works differently from the other crafting modes.
In other modes a system's visibility setting decides which recipes a player can craft.
In alchemy it only decides which recipes are revealed in the Known recipes list.
Brewing is never gated by visibility.
A player can always brew any combination, and a matched combination always brews its recipe, whether or not that recipe has been revealed to the player.

The GM chooses how recipes are revealed with the discipline's visibility setting, on the system's visibility settings page.
For an alchemy system the setting offers these choices:

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Setting | What reveals a recipe to a player |
|:--------|:----------------------------------|
| Global | Brewing a match reveals that recipe. This is the discovery game, so it relies on Learn on Craft being on. |
| Item | A recipe is revealed while the character, or one of their component sources, holds its linked book or scroll. Put the book away and the recipe is hidden again. |
| Knowledge | A recipe is revealed once the character learns it from a book or scroll on the Inventory tab, and it stays revealed afterwards. |
| Manual (GM-granted access) | The GM reveals recipes to chosen characters or players on the Access tab. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

A GM always sees every recipe, for authoring and for checking their work.

Whatever the setting, brewing a match also reveals that recipe when Learn on Craft is on, so experimentation adds to the Known list in every mode.
Recipes that have not been revealed to a player are never named for them, and only their count is shown.

---

## See Also

- [Simple Mode]({% link recipes/simple.md %}): standard A + B = C crafting without hidden combinations
- [Visibility & Knowledge]({% link visibility.md %}): the full recipe knowledge system (learning recipes by owning an item or by learning them directly)
- [Crafting Systems]({% link crafting-systems.md %}): all system-level settings and feature toggles
