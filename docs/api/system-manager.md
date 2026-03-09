---
layout: default
title: CraftingSystemManager
parent: API Reference
nav_order: 3
---

# CraftingSystemManager

Manages crafting system configurations and their managed item libraries.

**Access:** `game.fabricate.getCraftingSystemManager()`

---

## System Methods

### getSystems()

Returns all crafting systems.

**Returns:** `object[]`

### getSystem(systemId)

Returns a single system by ID.

**Returns:** `object | null`

### createSystem(data)

Creates a new crafting system. GM only.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `data` | `object` | System configuration (name, description, resolutionMode, features, essenceDefinitions, etc.) |

**Returns:** `Promise<object>`

The `features` object controls which optional behaviours are active. Every key defaults to `false` when omitted.

| Feature key | Type | Default | Description |
|:------------|:-----|:--------|:------------|
| `recipeCategories` | `boolean` | `false` | Organise recipes into named categories |
| `itemTags` | `boolean` | `false` | Tag-based ingredient matching |
| `essences` | `boolean` | `false` | Enable the essences system |
| `propertyMacros` | `boolean` | `false` | Allow result property macros |
| `effectTransfer` | `boolean` | `false` | Copy active effects from ingredients to crafted results. Also requires `recipe.transferEffects: true` on each recipe. See [Effect Transfer]({% link effect-transfer.md %}). |
| `multiStepRecipes` | `boolean` | `false` | Multi-step recipes |
| `salvage` | `boolean` | `false` | Allow components to be broken down into constituent parts. When `true`, each normalised component gains a `salvage` sub-object. See [Salvage]({% link salvage.md %}). |

```javascript
const mgr = game.fabricate.getCraftingSystemManager();
const system = await mgr.createSystem({
  name: 'Alchemy',
  description: 'Brew potions and elixirs',
  resolutionMode: 'simple',
  features: {
    recipeCategories: true,
    essences: true,
    effectTransfer: true,
    multiStepRecipes: false,
    salvage: false
  },
  essenceDefinitions: [
    {
      name: 'Fire',
      description: 'The raw energy of flame',
      icon: 'fas fa-fire',
      sourceItemUuid: null
    },
    {
      name: 'Frost',
      description: 'The biting cold of winter',
      icon: 'fas fa-snowflake',
      sourceItemUuid: null
    }
  ]
});
console.log(`Created system: ${system.id}`);
```

The returned system object also includes the following top-level salvage fields, which are always normalised regardless of whether the `salvage` feature is enabled:

| Field | Type | Default | Description |
|:------|:-----|:--------|:------------|
| `salvageResolutionMode` | `string` | `"simple"` | How salvage result groups are selected. Accepts `"simple"`, `"tiered"`, or `"progressive"`. `"mapped"` is rejected and falls back to `"simple"`. |
| `salvageCraftingCheck` | `object` | see below | System-level salvage check configuration. |

`salvageCraftingCheck` shape:

| Field | Type | Default | Description |
|:------|:-----|:--------|:------------|
| `enabled` | `boolean` | `false` | Whether the salvage check is active. Automatically `true` when `macroUuid` is set. |
| `macroUuid` | `string\|null` | `null` | UUID of the check macro |
| `successMacroUuid` | `string\|null` | `null` | UUID of the macro called on salvage success |
| `failureMacroUuid` | `string\|null` | `null` | UUID of the macro called on salvage failure |
| `consumption.consumeComponentOnFail` | `boolean` | `true` | Consume the source component even when the check fails |
| `consumption.consumeCatalystsOnFail` | `boolean` | `false` | Degrade salvage catalysts even when the check fails |
| `progressive.awardMode` | `string` | `"equal"` | Progressive award mode: `"equal"`, `"exceed"`, or `"partial"` |
| `progressive.allowPlayerReorder` | `boolean` | `false` | Allow players to reorder pending progressive results |
| `outcomes` | `string[]` | `["fail","pass"]` | Named outcome labels used for routed macroOutcome routing |

The `craftingCheck` field is always present on the returned system object. It controls how skill/ability checks gate recipe outcomes in routed macroOutcome and progressive modes.

`craftingCheck` shape:

