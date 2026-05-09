---
layout: default
title: Quickstart
nav_order: 2
---

# Quickstart

This guide walks you through installing Fabricate, creating your first crafting system, and crafting your first item.

---

## Installation

1. In Foundry VTT, go to **Add-on Modules**
2. Click **Install Module**
3. Search for "Fabricate" or paste the manifest URL
4. Click **Install**
5. Enable the module in your world

### Theme

Fabricate defaults to the **Fabricate** colour theme. To use the previous dark green palette, open Foundry's module settings for Fabricate and set **Fabricate Theme** to **Mythwright**.

## Step 1: Open the Crafting UI

Open the **Items** sidebar on the left side of Foundry. You'll see two new header buttons:

- **Crafting** (all users) -- opens the player crafting interface
- **Manage Crafting Systems** (GM only) -- opens the GM admin panel

## Step 2: Create a Crafting System

{: .gm }
> All system and recipe management requires the GM role.

1. Click **Manage Crafting Systems**
2. In the **Systems** tab, click **Create System**
3. Give it a name (e.g. "Alchemy") and a description
4. Set the **Resolution Mode** to "Simple" for now
5. Enable any optional features you want (essences, multi-step, etc.); categories and item tags are always available.
6. Save

## Step 3: Add Components

Fabricate recipes reference *components* -- items curated into your crafting system's library. This decouples recipes from specific world items.

1. In the GM admin, switch to the **Items** tab
2. Drag items from the Items sidebar or a compendium into the components list
3. Each item gets a `componentId` that recipes use to reference it

## Step 4: Create a Recipe

1. Switch to the **Recipes** tab
2. Click **Create Recipe**
3. Fill in:
   - **Name**: "Healing Potion"
   - **Ingredient Set**: add an ingredient group, then add options referencing your components for herbs and vials
   - **Result Group**: add a result referencing your Healing Potion component
4. Save

If the Recipes screen says the system has no components yet, open **Components** first and add item-backed components. Recipes use those components for ingredients, catalysts, and results.

### Or use a macro

If you already know the item UUIDs, you can create recipes with a macro:

```javascript
// First, find your item UUIDs
// Open the console (F12) and run:
game.user.character.items.forEach(i =>
  console.log(`${i.name}: ${i.uuid}`)
);

// Then create the recipe
await fabricate.createSimpleRecipe('Healing Potion', [
  { itemUuid: 'Item.healingHerb123', quantity: 2 },
  { itemUuid: 'Item.emptyVial456', quantity: 1 }
], {
  itemUuid: 'Item.healingPotion789',
  quantity: 1
});
```

## Step 5: Craft an Item

1. Click **Crafting** in the Items sidebar header
2. Select which actor will craft (and optionally which actors supply ingredients)
3. Browse or search recipes -- green borders mean you have the materials
4. Click **Craft** on a recipe

### Or use a macro

```javascript
const actor = game.user.character;
const result = await fabricate.craft(actor, 'your-recipe-id');
if (result.success) {
  ui.notifications.info(result.message);
}
```

## What's next?

- [Crafting Systems]({% link crafting-systems.md %}) -- resolution modes, features, and system configuration
- [Recipes]({% link recipes/index.md %}) -- ingredient sets, result groups, and all four resolution modes
- [Macros & Examples]({% link macros/index.md %}) -- ready-to-use macros for common tasks
- [API Reference]({% link api/index.md %}) -- full developer documentation
- [Troubleshooting]({% link troubleshooting.md %}) -- solutions for common setup issues
