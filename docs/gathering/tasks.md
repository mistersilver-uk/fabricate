---
layout: default
title: Tasks
parent: Gathering
nav_order: 2
---

# Gathering Tasks

## The task library

The selected crafting system's Gathering Tasks are managed from the Gathering **Tasks** tab.
The task browser supports search, status/biome/availability filters, paging, row selection, enable toggles, duplicate and delete actions, and a right-side inspector with availability, a matching-environment count, and drop summaries.
The row **Edit** action opens a one-page Gathering Task editor for identity, availability, drop rules, and per-drop modifier tuning.

{% include screenshot.html case="manager-gathering-task-editor-normal" caption="The Gathering Task editor, opened from the task browser." %}

Environment authoring composes Gathering Tasks and reusable events by matching environment biome (and danger for events) only.
Geography (the realm) is not a composition axis.
Weather and time of day stay visible as current condition context.
They do not decide whether a task or event belongs to the environment.
GMs can toggle matched task and event records on or off per environment.

Gathering Task records support:

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Field                                 | Description                                                                                                                                                                                          |
| :------------------------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name, description, image, enabled** | GM-authored task identity and availability                                                                                                                                                           |
| **Biomes**                            | Optional environment composition match tags. Empty means any                                                                                                                                         |
| **Weather, time of day**              | Optional runtime availability gates. Empty means any                                                                                                                                                 |
| **Drop rows**                         | Ordered item/component rows with a quantity, a drop rate from 0 to 100, and optional per-drop time/weather modifiers. The order you author them in is the rank used by the system's Gathering Rules. |
| **Stamina and modifiers**             | Optional stamina cost and a gathering roll modifier formula                                                                                                                                          |
| **Required tools**                    | Optional references to the system's Gathering Tools library. All referenced tools are required.                                                                                                      |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

{: .note }

> Stamina maximums, starting stamina, regeneration amounts, costs, and character modifiers all accept **formulas** (a number, an ability modifier, dice, and more).
> See [Expressions]({% link expressions.md %}) for ready-to-use examples.

Disabled Gathering Tasks never match for player gathering.

Reusable events are authored separately.
See [Events]({% link gathering/events.md %}).

## How Drops Are Rolled

Each Gathering Task is resolved by rolling against its drop rows.
The task's own weather and time-of-day gates decide whether it can be attempted at all.
For each enabled item row, Fabricate works out a final drop chance from the row's drop rate plus any environment adjustment and any matching per-drop time/weather modifiers (kept between 0 and 100), then rolls for it.
A task's gathering modifier improves or worsens the roll, not the final drop chance.
Matched, enabled events that pass their condition gates roll separately, each with its own modifier and trigger rate.

Environment-local task and event drop-rate adjustments can be kept on file but switched off by their apply toggles.
When an adjustment is switched off, its saved value is preserved but counts as zero while gathering.

Per-drop modifiers do not make an unavailable task available.
They only adjust an individual row's chance after the task already matches.
Multiple rows can reference the same component with different quantities and chances.
Each row rolls on its own before the system's Gathering Rules choose which rows are awarded.

Every drop row must point at a real reward, either a component from the system's component library or a resolvable world item.
Fabricate rejects rows that point at a component or item that no longer exists, and rows with no target, before saving the task.

After rolling, the system's Gathering Rules choose which reward and event rows are kept.
Rewards can be the highest ranked successful row (by authored order), every successful row, or the first few successful rows by authored order.
A triggered event can either be recorded while the gathering still succeeds, or make the attempt fail (in which case no rewards are awarded).
If no events are enabled or matched, the environment is mechanically safe even when it has a danger level.

## Task Authoring

