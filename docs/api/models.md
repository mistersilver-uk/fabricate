---
layout: default
title: Data Models
parent: API Reference
nav_order: 7
---

# Data Models

These model classes are exported via `game.fabricate.api`:

```javascript
const {
  Recipe, Ingredient, IngredientGroup, IngredientSet,
  Result
} = game.fabricate.api;
```

`IngredientSet` and `Result` are documented below as recipe data shapes.
They are normalised through recipe and manager APIs, but they are not exported as public constructors.

---

## Recipe

```javascript
new Recipe({
  id,                    // string -- auto-generated if omitted
  name,                  // string
  description,           // string
  category,              // string
  craftingSystemId,      // string -- links to a crafting system
  enabled,               // boolean (default true)
  locked,                // boolean (default false)
  linkedRecipeItemUuid,  // string | null
  visibility: {
    restricted,          // boolean (default false)
    allowedUserIds       // string[]
  },
  ingredientSets,        // Ingredient-set data[] (single-step)
  steps,                 // object[] (multi-step)
  resultGroups,          // object[]
  toolIds,               // string[] (library Tool ids required for crafting)
  transferEffects,       // boolean (default false)
  resultSelection: {     // object (routed mode only)
    provider             // "ingredientSet" | "check"
  },
  metadata               // object (created, modified, author, version)
})
```

{: .note }
> The legacy `outcomeRouting` field and the legacy `mapped`/`tiered` modes have been replaced by `resultSelection` with a `provider` field.
> Legacy recipes are automatically normalised on load.
> Use `resultSelection` for all new routed recipes.

**Key methods:**

| Method | Returns | Description |
|:-------|:--------|:------------|
| `validate()` | `{valid, errors}` | Validates recipe structure |
| `getResultDescription()` | `string` | Human-readable result summary |
| `isSimpleRecipe()` | `boolean` | True if no tags/essences/tools/steps |
| `getExecutionSteps()` | `object[]` | Steps array (converts implicit step if single-step) |
| `toJSON()` | `object` | Serialise to JSON |
| `Recipe.fromJSON(data)` | `Recipe` | Deserialise from JSON |
| `Recipe.createSimple(name, ingredients, result)` | `Recipe` | Helper for simple recipes |

---

## IngredientSet Data Shape

```javascript
{
  id,                // string
  name,              // string
  ingredientGroups,  // IngredientGroup[] -- all must be satisfied (AND)
  essences,          // { [essenceId]: quantity }
  toolIds,           // string[] (library Tool ids required for this set)
  resultGroupId      // string | null (routed ingredientSet provider routing)
}
```

**Key methods:**

| Method | Returns | Description |
|:-------|:--------|:------------|
| `Recipe.validate()` | `{valid, errors}` | Validates nested ingredient-set data as part of the recipe |
| `RecipeManager.evaluateCraftability(recipe, actors)` | `object` | Evaluates whether an actor inventory can satisfy ingredient-set data |

---

## IngredientGroup

```javascript
IngredientGroup.fromJSON({
  id,       // string
  name,     // string
  options   // Ingredient[] -- any one satisfies the group (OR)
})
```

---

## Ingredient

```javascript
new Ingredient({
  quantity,       // number (default 1)
  match: {
    type,         // "component" | "tags"
    componentId,  // string (for component type)
    tags,         // string[] (for tags type)
    tagMatch      // "any" | "all" (for tags type)
  },
  extractEffects, // boolean (default false)
  effectFilter    // string | null (regex for filtering effects)
})
```

{: .note }
> The `match.type` value `"component"` replaces the previous `"systemItem"`.
> The `match.componentId` field replaces the previous `match.systemItemId`.
> Use the new names for all new data.

**Key methods:**

| Method | Returns | Description |
|:-------|:--------|:------------|
| `matches(item)` | `boolean` | Check if a Foundry item satisfies this ingredient |
| `getDescription()` | `string` | Human-readable description |
| `validate()` | `{valid, errors}` | Validates structure |

---

## Tool

{: .note }
> The standalone `Catalyst` model was removed in `0.6.0`.
> Tools are not constructed via `game.fabricate.api`.
> They are authored in the per-system Tools library through the Crafting System Manager and referenced by id (`toolIds`).
> See [Tools]({% link tools.md %}) for the full concept.

A Tool entry stored under `system.tools` (the `craftingSystems` setting) has this shape:

```javascript
{
  id,           // string (library id, referenced by toolIds)
  componentId,  // string (required managed component reference)
  label,        // string (optional display label)
  requirement,  // null | { formula } (a Foundry roll expression; required when set)
  breakage,     // { mode: 'limitedUses', maxUses } |
                // { mode: 'breakageChance', breakageChance } |
                // { mode: 'diceExpression', formula, threshold }
  onBreak       // { mode: 'destroy' } | { mode: 'flagBroken' } |
                // { mode: 'replaceWith', replacementComponentId }
}
```

Per-item usage for `limitedUses` tools is tracked under `Item.flags.fabricate.toolUsage = { timesUsed }`.
The `flagBroken` on-break action sets `Item.flags.fabricate.toolBroken = true`.

---

## Result Data Shape

```javascript
{
  id,                // string
  componentId,       // string (managed component reference)
  itemUuid,          // string (direct Foundry item reference)
  quantity,          // number (default 1)
  propertyMacroUuid  // string | null
}
```

{: .note }
> The field was previously named `systemItemId`.
> Use `componentId` for all new data.

Result data is validated as part of recipe validation and consumed by the crafting engine when a result group is awarded.

**Related methods:**

| Method | Returns | Description |
|:-------|:--------|:------------|
| `Recipe.validate()` | `{valid, errors}` | Validates nested result data as part of the recipe |
| `Recipe.getResultDescription()` | `string` | Human-readable result summary |
