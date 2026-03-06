## T-014 Plan: Implement Stale Preferences Cleanup

### Goal

On startup and after destructive operations, validate `lastManagedCraftingSystem` against existing systems and remove progressive-order preferences for missing recipes. Per spec 007 "Preferences Clean-up".

### Current State

- `SETTING_KEYS.LAST_MANAGED_CRAFTING_SYSTEM` (`'lastManagedCraftingSystem'`) is a client-scoped string setting defined in `src/config/settings.js:11`.
- `RecipeManagerApp` reads it on construction (line 18) and writes it on system select (line 378), create (line 389), and delete (line 411).
- Progressive-order preferences do not have a setting key yet. The spec mentions "optional progressive order preferences" as client settings (spec 001, 003). T-010 (Player Reorder) is `todo` and will store these. We need to define the setting key now and implement cleanup for it, even though T-010 has not yet populated it.
- `main.js` already runs `cleanupInvalidRuns` and `cleanupLearnedRecipes` on startup (lines 59-62) after managers initialize. Stale preference cleanup should follow the same pattern.

### Design

Create a new exported function `cleanupStalePreferences(validSystemIds, validRecipeIds, getSetting, setSetting)` in a new file `src/config/preferencesCleanup.js`. This keeps the logic pure and testable without requiring FoundryVTT globals in the function itself.

**Logic:**

1. Read `lastManagedCraftingSystem` via `getSetting`. If non-empty and not in `validSystemIds`, reset it to `''` via `setSetting`.
2. Read `progressiveResultOrder` via `getSetting`. This is an object keyed by recipe ID, mapping to arrays of result IDs. For each key not in `validRecipeIds`, delete it. If any keys were removed, persist the cleaned object via `setSetting`.

### Changes

#### Change 1: Add `PROGRESSIVE_RESULT_ORDER` setting key

**File:** `/home/matthew/WebstormProjects/fabricate-v2/src/config/settings.js`

Add to `SETTING_KEYS`:
```js
PROGRESSIVE_RESULT_ORDER: 'progressiveResultOrder',
```

Add to `BASE_DEFINITIONS`:
```js
[SETTING_KEYS.PROGRESSIVE_RESULT_ORDER]: {
  name: 'Progressive Result Order Preferences',
  scope: 'client',
  config: false,
  type: Object,
  default: {}
},
```

#### Change 2: Create `src/config/preferencesCleanup.js`

**New file.** Exports `cleanupStalePreferences(validSystemIds, validRecipeIds, getSetting, setSetting)`.

```js
import { SETTING_KEYS } from './settings.js';

export async function cleanupStalePreferences(validSystemIds, validRecipeIds, getSetting, setSetting) {
  // 1. Validate lastManagedCraftingSystem
  const lastSystem = getSetting(SETTING_KEYS.LAST_MANAGED_CRAFTING_SYSTEM);
  if (lastSystem && !validSystemIds.has(lastSystem)) {
    await setSetting(SETTING_KEYS.LAST_MANAGED_CRAFTING_SYSTEM, '');
    console.log('Fabricate | Cleared stale lastManagedCraftingSystem:', lastSystem);
  }

  // 2. Clean progressive-order preferences for missing recipes
  const progressiveOrder = getSetting(SETTING_KEYS.PROGRESSIVE_RESULT_ORDER);
  if (progressiveOrder && typeof progressiveOrder === 'object') {
    const cleaned = {};
    let changed = false;
    for (const [recipeId, order] of Object.entries(progressiveOrder)) {
      if (validRecipeIds.has(recipeId)) {
        cleaned[recipeId] = order;
      } else {
        changed = true;
        console.log('Fabricate | Removed stale progressive-order preference for recipe:', recipeId);
      }
    }
    if (changed) {
      await setSetting(SETTING_KEYS.PROGRESSIVE_RESULT_ORDER, cleaned);
    }
  }
}
```

#### Change 3: Call from `main.js` on startup

**File:** `/home/matthew/WebstormProjects/fabricate-v2/src/main.js`

Add import:
```js
import { cleanupStalePreferences } from './config/preferencesCleanup.js';
```

After line 62 (`await this.recipeVisibilityService.cleanupLearnedRecipes(validRecipes);`), add:
```js
await cleanupStalePreferences(validSystems, validRecipes, getSetting, setSetting);
```

#### Change 4: Create tests

**New file:** `/home/matthew/WebstormProjects/fabricate-v2/tests/stale-preferences-cleanup.test.js`

Uses `node:test` + `node:assert/strict`. Pure unit tests with mock `getSetting`/`setSetting`.

**Tests (8 tests across 3 groups):**

**Group 1: lastManagedCraftingSystem validation (3 tests)**
1. Resets to empty when lastManagedCraftingSystem references a missing system
2. Leaves unchanged when lastManagedCraftingSystem references a valid system
3. Leaves unchanged when lastManagedCraftingSystem is already empty

**Group 2: Progressive-order preferences cleanup (3 tests)**
4. Removes entries for missing recipes
5. Retains entries for valid recipes
6. Does not call setSetting when no entries need removal

**Group 3: Combined behaviour (2 tests)**
7. Cleans both stale system and stale recipe preferences in one call
8. Does nothing when all preferences are valid (no setSetting calls for either)

### Files to Create

1. `/home/matthew/WebstormProjects/fabricate-v2/src/config/preferencesCleanup.js`
2. `/home/matthew/WebstormProjects/fabricate-v2/tests/stale-preferences-cleanup.test.js`

### Files to Modify

1. `/home/matthew/WebstormProjects/fabricate-v2/src/config/settings.js` -- add `PROGRESSIVE_RESULT_ORDER` setting
2. `/home/matthew/WebstormProjects/fabricate-v2/src/main.js` -- import and call `cleanupStalePreferences`

### Implementation Order

1. Add `PROGRESSIVE_RESULT_ORDER` to `src/config/settings.js`
2. Create `src/config/preferencesCleanup.js`
3. Create `tests/stale-preferences-cleanup.test.js`
4. Update `src/main.js` to call cleanup
5. Run `npm test` -- all tests pass
6. Run `npm run build` -- no build errors

### Constraints

- Do NOT modify `CraftingEngine.js` or salvage test files
- The function must be pure (injectable `getSetting`/`setSetting`) for testability
- Progressive-order preferences will be populated later by T-010; this task only adds the setting key and cleanup logic

---

## T-017 Plan: Add Linked Recipe Item UUID Picker to Recipe Editor

### Goal

Enhance the recipe editor's linked recipe item section (currently a plain text input) with:
1. A UUID picker that lets GM browse/paste a UUID
2. Helper text explaining that owned copies match by UUID or `flags.core.sourceId`
3. A "Create Recipe Item" button that creates a world item linked to the recipe when `linkedRecipeItemUuid` is unset
4. A validation warning when the knowledge-mode system requires linkage but it is missing

