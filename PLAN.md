# Implementation Plan

## T-091: Fix Completed Simple Crafts Persisting as In-Progress and Double Chat Success

### Problem Statement

When a simple (one-step) recipe is crafted successfully:
1. The craft correctly consumes ingredients and produces results, but the run persists in the "In Progress" section of the UI instead of being moved to history.
2. Two success chat messages are emitted instead of one.
3. The in-progress card icon for the persisted run renders oversized.

### Root Cause Analysis

**Bug 1: Completed run persists as in-progress**

The craft flow in `CraftingEngine.craft()` (`/home/matthew/WebstormProjects/fabricate-v2/src/systems/CraftingEngine.js:58-67`) always creates a run via `runManager.createRun()` when no existing run is found. For a one-step recipe, after the step succeeds, `completeStepSuccess()` (`CraftingRunManager.js:175-203`) correctly detects `nextIndex >= run.steps.length` and calls `completeRun()`, which moves the run from `active` to `history` by calling `setFabricateFlag()`.

The UI filters in both `_prepareContext()` (CraftingApp.js:369-372) and `_buildPreparedRecipes()` (craftingStore.js:174-177) only include runs where `status` is `inProgress` or `waitingTime`. So if `completeRun()` correctly updates the flag, the run should disappear.

The bug is a **Foundry flag propagation race**: `setFabricateFlag()` calls `actor.update()` which is async. Although the `await` completes when the server acknowledges the update, the in-memory actor document's flags may not reflect the change immediately when read back via `getFabricateFlag()` in the same tick. When `craftingStore.craft()` calls `refresh()` at line 545, `_buildPreparedRecipes()` calls `runManager.getActiveRuns()` which calls `_getContainer()` which reads `getFabricateFlag()` -- and gets stale data with the run still in `active` at status `inProgress`.

**Fix**: Add an in-memory cache to `CraftingRunManager` so that after `_persist()`, subsequent `_getContainer()` calls return the cached (correct) value rather than re-reading from potentially-stale flags.

**Bug 2: Double chat success message**

The `/craft` chat command handler in `main.js:354-367` creates a `ChatMessage` for both success and failure independently. The `CraftingEngine._postCraftChatMessage()` (CraftingEngine.js:1206-1278) also creates a chat message when `system.features.chatOutput === true`. When a craft is triggered via the `/craft` command, both fire, producing two chat messages.

**Fix**: Remove the duplicate `ChatMessage.create` calls from the `/craft` command handler in main.js. The engine's `_postCraftChatMessage` is the canonical chat output path.

**Bug 3: Oversized in-progress card icon**

The `.recipe-icon img` CSS rule (fabricate.css:162-167) sets `width: 64px; height: 64px` but lacks `max-width`, `max-height`, `object-fit`, and `flex-shrink: 0`. In Foundry's CSS environment, inherited or framework styles can override these, causing the image to stretch beyond its intended size within flex layouts.

**Fix**: Add `max-width`, `max-height`, `object-fit: cover`, and `flex-shrink: 0` to both `.recipe-icon img` and `.quick-recipe-icon`.

### Implementation Steps

#### Step 1: Add in-memory cache to CraftingRunManager

**File: `/home/matthew/WebstormProjects/fabricate-v2/src/systems/CraftingRunManager.js`**

Add a `_cache` Map property and modify `_getContainer` / `_persist` to use it:

```js
// Add to class body (no existing constructor, so add one):
constructor() {
  this._cache = new Map(); // actorId -> container
}
```

Modify `_getContainer(actor)` (line 61-63):
```js
_getContainer(actor) {
  if (this._cache.has(actor.id)) {
    return this._cache.get(actor.id);
  }
  return this._normalizeContainer(getFabricateFlag(actor, 'craftingRuns', null));
}
```

Modify `_persist(actor, container)` (line 57-59):
```js
async _persist(actor, container) {
  this._cache.set(actor.id, container);
  await setFabricateFlag(actor, 'craftingRuns', container);
}
```

Add a cache invalidation method:
```js
invalidateCache(actorId = null) {
  if (actorId) {
    this._cache.delete(actorId);
  } else {
    this._cache.clear();
  }
}
```

This ensures that immediately after `completeRun` persists, the next `getActiveRuns` call returns the updated container from cache, not stale flag data.

#### Step 2: Remove duplicate chat messages from `/craft` command

**File: `/home/matthew/WebstormProjects/fabricate-v2/src/main.js`**

At lines 354-367, the `/craft` chat command handler creates `ChatMessage` for both success and failure. Replace with simple notifications:

