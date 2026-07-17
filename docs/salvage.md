---
layout: default
title: Salvage
nav_order: 3.3
---

# Salvage

When the salvage feature is enabled on a system, players can dismantle components to recover partial materials.
Salvage is on by default for every system, and you turn it off with the **Salvage** toggle in the **Features** card on the System tab of the Crafting Admin panel.
You configure salvage at two levels:

- the system, which determines how salvage checks work
- each component, which determines what that component yields when broken down

Players salvage from the **Inventory** tab of the Fabricate window.
See [Salvaging From the Inventory Tab](#salvaging-from-the-inventory-tab).

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

Everything a player is shown when they salvage comes from the salvage check, never from the recipe crafting check.

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

## Salvaging From the Inventory Tab

Players salvage from the **Inventory** tab of the Fabricate window.
Selecting an owned component opens the inspector beside the grid.
When the component is salvageable, the inspector shows an **Info** tab and a **Salvage** tab.
An item that cannot be salvaged shows no tab bar at all.

Salvage happens inline in the inspector, so nothing opens in a separate window.
Cards in the grid carry a recycle badge in their top-left corner when the component is salvageable, so players can see what can be broken down without opening each item.

### What the Salvage Tab Shows

The tab opens with a short banner naming the rule the component follows, then lists what the player stands to recover.
What it lists depends on the system's salvage resolution mode, and on whether you have given that mode a salvage check roll formula.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Setup | What the player sees |
|:------|:---------------------|
| Simple, with no salvage check roll formula | **You will recover**, then the materials, each tagged **Guaranteed**. No roll is made. |
| Simple, with a salvage check roll formula | **On a success**, the materials, the DC to beat, and a note that a failed roll can cost the component. |
| Routed by check | Every outcome you authored, with the materials each one recovers. |
| Progressive | The result stages in order, each showing that component's own progressive DC as **DC N** and the check value that reaches it as **Reach ≥N**. |
| Routed or Progressive with no salvage check roll formula | **Salvage isn't ready**, and a line asking the player to speak to you. The action is disabled and nothing can be consumed. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

A component's DC override shifts the DC shown for a simple check, and it shifts the thresholds shown for relative outcome tiers.
Fixed tiers own absolute segments of the roll range and have no DC, so they are shown exactly as you authored them and no DC appears.
Progressive salvage is different again.
The progressive salvage check itself has no DC, because its roll is a budget spent down the stage list rather than a pass-or-fail against a target.
Each component still carries its own progressive DC, and that DC is shown on its stage beside the reach value.
See [Relative and fixed tiers]({% link crafting-checks.md %}#relative-and-fixed-tiers).

### Making the Attempt

The footer holds a single button that rolls and commits in one press.
It reads **Salvage** when the mode needs no roll, and **Salvage roll** when it has a usable check.
Pressing it opens the standard roll prompt, where the player picks Advantage, Normal or Disadvantage when the formula allows it, adds a situational bonus, and chooses a roll mode.
The roll is posted to chat, so Dice So Nice animates it.
There is no reroll and no separate confirmation step.

Dismissing the prompt cancels the attempt.
Nothing is consumed, no tool breaks, and no message is shown.
The tab returns to how it looked before the roll.

Once the roll resolves, a read-only summary appears, the body marks what was recovered and what the roll fell short of, and a ribbon confirms the materials were added.
When the salvage involved a roll, the summary reports its total alongside what was recovered; a guaranteed, no-check salvage shows none, because nothing was rolled.
**Salvage again** clears the summary and returns the tab to its pre-roll state.
The ribbon stays with the component that was salvaged, even when the last copy was consumed and its card has left the grid.
When that last copy is gone, the header reads **None remaining** and **Salvage again** is withheld, because there is nothing left to break down.

When the system's chat-output feature is on, salvage also posts a result card to chat, in the same format crafting uses.
It is the same card as a crafting result, reading as its salvage counterpart: it names the source that was broken down, the materials recovered, and any tools that broke, and it posts on both a success and a rolled failure.
A cancelled prompt, a salvage that is not yet configured, and a run that has only started against a time requirement post nothing, because none of them has changed anything to report.
This is the same **Chat output** feature that governs crafting cards, set on the **Features** card of the System tab in the Crafting Admin panel.

When the component carries a time requirement, the press starts a run rather than finishing the salvage.
The tab then shows the run's waiting message instead of a ribbon, and the materials arrive as world time advances.

### Broken Tools

A broken tool still shows its **Salvage** tab and can still be salvaged.
Being broken stops a tool being used for crafting, but it does not stop it being recycled, which is usually the most useful thing left to do with it.

The **Info** tab carries a banner saying the tool is broken and cannot be used for crafting, and the card shows a **Broken** marker in place of its quantity.
Both are read-only, and Fabricate offers no repair action.

A tool reads as broken in the Inventory tab when its on-break action has flagged it as broken, or when it has spent all of its limited uses.
The spent-uses reading is skipped while the system's **Tool breakage source** is **Check-driven**, because under that source the check decides breakage and a tool's use count decides nothing.
See [Tools]({% link tools.md %}#on-break-actions).

## Player Result Re-ordering

A component set up for progressive salvage carries an **Allow player result re-ordering** setting on its salvage setup, and it is on by default.
It decides whether a player's own preferred stage order is used when that component is salvaged, or whether your authored order always is.

When it is on, the player can drag a stage on the **Salvage** tab, or move it with the move up and move down controls on each stage.
Each move is announced for screen readers, and the reach values update to match the new order.
A chosen order is a standing preference rather than a one-off choice, remembered per player and per component, in this world only.

The player can also **Reset** the list back to your authored order.
Reset clears that player's preference rather than pinning your current order, so if you later re-author the stages, that player follows the new order.

When it is off, the stage list is shown in your authored order, marked **Order set by the GM**, and players cannot rearrange it.

A salvage run fixes the order it will use at the moment it starts, so a run that finishes later, over world time, still awards the order it began with.
Once a salvage has resolved, the list locks and a note explains that the roll has already run down it.

See [Progressive Mode]({% link recipes/progressive.md %}#player-result-re-ordering) for how the same setting behaves on recipes.

---

## See Also

- [Crafting Systems]({% link crafting-systems.md %}).
Enable the salvage feature and set the resolution mode for your system.
- [Crafting Checks]({% link crafting-checks.md %}).
The recipe crafting check works similarly to salvage checks.
See also consumption-on-failure policies.
- [Tools]({% link tools.md %}).
Configure the requirement, breakage, and on-break behaviour of tools required during salvage.
