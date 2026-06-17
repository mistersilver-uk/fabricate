---
layout: default
title: Alchemy Mode
parent: Recipes
nav_order: 6
---

# Alchemy Mode

Alchemy mode turns recipe crafting into a discovery game.
Players cannot see recipe names or ingredient lists up front.
Instead, an integration or macro submits selected items to the alchemy engine.
If the combination matches a recipe, the craft succeeds.
If it does not match, the items may be silently consumed.

Use alchemy mode for systems where recipes are secrets, such as a witch's grimoire, an experimental alchemist's bench, or any scenario where players are meant to experiment rather than follow a known formula.

---

## Current API Surface

Alchemy recipes and systems can be authored through the API only today.
There is no GM recipe-editor UI.
A player-facing Alchemy tab is planned and not yet available.
Alchemy crafting works through the API today.

Use `game.fabricate.getCraftingEngine().craftAlchemy(...)` to submit a discovered combination of items for the crafting actor and source actors, along with the alchemy `craftingSystemId`.
`submittedItems` should be real Foundry Item documents, or item-like objects that at least include a `uuid` and `name`.
Fabricate uses those references to match component signatures and consume submitted inventory when configured to do so.
See the [Crafting Engine API reference]({% link api/crafting-engine.md %}) for the method signature and return shape.

---

## How It Works

1. A crafting system is created through the API with its resolution mode set to `alchemy`.
2. A macro or integration calls `game.fabricate.getCraftingEngine().craftAlchemy(...)` with the crafting actor, source actors, submitted items, and alchemy system ID.
3. Fabricate matches the submitted components against all enabled recipes in the system.
4. If a matching recipe is found, the normal crafting flow runs (ingredients consumed, results created).
5. If no recipe matches, the attempt ends.
   Depending on system configuration, the submitted items may or may not be consumed.

---

## Signature Matching

Fabricate identifies a recipe match by comparing the staged components against the **component signatures** of each recipe in the system.
A signature is the set of components that satisfy a recipe's ingredient groups.

- Each ingredient group must be satisfied by at least one staged component whose source-reference chain overlaps a component in that group.
- Fabricate checks the staged item's live UUID, canonical source UUID, and the component's `sourceUuid`, `sourceItemUuid`, and `fallbackItemIds`.
- If all groups in an ingredient set are satisfied, the recipe is considered a match and crafting proceeds using that ingredient set.
- Recipes are checked in order, and the first match is used.

{: .note }
> Alchemy matching is not limited to a single UUID field. A component can still match when its live `sourceUuid` changed, as long as the staged item overlaps the component's canonical `sourceItemUuid` or any recorded fallback UUID.

---

## Consume on Fail

By default, when no recipe matches, Fabricate removes the submitted items from the component source actors.
You can change this by setting `system.alchemy.consumeOnFail` to `false`.

| `consumeOnFail` value | Behaviour on no-match |
|:----------------------|:----------------------|
| `true` (default) | Submitted items are deleted from actor inventory |
| `false` | Submitted items are left intact, no items are consumed |

This flag lives on the system's `alchemy` sub-object.
See the [System Manager API reference]({% link api/system-manager.md %}) for the method that updates a system.

---

## Learn on Craft

When `system.alchemy.learnOnCraft` is `true`, a player who successfully discovers a recipe has that recipe added to their learned-recipes flag.
API consumers can read that learned state through the visibility service to show discovered recipes and help players reproduce known combinations.

| `learnOnCraft` value | Behaviour on success |
|:---------------------|:---------------------|
| `false` (default) | Every attempt is anonymous, players never see recipe names |
| `true` | Discovered recipes are written to `actor.flags.fabricate.learnedRecipes`, integrations can surface them in future sessions |

This flag also lives on the system's `alchemy` sub-object.
See the [System Manager API reference]({% link api/system-manager.md %}) for the method that updates a system.

---

## Setting Up an Alchemy System

To set up an alchemy system, create a crafting system with its resolution mode set to `alchemy`, add the managed components that act as ingredients, then author recipes whose ingredient sets define the hidden signatures players must discover by experiment and whose result groups define what is produced on a successful match.
Enable each recipe, because disabled recipes are never matched.
The `alchemy` sub-object carries the `consumeOnFail` and `learnOnCraft` settings.
Recipes and systems can be authored through the API only.
See the [System Manager API reference]({% link api/system-manager.md %}) and the [Recipe Manager API reference]({% link api/recipe-manager.md %}) for the methods that create and configure systems and recipes.

{: .warning }
> Changing the resolution mode on an existing system that has recipes will delete those recipes, because their configuration may be incompatible with the new mode.

---

## Visibility Rules

In alchemy mode, recipe visibility follows special rules regardless of the system's `recipeVisibility.listMode`:

| Viewer | Visibility result |
|:-------|:---------------------------------------|
| GM | All recipes visible (for authoring and debugging) |
| Player (`learnOnCraft: false`) | No recipes visible |
| Player (`learnOnCraft: true`, recipe not yet discovered) | Recipe not visible |
| Player (`learnOnCraft: true`, recipe previously discovered) | Recipe visible to API consumers |

---

## Data Persistence

Fabricate registers a client setting reserved for the planned Alchemy tab:

| Setting key | Scope | Description |
|:------------|:------|:------------|
| `fabricate.lastAlchemySystem` | Client | ID of the last alchemy system selected (reserved for the planned Alchemy UI) |

---

## See Also

- [Simple Mode]({% link recipes/simple.md %}): standard A + B = C crafting without hidden signatures
- [Visibility & Knowledge]({% link visibility.md %}): the full recipe knowledge system (learn by item, learn by flag)
- [Crafting Systems]({% link crafting-systems.md %}): all system-level settings and feature toggles
