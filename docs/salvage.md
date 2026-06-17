---
layout: default
title: Salvage
nav_order: 3.3
---

# Salvage

When the `salvage` feature is enabled on a system, players can dismantle components to recover partial materials. Salvage has no dedicated UI toggle today — it is an API-configured capability. You configure salvage at two levels: the system (which determines how salvage checks work) and each individual component (which determines what that component yields when broken down).

Enable the `salvage` feature through the API only. See the [CraftingSystemManager API]({% link api/system-manager.md %}).

## Salvage Resolution Mode

The salvage resolution mode controls how result groups are awarded when a component is salvaged. It is set at the system level via `salvageResolutionMode`.

| Value | Description |
|:------|:------------|
| `"simple"` | Always awards exactly one result group. No check required. Default. |
| `"routed"` | Awards a result group based on the outcome of a salvage check. Outcome labels (e.g. `"critical"`, `"pass"`, `"fail"`) are mapped to result groups via `outcomeRouting` on the component. |
| `"progressive"` | Awards results sequentially as the check value exceeds each result's difficulty threshold. |

{: .warning }
> `"mapped"` and `"alchemy"` are not valid salvage resolution modes and will be rejected. Use `"routed"` if you need outcome-based routing.

Set `salvageResolutionMode` through the API only. See the [CraftingSystemManager API]({% link api/system-manager.md %}).

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
| `consumption.consumeCatalystsOnFail` | `boolean` | `false` | Whether salvage tools are broken/degraded even when the check fails (field name retained for backward compatibility; it now governs Tools) |
| `progressive.awardMode` | `string` | `"equal"` | How results are awarded in progressive mode: `"equal"`, `"exceed"`, or `"partial"` |
| `progressive.allowPlayerReorder` | `boolean` | `false` | Whether players can reorder pending results |
| `outcomes` | `string[]` | `["fail","pass"]` | Named outcome labels used for routed outcome routing |

**Example: a Disenchanting system where the artefact is always destroyed on failure but the enchanting tools are spared.** Configure `salvageCraftingCheck` with `consumeComponentOnFail: true` (the artefact is destroyed either way) and `consumeCatalystsOnFail: false` (the enchanting focus tool survives a failed attempt), and list the named `outcomes` you route on. The salvage check is configured through the API only. See the [CraftingSystemManager API]({% link api/system-manager.md %}).

## Component Salvage Configuration

When `features.salvage` is `true` on a system, each component gains a `salvage` sub-object. If a component has no salvage data, defaults are applied automatically.

| Field | Type | Default | Description |
|:------|:-----|:--------|:------------|
| `enabled` | `boolean` | `false` | Whether this component can be salvaged |
| `ingredientQuantity` | `integer` | `1` | How many of this component the actor must provide to begin salvage. Must be a positive integer; invalid values (zero, negative, non-numeric) fall back to `1`. |
| `toolIds` | `string[]` | `[]` | Library [Tool]({% link tools.md %}) ids required for the salvage operation. Coerced to trimmed, non-empty, deduped strings. |
| `resultGroups` | `array` | `[]` | The possible sets of items produced by salvage. Each group has `id`, `name`, and a `results` array. Each result has `id`, `componentId`, `quantity`, and optionally `propertyMacroUuid`. |
| `outcomeRouting` | `object` | omitted | Maps outcome labels to result group IDs. Required in routed mode. |
| `timeRequirement` | `object` | omitted | Time duration fields (`minutes`, `hours`, `days`, `months`, `years`). Only positive finite values are kept. |
| `currencyRequirement` | `object` | omitted | `{ unit, amount }` where `unit` defaults to `"gp"` and `amount` must be a positive number. |

**Example: a Dragon Scale component that breaks down differently based on the salvage roll.** Enable `salvage` on the component, require a library Tool (e.g. an acid vial) via `toolIds`, define `resultGroups` for pristine and damaged salvage, and use `outcomeRouting` to map a critical result to the pristine group and pass/fail to the damaged group. Optional `timeRequirement` and `currencyRequirement` gate the operation. Component salvage configuration is set through the API only. See the [CraftingSystemManager API]({% link api/system-manager.md %}).

{: .note }
> The `salvage` sub-object is only included in a normalised component when `features.salvage` is `true` on the system. If you read a component from a system where salvage is disabled, the `salvage` key will be absent.

---

## What's next?

- [Crafting Systems]({% link crafting-systems.md %}) -- enable the `salvage` feature and set the resolution mode for your system.
- [Crafting Checks]({% link crafting-checks.md %}) -- the recipe crafting check pipeline works similarly to salvage checks; see also consumption-on-failure policies.
- [Tools]({% link tools.md %}) -- configure the requirement, breakage, and on-break behaviour of tools required during salvage.
