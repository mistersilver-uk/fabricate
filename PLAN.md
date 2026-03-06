# Implementation Plan

## T-064 Plan

### Overview

Add `"global"` as the first and default value of `CraftingSystem.recipeVisibility.listMode` across all spec files. Currently the spec defines only `"player" | "knowledge"`, but the implementation already supports and defaults to `"global"`. This task aligns the spec with the code.

### Changes Required

#### 1. spec/002-data-models.md

**Line 87** -- Change the `listMode` type union:
- FROM: `listMode: "player" | "knowledge",`
- TO: `listMode: "global" | "player" | "knowledge",  // default "global"`

**After line 87** -- Add a comment clarifying the default:
- `// When unset or invalid, defaults to "global".`

**Line 89** -- Update the comment about knowledge:
- FROM: `// Optional when listMode === "knowledge"`
- TO: `// Required only when listMode === "knowledge"`

#### 2. spec/006-recipe-visibility.md

**Lines 46-52** -- Add a `global` branch to the listing algorithm before the `player` branch:
```
2. If `listMode === "global"`:
   - GM sees all recipes.
   - Non-GM sees all enabled recipes (no restriction or knowledge filtering).
3. If `listMode === "player"`:
   ...
4. If `listMode === "knowledge"`:
   ...
```
(Renumber existing steps 2-4 to 2-5.)

**Line 159** -- Update testing requirements to include `global` mode:
- Change `Unit tests for listing behaviour in player and knowledge list modes.` to `Unit tests for listing behaviour in global, player, and knowledge list modes.`

#### 3. spec/003-ui-integration.md

**Line 118** -- Update visibility summary column note:
- FROM: `Visibility summary (player list mode only)`
- TO: `Visibility summary (player and knowledge list modes only; hidden in global mode)`

**Lines 143-153** -- Add a `global` branch before the `player` branch:
```
If `listMode === "global"`:

- No per-recipe visibility controls shown.
- Restricted visibility toggle and allowed users multiselect are hidden.

If `listMode === "player"`:
...
```

#### 4. spec/007-destructive-changes-and-migrations.md

**No changes needed.** The existing text at line 48 says "When switching `recipeVisibility.listMode`..." which is generic and already covers the three-mode case. No explicit `player|knowledge` only language exists.

### File Change Summary

| File | Action |
|------|--------|
| `spec/002-data-models.md` | Update `listMode` type union to include `"global"`, add default comment |
| `spec/006-recipe-visibility.md` | Add `global` branch to listing algorithm, update testing requirements |
| `spec/003-ui-integration.md` | Add `global` branch to visibility form, update visibility summary note |

### Acceptance Criteria Mapping

| AC | How addressed |
|----|---------------|
| AC1: spec 002 defines `listMode` as 3-mode union | Line 87 updated to `"global" \| "player" \| "knowledge"` |
| AC2: Default is `global` when unset or invalid | Comment added after line 87 |
| AC3: All examples/tables in spec 002 updated | Field table updated with new union and default |
| AC4: Cross-reference docs updated | spec 006 listing algorithm and spec 003 UI controls updated |
| AC5: No conflicting enum/default statements | spec 007 already generic; all files checked |

## T-082 - Fix False "Cannot Craft" Status When Actor Has Required Components

### Overview

The Crafting App UI can show "Missing materials" / "Cannot Craft" even when the selected actor (or configured component source actors) already has all required components and quantities. The root cause is that the craftability status badge, the disabled state of the craft button, and the missing-item diagnostics are computed through separate, diverging code paths in `CraftingApp._prepareContext()` and `RecipeManager.canCraft()`.

### Root Cause Analysis

There are two diverging computation paths:

1. **`RecipeManager.canCraft()` -> `_checkIngredientSet()` -> `IngredientSet.resolveIngredientSelection()`**: This path passes the recipe-aware matcher (`ingredientMatchesItem`) and tracks a shared remaining-quantity map across groups. It returns a boolean `canCraft` and identifies a `satisfiableSet`.

2. **`CraftingApp._prepareContext()` ingredient display loop (lines 474-504)**: This path computes per-group `have`/`need`/`satisfied` values independently by scanning `availableItems` with `ingredientMatchesItem`. It does NOT share the remaining-quantity accounting with `resolveIngredientSelection`, meaning:
   - Two groups requiring the same item type each see the full pool, potentially over-reporting availability.
   - Conversely, `canCraft()` might return `false` due to shared-item exhaustion while individual UI badges all show `satisfied`.
   - Or `canCraft()` returns `true` but some UI badges show `unsatisfied` because the display path computes differently.

