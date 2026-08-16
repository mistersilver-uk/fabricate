/**
 * Issue 917 — the crafting READ side's step scoping and shared essence pool.
 *
 * Three things are pinned here:
 *
 *  1. `CraftingListingBuilder` names the step an actor's run is actually parked on.
 *     The projection was hard-pinned to step 0 for every mode, so a player with a run
 *     on step 2 saw a step-0 requirement rail driving a step-2 craft. The rail stays
 *     step-0 (a routed/progressive recipe surfaces no `steps[]` to move it to), but
 *     the model now NAMES both steps plus the armed-time-gate state, which is what
 *     lets the UI render read-only instead of lying.
 *  2. The `stepRecipeView` module the builder and `CraftingEngine` now share: the
 *     tool-id union, and the two rules that make step/set resolution safe.
 *  3. `Fabricate#evaluateSelectedSet`'s stepped-recipe regression — it read
 *     `recipe.ingredientSets`, which is EMPTY for every explicit multi-step recipe, so
 *     it returned null and the issue-552 per-group option overrides were silently dead
 *     on stepped recipes. `main.js` cannot be imported (module-level Foundry side
 *     effects), so the behaviour is proven at the extracted seam and the wiring is
 *     pinned by a source contract.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function getProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path)
    .split('.')
    .reduce((value, key) => (value == null ? undefined : value[key]), object);
}

let idCounter = 0;
globalThis.foundry = { utils: { randomID: () => `id-${++idCounter}`, getProperty } };
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
globalThis.game = { user: { isGM: true, name: 'GM' }, fabricate: {}, time: { worldTime: 0 } };

const { Recipe } = await import('../src/models/Recipe.js');
const { RecipeManager } = await import('../src/systems/RecipeManager.js');
const { ResolutionModeService } = await import('../src/systems/ResolutionModeService.js');
const { CraftingListingBuilder } = await import('../src/systems/CraftingListingBuilder.js');
const { activeRunStepState, buildStepRecipeView, resolveStepIngredientSet } = await import(
  '../src/systems/stepRecipeView.js'
);

const MAIN_SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../src/main.js'),
  'utf8'
);

// ---------------------------------------------------------------------------
// Fixtures — a two-step forge recipe whose FIRST step is essence-funded
// ---------------------------------------------------------------------------

const EMBER_ESSENCE = { id: 'ember', name: 'Ember', icon: 'fa-fire' };

function heldEmberwood(quantity = 3) {
  const scopes = { fabricate: { fabricate: { essences: { ember: 2 } }, essences: { ember: 2 } } };
  return {
    id: 'held-emberwood',
    uuid: 'Item.emberwood',
    name: 'Emberwood',
    img: 'icons/emberwood.webp',
    system: { quantity },
    getFlag: (scope, key) =>
      String(key)
        .split('.')
        .reduce((value, part) => (value == null ? undefined : value[part]), scopes[scope]),
  };
}

function forgeSystem() {
  return {
    id: 'sys-forge',
    name: 'Forge',
    resolutionMode: 'simple',
    features: { essences: true, multiStepRecipes: true, craftingChecks: false },
    requirements: { time: { enabled: true } },
    craftingCheck: { enabled: false, simple: { rollFormula: '', dc: 10 }, routed: {}, progressive: {} },
    components: [{ id: 'c-plank', name: 'Plank' }],
    essenceDefinitions: [EMBER_ESSENCE],
  };
}

function forgeRecipe() {
  return new Recipe({
    id: 'recipe-forge',
    name: 'Forge Blade',
    craftingSystemId: 'sys-forge',
    ingredientSets: [],
    resultGroups: [],
    steps: [
      {
        id: 'step-1',
        name: 'Temper',
        ingredientSets: [
          {
            id: 'set-1',
            ingredientGroups: [
              { id: 'g-ember', options: [{ quantity: 1, match: { type: 'essence', essenceId: 'ember', amount: 2 } }] },
            ],
          },
        ],
        resultGroups: [{ id: 'rg-1', results: [{ componentId: 'c-plank', quantity: 1 }] }],
      },
      {
        id: 'step-2',
        name: 'Quench',
        ingredientSets: [{ id: 'set-2', ingredientGroups: [] }],
        resultGroups: [{ id: 'rg-2', results: [{ componentId: 'c-plank', quantity: 1 }] }],
      },
    ],
  });
}

/** A run-manager stand-in exposing only the synchronous seam the builder reads. */
function runManagerAt(run) {
  return { findActiveRunForRecipe: () => run };
}

