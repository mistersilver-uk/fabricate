# Implementation Plan

## T-061: Implement Partial Recipe Discovery / Teaser Mode

### Problem Statement

GMs want a middle ground between fully hidden recipes and fully visible recipes. Teaser mode lets undiscovered recipes appear as partial teasers -- showing name/category/image while hiding ingredients, results, and details -- until the player meets discovery conditions. Discovery can happen two ways: (1) threshold-based progress tracked per actor, or (2) fragment-based where finding in-game items contributes fragments toward unlocking a recipe. Both modes let players see their progress and auto-transition to full visibility on completion.

### Current State Analysis

**Existing visibility system:**
- `CraftingSystem.recipeVisibility.listMode` supports `global`, `player`, `knowledge` (spec/006)
- `RecipeVisibilityService.evaluateRecipeAccess()` returns `{ visible, craftable, reason, knowledge }`
- Knowledge mode supports `item`, `learned`, `itemOrLearned` sub-modes
- Cauldron mode has its own `learnOnCraft` visibility path via `learnRecipeOnCraft()`
- Learned recipes stored at `Actor.flags.fabricate.learnedRecipes[recipeId]`
- Recipe-level `visibility` object currently holds `{ restricted, allowedUserIds }` for player mode

**Flag storage pattern:**
- `getFabricateFlag(document, key, default)` / `setFabricateFlag(document, key, value)` in `src/config/flags.js`
- Uses `document.getFlag('fabricate', 'fabricate.<key>')` with null-safe fallback
- Actor flags store `learnedRecipes`, `salvageRuns`, and crafting run data
- No existing per-recipe-per-actor progress data outside `learnedRecipes`

**Recipe model:**
- `Recipe` class in `src/models/Recipe.js` -- constructor normalizes all fields from `data`
- `Recipe.toJSON()` serializes all fields; `Recipe.fromJSON(data)` round-trips
- No existing teaser-related fields

**Crafting store:**
- `_buildPreparedRecipes()` in `craftingStore.js` builds the display data for each recipe
- Each prepared recipe includes: `id`, `name`, `description`, `img`, `category`, `canCraft`, `statusLabel`, `ingredients`, `essences`, `catalysts`, `resultDescription`, `canLearn`, etc.
- `RecipeCard.svelte` renders all these fields; teaser mode must mask some of them

**Admin store:**
- `adminStore.js` manages the RecipeManagerApp; has system-level settings, recipe list, per-system config
- Recipe editor is a separate app (`RecipeEditorApp`) opened per recipe
- System-level settings edited in the Rules tab of RecipeManagerApp

### Key Design Decisions

**D1: Teaser mode is a new listMode value, not a modifier on existing modes**

Adding `teaser` as a fourth `listMode` value (alongside `global`, `player`, `knowledge`) keeps the visibility branching clean. When `listMode === 'teaser'`, teaser-specific logic runs. When teaser mode is off, all existing modes work unchanged (AC8).

Rationale: Overlaying teaser on all modes would create combinatorial complexity. A dedicated mode is simpler and matches how the codebase already branches on `listMode`.

**D2: Recipe-level teaser config specifies which fields are hidden**

Each recipe gains a `teaser` field:
```js
Recipe.teaser = {
  enabled: true,               // Whether this recipe participates in teaser mode
  hiddenFields: ['ingredients', 'results', 'description'],  // Fields masked in teaser state
  revealThreshold: 100,        // % progress needed to fully reveal (0-100, default 100)
  teaserDescription: '',       // Optional alternative description shown while hidden
}
```

Default `hiddenFields`: `['ingredients', 'results', 'description']` -- name, category, and image are always visible (AC2).

**D3: Discovery progress stored per actor via flags**

```js
Actor.flags.fabricate.discoveryProgress = {
  [recipeId]: {
    progress: 45,              // 0-100 percentage
    fragments: ['frag-abc', 'frag-def'],  // Fragment IDs already discovered
    discoveredAt: null,         // null until fully discovered, then timestamp
    manuallySet: false          // true if GM set this directly
  }
}
```

Flag key: `discoveryProgress`. Accessed via `getFabricateFlag(actor, 'discoveryProgress', {})`.

**D4: Fragment definitions live at the crafting system level**

```js
CraftingSystem.teaserConfig = {
  enabled: true,
  discoveryMode: 'threshold' | 'fragments' | 'both',
  fragments: [
    {
      id: 'frag-abc',
      name: 'Ancient Scroll Fragment',
      linkedItemUuid: 'Compendium.world.items.abc123',  // In-game item
      recipeIds: ['recipe-1', 'recipe-2'],               // Recipes this fragment contributes to
      progressValue: 25                                   // How much progress this fragment grants
    }
  ]
}
```

Fragment definitions at the system level (not recipe level) because:
- One fragment/item can contribute to multiple recipes (AC5)
- GMs manage fragments in the system rules tab alongside other system-level config
- Fragments reference in-game items via UUID for item-matching at runtime

**D5: Two discovery paths, configurable per system**

1. **Threshold mode**: GMs manually set progress values per actor/recipe (AC4). Progress bar shown to players (AC6). At `revealThreshold`, recipe transitions to full visibility (AC7).

2. **Fragment mode**: Players find in-game items linked to fragments. When a player acquires an item matching a fragment's `linkedItemUuid`, the fragment is marked discovered and its `progressValue` is added to the recipe's progress (AC5). Uses the same `createItem` hook pattern as drag-and-drop learning.

3. **Both mode**: Either path contributes. Manual threshold + fragment progress are additive.

**D6: Visibility service branching**

In `evaluateRecipeAccess()`, when `listMode === 'teaser'`:
- GM sees all recipes fully (no masking)
- Non-GM: compute discovery progress for each recipe
  - If `discoveredAt` is set (or progress >= threshold): full visibility (`visible: true, craftable: true`)
  - If progress > 0 but < threshold: teaser visibility (`visible: true, craftable: false, reason: 'teaser', teaserState: { progress, hiddenFields }`)
  - If progress === 0 and recipe.teaser.enabled: teaser visibility with 0% progress
  - If recipe.teaser.enabled === false: recipe is fully visible (opt-out per recipe)

**D7: UI rendering of teaser cards**

The prepared recipe object gains:
```js
{
  isTeaser: true,
  teaserProgress: 45,
  teaserHiddenFields: ['ingredients', 'results', 'description'],
  teaserDescription: 'A mysterious recipe...'
}
```

`RecipeCard.svelte` conditionally hides masked fields. A progress bar renders when `isTeaser === true`. The card uses a distinct visual style (slight opacity, lock icon overlay) to communicate partial discovery.

**D8: GM configuration UI for manual progress**