The status badge and button state derive from the `canCraft` boolean, while the ingredient badges derive from the independent display computation. When these disagree, the user sees contradictory information -- a recipe that appears to have all ingredients satisfied but is still marked "Cannot Craft", or vice versa.

### Step-by-Step Implementation Plan

#### Step 1: Add `evaluateCraftability()` to RecipeManager

**File:** `/home/matthew/WebstormProjects/fabricate-v2/src/systems/RecipeManager.js`

Add a new method `evaluateCraftability(componentSourceActors, recipe)` that returns a single unified result:

```
{
  canCraft: boolean,
  satisfiableSet: IngredientSet | null,
  missing: { ingredients: [], essences: [], catalysts: [] },
  ingredientStates: [{ description, need, have, satisfied }],
  essenceStates: [{ type, need, have, satisfied }],
  catalystStates: [{ name, available }]
}
```

This method will:
- Aggregate items from all component source actors.
- Iterate ingredient sets and call `resolveIngredientSelection` with the recipe-aware matcher.
- For the satisfiable set (or best-effort first set if none satisfiable), derive per-group display states from the selection result's `missingGroups` and `selectedIngredients` data.
- Check essences and catalysts.
- Return everything in one object.

Refactor `canCraft()` to be a thin wrapper that calls `evaluateCraftability()` and returns only `{ canCraft, satisfiableSet, missing }`.

#### Step 2: Refactor `CraftingApp._prepareContext()` to use unified evaluation

**File:** `/home/matthew/WebstormProjects/fabricate-v2/src/ui/CraftingApp.js`

In the `preparedRecipes` mapping (lines 404-529):
- Replace the separate `recipeManager.canCraft()` call and the manual per-group ingredient/essence/catalyst display computation with a single call to `recipeManager.evaluateCraftability(this.componentSourceActors, recipe)`.
- Use the returned `ingredientStates`, `essenceStates`, and `catalystStates` directly as template data.
- Use the returned `canCraft` for badge/button state.

In the `showOnlyAvailable` filter (lines 386-401):
- Instead of calling `canCraft()` separately, defer filtering until after evaluation, or compute evaluations once and use them for both filtering and display.

#### Step 3: Update `_onShowDetails` to use unified evaluation

**File:** `/home/matthew/WebstormProjects/fabricate-v2/src/ui/CraftingApp.js`

The `_onShowDetails` method (lines 906-1043) independently computes ingredient satisfaction for the detail dialog. Update it to call `evaluateCraftability()` and use the states from that result.

#### Step 4: Write unit tests for `evaluateCraftability()`

**File:** `/home/matthew/WebstormProjects/fabricate-v2/tests/craftability-evaluation.test.js` (new)

Test cases:
1. **Fully satisfied** -- actor has all required ingredients at exact quantities. Assert `canCraft === true` and all `ingredientStates` show `satisfied === true`.
2. **Partially satisfied** -- actor has some but not all ingredients. Assert `canCraft === false` and states correctly identify shortages.
3. **Unsatisfied** -- actor has none of the required ingredients. Assert `canCraft === false`.
4. **Exact boundary** -- actor has exactly the required quantity (not more). Assert `canCraft === true` and `satisfied === true`.
5. **Multiple component source actors** -- ingredients split across two actors. Assert correct aggregation.
6. **Managed-component matching** -- ingredient uses `match.type === 'component'` with a `componentId`. Assert matching works.
7. **Shared items across groups** -- two groups require the same item type. Assert remaining-quantity tracking is consistent between `canCraft` and display states (no double-counting).
8. **Catalyst presence/absence** -- assert `catalystStates` match craftability.
9. **Essence requirements** -- assert `essenceStates` match craftability.

#### Step 5: Write regression test for false uncraftable state

**File:** `/home/matthew/WebstormProjects/fabricate-v2/tests/craftability-evaluation.test.js`

Reproduce the reported scenario: a recipe with managed-component ingredients where the actor has all required items at sufficient quantities. Verify `canCraft === true` and all display states agree. Also verify that the old divergent path (if ingredients were checked separately from `canCraft`) would have produced contradictory results.

### File Change Summary

| File | Action |
|------|--------|
| `/home/matthew/WebstormProjects/fabricate-v2/src/systems/RecipeManager.js` | Add `evaluateCraftability()` method; refactor `canCraft()` as thin wrapper |
| `/home/matthew/WebstormProjects/fabricate-v2/src/ui/CraftingApp.js` | Refactor `_prepareContext()` and `_onShowDetails()` to use `evaluateCraftability()` |
| `/home/matthew/WebstormProjects/fabricate-v2/tests/craftability-evaluation.test.js` | New test file with 9+ test cases |

### Acceptance Criteria Mapping

