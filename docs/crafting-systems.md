---
layout: default
title: Crafting Systems
nav_order: 3
---

# Crafting Systems

A **crafting system** is a self-contained configuration that groups together environments, components, essences, recipes, and rules.
You can have multiple crafting systems in a single world.
For example, "Alchemy", "Blacksmithing", and "Enchanting" could each be their own system with different recipes and rules.

---

## Creating a System

{: .gm }
> Only GMs can create and manage crafting systems.

Open the GM admin panel (**Manage Crafting Systems** in the Items sidebar) and click **Create System** in the Systems tab.

### System Settings

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Setting                      | Description                                                                                                                                        |
|:-----------------------------|:---------------------------------------------------------------------------------------------------------------------------------------------------|
| **Name**                     | Display name shown in the UI                                                                                                                       |
| **Description**              | Optional flavour text                                                                                                                              |
| **Recipe resolution mode**   | How recipes produce results: Simple, Routed by ingredients, Routed by check, Progressive, or Alchemy. See [Resolution Modes]({% link recipes/index.md %}#resolution-modes) |
| **Salvage resolution mode**  | How salvaging a component awards results: Simple (default), Progressive, or Routed by check. See [Salvage]({% link salvage.md %}#salvage-resolution-mode) |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

### Tags And Categories

Custom recipe categories organize recipe browsing and authoring, and item tags allow component labeling plus tag-based ingredient matching.
The reserved **General** recipe category is always present and is not stored in the custom category list.

In the player recipe browser, each recipe that belongs to a custom category shows that category as a small label on its row.
Recipes in the reserved **General** category show no label, so the default bucket does not tag every row.
A **Category** filter, placed above the crafting-system filter, lets players narrow the list to a single category.
The filter offers only the categories that appear in the player's visible recipes, sorted alphabetically with **General** pinned last, and its default **All categories** option shows the full list.

### Feature Toggles

Each system can independently enable or disable optional features.
Most optional features are off by default and must be explicitly enabled by a GM.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Feature             | Default | Description                                                                                                                                               |
|:--------------------|:--------|:----------------------------------------------------------------------------------------------------------------------------------------------------------|
| Essences            | Off     | Enable the essences system for abstract ingredient properties                                                                                             |
| Property macros     | Off     | Allow result items to have their properties set by a macro                                                                                                |
| Effect transfer     | Off     | Transfer active effects from essence source items to crafted results                                                                                      |
| Multi-step recipes  | Off     | Allow recipes with multiple sequential steps                                                                                                              |
| Gathering           | Off     | Show the Environments tab for authoring gathering locations and tasks. Any enabled system also exposes the player Gathering action in the Items Directory |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

Toggle optional features in the **Features** card on the System tab of the Crafting Admin panel.
Each toggle takes effect immediately for all future crafting attempts in that system.

Changing the **recipe resolution mode** migrates your recipes to the new mode wherever it can, instead of deleting them all.
Fabricate reshapes each recipe so it fits the new mode, and only removes a recipe when its structure cannot be made to fit.
You will be asked to confirm before anything changes.

{: .note }
> The confirmation runs a dry run first and reports accurate counts: how many recipes will be migrated to the new mode and, only when some cannot be migrated, how many will be deleted and their names.
When no recipe needs deleting, the confirmation does not mention deletion at all.

A recipe is only deleted when its shape cannot fit the new mode.
This happens in two cases: narrowing into Simple or Progressive mode (which each expect exactly one ingredient set and one result group) from a recipe that has more than one of either, and moving a multi-step recipe into Alchemy mode (which does not support multi-step recipes).
Every other recipe is kept and adjusted to suit the new mode.

A missing setup at the system level never deletes a recipe.
For example, switching to Progressive mode without a progressive crafting check, or to Routed by check mode without a roll formula, does not remove recipes.
Those gaps are reported in the System Overview instead, and they hide recipes from players until you fix them rather than deleting anything.
See [System Overview](#system-overview).

When the new mode is Alchemy, Fabricate also re-checks recipe ingredient signatures so any overlap that would make alchemy attempts ambiguous is surfaced rather than silently broken.

After the change, Fabricate shows a summary of how many recipes were migrated, and a separate warning listing any recipes it had to delete.

Changing the **salvage resolution mode** is not destructive.
No recipes or runs are deleted.
Any component whose salvage setup is incompatible with the new mode simply has its salvage disabled, and can be re-enabled once it is reconfigured.
You will be asked to confirm.

The **Salvage resolution mode** card offers Simple (the default), Progressive, and Routed by check.
A salvaged component has a single ingredient, so ingredient-set routing (and Alchemy) does not apply and is not offered.
Simple returns one result group with an optional pass/fail salvage check.

### Chat Output

Fabricate automatically posts a chat message to the table after every crafting or gathering action.

**Success messages** include:

- Crafter name (the actor who performed the craft)
- Recipe or gathering task name
- Items created, with quantities
- Ingredients consumed, with quantities
- Tools used (and any that broke)

**Failure messages** include:

- Crafter name
- Recipe or gathering task name
- Failure reason
- Any ingredients consumed or tools broken as part of the failure

Chat messages appear as if spoken by the crafting actor.

**When chat output does not fire.** Chat messages are only posted for craft attempts that reach the engine's resolution step.
Early validation failures do not post a chat message, because the craft never started.
These failures include a missing actor, missing ingredients, missing or unsatisfied tools, and invalid recipe configuration.

**Interactive check rolls.** When a player crafts or gathers from the UI, Fabricate also posts the check's dice roll to chat so a dice-animation module like Dice So Nice can animate it.
See [Rolling a check from the UI]({% link crafting-checks.md %}#rolling-a-check-from-the-ui) for the prompt, the situational-modifier field, and which rolls do not prompt.

### Crafting Checks

If your system uses Routed by check mode, or Progressive mode, you must configure a crafting check to gate outcomes on a player roll.
See [Crafting Checks]({% link crafting-checks.md %}) for the settings, consumption-on-failure policies, and worked examples.

### Effect Transfer

When both the Essences and Effect transfer features are enabled, Fabricate can copy active effects from essence source items to crafted results.
See [Effect Transfer]({% link effect-transfer.md %}) for how the feature is enabled, configured, and used, with worked examples.

### Recipe Visibility

Recipe visibility controls which players can see and access recipes through the visibility service and planned player Crafting UI.
You configure this per crafting system in the **Recipe Visibility** feature card on the System tab of the Crafting Admin panel.

Fabricate supports three list modes:

| List mode           | Description                                                      |
|:--------------------|:-----------------------------------------------------------------|
| Global (default)    | All recipes visible to all users                                 |
| Player              | GM restricts individual recipes to named players                 |
| Knowledge           | Recipes discovered through gameplay via recipe items or learning |

For full details on each mode, knowledge sub-options, recipe items, the learn flow, and configuration examples, see [Visibility & Knowledge]({% link visibility.md %}).

### Alchemy Mode

Alchemy mode is a special resolution mode where recipe names and ingredient lists are hidden from players.
Macros and integrations can submit selected items to the alchemy engine.
Fabricate matches the combination against known recipe signatures.
Set the resolution mode of a system to Alchemy to enable this.
See [Alchemy Mode]({% link recipes/alchemy.md %}) for current usage, configuration, signature matching, consume-on-fail, and learn-on-craft options.

---

## System Overview

{: .gm }
> The System Overview is GM-only.
> The whole crafting manager is GM-scoped.

The **Overview** is a single place to see every validation issue across a crafting system and jump straight to whatever owns each one.
Open it from the **Overview** button in the manager rail when a system is selected.
The button shows a count badge of the open critical and warning issues, so you can tell at a glance whether a system needs attention.

The Overview lists each issue with a severity chip (critical, warning, or note), the name of the thing it affects, and a short description of the problem.
Issues are grouped by what they affect:

- **System blockers** are problems that make the whole system unusable.
  They have no deep-link of their own because the Overview is where you resolve them.
- **Recipes** lists per-recipe problems, such as a recipe with no name or a result set that is not assigned to any check outcome.
- **Gathering environments**, **Gathering tasks**, and **Gathering events** list problems with your gathering setup.
- **Component salvage** lists components whose salvage setup is invalid for the current salvage mode.

Each issue that affects an editable thing has an **Open** button (such as **Open recipe**, **Open environment**, or **Open component**) that takes you straight to that editor, with the right tab selected, so you can fix the problem without hunting for it.

When a system has no issues, the Overview says everything is ready to use.

### System Blockers

A **system blocker** is a problem serious enough to make the entire system unusable until you fix it.
Examples include:

- The system is in Routed by check mode but has no routed crafting check, so no recipe can resolve.
- Progressive mode with no progressive crafting check, or no component with a difficulty of 1 or more.
- Multi-step recipes are still enabled while the system is in Alchemy mode.
- Two recipes share an ingredient signature in Alchemy mode, so attempts are ambiguous.

When a system has a blocker, the System Overview shows a banner at the top.
The **System settings** page shows a matching banner with an **Open system overview** link, so you are warned wherever you are working.

While a blocker is present, players cannot see or use any of the system's recipes.
See [How Players See a Broken System](#how-players-see-a-broken-system).

Blockers are worked out live and are never stored.
The moment you fix the underlying gap, the blocker clears and the system becomes usable again on its own.
You never have to re-enable recipes by hand.

### How Players See a Broken System

Fabricate keeps players from running into broken setups, while still letting GMs see everything so they can fix them.

- **A system blocker hides the whole system.**
  While a system has a blocker, players see none of its recipes or gathering, and any attempt to craft in it is refused.
  GMs still see the system and all of its recipes.
- **A per-entity problem hides only that entity.**
  When a single recipe or component is broken but the system as a whole is fine, only that one recipe or component is hidden from players.
  The rest of the system stays visible and usable.
- **GMs always see everything.**
  A GM is never hidden from a broken system or a broken recipe, so you can always reach what needs fixing.

Because these checks run live, hidden recipes reappear for players the moment you resolve the problem.
Nothing is permanently disabled behind the scenes.

---

## Graph Visualization

The **Graph** tab in the Crafting Admin panel is planned and not yet available.
It will show a visual map of how your recipes are connected through shared components.

See [Recipe Graph]({% link recipe-graph.md %}).

---

## Salvage

When the salvage feature is enabled, players can dismantle components to recover partial materials.
See [Salvage]({% link salvage.md %}) for resolution modes, salvage crafting checks, component configuration, and worked examples.
Salvaging can also be used to harvest monster corpses and world resources for usable parts.

---

## Gathering

When the gathering feature is enabled, GMs can author environments and gathering tasks for the system's managed components.
If at least one crafting system has gathering enabled, players see a separate **Gathering** action in the Items Directory that opens the player Gathering app.
The action is removed again when no systems have gathering enabled.

See [Gathering Environments]({% link gathering-environments.md %}) for the current GM editor fields, task authoring, player app behavior, active/history surfaces, required-tool references, and validation behavior.

---

## Startup and Preferences Cleanup

Each time the module loads, Fabricate automatically cleans up stale saved preferences that point to crafting systems or recipes that no longer exist.
You do not need to trigger this manually.
It runs while Fabricate starts up, before the module is ready for use.

### What is cleaned up

| Preference                           | Cleanup behaviour                                                                                           |
|:-------------------------------------|:------------------------------------------------------------------------------------------------------------|
| Last viewed system in GM admin       | Cleared if the remembered system is no longer one of the current crafting systems                           |
| Last selected gathering actor        | Cleared when the remembered actor no longer exists or is no longer selectable by the current user           |
| Progressive result order preferences | Any entry for a recipe that no longer exists is removed                                                      |

### Why this matters

If you delete a crafting system or recipe while a player has a session open in another browser tab, their browser may still hold preferences pointing to things that no longer exist.
The same can happen after restoring a world from a backup.
The cleanup pass on the next load prevents stale references from causing unexpected behaviour in the crafting UI.

The cleanup leaves things alone when nothing is stale, so nothing is written unless a stale entry needs clearing.

---

## Components

Components are the building blocks of recipes.
Instead of pointing at a single specific world item, recipes refer to a component, and any matching item can satisfy it.
This means:

- Recipes work regardless of which specific world item instances exist
- Multiple world items can satisfy the same component reference
- You can reorganise your item compendiums without breaking recipes

### Adding Components

Open the **Items** tab of the GM admin panel.
You can add items one at a time or import an entire compendium pack at once.

#### Single-item drop

Drag any Item document from the **Items sidebar** or from an open **compendium browser** and drop it onto the components list.

1. Open the Items sidebar or the compendium browser
2. Drag the item onto the **Items** tab drop zone in the Crafting Admin panel
3. The item appears in the list of components

If the item is already registered in the system, whether by the item you dropped or by the original it was copied from, the drop reuses the existing component instead of creating a duplicate.
If the stored name, image, or linked item is out of date, Fabricate updates the component in place and remembers the previous link so items already in characters' inventories still match.

If Foundry reports an original compendium source but that source no longer exists, Fabricate links to the item you dropped instead, remembers the broken source link as a fallback, and warns the GM.

After import, Fabricate also listens for linked Foundry Item updates from a GM client.
When a linked item changes its name, image, or description, matching components refresh their stored name, image, and display-safe plain-text description automatically.

If the dropped document is an Actor, JournalEntry, Scene, or any other non-Item type, a warning notification is shown and nothing is imported.
If the drag data cannot be resolved to any UUID, the same warning is shown.

#### Bulk compendium pack drop

To import all Item documents from a compendium pack at once, drag the **compendium pack header** (the title row in the compendium directory sidebar, not an individual entry within it) onto the drop zone.
Fabricate iterates over every Item document in the pack and adds each one.

- Items not yet in the system are added as new components.
- Items already registered, whether by the item itself or the original it was copied from, are updated in place rather than duplicated.
- Items already registered and already up to date are skipped.
- A single crafting system cannot contain two components that claim the same source item.
- A summary notification reports how many items were added, updated, and skipped.
- If an item's recorded original source link is broken, Fabricate links to the imported item instead, remembers the broken link as a fallback, and warns once for the bulk import.
- Non-item document types in the pack (Actors, JournalEntries, etc.) are ignored.

#### Folder drop

Drag a **world folder** containing Item documents onto the drop zone to import every Item in that folder.
Fabricate expands the folder, applies the same source-chain deduplication logic as single-item drops, and shows a summary notification with the number of items added.
If any imported item has a broken original source link, Fabricate warns once with the affected count.
If the folder contains no Item documents, a notification says so and nothing is written.

{: .note }
> Bulk pack import requires that Foundry emits a compendium-type drag event from the pack header row.
If your Foundry version does not support this drag shape, use single-item drops instead, or import the pack through the [API]({% link api/system-manager.md %}).

### Editing Components

Open a component in the **Items** tab to edit it.
The editor lets you change a component's tags, essences, and salvage setup, and replace its linked source item from the right-hand inspector.
When the system's recipe resolution mode is Progressive, the inspector also shows a **Progressive difficulty** card for setting the value spent against the crafting roll.
See [Setting Component Difficulty]({% link recipes/progressive.md %}#setting-component-difficulty).

---

## Requirements

Systems can optionally require time or currency for crafting.

### Time Requirements

When enabled, individual recipe steps can require an amount of time, given in minutes, hours, days, months, or years.
The step is blocked until world time advances past the required duration.

Time gates are checked:

- When a player tries to advance a step
- Automatically when world time changes
- On module startup

### Currency Requirements

When you enable currency requirements, a recipe step can cost an amount of a currency unit you define.
Fabricate checks whether the crafting actor can afford the step before the craft begins, then spends the cost when the step is taken.
If the actor cannot pay, the step is blocked and the craft is stopped before any ingredients are consumed.

You configure currency in the system settings editor, in the **Currency units** card.

#### Choosing a spend strategy

The **Spend strategy** selector decides how Fabricate reads and spends an actor's money.
It offers three strategies, and you can pick any of them in any world, regardless of game system.
A short hint under the selector describes the strategy you have chosen.

- **Actor data path** reads each currency unit from a numeric field on the actor sheet, such as a Dungeons & Dragons 5e character's gold.
  Fabricate makes its own change across the denominations you define, so a step priced in silver can be paid from gold and the difference returned in smaller coins.
- **Actor inventory** treats coins as items the actor carries, read and spent through a preconfigured provider.
  This is the right choice for game systems such as Pathfinder 2e, where coins live in the inventory rather than in a single sheet field.
- **Macro** drives currency with macros you write, for any game system.
  The macro receives the actor and does whatever it needs, so this strategy is not tied to the inventory.

#### The provider (Actor inventory)

When you choose **Actor inventory**, a **Provider** selector appears.

A provider is a built-in adapter that already knows how to read and spend coins from your game system's inventory.
Pathfinder 2e ships with one.
When a provider is selected, it manages the denominations for you, so the unit list becomes a read-only **Provider-managed denominations** list.
You can still reference those denominations by their abbreviation in a step's currency cost, but you cannot edit them here.
In a world whose game system has no provider, Fabricate shows a note steering you to the **Macro** strategy instead, and leaves your own units untouched.

#### The currency macros (Macro)

The **Macro** strategy has three drop zones.
You link each macro by dragging it from the Foundry macro directory onto a drop zone, and right-click a linked macro to unlink it.

- **Can afford macro** runs before the craft to decide whether the actor can pay.
  Return a success result to allow the craft, or a failure result to block it.
- **Decrement macro** runs after a successful craft to spend the cost.
- **Increment macro** is reserved for a future refund flow.
  You can link it now, but Fabricate does not run it yet.

Each macro receives the step's cost, keyed by the abbreviation you gave each currency unit, so your macro can match coins by the same abbreviation you configured.
If a macro reports failure or stops with an error, Fabricate blocks the step and the craft is stopped before any ingredients are consumed.

#### Defining currency units

When you use the **Actor data path** or **Macro** strategy, you define your own currency units.
Each unit has a label, an abbreviation, and an icon.

- Under **Actor data path**, each unit also names the field on the actor sheet that holds its balance.
- Under **Macro**, units have no path or denomination.
  Your macros match coins by abbreviation, so a note reminds you that conversion between units is handled by your macros.

You can also describe how units break down into smaller ones, such as one gold breaking down into ten silver.
A unit with no breakdown is treated as a base denomination.

To get started quickly, use **Seed presets** to add the standard coin ladder for your world.
Seeding in a Dungeons & Dragons 5e world adds units on the actor data path strategy.
Seeding in a Pathfinder 2e world adds inventory units and selects the Pathfinder 2e provider.
Preset seeding is only available in Dungeons & Dragons 5e or Pathfinder 2e worlds.
