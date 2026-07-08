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
If the combination matches a recipe, the craft succeeds.
If it does not match, the items may be silently consumed.

Use alchemy mode for systems where recipes are secrets, such as a witch's grimoire, an alchemist's bench, or any scenario where players are meant to experiment rather than follow a known formula.

---

## Current State

Alchemy recipes and systems are authored mainly through the API today.
An early GM recipe editor in the Crafting Admin panel can edit a recipe's identity and link a recipe item, but full recipe authoring is still in progress.
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
4. If a matching recipe is found, the normal crafting flow runs (ingredients consumed, results created).
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
- If every group in an ingredient set is satisfied, the recipe is a match and crafting proceeds using that ingredient set.
- Recipes are checked in order, and the first match is used.

{: .note }
> A submitted item still matches a component even if the item it was copied from has since changed, as long as Fabricate can trace it back to that component.

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

When the system's Learn on Craft setting is on, a player who successfully discovers a recipe has that recipe marked as learned for their character.
That learned state can be read to show discovered recipes and help players reproduce known combinations.

| Learn on Craft | Behaviour on success |
|:---------------------|:---------------------|
| Off (default) | Every attempt is anonymous, players never see recipe names |
| On | Discovered recipes are remembered for the character and can be surfaced in future sessions |

This setting also lives under the system's Alchemy options.
See the [System Manager API reference]({% link api/system-manager.md %}) for the API that updates a system.

---

## The Alchemy Workbench

The Alchemy Workbench is where players experiment with alchemy.
It is a tab in the Fabricate window, alongside Crafting, Gathering, and the other player tabs.
Open the Fabricate window, choose the Alchemy tab, then pick a character you own in the actor-selection bar at the top.

The workbench has three columns.

- **Known recipes** on the left lists every recipe this character has discovered, with the ingredients and result for each.
- **Workbench** in the middle is the bench where you place components and brew them.
- **Your components** on the right lists the alchemy components this character is carrying.

On a narrow window the three columns stack, with the workbench on top.

### Choosing a discipline

Each alchemy crafting system is presented to players as a **discipline**.

When only one alchemy discipline is set up, the workbench opens straight into it.
When more than one exists, Fabricate first shows a **Choose a discipline** screen with a card for each one.
Each card shows the discipline's name and how many of its recipes you have discovered out of the total that exist.
Choose a card and select **Enter** to open that discipline's workbench.

Once you are in a discipline, a **Switch discipline** button lets you return to the chooser and pick another.
Switching clears the bench and your current selection, and everything on screen then refers to the new discipline.
The workbench remembers the last discipline you used on this device.

### Learning recipes

A character learns alchemy recipes in two ways.

- **By experimentation.** Combine components on the bench and brew them.
If the combination matches a recipe, that recipe is discovered and added to your Known recipes list.
- **By reading books and scrolls.** Some recipes are taught by an in-world item, such as a recipe book or a scroll.
Learn these from the **Inventory** tab, and they appear in your Known recipes list too.
See [Recipe Discovery]({% link how-to/recipe-discovery.md %}) for how books and scrolls are set up and learned.

Until a character has discovered a recipe, the Known recipes list shows an encouraging empty state that invites them to experiment on the bench.

Below the list, a count tells you how many recipes in this discipline are still undiscovered.
You are never shown the names, ingredients, or results of a recipe you have not discovered.
That count is the only hint that there is more to find.

### Building a combination

Add a component to the bench by tapping it in Your components, or by dragging it onto the bench.
Each component in Your components shows how many are available, which is how many you are carrying minus how many you have already placed.
Placing a component reduces the available count, and a component with none available cannot be added.

Remove a placed component with its remove control, or by right-clicking it.
**Clear** empties the bench in one step.

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

- If the combination matches a recipe, that recipe is crafted.
Its ingredients are consumed, its results are created, and a newly discovered recipe is added to your Known recipes list.
- If the combination matches nothing, the attempt fizzles.
Whether the components are consumed then depends on the system's [Consume on Fail](#consume-on-fail) setting.

When the alchemy system uses a crafting check, brewing a matching recipe prompts you to roll, the same way a check works elsewhere in Fabricate.
A combination that fizzles never runs a check, so there is no roll when an untried mix turns out to make nothing.

A banner confirms the outcome after each brew, telling you whether you discovered a recipe, brewed a known one, or the mixture fizzled.

---

## Setting Up an Alchemy System

To set up an alchemy system, create a crafting system with its resolution mode set to Alchemy, add the managed components that act as ingredients, then author recipes whose ingredient sets define the hidden combinations players must discover by experiment and whose result groups define what is produced on a successful match.
Enable each recipe, because disabled recipes are never matched.
The system's Alchemy options carry the Consume on Fail and Learn on Craft settings.
Recipes and systems can be authored through the API only.
See the [System Manager API reference]({% link api/system-manager.md %}) and the [Recipe Manager API reference]({% link api/recipe-manager.md %}) for the methods that create and configure systems and recipes.

{: .warning }
> Changing the resolution mode on an existing system that has recipes will delete those recipes, because their configuration may be incompatible with the new mode.

---

## Visibility Rules

In alchemy mode, recipe visibility follows special rules no matter how the system's recipe list visibility is set:

| Viewer | Visibility result |
|:-------|:---------------------------------------|
| GM | All recipes visible (for authoring and checking your work) |
| Player, when Learn on Craft is off | No recipes visible |
| Player, when Learn on Craft is on and the recipe has not been discovered | Recipe not visible |
| Player, when Learn on Craft is on and the recipe was discovered earlier | Recipe visible |

---

## See Also

- [Simple Mode]({% link recipes/simple.md %}): standard A + B = C crafting without hidden combinations
- [Visibility & Knowledge]({% link visibility.md %}): the full recipe knowledge system (learning recipes by owning an item or by learning them directly)
- [Crafting Systems]({% link crafting-systems.md %}): all system-level settings and feature toggles