| Field | Type | Default | Description |
|:------|:-----|:--------|:------------|
| `enabled` | `boolean` | `false` | Whether the crafting check is active. Automatically `true` when `macroUuid` is set or `checkSource` is `"builtIn"`. |
| `checkSource` | `string` | `"macro"` | How the check is executed. `"macro"` runs the macro at `macroUuid`; `"builtIn"` uses the game system adapter. See [Crafting Checks]({% link crafting-checks.md %}). |
| `macroUuid` | `string\|null` | `null` | UUID of the check macro. Only used when `checkSource` is `"macro"`. |
| `successMacroUuid` | `string\|null` | `null` | UUID of the macro called after a successful crafting step. |
| `failureMacroUuid` | `string\|null` | `null` | UUID of the macro called after a failed crafting step. |
| `builtIn.ability` | `string` | `""` | Ability key for the built-in check (e.g. `"int"`, `"wis"`). Used when `checkSource` is `"builtIn"`. |
| `builtIn.skill` | `string` | `""` | Skill key for the built-in check (e.g. `"arc"`, `"nat"`). Takes precedence over `ability` when set. |
| `builtIn.dc` | `number` | `15` | Difficulty class for the built-in check. Must be a positive integer; invalid values fall back to `15`. |
| `builtIn.advantage` | `string` | `"normal"` | `"advantage"`, `"disadvantage"`, or `"normal"`. |
| `consumption.consumeIngredientsOnFail` | `boolean` | `true` | Remove ingredients from inventory when the check fails. |
| `consumption.consumeCatalystsOnFail` | `boolean` | `false` | Degrade catalysts when the check fails. |
| `progressive.awardMode` | `string` | `"equal"` | Progressive award mode: `"equal"`, `"exceed"`, or `"partial"`. |
| `progressive.allowPlayerReorder` | `boolean` | `false` | Allow players to reorder pending progressive results. |
| `outcomes` | `string[]` | `["fail","pass"]` | Named outcome labels used for routed macroOutcome routing. |

**Example: built-in check on D&D 5e.** Configure a tiered alchemy system to use an Intelligence (Arcana) check, DC 18, without writing a macro:

```javascript
Hooks.once('fabricate.ready', async () => {
  const mgr = game.fabricate.getCraftingSystemManager();
  await mgr.updateSystem('alchemy-system-id', {
    resolutionMode: 'tiered',
    craftingCheck: {
      checkSource: 'builtIn',
      builtIn: {
        ability: 'int',
        skill: 'arc',
        dc: 18,
        advantage: 'normal'
      },
      outcomes: ['fail', 'pass']
    }
  });
});
```

**Example: macro-based check (existing behaviour).** If you already have a check macro and want to keep using it, no changes are needed — `checkSource` defaults to `"macro"`:

```javascript
Hooks.once('fabricate.ready', async () => {
  const mgr = game.fabricate.getCraftingSystemManager();
  await mgr.updateSystem('alchemy-system-id', {
    craftingCheck: {
      macroUuid: 'Macro.my-alchemy-check-uuid'
    }
  });
});
```

### updateSystem(systemId, updates)

Updates a system's configuration. GM only.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `systemId` | `string` | System ID |
| `updates` | `object` | Partial system data to merge |

**Returns:** `Promise<object>`

When updating `features`, only the keys you provide are changed — other feature flags are preserved from the existing system.

```javascript
// Enable effect transfer on an existing system without changing other features.
Hooks.once('fabricate.ready', async () => {
  const mgr = game.fabricate.getCraftingSystemManager();
  await mgr.updateSystem('alchemy-system-id', {
    features: { effectTransfer: true }
  });
});
```

```javascript
// Enable salvage with tiered mode on an existing system.
Hooks.once('fabricate.ready', async () => {
  const mgr = game.fabricate.getCraftingSystemManager();
  await mgr.updateSystem('blacksmithing-system-id', {
    features: { salvage: true },
    salvageResolutionMode: 'tiered',
    salvageCraftingCheck: {
      macroUuid: 'Macro.salvage-check-uuid',
      consumption: {
        consumeComponentOnFail: true,
        consumeCatalystsOnFail: false
      },
      outcomes: ['critical', 'pass', 'fail']
    }
  });
});
```

