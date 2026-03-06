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

Each system can independently enable or disable features. All features default to `false` and must be explicitly enabled by a GM.

| Feature | Default | Description |
|:--------|:--------|:------------|
| `recipeCategories` | `false` | Organise recipes into named categories |
| `itemTags` | `false` | Allow tag-based ingredient matching instead of exact items |
| `essences` | `false` | Enable the essences system for abstract ingredient properties |
| `propertyMacros` | `false` | Allow result items to have their properties set by a macro |
| `effectTransfer` | `false` | Transfer active effects from essence source items to crafted results |
| `multiStepRecipes` | `false` | Allow recipes with multiple sequential steps |
| `salvage` | `false` | Allow components to be broken down into constituent parts |

Toggle features in the **Features** card on the System tab of the Crafting Admin panel. Each toggle takes effect immediately for all future crafting attempts in that system.

{: .warning }
> Changing the **resolution mode** is a destructive operation. All recipes in the system will be deleted because they may be invalid under the new mode. You will be asked to confirm.

### Crafting Checks

If your system uses tiered or progressive mode, you must configure a crafting check:

| Setting | Description |
|:--------|:------------|
| `enabled` | Whether crafting checks are active |
| `macroUuid` | UUID of the macro that performs the check |
| `successMacroUuid` | Optional macro called after a successful step |
| `failureMacroUuid` | Optional macro called after a failed step |

See [Macros]({% link macros/index.md %}) for the check macro contract.

### Consumption on Failure

When a crafting check fails, Fabricate can still consume some or all of the required materials — representing a failed attempt that uses up resources. You configure this per crafting system under `craftingCheck.consumption`.

| Setting | Data path | Default | Description |
|:--------|:----------|:--------|:------------|
| `consumeIngredientsOnFail` | `system.craftingCheck.consumption.consumeIngredientsOnFail` | `true` | Remove ingredients from the actor's inventory even when the check fails |
| `consumeCatalystsOnFail` | `system.craftingCheck.consumption.consumeCatalystsOnFail` | `false` | Increment catalyst usage (and possibly destroy the catalyst) even when the check fails |

**When this applies.** These settings only take effect when the crafting engine runs a check macro and that macro returns a failure. They do not affect other failure paths such as missing ingredients, missing catalysts, or an invalid recipe configuration — in those cases nothing is ever consumed.

**Example: punishing failure.** An Alchemy system where botched potions destroy materials but spare the alchemist's mortar and pestle:

```javascript
// Both defaults match this scenario — no explicit configuration needed.
// system.craftingCheck.consumption = {
//   consumeIngredientsOnFail: true,   // herbs are used up
//   consumeCatalystsOnFail: false     // mortar and pestle survive
// }
```

**Example: forgiving failure.** A Cooking system where a failed roll is just practice — nothing is lost:

```javascript
// system.craftingCheck.consumption = {
//   consumeIngredientsOnFail: false,
//   consumeCatalystsOnFail: false
// }
```

**Example: high-stakes ritual.** A system where both reagents and the ritual focus are consumed regardless of outcome:

```javascript
// system.craftingCheck.consumption = {
//   consumeIngredientsOnFail: true,
//   consumeCatalystsOnFail: true
// }
```

### Effect Transfer

When the `effectTransfer` feature is enabled, Fabricate can copy Foundry active effects from essence source items to the newly created result item after a successful craft. This lets the magical properties bound to an essence carry over into the finished product — for example, crafting with fire-essence ingredients can automatically give the result fire-resistance or burning damage effects.

**Effect transfer is an opt-in, triple-flag feature.** All three of the following must be `true` before any effects are transferred:

1. `system.features.essences` is `true` — the essences feature must be enabled. Effect transfer is built on top of the essence pipeline.
2. `system.features.effectTransfer` is `true` — the GM enables the effect transfer feature on the crafting system.
3. `recipe.transferEffects` is `true` — the recipe author opts each individual recipe in.

If any one of these flags is `false`, no effect transfer occurs. This design lets you enable the feature for the whole system while still controlling it recipe by recipe.

**How the pipeline works.** When all three flags are set, the engine:

1. Determines which essence IDs were contributed by the resolved ingredients (using the `essences` flag values stored on each managed item).
2. For each contributing essence, looks up its `EssenceDefinition` in `system.essenceDefinitions`.
3. If the definition has a `sourceItemUuid`, resolves that item via `fromUuid()`.
4. Collects all active effects from the resolved source item.
5. Transfers all collected effects to the created result item using `createEmbeddedDocuments('ActiveEffect', ...)`.