### Current State

- `templates/recipe-editor-v2.hbs` lines 89-97: Shows a plain `<input>` for `linkedRecipeItemUuid` when `requiresLinkedRecipeItem` is true. Has a hint about knowledge-mode matching.
- `src/ui/RecipeEditorApp.js` line 374: `requiresLinkedRecipeItem` is derived from `listMode === 'knowledge'` and knowledge mode including item matching.
- `src/ui/RecipeEditorApp.js` line 1272: Validation already rejects missing `linkedRecipeItemUuid` when required.
- The draft stores `linkedRecipeItemUuid` as a string (line 116).

### Changes

#### Change 1: Template -- Replace plain input with UUID picker block

**File:** `/home/matthew/WebstormProjects/fabricate-v2/templates/recipe-editor-v2.hbs` (lines 89-97)

Replace the existing `{{#if requiresLinkedRecipeItem}}` block with:

```hbs
{{#if requiresLinkedRecipeItem}}
  <div class="editor-block linked-recipe-item-block">
    <div class="carousel-header small">
      <h4>Linked Recipe Item</h4>
    </div>

    {{#if linkedRecipeItemResolved}}
      <div class="linked-item-display">
        <img src="{{linkedRecipeItemImg}}" alt="{{linkedRecipeItemName}}" />
        <div class="linked-item-meta">
          <span class="linked-item-name">{{linkedRecipeItemName}}</span>
          <code class="linked-item-uuid">{{recipe.linkedRecipeItemUuid}}</code>
        </div>
        <button type="button" data-action="clearLinkedRecipeItem" title="Clear linked item"><i class="fas fa-times"></i></button>
      </div>
    {{else}}
      <div class="form-group">
        <label>Item UUID</label>
        <input name="linkedRecipeItemUuid" type="text" value="{{recipe.linkedRecipeItemUuid}}" placeholder="Item.abcdef123456 or Compendium.world.pack.itemId" />
      </div>
      <div class="inline-actions">
        <button type="button" data-action="browseLinkedRecipeItem"><i class="fas fa-search"></i> Browse Items</button>
        <button type="button" data-action="createLinkedRecipeItem"><i class="fas fa-plus"></i> Create Recipe Item</button>
      </div>
    {{/if}}

    <p class="hint">Players who own a copy of this item (matched by UUID or <code>flags.core.sourceId</code>) will gain access to this recipe under knowledge-mode visibility.</p>

    {{#if linkedRecipeItemMissing}}
      <p class="validation-warning"><i class="fas fa-exclamation-triangle"></i> Linked recipe item UUID is required for this crafting system's visibility mode.</p>
    {{/if}}
  </div>
{{/if}}
```

#### Change 2: RecipeEditorApp -- Add context data for resolved item display

**File:** `/home/matthew/WebstormProjects/fabricate-v2/src/ui/RecipeEditorApp.js`

In `_prepareContext` (around lines 585-610), after `requiresLinkedRecipeItem` is set, add:

```js
// Resolve linked recipe item for display
let linkedRecipeItemResolved = false;
let linkedRecipeItemName = '';
let linkedRecipeItemImg = '';
let linkedRecipeItemMissing = false;

if (featureState.requiresLinkedRecipeItem) {
  const uuid = this.draft.linkedRecipeItemUuid;
  if (uuid) {
    try {
      const item = await fromUuid(uuid);
      if (item) {
        linkedRecipeItemResolved = true;
        linkedRecipeItemName = item.name;
        linkedRecipeItemImg = item.img || 'icons/svg/item-bag.svg';
      }
    } catch (e) {
      // UUID doesn't resolve -- leave resolved=false
    }
  }
  linkedRecipeItemMissing = !uuid;
}
```

Add these to the returned context object:
```js
linkedRecipeItemResolved,
linkedRecipeItemName,
linkedRecipeItemImg,
linkedRecipeItemMissing,
```

#### Change 3: RecipeEditorApp -- Add action handlers

**File:** `/home/matthew/WebstormProjects/fabricate-v2/src/ui/RecipeEditorApp.js`

Add three new actions to `DEFAULT_OPTIONS.actions`:
```js
clearLinkedRecipeItem: this._onClearLinkedRecipeItem,
browseLinkedRecipeItem: this._onBrowseLinkedRecipeItem,
createLinkedRecipeItem: this._onCreateLinkedRecipeItem,
```

Add the static action methods:

```js
static async _onClearLinkedRecipeItem() {
  this._syncDraftFromForm();
  this.draft.linkedRecipeItemUuid = '';
  await this.render();
}

static async _onBrowseLinkedRecipeItem() {
  this._syncDraftFromForm();
  // Use Foundry's built-in FilePicker or document browser if available,
  // otherwise fall back to a simple prompt
  const uuid = await new Promise((resolve) => {
    new Dialog({
      title: 'Select Linked Recipe Item',
      content: '<div class="form-group"><label>Item UUID</label><input type="text" name="uuid" placeholder="Paste or type item UUID" /></div>',
      buttons: {
        ok: {
          label: 'Confirm',
          callback: (html) => resolve(html.find('[name=uuid]').val()?.trim() || '')
        },
        cancel: { label: 'Cancel', callback: () => resolve('') }
      },
      default: 'ok'
    }).render(true);
  });
  if (uuid) {
    this.draft.linkedRecipeItemUuid = uuid;
    await this.render();
  }
}

static async _onCreateLinkedRecipeItem() {
  this._syncDraftFromForm();
  if (this.draft.linkedRecipeItemUuid) {
    ui.notifications.warn('A linked recipe item UUID is already set. Clear it first to create a new one.');
    return;
  }
  const recipeName = this.draft.name || 'Unnamed Recipe';
  const itemData = {
    name: `Recipe: ${recipeName}`,
    type: 'loot',       // safe default for most game systems
    img: this.draft.img || 'icons/svg/item-bag.svg'
  };
  try {
    const item = await Item.create(itemData, { parent: null });
    this.draft.linkedRecipeItemUuid = item.uuid;
    ui.notifications.info(`Created world item "${item.name}" and linked it to this recipe.`);
    await this.render();
  } catch (err) {
    console.error('Fabricate | Failed to create linked recipe item:', err);
    ui.notifications.error('Failed to create recipe item. Check console for details.');
  }
}
```

#### Change 4: Add tests

**New file:** `/home/matthew/WebstormProjects/fabricate-v2/tests/linked-recipe-item-picker.test.js`

Tests (using node:test + node:assert/strict, following existing patterns):