| AC | How addressed |
|----|---------------|
| AC1: Fully satisfied recipe renders as craftable | `evaluateCraftability` returns `canCraft: true` when all requirements met; UI uses this single result for badge and button |
| AC2: Missing-materials only shown when genuinely short | Display states derived from same selection result as craftability boolean |
| AC3: Exact-quantity boundaries handled correctly | `resolveIngredientSelection` uses `<= 0` check; dedicated test covers exact boundary |
| AC4: Single shared computation path | `evaluateCraftability()` is the sole source of truth for badge, button, and diagnostics |
| AC5: Tests cover satisfied, partial, unsatisfied across single/multiple actors | 9 test cases in new test file |
| AC6: Regression test for false uncraftable state | Dedicated test case reproducing managed-component scenario |

### Dependencies

None. This task is self-contained within the existing codebase. No spec changes or new npm dependencies required.

### Build and Test Commands

```bash
npm run build   # Verify no compilation errors
npm test        # Run all tests including new ones
```

## T-056 Plan - Add Automatic Crafting Chat Output

### Overview

Add automatic chat message output for crafting results so players and GMs see craft outcomes in the chat log without requiring custom macros. This is a system-level feature toggle (defaults to enabled) that posts structured chat messages on craft success and failure.

### Architecture Analysis

**Craft flow** (`CraftingEngine.craft()` in `/home/matthew/WebstormProjects/fabricate-v2/src/systems/CraftingEngine.js`):
- Returns `{ success: boolean, results: Item[]|null, message: string }`.
- On success: has `consumedItems` (array of `{ item, quantity, ingredient }`), `catalystValidation.catalysts` (array of `{ catalyst, item }`), `resultItems` (array of created Items), plus recipe/actor context.
- On failure: has failure reason string, `consumedOnFail` items, `degradedCatalysts`, plus recipe/actor context.
- Success and failure macros already execute at the end of each path -- chat output must fire independently and not duplicate macro output.

**System feature toggles** (`CraftingSystemManager._normalizeFeatures()` in `/home/matthew/WebstormProjects/fabricate-v2/src/systems/CraftingSystemManager.js`):
- Features are boolean flags on `system.features` (e.g., `effectTransfer`, `salvage`, `craftingChecks`).
- Pattern: `has(key) ? features[key] === true : fallbackDefault`.

**Localization** (`/home/matthew/WebstormProjects/fabricate-v2/lang/en.json`):
- Uses `FABRICATE.*` key namespace. Existing keys under `FABRICATE.Craft` for success/failure labels.

### Step-by-Step Implementation Plan

#### Step 1: Add `chatOutput` feature toggle to CraftingSystemManager

**File:** `/home/matthew/WebstormProjects/fabricate-v2/src/systems/CraftingSystemManager.js`

In `_normalizeFeatures()` (line ~106-119), add after the `salvage` line:
```js
chatOutput: has('chatOutput') ? features.chatOutput === true : true
```
Default is `true` (enabled) per AC1.

#### Step 2: Add localization keys

**File:** `/home/matthew/WebstormProjects/fabricate-v2/lang/en.json`

Add under `FABRICATE.Chat`:
```json
"Chat": {
  "CraftSuccess": "Crafting Successful",
  "CraftFailure": "Crafting Failed",
  "Actor": "Crafter",
  "Recipe": "Recipe",
  "Consumed": "Consumed",
  "Catalysts": "Catalysts Used",
  "Results": "Created",
  "FailureReason": "Reason",
  "ConsumedOnFailure": "Consumed on Failure",
  "Quantity": "x{quantity}"
}
```

#### Step 3: Add `_postCraftChatMessage()` method to CraftingEngine

**File:** `/home/matthew/WebstormProjects/fabricate-v2/src/systems/CraftingEngine.js`

Add a private method:
```
async _postCraftChatMessage({
  success,
  craftingActor,
  recipe,
  consumedIngredients,   // [{ item, quantity }]
  catalysts,             // [{ catalyst, item }]
  createdResults,        // Item[] (success only)
  failureReason,         // string (failure only)
})
```

This method will:
1. Look up the crafting system via `game.fabricate?.getCraftingSystemManager?.()`.
2. Check `system.features.chatOutput === true`. If false, return immediately (AC4 no-message path).
3. Build an HTML chat message content string using localization keys via `game.i18n.localize()`.
4. Call `ChatMessage.create()` with the content, speaker set to the crafting actor using `ChatMessage.getSpeaker({ actor: craftingActor })`, and appropriate flags.

**Message structure for success:**
- Header: localized "Crafting Successful" title
- Actor name, recipe name
- List of consumed ingredients with names and quantities
- List of catalysts used with names
- List of created results with names and quantities

