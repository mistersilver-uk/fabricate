---
layout: default
title: Progressive Mode
parent: Recipes
nav_order: 4
---

# Progressive Mode

A crafting check returns a numeric **value** that is spent to "buy" results in order of their difficulty.

---

## Rules

- Exactly **one** ingredient set
- Exactly **one** result group with **ordered** results
- Crafting check is **required**
- The check macro must return `{ success: true, value: <number> }` or `{ success: false }`
- Each result references a managed component with a `difficulty >= 1`
- Results are evaluated in order; the check value is spent against each result's difficulty

## Award Modes

The system's `progressive.awardMode` setting controls how the check value is spent:

| Mode | Rule | Partial Credit |
|:-----|:-----|:---------------|
| `equal` | Award when `remaining >= difficulty` | No |
| `exceed` | Award when `remaining > difficulty` (strict) | No |
| `partial` | Award when `remaining >= difficulty`; last result gets partial credit if `remaining > 0` | Yes |

### Example with `equal` mode

Check value: **15**. Results in order:

| Result | Difficulty | Remaining Before | Awarded? | Remaining After |
|:-------|:-----------|:-----------------|:---------|:----------------|
| Iron Filings | 3 | 15 | Yes | 12 |
| Steel Ingot | 5 | 12 | Yes | 7 |
| Fine Steel Ingot | 5 | 7 | Yes | 2 |
| Masterwork Ingot | 8 | 2 | No (2 < 8) | 2 |

The player receives Iron Filings, Steel Ingot, and Fine Steel Ingot.

## The Check Macro

```javascript
// Progressive crafting check for ore smelting
const { craftingActor } = scope;

// Roll a skill check to determine total smelting value
const roll = new Roll("1d20 + @abilities.con.mod + @prof",
  craftingActor.getRollData());
await roll.evaluate();
await roll.toMessage({ flavor: `${craftingActor.name} works the smelter...` });

return { success: true, value: roll.total };
```

## Player Reorder

When `progressive.allowPlayerReorder` is `true` on the crafting system, players can reorder the results before the check. This lets them prioritise which items they want to attempt first.

Reorder preferences are persisted per-recipe in client settings.

## Creating a Progressive Recipe

```javascript
const { Recipe, IngredientSet } = game.fabricate.api;

const recipe = new Recipe({
  name: 'Smelt Ore',
  craftingSystemId: 'smelting-system-id',
  ingredientSets: [
    IngredientSet.fromJSON({
      id: 'raw-ore',
      name: 'Raw Ore',
      ingredientGroups: [
        {
          id: 'ore', name: 'Ore',
          options: [{ quantity: 5, match: { type: 'component', componentId: 'raw-iron-ore-id' } }]
        }
      ]
    })
  ],
  resultGroups: [
    {
      id: 'smelting-results',
      name: 'Smelting Results',
      results: [
        { id: 'filings', componentId: 'iron-filings-id', quantity: 1 },
        { id: 'ingot', componentId: 'steel-ingot-id', quantity: 1 },
        { id: 'fine', componentId: 'fine-steel-ingot-id', quantity: 1 },
        { id: 'master', componentId: 'masterwork-ingot-id', quantity: 1 }
      ]
    }
  ]
});

await game.fabricate.getRecipeManager().createRecipe(recipe.toJSON());
```

{: .note }
> Each result's `componentId` must reference a managed component with a `difficulty` value set in the Items tab of the GM admin.

## When to Use Progressive Mode

Progressive mode is ideal when:
- Higher skill checks should yield more or better results
- You want a "spend your roll" mechanic
- Crafting should feel like a graduated outcome, not just pass/fail

---

## What's next?

- [Multi-Step Recipes]({% link recipes/multi-step.md %}) -- combine multiple steps into a single recipe workflow.
- [Macros & Examples]({% link macros/index.md %}) -- crafting check macro contracts and ready-to-use examples.
- [Recipes overview]({% link recipes/index.md %}) -- compare all resolution modes side by side.