function buildRecipeModel({ recipe = forgeRecipe(), craftingRunManager = null, access = null } = {}) {
  const system = forgeSystem();
  const craftingSystemManager = {
    getSystem: (id) => (id === system.id ? system : null),
    getRecipeItemDefinition: () => null,
  };
  globalThis.game = {
    user: { isGM: false, name: 'Player' },
    fabricate: { getCraftingSystemManager: () => craftingSystemManager },
    time: { worldTime: 0 },
  };
  const builder = new CraftingListingBuilder({
    recipeManager: new RecipeManager(),
    recipeVisibility: {
      getVisibleRecipes: () => [{ recipe, access: access ?? { reason: 'ok', visible: true } }],
      isKnowledgeItemExhausted: () => false,
    },
    resolutionModeService: new ResolutionModeService(craftingSystemManager),
    craftingSystemManager,
    craftingRunManager,
    localize: (key) => key,
  });
  const actor = { id: 'actor-1', items: [heldEmberwood()] };
  // The rich model is the DETAIL phase's output since issue 1075; `buildListing` returns
  // cheap summaries carrying no essence pool at all.
  return builder.buildRecipeDetail({
    recipe,
    access: access ?? { reason: 'ok', visible: true },
    craftingActor: actor,
    viewer: { isGM: false },
  });
}

// ---------------------------------------------------------------------------
// 1. activeRunStepState — the shared synchronous run read
// ---------------------------------------------------------------------------

test('activeRunStepState reports step 0 with no run manager, no actor, or no active run', () => {
  const actor = { id: 'a' };
  assert.deepEqual(activeRunStepState(null, actor, 'r'), { index: 0, timeGateArmed: false });
  assert.deepEqual(activeRunStepState(runManagerAt(null), actor, 'r'), {
    index: 0,
    timeGateArmed: false,
  });
  assert.deepEqual(activeRunStepState(runManagerAt({ currentStepIndex: 3 }), null, 'r'), {
    index: 0,
    timeGateArmed: false,
  });
});

test('activeRunStepState reports the run index and whether that step gate is armed', () => {
  const run = { currentStepIndex: 1, steps: [{}, { timeGate: { availableAt: 500 } }] };
  assert.deepEqual(activeRunStepState(runManagerAt(run), { id: 'a' }, 'r'), {
    index: 1,
    timeGateArmed: true,
  });
  const unarmed = { currentStepIndex: 1, steps: [{ timeGate: { availableAt: 5 } }, {}] };
  assert.deepEqual(activeRunStepState(runManagerAt(unarmed), { id: 'a' }, 'r'), {
    index: 1,
    timeGateArmed: false,
  });
});

test('activeRunStepState falls back to step 0 for a non-finite or negative run index', () => {
  for (const currentStepIndex of [undefined, Number.NaN, -2, 'x']) {
    assert.equal(activeRunStepState(runManagerAt({ currentStepIndex }), { id: 'a' }, 'r').index, 0);
  }
});

// ---------------------------------------------------------------------------
// 2. The shared step view + step/set resolution rules
// ---------------------------------------------------------------------------

test('buildStepRecipeView unions recipe and step tool ids rather than falling back', () => {
  const view = buildStepRecipeView(
    { toolIds: ['t-recipe'], ingredientSets: [{ id: 'r-set' }], resultGroups: [{ id: 'r-rg' }] },
    { toolIds: ['t-step'], ingredientSets: [{ id: 's-set' }], resultGroups: [{ id: 's-rg' }] }
  );
  assert.deepEqual(view.toolIds, ['t-recipe', 't-step']);
  assert.deepEqual(view.ingredientSets, [{ id: 's-set' }]);
  assert.deepEqual(view.resultGroups, [{ id: 's-rg' }]);
});

test('buildStepRecipeView falls back to the recipe arrays when no step is supplied', () => {
  const view = buildStepRecipeView({ ingredientSets: [{ id: 'r-set' }], toolIds: ['t'] }, null);
  assert.deepEqual(view.ingredientSets, [{ id: 'r-set' }]);
  assert.deepEqual(view.resultGroups, [], 'an absent recipe array normalizes to empty');
  assert.deepEqual(view.toolIds, ['t']);
});

test('resolveStepIngredientSet resolves inside the named step', () => {
  const steps = forgeRecipe().getExecutionSteps();
  const resolved = resolveStepIngredientSet({ steps, stepId: 'step-1', setId: 'set-1' });
  assert.equal(resolved.step.id, 'step-1');
  assert.equal(resolved.set.id, 'set-1');
});

test('resolveStepIngredientSet uses the ACTIVE step when no stepId is supplied', () => {
  const steps = forgeRecipe().getExecutionSteps();
  const resolved = resolveStepIngredientSet({ steps, activeStepIndex: 1, setId: 'set-2' });
  assert.equal(resolved.step.id, 'step-2', 'never step 0');
  assert.equal(resolved.set.id, 'set-2');
});

