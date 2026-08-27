---
layout: default
title: Crafting Systems
nav_order: 3
has_children: true
---

# Crafting Systems

A **crafting system** is a self-contained configuration that groups together environments, components, essences, recipes, and rules.
You can have multiple crafting systems in a single world.
For example, "Alchemy", "Blacksmithing", and "Enchanting" could each be their own system with different recipes and rules.

This page covers creating a system and the settings that live on the system itself.
Three more pages sit beneath it:

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Page | What it holds |
|:-----|:--------------|
| [System Overview]({% link crafting-systems/system-overview.md %}) | Every open issue across the system, and what a blocker hides from players. |
| [Startup & Preferences Cleanup]({% link crafting-systems/startup-cleanup.md %}) | What Fabricate tidies away on load, and why. |
| [Import & Export]({% link crafting-systems/import-export.md %}) | Moving a whole system between worlds as JSON. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

---

## Creating a System

{: .gm }
> Only GMs can create and manage crafting systems.

Open the GM admin panel (**Manage Crafting Systems** in the Items sidebar) and click **Create System** in the Systems tab.

{% include screenshot.html case="manager-default-selection" caption="The system library, with the selected system summarised on the right." %}

### System Settings

Open a system from the library to edit its base settings.

{% include screenshot.html case="manager-system-edit-normal" %}

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Setting                      | Description                                                                                                                                        |
|:-----------------------------|:---------------------------------------------------------------------------------------------------------------------------------------------------|
| **Name**                     | Display name shown in the UI                                                                                                                       |
| **Description**              | Optional flavour text                                                                                                                              |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