Essences with no `sourceItemUuid`, or whose `sourceItemUuid` no longer resolves to a valid item, are silently skipped.

{: .note }
> The old ingredient-level `extractEffects` / `effectFilter` approach has been removed. Setting `extractEffects: true` on an ingredient no longer has any effect. Effect transfer is now controlled entirely through essence definitions and their `sourceItemUuid` field. See [Essences]({% link essences.md %}) for how to configure essence definitions.

**Enabling via the UI.** Open the Crafting Admin panel, select your system, and look for the **Essences** toggle and the **Effect Transfer** toggle in the Features card. Both must be enabled. Then configure essence definitions with a **Source item** in the Essences feature card.

**Enabling via the API.** You can enable both required features programmatically:

```javascript
// Enable essence-based effect transfer for the Alchemy system
Hooks.once('fabricate.ready', async () => {
  const mgr = game.fabricate.getCraftingSystemManager();
  await mgr.updateSystem('alchemy-system-id', {
    features: {
      essences: true,
      effectTransfer: true
    }
  });
});
```

**Controlling transfer per recipe.** Set `recipe.transferEffects = true` on each recipe that should inherit effects from its ingredient essences. Recipes where this is `false` (the default) will never transfer effects, even when both system features are on.

**Example: a Potion of Fire Resistance recipe.** In an Alchemy system with essences enabled, a Fire essence definition links to a "Flame Shard" item that carries a `Fire Resistance` active effect. Any recipe that consumes a Fire-essence ingredient and has `transferEffects: true` will copy `Fire Resistance` onto the brewed potion.

```javascript
// Craft the potion — all three flags are set:
// system.features.essences: true
// system.features.effectTransfer: true
// recipe.transferEffects: true (set in the recipe editor)
//
// If the actor's ingredients contribute the "fire" essence,
// the crafted potion will automatically receive the "Fire Resistance" active effect
// from the Fire essence definition's sourceItemUuid item.
Hooks.once('fabricate.ready', async () => {
  const engine = game.fabricate.getCraftingEngine();
  const rm = game.fabricate.getRecipeManager();
  const recipe = rm.getRecipe('fire-resistance-potion-recipe-id');
  const result = await engine.craft(
    game.user.character,
    [game.user.character],
    recipe,
    null,
    {}
  );
  if (result.success) {
    console.log('Potion crafted with fire resistance effect transferred.');
  }
});
```

### Recipe Visibility

Recipe visibility controls which players can see and access recipes in the crafting app. You configure this per crafting system in the **Recipe Visibility** feature card on the System tab of the Crafting Admin panel.

#### List Modes

| `listMode` value | Default | Description |
|:----------------|:--------|:------------|
| `"global"` | Yes | All recipes are visible to all users. No per-recipe restrictions apply. |
| `"player"` | No | All recipes are visible by default, but a GM can restrict individual recipes to a named list of players via the recipe editor. |
| `"knowledge"` | No | Recipes are only visible to players who possess the recipe item or have learned the recipe. Sub-options control exactly how knowledge is evaluated. |

{: .note }
> The default `listMode` for new systems (and for existing systems that have never had an explicit value saved) is `"global"`. If you created systems before this setting existed, they will now default to global visibility — all players can see all recipes. Switch to `"player"` or `"knowledge"` if you want access control.

**Changing the list mode is non-destructive.** Your recipes and their per-recipe `visibility` data are never deleted when you switch modes. The knowledge sub-options (`mode`, `consumeOnLearn`) are also preserved so you can switch back to knowledge mode without reconfiguring.

#### Global Mode

All recipes in the system are visible to all players. The recipe editor does not show any visibility controls because they have no effect in this mode. Use this for systems where discovery is not part of the design.

#### Player Mode

All recipes are visible to all players by default. A GM can restrict a specific recipe to a named set of players by enabling "Restrict visibility to specific users" in the recipe editor and selecting the allowed users.

- GMs always see all recipes regardless of restrictions.
- A recipe can be restricted with an empty user list (`allowedUserIds: []`). This hides it from all players — useful while you are building out a recipe before assigning it to anyone.
- The recipe list in the Crafting Admin panel shows a **Visibility** column summarising how many players each recipe is restricted to.

