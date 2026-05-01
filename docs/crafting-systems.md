---
layout: default
title: Crafting Systems
nav_order: 3
---

# Crafting Systems

A **crafting system** is a self-contained configuration that groups together components, essences, recipes, and rules. You can have multiple crafting systems in a single world -- for example, "Alchemy", "Blacksmithing", and "Enchanting" could each be their own system with different rules.

---

## Creating a System

{: .gm }
> Only GMs can create and manage crafting systems.

Open the GM admin panel (**Manage Crafting Systems** in the Items sidebar) and click **Create System** in the Systems tab.

### System Settings

| Setting | Description |
|:--------|:------------|
| **Name** | Display name shown in the UI |
| **Description** | Optional flavour text |
| **Resolution Mode** | How recipes produce results: `simple`, `routed`, `progressive`, or `alchemy`. See [Resolution Modes]({% link recipes/index.md %}#resolution-modes) |

### Feature Toggles

Each system can independently enable or disable features. Most features default to `false` and must be explicitly enabled by a GM. The exception is `chatOutput`, which defaults to `true`.

| Feature | Default | Description |
|:--------|:--------|:------------|
| `recipeCategories` | `false` | Organise recipes into named categories |
| `itemTags` | `false` | Allow tag-based ingredient matching instead of exact items |
| `essences` | `false` | Enable the essences system for abstract ingredient properties |
| `propertyMacros` | `false` | Allow result items to have their properties set by a macro |
| `effectTransfer` | `false` | Transfer active effects from essence source items to crafted results |
| `multiStepRecipes` | `false` | Allow recipes with multiple sequential steps |
| `salvage` | `false` | Allow components to be broken down into constituent parts |
| `gathering` | `false` | Show the Environments tab for authoring gathering locations and tasks; any enabled system also exposes the player Gathering action in the Items Directory |
| `chatOutput` | `true` | Automatically post a chat message summarising crafting results after each craft action |
| `itemPiles` | `false` | Enable the Item Piles integration: currency costs, merchant stock, and container inventory. Requires Item Piles v3.1.0 or later. |

Toggle features in the **Features** card on the System tab of the Crafting Admin panel. Each toggle takes effect immediately for all future crafting attempts in that system.

{: .warning }
> Changing the **resolution mode** is a destructive operation. All recipes in the system will be deleted because they may be invalid under the new mode. You will be asked to confirm.

### Chat Output

When `chatOutput` is enabled (the default), Fabricate automatically posts a chat message to the table after every craft action. This means your players can see crafting results without you needing to write custom success or failure macros.

**Success messages** include:
- Crafter name (the actor who performed the craft)
- Recipe name
- Items created, with quantities
- Ingredients consumed, with quantities
- Catalysts used

**Failure messages** include:
- Crafter name
- Recipe name
- Failure reason
- Any ingredients or catalysts consumed as part of the failure policy

Chat messages appear as if spoken by the crafting actor, using `ChatMessage.getSpeaker({ actor })`.

**When chat output does not fire.** Chat messages are only posted for craft attempts that reach the engine's resolution step. Early validation failures — missing actor, missing ingredients, missing catalysts, invalid recipe configuration — do not post a chat message, because the craft never started.

**Avoiding duplicate output.** If you have custom success or failure macros that already post chat results, disable `chatOutput` for that system to prevent double messages:

```javascript
Hooks.once('fabricate.ready', async () => {
  const mgr = game.fabricate.getCraftingSystemManager();
  await mgr.updateSystem('alchemy-system-id', {
    features: { chatOutput: false }
  });
});
```

### Crafting Checks

If your system uses routed mode with the `macroOutcome` provider, or progressive mode, you must configure a crafting check to gate outcomes on a player roll. See [Crafting Checks]({% link crafting-checks.md %}) for configuration fields, consumption-on-failure policies, and worked examples.

### Effect Transfer

When both the essences and effectTransfer features are enabled, Fabricate can copy active effects from essence source items to crafted results. See [Effect Transfer]({% link effect-transfer.md %}) for the triple-flag pipeline, API configuration, and worked examples.

### Item Piles

When `itemPiles` is enabled and Item Piles v3.1.0 or later is installed, Fabricate connects to Item Piles to support:

- **Currency costs** on recipes — checked before crafting begins, deducted automatically on success.
- **Merchant stock** as an ingredient source — read merchant actor inventories via `getMerchantItems()`.
- **Container contents** as crafting-station inventory — read container actors via `getContainerContents()`.

No macros are required. See [Item Piles Integration]({% link item-piles.md %}) for setup steps, currency cost configuration, and worked examples.

### Recipe Visibility

Recipe visibility controls which players can see and access recipes in the crafting app. You configure this per crafting system in the **Recipe Visibility** feature card on the System tab of the Crafting Admin panel.

Fabricate supports three list modes:

| `listMode` value | Description |
|:----------------|:------------|
| `"global"` (default) | All recipes visible to all users |
| `"player"` | GM restricts individual recipes to named players |
| `"knowledge"` | Recipes discovered through gameplay via recipe items or learning |

For full details on each mode, knowledge sub-options, recipe items, the learn flow, and API configuration examples, see [Visibility & Knowledge]({% link visibility.md %}).

### Alchemy Mode

Alchemy mode is a special resolution mode where recipe names and ingredient lists are hidden from players. Players drag items into the Crafting App's Alchemy panel and submit them; Fabricate matches the combination against known recipe signatures. Set the resolution mode of a system to `alchemy` to enable this. See [Alchemy Mode]({% link recipes/alchemy.md %}) for configuration, signature matching, consume-on-fail, and learn-on-craft options.

---

## Graph Visualization

Open the **Graph** tab in the Crafting Admin panel to see a visual map of how your recipes are connected through shared components. An arrow from Recipe A to Recipe B means that Recipe A produces a component that Recipe B consumes. The graph supports pan, zoom, search, and category filtering.

See [Recipe Graph]({% link recipe-graph.md %}) for a full guide including how to read the layout, cycle detection, and filtering.

---

## Salvage

When the salvage feature is enabled, players can dismantle components to recover partial materials. See [Salvage]({% link salvage.md %}) for resolution modes, salvage crafting checks, component configuration, and worked examples.

---

## Gathering

When the gathering feature is enabled, GMs can author environments and gathering tasks for the system's managed components. If at least one crafting system has gathering enabled, players see a separate **Gathering** action in the Items Directory that opens the player Gathering app. The action is removed again when no systems have gathering enabled.

See [Gathering Environments]({% link gathering-environments.md %}) for the current GM editor fields, routed/progressive task authoring, player app behavior, active/history surfaces, catalyst-row rules, and validation behavior.

---

## Startup and Preferences Cleanup

Each time the module loads, Fabricate automatically cleans up stale client preferences that reference crafting systems or recipes that no longer exist. You do not need to trigger this manually — it runs during module initialisation before the `fabricate.ready` hook fires.

### What is cleaned up

| Preference | Setting key | Cleanup behaviour |
|:-----------|:------------|:------------------|
| Last viewed system in GM admin | `fabricate.lastManagedCraftingSystem` | Cleared to `""` if the stored system ID is not present in the current set of crafting systems |
| Last selected gathering actor | `fabricate.lastGatheringActor` | Cleared to `""` when the remembered actor no longer resolves or is no longer selectable by the current user |
| Progressive result order preferences | `fabricate.progressiveResultOrder` | Any entry whose recipe ID no longer exists is removed from the stored object |

### Why this matters

If you delete a crafting system or recipe while a player has a client session open in another browser tab — or after restoring a world from a backup — their browser may still hold preferences pointing to IDs that no longer exist. The cleanup pass on the next load prevents stale IDs from causing unexpected behaviour in the crafting UI.

The cleanup is **idempotent**: if no stale entries exist, nothing is written to settings.

---

## Components

Components are the building blocks of recipes. Instead of referencing world items directly by UUID, recipes reference components by their `componentId`. This means:

- Recipes work regardless of which specific world item instances exist
- Multiple world items can satisfy the same component reference
- You can reorganise your item compendiums without breaking recipes

{: .note }
> The identifier field was previously called `systemItemId`. Use `componentId` for all new recipes and macros.

### Adding Components

Open the **Items** tab of the GM admin panel. You can add items one at a time or import an entire compendium pack at once.

#### Single-item drop

Drag any Item document from the **Items sidebar** or from an open **compendium browser** and drop it onto the components list. Fabricate resolves the item's UUID regardless of whether the drag data includes an explicit `uuid` field or the `pack`/`id` pair that Foundry uses for compendium item drags — both shapes are handled automatically.

1. Open the Items sidebar or the compendium browser
2. Drag the item onto the **Items** tab drop zone in the Crafting Admin panel
3. The item appears in the list with a generated `componentId`, a live `sourceUuid`, and a canonical `sourceItemUuid` when Foundry exposes one

If the item is already registered in the system by either its live UUID or its canonical source UUID, the drop reuses the existing component instead of creating a duplicate. If the stored name, image, or live UUID is stale, Fabricate updates the component in place and records the previous live UUID in `fallbackItemIds`.

If the dropped document is an Actor, JournalEntry, Scene, or any other non-Item type, a warning notification is shown and nothing is imported. If the drag data cannot be resolved to any UUID, the same warning is shown.

#### Bulk compendium pack drop

To import all Item documents from a compendium pack at once, drag the **compendium pack header** (the title row in the compendium directory sidebar, not an individual entry within it) onto the drop zone. Fabricate enumerates every Item document in the pack and adds each one.

- Items not yet in the system are added as new components.
- Items already registered by the same live UUID or canonical source UUID are updated in place rather than duplicated.
- Items already registered and already up to date are skipped.
- A single crafting system cannot contain two components that claim the same source item UUID chain.
- A summary notification reports how many items were added, updated, and skipped.
- Non-item document types in the pack (Actors, JournalEntries, etc.) are ignored.

#### Folder drop

Drag a **world folder** containing Item documents onto the drop zone to import every Item in that folder. Fabricate expands the folder, applies the same source-chain deduplication logic as single-item drops, and shows a summary notification with the number of items added. If the folder contains no Item documents, a notification says so and nothing is written.

{: .note }
> Bulk pack import requires that Foundry emits a compendium-type drag event from the pack header row. If your Foundry version does not support this drag shape, use single-item drops or the `addItemsFromPack()` API method instead.

#### Via the API

Both import paths are also available programmatically:

```javascript
// Single item from a compendium
Hooks.once('fabricate.ready', async () => {
  const mgr = game.fabricate.getCraftingSystemManager();
  const result = await mgr.addItemFromUuid(
    'blacksmithing-system-id',
    'Compendium.dnd5e.items.ironIngot456'
  );
  // result.action is 'added', 'updated', or 'skipped'
  if (result.action !== 'skipped') {
    console.log(`${result.action}: ${result.item.name}`);
  }
});
```

```javascript
// Bulk import of an entire compendium pack
Hooks.once('fabricate.ready', async () => {
  const mgr = game.fabricate.getCraftingSystemManager();
  const result = await mgr.addItemsFromPack(
    'blacksmithing-system-id',
    'dnd5e.items'
  );
  // result now includes an 'updated' count alongside added/skipped/total
  console.log(
    `Added ${result.added}, updated ${result.updated}, ` +
    `skipped ${result.skipped} of ${result.total}`
  );
});
```

See [CraftingSystemManager API]({% link api/system-manager.md %}#additemsfrompack) for the full method reference.

### Component Properties

| Property | Description |
|:---------|:------------|
| `name` | Display name |
| `sourceItemUuid` | The Foundry Item document this component represents |
| `tags` | Array of string tags (when `itemTags` feature is enabled) |
| `essences` | Map of essence ID to quantity (when `essences` feature is enabled) |
| `difficulty` | Numeric difficulty rating (used by progressive mode) |
| `salvage` | Salvage configuration sub-object (when `salvage` feature is enabled) |

---

## Requirements

Systems can optionally require time or currency for crafting.

### Time Requirements

When enabled, individual recipe steps can specify time requirements using duration fields (`minutes`, `hours`, `days`, `months`, `years`). The step blocks until world time advances past the required duration.

Time gates are checked:
- When a player tries to advance a step
- Automatically when world time changes (`updateWorldTime` hook)
- On module startup

### Currency Requirements

Currency can be handled by:
- **System adapter** -- uses the game system's built-in currency (e.g. D&D 5e gold)
- **Custom macro** -- a macro that checks and deducts currency however you define it
- **Item Piles** -- when `features.itemPiles` is enabled, currency costs defined on recipes are checked and deducted automatically via the Item Piles API. See [Item Piles Integration]({% link item-piles.md %}).