test('resolveStepIngredientSet never scans across steps for a matching set id', () => {
  const steps = forgeRecipe().getExecutionSteps();
  // Set ids are `randomID()`, so a cross-step scan would silently evaluate the wrong
  // step's requirements. Both directions must come back empty-handed instead.
  assert.equal(resolveStepIngredientSet({ steps, stepId: 'step-1', setId: 'set-2' }), null);
  assert.equal(resolveStepIngredientSet({ steps, activeStepIndex: 1, setId: 'set-1' }), null);
});

test('resolveStepIngredientSet returns null for an unknown step or an empty recipe', () => {
  const steps = forgeRecipe().getExecutionSteps();
  assert.equal(resolveStepIngredientSet({ steps, stepId: 'step-9', setId: 'set-1' }), null);
  assert.equal(resolveStepIngredientSet({ steps: [], setId: 'set-1' }), null);
});

// ---------------------------------------------------------------------------
// 3. The builder names the active step
// ---------------------------------------------------------------------------

test('with no active run the displayed step IS the active step (today behaviour)', () => {
  const model = buildRecipeModel({ craftingRunManager: runManagerAt(null) });
  assert.equal(model.activeStepIndex, 0);
  assert.equal(model.activeStepId, 'step-1');
  assert.equal(model.displayedStepId, 'step-1');
  assert.equal(model.activeStepTimeGateArmed, false);
});

test('with no run manager injected at all the projection stays pinned to step 0', () => {
  const model = buildRecipeModel();
  assert.equal(model.activeStepIndex, 0);
  assert.equal(model.activeStepId, model.displayedStepId);
});

test('a run parked on a later step names that step while the rail still shows step 0', () => {
  const model = buildRecipeModel({
    craftingRunManager: runManagerAt({ currentStepIndex: 1, steps: [{}, {}] }),
  });
  assert.equal(model.activeStepIndex, 1);
  assert.equal(model.activeStepId, 'step-2', 'the engine would craft step 2');
  assert.equal(model.displayedStepId, 'step-1', 'the projected rail is still step 1');
  assert.notEqual(model.activeStepId, model.displayedStepId, 'so the rail must render read-only');
});

test('an armed time gate on the active step is surfaced so the rail can lock', () => {
  const model = buildRecipeModel({
    craftingRunManager: runManagerAt({
      currentStepIndex: 0,
      steps: [{ timeGate: { availableAt: 900 } }],
    }),
  });
  assert.equal(model.activeStepId, model.displayedStepId, 'the displayed step IS the active one');
  assert.equal(
    model.activeStepTimeGateArmed,
    true,
    'but its inputs were consumed at START, so the rail is still read-only'
  );
});

test('a run left pointing past the end of the recipe names no active step', () => {
  const model = buildRecipeModel({
    craftingRunManager: runManagerAt({ currentStepIndex: 7, steps: [] }),
  });
  assert.equal(model.activeStepId, null, 'nothing the player sees drives a craft');
  assert.notEqual(model.activeStepId, model.displayedStepId);
});

test('a redacted teaser exposes no step structure', () => {
  const model = buildRecipeModel({
    access: { reason: 'teaser', visible: true, teaserState: { hiddenFields: ['ingredients'] } },
    craftingRunManager: runManagerAt({ currentStepIndex: 1, steps: [{}, {}] }),
  });
  assert.equal(model.browseStatus, 'discovery');
  assert.equal(model.activeStepId, null);
  assert.equal(model.displayedStepId, null);
  assert.equal(model.activeStepIndex, 0);
  assert.equal(model.activeStepTimeGateArmed, false);
});

// ---------------------------------------------------------------------------
// 4. The essence pool reaches the per-set craftability the rail renders
// ---------------------------------------------------------------------------

test('the first step set carries the shared essence pool the rail edits', () => {
  const model = buildRecipeModel({ craftingRunManager: runManagerAt(null) });
  const pool = model.ingredientSets[0].craftability.essencePool;
  assert.ok(pool, 'the projection surfaces the pool for an essence-funded set');
  assert.equal(pool.scopeKey, 'set-1');
  assert.equal(pool.requirements.length, 1);
  assert.equal(pool.requirements[0].essenceId, 'ember');
  assert.equal(pool.requirements[0].need, 2);
  assert.equal(pool.requirements[0].delivered, 2, 'the tile shows what the plan draws');
  assert.equal(pool.carriers.length, 1, 'the held Emberwood is the funding carrier');
  assert.equal(pool.carriers[0].itemKey, 'Item.emberwood');
  assert.equal(pool.carriers[0].allocatedUnits, 1);
});

