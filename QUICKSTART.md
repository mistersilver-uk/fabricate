# Fabricate v2 Quickstart

This is the fastest path to get crafting working in a Foundry world.

## 1. Install and Enable

1. Install the module from its manifest URL.
2. Enable **Fabricate v2** in your world.
3. Reload the client.

## 2. Open Crafting UI

1. Open the **Items** sidebar.
2. Click **Craft Item** (hammer icon).
3. Select:
   - Crafting actor (where results go)
   - Component source actor(s) (where ingredients are consumed)

## 3. Create Your First Recipe (Macro)

1. Open `examples/macros/03-get-item-uuids.js` and run it to find item UUIDs.
2. Edit `examples/macros/04-create-simple-recipe.js` with real UUIDs.
3. Run the macro to create the recipe.

## 4. Craft

1. Open the crafting app again.
2. Select your recipe.
3. Click **Craft**.

## 5. Optional: API

```javascript
// Create simple recipe
await fabricate.createSimpleRecipe(
  'Iron Sword',
  [
    { itemUuid: 'Item.abc123', quantity: 2 },
    { itemUuid: 'Item.def456', quantity: 1 }
  ],
  { itemUuid: 'Item.ghi789', quantity: 1 }
);

// Craft by recipe id for the current character
await fabricate.craft(game.user.character, 'recipeId');
```

