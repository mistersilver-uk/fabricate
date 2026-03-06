---
layout: default
title: Mapped Mode
parent: Recipes
nav_order: 2
---

# Mapped Mode

Different ingredient sets map to different result groups. The player's choice of ingredients determines what they craft.

---

## Rules

- **One or more** ingredient sets
- **One or more** result groups
- Each ingredient set can specify a `resultGroupId` to force a particular result group
- If unmapped, the player chooses which result group to receive
- Crafting check is optional (pass/fail)

## Example: Enchanted Ring

An enchanting recipe where different gem types produce different ring effects:

| Ingredient Set | Maps To | Result |
|:---------------|:--------|:-------|
| 1x Gold Band + 1x Ruby | Fire Ring result | 1x Ring of Fire Resistance |
| 1x Gold Band + 1x Sapphire | Ice Ring result | 1x Ring of Frost Resistance |
| 1x Gold Band + 1x Emerald | Nature Ring result | 1x Ring of Nature's Ward |

### Creating via Macro

```javascript
const { Recipe, IngredientSet, IngredientGroup } = game.fabricate.api;

const recipe = new Recipe({
  name: 'Enchanted Ring',
  craftingSystemId: 'enchanting-system-id',
  ingredientSets: [
    IngredientSet.fromJSON({
      id: 'fire-ring-set',
      name: 'Fire Ring',
      resultGroupId: 'fire-ring-result',   // Maps to specific result group
      ingredientGroups: [
        {
          id: 'band', name: 'Band',
          options: [{ quantity: 1, match: { type: 'component', componentId: 'gold-band-id' } }]
        },
        {
          id: 'gem', name: 'Gem',
          options: [{ quantity: 1, match: { type: 'component', componentId: 'ruby-id' } }]
        }
      ]
    }),
    IngredientSet.fromJSON({
      id: 'ice-ring-set',
      name: 'Ice Ring',
      resultGroupId: 'ice-ring-result',
      ingredientGroups: [
        {
          id: 'band', name: 'Band',
          options: [{ quantity: 1, match: { type: 'component', componentId: 'gold-band-id' } }]
        },
        {
          id: 'gem', name: 'Gem',
          options: [{ quantity: 1, match: { type: 'component', componentId: 'sapphire-id' } }]
        }
      ]
    })
  ],
  resultGroups: [
    {
      id: 'fire-ring-result',
      name: 'Fire Ring',
      results: [{ id: 'fire-ring', componentId: 'ring-fire-resistance-id', quantity: 1 }]
    },
    {
      id: 'ice-ring-result',
      name: 'Ice Ring',
      results: [{ id: 'ice-ring', componentId: 'ring-frost-resistance-id', quantity: 1 }]
    }
  ]
});

await game.fabricate.getRecipeManager().createRecipe(recipe.toJSON());
```

## When to Use Mapped Mode

Mapped mode is ideal when:
- The same crafting process can produce different outputs depending on materials
- You want player agency in choosing outcomes through ingredient selection
- Different material quality should produce different results