1. **Context includes linkedRecipeItemMissing=true when requiresLinkedRecipeItem is true and UUID is empty**
2. **Context includes linkedRecipeItemMissing=false when UUID is set**
3. **Context includes linkedRecipeItemResolved=true when UUID resolves to an item**
4. **Context includes linkedRecipeItemResolved=false when UUID does not resolve**
5. **_onClearLinkedRecipeItem sets draft.linkedRecipeItemUuid to empty string**
6. **_onCreateLinkedRecipeItem sets draft.linkedRecipeItemUuid to new item UUID**
7. **_onCreateLinkedRecipeItem warns if UUID already set**
8. **Validation rejects when requiresLinkedRecipeItem and UUID is missing** (existing behavior, verify not regressed)

### Files to Modify

1. `/home/matthew/WebstormProjects/fabricate-v2/templates/recipe-editor-v2.hbs`
2. `/home/matthew/WebstormProjects/fabricate-v2/src/ui/RecipeEditorApp.js`

### Files to Create

1. `/home/matthew/WebstormProjects/fabricate-v2/tests/linked-recipe-item-picker.test.js`

### Implementation Order

1. Add action handlers and context data to `RecipeEditorApp.js`
2. Update `recipe-editor-v2.hbs` template
3. Create test file
4. Run `npm test` -- all tests pass
5. Run `npm run build` -- no build errors

### Constraints

- Do NOT modify `CraftingEngine.js`, `main.js`, or `ResolutionModeService.js`
- The `_prepareContext` method needs `fromUuid` which is a FoundryVTT global -- tests will need to stub it
- The "Create Recipe Item" button uses `Item.create` -- must be stubbed in tests
- The "Browse" dialog uses `Dialog` -- a Foundry global, tests can skip or stub this

---

## T-045 Plan: Implement CraftingEngine.salvage() Method

### Overview

Add a `salvage(actorUuid, craftingSystemId, componentId)` method to `CraftingEngine` that implements the full salvage pipeline: validate ownership and catalysts, run salvage crafting check macro, resolve result groups by `salvageResolutionMode`, consume component instances, degrade catalysts, create result items, and persist `SalvageRun` records. The method must respect the failure consumption policy (`consumeComponentOnFail`, `consumeCatalystsOnFail`).

### Data Shape Context

From T-043 and T-044, the relevant normalised data shapes are:

**Component salvage config** (on a managed component in the system):
```js
component.salvage = {
  enabled: true,
  ingredientQuantity: 2,
  catalysts: [{ componentId: 'acid-vial', degradesOnUse: true, destroyWhenExhausted: false, maxUses: 3 }],
  resultGroups: [
    { id: 'rg-1', name: 'Scraps', results: [{ id: 'r-1', componentId: 'scrap-a', quantity: 2 }] }
  ],
  outcomeRouting: { critical: 'rg-high', pass: 'rg-low' }  // tiered only
};
```

**System-level salvage fields:**
- `system.salvageResolutionMode` -- 'simple' | 'tiered' | 'progressive'
- `system.salvageCraftingCheck` -- `{ enabled, macroUuid, successMacroUuid, failureMacroUuid, outcomes, progressive, consumption: { consumeComponentOnFail, consumeCatalystsOnFail } }`
- `system.components[]` -- array of managed items with `id`, `sourceUuid`, `difficulty`, `salvage`

### Method Signature

```js
async salvage(actorUuid, craftingSystemId, componentId)
```

Returns `{ success: boolean, results: Item[]|null, message: string, salvageRun: object|null }`.

### Pipeline Steps

**Step 1: Resolve actor and system**
- Resolve actor from `actorUuid` via `fromUuid(actorUuid)`.
- Get system from `game.fabricate.getCraftingSystemManager().getSystem(craftingSystemId)`.
- Get the managed component definition from `system.components.find(c => c.id === componentId)`.
- Early return if any is missing, or if `component.salvage.enabled !== true`, or if `system.features.salvage !== true`.

**Step 2: Validate using ResolutionModeService.validateSalvage**
- Call `resolutionService.validateSalvage(component, system)`.
- If invalid, return failure with validation errors.

**Step 3: Validate component ownership**
- Find items on the actor matching the component (match by `sourceUuid` or name, same logic as catalyst matching).
- Check that actor owns at least `salvage.ingredientQuantity` instances.
- Early return if insufficient.

**Step 4: Validate catalyst availability**
- Reuse `_validateCatalysts` pattern but adapted for salvage catalysts.
- Search the actor's items for each catalyst in `component.salvage.catalysts`.
- Use `RecipeManager.catalystMatchesItem` with a synthetic recipe-like object that has `craftingSystemId`.
- Early return if any catalyst is missing.

**Step 5: Run salvage crafting check macro (if enabled)**
- Check `system.salvageCraftingCheck.enabled` and `system.salvageCraftingCheck.macroUuid`.
- If enabled, execute the macro via `MacroExecutor.run()` with context: `{ component, craftingSystem, craftingActor, salvageCatalysts, salvageConfig }`.
- Parse result: `{ success, outcome, value, data }`.
- If check fails (success === false):
  - Read failure consumption policy from `system.salvageCraftingCheck.consumption`.
  - If `consumeComponentOnFail`: consume component instances.
  - If `consumeCatalystsOnFail`: degrade catalysts.
  - Run salvage failure macro if configured (`system.salvageCraftingCheck.failureMacroUuid`).
  - Create a failed SalvageRun record.
  - Return failure result.

**Step 6: Resolve result groups by salvageResolutionMode**
- Build a salvage-specific resolution method `_resolveSalvageResultGroups(component, system, checkResult)`:
  - Simple mode: return `component.salvage.resultGroups.slice(0, 1)`.
  - Tiered mode: use `checkResult.outcome` + `component.salvage.outcomeRouting` to select result group.
  - Progressive mode: use `checkResult.value` + result difficulty from `system.components` to award results.

**Step 7: Consume component instances**
- Delete `salvage.ingredientQuantity` matching items from the actor.
- Use `item.delete()` for full consumption, or reduce stack quantity if applicable.

**Step 8: Degrade catalysts**
- Reuse the existing `_degradeCatalysts` pattern.
- For each catalyst in `component.salvage.catalysts`, find the matched item and apply degradation.

**Step 9: Create result items**
- For each result in the resolved result group(s), create items on the actor.
- Reuse `_createSingleResult` where possible.

**Step 10: Run success macro**
- If `system.salvageCraftingCheck.successMacroUuid` is configured, execute it with full context.

**Step 11: Create SalvageRun record**
- Store in `Actor.flags.fabricate.salvageRuns` using the same container pattern as `CraftingRunManager`.
- Shape:
  ```js
  {
    id: randomID(),
    actorUuid,
    craftingSystemId,
    componentId,
    status: 'succeeded' | 'failed',
    startedAt: worldTime,
    finishedAt: worldTime,
    consumedComponents: [{ itemUuid, quantity }],
    usedCatalysts: [{ itemUuid, componentId, degraded }],
    createdResults: [{ itemUuid, componentId, quantity }],
    checkResult: { success, outcome, value } | null,
    failureReason: string | null
  }
  ```

