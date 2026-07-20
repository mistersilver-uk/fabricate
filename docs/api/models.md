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
  allowPlayerResultReorder, // boolean (default true) -- progressive mode only
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
  resultSelection: {     // object (legacy, retired — round-trip only)
    provider             // "ingredientSet" | "check"
  },
  metadata               // object (created, modified, author, version)
})
```

{: .note }
> `allowPlayerResultReorder` is the GM-authored permission for player re-ordering of this recipe's progressive result stages (issue 651).
> It defaults to `true`, and an absent key reads as `true`, which is why the 1.17.0 migration does not seed it.
> Only an explicit `false` pins the authored stage order.
> It is read in progressive mode only, and it replaces the retired system-level `craftingCheck.progressive.allowPlayerReorder`.
> The salvage equivalent is `component.salvage.allowPlayerResultReorder`.

{: .note }
> The per-recipe `resultSelection.provider` is retired (issue 554).
> No live resolution mode reads it: alchemy routing moved to the system-level alchemy check mode (`system.alchemy.checkMode`), and the two routed crafting modes (`routedByIngredients` and `routedByCheck`) derive their routing basis from the system mode.
> The field is still normalised so a legacy recipe round-trips until migration strips it, but authoring no longer sets it.
> `routedByIngredients` routes by each `IngredientSet.resultGroupId`, and `routedByCheck` routes by the system's routed crafting-check outcome.
> The legacy `outcomeRouting` field and the legacy `mapped`/`tiered` and single `routed` modes are normalised on load.
> `mapped` becomes `routedByIngredients` and `tiered` becomes `routedByCheck`.

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
  resultGroupId      // string | null (routedByIngredients routing target)
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
    type,         // "component" | "tags" | "currency" | "essence"
    componentId,  // string (for component type)
    tags,         // string[] (for tags type)
    tagMatch,     // "any" | "all" (for tags type)
    unit,         // string (currency unit id, for currency type)
    essenceId,    // string (for essence type)
    amount        // number (currency cost or essence amount, for currency/essence types)
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
  id,             // string (library id, referenced by toolIds)
  componentId,    // string | null (optional managed-component link; null for an item-sourced tool)
  name,           // string | null (display snapshot captured at registration/migration)
  img,            // string | null (display snapshot image)
  registeredItemUuid, // string | null (the tool's own registered source item uuid)
  originItemUuid,     // string | null (the tool's own canonical/compendium source uuid)
  aliasItemUuids,     // string[] (additional source references for matching)
  label,          // string (optional user-authored display label, distinct from the snapshot)
  requirement,    // null | { formula } (a Foundry roll expression; required when set)
  breakage,       // { mode: 'limitedUses', maxUses } |
                  // { mode: 'breakageChance', breakageChance } |
                  // { mode: 'diceExpression', formula, threshold } |
                  // { mode: 'immune' }
  onBreak         // { mode: 'destroy' } | { mode: 'flagBroken' } |
                  // { mode: 'replaceWith', replacementComponentId }
}
```

A Tool is first-class as of issue 561: it carries its own source references (`registeredItemUuid` / `originItemUuid` / `aliasItemUuids`, renamed in issue 560) and a `name` / `img` display snapshot, so it can be registered directly from an Item without importing that Item as a component.
`componentId` is optional.
It is `null` for an item-sourced tool and populated only for a tool that is also a managed component (a whetstone) or one migrated from a legacy component-linked tool.
A valid Tool carries either a `componentId` or its own source references.

Per-item usage for `limitedUses` tools is tracked under `Item.flags.fabricate.toolUsage = { timesUsed }`.
The `flagBroken` on-break action sets `Item.flags.fabricate.toolBroken = true`.
A tool's durable identity is stamped on its source Item as `Item.flags.fabricate.roles[systemId].toolId`, a sibling of the component role flag, so the same Item can be both a component and a tool.

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
