---
layout: default
title: Home
nav_order: 1
---

![Fabricate repository preview](img/fabricate-repo-preview.png)

# Fabricate

A system-agnostic crafting and gathering module for Foundry Virtual Tabletop.
{: .fs-6 .fw-300 }

Fabricate works with any game system.
It is not tied to D&D 5e, Pathfinder, or any single ruleset.
GMs define one or more independent crafting systems with their own recipes, ingredients, tools, essences, gathering environments, tasks, and events.

Players do the whole loop in the unified Fabricate window.
They browse recipes in the **Crafting** tab, pick a character and where the materials come from, roll any required crafting check, and craft.
They brew from the **Alchemy Workbench**, break items down for parts through **Salvage**, collect materials in the **Gathering** tab, and track every run in the **Journal**.
GMs author complete recipes in the Crafting Admin panel, including ingredients, results, tools, steps, access, and validation.

---

## What can Fabricate do?

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Feature                    | Description                                                                                                       |
|:---------------------------|:------------------------------------------------------------------------------------------------------------------|
| **System-Agnostic**        | Works with any Foundry game system, with no dependency on a specific ruleset                                      |
| **Crafting Systems**       | Define independent systems with their own item libraries, essences, and rules                                     |
| **Player Crafting**        | Browse recipes, choose an actor and component sources, roll checks, and craft from the Crafting tab               |
| **Recipe Authoring**       | Author complete recipes in the GM admin panel, with tabs for ingredients, results, tools, steps, and access      |
| **Resolution Modes**       | Simple, routed by ingredients, routed by check, progressive, and alchemy crafting with optional skill checks      |
| **Multi-Step Recipes**     | Chain steps that must be completed in sequence, with optional time gates                                          |
| **Tools**                  | Required-but-reusable, breakable prerequisites shared across crafting, gathering, and salvage                     |
| **Salvage**                | Players break managed items back down into their component parts                                                  |
| **Gathering Environments** | GM-authored places where actors can gather configured component results                                           |
| **Shopping List**          | Queue recipes in the Crafting tab and see one consolidated list of the materials you still need                  |
| **Journal**                | Player-facing tab to monitor crafting, gathering, and salvage runs and continue crafting runs                    |
| **Canvas Interactables**   | Place Tools and Gathering Tasks as Scene Regions players activate by walking a token in                           |
| **Essences**               | Abstract properties on items for flexible ingredient matching                                                     |
| **Visibility & Knowledge** | Control which recipes players can see, learn, or unlock, with recipe books and scrolls that teach them            |
| **Teaser Mode**            | Track discovery progress so players see a recipe exists before they can fully read or craft it                    |
| **Effect Transfer**        | Transfer active effects from ingredients to crafted items                                                         |
| **Import & Export**        | Back up a whole crafting system or move it between worlds as a JSON file                                          |
| **Macro Integration**      | Customise crafting checks, property generation, and success/failure hooks                                         |
| **Alchemy Workbench**      | Hide recipe names and let players discover formulas by experimentation                                            |
| **Recipe Graph**           | Planned. Visualise recipe dependencies as an interactive graph in the GM admin panel                             |
| **How-To Guides**          | Quick answers to common crafting tasks                                                                            |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

{: .tip }
> Use the **search bar** in the sidebar to quickly find settings, configuration options, and examples across the documentation.

## Quickstart

Head to [Quickstart]({% link quickstart.md %}) for installation and your first Gathering Environment.

## Crafting

Players craft in the **Crafting** tab of the unified Fabricate window.
They browse the recipes their character can see, choose which owned actors supply the materials, roll any crafting check, and craft.
A built-in **Shopping List** lets players queue several recipes and see one consolidated list of the components, essences, and tools they still need.
GMs author recipes end to end in the Crafting Admin panel, across dedicated tabs for ingredients, results, tools, steps, access, and validation.
See [Recipes]({% link recipes/index.md %}).

## Salvage

Players can break a managed item back down into component parts from the **Salvage** flow.
Salvage can be a straight breakdown or gated behind a crafting check, and it supports progressive results that a roll spends down.
See [Salvage]({% link salvage.md %}).

## Tools

Recipes, gathering tasks, and salvage all require reusable, optionally breakable equipment through shared [Tools]({% link tools.md %}).
Tools can be both things you would carry, like a hammer, knife, or satchel or things you would find in specific locations in the world, like a campfire, magical leyline, or forge.

## Gathering

GMs can define material gathering locations in [Gathering Environments]({% link gathering-environments.md %}) when a crafting system enables the "Gathering" feature.
Gathering can also be location-aware!
GMs can describe campaign geography as realms, group actors into Fabricate-managed parties, and gate environments by the party's current realm.
See [Gathering Realms & Travel]({% link gathering-realms.md %}).

## Journal

Players can track the runs their characters have started in the [Journal]({% link journal.md %}) tab of the unified Fabricate window.
The Journal monitors crafting, gathering, and salvage runs together, shows world-time countdowns and history, and lets players continue crafting runs with **Trigger Next Step**.

## Canvas Interactables

GMs can place Tools and Gathering Tasks directly on the scene as **Scene Region** interactables (with an optional on-canvas marker).
Players activate them by walking a token into the region.
A non-blocking prompt appears, and clicking **Interact** opens the Fabricate UI.
See [Canvas Interactables]({% link canvas-interactables.md %}).

## Import and export

You can export a complete crafting system to a JSON file and import it into another world.
The export carries the whole authoring model, and import reports any references that do not exist in the target world.
See [Import & Export]({% link import-export.md %}).

## Having trouble?

Check the [Troubleshooting]({% link troubleshooting.md %}) guide for solutions to common issues.

## How-to guides

Need a quick answer?
The [How-To Guides]({% link how-to/index.md %}) cover common tasks like recipe discovery, degrading tools, and effect transfer.