{: .warning }
> Changing `resolutionMode` is destructive and deletes all recipes in the system.

### deleteSystem(systemId)

Deletes a system and all its recipes. GM only.

**Returns:** `Promise<void>`

---

## Managed Item Methods

### getItems(systemId, search)

Returns managed items for a system, optionally filtered by search text.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `systemId` | `string` | System ID |
| `search` | `string` | Optional search filter |

**Returns:** `object[]`

The system object exposes managed items under two equivalent properties: `components` (primary) and `managedItems` (transitional alias). Both always refer to the same array.

### addItemFromUuid(systemId, itemUuid)

Adds a single Foundry item to the system as a managed item. GM only.

If an item with the same `sourceUuid` is already registered in the system, the existing entry is returned immediately and no duplicate is created.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `systemId` | `string` | System ID |
| `itemUuid` | `string` | UUID of the Foundry item to add. Accepts both world item UUIDs (`Item.abc123`) and compendium item UUIDs (`Compendium.pack.id.itemId`). |

**Returns:** `Promise<object>` — the newly created or already-existing managed item.

**Throws:** `Error` if the system ID is not found.

```javascript
Hooks.once('fabricate.ready', async () => {
  const mgr = game.fabricate.getCraftingSystemManager();
  // Add an item from a compendium to the crafting system
  const item = await mgr.addItemFromUuid(
    'alchemy-system-id',
    'Compendium.dnd5e.items.moonpetalHerb123'
  );
  console.log(`Added: ${item.name} (componentId: ${item.id})`);
});
```

### addItemsFromPack(systemId, packId)

Imports all Item documents from a compendium pack into the system as managed items. GM only.

Items already present in the system by `sourceUuid` are skipped. Non-item document types in the pack (Actors, JournalEntries, etc.) are ignored.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `systemId` | `string` | System ID |
| `packId` | `string` | Compendium pack identifier in `"scope.name"` format (e.g. `"dnd5e.items"`) |

**Returns:** `Promise<{ added: number, skipped: number, total: number }>`

- `added` — number of items successfully imported on this call.
- `skipped` — number of items already present in the system (by `sourceUuid`) and therefore not re-imported.
- `total` — total number of Item documents found in the pack.

**Throws:** `Error` if the system ID or pack ID is not found.

```javascript
Hooks.once('fabricate.ready', async () => {
  const mgr = game.fabricate.getCraftingSystemManager();
  const result = await mgr.addItemsFromPack(
    'herbalism-system-id',
    'world.herbs-and-reagents'
  );
  console.log(
    `Imported ${result.added} of ${result.total} items ` +
    `(${result.skipped} duplicates skipped).`
  );
});
```

