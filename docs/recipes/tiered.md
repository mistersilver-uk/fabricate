---
layout: default
title: Tiered Mode
parent: Recipes
nav_order: 3
---

# Tiered Mode

A crafting check macro returns a named **outcome**, and the outcome determines which result group is produced.

---

## Rules

- **One or more** ingredient sets
- **One or more** result groups
- Crafting check is **required**
- The check macro must return `{ success: true, outcome: "outcomeName" }` or `{ success: false }`
- An `outcomeRouting` map connects outcome names to result group IDs

## Example: Weapon Forging

A blacksmithing recipe where the quality of the result depends on a skill check:

| Outcome | Result |
|:--------|:-------|
| "masterwork" | 1x Masterwork Longsword |
| "standard" | 1x Longsword |
| "flawed" | 1x Bent Blade (junk) |

### Outcome Routing

```javascript
outcomeRouting: {
  "masterwork": "masterwork-result",
  "standard": "standard-result",
  "flawed": "flawed-result"
}
```

### The Check Macro

Your crafting check macro receives context about the recipe and actors, and must return an outcome:

```javascript
// Crafting check macro for tiered weapon forging
// Context is passed as the first argument
const { craftingActor, recipe, step } = scope;

// Example: roll a skill check
const roll = await craftingActor.rollAbilityTest?.("str")
  ?? new Roll("1d20 + @abilities.str.mod", craftingActor.getRollData());
await roll.evaluate();
await roll.toMessage({ flavor: `${craftingActor.name} forges a weapon...` });

const total = roll.total;

if (total >= 25) {
  return { success: true, outcome: "masterwork", data: { roll: total } };
} else if (total >= 12) {
  return { success: true, outcome: "standard", data: { roll: total } };
} else if (total >= 5) {
  return { success: true, outcome: "flawed", data: { roll: total } };
} else {
  return { success: false, data: { roll: total } };
}
```

### Creating the Recipe

```javascript
const { Recipe, IngredientSet } = game.fabricate.api;

const recipe = new Recipe({
  name: 'Forge Longsword',
  craftingSystemId: 'blacksmithing-system-id',
  ingredientSets: [
    IngredientSet.fromJSON({
      id: 'sword-materials',
      name: 'Sword Materials',
      ingredientGroups: [
        {
          id: 'metal', name: 'Metal',
          options: [{ quantity: 3, match: { type: 'component', componentId: 'steel-ingot-id' } }]
        },
        {
          id: 'handle', name: 'Handle',
          options: [{ quantity: 1, match: { type: 'component', componentId: 'leather-wrap-id' } }]
        }
      ]
    })
  ],
  resultGroups: [
    {
      id: 'masterwork-result', name: 'Masterwork',
      results: [{ id: 'mw-sword', componentId: 'masterwork-longsword-id', quantity: 1 }]
    },
    {
      id: 'standard-result', name: 'Standard',
      results: [{ id: 'std-sword', componentId: 'longsword-id', quantity: 1 }]
    },
    {
      id: 'flawed-result', name: 'Flawed',
      results: [{ id: 'junk', componentId: 'bent-blade-id', quantity: 1 }]
    }
  ],
  outcomeRouting: {
    "masterwork": "masterwork-result",
    "standard": "standard-result",
    "flawed": "flawed-result"
  }
});

await game.fabricate.getRecipeManager().createRecipe(recipe.toJSON());
```

## Step-Level Routing Overrides

In multi-step recipes, individual steps can override the recipe-level `outcomeRouting`. The engine checks `step.outcomeRouting` first, then falls back to `recipe.outcomeRouting`.

## When to Use Tiered Mode

Tiered mode is ideal when:
- Result quality should depend on a skill check
- You want distinct named outcomes (not just pass/fail)
- Different outcomes should produce fundamentally different items
