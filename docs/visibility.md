---
layout: default
title: Visibility & Knowledge
nav_order: 7
---

# Visibility & Knowledge

Fabricate supports four approaches to controlling which recipes players can see and craft: **global**, **player lists**, **knowledge gating**, and **teaser mode**.
You choose the approach for each crafting system.

---

Picture a campaign where novice adventurers know only basic recipes, such as a healing salve and a simple torch, while a master artificer has unlocked legendary weapon blueprints through months of questing.
Fabricate's visibility system lets you control which recipes each player can see and when new ones become available.
You might make every recipe visible from the start for a casual game, hand-pick recipes per player for tighter narrative control, or gate discovery behind owning an in-world "recipe scroll" that a player finds in a dragon's hoard.
The [list modes below](#list-modes) walk through each approach, starting with the four modes you can set on a crafting system.

## List Modes

Choose a visibility approach for your crafting system in the **Recipe Visibility** card in the Crafting Admin panel, or through the API.

### Global Mode

All recipes in the system are visible to all users.

- No per-recipe restrictions are applied.
- The recipe editor does not show visibility controls because they have no effect in this mode.
- This is the default for all new systems and for any existing system that has not had a visibility approach chosen.

Use global mode when recipe discovery is not part of your game design.
For example, a simple crafting system where players just need to know what they can make.

### Player Mode

The GM directly controls who sees each recipe through a per-recipe list of allowed users.

- Each recipe can be marked as restricted.
- When a recipe is restricted, only the users you have allowed can see it.
- GMs always see all recipes.
- A restricted recipe with no allowed users is hidden from all players.
  This is useful while you are drafting a recipe before assigning it to specific users.
  It is a valid configuration and saves without error.
- The recipe list in the Crafting Admin panel shows a **Visibility** column summarising each recipe's access level.

**In the recipe editor.** When the system is in player mode, the recipe editor shows a "Restrict visibility to specific users" checkbox.
When checked, a list of users appears so you can tick the ones who should have access.
Leaving the user list empty is allowed.

**Simple and explicit.** Good for smaller recipe sets where you want direct control over who can see what.

### Knowledge Mode

Recipes are discovered through gameplay.

- Players must "know" a recipe before it appears in their list.
- Knowledge can come from **owning a recipe item**, **learning the recipe**, or **both**, depending on how you set up knowledge for the system.
- Encourages exploration and discovery.
- The restriction controls in the recipe editor are hidden in this mode because access is always worked out from what the player knows, not from a list of allowed users.

### Teaser Mode

Recipes are partially visible to players before they are discovered.
Players can see that a recipe exists, including its name, category, and an optional teaser description.
Other details, such as the ingredients, results, or description, stay hidden until the player builds up enough discovery progress.

- Each recipe decides which details to hide and how much discovery progress is needed to fully unlock it.
- Progress builds up through **fragments** (in-world items that grant progress automatically when a player acquires them), through **manual GM assignment**, or through both.
- The planned Crafting UI will show players their progress toward unlocking a teaser recipe.
- When progress reaches the required amount the recipe becomes fully visible and craftable.

See [Teaser Mode]({% link visibility-teaser.md %}) for full configuration details.

## Knowledge Modes

When you use knowledge mode, you decide how a player gains access to a recipe.

| A player gains access when | Meaning |
|:---------------------------|:--------|
| They own a matching recipe item | Holding the recipe scroll or manual is enough |
| They have learned the recipe | The recipe must be explicitly learned |
| Either of the above | Owning the item or learning the recipe both work |

## Recipe Items

A **recipe item** is a regular Foundry item linked to a recipe.
Think of it as a "recipe scroll" or "crafting manual".

### Linking a Recipe Item in the Editor

When a crafting system uses knowledge-mode visibility, the recipe editor shows a **Linked Recipe Item** section.
There are two ways to link an item:

- **Browse Items** opens a picker so you can select any existing world item or compendium item.
- **Create Recipe Item** creates a new loot item named after the recipe and automatically links it to this recipe.
  Use this when you want a fresh scroll or manual for the recipe without leaving the editor.

Once an item is linked, the editor displays its image and name alongside a **Clear** button.
Click **Clear** to unlink the item and choose a different one.

If the system's visibility mode needs a linked item but none has been set, the editor shows a warning before you save.

### How Matching Works

An item a player owns counts as the recipe's linked item when it is the linked item itself, or when it is a copy of that item.
When a player drags an item out of a compendium onto a sheet, Foundry makes a fresh copy and remembers where it came from.
Fabricate recognises both the original item and any copy made from it, across all supported Foundry versions.
This means recipe scrolls work whether a player picks up the item directly or copies it out of a compendium.

> **Tip:** If a player owns a recipe scroll that was copied from a compendium but the recipe still shows as unknown, the copy may have lost track of the item it came from. Re-importing the recipe item from the compendium restores the link.

### Limited Uses

Recipe items can have limited uses.

- You can turn on use tracking for the item.
- You can set the maximum number of times the item grants access.
- You can have the item be deleted once its uses run out.

Each owned copy keeps its own count of how many times it has been used.
Once an item reaches its maximum number of uses, it no longer grants access to the recipe.

### Which Item Is Used

When a player owns more than one item that matches the same recipe, Fabricate always picks the same one in a predictable order.
It prefers the item that has already been used the most, so usage stays consolidated on a single item.
If items are still tied, it favours the crafting actor's own items before items held by other actors, and then uses the order the items appear on the actor.

## Learning Recipes

When a system grants access through learning, players can explicitly learn recipes.

### Learn Flow

Learning happens from an owned recipe item.
A recipe can be learned when it has a linked recipe item, the player owns a matching item, and the recipe has not already been learned.
When a recipe is learned, Fabricate records it on the actor along with when it was learned and which item taught it.

A player-facing "Learn" action surfaced by the Crafting UI, along with a "Locked" badge for locked recipes, is planned and not yet available.

### Consume on Learn

By default, the recipe item is consumed (deleted) when the player learns the recipe.
This creates one-time-use "recipe scrolls".

You can choose to keep the item after learning instead.
For example, a spellbook that teaches recipes but is not destroyed in the process.

You set this in the **Recipe Visibility** card on the System tab of the Crafting Admin panel.
The option only appears when the system is in knowledge mode.

### Drag-and-Drop Learning

Dragging a recipe item onto a crafting actor's sheet is one of the ways players learn recipes.
When a valid recipe item is dropped onto an actor, Fabricate automatically learns every matched recipe whose own crafting system has auto-learn turned on.
No button click is required for that auto-learning subset.

Only actor-bound drop targets are considered for learning.
If the drop target cannot be resolved to an actor, or the current user lacks permission to update that actor, the learning path is skipped silently.

#### How Matching Works for Dropped Items

A dropped item is matched against all recipes in the crafting system.
A recipe matches when the dropped item is its linked recipe item, or a copy of that item.
This means items dragged directly from the world and items originally copied from a compendium are both recognised, across all supported Foundry versions.

#### Recipe Book Items

A single dropped item can match more than one recipe.
When this happens, the actor learns every matched recipe in a single operation.
This makes it straightforward to create "recipe book" items.
One Alchemist's Compendium, for example, might unlock Healing Salve, Antitoxin, and Smokestick all at once.

#### Mixed-System Behavior

Learning from a recipe item is decided one recipe at a time, not once for the item as a whole.
In a world with multiple crafting systems:

- Recipes from systems with auto-learn turned on are learned when the item is dropped onto the actor.
- Recipes from systems with auto-learn turned off are left out of auto-learning, even if the same owned item matches them.

This means the same owned item can auto-learn some recipes immediately and still offer manual learning for other matched recipes from differently configured systems.

### Manual Learning On Owned Item Sheets

When a matched recipe belongs to a system where auto-learn is turned off, Fabricate adds a **Learn Recipe** action to the actor-owned item sheet instead of auto-learning on drop.

- The action appears only on actor-owned item sheets.
- It appears only when the current user can update the owning actor and at least one matched recipe is manually learnable.
- The action learns only the manual-learning subset: matched recipes from systems where auto-learn is disabled.
- If the same owned item also matches recipes from auto-learn-enabled systems, those recipes still learn automatically on drop while the remaining manual-only recipes stay available from the item sheet action.

After clicking **Learn Recipe**, Fabricate asks for confirmation and then applies the same consume-on-learn behavior used by drag-and-drop learning.

#### Notifications

After a drag-and-drop learn attempt, Fabricate shows notifications for successful outcomes and stays silent for ignored outcomes:

| Outcome | Notification shown |
|:--------|:-------------------|
| **Success** | Lists each recipe learned and the actor that learned them. |
| **Partial success** | When some matched recipes were already known, only the newly learned recipes are listed. If all matches were already known, the player is notified that nothing new was learned. |
| **No match** | The drop is silently ignored for learning purposes. No notification is shown. The item is still added to the actor's inventory as normal. |
| **Precondition failure** | When the system's knowledge mode does not support learning (for example, when access comes only from owning the item), nothing is learned and no notification is shown. |

## Locked Recipes

Any recipe can be locked, regardless of visibility mode.
Locked recipes:
- Are visible to all players, so they know the recipe exists
- Cannot be crafted by anyone other than the GM
- Are reported as locked to the rest of Fabricate (the planned "Locked" badge is noted above)

## Crafting Guards

Before starting, resuming, or advancing a crafting run, Fabricate re-evaluates:
1. Is the recipe still visible to this user?
2. Is the recipe locked? (non-GM blocked)
3. Does the user still have knowledge access? (if applicable)

If any guard fails, the action is blocked with a notification explaining why.

## Configuring via the API

You can set visibility programmatically.
For example, you can switch a system to player mode, or to knowledge mode where access comes from owning the item or learning the recipe and the recipe scroll is consumed when learned.
See the [CraftingSystemManager API]({% link api/system-manager.md %}) and the [Recipe Visibility Service API]({% link api/visibility-service.md %}).

---

## See Also

- [Teaser Mode]({% link visibility-teaser.md %}). Reveal recipes gradually with fragment-based or threshold-based discovery.
- [Recipes overview]({% link recipes/index.md %}). Create and edit recipes, including visibility configuration in the recipe editor.
- [Crafting Systems]({% link crafting-systems.md %}). Configure system-level visibility settings and feature toggles.
- [Recipe Visibility Service API]({% link api/visibility-service.md %}). Automate visibility and knowledge workflows programmatically.
