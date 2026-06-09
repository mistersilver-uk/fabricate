---
layout: default
title: Macros & Examples
nav_order: 8
has_children: true
---

# Macros & Examples

Fabricate integrates with Foundry macros at several points in the crafting pipeline. This section covers the macro contracts and provides ready-to-use example macros.

---

## Macro Contracts

### Crafting Check Macro

Called during step resolution when `craftingCheck.enabled` is `true`. The macro receives a context object and must return a result.

**Input context** (passed as `scope`):

| Property | Type | Description |
|:---------|:-----|:------------|
| `recipe` | `object` | The recipe being crafted |
| `craftingSystem` | `object` | The crafting system configuration |
| `craftingActor` | `Actor` | The actor doing the crafting |
| `componentSourceActors` | `Actor[]` | Actors supplying ingredients |
| `step` | `object` | The current step (multi-step recipes) |
| `selectedIngredientSet` | `object` | The ingredient set being used |

**Return value by mode:**

| Mode | Return Shape |
|:-----|:------------|
| Simple | `{ success: boolean, data?: object }` |
| Mapped | `{ success: boolean, data?: object }` |
| Routed (`macroOutcome`) | `{ success: boolean, outcome: string, data?: object }` |
| Progressive | `{ success: boolean, value: number, data?: object }` |

**Example (simple pass/fail):**

```javascript
const { craftingActor } = scope;
const roll = new Roll("1d20 + @abilities.wis.mod", craftingActor.getRollData());
await roll.evaluate();
await roll.toMessage({ flavor: `${craftingActor.name} attempts to craft...` });

return { success: roll.total >= 10 };
```

### Property Macro

Called per result item when `features.propertyMacros` is enabled and a result has `propertyMacroUuid` set. Returns an object of property paths to merge into the created item's data.

**Input context:**

| Property | Type | Description |
|:---------|:-----|:------------|
| `recipe` | `object` | The recipe |
| `result` | `object` | The result definition |
| `craftingActor` | `Actor` | The crafting actor |
| `resolvedIngredients` | `object[]` | Ingredients resolved for the craft, each `{ item, quantity, ingredient }` |
| `resolvedTools` | `object[]` | Tools resolved for the craft, each `{ item, tool }` |
| `checkResult` | `object` | The crafting check result (if any) |

**Return value:** `{ [propertyPath]: value }`

**Example:**

```javascript
const { craftingActor, checkResult } = scope;

// Scale weapon damage based on check result
const bonus = checkResult?.data?.roll >= 20 ? 2 : 1;
return {
  "system.damage.parts": [
    [`${bonus}d6 + ${bonus}`, "slashing"]
  ],
  "system.description.value": `<p>Forged by ${craftingActor.name}.</p>`
};
```

### Success Macro

Called after a step completes successfully. The return value of the macro is ignored — use this macro for side-effects only (chat messages, XP awards, sound effects, etc.).

**Configuration:** Set `system.craftingCheck.successMacroUuid` to the UUID of the Foundry macro to call. If the field is absent or `null`, no macro is executed.

**Input context** (passed as `scope`):

| Property | Type | Description |
|:---------|:-----|:------------|
| `recipe` | `object` | The recipe (serialised via `toJSON()`) |
| `craftingSystem` | `object` | The crafting system configuration |
| `craftingActor` | `Actor` | The actor that performed the craft |
| `componentSourceActors` | `Actor[]` | Actors that supplied ingredients |
| `step` | `object` | The step that just completed |
| `selectedIngredientSet` | `object` | The ingredient set that was used |
| `consumedIngredients` | `object[]` | Items consumed, each `{ item, quantity, ingredient }` |
| `consumedTools` | `object[]` | Tools used this attempt, each `{ tool, item }` |
| `createdResults` | `Item[]` | Foundry Item documents created on the crafting actor |
| `checkResult` | `object` | The crafting check result (`{ success, outcome, value, data }`) |

{: .note }
> If the macro throws an error, Fabricate logs the error to the browser console and continues normally. The crafting result is not affected.

**Example:**

```javascript
const { craftingActor, recipe, createdResults } = scope;

// Send a chat message announcing the craft
const itemNames = createdResults.map(i => i.name).join(", ");
ChatMessage.create({
  speaker: ChatMessage.getSpeaker({ actor: craftingActor }),
  content: `<h3>Crafting Complete!</h3>
    <p><strong>${craftingActor.name}</strong> crafted: ${itemNames}</p>`
});
```

### Failure Macro

Called when a step fails due to a crafting check failure or a check-result validation failure. The return value is ignored — use this macro for side-effects only.

**Configuration:** Set `system.craftingCheck.failureMacroUuid` to the UUID of the Foundry macro to call. If the field is absent or `null`, no macro is executed.

**Input context** (passed as `scope`):

| Property | Type | Description |
|:---------|:-----|:------------|
| `recipe` | `object` | The recipe (serialised via `toJSON()`) |
| `craftingSystem` | `object` | The crafting system configuration |
| `craftingActor` | `Actor` | The actor that attempted the craft |
| `componentSourceActors` | `Actor[]` | Actors that supplied ingredients |
| `step` | `object` | The step that failed |
| `selectedIngredientSet` | `object` | The ingredient set that was selected |
| `failureReason` | `string` | A human-readable description of why the step failed |
| `checkResult` | `object` | The crafting check result (`{ success, outcome, value, data }`) |
| `consumedIngredients` | `object[]` | Items consumed on this failure path (may be empty if `consumeIngredientsOnFail` is `false`) |
| `consumedTools` | `object[]` | Tools broken/degraded on this failure path, each `{ tool, item }` (may be empty if `consumeCatalystsOnFail` is `false`) |

{: .note }
> `createdResults` is **not** present in the failure context because no result items are created on failure. If the macro throws an error, Fabricate logs it to the browser console and continues; the failure result returned to the caller is not affected.

**When the failure macro runs:**

- After a crafting check macro returns `{ success: false }`.
- After a successful check result fails resolution-mode validation (e.g. the outcome value does not satisfy the current progressive mode requirements or routed macroOutcome provider).

Pre-check failures (missing ingredients, missing or unsatisfied tools, invalid recipe, missing actor) return immediately **without** calling the failure macro.

**Example:**

```javascript
const { craftingActor, recipe, failureReason, consumedIngredients } = scope;

const lostItems = consumedIngredients.map(({ item, quantity }) =>
  `${item.name} x${quantity}`
).join(", ");

ChatMessage.create({
  speaker: ChatMessage.getSpeaker({ actor: craftingActor }),
  content: `<h3>Crafting Failed!</h3>
    <p><strong>${craftingActor.name}</strong> failed to craft ${recipe.name}.</p>
    <p><em>${failureReason}</em></p>
    ${lostItems ? `<p>Lost: ${lostItems}</p>` : ''}`
});
```

---

## Global Macro Helpers

Fabricate exposes convenience functions on the `fabricate` global for use in macros:

```javascript
// Create a simple recipe
await fabricate.createSimpleRecipe(name, ingredients, result);

// Craft an item
await fabricate.craft(actor, recipeId, options);

// List recipes with optional filters
fabricate.listRecipes({ category, enabled, tags, search });

// Get recipes an actor can craft
fabricate.getAvailableRecipes(actorOrActors);

// Open the GM recipe manager
fabricate.openRecipeManager();

// List all crafting systems
fabricate.listCraftingSystems();
```
