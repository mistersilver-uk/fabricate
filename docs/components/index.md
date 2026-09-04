---
layout: default
title: Components
nav_order: 6
has_children: true
---

# Components

Components are the building blocks of recipes.
Instead of pointing at a single specific world item, recipes refer to a component, and any matching item can satisfy it.
This means:

- Recipes work regardless of which specific world item instances exist
- Multiple world items can satisfy the same component reference
- You can reorganise your item compendiums without breaking recipes

A component now has two layers.
The **world Component catalogue** holds one shared record per game-world item, carrying its name, description, linked item, and an optional world category and world tags.
It is reachable from the World section of the Crafting System Manager's rail without picking a crafting system first.
The **Component Rules** screen, inside a crafting system, holds what that component actually does there.
That is its category, its tags, its essences, its salvage setup and its progressive difficulty.
Two more pages sit beneath this one: [Complications]({% link components/complications.md %}), the consequences a component can fire when a progressive result produces it, and [Salvage]({% link components/salvage.md %}), what it yields when it is broken back down.

## The world Component catalogue

Open the Crafting System Manager and choose **Component catalogue** in the World section of the rail.
No crafting system needs to be selected.

Every row is a shared identity, backed by one game-world item.
Each row states how many recipes name it, and how many of your crafting systems currently have rules for it, as a fraction such as **3/6 systems**.
A component no crafting system has adopted yet is marked **Unused**.
Filter by whether a component has a linked source item, and sort by source item to group linked components ahead of unlinked ones.

Select a row to inspect it on the right.
The inspector states the component's world category (or **No world category**), how many world tags it carries and whether any are muted somewhere, which recipes use it, and a standing note explaining what is and is not shared with every crafting system (see [What the catalogue actually shares](#what-the-catalogue-actually-shares) below).
Choose **Edit component** to open its full entry.

### Creating a component from an item

Drag an item from the Items sidebar or a compendium browser onto the drop zone at the top of the catalogue.

- If the item is not yet linked to any world component, Fabricate creates a new one and opens its entry.
- If the item is already linked to a world component, by that item or by an alias it also matches, Fabricate opens the existing entry instead of creating a duplicate.
- An item that belongs to an actor, such as one on a character sheet or an unlinked token, cannot be dropped here.
Drop the item from the Items directory or a compendium instead.

This drop zone creates the shared world record.
It does not add the component to any crafting system.
Add it to a system from the entry's per-system rows, or from a crafting system's own Component Rules screen, described below.

### What the catalogue actually shares

A world component's name, description, linked item and world tags are authored here and are not yet read by any crafting system.
Editing them here changes what this catalogue and its entry show, and nothing else, until each crafting system's own rules are what a recipe actually reads.

The world category is different.
Every crafting system whose Component Rules currently inherit the world category resolves that value from here, and changing it changes what those systems resolve immediately.

### Bulk editing components

Tick more than one row's checkbox to open the bulk panel in place of the single-component inspector.
From there you can stage:

- **System membership.** Choose **Add to** or **Remove from**, then pick one or more crafting systems.
Adding gives every selected component fresh rules in each chosen system, inheriting the world category.
Removing drops those rules but leaves the world record untouched.
- **World category.** Pick a category already used elsewhere in the corpus, or choose **No world category** to clear it.
The reserved **General** category is refused here too.
- **World tags.** Mark each tag to add, remove, or leave unchanged across every selected component.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| What stays per component | What bulk editing changes |
|:--------------------------|:---------------------------|
| Name, description, linked item and aliases | Which crafting systems have this component |
| | Its world category |
| | Its world tags |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

The panel states how many changes it is about to make before you apply them, and applies every staged change one at a time, so a large selection across several systems takes a moment.
There is no bulk delete here.
Deleting a world component is a single-record action from its own entry, described below.

## The world Component entry

Choose **Edit component** on a catalogue row, or drop a new item onto the catalogue, to open a component's entry.
The header band across the top carries **Back**, **Delete**, and **Save**.

### Identity

Type the component's **Name** and **Description** here.
Both start out as a snapshot taken from the linked item when you first link it, or when you replace the link, and you can then edit them independently of the item.
Only the name and description are held until you press **Save**.
Everything else on this screen, including the linked item, the world category, world tags, muting, membership, and delete, takes effect immediately.

