---
layout: default
title: Routed Mode (Roll Table)
parent: Recipes
nav_order: 4
---

# Routed Mode — Roll Table Provider

A FoundryVTT roll table is drawn once per crafting attempt, and the drawn result's name determines which result group is produced. The outcome is matched case-insensitively against result group names, using the same reserved keyword rules as the macro outcome provider.

---

## Rules

- **One or more** ingredient sets
- **One or more** result groups
- `resultSelection.provider` must be `"rollTableOutcome"`
- `resultSelection.rollTableUuid` is required — the UUID of the FoundryVTT RollTable to draw from
- The engine draws exactly once per attempt
- The drawn result's name is trim-normalised and compared case-insensitively against result group names
- Result group names must be unique under case-insensitive comparison
- Result group names may not use reserved fail/miss keywords (`fail`, `failed`, `failure`, `f`, `miss`, `missed`, `m`, `nothing`, `none`, `whiff`, `whiffed`)

### Reserved Keywords

| Keyword | Behaviour |
|:--------|:----------|
| `fail`, `failed`, `failure`, `f` | The craft takes the failure path |
| `miss`, `missed`, `m`, `nothing`, `none`, `whiff`, `whiffed` | The craft produces nothing (non-producing failure) |

If the drawn result name does not match any reserved keyword and does not match any result group name, the engine aborts with a crafting-system misconfiguration error.

## Example: Mysterious Cauldron

An alchemy system where brewing a potion draws from a random table to determine which potion is produced:

| Roll Table Result | Result Group | Output |
|:------------------|:-------------|:-------|
| "Healing" | Healing result | 1x Potion of Healing |
| "Fire" | Fire result | 1x Potion of Fire Breath |
| "Invisibility" | Invisibility result | 1x Potion of Invisibility |
| "fail" | (reserved) | Craft fails; ingredients consumed |

### Creating the Recipe

```javascript
Hooks.once('fabricate.ready', async () => {
  const { Recipe, IngredientSet } = game.fabricate.api;

  const recipe = new Recipe({
    name: 'Brew Mystery Potion',
    craftingSystemId: 'alchemy-system-id',
    resultSelection: {
      provider: 'rollTableOutcome',
      rollTableUuid: 'RollTable.your-potion-table-uuid'
    },
    ingredientSets: [
      IngredientSet.fromJSON({
        id: 'ingredients',
        name: 'Brewing Ingredients',
        ingredientGroups: [
          {
            id: 'reagent', name: 'Reagent',
            options: [
              { quantity: 2, match: { type: 'component', componentId: 'alchemical-herb-id' } }
            ]
          }
        ]
      })
    ],
    resultGroups: [
      {
        id: 'healing-result',
        name: 'Healing',
        results: [{ id: 'healing-potion', componentId: 'potion-healing-id', quantity: 1 }]
      },
      {
        id: 'fire-result',
        name: 'Fire',
        results: [{ id: 'fire-potion', componentId: 'potion-fire-id', quantity: 1 }]
      },
      {
        id: 'invisibility-result',
        name: 'Invisibility',
        results: [{ id: 'invis-potion', componentId: 'potion-invisibility-id', quantity: 1 }]
      }
    ]
  });

  await game.fabricate.getRecipeManager().createRecipe(recipe.toJSON());
});
```

## Setting Up the Roll Table

In FoundryVTT, create a Roll Table whose result names match your result group names exactly (case-insensitive). You can also include entries named with reserved keywords (`fail`, `nothing`, etc.) to model chance-of-failure without a crafting check.

1. Open **Roll Tables** in the sidebar
2. Create a new table
3. Add results whose **Text** values match your recipe's result group names
4. Copy the table UUID from its sheet header (right-click the title)
5. Paste the UUID into `resultSelection.rollTableUuid`

## When to Use the Roll Table Provider

The roll table provider is ideal when:
- Crafting outcomes should feel random or mysterious
- You want FoundryVTT's native probability weighting on roll tables
- You do not need a player-facing skill check, but still want variable results

---

## What's next?

- [Routed Mode (Macro Outcome)]({% link recipes/tiered.md %}) -- a crafting check macro's named outcome selects the result group.
- [Routed Mode (Ingredient Set)]({% link recipes/mapped.md %}) -- the player's ingredient choice selects the result group.
- [Progressive Mode]({% link recipes/progressive.md %}) -- check values are spent to buy results in difficulty order.
