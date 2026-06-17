---
layout: default
title: Salvage
nav_order: 3.3
---

# Salvage

When the salvage feature is enabled on a system, players can dismantle components to recover partial materials.
Salvage has no dedicated UI toggle today.
It is set up by a developer through the API.
You configure salvage at two levels:

- the system, which determines how salvage checks work
- each component, which determines what that component yields when broken down

Enabling the salvage feature is done through the API today.
See the [CraftingSystemManager API]({% link api/system-manager.md %}).

## Salvage Resolution Mode

The salvage resolution mode controls how result groups are awarded when a component is salvaged.
It is set at the system level.

| Mode        | Description                                                                                                                          |
|:------------|:-------------------------------------------------------------------------------------------------------------------------------------|
| Simple      | Always awards exactly one result group. No check required. This is the default.                                                      |
| Routed      | Awards a result group based on the outcome of a salvage check. Each outcome (such as critical, pass, or fail) is mapped to a result group on the component. |
| Progressive | Awards results sequentially as the check value exceeds each result's difficulty threshold.                                           |

The salvage resolution mode is set through the API today.
See the [CraftingSystemManager API]({% link api/system-manager.md %}).

## Salvage Crafting Check

When the salvage resolution mode is Routed or Progressive, you must configure a salvage check.
This is separate from the recipe crafting check.
A system can have both.

---

## See Also

- [Crafting Systems]({% link crafting-systems.md %}). Enable the salvage feature and set the resolution mode for your system.
- [Crafting Checks]({% link crafting-checks.md %}). The recipe crafting check works similarly to salvage checks. See also consumption-on-failure policies.
- [Tools]({% link tools.md %}). Configure the requirement, breakage, and on-break behaviour of tools required during salvage.
