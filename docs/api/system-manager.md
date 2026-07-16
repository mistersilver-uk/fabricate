---
layout: default
title: CraftingSystemManager
parent: API Reference
nav_order: 3
---

# CraftingSystemManager

Manages crafting system configurations and their component libraries.

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

Creates a new crafting system.
GM only.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `data` | `object` | System configuration (name, description, resolutionMode, features, essenceDefinitions, etc.) |

**Returns:** `Promise<object>`

The `features` object controls which optional behaviours are active.
Every key defaults to `false` when omitted.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Feature key | Type | Default | Description |
|:------------|:-----|:--------|:------------|
| `recipeCategories` | `boolean` | `false` | Organise recipes into named categories |
| `itemTags` | `boolean` | `false` | Tag-based ingredient matching |
| `essences` | `boolean` | `false` | Enable the essences system |
| `propertyMacros` | `boolean` | `false` | Allow result property macros |
| `effectTransfer` | `boolean` | `false` | Copy active effects from ingredients to crafted results. Also requires `recipe.transferEffects: true` on each recipe. See [Effect Transfer]({% link effect-transfer.md %}). |
| `multiStepRecipes` | `boolean` | `false` | Multi-step recipes |
| `salvage` | `boolean` | `false` | Allow components to be broken down into constituent parts. When `true`, each normalised component gains a `salvage` sub-object. See [Salvage]({% link salvage.md %}). |
| `gathering` | `boolean` | `false` | Enable GM authoring for gathering environments and tasks. See [Gathering Environments]({% link gathering-environments.md %}). |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

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

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Field | Type | Default | Description |
|:------|:-----|:--------|:------------|
| `salvageResolutionMode` | `string` | `"simple"` | How salvage result groups are selected. Accepts `"simple"`, `"routed"`, or `"progressive"`. Legacy `"tiered"` input is normalized to `"routed"`. `"mapped"` and `"alchemy"` are rejected and fall back to `"simple"`. |
| `salvageCraftingCheck` | `object` | see below | System-level salvage check configuration. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

`salvageCraftingCheck` shape:

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Field | Type | Default | Description |
|:------|:-----|:--------|:------------|
| `enabled` | `boolean` | `false` | Whether the optional simple-mode salvage check is active. |
| `simple` | `object` | see below | Simple pass/fail salvage check (`simple` salvage mode). Usable only when `simple.rollFormula` is set. |
| `routed` | `object` | see below | Routed salvage check (`routed` salvage mode). Usable only when `routed.rollFormula` is set. |
| `consumption.consumeComponentOnFail` | `boolean` | `true` | Consume the source component even when the check fails |
| `consumption.breakToolsOnFail` | `boolean` | `false` | Break Tools even when the salvage check fails (renamed from the legacy `consumeCatalystsOnFail`, which is still read as a fallback) |
| `progressive.rollFormula` | `string` | `""` | Roll formula for the progressive salvage check (`progressive` salvage mode). The check is usable only when this is set. |
| `progressive.awardMode` | `string` | `"equal"` | Progressive award mode: `"equal"`, `"exceed"`, or `"partial"` |
| `outcomes` | `string[]` | `["fail","pass"]` | Named outcome labels used for routed check routing |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

The `craftingCheck` field is always present on the returned system object.
It controls how skill/ability checks gate recipe outcomes in routed-by-check and progressive modes.

`craftingCheck` shape:

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Field | Type | Default | Description |
|:------|:-----|:--------|:------------|
| `enabled` | `boolean` | `false` | Whether the optional simple-mode crafting check is active. This toggle gates the simple pass/fail check in `simple` mode only. |
| `simple.rollFormula` | `string` | `""` | Roll formula for the simple pass/fail check (`simple` mode, and `alchemy` when `alchemy.checkMode` is `"simple"`). The check is usable only when this is set. |
| `simple.dc` | `number` | `15` | Static difficulty class for the simple check. Roll total must meet or exceed it (or strictly exceed it when `simple.thresholdMode` is `"exceed"`). |
| `simple.dcMode` | `string` | `"static"` | `"static"` uses `simple.dc`. `"dynamic"` computes the DC from the macro at `simple.macroUuid`. |
| `simple.macroUuid` | `string\|null` | `null` | UUID of the dynamic-DC macro, used only when `simple.dcMode` is `"dynamic"`. The macro computes the DC. It never resolves the check outcome. |
| `routed.rollFormula` | `string` | `""` | Roll formula for the routed crafting check. Required in `routedByCheck` mode and in `alchemy` when `alchemy.checkMode` is `"tiered"`, and optional in `routedByIngredients` mode. The check is usable only when this is set. |
| `progressive.rollFormula` | `string` | `""` | Roll formula for the progressive check (`progressive` mode). The check is usable only when this is set. |
| `consumption.consumeIngredientsOnFail` | `boolean` | `true` | Remove ingredients from inventory when the check fails. |
| `consumption.breakToolsOnFail` | `boolean` | `false` | Break Tools when the crafting check fails (renamed from the legacy `consumeCatalystsOnFail`, which is still read as a fallback). |
| `progressive.awardMode` | `string` | `"equal"` | Progressive award mode: `"equal"`, `"exceed"`, or `"partial"`. |
| `outcomes` | `string[]` | `["fail","pass"]` | Named outcome labels used for routed check routing. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