// ---------------------------------------------------------------------------
// 5. evaluateSelectedSet — the stepped-recipe regression
// ---------------------------------------------------------------------------

test('a stepped recipe has NO top-level ingredient sets, which is what broke evaluateSelectedSet', () => {
  const recipe = forgeRecipe();
  assert.deepEqual(recipe.ingredientSets, [], 'the old top-level scan could only return null here');
  assert.equal(recipe.getExecutionSteps().length, 2, 'the sets live on the steps instead');
});

test('the extracted seam re-evaluates a stepped recipe set with option overrides applied', () => {
  const system = forgeSystem();
  const craftingSystemManager = { getSystem: (id) => (id === system.id ? system : null) };
  globalThis.game = {
    user: { isGM: true },
    fabricate: { getCraftingSystemManager: () => craftingSystemManager, getResolutionModeService: () => null },
    time: { worldTime: 0 },
  };
  const recipe = forgeRecipe();
  const service = new ResolutionModeService(craftingSystemManager);

  // Exactly what `Fabricate#evaluateSelectedSet` now does.
  const resolved = resolveStepIngredientSet({
    steps: service.getExecutionSteps(recipe),
    stepId: null,
    activeStepIndex: activeRunStepState(runManagerAt(null), { id: 'a' }, recipe.id).index,
    setId: 'set-1',
  });
  assert.ok(resolved, 'the stepped set resolves where the top-level scan found nothing');

  const singleSetRecipe = {
    ...buildStepRecipeView(recipe, resolved.step),
    ingredientSets: [resolved.set],
  };
  const craftability = new RecipeManager().evaluateCraftability(
    [{ items: [heldEmberwood()] }],
    singleSetRecipe,
    { craftingActor: null, optionOverrides: null, essenceAllocation: null }
  );
  assert.equal(craftability.canCraft, true, 'a real craftability comes back, not null');
  assert.ok(craftability.essencePool, 'and it carries the pool the rail re-renders');
});

test('a supplied allocation flows through the same seam and steers the pool', () => {
  const system = forgeSystem();
  const craftingSystemManager = { getSystem: (id) => (id === system.id ? system : null) };
  globalThis.game = {
    user: { isGM: true },
    fabricate: { getCraftingSystemManager: () => craftingSystemManager, getResolutionModeService: () => null },
    time: { worldTime: 0 },
  };
  const recipe = forgeRecipe();
  const resolved = resolveStepIngredientSet({
    steps: recipe.getExecutionSteps(),
    stepId: 'step-1',
    setId: 'set-1',
  });
  const craftability = new RecipeManager().evaluateCraftability(
    [{ items: [heldEmberwood()] }],
    { ...buildStepRecipeView(recipe, resolved.step), ingredientSets: [resolved.set] },
    { craftingActor: null, essenceAllocation: {} }
  );
  assert.equal(craftability.canCraft, false, 'allocating nothing is honoured, never topped up');
  assert.equal(craftability.essencePool.requirements[0].delivered, 0);
});

// ---------------------------------------------------------------------------
// 6. Source contract — the facade is actually wired to the seam above
// ---------------------------------------------------------------------------

test('src/main.js resolves evaluateSelectedSet through the execution steps', () => {
  const body = MAIN_SOURCE.slice(
    MAIN_SOURCE.indexOf('evaluateSelectedSet({'),
    MAIN_SOURCE.indexOf('_getAlchemyListingBuilder()')
  );
  assert.ok(body.length > 0, 'the facade method was located');
  assert.ok(
    body.includes('resolveStepIngredientSet({'),
    'the step/set resolution runs through the shared helper'
  );
  assert.ok(body.includes('getExecutionSteps?.(recipe)'), 'the steps are the resolution source');
  assert.ok(body.includes('activeRunStepState('), 'the active step decides when stepId is absent');
  assert.ok(body.includes('buildStepRecipeView(recipe, resolved.step)'), 'the step tool union applies');
  assert.ok(body.includes('essenceAllocation,'), 'the allocation is threaded to craftability');
  assert.ok(
    !body.includes('recipe.ingredientSets.find'),
    'the top-level scan that returned null for every stepped recipe is gone'
  );
});

test('src/main.js wires the run manager into the crafting listing builder and craftRecipe', () => {
  assert.ok(
    MAIN_SOURCE.includes('craftingRunManager: this.craftingRunManager,'),
    'the builder receives the run manager as a constructor dependency'
  );
  assert.ok(
    MAIN_SOURCE.includes('ingredientEssenceAllocation,'),
    'craftRecipe forwards the scoped allocation payload to the engine'
  );
});