An environment contains one or more Environment Tasks.
The task editor lets you set:

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Area               | What you set                                                                                                                                                                                                                               |
| :----------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Task basics        | Name, description, image, whether it is enabled, and how it is resolved                                                                                                                                                                    |
| Visibility gate    | Turn task visibility on or off, then set its formula and required threshold                                                                                                                                                                |
| Time requirement   | Leave clear for immediate tasks, or enter a duration in minutes, hours, days, months, or years                                                                                                                                             |
| Failure outcome    | Leave clear for Fabricate's default failure feedback, or set custom text or a macro                                                                                                                                                        |
| Result groups      | Add, rename, delete, and reorder groups                                                                                                                                                                                                    |
| Results            | Add, edit, delete, and reorder component results, each with a component and a quantity                                                                                                                                                     |
| Required tools     | Reference the system's Tools library. The tools themselves (their source item or component, optional requirement, breakage mechanic, and on-break action) are authored on the system's [Tools]({% link tools.md %}) page, not on the task. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

Progressive task result difficulty comes from the chosen component's own difficulty.
Result rows do not store their own difficulty.

New environments start as disabled drafts.
Library-backed automatic environments can be set up without a placeholder task.
Once a task is enabled, saving requires complete configuration for the way it is resolved.
For a task resolved progressively that means one result group carrying at least one result.

Task images can be typed directly or chosen with Foundry's image file picker when it is available.
Cancelling the picker leaves the current path unchanged.

## Visibility Gates

A visibility gate controls whether a gathering task is visible to a particular character before an attempt starts.
It has just two parts:

| Field     | Notes                                                                  |
| :-------- | :--------------------------------------------------------------------- |
| Formula   | A roll expression evaluated against the viewing character's roll data. |
| Threshold | The value the formula must meet for the task to be visible.            |

The editor keeps incomplete input aside until both the formula and the threshold are present.
For example, entering a formula without a threshold does not change the saved task yet.
Clearing visibility removes the gate only when the task already had one saved.

## Routed Result Selection

{: .warning }
> **Routed gathering is not available yet either.**
> Like progressive, it appears in the resolution-mode card but is disabled, pending a future release.
> The rules below are what it will do once it ships, and anything you author now is saved until then.

Routed gathering tasks do not carry their own result-selection setting.
They are resolved by the system's gathering check, which you configure once for the whole system.
When a routed task is attempted, the gathering check rolls and produces a named outcome.
That outcome name is matched to a result group by name, and the matching group is awarded.

A few outcome names are reserved and take the failure path instead of awarding a group.
Because the match is by name, give each result group a name that lines up with one of your gathering check's outcomes.
Names are matched ignoring upper and lower case and surrounding spaces, so each result group needs a name that is unique once case is ignored.

If the outcome is a success but matches none of your result groups, the attempt fails and no group is awarded.
A routed task whose system has no gathering check formula reports a setup problem for the GM to fix rather than resolving.

## Progressive Checks

{: .warning }
> **Progressive gathering is not available yet.**
> The only gathering resolution mode you can select today is `d100`, and it rolls each drop against its own percentage chance rather than a formula.
> Progressive and Routed by check appear in the resolution-mode card but are disabled, pending a future release.
> Anything you author here is saved and starts applying as soon as those modes ship.

When progressive gathering does ship, the value it spends comes from the **system's** gathering check, not from the task.
Author it on **Checks › Gathering**, beside the crafting and salvage checks.
See [Gathering Checks]({% link checks/gathering.md %}).

The award mode — equal, partial, or exceed — is the system's too, authored beside the roll on **Checks › Gathering**.
A task contributes only its results.

{% include screenshot.html case="manager-checks-gathering" %}

## Time Requirements

Gathering tasks are immediate by default.
To keep a task immediate, leave its time requirement clear.

To make a task take time, enter a positive duration across any of these fields:

| Field   | Description     |
| :------ | :-------------- |
| Minutes | Minutes to wait |
| Hours   | Hours to wait   |
| Days    | Days to wait    |
| Months  | Months to wait  |
| Years   | Years to wait   |

You cannot save a negative, non-numeric, or all-zero time requirement.
Clearing the time requirement makes the task immediate again.