See [Visibility & Knowledge]({% link visibility.md %}) for full details on the player-mode access model.

#### Knowledge Mode

Recipes are hidden until a player's character earns access. Access can come from owning a recipe item, learning the recipe, or both — depending on the knowledge sub-options you configure.

Knowledge mode sub-options are shown in the **Recipe Visibility** card when `listMode` is set to `"knowledge"`:

| Sub-option | Field | Default | Description |
|:-----------|:------|:--------|:------------|
| Knowledge source | `recipeVisibility.knowledge.mode` | `"itemOrLearned"` | How a player gains access: `"item"` (must own the recipe item), `"learned"` (must have explicitly learned it), or `"itemOrLearned"` (either condition). |
| Consume on learn | `recipeVisibility.knowledge.learn.consumeOnLearn` | `true` | Whether the recipe item is deleted from the player's inventory when they learn the recipe. Only relevant when `mode` is `"learned"` or `"itemOrLearned"`. |

**Saving knowledge sub-options.** Adjust the dropdowns and checkbox in the Recipe Visibility card, then click **Save Visibility Settings**. The knowledge sub-options are only shown in the card when `listMode` is `"knowledge"`.

See [Visibility & Knowledge]({% link visibility.md %}) for the full knowledge access model including recipe items, limited uses, and the learn flow.

#### Configuring via the API

You can also set visibility programmatically:

```javascript
// Switch an Alchemy system to player-specific visibility
Hooks.once('fabricate.ready', async () => {
  const mgr = game.fabricate.getCraftingSystemManager();
  await mgr.updateSystem('alchemy-system-id', {
    recipeVisibility: { listMode: 'player' }
  });
});
```

```javascript
// Switch to knowledge mode: players must own a recipe scroll to see the recipe,
// and the scroll is consumed when they learn it.
Hooks.once('fabricate.ready', async () => {
  const mgr = game.fabricate.getCraftingSystemManager();
  await mgr.updateSystem('alchemy-system-id', {
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: {
        mode: 'itemOrLearned',
        learn: { consumeOnLearn: true }
      }
    }
  });
});
```

---

## Salvage

When the `salvage` feature is enabled on a system, players can dismantle components to recover partial materials. You configure salvage at two levels: the system (which determines how salvage checks work) and each individual component (which determines what that component yields when broken down).

Enable salvage in the Features card on the System tab of the Crafting Admin panel, or via the API:

```javascript
Hooks.once('fabricate.ready', async () => {
  const mgr = game.fabricate.getCraftingSystemManager();
  await mgr.updateSystem('blacksmithing-system-id', {
    features: { salvage: true }
  });
});
```

### Salvage Resolution Mode

The salvage resolution mode controls how result groups are awarded when a component is salvaged. It is set at the system level via `salvageResolutionMode`.

| Value | Description |
|:------|:------------|
| `"simple"` | Always awards exactly one result group. No check required. Default. |
| `"tiered"` | Awards a result group based on the outcome of a salvage check. Outcome labels (e.g. `"critical"`, `"pass"`, `"fail"`) are mapped to result groups via `outcomeRouting` on the component. |
| `"progressive"` | Awards results sequentially as the check value exceeds each result's difficulty threshold. |

{: .warning }
> `"mapped"` is not a valid salvage resolution mode and will be rejected. Use `"tiered"` if you need outcome-based routing.

```javascript
Hooks.once('fabricate.ready', async () => {
  const mgr = game.fabricate.getCraftingSystemManager();
  await mgr.updateSystem('blacksmithing-system-id', {
    features: { salvage: true },
    salvageResolutionMode: 'tiered'
  });
});
```

### Salvage Crafting Check

When `salvageResolutionMode` is `"tiered"` or `"progressive"`, you must configure a salvage check. This is separate from the recipe crafting check — a system can have both.

Configure `salvageCraftingCheck` on the system:

| Field | Type | Default | Description |
|:------|:-----|:--------|:------------|
| `enabled` | `boolean` | `false` | Whether salvage checks are active. Also set to `true` automatically when `macroUuid` is provided. |
| `macroUuid` | `string\|null` | `null` | UUID of the macro that performs the check |
| `successMacroUuid` | `string\|null` | `null` | Optional macro called after a successful salvage |
| `failureMacroUuid` | `string\|null` | `null` | Optional macro called after a failed salvage |
| `consumption.consumeComponentOnFail` | `boolean` | `true` | Whether the component being salvaged is consumed even when the check fails |
| `consumption.consumeCatalystsOnFail` | `boolean` | `false` | Whether salvage catalysts are degraded even when the check fails |
| `progressive.awardMode` | `string` | `"equal"` | How results are awarded in progressive mode: `"equal"`, `"exceed"`, or `"partial"` |
| `progressive.allowPlayerReorder` | `boolean` | `false` | Whether players can reorder pending results |
| `outcomes` | `string[]` | `["fail","pass"]` | Named outcome labels used for tiered routing |

**Example: a Disenchanting system where the artefact is always destroyed on failure but the enchanting tools are spared:**

```javascript
Hooks.once('fabricate.ready', async () => {
  const mgr = game.fabricate.getCraftingSystemManager();
  await mgr.updateSystem('disenchanting-system-id', {
    features: { salvage: true },
    salvageResolutionMode: 'tiered',
    salvageCraftingCheck: {
      macroUuid: 'Macro.disenchant-check-uuid',
      successMacroUuid: 'Macro.disenchant-success-uuid',
      failureMacroUuid: 'Macro.disenchant-failure-uuid',
      consumption: {
        consumeComponentOnFail: true,   // artefact is destroyed either way
        consumeCatalystsOnFail: false   // enchanting focus survives a failed attempt
      },
      outcomes: ['critical', 'pass', 'fail']
    }
  });
});
```

### Component Salvage Configuration

When `features.salvage` is `true` on a system, each component gains a `salvage` sub-object. If a component has no salvage data, defaults are applied automatically.

| Field | Type | Default | Description |
|:------|:-----|:--------|:------------|
| `enabled` | `boolean` | `false` | Whether this component can be salvaged |
| `ingredientQuantity` | `integer` | `1` | How many of this component the actor must provide to begin salvage. Must be a positive integer; invalid values (zero, negative, non-numeric) fall back to `1`. |
| `catalysts` | `array` | `[]` | Catalysts required for the salvage operation. Each entry has `componentId`, `degradesOnUse`, `destroyWhenExhausted`, and `maxUses`. |
| `resultGroups` | `array` | `[]` | The possible sets of items produced by salvage. Each group has `id`, `name`, and a `results` array. Each result has `id`, `componentId`, `quantity`, and optionally `propertyMacroUuid`. |
| `outcomeRouting` | `object` | omitted | Maps outcome labels to result group IDs. Required in tiered mode. |
| `timeRequirement` | `object` | omitted | Time duration fields (`minutes`, `hours`, `days`, `months`, `years`). Only positive finite values are kept. |
| `currencyRequirement` | `object` | omitted | `{ unit, amount }` where `unit` defaults to `"gp"` and `amount` must be a positive number. |

**Example: a Dragon Scale component that breaks down differently based on the salvage roll:**

```javascript
Hooks.once('fabricate.ready', async () => {
  const mgr = game.fabricate.getCraftingSystemManager();

  // First, add the component to your system if it is not already there
  const scale = await mgr.addItemFromUuid(
    'dragoncraft-system-id',
    'Compendium.world.items.dragonScaleUUID'
  );

  // Then update it with salvage configuration
  await mgr.updateItem('dragoncraft-system-id', scale.id, {
    salvage: {
      enabled: true,
      ingredientQuantity: 1,
      catalysts: [
        {
          componentId: 'acid-vial-component-id',
          degradesOnUse: true,
          destroyWhenExhausted: true,
          maxUses: 1
        }
      ],
      resultGroups: [
        {
          id: 'rg-pristine',
          name: 'Pristine Salvage',
          results: [
            { componentId: 'pristine-scale-shard-id', quantity: 3 }
          ]
        },
        {
          id: 'rg-damaged',
          name: 'Damaged Salvage',
          results: [
            { componentId: 'cracked-scale-fragment-id', quantity: 1 }
          ]
        }
      ],
      outcomeRouting: {
        critical: 'rg-pristine',
        pass: 'rg-damaged',
        fail: 'rg-damaged'
      },
      timeRequirement: { hours: 2 },
      currencyRequirement: { unit: 'gp', amount: 50 }
    }
  });
});
```

{: .note }
> The `salvage` sub-object is only included in a normalised component when `features.salvage` is `true` on the system. If you read a component from a system where salvage is disabled, the `salvage` key will be absent.

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
