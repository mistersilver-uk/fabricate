---
layout: default
title: Home
nav_order: 1
---

![](img/fabricate-repo-preview.png)

# Fabricate

A system-agnostic crafting module for Foundry Virtual Tabletop.
{: .fs-6 .fw-300 }

Fabricate lets GMs define crafting systems with recipes, ingredients, tools, essences, gathering environments, tasks, and events. Crafting recipes can currently be authored in the GM manager and executed through the public API; the player-facing Crafting and Alchemy tabs in the unified Fabricate window are planned UI surfaces.

---

## What can Fabricate do?

| Feature | Description |
|:--------|:------------|
| **Crafting Systems** | Define independent systems with their own item libraries, essences, and rules |
| **Resolution Modes** | Simple, routed, progressive, and alchemy crafting with optional skill checks through the recipe and crafting APIs |
| **Multi-Step Recipes** | Chain steps that must be completed in sequence, with optional time gates |
| **Tools** | Required-but-reusable, breakable prerequisites shared across crafting, gathering, and salvage |
| **Gathering Environments** | GM-authored places where actors can gather configured component results |
| **Canvas Interactables** | Place Tools and Gathering Tasks as Scene Regions players activate by walking a token in |
| **Essences** | Abstract properties on items for flexible ingredient matching |
| **Visibility & Knowledge** | Control which recipes players can see, learn, or unlock through the visibility service |
| **Teaser Mode** | Track discovery progress and return teaser visibility state through the API; player UI presentation is planned |
| **Shopping List** | Planned player-facing UI; aggregation support exists as internal utility code |
| **Effect Transfer** | Transfer active effects from ingredients to crafted items |
| **Item Piles Integration** | Currency costs, merchant stock, and container inventory via Item Piles |
| **Macro Integration** | Customise crafting checks, property generation, and success/failure hooks |
| **Troubleshooting** | Diagnose common setup and runtime issues |
| **Alchemy Mode** | Hide recipe names and let players discover formulas by experimentation |
| **Recipe Graph** | Visualise recipe dependencies as an interactive graph in the GM admin panel |
| **How-To Guides** | Quick answers to common crafting tasks |

{: .tip }
> Use the **search bar** in the sidebar to quickly find settings, configuration options, and macro examples across the documentation.

## Quick example

Create a simple recipe with a Foundry macro:

```javascript
await fabricate.createSimpleRecipe('Healing Potion', [
  { itemUuid: 'Item.healingHerb123', quantity: 2 },
  { itemUuid: 'Item.emptyVial456', quantity: 1 }
], {
  itemUuid: 'Item.healingPotion789',
  quantity: 1
});
```

Then craft from a macro or integration with `fabricate.craft(actor, recipeId)`. The Items sidebar **Craft Item** button currently opens the unified Fabricate shell; the Crafting tab is a planned player UI.

## Quickstart

Head to [Quickstart]({% link quickstart.md %}) for installation and your first recipe.

## Tools

Recipes, gathering tasks, and salvage all require reusable, breakable equipment through the shared [Tools]({% link tools.md %}) concept (which replaced the retired Catalyst concept in `0.6.0`).

## Gathering

GMs can define material-gathering locations in [Gathering Environments]({% link gathering-environments.md %}) when a crafting system enables the `gathering` feature.

Gathering can also be location-aware: GMs describe campaign geography as regions, group actors into Fabricate-managed parties, and gate environments by the party's current region. See [Gathering Regions & Travel]({% link gathering-regions.md %}).

## Canvas Interactables

GMs can place Tools and Gathering Tasks directly on the scene as **Scene Region** interactables (with an optional on-canvas marker). Players activate them by walking a token into the region: a non-blocking prompt appears, and clicking **Interact** opens the Fabricate UI. See [Canvas Interactables]({% link canvas-interactables.md %}).

## Having trouble?

Check the [Troubleshooting]({% link troubleshooting.md %}) guide for solutions to common issues.

## How-to guides

Need a quick answer? The [How-To Guides]({% link how-to/index.md %}) cover common tasks like adding skill checks, setting up recipe discovery, and importing recipes.