**Step 12: Return result**
```js
{ success: true, results: createdItems, message: `Successfully salvaged ${component.name}`, salvageRun }
```

### New Private Methods

1. **`_resolveSalvageResultGroups(component, system, checkResult)`** -- Resolves which result groups to use based on `system.salvageResolutionMode`. Mirrors the logic in `resolveResultGroups` but operates on `component.salvage.resultGroups`.

2. **`_runSalvageCraftingCheck(component, system, actor, catalystItems)`** -- Runs the salvage check macro with salvage-specific context. Uses `system.salvageCraftingCheck` config.

3. **`_findComponentItems(actor, component, system)`** -- Finds items on the actor that match the given managed component. Uses `sourceUuid` matching.

4. **`_consumeComponentItems(actor, items, quantity)`** -- Deletes or reduces quantity of component items.

5. **`_createSalvageRun(actor, runData)`** -- Persists a SalvageRun record to `Actor.flags.fabricate.salvageRuns`.

6. **`_getSalvageFailureConsumptionPolicy(system)`** -- Returns `{ consumeComponentOnFail, consumeCatalystsOnFail }` from `system.salvageCraftingCheck.consumption`.

### Test File

**New file:** `/home/matthew/WebstormProjects/fabricate-v2/tests/salvage-engine.test.js`

Uses `node:test` + `node:assert/strict`.

**Tests (18 tests across 6 groups):**

**Group 1: Input validation (4 tests)**
1. Returns failure if actor not found
2. Returns failure if system not found
3. Returns failure if component not found or salvage not enabled
4. Returns failure if features.salvage is false on system

**Group 2: Ownership and catalyst validation (3 tests)**
5. Returns failure if actor lacks sufficient component instances
6. Returns failure if required catalyst is missing
7. Succeeds when actor has exact required quantity

**Group 3: Simple mode salvage (3 tests)**
8. Simple mode: consumes components, creates results, returns success
9. Simple mode: creates SalvageRun record with correct shape
10. Simple mode: degrades catalysts when present

**Group 4: Tiered mode salvage (2 tests)**
11. Tiered mode: routes to correct result group based on check outcome
12. Tiered mode: fails when check returns unrecognised outcome

**Group 5: Progressive mode salvage (2 tests)**
13. Progressive mode: awards results up to check value by difficulty
14. Progressive mode: awards nothing when check value is 0

**Group 6: Failure consumption policy (4 tests)**
15. Check failure with consumeComponentOnFail=true: component consumed
16. Check failure with consumeComponentOnFail=false: component NOT consumed
17. Check failure with consumeCatalystsOnFail=true: catalysts degraded
18. Check failure with consumeCatalystsOnFail=false: catalysts NOT degraded

### Files to Modify

1. `/home/matthew/WebstormProjects/fabricate-v2/src/systems/CraftingEngine.js` -- add `salvage()` method and private helpers

### Files to Create

1. `/home/matthew/WebstormProjects/fabricate-v2/tests/salvage-engine.test.js` -- unit tests

### Implementation Order

1. Add `_findComponentItems`, `_consumeComponentItems`, `_getSalvageFailureConsumptionPolicy` private helpers
2. Add `_resolveSalvageResultGroups` private helper
3. Add `_runSalvageCraftingCheck` private helper
4. Add `_createSalvageRun` private helper
5. Add main `salvage()` method
6. Create `tests/salvage-engine.test.js`
7. Run `npm test` -- all tests pass
8. Run `npm run build` -- no build errors

### Key Design Decisions

- **Reuse patterns, not methods**: The salvage pipeline mirrors the craft pipeline but operates on different data shapes (component.salvage vs recipe). Rather than forcing salvage data into recipe-shaped objects, create thin salvage-specific helpers that follow the same patterns.
- **SalvageRun is simpler than CraftingRun**: Salvage is always single-step, so the run record is flatter. Stored in a separate flag key (`salvageRuns`).
- **No CraftingRunManager dependency for salvage**: SalvageRun persistence is handled directly in CraftingEngine via `setFabricateFlag`.
- **ResolutionModeService reuse**: For tiered and progressive modes, `_resolveSalvageResultGroups` implements the same algorithms as `resolveResultGroups` but reads from salvage-specific fields.

---

## T-013 Plan: Implement Startup Schema Migration Framework

### Context

T-040 already added a single ad-hoc migration (`migrateComponentId.js`) called from `_runMigrations()` in `main.js`. T-013 replaces this ad-hoc pattern with a proper versioned migration framework per spec 007.

The current `_runMigrations()` in `main.js` (lines 72-87) directly calls `migrateRecipes` and `migrateCraftingSystems` from `migrateComponentId.js`. The new framework must:
1. Provide a migration registry keyed by module version.
2. Run only pending migrations in order.
3. Be idempotent.
4. Skip and log corrupt records.
5. Persist only when changes are detected.
6. Integrate the existing T-040 componentId migration as version "0.1.0".

### Architecture

**New file: `src/migration/MigrationRunner.js`**

```js
export class MigrationRunner {
  constructor({ getSetting, setSetting, moduleVersion }) { ... }
  async run() { ... }
}
```

Key design:
- `MIGRATIONS` is a module-level ordered array of `{ version: string, label: string, migrate: (data) => data }`.
- Each migration's `migrate` function receives a data envelope `{ recipes, systems }` and returns the same shape.
- The runner reads `fabricate.migrationVersion` (a new setting, type String, default `"0.0.0"`).
- It filters migrations where `version > lastRunVersion` (semver string comparison).
- It runs them in order, wrapping each in a try/catch to skip corrupt records.
- After all migrations run, it compares output to input (JSON stringify). If changed, it persists recipes, systems, and updates `migrationVersion`.
- If no migrations are pending, it returns immediately.

**New setting: `MIGRATION_VERSION`**

Added to `src/config/settings.js`:
```js
MIGRATION_VERSION: 'migrationVersion'
```
Definition: `{ scope: 'world', config: false, type: String, default: '0.0.0' }`.

**Refactored `src/migration/migrateComponentId.js`**

No changes to the pure functions. They are imported by MigrationRunner and registered as version "0.1.0".

**Updated `src/main.js`**

Replace the current `_runMigrations()` body with:
```js
async _runMigrations() {
  const runner = new MigrationRunner({
    getSetting,
    setSetting,
    moduleVersion: '0.1.0'
  });
  await runner.run();
}
```

Remove the direct import of `migrateRecipes`/`migrateCraftingSystems` from main.js.

### Semver Comparison

Use a simple `compareSemver(a, b)` utility in MigrationRunner (no npm dependency). Compare major.minor.patch numerically. Returns -1, 0, or 1. This is sufficient for the module's versioning scheme.

### Error Handling / Corrupt Records