{: .note }
> You can also trigger bulk import from the UI by dragging a compendium pack header onto the **Items** tab drop zone in the Crafting Admin panel. The same deduplication logic applies. See [Bulk compendium pack drop]({% link crafting-systems.md %}#bulk-compendium-pack-drop) for details.

### updateItem(systemId, itemId, updates)

Updates a managed item's properties (tags, essences, difficulty, salvage). GM only.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `systemId` | `string` | System ID |
| `itemId` | `string` | Managed component ID |
| `updates` | `object` | Partial item data |

**Returns:** `Promise<object>`

When `features.salvage` is enabled on the system, you can set the `salvage` sub-object here. The shape is normalised on write — see [Component Salvage Configuration]({% link salvage.md %}#component-salvage-configuration) for the full field reference.

```javascript
// Configure salvage for a Dragon Scale component
Hooks.once('fabricate.ready', async () => {
  const mgr = game.fabricate.getCraftingSystemManager();
  await mgr.updateItem('dragoncraft-system-id', 'dragon-scale-component-id', {
    salvage: {
      enabled: true,
      ingredientQuantity: 1,
      resultGroups: [
        {
          id: 'rg-scales',
          name: 'Scale Shards',
          results: [{ componentId: 'scale-shard-component-id', quantity: 2 }]
        }
      ]
    }
  });
});
```

### deleteItem(systemId, itemId)

Removes a managed item from the system. GM only.

When an item is deleted, any essence definitions that had their `sourceItemUuid` pointing to that item are automatically updated: `sourceItemUuid` is set to `null`.

**Returns:** `Promise<boolean>`

---

## Essence Methods

### getEssenceDefinitions(systemId)

Returns all essence definitions for a system.

**Returns:** `object[]`

Each returned object has the following shape:

| Field | Type | Description |
|:------|:-----|:------------|
| `id` | `string` | Unique identifier derived from the name |
| `name` | `string` | Display name |
| `description` | `string` | Flavour text (may be empty) |
| `icon` | `string` | FontAwesome class string. Always a non-empty string; defaults to `fas fa-mortar-pestle`. |
| `sourceItemUuid` | `string\|null` | Authoritative field. Component ID of the managed item linked to this essence, or `null`. |

```javascript
const mgr = game.fabricate.getCraftingSystemManager();
const essences = mgr.getEssenceDefinitions('alchemy-system-id');
for (const ess of essences) {
  console.log(`${ess.name} (${ess.id}) — icon: ${ess.icon}`);
}
```

### getEssenceDefinition(systemId, essenceId)

Returns a single essence definition by its ID.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `systemId` | `string` | System ID |
| `essenceId` | `string` | Essence ID |

**Returns:** `object | null`

```javascript
const ess = mgr.getEssenceDefinition('alchemy-system-id', 'fire');
if (ess) {
  console.log(`Fire essence icon: ${ess.icon}`);
  console.log(`Source item: ${ess.sourceItemUuid ?? 'none'}`);
}
```

---

## Internal Normalisation Helpers

These methods are called automatically by `createSystem`, `updateSystem`, `createItem`, `addItemFromUuid`, `addItemsFromPack`, and `updateItem`. You do not call them directly, but understanding them helps when inspecting or migrating stored data.

### _normalizeCraftingCheck(check)

Normalises the `craftingCheck` object on a crafting system. Applies defaults for all fields including `checkSource` (defaults to `"macro"`), `builtIn` (via `_normalizeBuiltInCheck`), `consumption`, `progressive`, and `outcomes`. `enabled` is automatically set to `true` when `macroUuid` is provided or `checkSource` is `"builtIn"`.

### _normalizeBuiltInCheck(config)

Normalises the `craftingCheck.builtIn` sub-object. Coerces `ability` and `skill` to lowercase trimmed strings. Validates `dc` as a positive finite integer (defaults to `15`). Validates `advantage` against the enum `["advantage", "disadvantage", "normal"]` (defaults to `"normal"`).

### _normalizeSalvage(salvage)

Normalises the `salvage` sub-object for a single component. Called by `_normalizeComponent` when `features.salvage` is `true` on the system.

Applies defaults: `enabled: false`, `ingredientQuantity: 1`, `catalysts: []`, `resultGroups: []`. The optional fields `outcomeRouting`, `timeRequirement`, and `currencyRequirement` are included only when present and non-null in the input.

### _normalizeSalvageCatalyst(catalyst)

Normalises a single entry in salvage.catalysts. Uses componentId as the identifier field. Returns null for any entry where the field is absent; null entries are filtered out of the array.

### _normalizeSalvageResult(result)

Normalises a single entry in a result group's results array. Uses componentId as the identifier field. quantity must be a positive finite number; invalid values fall back to 1.

### _normalizeSalvageResultGroup(group)

Normalises a single entry in `salvage.resultGroups`. Assigns a random ID when `id` is absent. Falls back to `"Result Group"` when `name` is absent or empty. Normalises each entry in `results` via `_normalizeSalvageResult`. Returns `null` for invalid input; `null` entries are filtered out.

### _normalizeTimeRequirement(time)

Normalises a time requirement object. Accepts any combination of `minutes`, `hours`, `days`, `months`, and `years`. Only keys whose values are positive finite numbers are included in the output; zero, negative, or non-numeric values are dropped entirely.

### _normalizeCurrencyRequirement(currency)

Normalises a currency requirement object. `unit` defaults to `"gp"` when absent or empty. `amount` must be a positive finite number; invalid values produce `0`.

### _normalizeSalvageCraftingCheck(check)

Normalises the system-level `salvageCraftingCheck` object. See the field reference table in [createSystem](#createsystemdata) above for the full default and validation rules applied by this method.
