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

The **Tags & Categories** screen holds three separate vocabularies for the selected system: recipe categories, component categories, and item tags.
Each vocabulary has its own tab, so you work on one at a time.
Each tab shows a count of its custom entries, its own search box, and an add form that checks your entry as you type.
As you type, the add form tells you whether the name is ready to add, already taken, or reserved, and for a tag it previews the lowercase text that will be stored.

A panel on the right of the screen gives an at-a-glance count of each vocabulary and the total number of references across all three.
It also carries a **Reference-safe by default** note, because removing a referenced entry reassigns or strips the records that use it rather than leaving them pointing at something that no longer exists.

#### Recipe categories

Custom recipe categories organize recipe browsing and authoring.
The reserved **General** recipe category is always present and is not stored in the custom category list.
Each recipe category can carry an icon.
Set it from the **Icon** field when you add the category, or change it later from the icon button on the category's row.

In the player recipe browser, each recipe that belongs to a custom category shows that category as a small label on its row.
Recipes in the reserved **General** category show no label, so the default bucket does not tag every row.
A **Category** filter, placed above the crafting-system filter, lets players narrow the list to a single category.
The filter offers only the categories that appear in the player's visible recipes, sorted alphabetically with **General** pinned last, and its default **All categories** option shows the full list.

Removing a custom recipe category is reference-safe.
Fabricate asks you to confirm on the row and tells you how many recipes will be reassigned to **General**.
Confirming reassigns those recipes to **General** so none is left pointing at a category that no longer exists.

#### Component categories

Component categories group your components in the component browser.
They are managed in the **Component categories** section of the same screen, and they are a **separate vocabulary from recipe categories**.
The two never mix.
A component category such as **Reagent** is never offered as a recipe category, and a recipe category is never offered as a component category.
Keeping them apart is deliberate, so that adding a way to group your components does not add clutter to the recipe browser your players use.

Add a category by typing a name and clicking **Add component category**.
Each component category can also carry an icon, set from the **Icon** field when you add it or changed later from its row.
The reserved **General** category is always available and is not stored in your custom list, so you cannot add or remove it.
Every component belongs to exactly one category, and a component you have never categorised is in **General**.
There is no uncategorised state.

Removing a custom component category is reference-safe.
Fabricate asks you to confirm on the row and tells you how many components will be reassigned to **General**.
Confirming moves those components to **General** rather than leaving them pointing at a category that no longer exists.

#### Item tags

Item tags allow component labeling plus tag-based ingredient matching.
Tags are many-valued, so a component can carry as many as you like.
Tags are always stored in lowercase, so the add form previews the exact text it will save.
Tags are assigned to components in the component editor only.
They are not shown on component browser rows and they do not filter the browser, because grouping is what categories are for.

A tag's reference count on this screen includes both the components that carry it and the recipe ingredients that filter on it.
Removing a tag is reference-safe.
Fabricate asks you to confirm on the row and tells you how many references will lose the tag.
Confirming strips the tag from every component that carries it and from every recipe ingredient that filters on it, so nothing is left pointing at a tag that no longer exists.

### Feature Toggles

Each system can independently enable or disable optional features.
Most optional features are off by default and must be explicitly enabled by a GM.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Feature             | Default | Description                                                                                                                                               |
|:--------------------|:--------|:----------------------------------------------------------------------------------------------------------------------------------------------------------|
| Salvage             | On      | Enable component salvage, its check configuration, and the player Salvage tab in the Inventory inspector. Turning it off preserves whatever salvage you have already authored |
| Essences            | Off     | Enable the essences system for abstract ingredient properties                                                                                             |
| Property macros     | Off     | Allow result items to have their properties set by a macro                                                                                                |
| Effect transfer     | Off     | Transfer active effects from essence source items to crafted results                                                                                      |
| Multi-step recipes  | Off     | Allow recipes with multiple sequential steps. Turning it off keeps any multi-step recipes you have authored and collapses each one into a single combined action that produces its final results, until you turn it back on |
| Gathering           | Off     | Show the Environments tab for authoring gathering locations and tasks. Any enabled system also exposes the player Gathering action in the Items Directory |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

Toggle optional features in the **Features** card on the System tab of the Crafting Admin panel.
Each toggle takes effect immediately for all future crafting attempts in that system.