**Message structure for failure:**
- Header: localized "Crafting Failed" title
- Actor name, recipe name
- Failure reason
- List of any consumed resources (if failure consumption policy consumed them)

#### Step 4: Integrate chat message calls into craft() flow

**File:** `/home/matthew/WebstormProjects/fabricate-v2/src/systems/CraftingEngine.js`

**Success path** (after success macro execution, before the final return at ~line 396):
```js
await this._postCraftChatMessage({
  success: true,
  craftingActor,
  recipe,
  consumedIngredients: consumedItems,
  catalysts: catalystValidation.catalysts,
  createdResults: resultItems
});
```

**Failure path -- crafting check failed** (after failure macro execution, before the return at ~line 247):
```js
await this._postCraftChatMessage({
  success: false,
  craftingActor,
  recipe,
  consumedIngredients: consumedOnFail,
  catalysts: degradedCatalysts,
  createdResults: [],
  failureReason: checkResult.message || 'Crafting check failed'
});
```

**Failure path -- resolution mode validation failed** (after failure macro, before the return at ~line 308):
```js
await this._postCraftChatMessage({
  success: false,
  craftingActor,
  recipe,
  consumedIngredients: consumedOnValidationFail,
  catalysts: degradedCatalystsOnValidationFail,
  createdResults: [],
  failureReason: message
});
```

**Important**: Chat messages fire exactly once per craft action. They are posted after macro execution but before the method returns. Early validation failures (no actor, invalid recipe, missing items, etc.) do NOT post chat messages because no craft action actually occurred.

#### Step 5: Write unit tests

**File:** `/home/matthew/WebstormProjects/fabricate-v2/tests/craft-chat-output.test.js` (new)

Test cases:
1. **Success message payload**: Mock `ChatMessage.create`, call `_postCraftChatMessage` with success=true, verify the content includes actor name, recipe name, consumed ingredient names/quantities, catalyst names, and result names/quantities.
2. **Failure message payload**: Call with success=false, verify content includes actor name, recipe name, failure reason, and any consumed resources.
3. **Toggle disabled**: Set `system.features.chatOutput = false`, call `_postCraftChatMessage`, verify `ChatMessage.create` was NOT called.
4. **Toggle enabled (default)**: Set `system.features.chatOutput = true` (or leave default), call and verify `ChatMessage.create` IS called.
5. **No system found**: When system lookup returns null, verify no error thrown and no message posted (graceful degradation).
6. **Localization keys used**: Verify that `game.i18n.localize` is called with the expected `FABRICATE.Chat.*` keys in the message content.
7. **Exactly-once emission**: Integration test that calls `craft()` end-to-end with mocks, verifies `ChatMessage.create` is called exactly once.
8. **No message for validation-only failures**: Verify that early returns (no actor, invalid recipe, missing items before check) do NOT trigger chat output.

### File Change Summary

| File | Action |
|------|--------|
| `/home/matthew/WebstormProjects/fabricate-v2/src/systems/CraftingEngine.js` | Add `_postCraftChatMessage()` method; integrate calls in success/failure paths |
| `/home/matthew/WebstormProjects/fabricate-v2/src/systems/CraftingSystemManager.js` | Add `chatOutput` to `_normalizeFeatures()` with default `true` |
| `/home/matthew/WebstormProjects/fabricate-v2/lang/en.json` | Add `FABRICATE.Chat.*` localization keys |
| `/home/matthew/WebstormProjects/fabricate-v2/tests/craft-chat-output.test.js` | New test file with 8 test cases |

### Acceptance Criteria Mapping

| AC | How addressed |
|----|---------------|
| AC1: System-level toggle, defaults enabled | `features.chatOutput` in `_normalizeFeatures()`, defaults `true` |
| AC2: Success messages include actor, recipe, consumed, results | `_postCraftChatMessage` builds HTML with all fields |
| AC3: Failure messages include actor, recipe, reason, consumed | `_postCraftChatMessage` failure path includes all fields |
| AC4: Emitted exactly once, no macro duplication | Single call site after macro execution; toggle check prevents double output |
| AC5: Unit tests for payload, toggle, no-message path | 8 test cases in new test file |
| AC6: Localization keys for all labels | All user-facing text uses `game.i18n.localize('FABRICATE.Chat.*')` |

### Constraints

- Do NOT modify `CraftingApp.js`, spec files, or `docs/troubleshooting.md`.
- Only modify `CraftingEngine.js`, `CraftingSystemManager.js`, `lang/en.json`, and test files.

### Build and Test Commands

```bash
npm run build   # Verify no compilation errors
npm test        # Run all tests including new ones
```
