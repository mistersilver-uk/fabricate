---
layout: default
title: Routed Mode (Macro Outcome)
parent: Recipes
nav_order: 3
---

# Routed Mode — Macro Outcome Provider

{: .note }
> This page documents the `macroOutcome` provider for routed mode. Legacy recipes still stored with `resolutionMode: "tiered"` are automatically normalised to `routed` + `macroOutcome` on load.

A crafting check macro returns a named **outcome**, and the outcome determines which result group is produced. The outcome is matched case-insensitively against result group names.

---

## Rules

- **One or more** ingredient sets
- **One or more** result groups
- `resultSelection.provider` must be `"macroOutcome"`
- Crafting check is **required** (`resultSelection.macroUuid` or system fallback)
- The check macro must return `{ success: true, outcome: "outcomeName" }` or `{ success: false }`
- The `outcome` value is trim-normalised and compared case-insensitively against result group names
- Result group names must be unique under case-insensitive comparison
- Result group names may not use reserved fail/miss keywords (`fail`, `failed`, `failure`, `f`, `miss`, `missed`, `m`, `nothing`, `none`, `whiff`, `whiffed`)

### Reserved Keywords

| Keyword | Behaviour |
|:--------|:----------|
| `fail`, `failed`, `failure`, `f` | The craft takes the failure path |
| `miss`, `missed`, `m`, `nothing`, `none`, `whiff`, `whiffed` | The craft produces nothing (non-producing failure) |

If the macro returns an outcome that does not match any reserved keyword and does not match any result group name, the engine aborts with a crafting-system misconfiguration error rather than treating it as a player failure.

## Example: Weapon Forging

A blacksmithing recipe where the quality of the result depends on a skill check:

| Outcome | Result |
|:--------|:-------|
| "masterwork" | 1x Masterwork Longsword |
| "standard" | 1x Longsword |
| "flawed" | 1x Bent Blade (junk) |

### The Check Macro

Your crafting check macro receives context about the recipe and actors, and must return a named outcome:

```javascript
// Crafting check macro for routed macro-outcome weapon forging
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
Hooks.once('fabricate.ready', async () => {
  const { Recipe, IngredientSet } = game.fabricate.api;

  const recipe = new Recipe({
    name: 'Forge Longsword',
    craftingSystemId: 'blacksmithing-system-id',
    resultSelection: {
      provider: 'macroOutcome',
      macroUuid: 'Macro.your-check-macro-uuid'  // or omit to use the system fallback
    },
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
    ]
  });

  await game.fabricate.getRecipeManager().createRecipe(recipe.toJSON());
});
```

## Step-Level Routing Overrides

In multi-step recipes, individual steps can override the recipe-level `resultSelection`. The engine checks `step.resultSelection` first, then falls back to `recipe.resultSelection`.

## When to Use the Macro Outcome Provider

The `macroOutcome` provider is ideal when:
- Result quality should depend on a skill check
- You want distinct named outcomes (not just pass/fail)
- Different outcomes should produce fundamentally different items

---

## What's next?

- [Progressive Mode]({% link recipes/progressive.md %}) -- check values are spent to buy results in difficulty order.
- [Macros & Examples]({% link macros/index.md %}) -- crafting check macro contracts and ready-to-use examples.
- [Multi-Step Recipes]({% link recipes/multi-step.md %}) -- chain multiple steps with per-step outcome routing.