The runner wraps each migration call in try/catch:
- On error: log `console.warn('Fabricate | Migration "<label>" failed: <error message>')`, skip that migration, continue with next.
- Individual record corruption within a migration (e.g., a single recipe with bad shape) is handled inside the migration function itself -- the existing `migrateComponentId` already guards against null/non-object records.

For the framework-level pattern, each migration function should iterate records and wrap per-record logic in try/catch, logging and skipping corrupt individual records while continuing with the rest.

### Migration Registration Pattern

```js
import { migrateRecipes, migrateCraftingSystems } from './migrateComponentId.js';

const MIGRATIONS = [
  {
    version: '0.1.0',
    label: 'Rename systemItemId to componentId',
    migrate(data) {
      return {
        recipes: migrateRecipes(data.recipes),
        systems: migrateCraftingSystems(data.systems)
      };
    }
  }
  // Future migrations added here in version order
];
```

### Files to Create

1. `/home/matthew/WebstormProjects/fabricate-v2/src/migration/MigrationRunner.js` -- migration framework
2. `/home/matthew/WebstormProjects/fabricate-v2/tests/migration-runner.test.js` -- unit tests

### Files to Modify

1. `/home/matthew/WebstormProjects/fabricate-v2/src/main.js` -- replace `_runMigrations()` body, update imports
2. `/home/matthew/WebstormProjects/fabricate-v2/src/config/settings.js` -- add `MIGRATION_VERSION` setting

### Test Plan (tests/migration-runner.test.js)

Uses `node:test` + `node:assert/strict`. Pure unit tests with mock getSetting/setSetting.

**Group 1: Registry and ordering (3 tests)**
1. Migrations run in version order (register 0.2.0 before 0.1.0, verify 0.1.0 runs first)
2. Only pending migrations run (set lastRunVersion to 0.1.0, verify 0.1.0 is skipped)
3. No migrations pending returns without persisting (verify setSetting not called)

**Group 2: Idempotency (3 tests)**
4. Running the same migration twice produces identical output
5. Data already in target shape passes through unchanged
6. Runner does not persist when no changes detected (setSetting not called)

**Group 3: Corrupt record handling (3 tests)**
7. A migration that throws for one record continues with remaining records
8. Corrupt recipe (non-object in array) is skipped and logged
9. Null/undefined data arrays are handled gracefully

**Group 4: Integration with componentId migration (3 tests)**
10. Full run from version 0.0.0 applies componentId migration
11. Full run from version 0.1.0 skips componentId migration
12. migrationVersion setting is updated after successful run

**Group 5: Persistence (2 tests)**
13. Changed data is persisted (setSetting called for recipes, systems, migrationVersion)
14. Unchanged data is not persisted (setSetting only called for migrationVersion)

### Implementation Order

1. Add `MIGRATION_VERSION` to `src/config/settings.js`
2. Create `src/migration/MigrationRunner.js`
3. Create `tests/migration-runner.test.js`
4. Update `src/main.js` to use MigrationRunner
5. Run `npm test` -- all tests pass
6. Run `npm run build` -- no build errors

---

## T-049 Plan: Add Salvage Unit and Integration Tests

### Goal

Add comprehensive test coverage for the salvage subsystem: `_normalizeComponent` salvage sub-object, `validateSalvage` across all modes, `CraftingEngine.salvage()` across simple/tiered/progressive modes, failure consumption policy (all four combinations), and an end-to-end integration test.

### Current Test Coverage

Three test files already exist:
- `tests/salvage-normalisation.test.js` (19 tests) -- AC1 covered
- `tests/salvage-validation.test.js` (17 tests) -- AC2 covered
- `tests/salvage-engine.test.js` (18 tests) -- AC3 partially, AC6 partially

### Gaps to Fill

| AC | Description | Status | Gap |
|----|-------------|--------|-----|
| AC1 | `_normalizeComponent` salvage normalisation | Done | None |
| AC2 | `validateSalvage` across modes + mapped rejection | Done | None |
| AC3 | `salvage()` simple mode: validate, consume, create | Partial | No explicit simple-mode test showing result items created with correct quantities |
| AC4 | `salvage()` tiered mode: outcome routes to correct group | Missing | No test for `_resolveSalvageResultGroups` tiered routing |
| AC5 | `salvage()` progressive mode: value awards by difficulty | Missing | No test for `_resolveSalvageResultGroups` progressive awarding |
| AC6 | Failure consumption policy (all 4 combos) | Partial | 2 combos tested (component consume/not). Missing: catalyst degradation combos on salvage failure |
| AC7 | Integration test: end-to-end salvage flow | Missing | No integration test |

### Plan

Extend `tests/salvage-engine.test.js` with additional test groups to fill the gaps. Do NOT create new test files -- extend the existing one to keep salvage engine tests together.

#### New Tests to Add (append after existing Group 6)

**Group 7: Simple mode -- full validate-consume-create flow (2 tests)**

1. `salvage() simple mode creates result items with correct quantity from result group`
   - Setup: component with resultGroup containing 2 results (qty 2 and qty 3)
   - Mock `resolveResultGroups` to return the single group
   - Assert: `result.results` has 2 items, actor `createEmbeddedDocuments` called with correct quantities

2. `salvage() simple mode uses only the first result group when multiple exist`
   - Setup: component with 2 result groups
   - Mock `resolveResultGroups` to return only first group (simple behavior)
   - Assert: only results from group 1 are created

**Group 8: Tiered mode -- outcome routing (3 tests)**

3. `salvage() tiered mode routes to correct result group based on check outcome`
   - Setup: system with `salvageResolutionMode: 'tiered'`, component with 2 result groups and `outcomeRouting: { pass: 'rg-pass', fail: 'rg-fail' }`
   - Stub `_runSalvageCraftingCheck` to return `{ success: true, outcome: 'pass' }`
   - Assert: `result.results` come from 'rg-pass' group only

4. `salvage() tiered mode returns empty results when outcome has no routing`
   - Setup: same but check returns `{ success: true, outcome: 'unknown' }`
   - Assert: `result.success === true`, `result.results` is empty array

5. `_resolveSalvageResultGroups tiered mode selects group by outcome routing`
   - Direct unit test of `_resolveSalvageResultGroups` method
   - Test multiple outcomes map to correct groups

**Group 9: Progressive mode -- difficulty-based awarding (3 tests)**

6. `_resolveSalvageResultGroups progressive mode awards results up to check value`
   - Setup: system with components having difficulty 2, 3, 5. Check value = 7
   - Assert: awards first two results (cost 2+3=5 <= 7), remaining=2

7. `_resolveSalvageResultGroups progressive mode awards nothing when value is 0`
   - Check value = 0
   - Assert: empty results

8. `salvage() progressive mode creates items matching awarded results`
   - End-to-end through salvage() with progressive mode
   - Assert correct items created

