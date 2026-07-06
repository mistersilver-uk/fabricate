---
layout: default
title: Home
nav_order: 1
---

![Fabricate repository preview](img/fabricate-repo-preview.png)

# Fabricate

A system-agnostic crafting and gathering module for Foundry Virtual Tabletop.
{: .fs-6 .fw-300 }

Fabricate lets GMs define crafting systems with recipes, ingredients, tools, essences, gathering environments, tasks, and events.
Crafting recipes can currently be authored and executed through the public API.
An early GM recipe editor in the Crafting Admin panel can edit a recipe's identity and link a recipe item, with full recipe authoring still in progress.
The player-facing Crafting and Alchemy tabs in the unified Fabricate window are planned UI surfaces.

---

## What can Fabricate do?

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Feature                    | Description                                                                                                       |
|:---------------------------|:------------------------------------------------------------------------------------------------------------------|
| **Crafting Systems**       | Define independent systems with their own item libraries, essences, and rules                                     |
| **Resolution Modes**       | Simple, routed, progressive, and alchemy crafting with optional skill checks through the recipe and crafting APIs |
| **Multi-Step Recipes**     | Chain steps that must be completed in sequence, with optional time gates                                          |
| **Tools**                  | Required-but-reusable, breakable prerequisites shared across crafting, gathering, and salvage                     |
| **Gathering Environments** | GM-authored places where actors can gather configured component results                                           |
| **Journal**                | Player-facing tab to monitor crafting, gathering, and salvage runs and continue crafting runs                     |
| **Canvas Interactables**   | Place Tools and Gathering Tasks as Scene Regions players activate by walking a token in                           |
| **Essences**               | Abstract properties on items for flexible ingredient matching                                                     |
| **Visibility & Knowledge** | Control which recipes players can see, learn, or unlock through the visibility service                            |
| **Teaser Mode**            | Track discovery progress and return teaser visibility state through the API                                       |
| **Shopping List**          | Planned player-facing UI. Aggregation support exists as internal utility code                                     |
| **Effect Transfer**        | Transfer active effects from ingredients to crafted items                                                         |
| **Import & Export**        | Back up a whole crafting system or move it between worlds as a JSON file                                          |
| **Macro Integration**      | Customise crafting checks, property generation, and success/failure hooks                                         |
| **Alchemy Mode**           | Hide recipe names and let players discover formulas by experimentation                                            |
| **Recipe Graph**           | Planned. Visualise recipe dependencies as an interactive graph in the GM admin panel                             |
| **How-To Guides**          | Quick answers to common crafting tasks                                                                            |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

{: .tip }
> Use the **search bar** in the sidebar to quickly find settings, configuration options, and examples across the documentation.

## Quickstart

Head to [Quickstart]({% link quickstart.md %}) for installation and your first Gathering Environment.

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
