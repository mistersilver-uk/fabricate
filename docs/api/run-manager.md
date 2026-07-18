---
layout: default
title: CraftingRunManager
parent: API Reference
nav_order: 4
---

# CraftingRunManager

Manages multi-step crafting runs.
It handles creating, advancing, and completing them.

**Access:** `game.fabricate.getCraftingRunManager()`

---

## Query Methods

### getActiveRuns(actor)

Returns all in-progress runs for an actor.

**Returns:** `object[]`

### getActiveRun(actor, runId)

Returns a specific active run.

**Returns:** `object | null`

### findActiveRunForRecipe(actor, recipeId)

Finds an active run for a specific recipe.

**Returns:** `object | null`

```javascript
const runMgr = game.fabricate.getCraftingRunManager();
const run = runMgr.findActiveRunForRecipe(actor, 'enchanted-armour-id');
if (run) {
  console.log(`Resume run at step ${run.currentStepIndex + 1}`);
}
```

### getRunHistory(actor, limit)

Returns completed runs, optionally limited to the most recent `limit` entries.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `actor` | `Actor` | The actor |
| `limit` | `number` | Optional maximum number of results |

**Returns:** `object[]`

### getRun(actor, runId)

Retrieves a run from either active or history.

**Returns:** `object | null`

---

## Lifecycle Methods

### createRun(actor, recipe, componentSourceActors, userId)

Creates a new crafting run for a multi-step recipe.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `actor` | `Actor` | The crafting actor |
| `recipe` | `Recipe` | The recipe to start |
| `componentSourceActors` | `Actor[]` | Ingredient source actors |
| `userId` | `string` | The user's ID |

**Returns:** `Promise<object>`

### cancelRun(actor, runId)

Cancels an active run.
Consumed items from completed steps are not returned.

**Returns:** `Promise<object>`

---

## Step Progression

### markStepInProgress(actor, run, stepIndex)

Marks a step as in-progress.

**Returns:** `Promise<object>`

### markStepWaitingForTime(actor, run, stepIndex, timeRequirement)

Sets a time gate on a step.
The step will auto-complete when world time advances past the requirement.

**Returns:** `Promise<object>`

### completeStepSuccess(actor, run, stepIndex, payload)

Completes a step successfully and advances to the next step.

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `payload` | `object` | `{ consumedIngredients, usedTools, createdResults, checkResult }` |

**Returns:** `Promise<object>`

### completeStepFailure(actor, run, stepIndex, reason, payload)

Marks a step as failed.

**Returns:** `Promise<object>`

### completeRun(actor, run, status)

Finalises a run (moves it from active to history).

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `status` | `string` | `"succeeded"`, `"failed"`, or `"cancelled"` |

**Returns:** `Promise<object>`

---

## Time Gate Methods

### canProceedTimeGate(run, stepIndex, worldTime)

Checks if a time requirement has been satisfied.

**Returns:** `boolean`

### processWorldTime(worldTime)

Processes time gates for all actors.
Called automatically on `updateWorldTime` hook.

**Returns:** `Promise<void>`

---

## Cleanup

### invalidateCache(actorId)

Evicts the in-memory run cache for one actor, or clears the entire cache when called with no argument.

After a completed run is written to Foundry actor flags there is normally no need to call this method.
`_persist()` keeps the cache and flags in sync automatically.
Fabricate also evicts this cache on its own whenever an actor's `fabricate.craftingRuns` flag changes on any connected client, including writes made in another session or by the primary GM's world-time resume, so cross-client run changes stay coherent without a manual call.
Call `invalidateCache` yourself only when external code mutates run state without going through an actor document update, and you want `CraftingRunManager` to re-read from flags on the next access.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `actorId` | `string \| null` | The actor ID to evict. Omit or pass `null` to clear all cached entries. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

**Returns:** `void`

```javascript
Hooks.on('fabricate.ready', () => {
  const runMgr = game.fabricate.getCraftingRunManager();
  // Force re-read from flags for one actor after an external write
  runMgr.invalidateCache(actor.id);
});
```

### cleanupInvalidRuns(validRecipeIds, validSystemIds)

Removes run records that reference deleted recipes or systems.

**Returns:** `Promise<void>`