If you leave with an unsaved name or description, Fabricate asks whether to save, discard, or keep editing.

### Linked item

Drop an item onto the source area to link or replace it, or use **Unlink Item** to remove the link.
Replacing the link takes a fresh name, image, and description snapshot from the new item.
**Copy** copies the linked item's UUID.

**Also matches** lets you add other item UUIDs this component should also be recognised as.
This is useful when the same component has previously been represented by more than one item, for example after re-pointing a compendium link, so copies players already hold keep matching it.

### World category

Type a category, or pick one already used by another component from the suggestions.
The reserved **General** category cannot be set here.
Typing it, in any capitalisation or with extra spaces, is refused with a warning explaining that General is the fallback every component uses already, so leave the field blank instead.

The note beneath the field tells you what is actually happening:

- With no crafting systems using this component yet, it says so.
- Once at least one system has rules for it, it states how many inherit this world category and how many override it locally.

**Edit world vocabulary** opens the world Tags & Categories screen, where the category list itself is authored.

### World tags

Add or remove world tags here.
The note beneath them states how many are set, and, once any crafting system mutes one, how many systems mute at least one.

{: .note }
> World tags and world category and name behave differently.
> Every crafting system whose rules inherit the world category resolves that value.
> World tags, and their per-system muting below, are visible on this entry and on the Component Rules screen, but are not yet applied to what any crafting system's own tag list actually is.

### Per-system rows and tag muting

Below the identity and world classification cards, one row lists every crafting system.
Filter by **All**, **With rules**, or **Without**, and search by name.
Each row shows the system's name, whether its rules inherit or override the world category, and a summary of what it currently resolves.

- **Open rules** (member rows only) opens that system's Component Rules screen for this component.
- **Add** or **Remove** joins or removes this component from that system.
Adding creates rules in that system that inherit the world category.
Removing deletes that system's rules for it, leaving the world record and every other system untouched.
- For a system that already has rules, and while this component carries at least one world tag, a row of tag chips lets you mute individual world tags for that system alone.
A muted tag is shown dimmed with a crossed-out eye.
An active one carries a globe.
This is the only place per-system tag muting is authored.
The Component Rules screen for that system shows the same muted state read-only, with a link back here.

### Deleting a component

If no crafting system has rules for this component, **Delete** removes it for good, along with the world record.

If one or more crafting systems have rules for it, deleting is refused, and the reason is stated on the **Delete** button itself and above the per-system rows.
It names the first few affected systems and tells you to remove the component from each one first, using the per-system rows above.
Because the world-scope upgrade gives every pre-existing component a full set of system rules, this refusal is the normal state for most components on an upgraded world, not an edge case.

### Validation

The Validation tab lists what this world record states and what every crafting system inheriting it will resolve, grouped as **Source item**, **Identity**, **World classification**, and **System rules**.
A missing source item or an empty name blocks saving.
No world category and no world tags are reported as warnings, not blockers, because a legitimately blank entry is not broken.
A system that inherits an unset world category simply supplies its own.

## Component Rules

Open a crafting system, then choose **Component Rules** in its rail to work on what a component does in that system.
That is its category, its tags, its essences, its salvage setup, and, in Progressive mode, its difficulty.

After you open a component that has a world record, a banner across the top of the list states that its name, art, and description are authored in the world Component catalogue and shared with the other systems that have it, with an **Edit shared definition** link to that component's world entry.

## Adding Components

You can add items one at a time or import an entire compendium pack at once.

### Single-item drop

Drag any Item document from the **Items sidebar** or from an open **compendium browser** and drop it onto the components list.

