---
layout: default
title: Salvage
nav_order: 3.3
---

# Salvage

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

## Salvage Resolution Mode

The salvage resolution mode controls how result groups are awarded when a component is salvaged. It is set at the system level via `salvageResolutionMode`.

| Value | Description |
|:------|:------------|
| `"simple"` | Always awards exactly one result group. No check required. Default. |
| `"routed"` | Awards a result group based on the outcome of a salvage check. Outcome labels (e.g. `"critical"`, `"pass"`, `"fail"`) are mapped to result groups via `outcomeRouting` on the component. |
| `"progressive"` | Awards results sequentially as the check value exceeds each result's difficulty threshold. |

{: .warning }
> `"mapped"` and `"alchemy"` are not valid salvage resolution modes and will be rejected. Use `"routed"` if you need outcome-based routing.

```javascript
Hooks.once('fabricate.ready', async () => {
  const mgr = game.fabricate.getCraftingSystemManager();
  await mgr.updateSystem('blacksmithing-system-id', {
    features: { salvage: true },
    salvageResolutionMode: 'routed'
  });
});
```

## Salvage Crafting Check

When `salvageResolutionMode` is `"routed"` or `"progressive"`, you must configure a salvage check. This is separate from the recipe crafting check — a system can have both.

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
| `outcomes` | `string[]` | `["fail","pass"]` | Named outcome labels used for routed outcome routing |

**Example: a Disenchanting system where the artefact is always destroyed on failure but the enchanting tools are spared:**

```javascript
Hooks.once('fabricate.ready', async () => {
  const mgr = game.fabricate.getCraftingSystemManager();
  await mgr.updateSystem('disenchanting-system-id', {
    features: { salvage: true },
    salvageResolutionMode: 'routed',
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

## Component Salvage Configuration

When `features.salvage` is `true` on a system, each component gains a `salvage` sub-object. If a component has no salvage data, defaults are applied automatically.

| Field | Type | Default | Description |
|:------|:-----|:--------|:------------|
| `enabled` | `boolean` | `false` | Whether this component can be salvaged |
| `ingredientQuantity` | `integer` | `1` | How many of this component the actor must provide to begin salvage. Must be a positive integer; invalid values (zero, negative, non-numeric) fall back to `1`. |
| `catalysts` | `array` | `[]` | Catalysts required for the salvage operation. Each entry has `componentId`, `degradesOnUse`, `destroyWhenExhausted`, and `maxUses`. |
| `resultGroups` | `array` | `[]` | The possible sets of items produced by salvage. Each group has `id`, `name`, and a `results` array. Each result has `id`, `componentId`, `quantity`, and optionally `propertyMacroUuid`. |
| `outcomeRouting` | `object` | omitted | Maps outcome labels to result group IDs. Required in routed mode. |
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

## What's next?

- [Crafting Systems]({% link crafting-systems.md %}) -- enable the `salvage` feature toggle and set the resolution mode for your system.
- [Crafting Checks]({% link crafting-checks.md %}) -- the recipe crafting check pipeline works similarly to salvage checks; see also consumption-on-failure policies.
- [Catalysts]({% link catalysts.md %}) -- configure the degradation and destruction behaviour of catalysts used during salvage.
- [Macros]({% link macros/index.md %}) -- write salvage check macros and handle success and failure callbacks.
