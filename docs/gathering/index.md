---
layout: default
title: Gathering
nav_order: 11
has_children: true
---

# Gathering

Gathering lets a GM define places where actors can gather materials from a crafting system's component library.
When the feature is on, the Crafting Admin panel's left rail grows a **Gathering** group with one page per surface.

{: .gm }

> Only GMs can create and edit gathering environments, tasks, and events.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Page | What it holds |
|:-----|:--------------|
| [Environments]({% link gathering/environments.md %}) | The places themselves: their fields, their conditions, and which library tasks and events compose into them. |
| [Tasks]({% link gathering/tasks.md %}) | The reusable Gathering Task library: drop rows, availability, checks, timing, and required tools. |
| [Events]({% link gathering/events.md %}) | The reusable event library that fires alongside a gathering attempt. |
| [Settings]({% link gathering/settings.md %}) | System-level gathering rules: limitations, reward and event rules, and blind mode. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

The gathering check itself is authored beside the crafting and salvage checks.
See [Checks › Gathering]({% link checks/gathering.md %}).
Known limitation: that page still chooses its editor from a system-level gathering mode that no screen can set any more, so on a system left at the default it shows a read-only **Fixed d100 roll** ([issue #2696](https://github.com/mistersilver-uk/fabricate/issues/2696)).

The stamina, modifier and visibility-gate fields on these pages accept roll expressions.
Those are not a gathering concept — the same syntax runs the crafting checks, tool bonuses and complications too.
See [Expressions]({% link expressions.md %}).

---

## Enable Gathering

Gathering is opt-in per crafting system.
Open the system in the Crafting Admin panel and enable the Gathering feature.
When this feature is enabled, the **Gathering** group appears in the rail for that system.

When at least one crafting system has gathering enabled, players also see a dedicated **Gathering** action in the Items Directory header.
This action opens the player Gathering app.
It is separate from the Crafting app and keeps its own character selection.
Fabricate keeps the header action in step as crafting systems change, so disabling gathering on every system removes the action.

{% include screenshot.html case="manager-system-edit-normal" caption="The optional features on a system, with Gathering turned on." %}
