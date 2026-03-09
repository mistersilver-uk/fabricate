---
layout: default
title: Data Models
parent: API Reference
nav_order: 7
---

# Data Models

All model classes are available via `game.fabricate.api`:

```javascript
const {
  Recipe, Ingredient, IngredientGroup, IngredientSet,
  Catalyst, Result
} = game.fabricate.api;
```

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
  ingredientSets,        // IngredientSet[] (single-step)
  steps,                 // object[] (multi-step)
  resultGroups,          // object[]
  catalysts,             // Catalyst[]
  transferEffects,       // boolean (default false)
  resultSelection: {     // object (routed mode only)
    provider,            // "ingredientSet" | "macroOutcome" | "rollTableOutcome"
    macroUuid,           // string | null (macroOutcome provider)
    rollTableUuid        // string | null (rollTableOutcome provider)
  },
  metadata               // object (created, modified, author, version)
})
```

{: .note }
> The legacy `outcomeRouting` field and the `mapped`/`tiered` modes have been replaced by `resultSelection` with a `provider` field. Legacy recipes are automatically normalised on load. Use `resultSelection` for all new routed recipes.

**Key methods:**

| Method | Returns | Description |
|:-------|:--------|:------------|
| `validate()` | `{valid, errors}` | Validates recipe structure |
| `getResultDescription()` | `string` | Human-readable result summary |
| `isSimpleRecipe()` | `boolean` | True if no tags/essences/catalysts/steps |
| `getExecutionSteps()` | `object[]` | Steps array (converts implicit step if single-step) |
| `toJSON()` | `object` | Serialise to JSON |
| `Recipe.fromJSON(data)` | `Recipe` | Deserialise from JSON |
| `Recipe.createSimple(name, ingredients, result)` | `Recipe` | Helper for simple recipes |

---

## IngredientSet

```javascript
IngredientSet.fromJSON({
  id,                // string
  name,              // string
  ingredientGroups,  // IngredientGroup[] -- all must be satisfied (AND)
  essences,          // { [essenceId]: quantity }
  catalysts,         // Catalyst[]
  resultGroupId      // string | null (routed ingredientSet provider routing)
})
```

**Key methods:**

| Method | Returns | Description |
|:-------|:--------|:------------|
| `canBeCraftedWith(items)` | `boolean` | Quick check against available items |
| `resolveIngredientSelection(items, matcher)` | `{success, selectedIngredients, missingGroups}` | Detailed resolution |
| `validate()` | `{valid, errors}` | Validates structure |

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
> The `match.type` value `"component"` replaces the previous `"systemItem"`. The `match.componentId` field replaces the previous `match.systemItemId`. Use the new names for all new data.

**Key methods:**

| Method | Returns | Description |
|:-------|:--------|:------------|
| `matches(item)` | `boolean` | Check if a Foundry item satisfies this ingredient |
| `getDescription()` | `string` | Human-readable description |
| `validate()` | `{valid, errors}` | Validates structure |

---

## Catalyst

```javascript
new Catalyst({
  componentId,          // string (required)
  degradesOnUse,        // boolean (default false)
  destroyWhenExhausted, // boolean (default false)
  maxUses               // number | null (default null)
})
```

{: .note }
> The field was previously named `systemItemId`. Use `componentId` for all new data.

**Key methods:**

| Method | Returns | Description |
|:-------|:--------|:------------|
| `validate()` | `{valid, errors}` | Validates structure |
| `applyDegradation(item)` | `Promise<void>` | Increment usage, optionally delete |

---

## Result

```javascript
new Result({
  id,                // string
  componentId,       // string (managed component reference)
  itemUuid,          // string (direct Foundry item reference)
  quantity,          // number (default 1)
  propertyMacroUuid  // string | null
})
```

{: .note }
> The field was previously named `systemItemId`. Use `componentId` for all new data.

**Key methods:**

| Method | Returns | Description |
|:-------|:--------|:------------|
| `validate()` | `{valid, errors}` | Validates structure |
| `getDescription()` | `string` | Human-readable description |
