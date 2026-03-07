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

## T-078 Plan - Enable and Tune Just the Docs Search

### Overview

Configure Just the Docs built-in search in `docs/_config.yml` so users can quickly find settings, behaviors, and configuration options. Add a brief note to the docs home page so readers know search is available.

### Changes Required

#### 1. `docs/_config.yml` -- Enable and tune search

Add the following block after the existing `nav_sort: order` line:

```yaml
search_enabled: true
search:
  heading_level: 3
  previews: 3
  preview_words_before: 5
  preview_words_after: 10
  tokenizer_separator: /[\s/]+/
  rel_url: true
  button: false
```

**Rationale for values:**
- `heading_level: 3` -- Index down to `###` headings, which is where most configuration fields and settings are documented (e.g., `consumeIngredientsOnFail`, `salvageCraftingCheck`). Going deeper would add noise.
- `previews: 3` -- Show 3 preview snippets per result so users can distinguish similarly named settings across different pages.
- `preview_words_before: 5` and `preview_words_after: 10` -- Provide enough surrounding context in each preview to understand the setting's purpose without needing to click through.
- `tokenizer_separator: /[\s/]+/` -- Default Just the Docs separator; splits on whitespace and slashes so camelCase terms like `consumeIngredientsOnFail` are indexed as a whole token.
- `rel_url: true` -- Use relative URLs for search results (works with `baseurl` config).
- `button: false` -- Use the default inline search bar in the sidebar rather than a separate button.

#### 2. `docs/index.md` -- Add search guidance note

Add a short tip callout after the "What can Fabricate do?" table and before the "Quick example" section:

```markdown
{: .tip }
> Use the **search bar** in the sidebar to quickly find settings, configuration options, and macro examples across the documentation.
```

### File Change Summary

| File | Action |
|------|--------|
| `docs/_config.yml` | Add `search_enabled: true` and `search:` configuration block |
| `docs/index.md` | Add search tip callout after feature table |

### Acceptance Criteria Mapping

| AC | How addressed |
|----|---------------|
| AC1: `_config.yml` enables search with configured options | `search_enabled: true` plus `search:` block with heading_level, previews, preview_words_before/after, tokenizer_separator |
| AC2: Generated site displays search UI and returns results | `search_enabled: true` activates Just the Docs Lunr-based search in sidebar |
| AC3: Representative terms return relevant results | `heading_level: 3` indexes `###` headings where settings are documented; camelCase terms indexed as whole tokens |
| AC4: Previews include enough context | `previews: 3` with `preview_words_before: 5` and `preview_words_after: 10` |
| AC5: No existing config broken | Only additive changes; existing theme, callouts, nav, sass settings untouched |
| AC6: Brief note added to docs home | Tip callout in `docs/index.md` mentioning sidebar search bar |

### Constraints

- Only modify `docs/_config.yml`, `docs/index.md`, and `CHANGELOG.md`.
- Do NOT touch spec files or docs concept page footers.

## T-065 Plan - Define Empty allowedUserIds Semantics for Restricted Recipes

### Overview

Clarify across specs 002 and 006 that `visibility.restricted = true` with an empty `allowedUserIds` array is a valid configuration that hides the recipe from all non-GM users. Currently spec 002 requirement 5 says `allowedUserIds` is "required" when restricted, which is ambiguous about whether the array must be non-empty. This task makes the semantics explicit.

### Changes Required

#### 1. spec/002-data-models.md

**Line 252 (Recipe requirement 5)** -- Replace:
```
5. If `visibility.restricted` is true, `visibility.allowedUserIds` is required.
```
With:
```
5. If `visibility.restricted` is true, `visibility.allowedUserIds` must be present as an array. An empty array is valid and means no non-GM user may see the recipe.
```

**After line 229 (visibility property block)** -- Add an inline comment to the `allowedUserIds` field:
```js
  visibility?: {
    restricted: boolean,
    allowedUserIds?: string[],  // Required when restricted is true. Empty array = hidden from all non-GM users.
  },
```

**After the Recipe Requirements section (after line 254)** -- Add a new "Validation Guidance" subsection:
```
### Validation Guidance

Shape validation (invalid):
- `visibility.restricted` is `true` but `allowedUserIds` is missing, `null`, or not an array.

Valid-but-hidden configuration:
- `visibility.restricted` is `true` and `allowedUserIds` is `[]`. The recipe is hidden from all non-GM users. GM can still view and manage the recipe.
```

#### 2. spec/006-recipe-visibility.md

