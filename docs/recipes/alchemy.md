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

Alchemy recipes and systems can be authored through the API only today.
There is no GM recipe-editor UI.
A player-facing Alchemy tab is planned and not yet available.
Alchemy crafting works through the API today.

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

- Each ingredient group must be satisfied by at least one submitted item that the system recognises as one of that group's components.
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