**Group 10: Failure consumption policy -- all four combinations (4 tests)**

9. `salvage failure: consumeComponent=true, consumeCatalysts=true -- both consumed`
10. `salvage failure: consumeComponent=true, consumeCatalysts=false -- only component consumed`
11. `salvage failure: consumeComponent=false, consumeCatalysts=true -- only catalysts degraded`
12. `salvage failure: consumeComponent=false, consumeCatalysts=false -- nothing consumed`

Each test:
- Has a catalyst item present on the actor
- Stubs `_runSalvageCraftingCheck` to return `{ success: false }`
- Asserts on both `compItem.deleteCalled` and catalyst degradation state

**Group 11: Integration test -- end-to-end salvage flow (1 test)**

13. `end-to-end salvage: resolve actor, validate, check, consume, create, record run`
   - Setup: full system with salvage enabled, component with 2 qty ingredient, 1 catalyst, 1 result group
   - Wire up real `ResolutionModeService` (not mocked)
   - Stub only `_runSalvageCraftingCheck` (since it needs MacroExecutor)
   - Assert:
     - result.success === true
     - Component item quantity reduced
     - Catalyst degradation applied
     - Result items created on actor
     - SalvageRun record shape is correct
     - SalvageRun stored in actor flags

### Files to Modify

1. `/home/matthew/WebstormProjects/fabricate-v2/tests/salvage-engine.test.js` -- append new test groups

### Files NOT to Touch

- No `src/` files
- No `README.md`
- No new test files (extend existing)

### Implementation Constraints

- Use existing builder helpers (`makeItem`, `makeActor`, `makeSystem`, `makeComponent`, `makeEngine`, `setupGame`, `makeFakeCatalyst`)
- Follow existing test patterns: `node:test` + `node:assert/strict`
- For the integration test (Group 11), import `ResolutionModeService` directly and wire it through `makeEngine`
- All tests must pass with `npm test`

---

## T-050 Plan: Add Salvage Destructive Change Handling

### Goal

Implement three destructive change handlers in `CraftingSystemManager`:
1. When `salvageResolutionMode` changes, validate all components' salvage configs against the new mode and disable invalid ones.
2. When `features.salvage` is set to false, clean up salvage run history across all actors.
3. When a component is deleted, clean up salvage run history referencing that component across all actors.

Also: GM receives a notification when salvage definitions are disabled by mode change.

### Current State

- `CraftingSystemManager.updateSystem()` merges features and re-normalizes but does NOT validate existing salvage configs against mode changes.
- `CraftingSystemManager.deleteItem()` cleans up recipe references and essence links but does NOT touch salvage runs.
- Salvage runs are stored in `actor.flags.fabricate.salvageRuns` with shape `{ active: {}, history: [] }`. The `active` map is always empty because salvage operations are immediate (single-step). History entries have `{ componentId, craftingSystemId, status, ... }`.
- `ResolutionModeService.validateSalvage(component, system)` already validates a component's salvage config against the system's `salvageResolutionMode`.
- `CraftingRunManager.cleanupInvalidRuns()` iterates `game.actors` to clean up crafting runs -- we follow the same pattern for salvage run cleanup.

### Design

#### Path 1: Mode Change Validation (AC1, AC4)

In `updateSystem()`, after re-normalization, detect if `salvageResolutionMode` changed. If so:
1. Import `ResolutionModeService` and create an instance (or get from `game.fabricate`).
2. For each component with `salvage.enabled === true`, call `validateSalvage(component, mergedSystem)`.
3. If invalid, set `component.salvage.enabled = false`.
4. Collect names of disabled components.
5. If any were disabled, send a GM notification via `ui.notifications.warn()`.

This logic goes in a new private method `_disableInvalidSalvageConfigs(system, oldMode)`.

#### Path 2: Feature Disable Cleanup (AC2)

In `updateSystem()`, detect if `features.salvage` changed from `true` to `false`. If so:
1. Iterate `game.actors` (same pattern as `CraftingRunManager.cleanupInvalidRuns`).
2. For each actor, read `fabricate.salvageRuns` flag.
3. Remove history entries where `craftingSystemId` matches the updated system.
4. Persist if changed.

This logic goes in a new private method `_cleanupSalvageRunsForSystem(systemId)`.

#### Path 3: Component Deletion Cleanup (AC3)

In `deleteItem()`, after existing cleanup, call a new method to clean up salvage runs referencing the deleted component:
1. Iterate `game.actors`.
2. For each actor, read `fabricate.salvageRuns` flag.
3. Remove history entries where `componentId` matches the deleted item ID.
4. Persist if changed.

This logic goes in a new private method `_cleanupSalvageRunsForComponent(componentId)`.

### Changes

#### Change 1: Add `_disableInvalidSalvageConfigs(system, oldMode)` to CraftingSystemManager

**File:** `/home/matthew/WebstormProjects/fabricate-v2/src/systems/CraftingSystemManager.js`

```js
_disableInvalidSalvageConfigs(system, oldMode) {
  if (!system.features?.salvage) return [];
  if (system.salvageResolutionMode === oldMode) return [];

  const ResolutionModeService = this._getResolutionModeService();
  if (!ResolutionModeService) return [];

  const disabled = [];
  const items = Array.isArray(system.components) ? system.components : [];
  for (const item of items) {
    if (!item.salvage?.enabled) continue;
    const validation = ResolutionModeService.validateSalvage(item, system);
    if (!validation.valid) {
      item.salvage.enabled = false;
      disabled.push(item.name || item.id);
    }
  }
  return disabled;
}

_getResolutionModeService() {
  return game.fabricate?.getResolutionModeService?.() || null;
}
```

#### Change 2: Add `_cleanupSalvageRunsForSystem(systemId)` to CraftingSystemManager

```js
async _cleanupSalvageRunsForSystem(systemId) {
  const { getFabricateFlag, setFabricateFlag } = await import('../config/flags.js');
  for (const actor of game.actors || []) {
    const existing = getFabricateFlag(actor, 'salvageRuns', null);
    if (!existing) continue;
    const history = Array.isArray(existing.history) ? existing.history : [];
    const filtered = history.filter(r => r.craftingSystemId !== systemId);
    if (filtered.length !== history.length) {
      await setFabricateFlag(actor, 'salvageRuns', { ...existing, history: filtered });
    }
  }
}
```

#### Change 3: Add `_cleanupSalvageRunsForComponent(componentId)` to CraftingSystemManager

```js
async _cleanupSalvageRunsForComponent(componentId) {
  const { getFabricateFlag, setFabricateFlag } = await import('../config/flags.js');
  for (const actor of game.actors || []) {
    const existing = getFabricateFlag(actor, 'salvageRuns', null);
    if (!existing) continue;
    const history = Array.isArray(existing.history) ? existing.history : [];
    const filtered = history.filter(r => r.componentId !== componentId);
    if (filtered.length !== history.length) {
      await setFabricateFlag(actor, 'salvageRuns', { ...existing, history: filtered });
    }
  }
}
```