The Recipe Manager "Rules" tab gains a "Teaser Mode" section:
- Toggle teaser mode on/off for the system
- Select discovery mode (threshold/fragments/both)
- Fragment list editor (add/remove fragments, link items, assign recipes, set progress values)

A per-actor progress editor is accessible from the Recipes tab (context menu or button per recipe) allowing GMs to manually set progress per actor (AC4).

### Data Model Changes

#### CraftingSystem (system-level config)

Add to `_normalizeSystem()` output:
```js
teaserConfig: {
  enabled: false,
  discoveryMode: 'threshold',  // 'threshold' | 'fragments' | 'both'
  fragments: []                 // Array of fragment definitions
}
```

Add `_normalizeTeaserConfig(config)` method to `CraftingSystemManager`.

#### Recipe (recipe-level config)

Add to `Recipe` constructor and `toJSON()`:
```js
this.teaser = this._normalizeTeaser(data.teaser);
```

```js
_normalizeTeaser(teaser) {
  if (!teaser || typeof teaser !== 'object') {
    return {
      enabled: true,
      hiddenFields: ['ingredients', 'results', 'description'],
      revealThreshold: 100,
      teaserDescription: ''
    };
  }
  const VALID_FIELDS = ['ingredients', 'results', 'description', 'catalysts', 'essences'];
  return {
    enabled: teaser.enabled !== false,
    hiddenFields: Array.isArray(teaser.hiddenFields)
      ? teaser.hiddenFields.filter(f => VALID_FIELDS.includes(f))
      : ['ingredients', 'results', 'description'],
    revealThreshold: Math.min(100, Math.max(0, Number(teaser.revealThreshold) || 100)),
    teaserDescription: String(teaser.teaserDescription || '').trim()
  };
}
```

#### Actor flags (per-actor progress)

Flag key: `discoveryProgress`
```js
{
  [recipeId]: {
    progress: number,        // 0-100
    fragments: string[],     // Fragment IDs discovered
    discoveredAt: number|null,
    manuallySet: boolean
  }
}
```

### Visibility Service Changes

**File: `src/systems/RecipeVisibilityService.js`**

New methods:

1. `_getDiscoveryProgress(actor, recipeId)` -- reads from actor flags, returns `{ progress, fragments, discoveredAt, manuallySet }` or defaults.

2. `_computeEffectiveProgress(actor, recipeId, system)` -- combines manual progress with fragment progress:
   ```
   manualProgress = stored progress value
   fragmentProgress = sum of progressValue for each discovered fragment linked to this recipe
   effectiveProgress = min(100, manualProgress + fragmentProgress)
   ```

3. `_evaluateTeaserAccess({ recipe, viewer, craftingActor, system })` -- returns teaser-specific access result:
   ```js
   {
     visible: true,
     craftable: boolean,
     reason: 'teaser' | 'teaser-discovered' | 'ok',
     teaserState: {
       isTeaser: boolean,
       progress: number,
       hiddenFields: string[],
       teaserDescription: string
     }
   }
   ```

4. `async discoverFragment(actor, fragmentId, system)` -- marks a fragment as discovered for an actor, updates progress for all linked recipes, and auto-transitions any that hit threshold.

5. `async setDiscoveryProgress(actor, recipeId, progress)` -- GM action to manually set progress (AC4).

6. `getDiscoveryProgressForActor(actor, systemId)` -- returns all progress entries for an actor in a system (used by UI to show progress).

Update `evaluateRecipeAccess()`:
```js
// After existing cauldron check, before listMode branching:
if (listMode === 'teaser') {
  return this._evaluateTeaserAccess({ recipe, viewer, craftingActor, system });
}
```

### Fragment Discovery Hook

**File: `src/main.js`** (or new `src/systems/FragmentDiscoveryHook.js`)

Register a `createItem` hook (same pattern as drag-and-drop learning):
```js
Hooks.on('createItem', async (item, options, userId) => {
  // Only process for the triggering user
  if (game.user.id !== userId) return;

  const actor = item.parent;
  if (!actor) return;

  // Check all teaser-mode systems for matching fragments
  for (const system of craftingSystemManager.getSystems()) {
    if (!system.teaserConfig?.enabled) continue;
    if (!['fragments', 'both'].includes(system.teaserConfig.discoveryMode)) continue;

    for (const fragment of system.teaserConfig.fragments) {
      if (!fragment.linkedItemUuid) continue;
      const sourceUuid = getSourceUuid(item);
      if (item.uuid !== fragment.linkedItemUuid && sourceUuid !== fragment.linkedItemUuid) continue;

      await visibilityService.discoverFragment(actor, fragment.id, system);
    }
  }
});
```

### Crafting Store Changes

**File: `src/ui/svelte/stores/craftingStore.js`**

In `_buildPreparedRecipes()`, extend the prepared recipe object:

```js
// After existing access evaluation:
const teaserState = access.teaserState || null;
const isTeaser = teaserState?.isTeaser === true;

return {
  // ... existing fields ...
  isTeaser,
  teaserProgress: teaserState?.progress ?? 0,
  teaserHiddenFields: teaserState?.hiddenFields ?? [],
  teaserDescription: teaserState?.teaserDescription ?? '',
  // Mask fields when in teaser mode
  description: isTeaser && teaserState.hiddenFields.includes('description')
    ? (teaserState.teaserDescription || localize('FABRICATE.Teaser.HiddenDescription'))
    : recipe.description,
  ingredients: isTeaser && teaserState.hiddenFields.includes('ingredients') ? [] : evaluation?.ingredientStates ?? [],
  essences: isTeaser && teaserState.hiddenFields.includes('essences') ? [] : evaluation?.essenceStates ?? [],
  catalysts: isTeaser && teaserState.hiddenFields.includes('catalysts') ? [] : evaluation?.catalystStates ?? [],
  resultDescription: isTeaser && teaserState.hiddenFields.includes('results')
    ? localize('FABRICATE.Teaser.HiddenResults')
    : recipe.getResultDescription(),
};
```

### UI Changes

#### RecipeCard.svelte modifications

Add teaser rendering:
```svelte
{#if recipe.isTeaser}
  <div class="teaser-overlay">
    <div class="teaser-progress-bar">
      <div class="teaser-progress-fill" style="width: {recipe.teaserProgress}%"></div>
    </div>
    <span class="teaser-progress-label">{recipe.teaserProgress}%</span>
  </div>
{/if}
```

When `isTeaser`, the existing ingredient/catalyst/essence/result sections simply render nothing (because the prepared data is already masked). The card gets a `class:is-teaser={recipe.isTeaser}` CSS class for visual styling.

#### Admin UI: Teaser system config (Rules tab)

