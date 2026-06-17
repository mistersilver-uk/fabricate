---
layout: default
title: Multi-Step Recipes
parent: Recipes
nav_order: 5
---

# Multi-Step Recipes

{: .gm }
> Requires the `multiStepRecipes` feature to be enabled on the crafting system.

Multi-step recipes chain several steps that must be completed in sequence.
Each step can have its own ingredients, tool references (`toolIds`), results, time requirements, and currency requirements.

---

## How It Works

1. Player starts the recipe and a **crafting run** is created
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
- Ingredients: 5x Steel Ingot, requires the Forge tool
- Time: 4 hours of world time
- Result: 1x Unfinished Plate Set

**Step 2: Assemble the Armour**
- Ingredients: 1x Unfinished Plate Set, 2x Leather Strap
- Result: 1x Plate Armour

**Step 3: Enchant**
- Ingredients: 1x Plate Armour, 1x Enchanting Gem
- Crafting check: skill-based (routed `macroOutcome`)
- Result: 1x Enchanted Plate Armour (quality depends on check)

### Creating the recipe

A multi-step recipe carries a `steps` array.
Each step defines its own `ingredientSets`, `resultGroups`, optional `toolIds`, and optional `timeRequirement`.
For the example above, the Forge step requires the Forge tool and a 4-hour time gate, the Assemble step consumes the unfinished plates plus leather straps, and the Enchant step combines the plate armour with an enchanting gem.
Recipes can be authored through the API only.
See the [API reference]({% link api/recipe-manager.md %}) for the methods that create and configure recipes.

## Time Gates

When a step has a `timeRequirement`, the run enters `waitingTime` status after the step's ingredients are consumed.
The step completes automatically when world time advances past the required duration.

Time gates are checked:
- When the player tries to advance (they'll see how much time remains)
- On the `updateWorldTime` hook (auto-completes and advances)
- On module startup (catches up on offline time)

## Managing Runs

Multi-step run state is stored on the actor through `CraftingRunManager`.
Multi-step runs are driven via the API today.
A player-facing UI for resuming and cancelling active runs is planned and not yet available.

{: .warning }
> Disabling the `multiStepRecipes` feature is destructive.
> All existing multi-step recipes will be deleted.
