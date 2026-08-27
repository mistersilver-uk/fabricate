---
layout: default
title: Settings
parent: Crafting
nav_order: 5
has_children: true
---

# Crafting Settings

**Crafting > Settings** holds the system-level crafting rules: the recipe resolution mode, the salvage resolution mode, and the **Recipe Visibility** card.
These cards are reachable for every crafting system, whether or not any recipes exist yet.

For the recipe resolution modes themselves, see [Recipes]({% link crafting/recipes/index.md %}#resolution-modes).
For the salvage resolution mode, see [Salvage]({% link components/salvage.md %}#salvage-resolution-mode).
The rest of this page covers the **Recipe Visibility** card.

---

## Recipe Visibility

Fabricate controls which recipes players can see and craft through a single **visibility mode** on each crafting system.
There are four modes: **Global**, **Restricted**, **Item**, and **Knowledge**.
You choose one mode for each crafting system.
Teaser mode is a separate discovery layer that can sit on top of any mode.

Fabricate's visibility system lets you control which recipes each player can see and when new ones become available.
You might make every recipe visible from the start for a casual game, grant recipes to hand-picked characters for tighter narrative control, or gate crafting behind owning an in-world "recipe scroll" that a player finds in a dragon's hoard.
The [visibility modes below](#recipe-visibility) walk through each mode you can set on a crafting system.

### Global Mode

All recipes in the system are visible to all users.

- No per-recipe restrictions are applied.
- The recipe editor does not show visibility controls because they have no effect in this mode.
- This is the default for all new systems and for any existing system that has not had a visibility mode chosen.

Use global mode when recipe discovery is not part of your game design.
For example, a simple crafting system where players just need to know what they can make.

### Restricted Mode

The GM grants each recipe to specific characters and players.
Only the characters and players you grant a recipe to can see it.

- GMs always see all recipes.
- A recipe with no grants is hidden from every player.
  This is useful while you are drafting a recipe before deciding who should have it.
- A player sees a recipe when you grant it to them directly, or when you grant it to a character they control.

**On the Access tab.** Restricted mode adds an **Access** section to the **Crafting** menu.
Open **Access**, pick a recipe, then grant it to characters or players in the inspector on the right.
Each list has its own search box, and a chip on each recipe row summarises how many characters and players it is granted to, or shows **No access** when it is granted to no one.
Grants apply as soon as you make them, so there is no separate save step.

**Simple and explicit.** Good for smaller recipe sets where you want direct control over who can see what.

### Item Mode

Players craft a recipe only while holding a book or scroll linked to it.

- A character must have the linked recipe item in their pack to craft the recipe.
- Holding the item grants crafting access directly.
- There is no learning step in this mode.
- You can cap how many times an item grants access with a use cap, set per item in [Books & Scrolls]({% link crafting/books-scrolls.md %}).

Item mode suits reusable schematics, or one-time recipe scrolls that are spent as they are used.

### Knowledge Mode

Players learn a recipe from a book or scroll before they can craft it.

- A character learns the recipe from a linked recipe item, and the recipe stays known afterwards even without the item.
- Learning can happen from the player Inventory tab, or automatically when a recipe item is dropped on an actor.
- You can cap how many recipes a player may learn from a single book with a learn cap, set per item in [Books & Scrolls]({% link crafting/books-scrolls.md %}).

Knowledge mode suits campaigns built around discovering and collecting recipes.
See [Learning Recipes]({% link crafting/books-scrolls.md %}#learning-recipes) for the full learn flow.

### Teaser Mode

Recipes are partially visible to players before they are discovered.
Players can see that a recipe exists, including its name, category, and an optional teaser description.
Other details, such as the ingredients, results, or description, stay hidden until the player builds up enough discovery progress.

- Each recipe decides which details to hide and how much discovery progress is needed to fully unlock it.
- Progress builds up through **fragments** (in-world items that grant progress automatically when a player acquires them), through **manual GM assignment**, or through both.
- When progress reaches the required amount the recipe becomes fully visible and craftable in the Crafting tab.
- A player-facing presentation of teaser progress is planned and not yet available.

See [Teaser Mode]({% link crafting/teaser-mode.md %}) for full configuration details.

## Item Mode Versus Knowledge Mode

Both Item mode and Knowledge mode gate crafting behind a recipe item, but they grant access in different ways.

| Mode | How a player gains access |
|:-----|:--------------------------|
| Item | Holding the linked book or scroll is enough, and the player crafts the recipe directly while they hold it |
| Knowledge | The player learns the recipe from the book or scroll, and it stays known afterwards even without the item |

Both modes use [recipe items]({% link crafting/books-scrolls.md %}#recipe-items) and both can carry per-item limits set in [Books & Scrolls]({% link crafting/books-scrolls.md %}).
Item mode uses a use cap, and Knowledge mode uses a learn cap.

## Broken Systems and Recipes Are Hidden

On top of the visibility modes above, Fabricate hides recipes that players could not use because of a setup problem, while still showing them to the GM.

- If a crafting system has a blocker that makes it unusable, players see none of its recipes regardless of visibility mode, and crafting in it is refused.
- If a single recipe or component is broken but the system as a whole is fine, only that one entity is hidden from players.
  The rest of the system stays visible.
- A GM always sees the whole system and every recipe, so the problem can be found and fixed.

These checks run live, so a recipe reappears for players as soon as the GM resolves the underlying problem.
The GM finds and fixes these problems in the System Overview.
See [System Overview]({% link crafting-systems/system-overview.md %}).

## Crafting Guards

Before starting, resuming, or advancing a crafting run, Fabricate re-evaluates:

1. Is the system free of blockers, and is this recipe not individually hidden? (non-GM blocked, GM bypasses)
2. Is the recipe still visible to this user?
3. Is the recipe locked? (non-GM blocked)
4. Does the user still have knowledge access? (if applicable)

If any guard fails, the action is blocked with a notification explaining why.

## Configuring via the API

You can set visibility programmatically.
For example, you can switch a system to Restricted mode, or to Knowledge mode where players learn recipes from books and scrolls.
See the [CraftingSystemManager API]({% link api/system-manager.md %}) and the [Recipe Visibility Service API]({% link api/visibility-service.md %}).

---
