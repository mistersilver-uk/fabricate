---
layout: default
title: CraftingEngine
parent: API Reference
nav_order: 2
---

# CraftingEngine

Executes the crafting pipeline.
It validates ingredients, runs checks, consumes items, and creates results.

**Access:** `game.fabricate.getCraftingEngine()`

---

## Methods

### craft(craftingActor, componentSourceActors, recipe, ingredientSetId, options)

The main crafting method.
Runs the full pipeline for a single step.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `craftingActor` | `Actor` | The actor receiving crafted items |
| `componentSourceActors` | `Actor[]` | Actors supplying ingredients |
| `recipe` | `Recipe` | The recipe to craft |
| `ingredientSetId` | `string \| null` | Which ingredient set to use. `null` auto-selects the first satisfiable set |
| `options` | `object` | Optional: `{ runId, resultGroupId }` |

**Returns:** `Promise<{ success: boolean, results: Item[], message: string }>`

### Pipeline Steps

When `craft()` is called, the engine:

1. **Validates ingredients.**
   Checks all groups in the selected ingredient set are satisfiable.
2. **Validates tools.**
   Checks all required tools (resolved from `toolIds`) are present in the source actors' inventories and pass their requirement.
3. **Validates essences.**
   If essences are enabled, checks essence requirements.
4. **Runs crafting check.**
   When the resolution mode has a usable check (an authored roll formula), rolls it and interprets the result per the resolution mode.
   See [Crafting Checks]({% link crafting-checks.md %}).
5. **Applies failure consumption policy.**
   If the check fails, consumes ingredients and/or applies tool breakage according to `craftingCheck.consumption` settings.
   By default, ingredients are consumed (`consumeIngredientsOnFail: true`) and tools are not broken (`breakToolsOnFail: false`, renamed from the legacy `consumeCatalystsOnFail`).
   See [Consumption on Failure]({% link crafting-checks.md %}#consumption-on-failure).
6. **Resolves result groups.**
   Determines which result group(s) to create based on mode and check result.
7. **Consumes ingredients.**
   Removes consumed items from source actors.
8. **Applies tool breakage.**
   Runs each tool's breakage mechanic (`limitedUses` / `breakageChance` / `diceExpression`) and its on-break action, recording `usedTools` evidence.
9. **Creates results.**
   Creates new items on the crafting actor.
10. **Applies property macros.**
    If enabled, runs property macros on created items.
11. **Transfers effects.**
    If `system.features.essences`, `system.features.effectTransfer`, and `recipe.transferEffects` are all `true`, collects active effects from the `sourceItemUuid` of each contributing essence definition and copies them to the result item.
    See [Effect Transfer]({% link effect-transfer.md %}).

{: .note }
> Step 5 only executes when the crafting check returns a failure result or check-result validation fails.
> Pre-check failures (missing ingredients, missing or unsatisfied tools, invalid recipe, missing actor) return immediately without consuming anything.

---

## Crafting Check Execution

Step 4 of the pipeline rolls the check for the active resolution mode.
A check is only "usable" when its resolution-mode sub-object carries an authored roll formula.

| Resolution mode | Sub-object | Usable when |
|:----------------|:-----------|:------------|
| `simple` / `alchemy` | `system.craftingCheck.simple` | `simple.rollFormula` is set |
| `routedByCheck` | `system.craftingCheck.routed` | `routed.rollFormula` is set |
| `routedByIngredients` | `system.craftingCheck.routed` | `routed.rollFormula` is set (the check is optional and does not select the result) |
| `progressive` | `system.craftingCheck.progressive` | `progressive.rollFormula` is set |

In simple mode the check is optional.
It runs only when `simple.rollFormula` is set and the system enables crafting checks (`craftingCheck.enabled` is `true` or the system's `craftingChecks` feature is on).
In alchemy mode the check is always on whenever `simple.rollFormula` is set.

Routed-by-check and progressive modes both require a usable check.
When the resolution mode requires a check but no roll formula is configured, the engine fails loudly with `success: false` and a message of the form `<mode> mode requires a configured crafting check roll formula`, so the misconfiguration is visible.
When an optional check has no roll formula to run, the engine treats it as a no-op success.

### Dynamic DC Macro

The simple pass/fail check can compute its DC from a macro instead of a static value.
When `simple.dcMode` is `"dynamic"`, the engine runs the macro at `system.craftingCheck.simple.macroUuid` and uses its returned number as the DC.
If the macro is absent or throws, the engine falls back to the static DC.
This dynamic-DC macro is the only macro the crafting check still uses, and it only computes the DC.
It never resolves the check outcome itself.

### Effect Transfer Gating

Effect transfer in step 12 is controlled by an essence-based pipeline and requires **all three** of the following flags to be set:

- `system.features.essences === true`.
  The essences system must be enabled.
  Effect transfer is built on top of essence definitions and requires this feature to resolve source items.
- `system.features.effectTransfer === true`.
  The GM opts the system in via the Features card in the Crafting Admin panel.
- `recipe.transferEffects === true`.
  The recipe author opts this specific recipe in.

If any of these flags is `false`, `_transferEffects` is not called and no effects are copied.

**How effects are collected.** When all three flags are met, the engine determines which essence IDs were contributed by the resolved ingredients, then for each contributing essence looks up its `EssenceDefinition` in `system.essenceDefinitions`.
If the definition has a `sourceItemUuid`, that item is fetched via `fromUuid()` and its active effects are collected.
All collected effects are applied to the created result item in a single `createEmbeddedDocuments('ActiveEffect', ...)` call.
Essence definitions with no `sourceItemUuid`, or whose UUID no longer resolves, are silently skipped.

{: .note }
> The old ingredient-level `extractEffects` / `effectFilter` approach has been removed.
> Setting `extractEffects: true` on an ingredient has no effect.
> Configure effect transfer through essence definitions and their `sourceItemUuid` field instead.

```javascript
// This recipe will transfer effects when the system has
// features.essences: true AND features.effectTransfer: true.
const recipe = {
  transferEffects: true,
  // ...other recipe fields
};

// This recipe will NOT transfer effects regardless of system settings.
const nonTransferRecipe = {
  transferEffects: false,
  // ...other recipe fields
};
```

**Essence definitions drive which effects are transferred.** If the resolved ingredients contribute a "fire" essence, and the system has a Fire essence definition with a `sourceItemUuid` pointing to a "Flame Shard" item, all active effects on that Flame Shard are copied to the result.
See [Essences]({% link essences.md %}) for how to configure essence definitions with source items.

### Example

```javascript
const engine = game.fabricate.getCraftingEngine();
const rm = game.fabricate.getRecipeManager();

const recipe = rm.getRecipe('my-recipe-id');
const actor = game.user.character;

const result = await engine.craft(
  actor,           // crafting actor
  [actor],         // ingredient sources
  recipe,          // recipe
  null,            // auto-select ingredient set
  {}               // no special options
);

if (result.success) {
  console.log(`Crafted: ${result.results.map(i => i.name).join(', ')}`);
} else {
  console.log(`Failed: ${result.message}`);
}
```

### Using the Quick Helper

For simpler cases, use the top-level `craft()` method.

```javascript
const result = await game.fabricate.craft(actor, 'recipe-id', {
  componentSourceActors: [actor, partyChest]
});
```

Or from a macro:

```javascript
await fabricate.craft(game.user.character, 'recipe-id');
```