**File: `src/ui/svelte/apps/RulesTab.svelte`** (MODIFY)

Add a "Teaser Mode" collapsible section:
- Toggle: enable/disable teaser mode for this system
- Select: discovery mode (threshold / fragments / both)
- Fragment list (when mode is fragments or both):
  - Table: fragment name, linked item UUID, target recipes, progress value
  - Add/remove fragment buttons
  - Item drop zone for linking items to fragments

#### Admin UI: Per-actor progress editor

**File: `src/ui/svelte/apps/TeaserProgressEditor.svelte`** (NEW)

Dialog/panel opened from recipe context in the Recipes tab:
- Shows all actors with progress for a specific recipe
- Slider or input to set progress per actor
- Shows fragment discovery status per actor
- "Reset progress" and "Grant full discovery" quick actions

### Implementation Steps

#### Step 1: Add teaser normalization to Recipe model

**File: `/home/matthew/WebstormProjects/fabricate-v2/src/models/Recipe.js`**

1. Add `this.teaser = this._normalizeTeaser(data.teaser);` to constructor
2. Add `_normalizeTeaser(teaser)` method (as specified above)
3. Add `teaser: this.teaser` to `toJSON()`

#### Step 2: Add teaserConfig to CraftingSystemManager

**File: `/home/matthew/WebstormProjects/fabricate-v2/src/systems/CraftingSystemManager.js`**

1. Add `teaserConfig: this._normalizeTeaserConfig(system.teaserConfig)` to `_normalizeSystem()` output
2. Add `_normalizeTeaserConfig(config)`:
   ```js
   _normalizeTeaserConfig(config) {
     if (!config || typeof config !== 'object') {
       return { enabled: false, discoveryMode: 'threshold', fragments: [] };
     }
     const VALID_MODES = ['threshold', 'fragments', 'both'];
     return {
       enabled: config.enabled === true,
       discoveryMode: VALID_MODES.includes(config.discoveryMode) ? config.discoveryMode : 'threshold',
       fragments: Array.isArray(config.fragments)
         ? config.fragments.map(f => this._normalizeTeaserFragment(f)).filter(Boolean)
         : []
     };
   }
   ```
3. Add `_normalizeTeaserFragment(fragment)`:
   ```js
   _normalizeTeaserFragment(fragment) {
     if (!fragment || typeof fragment !== 'object') return null;
     return {
       id: fragment.id || foundry.utils.randomID(),
       name: String(fragment.name || '').trim() || 'Unnamed Fragment',
       linkedItemUuid: fragment.linkedItemUuid || null,
       recipeIds: Array.isArray(fragment.recipeIds) ? fragment.recipeIds.filter(Boolean) : [],
       progressValue: Math.min(100, Math.max(0, Number(fragment.progressValue) || 0))
     };
   }
   ```
4. Add `'teaser'` to the valid `listMode` values in `_normalizeRecipeVisibility()`:
   ```js
   const listMode = ['global', 'player', 'knowledge', 'teaser'].includes(recipeVisibility?.listMode)
     ? recipeVisibility.listMode
     : 'global';
   ```

#### Step 3: Add teaser visibility to RecipeVisibilityService

**File: `/home/matthew/WebstormProjects/fabricate-v2/src/systems/RecipeVisibilityService.js`**

1. Add `_getDiscoveryProgress(actor, recipeId)` method
2. Add `_computeEffectiveProgress(actor, recipeId, system)` method
3. Add `_evaluateTeaserAccess({ recipe, viewer, craftingActor, system })` method
4. Add `async discoverFragment(actor, fragmentId, system)` method
5. Add `async setDiscoveryProgress(actor, recipeId, progress)` method
6. Add `getDiscoveryProgressForActor(actor, systemId)` method
7. Update `evaluateRecipeAccess()` to branch on `listMode === 'teaser'`

#### Step 4: Add fragment discovery hook

**File: `/home/matthew/WebstormProjects/fabricate-v2/src/systems/FragmentDiscoveryHook.js`** (NEW)

1. Export `registerFragmentDiscoveryHook(craftingSystemManager, visibilityService)` function
2. Registers `Hooks.on('createItem', ...)` handler that checks teaser-mode systems for matching fragments
3. Uses `getSourceUuid()` for item matching (same pattern as drag-and-drop learning)

**File: `/home/matthew/WebstormProjects/fabricate-v2/src/main.js`** (MODIFY)

1. Import and call `registerFragmentDiscoveryHook()` during module initialization

#### Step 5: Update craftingStore for teaser rendering

**File: `/home/matthew/WebstormProjects/fabricate-v2/src/ui/svelte/stores/craftingStore.js`**

1. In `_buildPreparedRecipes()`, extend prepared recipe with teaser fields
2. Mask `description`, `ingredients`, `essences`, `catalysts`, `resultDescription` when teaser is active
3. Add `isTeaser`, `teaserProgress`, `teaserHiddenFields`, `teaserDescription` to prepared recipe

#### Step 6: Update RecipeCard.svelte for teaser display

**File: `/home/matthew/WebstormProjects/fabricate-v2/src/ui/svelte/apps/RecipeCard.svelte`**

1. Add `class:is-teaser={recipe.isTeaser}` to article element
2. Add teaser progress bar overlay when `recipe.isTeaser`
3. The masked fields already render empty/hidden via the store-level masking

#### Step 7: Add teaser config to admin Rules tab

**File: `/home/matthew/WebstormProjects/fabricate-v2/src/ui/svelte/apps/RulesTab.svelte`** (MODIFY)

1. Add "Teaser Mode" collapsible section
2. System-level toggle, discovery mode selector, fragment list editor
3. Wire to `adminStore` actions for saving teaser config

#### Step 8: Create TeaserProgressEditor component

**File: `/home/matthew/WebstormProjects/fabricate-v2/src/ui/svelte/apps/TeaserProgressEditor.svelte`** (NEW)

1. Dialog showing per-actor progress for a recipe
2. Progress slider/input per actor
3. Fragment status display
4. Quick actions: reset, grant full discovery

#### Step 9: Extend adminStore with teaser actions

**File: `/home/matthew/WebstormProjects/fabricate-v2/src/ui/svelte/stores/adminStore.js`** (MODIFY)

1. Add `updateTeaserConfig(systemId, config)` action
2. Add `setActorDiscoveryProgress(actorId, recipeId, progress)` action
3. Add `addFragment(systemId, fragment)` and `removeFragment(systemId, fragmentId)` actions

#### Step 10: Add localization keys

**File: `/home/matthew/WebstormProjects/fabricate-v2/lang/en.json`**