```js
fabricate.craft(actor, recipe).then(result => {
  if (result.success) {
    ui.notifications.info(result.message);
  } else {
    ui.notifications.error(result.message);
  }
});
```

This keeps the toast notification but removes the duplicate chat message. The engine's `_postCraftChatMessage` handles the chat log if the system has chat output enabled.

#### Step 3: Fix icon sizing constraints

**File: `/home/matthew/WebstormProjects/fabricate-v2/styles/fabricate.css`**

Modify `.recipe-icon img` rule at line 162:
```css
.recipe-icon img {
  width: 64px;
  height: 64px;
  max-width: 64px;
  max-height: 64px;
  object-fit: cover;
  border-radius: 4px;
  border: 2px solid rgba(0, 0, 0, 0.2);
  flex-shrink: 0;
}
```

Modify `.quick-recipe-icon` rule at line 883:
```css
.quick-recipe-icon {
  width: 32px;
  height: 32px;
  max-width: 32px;
  max-height: 32px;
  border-radius: 3px;
  border: 1px solid rgba(0, 0, 0, 0.15);
  object-fit: cover;
  flex-shrink: 0;
}
```

#### Step 4: Add/update tests

**File: `/home/matthew/WebstormProjects/fabricate-v2/tests/simple-craft-completion.test.js`** (MODIFY -- add tests)

Existing tests 1-5 remain. Add:

**Test 6: CraftingRunManager.completeStepSuccess moves one-step run to history**
- Create a CraftingRunManager with mock `setFabricateFlag`/`getFabricateFlag`
- Create a run for a one-step recipe
- Call `completeStepSuccess(actor, run, 0, {})`
- Assert the run is NOT in `getActiveRuns(actor)`
- Assert the run appears in `getRunHistory(actor)` with status `succeeded`

**Test 7: CraftingRunManager cache returns fresh data after completeRun**
- Create a CraftingRunManager
- Create a run, then complete it
- Call `getActiveRuns(actor)` immediately after -- assert the completed run is NOT returned
- Verifies the cache fix works

**Test 8: craftingStore `craft()` results in no active run for completed simple recipe**
- Create a craftingStore with mock services where the engine returns `{ success: true }` and the run manager's `getActiveRuns` returns empty after completion
- Call `store.craft(recipeId)` and check `viewState` -- assert `activeRuns` is empty

### Files Changed

| File | Action | Description |
|---|---|---|
| `src/systems/CraftingRunManager.js` | MODIFY | Add in-memory cache (`_cache` Map) to prevent stale flag reads after run completion |
| `src/main.js` | MODIFY | Remove duplicate `ChatMessage.create` calls from `/craft` chat command handler (lines ~354-367) |
| `styles/fabricate.css` | MODIFY | Add `max-width`, `max-height`, `object-fit`, `flex-shrink` to `.recipe-icon img` and `.quick-recipe-icon` |
| `tests/simple-craft-completion.test.js` | MODIFY | Add 3 tests for run manager completion, cache behavior, and store integration |

### Acceptance Criteria Mapping

| AC | How Satisfied |
|---|---|
| AC1: Repro documented | Root cause analysis above documents all three symptoms with exact code paths |
| AC2: Simple craft clears from in-progress | CraftingRunManager cache ensures `getActiveRuns` returns fresh data after `completeRun` |
| AC3: Bounded icon sizing | CSS constraints (`max-width`, `max-height`, `object-fit`, `flex-shrink`) prevent oversized icons |
| AC4: Single success chat message | Remove duplicate `ChatMessage.create` from `/craft` handler; engine's `_postCraftChatMessage` is the single source |
| AC5: Macro chat deterministic | Engine's `_postCraftChatMessage` only fires when `system.features.chatOutput === true`; success macro is a separate channel documented in spec 002 |
| AC6: Tests | 3 new tests + 5 existing cover run completion state transitions, cache behavior, and UI state |
| AC7: Manual verification | Implementer captures before/after screenshots and chat log confirmation (manual step) |

### Implementation Order for the Implementer

1. Modify `src/systems/CraftingRunManager.js` -- add constructor with cache, update `_getContainer`/`_persist`, add `invalidateCache` (Step 1)
2. Modify `src/main.js` -- remove duplicate chat messages from `/craft` handler (Step 2)
3. Modify `styles/fabricate.css` -- fix icon sizing for `.recipe-icon img` and `.quick-recipe-icon` (Step 3)
4. Modify `tests/simple-craft-completion.test.js` -- add tests 6, 7, 8 (Step 4)
5. Run `npm test` to verify all tests pass (existing + new)
6. Run `npm run build` to verify no build errors