## Failure Outcomes

If a task has no custom failure outcome, Fabricate shows its default failure message.
GMs can set a custom failure outcome when a task should explain failure differently or run its own automation.

| Mode  | What you set           | Notes                                           |
| :---- | :--------------------- | :---------------------------------------------- |
| Text  | Custom text            | Shows your custom failure text.                 |
| Macro | A Foundry script macro | Runs the selected macro when the attempt fails. |

Switching between text and macro keeps only the one you are currently using.
Clearing the failure outcome returns the task to the default failure message.

Failed attempts rely on the failure feedback above, including custom failure text or a macro when you have set one.

## Tools

Gathering tasks declare their required equipment as **Tools**.
There is no separate catalyst concept on gathering tasks.
A task simply references the system's [Tools]({% link tools.md %}) library.
The tools themselves are authored on the system's Tools page.
Every referenced tool must be an enabled library entry, and the character must have all of them in their inventory and pass each tool's requirement before the attempt may start.

A library tool carries:

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Field                         | Description                                                                                                                                   |
| :---------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------- |
| Source                        | The item the tool is. Either its own source item or a managed component from the system's component library. See [Tools]({% link tools.md %}) |
| Requirement                   | Optional. A roll expression that must hold true for the character to use the tool                                                             |
| Breakage mechanic             | One of limited uses, breakage chance, or a dice expression                                                                                    |
| Check-driven eligibility      | Immune excludes the tool from check-driven breakage. It does not remove its retained tool-specific breakage mechanic.                         |
| Maximum uses                  | For limited uses: a positive number, or blank for unlimited                                                                                   |
| Breakage chance               | For breakage chance: a whole percent from 0 to 100                                                                                            |
| Dice expression and threshold | For a dice expression: a roll formula and a number it must reach to avoid breaking                                                            |
| On-break action               | One of destroy the item, mark it as broken, or replace it with another item                                                                   |
| Replacement                   | For replace: a different managed Component given to the character when the Tool breaks                                                        |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

The system-level Gathering Rules setting **Tool breakage outcome** controls what happens when any tool breaks.
By default a break makes the attempt fail and clears its drops.
You can instead let the attempt keep its success.
Either way, the on-break action always happens.

Whether a tool breaks in the first place follows the system's **Tool breakage source** setting on the [Tools]({% link tools.md %}#tool-breakage-source) page.
With the default **Tool-specific** source, each tool's own breakage mechanic decides.
With the **Check-driven** source, the gathering check decides whether every required tool that is not **Immune** breaks, the same way it does for crafting and salvage.
Each Tool retains its own mechanic, but that mechanic is not evaluated while this source is active.
Retained limited-use counters also remain unchanged while check-driven authority is active.
This takes effect once the Progressive and Routed by check gathering modes ship.
The only gathering mode available today, d100, has no check for triggers to read, so check-driven breakage cannot fire for a d100 attempt.
Until then, gathering tool breakage uses the Tool-specific source regardless of this setting.
This is separate from the **Tool breakage outcome** setting above.
The source decides whether a tool breaks.
The outcome setting decides what a broken tool does to the gather.

A missing or disabled library tool blocks the attempt before Fabricate even checks the character's inventory, as does a tool the character does not own, a tool the character owns that is broken, and a failed tool requirement.

A tool is recognised whether the character owns the tool's own source item directly or owns a copy dragged or duplicated from it.
Fabricate matches the owned item against the tool's own source references, so dropping a copy of the source item onto the character still satisfies the requirement.

In the player app, a tool the character does not own shows as **Missing**.
A tool the character holds but cannot use shows as **Broken**.
This covers both an item the character owns that is already broken and an owned broken-variant component for that tool.
The **Broken** state is for display only.
The attempt stays blocked either way, and holding a working copy of the tool alongside a broken one still reads as available.

See the [Breakable Gathering Tools]({% link help/how-to/breakable-gathering-tools.md %}) how-to for a worked example.
