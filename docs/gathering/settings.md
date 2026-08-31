---
layout: default
title: Settings
parent: Gathering
nav_order: 4
---

# Gathering Settings

The system's gathering **Settings** page carries the rules that apply to every environment, task, and event in the system.

## Gathering Resolution Mode

The system's gathering **Settings** tab has a **Gathering resolution mode** card above the Limitation card.
It chooses how a gathering attempt decides its outcome.

The only mode available today is **d100**, which is selected by default.
**Progressive** and **Routed by check** are shown but disabled with a "Coming soon" label, because they are planned and not yet available.

## Gathering Limitations

Each crafting system decides how often its gathering tasks can be attempted through **two independent limitations**, set on the system's gathering **Settings** tab under **Limitation**:

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Limitation         | Toggle                  | What it caps                                                                                                                                                                |
| :----------------- | :---------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Stamina**        | **Stamina** pill        | A per-character stamina pool. Each attempt spends the task's stamina cost. A character can keep going only while they have stamina, which regenerates as world time passes. |
| **Resource nodes** | **Resource nodes** pill | A finite per-task node pool in each environment. Each accepted attempt depletes one node. Once a pool is empty the task is blocked until its nodes respawn over world time. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

The two toggles are **independent, not a single choice**.
Each can be on or off on its own:

- **Neither on** means no limit.
  Tasks can be attempted freely (subject only to tools, conditions, and any [time requirements]({% link gathering/tasks.md %}#time-requirements), which are always orthogonal to the limitation toggles).
- **One on** means only that limitation applies.
- **Both on** means both limits apply at once.
  A single accepted attempt both depletes the node pool **and** spends the character's stamina.
  This is the **anti-dogpiling** combination.
  Finite resource nodes cap the _total_ pulls until they respawn, so a large, high-stamina party cannot strip a task in a single visit no matter how much collective stamina it has.

Stamina enforcement only kicks in once a character actually has a pool (a non-blank **Maximum stamina** rolled for them).
A task with no stamina cost is never gated by stamina.
Resource-node enforcement applies per task only where you author a node pool on that task.
Per-task node counts/respawn and per-character stamina pools/regen are unchanged by the toggles.
The toggles only decide whether each limitation is _active_ for the system.

{% include screenshot.html case="manager-gathering-settings-normal" caption="The Limitation card, with neither limitation turned on." %}

{: .note }

> Older worlds used a single limitation choice that could only be none, stamina, or resource nodes at a time.
> When you upgrade, Fabricate converts that choice into the two independent toggles automatically (stamina becomes Stamina on, nodes becomes Resource nodes on, otherwise both off).
> To run both limits at once, turn on both toggles.

## Gathering Rules

Gathering rules are set per crafting system on the Gathering **Settings** tab.
Once authored, they apply to every gathering environment in that system.

{% include screenshot.html case="manager-gathering-settings-normal" caption="The gathering rules for a system, in the inspector beside the Settings tab." %}

| Rule                     | Values                                                                                                                                       |
| :----------------------- | :------------------------------------------------------------------------------------------------------------------------------------------- |
| **Rewards**              | Highest ranked successful drop, all drops, or a limited number of drops                                                                      |
| **Reward limit**         | A positive number used when Rewards is set to a limited number of drops                                                                      |
| **Events**               | Highest ranked successful event, all events, or a limited number of events                                                                   |
| **Event limit**          | A positive number used when Events is set to a limited number of events                                                                      |
| **Event outcome**        | Whether a triggered event still lets the attempt succeed, or makes it fail                                                                   |
| **Blind candidate gate** | Whether a blind action only draws from tasks the character can attempt right now (the default), or from every matching task (see Blind Mode) |
| **Blind reveal**         | When a blind task is revealed to the player: never (the default), on success, or on any attempt                                              |
| **Reveal scope**         | Who learns a revealed task: the character, the player, the party, or everyone                                                                |

## Blind Mode

A blind environment hides its tasks from players and presents a single generic gather action.
On each attempt Fabricate picks one concrete task for the character:

1. **Candidate pool** starts from the environment's visible, enabled tasks.
   The system **Blind candidate gate** then decides which are eligible.
   By default the pool only includes tasks the character can attempt right now (so it never resolves to a task that would immediately fail for missing or broken tools, depleted nodes, exhausted attempts, or unmet gates).
   You can instead keep every matching task in the pool.
   If the pool is empty, the player gets an opaque "nothing you can gather here" response.
2. **Selection** is a weighted random draw over the pool, using the per-task **Weight** values set on the Tasks tab rows (the default is 1, and a weight of 0 excludes a task).
   Blind selection is always weighted random.
3. **Reveal** happens after the attempt resolves, when the task may be revealed to the player so it can be recognised later.
   The **Blind reveal** and **Reveal scope** rules are set at the system level only.
   Environments cannot override them.
   Reveal can be set to never, only after a successful gather, or after any attempt (success or failure).

The per-task **Weight** column only appears while the environment is in blind mode.