```json
"FABRICATE.Teaser.Title": "Teaser Mode",
"FABRICATE.Teaser.Enable": "Enable Teaser Mode",
"FABRICATE.Teaser.DiscoveryMode": "Discovery Mode",
"FABRICATE.Teaser.ModeThreshold": "Threshold (GM sets progress)",
"FABRICATE.Teaser.ModeFragments": "Fragments (item-based discovery)",
"FABRICATE.Teaser.ModeBoth": "Both (threshold + fragments)",
"FABRICATE.Teaser.Fragments": "Fragments",
"FABRICATE.Teaser.FragmentName": "Fragment Name",
"FABRICATE.Teaser.LinkedItem": "Linked Item",
"FABRICATE.Teaser.TargetRecipes": "Target Recipes",
"FABRICATE.Teaser.ProgressValue": "Progress Value",
"FABRICATE.Teaser.AddFragment": "Add Fragment",
"FABRICATE.Teaser.RemoveFragment": "Remove Fragment",
"FABRICATE.Teaser.HiddenDescription": "You have not yet discovered this recipe...",
"FABRICATE.Teaser.HiddenResults": "???",
"FABRICATE.Teaser.Progress": "Discovery Progress",
"FABRICATE.Teaser.ProgressLabel": "{progress}% Discovered",
"FABRICATE.Teaser.FullyDiscovered": "Fully Discovered",
"FABRICATE.Teaser.SetProgress": "Set Discovery Progress",
"FABRICATE.Teaser.ResetProgress": "Reset Progress",
"FABRICATE.Teaser.GrantDiscovery": "Grant Full Discovery",
"FABRICATE.Teaser.FragmentDiscovered": "Fragment discovered: {name}",
"FABRICATE.Teaser.RecipeUnlocked": "Recipe unlocked: {name}"
```

#### Step 11: Add CSS for teaser UI

**File: `/home/matthew/WebstormProjects/fabricate-v2/styles/fabricate.css`**

Add:
- `.fabricate-recipe-item.is-teaser` -- slight opacity reduction, lock icon overlay
- `.teaser-overlay` -- absolute positioned container for progress bar
- `.teaser-progress-bar` -- background track for progress
- `.teaser-progress-fill` -- filled portion, colored
- `.teaser-progress-label` -- percentage text
- `.teaser-config-section` -- rules tab section styling
- `.fragment-list` -- table styling for fragment editor

#### Step 12: Tests

**File: `/home/matthew/WebstormProjects/fabricate-v2/tests/teaser-visibility.test.js`** (NEW)

Teaser visibility service tests:
1. Teaser mode off: existing `global`/`player`/`knowledge` modes unaffected
2. Teaser mode on, GM viewer: sees all recipes fully (no masking)
3. Teaser mode on, player, 0% progress: recipe visible as teaser, not craftable
4. Teaser mode on, player, partial progress: visible as teaser with correct progress %
5. Teaser mode on, player, 100% progress: fully visible and craftable (auto-transition, AC7)
6. Recipe with `teaser.enabled: false`: fully visible even in teaser mode
7. Custom `revealThreshold` (e.g., 50): recipe unlocks at 50% not 100%
8. `setDiscoveryProgress()` updates actor flags correctly
9. `discoverFragment()` adds fragment, updates progress, auto-transitions when threshold met
10. Fragment contributing to multiple recipes updates all linked recipes
11. Duplicate fragment discovery is idempotent (no double-counting)
12. `getDiscoveryProgressForActor()` returns correct progress map

**File: `/home/matthew/WebstormProjects/fabricate-v2/tests/teaser-store.test.js`** (NEW)

Store-level teaser tests:
13. Prepared recipe has `isTeaser: true` when in teaser mode with partial progress
14. Masked fields (ingredients, results, description) are empty/replaced in teaser state
15. Fully discovered recipe shows all fields normally
16. Non-teaser recipes render normally when teaser mode is enabled

**File: `/home/matthew/WebstormProjects/fabricate-v2/tests/teaser-fragment-hook.test.js`** (NEW)

Fragment hook tests:
17. Item creation matching a fragment triggers discovery
18. Item creation not matching any fragment is ignored
19. Fragment discovery in non-teaser system is ignored
20. Fragment with `discoveryMode: 'threshold'` (no fragments mode) is ignored

**File: `/home/matthew/WebstormProjects/fabricate-v2/tests/teaser-normalization.test.js`** (NEW)

Normalization tests:
21. Recipe `_normalizeTeaser()` produces correct defaults
22. Invalid `hiddenFields` values are filtered out
23. `revealThreshold` clamped to 0-100
24. `_normalizeTeaserConfig()` produces correct defaults
25. `_normalizeTeaserFragment()` normalizes all fields
26. `'teaser'` is accepted as valid `listMode`

**File: `/home/matthew/WebstormProjects/fabricate-v2/tests/components/teaser-card.test.js`** (NEW)

Component tests:
27. Teaser recipe card renders progress bar
28. Teaser recipe card hides masked fields
29. Fully discovered recipe card renders normally
30. Progress bar shows correct percentage

### Files Changed

| File | Action | Description |
|---|---|---|
| `src/models/Recipe.js` | MODIFY | Add `teaser` field with `_normalizeTeaser()` |
| `src/systems/CraftingSystemManager.js` | MODIFY | Add `teaserConfig` to system normalization, add `'teaser'` to valid listModes |
| `src/systems/RecipeVisibilityService.js` | MODIFY | Add teaser access evaluation, discovery progress, fragment discovery methods |
| `src/systems/FragmentDiscoveryHook.js` | NEW | `createItem` hook for automatic fragment discovery |
| `src/main.js` | MODIFY | Wire fragment discovery hook |
| `src/ui/svelte/stores/craftingStore.js` | MODIFY | Add teaser fields to prepared recipes, mask hidden fields |
| `src/ui/svelte/stores/adminStore.js` | MODIFY | Add teaser config and progress management actions |
| `src/ui/svelte/apps/RecipeCard.svelte` | MODIFY | Add teaser progress bar, `is-teaser` class |
| `src/ui/svelte/apps/RulesTab.svelte` | MODIFY | Add teaser config section with fragment editor |
| `src/ui/svelte/apps/TeaserProgressEditor.svelte` | NEW | Per-actor progress editor dialog |
| `lang/en.json` | MODIFY | Add 22 teaser localization keys |
| `styles/fabricate.css` | MODIFY | Add teaser-specific CSS |
| `tests/teaser-visibility.test.js` | NEW | 12 visibility service tests |
| `tests/teaser-store.test.js` | NEW | 4 store tests |
| `tests/teaser-fragment-hook.test.js` | NEW | 4 fragment hook tests |
| `tests/teaser-normalization.test.js` | NEW | 6 normalization tests |
| `tests/components/teaser-card.test.js` | NEW | 4 component tests |

