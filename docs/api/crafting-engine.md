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
   If enabled, executes the check (built-in or macro) and interprets the result per the resolution mode.
   See [Crafting Checks]({% link crafting-checks.md %}) for both modes.
5. **Applies failure consumption policy.**
   If the check fails, consumes ingredients and/or applies tool breakage according to `craftingCheck.consumption` settings.
   By default, ingredients are consumed (`consumeIngredientsOnFail: true`) and tools are not broken (`consumeCatalystsOnFail: false`, field name retained for backward compatibility).
   See [Consumption on Failure]({% link crafting-checks.md %}#consumption-on-failure).
6. **Runs failure macro.**
   If the check failed (step 4) or check-result validation failed (step 5), calls `system.craftingCheck.failureMacroUuid` with the failure context.
   See [Crafting Checks]({% link crafting-checks.md %}).
   Macro errors are caught and logged.
   They do not affect the returned result.
7. **Resolves result groups.**
   Determines which result group(s) to create based on mode and check result.
8. **Consumes ingredients.**
   Removes consumed items from source actors.
9. **Applies tool breakage.**
   Runs each tool's breakage mechanic (`limitedUses` / `breakageChance` / `diceExpression`) and its on-break action, recording `usedTools` evidence.
10. **Creates results.**
    Creates new items on the crafting actor.
11. **Applies property macros.**
    If enabled, runs property macros on created items.
12. **Transfers effects.**
    If `system.features.essences`, `system.features.effectTransfer`, and `recipe.transferEffects` are all `true`, collects active effects from the `sourceItemUuid` of each contributing essence definition and copies them to the result item.
    See [Effect Transfer]({% link effect-transfer.md %}).
13. **Runs success macro.**
    Calls `system.craftingCheck.successMacroUuid` with the full success context.
    See [Crafting Checks]({% link crafting-checks.md %}).
    Macro errors are caught and logged.
    The crafting result is still returned as a success.

{: .note }
> Steps 5 and 6 only execute when the crafting check returns a failure result or check-result validation fails.
> Pre-check failures (missing ingredients, missing or unsatisfied tools, invalid recipe, missing actor) return immediately without consuming anything and without calling either macro.

---

## Crafting Check Execution

Step 4 of the pipeline dispatches to one of two execution paths based on `system.craftingCheck.checkSource`.

### Built-In Check Branch (`checkSource: "builtIn"`)

When `checkSource` is `"builtIn"`, the engine looks up a `CraftingCheckAdapter` for the current game system via `CraftingCheckAdapterRegistry`.
The adapter calls the game system's native dice API (`actor.rollSkill()` or `actor.rollAbilityCheck()` for D&D 5e) using the fields in `system.craftingCheck.builtIn`.

**If no adapter is registered** for the current game system, the engine returns immediately with `success: false` and the message:

> No system adapter available for built-in checks. Switch to macro mode or install a compatible game system.

Nothing is consumed and no macros are called in that case.

**If the adapter throws**, the engine catches the error, logs it with `Fabricate | Built-in crafting check failed`, and returns `success: false`.
The failure consumption policy (step 5) then applies.

The `builtIn` configuration object:

| Field | Type | Default | Description |
|:------|:-----|:--------|:------------|
| `ability` | `string` | `""` | Ability key (e.g. `"int"`, `"wis"`) |
| `skill` | `string` | `""` | Skill key (e.g. `"arc"`, `"nat"`). Takes precedence over `ability` when set. |
| `dc` | `number` | `15` | Difficulty class. Roll total must meet or exceed this value to succeed. |
| `advantage` | `string` | `"normal"` | `"advantage"`, `"disadvantage"`, or `"normal"` |

### Macro Check Branch (`checkSource: "macro"`)

When `checkSource` is `"macro"` (the default), the engine executes the macro at `system.craftingCheck.macroUuid`.
If no `macroUuid` is configured and the resolution mode requires a check (routed macroOutcome provider or progressive), the engine returns `success: false`.

See [Macros]({% link crafting-checks.md %}) for the full macro contract and context shape.

---

## CraftingCheckAdapter Interface

The adapter layer allows any game system to support built-in checks.
A built-in D&D 5e adapter (`Dnd5eCraftingCheckAdapter`) is registered automatically when the `dnd5e` game system is active.

Custom adapters must implement three methods:

```javascript
class MyCraftingCheckAdapter extends CraftingCheckAdapter {
  constructor() { super('my-system-id'); }

  /** @returns {Array<{key: string, label: string}>} */
  getAbilities() { /* ... */ }

  /** @returns {Array<{key: string, label: string}>} */
  getSkills() { /* ... */ }

  /**
   * @param {Actor} actor
   * @param {{ ability: string, skill: string, dc: number, advantage: string }} config
   * @returns {Promise<{ success: boolean, outcome: string|null, value: number|null, data: object }>}
   */
  async executeCheck(actor, config) { /* ... */ }
}
```

Register a custom adapter during module initialisation:

```javascript
Hooks.once('fabricate.ready', () => {
  CraftingCheckAdapterRegistry.register('my-system-id', MyCraftingCheckAdapter);
});
```

See [Registering a Custom Adapter]({% link crafting-checks.md %}#registering-a-custom-adapter) for a worked example.

---

### Success and Failure Macros

Configure macros to react to crafting outcomes without modifying the pipeline itself.
Both macros are configured on the crafting system, not on individual recipes.

| Setting | Path | Description |
|:--------|:-----|:------------|
| Success macro | `system.craftingCheck.successMacroUuid` | UUID of the macro to run after a successful step |
| Failure macro | `system.craftingCheck.failureMacroUuid` | UUID of the macro to run after a failed step |

Both fields are optional.
When absent or `null`, no macro is executed for that outcome.
If a macro throws, Fabricate catches the error, logs it to the browser console with `Fabricate |`, and continues.
The `craft()` return value is not changed.

See the full context shapes in [Macros & Examples]({% link crafting-checks.md %}).

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