**Lines 49-51 (player mode listing)** -- Expand the player-mode branch to explicitly address the empty case and GM behavior:
```
3. If `listMode === "player"`:
   - GM sees all recipes, including restricted recipes with empty allow-lists.
   - Non-GM sees recipes where `visibility.restricted === false`, or where `allowedUserIds` includes the viewer's user ID.
   - When `visibility.restricted === true` and `allowedUserIds` is empty, no non-GM user can see the recipe.
```

**After line 55 (after step 5 "Keep locked recipes...")** -- Add a new subsection "Restricted Visibility Examples":
```
### Restricted Visibility Examples

| `restricted` | `allowedUserIds` | GM sees? | Player "abc" sees? | Notes |
|---|---|---|---|---|
| `false` | (any) | Yes | Yes | Unrestricted; allow-list ignored |
| `true` | `["abc", "def"]` | Yes | Yes | Player is in allow-list |
| `true` | `["def"]` | Yes | No | Player is not in allow-list |
| `true` | `[]` | Yes | No | Valid config: hidden from all non-GM users |
| `true` | missing/null | Yes | No | Invalid shape: treated as validation error at save time; runtime treats as empty |
```

**Lines 162-166 (Testing Requirements)** -- Add a test requirement:
```
- Unit tests for restricted recipes with empty `allowedUserIds` confirming GM access and non-GM denial.
```

### File Change Summary

| File | Action |
|------|--------|
| `spec/002-data-models.md` | Update requirement 5 wording; add inline comment on `allowedUserIds`; add validation guidance subsection |
| `spec/006-recipe-visibility.md` | Expand player-mode listing for empty allow-list and GM; add restricted visibility examples table; add test requirement |

### Acceptance Criteria Mapping

| AC | How addressed |
|----|---------------|
| AC1: spec 002 removes/updates non-empty requirement | Requirement 5 reworded to explicitly allow empty array |
| AC2: spec 006 documents empty allowedUserIds evaluation | Player-mode branch expanded with empty-list bullet |
| AC3: GM visibility explicit | Both specs state GM can view/manage restricted recipes regardless of allow-list |
| AC4: Validation guidance distinguishes invalid shape from valid-but-hidden | New "Validation Guidance" subsection in spec 002 |
| AC5: Example with restricted+empty case | Examples table in spec 006 includes `restricted=true, allowedUserIds=[]` row |

### Constraints

- Only modify `spec/002-data-models.md` and `spec/006-recipe-visibility.md`.
- Do NOT touch `src/`, `docs/_config.yml`, or concept pages.

## T-077 Plan - Add "What's Next?" Learning-Path Navigation to Concept Pages

### Overview

Add "What's next?" continuation sections to the end of concept docs pages so readers follow a guided learning path. Each section uses a consistent format: an `---` horizontal rule, a `## What's next?` heading, and a short bulleted list of links ordered by most-likely-next-page first.

### Link Target Verification

All target pages exist in `docs/`:
- `docs/recipes/index.md` -- exists
- `docs/api/crafting-engine.md` -- exists
- `docs/crafting-systems.md` -- exists (effect transfer content lives here)
- `docs/recipes/simple.md` -- exists
- `docs/recipes/mapped.md` -- exists
- `docs/recipes/tiered.md` -- exists
- `docs/recipes/progressive.md` -- exists
- `docs/recipes/multi-step.md` -- exists
- `docs/macros/index.md` -- exists
- `docs/macros/examples.md` -- exists
- `docs/visibility.md` -- exists
- `docs/essences.md` -- exists
- `docs/api/recipe-manager.md` -- exists

Note: There is no standalone `docs/effect-transfer.md` page yet (that is T-075 work). For essences, link to the effect transfer section within `docs/crafting-systems.md` and to the recipe editor docs.

### Changes Required

#### 1. `docs/catalysts.md` -- append "What's next?" section

After the Legacy Migration section (end of file, line 115), append:

```markdown

---

## What's next?

- [Recipes overview]({% link recipes/index.md %}) -- learn how catalysts fit into recipe definitions and resolution modes.
- [Crafting Engine API]({% link api/crafting-engine.md %}) -- programmatic control over crafting runs and catalyst validation.
```

Rationale: Catalysts are recipe components, so recipes overview is the natural next step. The engine API covers catalyst validation programmatically.

#### 2. `docs/essences.md` -- append "What's next?" section

After the Managing Essences section (end of file, line 81), append:

```markdown

---

## What's next?

- [Crafting Systems -- Effect Transfer]({% link crafting-systems.md %}) -- configure the effect transfer pipeline that uses essence source items.
- [Recipes overview]({% link recipes/index.md %}) -- see how essence requirements work inside ingredient sets.
- [Recipe Manager API]({% link api/recipe-manager.md %}) -- create and manage recipes with essence-based ingredients programmatically.
```

Rationale: Effect transfer is the primary advanced use of essences. Recipes overview shows how essences plug into ingredient sets. The recipe manager API covers programmatic recipe creation.

#### 3. `docs/visibility.md` -- append "What's next?" section

After the Crafting Guards section (end of file, line 158), append:

```markdown

---

## What's next?

- [Recipes overview]({% link recipes/index.md %}) -- create and edit recipes, including visibility configuration in the recipe editor.
- [Crafting Systems]({% link crafting-systems.md %}) -- configure system-level visibility settings and feature toggles.
- [Macros & Examples]({% link macros/index.md %}) -- automate visibility and knowledge workflows with macros.
```

Rationale: After understanding visibility, users typically want to configure it in recipes or at the system level.

#### 4. `docs/recipes/simple.md` -- append "What's next?" section

After the "With an Optional Check" section (end of file, line 103), append:

```markdown

---

## What's next?

- [Mapped Mode]({% link recipes/mapped.md %}) -- ingredient choices determine which result is produced.
- [Macros & Examples]({% link macros/index.md %}) -- crafting check macro contracts and ready-to-use examples.
```

#### 5. `docs/recipes/mapped.md` -- append "What's next?" section

After the "When to Use Mapped Mode" section (end of file, line 95), append:

```markdown

---

## What's next?

- [Tiered Mode]({% link recipes/tiered.md %}) -- skill checks determine result quality through named outcomes.
- [Macros & Examples]({% link macros/index.md %}) -- crafting check macro contracts and ready-to-use examples.
```

#### 6. `docs/recipes/tiered.md` -- append "What's next?" section

After the "When to Use Tiered Mode" section (end of file, line 128), append:

```markdown

---

## What's next?

- [Progressive Mode]({% link recipes/progressive.md %}) -- check values are spent to buy results in difficulty order.
- [Macros & Examples]({% link macros/index.md %}) -- crafting check macro contracts and ready-to-use examples.
- [Multi-Step Recipes]({% link recipes/multi-step.md %}) -- chain multiple steps with per-step outcome routing.
```

#### 7. `docs/recipes/progressive.md` -- append "What's next?" section

After the "When to Use Progressive Mode" section (end of file, line 113), append:

```markdown

---

## What's next?

- [Multi-Step Recipes]({% link recipes/multi-step.md %}) -- combine multiple steps into a single recipe workflow.
- [Macros & Examples]({% link macros/index.md %}) -- crafting check macro contracts and ready-to-use examples.
- [Recipes overview]({% link recipes/index.md %}) -- compare all resolution modes side by side.
```

### Formatting Rules

- Every "What's next?" section starts with `---` (horizontal rule) followed by `## What's next?`.
- Each link is a bullet point with format: `[Page Title]({% link path %}) -- short description.`
- Links are ordered: next most-likely page first.
- Descriptions use lowercase after the dash and end with a period.
- Maximum 3 links per section to avoid overwhelming the reader.

### Acceptance Criteria Mapping

| AC | How addressed |
|----|---------------|
| AC1: catalysts.md ends with What's next? | Links to recipes/index.md and api/crafting-engine.md |
| AC2: essences.md ends with What's next? | Links to crafting-systems.md (effect transfer) and recipe-related docs |
| AC3: visibility.md ends with What's next? | Links to recipes, crafting systems, and macros |
| AC4: All four recipe mode pages have What's next? | Each links to next mode page and macros/index.md |
| AC5: Consistent formatting and intentional ordering | All sections use identical heading/format; most-likely page first |
| AC6: All links resolve to existing pages | Verified all targets exist in docs/ tree |

### Constraints

- Only modify docs/ concept pages listed above.
- Do NOT touch spec/, src/, docs/_config.yml, or any non-docs files.

## T-070 Plan - Clarify Multi-Step Recipes with Empty Top-Level Sets

### Overview

The current spec (`spec/005-recipes-and-steps.md`) does not explicitly address what happens when an explicit multi-step recipe has empty or absent recipe-level `ingredientSets` and `resultGroups`. The implementation already handles this partially -- `getExecutionSteps()` delegates to step-level data, and validation allows empty recipe-level `ingredientSets` when steps exist -- but recipe-level `resultGroups` are still unconditionally required by validation (a bug relative to the intended design).

