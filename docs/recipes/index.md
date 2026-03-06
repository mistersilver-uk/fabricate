---
layout: default
title: Recipes
nav_order: 4
has_children: true
---

# Recipes

A recipe defines what ingredients are needed and what results are produced. Recipes belong to a crafting system and follow that system's resolution mode.

---

## Recipe Structure

Every recipe has:

| Field | Description |
|:------|:------------|
| `name` | Display name |
| `description` | Flavour text |
| `category` | Organisational category (if `recipeCategories` is enabled) |
| `enabled` | Whether the recipe can be crafted |
| `locked` | Prevents non-GM users from crafting |
| `craftingSystemId` | The system this recipe belongs to |
| `ingredientSets` | One or more sets of required ingredients |
| `resultGroups` | One or more groups of produced items |
| `catalysts` | Non-consumable tools required for crafting |
| `transferEffects` | Whether to copy active effects from ingredients to results |
| `visibility` | Access control (restricted, allowedUserIds) |
| `linkedRecipeItemUuid` | Item that teaches this recipe (for knowledge mode). In the recipe editor you can browse for an existing item, paste a UUID directly, or use **Create Recipe Item** to generate a new world item automatically. |

## Enabling and Disabling Recipes

The `enabled` field controls whether a recipe can be crafted. A disabled recipe does not appear in the player-facing crafting app, but it remains fully accessible to GMs in the Crafting Admin panel.

**In the Crafting Admin panel.** Each recipe row in the recipe list includes an enable/disable toggle checkbox in the Actions column. Disabled recipes are shown with reduced opacity and a grey **Disabled** badge next to their name, so you can see at a glance which recipes are turned off. The recipe editor and the toggle are both accessible regardless of whether a recipe is disabled — click the edit button or toggle the checkbox directly on the row.

**Why disable rather than delete?** Disabling is non-destructive. You can hide a recipe from players while you are still configuring it, or temporarily remove it from circulation without losing its ingredient and result configuration.

**Programmatically.** You can toggle the enabled state via the API:

```javascript
// Disable the Iron Sword recipe while you revise it
Hooks.once('fabricate.ready', async () => {
  const rm = game.fabricate.getRecipeManager();
  await rm.updateRecipe('iron-sword-recipe-id', { enabled: false });
});
```

```javascript
// Re-enable it when it is ready
Hooks.once('fabricate.ready', async () => {
  const rm = game.fabricate.getRecipeManager();
  await rm.updateRecipe('iron-sword-recipe-id', { enabled: true });
});
```

## Ingredient Semantics

Ingredients are organised in a three-level hierarchy:

```
Recipe
 └─ Ingredient Sets (OR -- any one set satisfies the recipe)
     └─ Ingredient Groups (AND -- all groups in the set must be satisfied)
         └─ Options (OR -- any one option satisfies the group)
```

**Example:** A sword recipe might accept either iron or steel:

- **Ingredient Set "Metal Sword"**
  - **Group "Metal"** (need any one of):
    - Option: 3x Iron Ingot
    - Option: 2x Steel Ingot
  - **Group "Handle"** (need any one of):
    - Option: 1x Oak Wood
    - Option: 1x Leather Wrap

The recipe is craftable if the player has materials to satisfy all groups in at least one set.

### Ingredient Matching

Each ingredient option specifies how to match against the player's inventory:

| Match Type | Description |
|:-----------|:------------|
| `component` | Match by `componentId` -- the managed component's ID in the crafting system |
| `tags` | Match by tags on the item (requires `itemTags` feature). Use `tagMatch: "any"` or `"all"` |

{: .note }
> The `component` match type was previously called `systemItem`. Use `component` for all new recipes.

## Resolution Modes

The resolution mode determines how ingredients map to results:

| Mode | Sets | Result Groups | Check Required | Use When |
|:-----|:-----|:--------------|:---------------|:---------|
| [Simple]({% link recipes/simple.md %}) | 1 | 1 | Optional | Basic A + B = C crafting |
| [Mapped]({% link recipes/mapped.md %}) | 1+ | 1+ | Optional | Different inputs produce different outputs |
| [Tiered]({% link recipes/tiered.md %}) | 1+ | 1+ | **Yes** | Skill check determines quality of result |
| [Progressive]({% link recipes/progressive.md %}) | 1 | 1 (ordered) | **Yes** | Skill check value "buys" results in order |

## Multi-Step Recipes

When the `multiStepRecipes` feature is enabled, recipes can have multiple sequential steps. Each step has its own ingredient sets, result groups, catalysts, and optional time/currency requirements.

See [Multi-Step Recipes]({% link recipes/multi-step.md %}) for details.

## Catalysts

Catalysts are items required for crafting but not consumed. A blacksmith's forge, an alchemist's cauldron, or a wizard's staff might be catalysts.

See [Catalysts]({% link catalysts.md %}) for configuration and usage tracking.

## The Crafting App

Players access recipes through the crafting app:

1. Open the **Items** sidebar
2. Click **Crafting**
3. Select your crafting actor and ingredient sources
4. Browse or search recipes
5. Recipes show status badges:
   - **Available** (green) -- you have all materials
   - **Locked** -- GM has locked this recipe
   - **Unknown** -- you haven't learned this recipe yet
   - **Exhausted** -- your recipe item has no uses left
   - **Missing Materials** (red) -- shows what you're missing
6. Click **Craft** to start