#### Change 4: Update `updateSystem()` to call destructive change handlers

In `updateSystem()`, after `const merged = this._normalizeSystem(mergedInput);` (line ~506), add:

```js
// Path 1: Mode change -- disable invalid salvage configs
const oldMode = current.salvageResolutionMode || 'simple';
const disabledComponents = this._disableInvalidSalvageConfigs(merged, oldMode);
if (disabledComponents.length > 0) {
  const names = disabledComponents.join(', ');
  ui?.notifications?.warn?.(
    `Fabricate | Salvage disabled for ${disabledComponents.length} component(s) incompatible with new mode: ${names}`
  );
}

// Path 2: Feature disable -- clean up salvage run history
const oldSalvageEnabled = current.features?.salvage === true;
const newSalvageEnabled = merged.features?.salvage === true;
if (oldSalvageEnabled && !newSalvageEnabled) {
  await this._cleanupSalvageRunsForSystem(systemId);
}
```

#### Change 5: Update `deleteItem()` to call component cleanup

In `deleteItem()`, before `await this.save();` at the end, add:

```js
// Clean up salvage runs referencing the deleted component
await this._cleanupSalvageRunsForComponent(itemId);
```

#### Change 6: Add import for flags at top of CraftingSystemManager

Add to imports:
```js
import { getFabricateFlag, setFabricateFlag } from '../config/flags.js';
```

Then the cleanup methods can use the imported functions directly instead of dynamic import.

### Test File

**New file:** `/home/matthew/WebstormProjects/fabricate-v2/tests/salvage-destructive-changes.test.js`

Uses `node:test` + `node:assert/strict`. Follows existing patterns from `salvage-normalisation.test.js`.

**Tests (12 tests across 3 groups):**

**Group 1: Mode change disables invalid salvage configs (4 tests)**

1. `Changing salvageResolutionMode from simple to tiered disables components without outcomeRouting`
   - Setup: system with simple mode, component with 1 result group (valid for simple), salvage.enabled=true
   - Update system to tiered mode
   - Assert: component.salvage.enabled === false

2. `Changing salvageResolutionMode from tiered to simple disables components with multiple result groups`
   - Setup: system with tiered mode, component with 2 result groups + outcomeRouting (valid for tiered)
   - Update to simple mode
   - Assert: component.salvage.enabled === false (simple requires exactly 1 group)

3. `Mode change does not disable components that are valid for the new mode`
   - Setup: system with simple mode, component with 1 result group
   - Update to progressive mode (with check enabled, difficulty set)
   - Assert: component.salvage.enabled === true

4. `GM notification sent when components are disabled by mode change`
   - Setup: spy on ui.notifications.warn
   - Trigger mode change that disables a component
   - Assert: warn called with component name

**Group 2: Feature disable cleans up salvage runs (4 tests)**

5. `Setting features.salvage to false removes salvage run history for that system`
   - Setup: actor with salvageRuns history containing entries for systemId
   - Update system features.salvage = false
   - Assert: history entries for that system are removed

6. `Setting features.salvage to false does not remove runs from other systems`
   - Setup: actor with runs from 2 systems
   - Disable salvage on system A
   - Assert: system B runs remain

7. `Setting features.salvage to false works when no actors exist`
   - No actors in game.actors
   - Assert: no errors

8. `Setting features.salvage from false to false does not trigger cleanup`
   - Setup: system already has salvage=false
   - Update with salvage=false again
   - Assert: no flag writes

**Group 3: Component deletion cleans up salvage runs (4 tests)**

9. `Deleting a component removes salvage run history referencing that component`
   - Setup: actor with salvageRuns history containing entries for componentId
   - Delete the component
   - Assert: history entries for that component are removed

10. `Deleting a component does not remove runs for other components`
    - Setup: actor with runs for 2 components
    - Delete component A
    - Assert: component B runs remain

11. `Deleting a component works when no salvageRuns flag exists on actor`
    - No salvageRuns flag set
    - Assert: no errors

12. `Deleting a component works when history is empty`
    - salvageRuns exists but history is empty
    - Assert: no errors, no flag writes

### Files to Modify

1. `/home/matthew/WebstormProjects/fabricate-v2/src/systems/CraftingSystemManager.js` -- add destructive change handlers and wire into updateSystem/deleteItem

### Files to Create

1. `/home/matthew/WebstormProjects/fabricate-v2/tests/salvage-destructive-changes.test.js` -- unit tests

### Implementation Order

1. Add `import { getFabricateFlag, setFabricateFlag }` to CraftingSystemManager.js
2. Add `_getResolutionModeService()` helper
3. Add `_disableInvalidSalvageConfigs(system, oldMode)` method
4. Add `_cleanupSalvageRunsForSystem(systemId)` method
5. Add `_cleanupSalvageRunsForComponent(componentId)` method
6. Update `updateSystem()` to call Path 1 and Path 2 handlers
7. Update `deleteItem()` to call Path 3 handler
8. Create `tests/salvage-destructive-changes.test.js`
9. Run `npm test` -- all tests pass
10. Run `npm run build` -- no build errors

### Constraints

- Only modify `CraftingSystemManager.js` and test files
- Do NOT touch `CraftingEngine.js`, `docs/quickstart.md`, or integration test files
- Follow existing patterns for iterating `game.actors` and reading/writing fabricate flags
- Use `ui?.notifications?.warn?.()` with optional chaining (safe for test environments)

---

## T-026 Plan: Add Integration Tests for End-to-End Crafting Flow

### Goal

Add integration tests that exercise the full `CraftingEngine.craft()` method across the four resolution modes: simple, multistep, tiered, and progressive. These tests verify the end-to-end pipeline from validation through ingredient consumption to result creation, using real `ResolutionModeService` and `CraftingRunManager` instances (only stubbing the crafting check macro and item creation I/O).

### Current State

- Existing tests cover individual subsystems in isolation (currency, macros, progressive resolution, run manager).
- No test exercises the full `craft()` pipeline end-to-end with real service wiring.
- Test patterns: `node:test` + `node:assert/strict`, duck-typed mocks for Actor/Item, global stubs for `foundry`, `game`, `ui`.

### Test File

**New file:** `/home/matthew/WebstormProjects/fabricate-v2/tests/crafting-integration.test.js`

### Shared Test Harness

All tests share these builders and stubs:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import { CraftingRunManager } from '../src/systems/CraftingRunManager.js';
import { ResolutionModeService } from '../src/systems/ResolutionModeService.js';
```

**Globals setup:**
```js
function getProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path).split('.').reduce((v, k) => (v == null ? undefined : v[k]), object);
}

