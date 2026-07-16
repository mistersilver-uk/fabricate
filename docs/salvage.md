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

## Component Salvage

Every component decides for itself whether it can be salvaged and what it yields.
You set this up in the **Salvage** panel of the component editor.
Open the **Items** tab of the Crafting Admin panel, open a component, and scroll to **Salvage**.

The panel shows a read-only label naming the system's salvage resolution mode, such as **Routed by check**.
That mode is a system setting and decides the shape of the panel below it.
You change it on the **Settings** page of the **Crafting** menu, not here.
See [Salvage Resolution Mode](#salvage-resolution-mode).

### Turning Salvage On For a Component

A component is not salvageable until you turn it on with the **Salvage this component** toggle.
Setting one up is two steps, in this order:

1. Add at least one result group under **Result groups**, describing what the component yields when it is broken down.
2. Turn on **Salvage this component**.

The toggle stays unavailable until the component has a result group, because there is nothing to enable yet.
The panel tells you which of the two states you are in, so you are never left guessing why the toggle will not move.

Removing a component's last result group turns salvage back off for that component.
This is deliberate.
A component that can be salvaged but yields nothing is not a setup Fabricate will save.

{: .note }
> **Existing components show this toggle turned off, and that is correct.**
> Before this toggle existed, per-component salvage was already stored and already enforced, but nothing in the interface could turn it on.
> Components you set up with result groups therefore render with **Salvage this component** off.
> This is the true stored state being shown for the first time rather than a setting that has been lost, and nothing has been reset or migrated.
> Turn the toggle on for each component you want salvageable.

### The Salvage DC

When the salvage check applies, a component can override the DC that check uses.

The **DC** control offers:

- **System default**, which uses the system's own salvage check DC and stores no override on the component
- one option per salvage check outcome tier you have authored, each naming the tier and its DC
- **Custom**, which reveals a number field for any DC you like

The preset options are your system's real authored tiers, not a fixed list of suggested numbers, so they always reflect the DCs your world actually uses.
If you have not authored any tiers yet, the control offers **System default** and **Custom** only.
Either way, the **Manage presets** link takes you to the Checks screen where the tiers are authored.

A DC you set that does not match any tier is kept exactly as you typed it.
It shows under **Custom** with its own value, and it is never rounded to the nearest tier.

When the system's salvage DC is set by a macro rather than a fixed number, the **System default** option says so instead of showing a DC, because there is no single number to show.

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