The `alchemy` field is present only when `resolutionMode` is `"alchemy"`.
It carries the alchemy check mode and the discovery/consumption options.

`alchemy` shape:

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Field | Type | Default | Description |
|:------|:-----|:--------|:------------|
| `checkMode` | `string` | `"none"` | How a matched brew is resolved. `"none"` runs no check and always succeeds. `"simple"` runs a mandatory pass/fail check from `craftingCheck.simple` (pass produces the success group, fail produces the reserved `role: 'failure'` group). `"tiered"` runs a mandatory routed check from `craftingCheck.routed` and routes by outcome tier, exactly like `routedByCheck`. |
| `learnOnCraft` | `boolean` | `false` | Mark a recipe as learned for the crafting character when a submission matches it. A match learns the recipe whether or not the check passed. |
| `consumeOnFail` | `boolean` | `true` | Consume the submitted components on a no-match fizzle and on a matched Simple-check failure. |
| `showAttemptHistoryToPlayers` | `boolean` | `true` | Remember a character's fizzled combinations so the workbench can mark them as a dead end rather than an untried mix. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

**Example: routed-by-check.** Configure a `routedByCheck` system to roll a check and route the result by outcome name:

```javascript
Hooks.once('fabricate.ready', async () => {
  const mgr = game.fabricate.getCraftingSystemManager();
  await mgr.updateSystem('alchemy-system-id', {
    resolutionMode: 'routedByCheck',
    craftingCheck: {
      routed: {
        rollFormula: '1d20 + @abilities.int.mod',
        dc: 18
      },
      outcomes: ['fail', 'pass']
    }
  });
});
```

**Example: optional simple check.** Enable an optional pass/fail check in simple mode by setting a roll formula and turning the check on:

```javascript
Hooks.once('fabricate.ready', async () => {
  const mgr = game.fabricate.getCraftingSystemManager();
  await mgr.updateSystem('alchemy-system-id', {
    craftingCheck: {
      enabled: true,
      simple: {
        rollFormula: '1d20 + @abilities.int.mod',
        dc: 15
      }
    }
  });
});
```

**Example: alchemy Simple check.** Give an alchemy system a mandatory pass/fail check so a matched brew rolls, and produces the reserved failure result group on a fail:

```javascript
Hooks.once('fabricate.ready', async () => {
  const mgr = game.fabricate.getCraftingSystemManager();
  await mgr.updateSystem('alchemy-system-id', {
    alchemy: { checkMode: 'simple' },
    craftingCheck: {
      simple: {
        rollFormula: '1d20 + @abilities.int.mod',
        dc: 15
      }
    }
  });
});
```

### updateSystem(systemId, updates)

Updates a system's configuration.
GM only.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `systemId` | `string` | System ID |
| `updates` | `object` | Partial system data to merge |

**Returns:** `Promise<object>`

