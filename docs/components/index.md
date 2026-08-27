---
layout: default
title: Components
nav_order: 5
has_children: true
---

# Components

Components are managed on the **Components** page of the Crafting Admin panel's rail.
Two more pages sit beneath this one: [Complications]({% link components/complications.md %}), the consequences a component can fire when a progressive result produces it, and [Salvage]({% link components/salvage.md %}), what it yields when it is broken back down.

Components are the building blocks of recipes.
Instead of pointing at a single specific world item, recipes refer to a component, and any matching item can satisfy it.
This means:

- Recipes work regardless of which specific world item instances exist
- Multiple world items can satisfy the same component reference
- You can reorganise your item compendiums without breaking recipes

## Adding Components

Open the **Items** tab of the GM admin panel.
You can add items one at a time or import an entire compendium pack at once.

### Single-item drop

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

## Editing Components

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
See [Setting Component Difficulty]({% link crafting/recipes/progressive.md %}#setting-component-difficulty).
For the salvage panel, see [Component Salvage]({% link components/salvage.md %}#component-salvage).
Once at least one activity in your system resolves progressively, a **Complications** section also appears for authoring the consequences that fire when this component is produced by a progressive result.
See [Complications]({% link components/complications.md %}).
