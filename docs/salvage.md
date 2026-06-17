---
layout: default
title: Salvage
nav_order: 3.3
---

# Salvage

When the `salvage` feature is enabled on a system, players can dismantle components to recover partial materials. 
Salvage has no dedicated UI toggle today.
It is an API-configured capability. 
You configure salvage at two levels: 

- the system, which determines how salvage checks work 
- each component, which determines what that component yields when broken down

Enable the `salvage` feature through the API only today. 
See the [CraftingSystemManager API]({% link api/system-manager.md %}).

## Salvage Resolution Mode

The salvage resolution mode controls how result groups are awarded when a component is salvaged.
It is set at the system level via `salvageResolutionMode`.

| Value           | Description                                                                                                                                                                              |
|:----------------|:-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `"simple"`      | Always awards exactly one result group. No check required. Default.                                                                                                                      |
| `"routed"`      | Awards a result group based on the outcome of a salvage check. Outcome labels (e.g. `"critical"`, `"pass"`, `"fail"`) are mapped to result groups via `outcomeRouting` on the component. |
| `"progressive"` | Awards results sequentially as the check value exceeds each result's difficulty threshold.                                                                                               |

{: .warning }
> `"mapped"` and `"alchemy"` are not valid salvage resolution modes and will be rejected. Use `"routed"` if you need outcome-based routing.

Set `salvageResolutionMode` through the API only.
See the [CraftingSystemManager API]({% link api/system-manager.md %}).

## Salvage Crafting Check

When `salvageResolutionMode` is `"routed"` or `"progressive"`, you must configure a salvage check. 
This is separate from the recipe crafting check.
A system can have both.

---

## See Also

- [Crafting Systems]({% link crafting-systems.md %}). Enable the `salvage` feature and set the resolution mode for your system.
- [Crafting Checks]({% link crafting-checks.md %}). The recipe crafting check pipeline works similarly to salvage checks. See also consumption-on-failure policies.
- [Tools]({% link tools.md %}). Configure the requirement, breakage, and on-break behaviour of tools required during salvage.
