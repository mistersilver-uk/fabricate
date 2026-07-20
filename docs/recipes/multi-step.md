---
layout: default
title: Multi-Step Recipes
parent: Recipes
nav_order: 4
---

# Multi-Step Recipes

{: .gm }
> Requires the Multi-Step Recipes feature to be enabled on the crafting system.

Multi-step recipes chain several steps that must be completed in sequence.
Each step can have its own ingredients, required tools, results, time requirements, and currency requirements.

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
- The overall status: in progress, waiting on time, succeeded, failed, or cancelled

Runs are saved on the crafting character and persist across sessions.

## In the Crafting Tab

When a player opens a multi-step recipe in the **Crafting** tab, its required materials are shown step by step.

Each step appears as a numbered block, in order, and each block lists that step's own required materials.
A block shows what the player has, what the step needs, and what is still missing.
A short hint at the top of the list reminds players that the recipe is made in several steps and that each one is crafted in order.

The intermediate items a step produces along the way are not listed as separate results.
Only the recipe's final product is shown, as a single **Produces** row beneath the steps.
This keeps the focus on what the whole recipe makes rather than on the parts made on the way there.

The **Craft** button reflects the first step.
A later step showing missing materials never stops a player from starting the recipe, so players can gather what a later step needs before it comes up in the run.

{: .note }
> This step-by-step material preview is shown for multi-step recipes in Simple mode.
> Recipes in the routed and progressive modes are not affected and display as before.

If the crafting system has no crafting check turned on, a recipe no longer shows an empty crafting-check box in its detail.
A crafting-check box still appears when the system has a check that always applies to the recipe, or when a roll formula has been configured for the check.

## Example: Enchanted Armour

A three-step recipe for creating enchanted plate armour:

### Step 1: Forge the Plates

- Ingredients: 5x Steel Ingot, requires the Forge tool
- Time: 4 hours of world time
- Result: 1x Unfinished Plate Set

### Step 2: Assemble the Armour

- Ingredients: 1x Unfinished Plate Set, 2x Leather Strap
- Result: 1x Plate Armour

### Step 3: Enchant

- Ingredients: 1x Plate Armour, 1x Enchanting Gem
- Crafting check: skill-based (Routed by check with a named outcome)
- Result: 1x Enchanted Plate Armour (quality depends on check)

### Creating the recipe

A multi-step recipe is made up of an ordered list of steps.
Each step has its own ingredient sets, result groups, optional required tools, and an optional time requirement.
For the example above, the Forge step requires the Forge tool and a 4-hour time gate, the Assemble step consumes the unfinished plates plus leather straps, and the Enchant step combines the plate armour with an enchanting gem.
You author each step on the Ingredients and Results tabs of the recipe editor in the Crafting Admin panel.
The public API can create and configure recipes too.
See the [API reference]({% link api/recipe-manager.md %}) for those methods.

## Time Gates

When a step has a time requirement and the system has time requirements enabled, the run waits on time after the step's ingredients are consumed.
The step completes automatically when world time advances past the required duration.
Time requirements are on by default, and a GM can turn them off per system.
See [Time Requirements]({% link crafting-systems.md %}#time-requirements).

Time gates are checked:

- When the player tries to advance (they'll see how much time remains)
- Whenever world time advances (the step completes and advances on its own)
- On module startup (catches up on offline time)

## Managing Runs

Multi-step run state is saved on the character.
Players continue a multi-step crafting run from the **Journal** tab, using **Trigger Next Step** to roll and advance each step in turn.
See [Journal]({% link journal.md %}).
Cancelling an active run from the UI is not yet available, though runs can still be managed through the API.

{: .note }
> Disabling the Multi-Step Recipes feature is not destructive.
> Your multi-step recipes are kept exactly as you authored them.
> While the feature is off, each multi-step recipe collapses into a single combined action: crafting it runs all of its steps back-to-back in one go and produces the results of its final step, and any step time requirements are added together into a single wait.
> In the editor the recipe shows as single-step — its steps are read-only, and you edit its final results directly.
> Turning the feature off asks you to confirm this first; turning it back on restores the full multi-step recipe and editor with nothing lost.