### Acceptance Criteria Mapping

| AC | How Satisfied |
|---|---|
| AC1: Systems can enable/disable teaser mode independently | `teaserConfig.enabled` on system + `'teaser'` as a separate `listMode` value; existing modes unaffected |
| AC2: Teaser recipes display limited metadata | `hiddenFields` masks configurable fields; name/category/image always shown; store-level masking in `_buildPreparedRecipes()` |
| AC3: Discovery progress tracked per actor with threshold unlocks | `Actor.flags.fabricate.discoveryProgress[recipeId]` with `progress` and `revealThreshold` comparison |
| AC4: GMs can manually configure visibility progress | `setDiscoveryProgress()` method + TeaserProgressEditor UI with per-actor progress controls |
| AC5: GMs can create fragment lists with in-game items | `teaserConfig.fragments[]` with `linkedItemUuid`, `recipeIds`, `progressValue`; fragment editor in Rules tab |
| AC6: Players can see progress towards unlocking | `teaserProgress` rendered as progress bar in RecipeCard.svelte |
| AC7: Fully discovered recipes auto-transition | `_computeEffectiveProgress()` >= `revealThreshold` sets `discoveredAt` and returns full visibility |
| AC8: Existing visibility modes unaffected | Teaser is a separate `listMode` branch; `global`/`player`/`knowledge` code paths untouched |
| AC9: Unit tests cover teaser rendering, unlock transitions, permission boundaries | 30 tests across 5 files covering visibility, store, hook, normalization, and component rendering |

### Implementation Order for the Implementer

1. `src/models/Recipe.js` -- add teaser normalization (no dependencies)
2. `src/systems/CraftingSystemManager.js` -- add teaserConfig normalization and teaser listMode
3. `tests/teaser-normalization.test.js` -- validate normalization first
4. `src/systems/RecipeVisibilityService.js` -- add teaser visibility evaluation
5. `tests/teaser-visibility.test.js` -- validate visibility logic
6. `src/systems/FragmentDiscoveryHook.js` -- create fragment discovery hook
7. `tests/teaser-fragment-hook.test.js` -- validate hook logic
8. `src/ui/svelte/stores/craftingStore.js` -- add teaser fields to prepared recipes
9. `tests/teaser-store.test.js` -- validate store masking
10. `lang/en.json` -- add localization keys
11. `src/ui/svelte/apps/RecipeCard.svelte` -- add teaser progress bar
12. `tests/components/teaser-card.test.js` -- validate component rendering
13. `styles/fabricate.css` -- add teaser CSS
14. `src/ui/svelte/apps/RulesTab.svelte` -- add teaser config section
15. `src/ui/svelte/apps/TeaserProgressEditor.svelte` -- create progress editor
16. `src/ui/svelte/stores/adminStore.js` -- add teaser admin actions
17. `src/main.js` -- wire fragment discovery hook
18. Run `npm test` to verify all tests pass
19. Run `npm run build` to verify no build errors

---

## T-059: Add Shopping List and Missing-Materials Summary

### Problem Statement

Players and GMs currently evaluate recipe craftability one recipe at a time. There is no way to plan across multiple recipes -- for example, "I want to craft a Healing Potion and a Firebomb; what materials do I still need overall?" T-059 adds a shopping list feature where users can queue multiple recipes with quantities, see aggregated material requirements, and compare against their inventory to identify what is missing.

### Current State Analysis

**Data model observations:**

- `Recipe.ingredientSets[]` -- each recipe has one or more alternative ingredient sets. For shopping list purposes, we use the *first satisfiable set* (or first set as fallback) per `evaluateCraftability()` logic.
- `IngredientSet.ingredientGroups[]` -- each group has `options[]` of `Ingredient` objects. Each `Ingredient` has `match.componentId`, `itemUuid`, or tag-based matching, plus a `quantity`.
- `IngredientSet.essences` -- `{ essenceType: quantity }` map of required essences.
- `Recipe.catalysts[]` -- non-consumable requirements via `Catalyst.componentId`.
- `RecipeManager.evaluateCraftability(sourceActors, recipe)` returns `{ canCraft, ingredientStates, essenceStates, catalystStates }` where each state has `{ description, need, have, satisfied }`.
- `RecipeManager.resolveComponentName(recipe, componentId)` resolves human-readable names.

**Crafting store observations:**

- `createCraftingStore(services)` manages `craftingActor`, `componentSourceActors`, and `viewState` writables.
- `_buildPreparedRecipes()` evaluates craftability for all visible recipes, producing `ingredientStates` per recipe.
- The store already tracks `componentSourceActors` (the actors whose inventory is used for have/need calculations).
- `services.getRecipeManager()` provides access to recipe data and evaluation.

**UI observations:**

- `CraftingAppRoot.svelte` is the player UI with sections: ActorSelector, SourceActorPicker, RunSummary, SearchBar, FilterBar, RecipeList/CauldronPanel.
- `RecipeCard.svelte` shows per-recipe ingredients with `(have/need)` badges.
- `FilterBar.svelte` has toggle buttons (Craftable only, Favourites only) and a category dropdown.
- The app uses `localize()` from foundryBridge.js for i18n.

**Key insight:** The shopping list is a *client-side planning tool*, not a persistent server-side feature. It does not need to survive page reloads (though persisting to a setting is a nice-to-have for future work). The aggregation math is purely derived from existing `evaluateCraftability` data.

### Key Design Decisions

**D1: Shopping list state lives in craftingStore as new writables**

The shopping list is tightly coupled to the CraftingApp's actor/source selection (since have/need depends on which actors are selected). Adding it to `craftingStore` keeps reactive updates simple -- when `componentSourceActors` changes, the shopping list recalculates automatically via `refresh()`.

State shape:
```js
const shoppingList = writable([]);
// Array of { recipeId: string, quantity: number }
```

**D2: Aggregation is a pure function over recipe data + evaluations**

A pure function `aggregateShoppingList(entries, recipeManager, componentSourceActors)` takes the shopping list entries and returns:
```js
{
  ingredients: [
    {
      componentId: string | null,
      itemUuid: string | null,
      description: string,
      totalNeed: number,      // sum across all recipes * quantities
      have: number,            // from actor inventory
      missing: number,         // max(0, totalNeed - have)
      satisfied: boolean,      // missing === 0
      recipeBreakdown: [       // which recipes contributed
        { recipeId, recipeName, quantity, need }
      ]
    }
  ],
  essences: [
    {
      type: string,
      totalNeed: number,
      have: number,
      missing: number,
      satisfied: boolean
    }
  ],
  catalysts: [
    {
      componentId: string,
      name: string,
      available: boolean
    }
  ],
  allSatisfied: boolean,
  totalRecipes: number,
  totalQuantity: number
}
```

