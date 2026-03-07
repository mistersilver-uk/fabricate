---
layout: default
title: Crafting Systems
nav_order: 3
---

# Crafting Systems

A **crafting system** is a self-contained configuration that groups together managed items, essences, recipes, and rules. You can have multiple crafting systems in a single world -- for example, "Alchemy", "Blacksmithing", and "Enchanting" could each be their own system with different rules.

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
| **Resolution Mode** | How recipes produce results. See [Resolution Modes]({% link recipes/index.md %}#resolution-modes) |

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
| `chatOutput` | `true` | Automatically post a chat message summarising crafting results after each craft action |

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

If your system uses tiered or progressive mode, you must configure a crafting check to gate outcomes on a player roll. See [Crafting Checks]({% link crafting-checks.md %}) for configuration fields, consumption-on-failure policies, and worked examples.

### Effect Transfer

When both the essences and effectTransfer features are enabled, Fabricate can copy active effects from essence source items to crafted results. See [Effect Transfer]({% link effect-transfer.md %}) for the triple-flag pipeline, API configuration, and worked examples.

### Recipe Visibility

Recipe visibility controls which players can see and access recipes in the crafting app. You configure this per crafting system in the **Recipe Visibility** feature card on the System tab of the Crafting Admin panel.

Fabricate supports three list modes:

| `listMode` value | Description |
|:----------------|:------------|
| `"global"` (default) | All recipes visible to all users |
| `"player"` | GM restricts individual recipes to named players |
| `"knowledge"` | Recipes discovered through gameplay via recipe items or learning |

For full details on each mode, knowledge sub-options, recipe items, the learn flow, and API configuration examples, see [Visibility & Knowledge]({% link visibility.md %}).

---

## Salvage

When the salvage feature is enabled, players can dismantle components to recover partial materials. See [Salvage]({% link salvage.md %}) for resolution modes, salvage crafting checks, component configuration, and worked examples.

---

## Startup and Preferences Cleanup

Each time the module loads, Fabricate automatically cleans up stale client preferences that reference crafting systems or recipes that no longer exist. You do not need to trigger this manually — it runs during module initialisation before the `fabricate.ready` hook fires.

### What is cleaned up

| Preference | Setting key | Cleanup behaviour |
|:-----------|:------------|:------------------|
| Last viewed system in GM admin | `fabricate.lastManagedCraftingSystem` | Cleared to `""` if the stored system ID is not present in the current set of crafting systems |
| Progressive result order preferences | `fabricate.progressiveResultOrder` | Any entry whose recipe ID no longer exists is removed from the stored object |

### Why this matters

If you delete a crafting system or recipe while a player has a client session open in another browser tab — or after restoring a world from a backup — their browser may still hold preferences pointing to IDs that no longer exist. The cleanup pass on the next load prevents stale IDs from causing unexpected behaviour in the crafting UI.

The cleanup is **idempotent**: if no stale entries exist, nothing is written to settings.

---

## Managed Items

Managed items are the building blocks of recipes. Instead of referencing world items directly by UUID, recipes reference managed items by their `componentId`. This means:

- Recipes work regardless of which specific world item instances exist
- Multiple world items can satisfy the same managed item reference
- You can reorganise your item compendiums without breaking recipes

{: .note }
> The identifier field was previously called `systemItemId`. Use `componentId` for all new recipes and macros.

### Adding Managed Items

In the **Items** tab of the GM admin:

1. Drag items from the Items sidebar or a compendium into the list
2. Each item gets a unique `componentId` and is linked to its source via `sourceItemUuid`
3. Optionally add tags, essences, and difficulty ratings

### Managed Item Properties

| Property | Description |
|:---------|:------------|
| `name` | Display name |
| `sourceItemUuid` | The Foundry item this managed item represents |
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
