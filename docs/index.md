---
layout: default
title: Home
nav_order: 1
---

![](img/fabricate-repo-preview.png)

# Fabricate

A system-agnostic crafting module for Foundry Virtual Tabletop.
{: .fs-6 .fw-300 }

Fabricate lets GMs define crafting systems with recipes, ingredients, catalysts, essences, gathering environments, tasks, and hazards. Crafting recipes can currently be authored in the GM manager and executed through the public API; the player-facing Crafting and Alchemy tabs in the unified Fabricate window are planned UI surfaces.

---

## What can Fabricate do?

| Feature | Description |
|:--------|:------------|
| **Crafting Systems** | Define independent systems with their own item libraries, essences, and rules |
| **Resolution Modes** | Simple, routed, progressive, and alchemy crafting with optional skill checks through the recipe and crafting APIs |
| **Multi-Step Recipes** | Chain steps that must be completed in sequence, with optional time gates |
| **Catalysts** | Non-consumable tools and workstations with usage tracking |
| **Gathering Environments** | GM-authored places where actors can gather configured component results |
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

## Gathering

GMs can define material-gathering locations in [Gathering Environments]({% link gathering-environments.md %}) when a crafting system enables the `gathering` feature.

## Having trouble?

Check the [Troubleshooting]({% link troubleshooting.md %}) guide for solutions to common issues.

## How-to guides

Need a quick answer? The [How-To Guides]({% link how-to/index.md %}) cover common tasks like adding skill checks, setting up recipe discovery, and importing recipes.