The recipe and salvage resolution modes are not set on this screen.
They live on the **Settings** page of the **Crafting** menu.
See [Resolution Modes]({% link crafting/recipes/index.md %}#resolution-modes) and [Salvage]({% link components/salvage.md %}#salvage-resolution-mode).

The **Name** and **Description** you type are held until you click **Save details**.
An **Unsaved** chip appears beside that button while either field differs from what is stored, and it clears once the save goes through.

If you navigate away, or switch to another crafting system, while the **Unsaved** chip is showing, Fabricate asks what to do first.
**Save** stores the pending name and description and then continues.
**Discard Changes** puts both fields back to their stored values and then continues.
**Keep Editing** cancels the move and leaves your typing intact.
Moving between the tabs of the same system keeps what you typed and does not ask, because you have not left the form.

While you have unsaved details open, a change made to the same system somewhere else is not merged into the fields you are editing.
Saving replaces it with your values, so finish or discard your edit before picking up someone else's.
The other cards on this screen, such as the feature toggles, apply as soon as you change them and are never part of this prompt.

### Feature Toggles

Each system can independently enable or disable optional features.
Most optional features are off by default and must be explicitly enabled by a GM.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Feature             | Default | Description                                                                                                                                               |
|:--------------------|:--------|:----------------------------------------------------------------------------------------------------------------------------------------------------------|
| Salvage             | On      | Enable component salvage, its check configuration, and the player Salvage tab in the Inventory inspector. Turning it off preserves whatever salvage you have already authored |
| Essences            | Off     | Enable the essences system for abstract ingredient properties                                                                                             |
| Property macros     | Off     | Allow result items to have their properties set by a macro. With essences also enabled, each contributing essence can carry its own property macro too   |
| Effect transfer     | Off     | Transfer active effects from essence source items to crafted results                                                                                      |
| Multi-step recipes  | Off     | Allow recipes with multiple sequential steps. Turning it off keeps any multi-step recipes you have authored and collapses each one into a single combined action that produces its final results, until you turn it back on |
| Gathering           | Off     | Show the Gathering group for authoring gathering environments, tasks, and events. Any enabled system also exposes the player Gathering action in the Items Directory |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

Toggle optional features in the **Features** card on the System tab of the Crafting Admin panel.
Each toggle takes effect immediately for all future crafting attempts in that system.

You set the recipe and salvage resolution modes on the **Settings** page of the **Crafting** menu, not on the main System settings page.
The Crafting menu is always available for every crafting system.
See [The Crafting Menu]({% link crafting/index.md %}).

Changing the **recipe resolution mode** migrates your recipes to the new mode wherever it can, instead of deleting them all.
Fabricate reshapes each recipe so it fits the new mode, and only removes a recipe when its structure cannot be made to fit.
You will be asked to confirm before anything changes.

{: .note }
> The confirmation runs a dry run first and reports accurate counts: how many recipes will be migrated to the new mode and, only when some cannot be migrated, how many will be deleted and their names.
When no recipe needs deleting, the confirmation does not mention deletion at all.

A recipe is only deleted when its shape cannot fit the new mode.
This happens in two cases: narrowing into Simple or Progressive mode (which each expect exactly one ingredient set and one result group) from a recipe that has more than one of either, and moving a multi-step recipe into Alchemy mode (which does not support multi-step recipes).
Every other recipe is kept and adjusted to suit the new mode.

A missing setup at the system level never deletes a recipe.
For example, switching to Progressive mode without a progressive crafting check, or to Routed by check mode without a roll formula, does not remove recipes.
Those gaps are reported in the System Overview instead, and they hide recipes from players until you fix them rather than deleting anything.
See [System Overview]({% link crafting-systems/system-overview.md %}).

When the new mode is Alchemy, a recipe that has more than one ingredient set is kept and collapsed to its first set, because an alchemy recipe has a single ingredient set.
The system's Alchemy check starts switched off, and you can turn it on and choose Simple or Tiered on the Checks screen afterwards.
Fabricate also re-checks recipe ingredient signatures so any overlap that would make alchemy attempts ambiguous is surfaced rather than silently broken.

After the change, Fabricate shows a summary of how many recipes were migrated, and a separate warning listing any recipes it had to delete.

Changing the **salvage resolution mode** is not destructive to recipes or runs.
No recipes or runs are deleted.
Any component whose salvage setup is incompatible with the new mode simply has its salvage disabled, and can be re-enabled once it is reconfigured.
You will be asked to confirm.

Switching a system **into** Simple mode is the one case that changes component setups.
Simple mode awards a single result group, so any component that has more than one is trimmed back to its first when you switch.
Fabricate warns you by name when this happens, listing every component it trimmed, so nothing is dropped silently.

The **Salvage resolution mode** card offers Simple (the default), Progressive, and Routed by check.
A salvaged component has a single ingredient, so ingredient-set routing (and Alchemy) does not apply and is not offered.
Simple returns one result group with an optional pass/fail salvage check.

### Chat Output

Fabricate automatically posts a chat message to the table after every crafting or gathering action.

**Success messages** include:

- Crafter name (the actor who performed the craft)
- Recipe or gathering task name
- Items created, with quantities
- Ingredients consumed, with quantities
- Tools used (and any that broke)

**Failure messages** include:

- Crafter name
- Recipe or gathering task name
- Failure reason
- Any ingredients consumed or tools broken as part of the failure

Both success and failure messages show the **rolled check total** on its own row when a check ran.
A guaranteed craft or salvage that needs no roll omits the row, because there is no total to report.

Chat messages appear as if spoken by the crafting actor.

**When chat output does not fire.** Chat messages are only posted for craft attempts that reach the engine's resolution step.
Early validation failures do not post a chat message, because the craft never started.
These failures include a missing actor, missing ingredients, missing or unsatisfied tools, and invalid recipe configuration.

**Interactive check rolls.** When a player crafts or gathers from the UI, Fabricate also posts the check's dice roll to chat so a dice-animation module like Dice So Nice can animate it.
See [Rolling a check from the UI]({% link checks/crafting.md %}#rolling-a-check-from-the-ui) for the prompt, the situational-modifier field, and which rolls do not prompt.

### Crafting Checks

If your system uses Routed by check mode, or Progressive mode, you must configure a crafting check to gate outcomes on a player roll.
See [Crafting Checks]({% link checks/crafting.md %}) for the settings, consumption-on-failure policies, and worked examples.
If your game counts qualifying dice across a pool rather than adding one die to a modifier, see [Success-counting checks]({% link checks/crafting.md %}#success-counting-checks).

### Effect Transfer

When both the Essences and Effect transfer features are enabled, Fabricate can copy active effects from essence source items to crafted results.
See [Effect Transfer]({% link essences/effect-transfer.md %}) for how the feature is enabled, configured, and used, with worked examples.

### Recipe Visibility

Recipe visibility controls which players can see and access recipes in the player Crafting tab, backed by the visibility service.
You configure this per crafting system in the **Recipe Visibility** card on the **Settings** page of the **Crafting** menu.
The Crafting menu is always available for every crafting system.
See [The Crafting Menu]({% link crafting/index.md %}).

Each system uses one of four visibility modes:

| Visibility mode  | Description                                                                 |
|:-----------------|:---------------------------------------------------------------------------|
| Global (default) | All recipes visible to all users                                           |
| Restricted       | GM grants individual recipes to specific characters and players            |
| Item             | Players craft a recipe only while holding a book or scroll linked to it    |
| Knowledge        | Players learn a recipe from a book or scroll before they can craft it      |

Selecting a mode applies at once and never rewrites your recipes.
The mode you choose decides which extra surfaces appear in the **Crafting** menu, such as the **Access** section for Restricted mode or **Books & Scrolls** limits for Item and Knowledge modes.

For full details on each mode, recipe items, the learn flow, and configuration examples, see [Crafting Settings]({% link crafting/settings.md %}#recipe-visibility).

### Alchemy Mode

Alchemy mode is a special resolution mode where recipe names and ingredient lists are hidden from players.
Macros and integrations can submit selected items to the alchemy engine.
Fabricate matches the combination against known recipe signatures.
Set the resolution mode of a system to Alchemy to enable this.
See [Alchemy Mode]({% link crafting/recipes/alchemy.md %}) for current usage, the Alchemy check setting, signature matching, consume-on-fail, and learn-on-craft options.

---

## Requirements

Systems can optionally require time for crafting, or opt into the world's currency.

### Time Requirements

Time requirements let a recipe require an amount of time to craft, given in minutes, hours, days, months, or years.
A single-step recipe carries one duration on its **Duration** card.
Each step of a multi-step recipe can carry its own duration.
While a duration is running, the step is blocked until world time advances past the required duration.

Time gates are checked:

- When a player tries to advance a step
- Automatically when world time changes
- On module startup

Time requirements are on by default.
You turn them on or off with the **Time requirements** toggle in the **Optional features** section of the system settings editor, next to the currency toggle.

{: .note }
> Fabricate shows the duration editors on a recipe only while time requirements are enabled for the system.
> Turning them off later does not delete the durations you have already authored.
> The authored values stay visible as read-only values in GM authoring summaries, and a step no longer waits on time until you re-enable time requirements.

### Currency Requirements

When you enable currency requirements, a recipe ingredient can offer a currency cost as an alternative to its items.
A crafter who does not have the items can pay the cost from their own coins instead.
Fabricate tries each ingredient's item options first, and falls back to a currency cost only when no item option is satisfied.
Before the craft begins, Fabricate checks whether the crafting actor can afford every currency cost the craft will use, then spends those costs after the item ingredients are consumed.
If the actor cannot pay, the craft is stopped before anything is consumed and Fabricate reports that there is not enough currency.

Currency requirements are off by default.
You turn them on or off with the **Currency** toggle in the **Optional features** section of the system settings editor, next to the time toggle.
This toggle only decides whether the system participates.
The coin ladder, the spend strategy, the provider, and the currency macros are all configured once for the whole world, not per system.
See [World Currency]({% link world/rules/currency.md %}) for how a GM authors them.

{: .note }
> The recipe editor offers to add a currency cost only while currency is enabled for the system and the world has at least one currency unit defined.
> This keeps the editor from offering a cost the system cannot honour.
> Turning currency off later does not delete the costs you have already authored.
> Each one stays visible on its recipe, but becomes read-only and is marked **Currency off**, and it stays inactive until you re-enable currency.