This pure function is independently testable.

**D3: Ingredient deduplication uses componentId as the merge key**

When the same component appears as an ingredient in multiple recipes, quantities are summed. The `have` value is shared (it is the same inventory). `missing = max(0, totalNeed - have)`.

For tag-based or UUID-based ingredients without a componentId, we fall back to `itemUuid` or a composite key of `match.type + match.tags.join(',')`. This handles edge cases where the same material is referenced differently across recipes.

**D4: Shopping list panel is a collapsible section in CraftingAppRoot, not a separate tab**

The shopping list should be visible alongside the recipe browser so users can add recipes while seeing their list. A collapsible panel at the top (below RunSummary, above the recipe list) is the most practical placement. When empty, it shows a minimal "Shopping list empty" hint. When populated, it expands to show the aggregated materials.

**D5: Add-to-list action is a button on RecipeCard**

Each RecipeCard gets a shopping cart icon button. Clicking it adds 1x of that recipe to the shopping list (or increments the quantity if already present). The ShoppingListPanel shows quantity controls (increment/decrement/remove) for each entry.

**D6: Actor source switching reuses existing componentSourceActors**

The shopping list's have/need calculations use the same `componentSourceActors` store that the rest of the CraftingApp uses. When the user toggles source actors, the shopping list updates automatically. No separate actor picker is needed for the shopping list.

**D7: Shopping list is session-scoped (not persisted)**

For the initial implementation, the shopping list clears when the app is closed. Persistence can be added later via a setting if users request it. This keeps the implementation simple and avoids cluttering saved settings.

### Aggregation Algorithm

```
aggregateShoppingList(entries, recipeManager, componentSourceActors):
  1. For each entry { recipeId, quantity }:
     a. Get recipe from recipeManager
     b. Get evaluation = evaluateCraftability(componentSourceActors, recipe)
     c. For each ingredientState in evaluation.ingredientStates:
        - Compute key = componentId || itemUuid || tagKey
        - Accumulate: aggregated[key].totalNeed += ingredientState.need * quantity
        - Set: aggregated[key].have = ingredientState.have  (shared inventory)
        - Track: aggregated[key].recipeBreakdown.push({ recipeId, ... })
     d. For each essenceState in evaluation.essenceStates:
        - Accumulate: essences[type].totalNeed += essenceState.need * quantity
        - Set: essences[type].have = essenceState.have
     e. For each catalystState in evaluation.catalystStates:
        - Catalysts are non-consumable, so no quantity multiplication
        - Deduplicate by componentId, keep available status

  2. For each aggregated ingredient:
     - missing = max(0, totalNeed - have)
     - satisfied = missing === 0

  3. Return { ingredients, essences, catalysts, allSatisfied, totalRecipes, totalQuantity }
```

### Implementation Steps

#### Step 1: Create shopping list aggregation module

**File: `/home/matthew/WebstormProjects/fabricate-v2/src/ui/svelte/util/shoppingListAggregator.js`** (NEW)

Pure function, no Foundry/DOM dependencies:

1. `aggregateShoppingList(entries, recipeManager, componentSourceActors)` -- implements the algorithm above.

2. `_buildIngredientKey(ingredientState)` -- returns a deduplication key from the ingredient's componentId, itemUuid, or tag description.

3. `_mergeIngredient(existing, incoming, recipeId, recipeName, recipeQuantity)` -- merges an incoming ingredient state into an existing aggregated entry.

The module exports only `aggregateShoppingList`.

#### Step 2: Extend craftingStore with shopping list state and actions

**File: `/home/matthew/WebstormProjects/fabricate-v2/src/ui/svelte/stores/craftingStore.js`** (MODIFY)

1. Import `aggregateShoppingList` from `shoppingListAggregator.js`.

2. Add new writables:
   ```js
   const shoppingList = writable([]);  // [{ recipeId, quantity }]
   const shoppingListExpanded = writable(false);
   ```

3. Add shopping list actions:
   ```js
   function addToShoppingList(recipeId) {
     shoppingList.update(list => {
       const existing = list.find(e => e.recipeId === recipeId);
       if (existing) {
         return list.map(e =>
           e.recipeId === recipeId ? { ...e, quantity: e.quantity + 1 } : e
         );
       }
       return [...list, { recipeId, quantity: 1 }];
     });
     shoppingListExpanded.set(true);
     refresh();
   }

   function removeFromShoppingList(recipeId) {
     shoppingList.update(list => list.filter(e => e.recipeId !== recipeId));
     refresh();
   }

   function setShoppingListQuantity(recipeId, quantity) {
     if (quantity <= 0) {
       removeFromShoppingList(recipeId);
       return;
     }
     shoppingList.update(list =>
       list.map(e =>
         e.recipeId === recipeId ? { ...e, quantity } : e
       )
     );
     refresh();
   }

   function clearShoppingList() {
     shoppingList.set([]);
     refresh();
   }

   function toggleShoppingListExpanded() {
     shoppingListExpanded.update(v => !v);
   }
   ```

4. In `refresh()`, after `_buildPreparedRecipes()`, compute shopping list aggregation:
   ```js
   const currentShoppingList = get(shoppingList);
   let shoppingListData = null;
   if (currentShoppingList.length > 0) {
     shoppingListData = aggregateShoppingList(
       currentShoppingList,
       recipeManager,
       get(componentSourceActors)
     );
   }
   ```

5. Add `shoppingListData` to the `viewState.set(...)` call.

6. Export new stores and actions from the return object:
   ```js
   shoppingList,
   shoppingListExpanded,
   addToShoppingList,
   removeFromShoppingList,
   setShoppingListQuantity,
   clearShoppingList,
   toggleShoppingListExpanded,
   ```

#### Step 3: Create ShoppingListPanel.svelte component

**File: `/home/matthew/WebstormProjects/fabricate-v2/src/ui/svelte/apps/ShoppingListPanel.svelte`** (NEW)

Svelte 5 component with collapsible panel:

```svelte
<script>
  import { localize } from '../util/foundryBridge.js';

  let {
    shoppingListData = null,
    shoppingListEntries = [],
    expanded = false,
    onToggleExpanded,
    onRemoveRecipe,
    onSetQuantity,
    onClearAll
  } = $props();

  let entryCount = $derived(shoppingListEntries.length);
</script>

<!-- Collapsible header with badge count -->
<!-- When expanded: recipe entry list with quantity +/- controls -->
<!-- Aggregated materials table: description | need | have | missing -->
<!-- Essence summary (if any) -->
<!-- Catalyst summary (if any) -->
<!-- "All materials available" or "X items missing" summary -->
<!-- Clear all button -->
```