1. Open the Items sidebar or the compendium browser
2. Drag the item onto the components list's drop zone
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
> A copy that was distributed to players before you updated Fabricate can be reconciled with [Repair Item Data]({% link help/troubleshooting.md %}#repairing-item-data).

After import, Fabricate also listens for linked Foundry Item updates from a GM client.
When a linked item changes its name, image, or description, matching components refresh their stored name, image, and display-safe plain-text description automatically.

If the dropped document is an Actor, JournalEntry, Scene, or any other non-Item type, a warning notification is shown and nothing is imported.
If the drag data cannot be resolved to any UUID, the same warning is shown.

### Bulk compendium pack drop

To import all Item documents from a compendium pack at once, drag the **compendium pack header** (the title row in the compendium directory sidebar, not an individual entry within it) onto the drop zone.
Fabricate iterates over every Item document in the pack and adds each one.

- Items not yet in the system are added as new components.
- Items already registered, whether by the item itself or the original it was copied from, are updated in place rather than duplicated.
- Items already registered and already up to date are skipped.
- A single crafting system cannot contain two components that claim the same source item.
- A summary notification reports how many items were added, updated, and skipped.
- If an item's recorded original source link is broken, Fabricate links to the imported item instead, remembers the broken link as a fallback, and warns once for the bulk import.
- Non-item document types in the pack (Actors, JournalEntries, etc.) are ignored.

### Import from the Compendium Directory

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

### Folder drop

Drag a **world folder** containing Item documents onto the drop zone to import every Item in that folder.
Fabricate expands the folder, applies the same source-chain deduplication logic as single-item drops, and shows a summary notification with the number of items added.
If any imported item has a broken original source link, Fabricate warns once with the affected count.
If the folder contains no Item documents, a notification says so and nothing is written.

{: .note }
> Bulk pack import requires that Foundry emits a compendium-type drag event from the pack header row.
If your Foundry version does not support this drag shape, use single-item drops instead, or import the pack through the [API]({% link api/system-manager.md %}).

## Browsing Components

The **Component Rules** screen lists the system's components as a single grouped list.
Each row shows the component's name and a short description line.

The toolbar above the list gives you:

- a **Category** filter, defaulting to **All categories**
- an essence filter, defaulting to **All essences**
- a **Group by category** switch, on by default
- a **Sort by** control offering **Name**, **Category**, **Essences**, and **Salvage**, with a button to flip between ascending and descending

While **Group by category** is on, the list is split into a heading per category with a count of the components in it, and you can collapse a group you are not working on.
The reserved **General** category is always shown last, because it is the catch-all rather than a category you chose.
Long lists are paged, and the count above the list tells you which components you are looking at, such as **1–25 of 60**.

A component's category here is this system's own resolved value.
See [Category](#category) below for how that relates to the world category.

Your filters, sort, grouping, and page survive opening a component and coming back, so working through a long list does not reset your place each time.

### Bringing in world components this system has not adopted

A three-way filter above the list controls which components you see:

- **In this system** shows components this system already has rules for.
This is the default.
- **All world components** widens the list to every component the world Component catalogue holds, including ones this system has never adopted.
The ones this system has no rules for yet are shown as ghost rows, with no category, essences, or salvage, because nothing here states behaviour for a component this system has no rules for.
Choose **Add** on a ghost row to give it rules here.
- **Overriding** narrows the list to components whose category this system has overridden rather than inherited.

Each filter option states its own count, and the toolbar states how many components inherit the world category and how many override it, once at least one does.

## Editing Component Rules

Open a component in the **Component Rules** screen to edit it.
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

Below the identity strip you set the component's category, its tags, its essences, and its salvage setup.

### Category

A component's **Category** groups it in this system's browser.
If the linked world component has a world category, a switch beside the field lets this system inherit it or override it.
While inheriting, the value is shown read-only and the note explains which value it currently resolves to.
Turn the switch off to author this system's own category instead.
The switch is only offered when the world catalogue has actually set a category to inherit from.
A system with nothing to inherit supplies its own category outright, with no switch shown.

### World tags

Below the system's own writable tag list, and only while the linked world component carries world tags, a separate read-only **World tags** card states how many are in effect here and how many are muted, and lists them with the same dimmed, crossed-out-eye styling the world entry uses for a muted tag.
This card is read-only.
Muting a world tag is authored on the component's world entry, not here.
**Edit world tags** opens that entry directly.

When the system's recipe resolution mode is Progressive, a **Progressive difficulty** card appears for setting the value spent against the crafting roll.
See [Setting Component Difficulty]({% link crafting/recipes/progressive.md %}#setting-component-difficulty).
For the salvage panel, see [Component Salvage]({% link components/salvage.md %}#component-salvage).
Once at least one activity in your system resolves progressively, a **Complications** section also appears for authoring the consequences that fire when this component is produced by a progressive result.
See [Complications]({% link components/complications.md %}).
