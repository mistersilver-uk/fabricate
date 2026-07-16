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

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Mode        | Description                                                                                                                          |
|:------------|:-------------------------------------------------------------------------------------------------------------------------------------|
| Simple      | Always awards exactly one result group. No check required. This is the default.                                                      |
| Routed      | Awards a result group based on the outcome of a salvage check. Each outcome (such as critical, pass, or fail) is mapped to a result group on the component. |
| Progressive | Awards results sequentially as the check value exceeds each result's difficulty threshold.                                           |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

The salvage resolution mode is set on the system's **Salvage resolution mode** card in the Crafting Admin panel.
The card offers Simple, Progressive, and Routed by check, with Simple selected by default.
A salvaged component has a single ingredient, so it cannot route by ingredient set, which is why ingredient-set routing (and Alchemy) is not offered here.
Changing the mode is not destructive, but any component whose salvage setup is incompatible with the new mode has its salvage disabled until you reconfigure it.

You can also set the salvage resolution mode through the API.
See the [CraftingSystemManager API]({% link api/system-manager.md %}).

## Salvage Crafting Check

When the salvage resolution mode is Routed or Progressive, you must configure a salvage check.
This is separate from the recipe crafting check.
A system can have both.

## Player Result Re-ordering

A component set up for progressive salvage carries an **Allow player result re-ordering** setting on its salvage setup, and it is on by default.
It decides whether a player's own preferred stage order is used when that component is salvaged, or whether your authored order always is.

There is no player-facing salvage screen today, so players have no way to choose a salvage order in the interface.
The setting is in place for when that screen ships.
A salvage run fixes the order it will use at the moment it starts, so a run that finishes later, over world time, still awards the order it began with.

See [Progressive Mode]({% link recipes/progressive.md %}#player-result-re-ordering) for how the same setting behaves on recipes, where players do have a screen.

---

## See Also

- [Crafting Systems]({% link crafting-systems.md %}).
Enable the salvage feature and set the resolution mode for your system.
- [Crafting Checks]({% link crafting-checks.md %}).
The recipe crafting check works similarly to salvage checks.
See also consumption-on-failure policies.
- [Tools]({% link tools.md %}).
Configure the requirement, breakage, and on-break behaviour of tools required during salvage.
