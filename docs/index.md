---
layout: default
title: Home
nav_order: 1
---

![](img/fabricate-repo-preview.png)

# Fabricate

A system-agnostic crafting module for Foundry Virtual Tabletop.
{: .fs-6 .fw-300 }

Fabricate lets GMs define crafting systems with recipes, ingredients, catalysts, and essences. Players craft items through an in-game UI with inventory-aware validation, optional skill checks, and multi-step workflows.

---

## What can Fabricate do?

| Feature | Description |
|:--------|:------------|
| **Crafting Systems** | Define independent systems with their own item libraries, essences, and rules |
| **Resolution Modes** | Simple, routed, progressive, and alchemy crafting with optional skill checks |
| **Multi-Step Recipes** | Chain steps that must be completed in sequence, with optional time gates |
| **Catalysts** | Non-consumable tools and workstations with usage tracking |
| **Essences** | Abstract properties on items for flexible ingredient matching |
| **Visibility & Knowledge** | Control which recipes players can see and learn |
| **Teaser Mode** | Reveal recipes gradually — players see a recipe exists and track progress toward unlocking it |
| **Shopping List** | Plan ahead by collecting recipes and viewing a consolidated missing-materials table |
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

Then open the crafting UI from the Items sidebar, select your character, and click **Craft**.

## Quickstart

Head to [Quickstart]({% link quickstart.md %}) for installation and your first recipe.

## Having trouble?

Check the [Troubleshooting]({% link troubleshooting.md %}) guide for solutions to common issues.

## How-to guides

Need a quick answer? The [How-To Guides]({% link how-to/index.md %}) cover common tasks like adding skill checks, setting up recipe discovery, and importing recipes.