You set the recipe and salvage resolution modes on the **Settings** page of the **Crafting** menu, not on the main System settings page.
The Crafting menu is always available for every crafting system.
See [The Crafting Menu](#the-crafting-menu).

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

When the new mode is Alchemy, a recipe that has more than one ingredient set is kept and collapsed to its first set, because an alchemy recipe has a single ingredient set.
The system's Alchemy check starts at No check, and you can change it under Recipe resolution afterwards.
Fabricate also re-checks recipe ingredient signatures so any overlap that would make alchemy attempts ambiguous is surfaced rather than silently broken.

After the change, Fabricate shows a summary of how many recipes were migrated, and a separate warning listing any recipes it had to delete.

Changing the **salvage resolution mode** is not destructive to recipes or runs.
No recipes or runs are deleted.
Any component whose salvage setup is incompatible with the new mode simply has its salvage disabled, and can be re-enabled once it is reconfigured.
You will be asked to confirm.

Switching a system **into** Simple mode is the one case that changes component setups.
Simple mode awards a single result group, so any component that has more than one is trimmed back to its first when you switch.
Fabricate warns you by name when this happens, listing every component it trimmed, so nothing is dropped silently.

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

Both success and failure messages show the **rolled check total** on its own row when a check ran.
A guaranteed craft or salvage that needs no roll omits the row, because there is no total to report.

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

Recipe visibility controls which players can see and access recipes in the player Crafting tab, backed by the visibility service.
You configure this per crafting system in the **Recipe Visibility** card on the **Settings** page of the **Crafting** menu.
The Crafting menu is always available for every crafting system.
See [The Crafting Menu](#the-crafting-menu).

Each system uses one of four visibility modes:

| Visibility mode  | Description                                                                 |
|:-----------------|:---------------------------------------------------------------------------|
| Global (default) | All recipes visible to all users                                           |
| Restricted       | GM grants individual recipes to specific characters and players            |
| Item             | Players craft a recipe only while holding a book or scroll linked to it    |
| Knowledge        | Players learn a recipe from a book or scroll before they can craft it      |

Selecting a mode applies at once and never rewrites your recipes.
The mode you choose decides which extra surfaces appear in the **Crafting** menu, such as the **Access** section for Restricted mode or **Books & Scrolls** limits for Item and Knowledge modes.

For full details on each mode, recipe items, the learn flow, and configuration examples, see [Visibility & Knowledge]({% link visibility.md %}).

### Alchemy Mode

Alchemy mode is a special resolution mode where recipe names and ingredient lists are hidden from players.
Macros and integrations can submit selected items to the alchemy engine.
Fabricate matches the combination against known recipe signatures.
Set the resolution mode of a system to Alchemy to enable this.
See [Alchemy Mode]({% link recipes/alchemy.md %}) for current usage, the Alchemy check setting, signature matching, consume-on-fail, and learn-on-craft options.

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

## The Crafting Menu

{: .gm }
> The Crafting Admin panel is GM-only.

The **Crafting** menu groups the recipe-focused sections of the Crafting Admin panel.
It is always available.
Whenever a crafting system is selected, the panel's left menu shows an expandable **Crafting** group, in the same style as the **Gathering** group.

Expand it to reveal its sections.
**Settings** and **Recipes** are always present, and the system's [visibility mode](#recipe-visibility) decides which of the other two sections appear.

- **Settings** hosts the system-level crafting rules: the recipe resolution mode, the salvage resolution mode, and the **Recipe Visibility** card.
  These cards used to live on the System settings page and moved here.
  They are reachable for every crafting system.
- **Recipes** is the existing recipe browser and editor.
- **Access** appears only in **Restricted** visibility mode.
  It is where you grant individual recipes to specific characters and players.
  See [Restricted Mode]({% link visibility.md %}#restricted-mode).
- **Books & Scrolls** appears only in **Item** and **Knowledge** visibility modes.
  It lists every recipe item in the system with its linked recipes and each item's own use and learn caps.
  Open a recipe item to set that item's caps and its recipe list on its own page.
  See [Books & Scrolls]({% link visibility.md %}#books--scrolls).

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
| Progressive result order preferences | Any entry for a recipe or a salvageable component that no longer exists is removed                           |

### Why this matters

If you delete a crafting system, recipe, or component while a player has a session open in another browser tab, their saved preferences may still point to things that no longer exist.
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

{: .note }
> **Duplicating an item to author another component is fully supported.**
> Each component you register is given its own durable identity, so a player's owned copies always resolve back to the right component.
> You can right-click an item in the Items sidebar, choose **Duplicate**, change the copy's name, art, and setup, and register that copy as a separate component.
> The copy becomes its own component and does not collide with, or overwrite, the original.
> This holds even when the original was imported from a compendium.
> A copy that was distributed to players before you updated Fabricate can be reconciled with [Repair Item Data]({% link troubleshooting.md %}#repairing-item-data).

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

#### Import from the Compendium Directory

You can also import an entire Item compendium without opening the admin panel.
As a GM, right-click an Item compendium in Foundry's **Compendium Directory** sidebar and choose **Import Items into Crafting System**.

1. Right-click the Item compendium in the Compendium Directory sidebar
2. Choose **Import Items into Crafting System**
3. Pick the target crafting system in the picker dialog and confirm with **Import**

The picker always opens so the import is a deliberate choice rather than a single click, even when only one crafting system exists.
If no crafting system exists yet, Fabricate tells you to create one in the Crafting System Manager first, and nothing is imported.

This action is offered only to GMs, and only on compendiums that hold Item documents.
It runs the same import as the bulk pack drop, so it adds new components, updates registered ones in place, skips items already up to date, and reports the same added, updated, and skipped summary.
Broken original source links fall back to the imported item and warn once for the whole import, exactly as the drop-based bulk import does.

#### Folder drop

Drag a **world folder** containing Item documents onto the drop zone to import every Item in that folder.
Fabricate expands the folder, applies the same source-chain deduplication logic as single-item drops, and shows a summary notification with the number of items added.
If any imported item has a broken original source link, Fabricate warns once with the affected count.
If the folder contains no Item documents, a notification says so and nothing is written.

{: .note }
> Bulk pack import requires that Foundry emits a compendium-type drag event from the pack header row.
If your Foundry version does not support this drag shape, use single-item drops instead, or import the pack through the [API]({% link api/system-manager.md %}).

### Browsing Components

The **Items** tab lists the system's components as a single grouped list.
Each row shows the component's name and a short description line.

The toolbar above the list gives you:

- a **Category** filter, defaulting to **All categories**
- an essence filter, defaulting to **All essences**
- a **Group by category** switch, on by default
- a **Sort by** control offering **Name**, **Category**, **Essences**, and **Salvage**, with a button to flip between ascending and descending

While **Group by category** is on, the list is split into a heading per category with a count of the components in it, and you can collapse a group you are not working on.
The reserved **General** category is always shown last, because it is the catch-all rather than a category you chose.
Long lists are paged, and the count above the list tells you which components you are looking at, such as **1–25 of 60**.

Your filters, sort, grouping, and page survive opening a component and coming back, so working through a long list does not reset your place each time.

### Editing Components

Open a component in the **Items** tab to edit it.
The editor is a single scrolling page rather than a form with a side panel.
**Back** sits next to **Save** at the top, so leaving and saving are in the same place.
If you leave with unsaved changes, Fabricate asks you to confirm first.

The page starts with an **Identity** strip carrying the component's icon, name, and description.
When a component is backed by a Foundry item, its name, image, and description follow that item and cannot be typed here.
The identity strip is also where you manage that link:

- drop a Foundry item onto the source area to replace the linked item
- click the source item's name to open its sheet
- use the **Source actions** menu for **Copy source UUID** and **Unlink Source Item**

Replacing or unlinking a source takes effect immediately and is not held until you press **Save**, unlike the rest of the page.

Below the identity strip you set the component's **Category**, its tags, its essences, and its salvage setup.
When the system's recipe resolution mode is Progressive, a **Progressive difficulty** card appears for setting the value spent against the crafting roll.
See [Setting Component Difficulty]({% link recipes/progressive.md %}#setting-component-difficulty).
For the salvage panel, see [Component Salvage]({% link salvage.md %}#component-salvage).

---

## Requirements

Systems can optionally require time or currency for crafting.

### Time Requirements

Time requirements let a recipe require an amount of time to craft, given in minutes, hours, days, months, or years.
A single-step recipe carries one duration on its **Duration** card.
Each step of a multi-step recipe can carry its own duration.
While a duration is running, the step is blocked until world time advances past the required duration.

Time gates are checked:

- When a player tries to advance a step
- Automatically when world time changes
- On module startup

Time requirements are on by default.
You turn them on or off with the **Time requirements** toggle in the **Optional features** section of the system settings editor, next to the currency toggle.

{: .note }
> Fabricate shows the duration editors on a recipe only while time requirements are enabled for the system.
> Turning them off later does not delete the durations you have already authored.
> Each one stays visible as a read-only value, and a step no longer waits on time until you re-enable time requirements.

### Currency Requirements

When you enable currency requirements, a recipe step can cost an amount of a currency unit you define.
Fabricate checks whether the crafting actor can afford the step before the craft begins, then spends the cost when the step is taken.
If the actor cannot pay, the step is blocked and the craft is stopped before any ingredients are consumed.

You configure currency in the system settings editor, in the **Currency units** card.

{: .note }
> The recipe editor offers to add a currency cost only while currency is enabled for the system and at least one unit is defined.
> This keeps the editor from offering a cost the system cannot honour.
> Turning currency off later does not delete the costs you have already authored.
> Each one stays visible on its recipe, but becomes read-only and is marked **Currency off**, and it stays inactive until you re-enable currency.

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
