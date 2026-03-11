---
layout: default
title: Multi-Step Recipes
parent: Recipes
nav_order: 5
---

# Multi-Step Recipes

{: .gm }
> Requires the `multiStepRecipes` feature to be enabled on the crafting system.

Multi-step recipes chain several steps that must be completed in sequence. Each step can have its own ingredients, catalysts, results, time requirements, and currency requirements.

---

## How It Works

1. Player starts the recipe -- a **crafting run** is created
2. The first step's ingredients are validated
3. On success, the step's results are created and the run advances
4. Repeat for each step
5. When the last step succeeds, the run completes

### Crafting Runs

A crafting run tracks the in-progress state of a multi-step recipe:

- Which step the player is on
- What ingredients were consumed and results created at each step
- Time gates (if any step has a time requirement)
- The overall status: `inProgress`, `waitingTime`, `succeeded`, `failed`, `cancelled`

Runs are stored on the crafting actor's flags and persist across sessions.

## Example: Enchanted Armour

A three-step recipe for creating enchanted plate armour:

**Step 1: Forge the Plates**
- Ingredients: 5x Steel Ingot, 1x Forge (catalyst)
- Time: 4 hours of world time
- Result: 1x Unfinished Plate Set

**Step 2: Assemble the Armour**
- Ingredients: 1x Unfinished Plate Set, 2x Leather Strap
- Result: 1x Plate Armour

**Step 3: Enchant**
- Ingredients: 1x Plate Armour, 1x Enchanting Gem
- Crafting check: skill-based (routed `macroOutcome`)
- Result: 1x Enchanted Plate Armour (quality depends on check)

### Creating via Macro

```javascript
const { Recipe } = game.fabricate.api;

const recipe = new Recipe({
  name: 'Enchanted Plate Armour',
  craftingSystemId: 'blacksmithing-system-id',
  steps: [
    {
      id: 'forge-plates',
      name: 'Forge the Plates',
      description: 'Heat and hammer steel into armour plates.',
      timeRequirement: { hours: 4 },
      ingredientSets: [{
        id: 'forge-input',
        ingredientGroups: [{
          id: 'steel', name: 'Steel',
          options: [{ quantity: 5, match: { type: 'component', componentId: 'steel-ingot-id' } }]
        }],
        catalysts: [{ componentId: 'forge-id', degradesOnUse: true, maxUses: 100 }]
      }],
      resultGroups: [{
        id: 'plates-output',
        results: [{ id: 'plates', componentId: 'unfinished-plates-id', quantity: 1 }]
      }]
    },
    {
      id: 'assemble',
      name: 'Assemble the Armour',
      description: 'Rivet the plates onto a leather frame.',
      ingredientSets: [{
        id: 'assemble-input',
        ingredientGroups: [
          {
            id: 'plates', name: 'Plates',
            options: [{ quantity: 1, match: { type: 'component', componentId: 'unfinished-plates-id' } }]
          },
          {
            id: 'straps', name: 'Straps',
            options: [{ quantity: 2, match: { type: 'component', componentId: 'leather-strap-id' } }]
          }
        ]
      }],
      resultGroups: [{
        id: 'armour-output',
        results: [{ id: 'armour', componentId: 'plate-armour-id', quantity: 1 }]
      }]
    },
    {
      id: 'enchant',
      name: 'Enchant',
      description: 'Channel magical energy into the armour.',
      ingredientSets: [{
        id: 'enchant-input',
        ingredientGroups: [
          {
            id: 'armour', name: 'Armour',
            options: [{ quantity: 1, match: { type: 'component', componentId: 'plate-armour-id' } }]
          },
          {
            id: 'gem', name: 'Gem',
            options: [{ quantity: 1, match: { type: 'component', componentId: 'enchanting-gem-id' } }]
          }
        ]
      }],
      resultGroups: [{
        id: 'enchanted-output',
        results: [{ id: 'enchanted', componentId: 'enchanted-plate-id', quantity: 1 }]
      }]
    }
  ]
});

await game.fabricate.getRecipeManager().createRecipe(recipe.toJSON());
```

## Time Gates

When a step has a `timeRequirement`, the run enters `waitingTime` status after the step's ingredients are consumed. The step completes automatically when world time advances past the required duration.

Time gates are checked:
- When the player tries to advance (they'll see how much time remains)
- On the `updateWorldTime` hook (auto-completes and advances)
- On module startup (catches up on offline time)

## Managing Runs

Players can see their active runs in the crafting app. From there they can:
- **Resume** a run (continue from the current step)
- **Cancel** a run (abandons progress; consumed items are not returned)

{: .warning }
> Disabling the `multiStepRecipes` feature is destructive. All existing multi-step recipes will be deleted.
