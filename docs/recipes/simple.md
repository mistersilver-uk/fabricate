---
layout: default
title: Simple Mode
parent: Recipes
nav_order: 1
---

# Simple Mode

The simplest resolution mode. One ingredient set, one result group, optional pass/fail check.

---

## Rules

- Exactly **one** ingredient set
- Exactly **one** result group
- Crafting check is optional (pass/fail only)

## Example: Healing Potion

A basic alchemy recipe:

| Ingredients | Result |
|:------------|:-------|
| 2x Moonpetal Herb | 1x Healing Potion |
| 1x Empty Vial | |

### Creating via the GM Admin

1. Create a recipe in the Recipes tab
2. Add one ingredient set with two groups:
   - Group "Herbs": 2x Moonpetal Herb (by componentId)
   - Group "Container": 1x Empty Vial (by componentId)
3. Add one result group with one result:
   - 1x Healing Potion (by componentId)

### Creating via Macro

```javascript
// Quick helper for simple recipes
await fabricate.createSimpleRecipe('Healing Potion', [
  { itemUuid: 'Item.moonpetalHerb', quantity: 2 },
  { itemUuid: 'Item.emptyVial', quantity: 1 }
], {
  itemUuid: 'Item.healingPotion',
  quantity: 1
});
```

### Creating with the full API

```javascript
const { Recipe, Ingredient, IngredientGroup, IngredientSet } = game.fabricate.api;

const recipe = new Recipe({
  name: 'Healing Potion',
  craftingSystemId: 'my-alchemy-system-id',
  ingredientSets: [
    IngredientSet.fromJSON({
      id: 'potion-ingredients',
      name: 'Potion Ingredients',
      ingredientGroups: [
        {
          id: 'herbs',
          name: 'Herbs',
          options: [
            { quantity: 2, match: { type: 'component', componentId: 'moonpetal-herb-id' } }
          ]
        },
        {
          id: 'container',
          name: 'Container',
          options: [
            { quantity: 1, match: { type: 'component', componentId: 'empty-vial-id' } }
          ]
        }
      ]
    })
  ],
  resultGroups: [
    {
      id: 'potion-result',
      name: 'Potion Result',
      results: [
        { id: 'healing-potion', componentId: 'healing-potion-id', quantity: 1 }
      ]
    }
  ]
});

await game.fabricate.getRecipeManager().createRecipe(recipe.toJSON());
```

## With an Optional Check

If crafting checks are enabled on the system, simple mode uses pass/fail:

- **Pass**: ingredients are consumed and results are created
- **Fail**: behaviour depends on your consumption-on-failure settings

The crafting check macro must return `{ success: true/false }`. See [Macros]({% link macros/index.md %}) for the contract.

---

## What's next?

- [Routed Mode (Ingredient Set)]({% link recipes/mapped.md %}) -- ingredient choices determine which result is produced.
- [Macros & Examples]({% link macros/index.md %}) -- crafting check macro contracts and ready-to-use examples.