The spec needs four additions: (1) explicit permission for empty recipe-level sets in multi-step recipes, (2) step-level resolution precedence, (3) distinct validation contracts, (4) UI rendering expectations, and (5) regression testing requirements.

### Changes Required

#### 1. New section after "Recipe Structure" (after line 12): "Multi-Step Recipe Field Precedence"

Insert the following after line 12 (after the `features.multiStepRecipes` bullets):

```markdown
### Multi-Step Recipe Field Precedence

When `features.multiStepRecipes === true` and `recipe.steps.length > 0`, the recipe is an **explicit multi-step recipe**. The following rules apply:

- Recipe-level `ingredientSets` and `resultGroups` MAY be empty arrays or absent entirely.
- Runtime resolution MUST use the active step's fields: `ingredientSets`, `resultGroups`, `catalysts`, `timeRequirement`, `currencyRequirement`, and `outcomeRouting`.
- Recipe-level fields serve as fallback ONLY for implicit single-step recipes (where `steps` is empty and the recipe-level fields form one implicit step).
- Step-level fields always take priority. Recipe-level fields are never merged into or combined with step-level fields.
- Recipe-level `catalysts` defined outside any step are additive: they apply to every step in addition to each step's own catalysts.
```

#### 2. New section after the precedence section: "Validation Contracts"

Insert:

```markdown
### Validation Contracts

Validation rules differ between single-step and explicit multi-step recipes:

**Single-step (implicit) contract** (`steps` is empty):
- Recipe-level `ingredientSets` MUST have at least one entry.
- Recipe-level `resultGroups` MUST have at least one entry.
- Recipe-level fields define the single implicit step.

**Explicit multi-step contract** (`steps.length > 0`):
- `steps` array MUST have at least one entry.
- Each step MUST have at least one `ingredientSet` with at least one `ingredientGroup`.
- Each step MUST have at least one `resultGroup` with at least one result.
- Recipe-level `ingredientSets` and `resultGroups` are NOT validated and MAY be empty or absent.
- Recipe-level `resultGroups` requirement is waived when explicit steps are present.
```

#### 3. New section: "UI Rendering for Multi-Step Recipes"

Insert before the existing "Testing Requirements" section:

```markdown
### UI Rendering for Multi-Step Recipes

When recipe-level `ingredientSets` or `resultGroups` are empty:

- The recipe detail/summary view MUST NOT render empty ingredient or result sections. If recipe-level sets are absent, display the active step's sets or a step overview instead.
- Recipe list views SHOULD derive summary information (e.g., total ingredient count, result count) from the aggregate of all steps when recipe-level sets are empty.
- The recipe editor for multi-step recipes MUST present step-level editing controls and MUST NOT require recipe-level `ingredientSets` or `resultGroups` to be populated.
- Step navigation and status indicators MUST remain functional regardless of whether recipe-level sets are populated.
```

#### 4. Extend the "Testing Requirements" section (after line 213)

Add the following bullet points to the existing testing requirements list:

```markdown
- Unit tests for validation accepting empty recipe-level `ingredientSets` and `resultGroups` when explicit steps are present.
- Unit tests for validation rejecting empty step-level `ingredientSets` or `resultGroups` within explicit steps.
- Unit tests for `getExecutionSteps()` returning step-level data and ignoring empty recipe-level fields for multi-step recipes.
- Regression test: an explicit multi-step recipe with empty recipe-level sets and fully populated steps passes validation and crafts successfully end-to-end.
- UI render tests: recipe detail view does not render empty sections when recipe-level sets are absent and steps are present.
```

### File Change Summary

| File | Action |
|------|--------|
| `spec/005-recipes-and-steps.md` | Add 4 new sections/subsections as described above |
| `BACKLOG.md` | Mark T-070 as `done` (after review passes) |

### Acceptance Criteria Mapping

| AC | How addressed |
|----|---------------|
| AC1: Spec permits empty/absent recipe-level sets for multi-step | "Multi-Step Recipe Field Precedence" section explicitly states MAY be empty |
| AC2: Active-step resolution precedence defined | Precedence section: step-level always takes priority, never merged |
| AC3: Validation rules distinguish single-step from multi-step | "Validation Contracts" section with two distinct contract blocks |
| AC4: UI expectations for empty recipe-level sets | "UI Rendering for Multi-Step Recipes" section covers detail, list, and editor views |
| AC5: Testing requirements include regression coverage | Five new test requirement bullets added to Testing Requirements |