globalThis.foundry = {
  utils: {
    getProperty,
    randomID: (() => { let n = 0; return () => `id-${++n}`; })()
  }
};
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
```

**FakeItem:**
```js
class FakeItem {
  constructor(id, name, quantity = 1, componentSourceUuid = null) {
    this.id = id;
    this.uuid = `Item.${id}`;
    this.name = name;
    this.parent = null;
    this.system = { quantity };
    this.flags = componentSourceUuid ? { core: { sourceId: componentSourceUuid } } : {};
    this._deleted = false;
  }
  async delete() { this._deleted = true; }
  async update(payload) {
    if (payload['system.quantity'] !== undefined) this.system.quantity = payload['system.quantity'];
  }
}
```

**FakeActor:**
```js
class FakeActor {
  constructor(name, items = []) {
    this.id = `actor-${name}`;
    this.uuid = `Actor.${name}`;
    this.name = name;
    this.items = items;
    this._flags = {};
    this._createdDocs = [];
  }
  getFlag(ns, key) { return this._flags?.[ns]?.[key]; }
  async setFlag(ns, key, value) {
    this._flags[ns] = this._flags[ns] || {};
    this._flags[ns][key] = value;
  }
  async createEmbeddedDocuments(type, data) {
    const created = data.map((d, i) => new FakeItem(`created-${i}`, d.name, d.system?.quantity || 1));
    this._createdDocs.push(...created);
    return created;
  }
}
```

**Mock RecipeManager:**
```js
function buildMockRecipeManager(system) {
  return {
    canCraft(actors, recipe) {
      const ingredientSets = recipe.ingredientSets || [];
      return {
        canCraft: true,
        satisfiableSet: ingredientSets[0] || null,
        missing: { ingredients: [], essences: [], catalysts: [] }
      };
    },
    getCatalystsForSet(recipe, set) { return []; },
    catalystMatchesItem() { return false; },
    ingredientMatchesItem(recipe, ingredient, item) {
      return item.id === ingredient.componentId || item.id === ingredient.systemItemId;
    }
  };
}
```

**buildIngredientSet helper:** Creates a fake ingredient set with `matchIngredients` method that matches items by componentId.

**buildRecipe helper:** Creates a duck-typed recipe object with `validate()`, `toJSON()`, `getExecutionSteps()`.

**setupGame helper:** Sets up `globalThis.game` with a system config.

### Test Groups

#### Group 1: Simple mode integration (AC1) -- 2 tests

**Test 1: `simple mode: validate, consume ingredients, create result item`**
- System: `resolutionMode: 'simple'`, no crafting check
- Recipe: 1 ingredient set with 1 ingredient (componentId: 'wood', qty 1), 1 result group with 1 result (componentId: 'plank')
- Actor items: FakeItem('wood', 'Wood', qty 2)
- Stub `_runCraftingCheck` to return `{ success: true }`
- Stub `_createSingleResult` to return a FakeItem
- Assert:
  - `result.success === true`
  - Wood item quantity reduced by 1 (from 2 to 1)
  - Result item returned in `result.results`

**Test 2: `simple mode: fails when ingredients missing`**
- Same recipe but actor has no items
- RecipeManager.canCraft returns `{ canCraft: false }`
- Assert: `result.success === false`, message mentions missing items

#### Group 2: Multistep mode integration (AC2) -- 2 tests

**Test 3: `multistep: start run, advance through 2 steps, complete`**
- Recipe with 2 explicit steps, each having its own ingredient set and result group
- Wire real `CraftingRunManager`
- Call `craft()` for step 0: validate ingredients, consume, create result, advance run
- Call `craft()` for step 1: validate ingredients, consume, create result, complete run
- Assert:
  - First call: `result.success === true`, run.currentStepIndex advances to 1
  - Second call: `result.success === true`, run.status === 'succeeded'
  - Run history contains 1 completed run

**Test 4: `multistep: step failure records failure and stops run`**
- Recipe with 2 steps
- First step crafting check fails
- Assert: run.status === 'failed', run is in history

#### Group 3: Tiered mode integration (AC3) -- 2 tests

**Test 5: `tiered mode: check returns outcome, routed to correct result group`**
- System: `resolutionMode: 'tiered'`, `craftingCheck: { enabled: true, outcomes: ['pass', 'fail'] }`
- Recipe: 2 result groups ('rg-pass', 'rg-fail'), outcomeRouting: { pass: 'rg-pass', fail: 'rg-fail' }
- Stub `_runCraftingCheck` to return `{ success: true, outcome: 'pass' }`
- Wire real `ResolutionModeService`
- Assert: result items come from 'rg-pass' group

**Test 6: `tiered mode: 'fail' outcome routes to fail result group`**
- Same setup, but check returns `{ success: true, outcome: 'fail' }`
- Assert: result items come from 'rg-fail' group

#### Group 4: Progressive mode integration (AC4) -- 2 tests

**Test 7: `progressive mode: check returns value, awards based on difficulty`**
- System: `resolutionMode: 'progressive'`, `craftingCheck: { enabled: true, progressive: { awardMode: 'equal' } }`, managedItems with difficulties
- Recipe: 1 result group with 3 results (difficulties 2, 3, 5)
- Stub `_runCraftingCheck` to return `{ success: true, value: 7 }`
- Wire real `ResolutionModeService`
- Assert: first 2 results awarded (2+3=5 <= 7), third not (remaining 2 < 5)

**Test 8: `progressive mode: zero check value awards nothing`**
- Same setup, check returns `{ success: true, value: 0 }`
- Assert: no results awarded, `result.success === true`

### Files to Create

1. `/home/matthew/WebstormProjects/fabricate-v2/tests/crafting-integration.test.js`

### Files NOT to Touch

- No `src/` files
- No `README.md` or `docs/quickstart.md`
- No existing test files

### Implementation Constraints

- Use `node:test` + `node:assert/strict`
- Follow existing test patterns (see `tests/success-failure-macro.test.js` for craft() mocking style)
- Use duck-typed mocks, not the real Recipe/IngredientSet classes (avoids needing full Foundry globals)
- Stub `_runCraftingCheck` on the engine instance (same pattern as success-failure-macro tests)
- Stub `_createSingleResult` to return FakeItems (avoids needing full Foundry item creation pipeline)
- Wire real `ResolutionModeService` and `CraftingRunManager` where relevant
- The `getFabricateFlag`/`setFabricateFlag` functions used by CraftingRunManager read/write `actor._flags` -- FakeActor must implement `getFlag`/`setFlag`
- All tests must pass with `npm test`

### Implementation Order

1. Create the test file with shared harness
2. Implement Group 1 (simple mode) tests
3. Implement Group 2 (multistep) tests
4. Implement Group 3 (tiered) tests
5. Implement Group 4 (progressive) tests
6. Run `npm test` -- all tests pass
7. Run `npm run build` -- no build errors