When updating `features`, only the keys you provide are changed.
Other feature flags are preserved from the existing system.

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
// Enable salvage with routed mode on an existing system.
Hooks.once('fabricate.ready', async () => {
  const mgr = game.fabricate.getCraftingSystemManager();
  await mgr.updateSystem('blacksmithing-system-id', {
    features: { salvage: true },
    salvageResolutionMode: 'routed',
    salvageCraftingCheck: {
      routed: {
        rollFormula: '1d20 + @abilities.int.mod',
        dc: 18
      },
      consumption: {
        consumeComponentOnFail: true,
        breakToolsOnFail: false
      },
      outcomes: ['critical', 'pass', 'fail']
    }
  });
});
```

{: .warning }
> Changing `resolutionMode` is destructive and deletes all recipes in the system.

### deleteSystem(systemId)

Deletes a system and all its recipes.
GM only.

**Returns:** `Promise<void>`

Deleting a system emits one summary notification naming the crafting system and counting related entities deleted with it.
It does not emit one notification per deleted recipe.

Deletion is resilient to a recipe that cannot be removed.
If an individual recipe deletion fails, that failure is logged to the console with the recipe id, the remaining recipes are still deleted, and the system itself is still removed.
In that case the summary is a warning that also reports how many recipes could not be auto-deleted and may need manual removal.

---

## Component Methods

### getItems(systemId, search)

Returns components for a system, optionally filtered by search text.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `systemId` | `string` | System ID |
| `search` | `string` | Optional search filter |

**Returns:** `object[]`

The system object exposes components under two equivalent properties: `components` (primary) and `managedItems` (transitional alias).
Both always refer to the same array.

### addItemFromUuid(systemId, itemUuid)

Adds a single Foundry Item document to the system as a component.
GM only.

Returns a result object that indicates whether the item was newly created, updated, or already up to date, so callers can show appropriate notifications.

The method resolves both the dropped item's live UUID and its canonical source UUID (via `_stats.compendiumSource`, with `flags.core.sourceId` as a legacy fallback) before deciding what to do.
If the canonical source UUID no longer resolves, Fabricate stores the live dropped item UUID as the component's primary source and keeps the broken canonical UUID in `aliasItemUuids`.
A component can claim a full source-reference chain through `registeredItemUuid`, `originItemUuid`, and `aliasItemUuids`.

1. **Claimed source chain.**
   An existing component already claims either the dropped live UUID, the canonical source UUID, or a fallback UUID in the same chain.
   Fabricate refreshes the component in place and returns `action: "updated"` when metadata or stored references changed, or `action: "skipped"` when nothing changed.
2. **Unclaimed source chain.**
   No component claims any of those references, so a new component is created and `action` is `"added"`.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `systemId` | `string` | System ID |
| `itemUuid` | `string` | UUID of the Foundry item to add. Accepts both world item UUIDs (`Item.abc123`) and compendium item UUIDs (`Compendium.pack.id.itemId`). |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

**Returns:** `Promise<{ item: object, action: 'added' | 'updated' | 'skipped', sourceFallbacks: object[] }>`

- `item` is the component object (new or existing).
- `action` is `"added"` if a new component was created, `"updated"` if an existing component's name/image/source references were refreshed, `"skipped"` if the claimed source chain was already current.
- `sourceFallbacks` holds broken source-link fallback notices in the form `{ itemName, brokenUuid, fallbackUuid }`.
  It is empty when no fallback occurred.

**Throws:** `Error` if the system ID is not found, or if the UUID resolves to a non-Item document (such as an Actor or JournalEntry).

```javascript
Hooks.once('fabricate.ready', async () => {
  const mgr = game.fabricate.getCraftingSystemManager();
  const result = await mgr.addItemFromUuid(
    'alchemy-system-id',
    'Compendium.dnd5e.items.moonpetalHerb123'
  );
  if (result.action === 'added') {
    console.log(`Added: ${result.item.name} (componentId: ${result.item.id})`);
  } else if (result.action === 'updated') {
    console.log(`Updated metadata for: ${result.item.name}`);
  } else {
    console.log(`Already registered: ${result.item.name} — no changes needed.`);
  }
});
```

### addItemsFromPack(systemId, packId)

Imports all Item documents from a compendium pack into the system as components.
GM only.

Each item is processed via `addItemFromUuid()`, so the same source-chain deduplication rules apply: items already registered by the same live UUID or canonical source UUID are updated or skipped in place, and only unclaimed source chains create new components.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `systemId` | `string` | System ID |
| `packId` | `string` | Compendium pack identifier in `"scope.name"` format (e.g. `"dnd5e.items"`) |

**Returns:** `Promise<{ added: number, updated: number, skipped: number, total: number, sourceFallbacks: object[] }>`

- `added` is the number of items created as new components on this call.
- `updated` is the number of items already registered whose name, image, or description was refreshed from the source.
- `skipped` is the number of items already registered and already up to date, with no changes written.
- `total` is the total number of Item documents found in the pack.
- `sourceFallbacks` holds aggregated broken source-link fallback notices from imported items.

**Throws:** `Error` if the system ID or pack ID is not found.

```javascript
Hooks.once('fabricate.ready', async () => {
  const mgr = game.fabricate.getCraftingSystemManager();
  const result = await mgr.addItemsFromPack(
    'herbalism-system-id',
    'world.herbs-and-reagents'
  );
  console.log(
    `Imported ${result.added} new, updated ${result.updated}, ` +
    `skipped ${result.skipped} of ${result.total} items.`
  );
});
```

{: .note }
> You can also trigger bulk import from the UI by dragging a compendium pack header onto the **Items** tab drop zone in the Crafting Admin panel.
> The same deduplication logic applies.
> See [Bulk compendium pack drop]({% link crafting-systems.md %}#bulk-compendium-pack-drop) for details.

### addToolFromUuid(systemId, itemUuid)

Registers a single Foundry Item document directly as a first-class [Tool]({% link tools.md %}) in the system's Tools library (issue 561).
GM only.

The Item does not need to be imported as a component first.
The new tool carries its own source references and a name/image display snapshot captured from the Item, and `componentId` is `null`.
The method stamps the durable tool identity flag (`flags.fabricate.roles[systemId].toolId`) on the source Item so future copies are recognised.
An Item that is already a managed component can also be registered as a tool this way, in which case the Item carries both the component and tool role flags.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `systemId` | `string` | System ID |
| `itemUuid` | `string` | UUID of the Foundry item to register as a tool |

**Returns:** `Promise<{ item: object, action: 'added' }>`

**Throws:** `Error` if the system ID is not found, or if the UUID resolves to a non-Item document.

```javascript
Hooks.once('fabricate.ready', async () => {
  const mgr = game.fabricate.getCraftingSystemManager();
  const result = await mgr.addToolFromUuid(
    'blacksmithing-system-id',
    'Item.hammer123'
  );
  console.log(`Registered tool: ${result.item.name} (toolId: ${result.item.id})`);
});
```

### updateItem(systemId, itemId, updates)

Updates a component's properties (tags, essences, difficulty, salvage).
GM only.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `systemId` | `string` | System ID |
| `itemId` | `string` | Component ID |
| `updates` | `object` | Partial item data |

**Returns:** `Promise<object>`

If `updates` changes `registeredItemUuid`, `originItemUuid`, or `aliasItemUuids`, the manager enforces the same per-system uniqueness rule used by imports.
An update that would make two components claim the same source-reference chain throws an `Error`.

When `features.salvage` is enabled on the system, you can set the `salvage` sub-object here.
The shape is normalised on write.
See [Component Salvage Configuration]({% link salvage.md %}#component-salvage-configuration) for the full field reference.

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

Removes a component from the system.
GM only.

When a component is deleted, any essence definitions that had their `sourceItemUuid` pointing to that item are automatically updated.
Their `sourceItemUuid` is set to `null`.

**Returns:** `Promise<boolean>`

---

## Essence Methods

### getEssenceDefinitions(systemId)

Returns all essence definitions for a system.

**Returns:** `object[]`

Each returned object has the following shape:

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Field | Type | Description |
|:------|:-----|:------------|
| `id` | `string` | Unique identifier derived from the name |
| `name` | `string` | Display name |
| `description` | `string` | Flavour text (may be empty) |
| `icon` | `string` | FontAwesome class string. Always a non-empty string, and defaults to `fas fa-mortar-pestle`. |
| `sourceItemUuid` | `string\|null` | Authoritative field. The `componentId` of the component linked to this essence, or `null`. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

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

These methods are called automatically by `createSystem`, `updateSystem`, `createItem`, `addItemFromUuid`, `addItemsFromPack`, and `updateItem`.
You do not call them directly, but understanding them helps when inspecting or migrating stored data.

### _normalizeCraftingCheck(check)

Normalises the `craftingCheck` object on a crafting system.
Applies defaults for all fields including `enabled`, `consumption`, `outcomes`, and the per-mode `simple`, `routed`, and `progressive` sub-objects (each with its own `rollFormula`).
`enabled` is the on/off toggle for the optional simple-mode check.
A check becomes usable only when its resolution-mode sub-object carries an authored `rollFormula`.

### _normalizeSalvage(salvage)

Normalises the `salvage` sub-object for a single component.
Called by `_normalizeComponent` when `features.salvage` is `true` on the system.

Applies defaults: `enabled: false`, `ingredientQuantity: 1`, `toolIds: []`, `resultGroups: []`.
The optional fields `outcomeRouting`, `timeRequirement`, and `currencyRequirement` are included only when present and non-null in the input.

### _normalizeToolIds(toolIds)

Normalises `salvage.toolIds` (the library [Tool]({% link tools.md %}) ids required for the salvage operation).
Coerces to trimmed, non-empty, deduped strings.
Tolerant of non-array / nullish input (returns `[]`).

### _normalizeSalvageResult(result)

Normalises a single entry in a result group's results array.
Uses componentId as the identifier field.
quantity must be a positive finite number.
Invalid values fall back to 1.

### _normalizeSalvageResultGroup(group)

Normalises a single entry in `salvage.resultGroups`.
Assigns a random ID when `id` is absent.
Falls back to `"Result Group"` when `name` is absent or empty.
Normalises each entry in `results` via `_normalizeSalvageResult`.
Returns `null` for invalid input.
`null` entries are filtered out.

### _normalizeTimeRequirement(time)

Normalises a time requirement object.
Accepts any combination of `minutes`, `hours`, `days`, `months`, and `years`.
Only keys whose values are positive finite numbers are included in the output.
Zero, negative, or non-numeric values are dropped entirely.

### _normalizeCurrencyRequirement(currency)

Normalises a currency requirement object.
`unit` defaults to `"gp"` when absent or empty.
`amount` must be a positive finite number.
Invalid values produce `0`.

### _normalizeSalvageCraftingCheck(check)

Normalises the system-level `salvageCraftingCheck` object.
See the field reference table in [createSystem](#createsystemdata) above for the full default and validation rules applied by this method.