Key UI elements:
- Header bar: shopping cart icon, "Shopping List (N)" label, expand/collapse toggle, clear all button
- Recipe entries: recipe name, quantity spinner (min 1), remove button
- Materials table: columns for Material, Need, Have, Missing with color-coded satisfied/unsatisfied rows
- Essences section: same have/need/missing pattern
- Catalysts section: available/unavailable badges
- Summary footer: "All materials available" (green) or "N materials missing" (amber)

#### Step 4: Add shopping list button to RecipeCard.svelte

**File: `/home/matthew/WebstormProjects/fabricate-v2/src/ui/svelte/apps/RecipeCard.svelte`** (MODIFY)

1. Add `onAddToShoppingList` prop:
   ```js
   let { ..., onAddToShoppingList } = $props();
   ```

2. Add a shopping cart button in the `recipe-actions` div (before the favourite button):
   ```svelte
   <button
     type="button"
     class="details-btn shopping-btn"
     onclick={() => onAddToShoppingList?.(recipe.id)}
     title={localize('FABRICATE.ShoppingList.AddToList')}
   >
     <i class="fas fa-cart-plus"></i>
   </button>
   ```

#### Step 5: Wire ShoppingListPanel into CraftingAppRoot.svelte

**File: `/home/matthew/WebstormProjects/fabricate-v2/src/ui/svelte/apps/CraftingAppRoot.svelte`** (MODIFY)

1. Import `ShoppingListPanel`.

2. Add store subscriptions:
   ```js
   const shoppingList = store.shoppingList;
   const shoppingListExpanded = store.shoppingListExpanded;
   ```

3. Add the panel between RunSummary and the header/recipe list:
   ```svelte
   <ShoppingListPanel
     shoppingListData={$viewState.shoppingListData}
     shoppingListEntries={$shoppingList}
     expanded={$shoppingListExpanded}
     onToggleExpanded={store.toggleShoppingListExpanded}
     onRemoveRecipe={store.removeFromShoppingList}
     onSetQuantity={store.setShoppingListQuantity}
     onClearAll={store.clearShoppingList}
   />
   ```

4. Pass `onAddToShoppingList={store.addToShoppingList}` to `RecipeList`.

5. Update `RecipeList.svelte` to accept and forward `onAddToShoppingList` to each `RecipeCard`.

#### Step 6: Update RecipeList.svelte to forward shopping list callback

**File: `/home/matthew/WebstormProjects/fabricate-v2/src/ui/svelte/apps/RecipeList.svelte`** (MODIFY)

1. Add `onAddToShoppingList` prop.
2. Pass it through to each `RecipeCard` instance.

#### Step 7: Add localization keys

**File: `/home/matthew/WebstormProjects/fabricate-v2/lang/en.json`** (MODIFY)

```json
"FABRICATE.ShoppingList.Title": "Shopping List",
"FABRICATE.ShoppingList.TitleCount": "Shopping List ({count})",
"FABRICATE.ShoppingList.AddToList": "Add to shopping list",
"FABRICATE.ShoppingList.RemoveFromList": "Remove from shopping list",
"FABRICATE.ShoppingList.ClearAll": "Clear shopping list",
"FABRICATE.ShoppingList.Empty": "No recipes added to shopping list",
"FABRICATE.ShoppingList.Material": "Material",
"FABRICATE.ShoppingList.Need": "Need",
"FABRICATE.ShoppingList.Have": "Have",
"FABRICATE.ShoppingList.Missing": "Missing",
"FABRICATE.ShoppingList.AllSatisfied": "All materials available",
"FABRICATE.ShoppingList.MissingCount": "{count} material(s) still needed",
"FABRICATE.ShoppingList.Essences": "Essences",
"FABRICATE.ShoppingList.Catalysts": "Required Tools"
```

#### Step 8: Add CSS for shopping list panel

**File: `/home/matthew/WebstormProjects/fabricate-v2/styles/fabricate.css`** (MODIFY)

Add shopping list styles:
- `.shopping-list-panel` -- collapsible container with border, background
- `.shopping-list-header` -- flex row with icon, title, badge, expand toggle, clear button
- `.shopping-list-header .badge` -- count badge
- `.shopping-list-body` -- transition for collapse/expand
- `.shopping-list-entries` -- recipe entry list with quantity controls
- `.shopping-list-entry` -- flex row: recipe name, quantity spinner, remove button
- `.shopping-list-materials` -- table layout for aggregated materials
- `.shopping-list-materials .satisfied` -- green text/icon
- `.shopping-list-materials .unsatisfied` -- amber/red text/icon
- `.shopping-list-summary` -- footer with overall status
- `.shopping-btn` -- cart button styling in RecipeCard actions

#### Step 9: Tests

**File: `/home/matthew/WebstormProjects/fabricate-v2/tests/shopping-list-aggregator.test.js`** (NEW)

Aggregation logic tests:

1. **Empty list returns null-like result**: No entries produces `{ ingredients: [], essences: [], catalysts: [], allSatisfied: true, totalRecipes: 0, totalQuantity: 0 }`.
2. **Single recipe, single ingredient**: 1x recipe with 2x Iron Ore needed, actor has 3 -> `{ totalNeed: 2, have: 3, missing: 0, satisfied: true }`.
3. **Single recipe, quantity > 1**: 3x recipe needing 2x Iron Ore -> `totalNeed: 6`.
4. **Multiple recipes, same ingredient**: Recipe A needs 2x Iron, Recipe B needs 3x Iron -> `totalNeed: 5`, `have` is shared inventory count.
5. **Multiple recipes, different ingredients**: Recipe A needs Iron, Recipe B needs Copper -> two separate aggregated entries.
6. **Duplicate component deduplication**: Same componentId from different recipes merges correctly.
7. **Missing calculation**: `totalNeed: 5, have: 2` -> `missing: 3, satisfied: false`.
8. **All satisfied when have >= totalNeed for all**: Returns `allSatisfied: true`.
9. **Not all satisfied when any ingredient is short**: Returns `allSatisfied: false`.
10. **Essence aggregation**: Multiple recipes with essence requirements sum correctly.
11. **Catalyst deduplication**: Same catalyst across recipes appears once with availability status.
12. **Recipe breakdown tracks per-recipe contribution**: Each aggregated ingredient has `recipeBreakdown` array.
13. **Zero quantity ingredient (edge case)**: Handled gracefully.
14. **Recipe not found in manager**: Skipped with no crash.
15. **Empty component source actors**: All `have` values are 0, all `satisfied` false.

**File: `/home/matthew/WebstormProjects/fabricate-v2/tests/stores/crafting-store-shopping.test.js`** (NEW)

Store integration tests:

1. **addToShoppingList adds entry**: Adding a recipe creates `{ recipeId, quantity: 1 }`.
2. **addToShoppingList increments existing**: Adding same recipe twice -> quantity 2.
3. **removeFromShoppingList removes entry**: Entry is removed from list.
4. **setShoppingListQuantity updates quantity**: Setting quantity to 5 updates correctly.
5. **setShoppingListQuantity <= 0 removes**: Setting quantity to 0 removes the entry.
6. **clearShoppingList empties list**: All entries removed.
7. **refresh recomputes shoppingListData**: After adding recipe, viewState includes shoppingListData.
8. **shoppingListData updates when componentSourceActors change**: Changing source actors recalculates have/need.
9. **toggleShoppingListExpanded toggles state**: Expanded flips between true/false.
10. **Empty shopping list produces null shoppingListData**: No computation when list is empty.

**File: `/home/matthew/WebstormProjects/fabricate-v2/tests/components/shopping-list-panel.test.js`** (NEW)

Component tests:

1. **Renders empty state when no entries**: Shows "No recipes added" message.
2. **Renders recipe entries with quantities**: Each entry shows recipe name and quantity.
3. **Renders materials table with have/need/missing columns**: Aggregated data displayed correctly.
4. **Satisfied materials have satisfied class**: CSS class applied for satisfied ingredients.
5. **Unsatisfied materials have unsatisfied class**: CSS class applied for missing ingredients.
6. **Clicking remove calls onRemoveRecipe**: Callback fired with recipeId.
7. **Clicking clear all calls onClearAll**: Callback fired.
8. **Collapsed state hides body**: Only header visible when collapsed.

### Files Changed

| File | Action | Description |
|---|---|---|
| `src/ui/svelte/util/shoppingListAggregator.js` | NEW | Pure aggregation function for shopping list materials |
| `src/ui/svelte/apps/ShoppingListPanel.svelte` | NEW | Collapsible shopping list panel component |
| `src/ui/svelte/stores/craftingStore.js` | MODIFY | Add shoppingList writable, actions, and aggregation in refresh() |
| `src/ui/svelte/apps/CraftingAppRoot.svelte` | MODIFY | Wire ShoppingListPanel between RunSummary and recipe list |
| `src/ui/svelte/apps/RecipeCard.svelte` | MODIFY | Add shopping cart button |
| `src/ui/svelte/apps/RecipeList.svelte` | MODIFY | Forward onAddToShoppingList prop to RecipeCard |
| `lang/en.json` | MODIFY | Add 14 shopping list localization keys |
| `styles/fabricate.css` | MODIFY | Add shopping list panel styles |
| `tests/shopping-list-aggregator.test.js` | NEW | 15 aggregation logic tests |
| `tests/stores/crafting-store-shopping.test.js` | NEW | 10 store integration tests |
| `tests/components/shopping-list-panel.test.js` | NEW | 8 component tests |

### Acceptance Criteria Mapping

| AC | How Satisfied |
|---|---|
| AC1: Users can add/remove recipes to shopping list from browse/detail UI | `addToShoppingList` action on RecipeCard cart button; `removeFromShoppingList` and quantity controls in ShoppingListPanel |
| AC2: Shopping list aggregates required components across all selected recipes | `aggregateShoppingList()` sums `need` values across all entries * quantities, deduplicates by componentId |
| AC3: View displays have, need, missing based on selected component source actors | Materials table shows have/need/missing columns; values derived from `evaluateCraftability()` using current `componentSourceActors` |
| AC4: Duplicate component requirements from multiple recipes merged correctly | `_buildIngredientKey()` deduplicates by componentId/itemUuid/tagKey; tests #4, #6 verify merging |
| AC5: List updates reactively when actors or recipe quantities change | Shopping list aggregation runs inside `refresh()`, which is called on actor changes and quantity updates |
| AC6: Unit tests verify aggregation math, actor-source switching, and empty-list behavior | 33 tests across 3 files: 15 aggregation, 10 store, 8 component |

### Implementation Order for the Implementer

1. `src/ui/svelte/util/shoppingListAggregator.js` -- pure aggregation function (no dependencies)
2. `tests/shopping-list-aggregator.test.js` -- write and verify aggregation tests first
3. `src/ui/svelte/stores/craftingStore.js` -- extend with shopping list state and actions
4. `tests/stores/crafting-store-shopping.test.js` -- store integration tests
5. `lang/en.json` -- add localization keys
6. `src/ui/svelte/apps/ShoppingListPanel.svelte` -- create panel component
7. `src/ui/svelte/apps/RecipeCard.svelte` -- add cart button
8. `src/ui/svelte/apps/RecipeList.svelte` -- forward onAddToShoppingList prop
9. `src/ui/svelte/apps/CraftingAppRoot.svelte` -- wire everything together
10. `styles/fabricate.css` -- add shopping list CSS
11. `tests/components/shopping-list-panel.test.js` -- component tests
12. Run `npm test` to verify all tests pass
13. Run `npm run build` to verify no build errors

## T-098b: Apply Release Build from Worktree to Main

### Problem Statement

The T-098 release build implementation was completed and reviewed in a worktree (`agent-afdf909e`) but never merged to the main repo. The main repo is missing `scripts/release.js`, `tests/release-build.test.js`, and 3 npm scripts.

### Implementation Steps

1. **Copy `scripts/release.js`** from `/home/matthew/WebstormProjects/fabricate-v2/.claude/worktrees/agent-afdf909e/scripts/release.js` to `/home/matthew/WebstormProjects/fabricate-v2/scripts/release.js`

2. **Copy `tests/release-build.test.js`** from `/home/matthew/WebstormProjects/fabricate-v2/.claude/worktrees/agent-afdf909e/tests/release-build.test.js` to `/home/matthew/WebstormProjects/fabricate-v2/tests/release-build.test.js`

3. **Add 3 npm scripts to `/home/matthew/WebstormProjects/fabricate-v2/package.json`** -- add after the existing `"test"` script entry:
   - `"release": "node scripts/release.js"`
   - `"release:build": "node scripts/release.js --no-zip"`
   - `"release:validate": "node scripts/release.js --validate-only"`

4. **Run release tests**: `node --test tests/release-build.test.js`

5. **Run full test suite**: `cd /home/matthew/WebstormProjects/fabricate-v2 && npm test`

### Notes

- The `scripts/` directory already exists (empty). No need to create it.
- The main repo's `package.json` has more devDependencies (svelte, happy-dom) and a different `test` script glob than the worktree -- only add the 3 release scripts, do NOT change anything else.
- The files should be copied verbatim -- no modifications needed.
