/**
 * Integration tests for T-026: End-to-End Crafting Flow
 *
 * Tests the full crafting pipeline: validate, consume, create result.
 * Covers specs 004 (resolution modes) and 005 (recipes and steps).
 *
 * Groups:
 *   1. Simple mode — validate, consume, create result
 *   2. Multi-step — start, advance, complete
 *   3. Routed check — check macro returns outcome, name-matched to a result group
 *   4. Progressive mode — check macro returns value, awards based on difficulty
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import { ResolutionModeService } from '../src/systems/ResolutionModeService.js';

// ---------------------------------------------------------------------------
// Globals required for the modules to load
// ---------------------------------------------------------------------------

function getProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path)
    .split('.')
    .reduce((value, key) => (value == null ? undefined : value[key]), object);
}

globalThis.foundry = { utils: { getProperty, setProperty: () => {} } };
globalThis.ui = {
  notifications: { info: () => {}, warn: () => {}, error: () => {} }
};

// ---------------------------------------------------------------------------
// Shared builder helpers
// ---------------------------------------------------------------------------

/**
 * Build a fake actor item that tracks delete() and update() calls.
 */
function makeItem({ id, name = `Item ${id}`, quantity = 1, sourceUuid = null } = {}) {
  return {
    id,
    uuid: `Item.${id}`,
    name,
    sourceUuid,
    parent: null,
    system: { quantity },
    effects: [],
    deleteCalled: false,
    updateCalled: false,
    updatePayloads: [],
    async delete() {
      this.deleteCalled = true;
      this.system.quantity = 0;
    },
    async update(payload) {
      this.updateCalled = true;
      this.updatePayloads.push(payload);
      if (payload['system.quantity'] !== undefined) {
        this.system.quantity = payload['system.quantity'];
      }
    }
  };
}

/**
 * Build a fake compendium/world item (source item) with toObject() as CraftingEngine expects.
 */
function makeSourceItem(name, opts = {}) {
  const data = {
    name,
    img: opts.img || 'icons/svg/item-bag.svg',
    type: opts.type || 'loot',
    system: { quantity: opts.quantity || 1, ...(opts.system || {}) },
    effects: []
  };
  return {
    ...data,
    toObject() { return { ...data, system: { ...data.system } }; }
  };
}

/**
 * Build a fake actor with a given items array.
 * createEmbeddedDocuments records all created items and returns stubs.
 */
function makeActor({ id = 'actor-1', items = [] } = {}) {
  const createdItems = [];
  return {
    id,
    uuid: `Actor.${id}`,
    name: `Actor ${id}`,
    items,
    createdItems,
    async createEmbeddedDocuments(_type, itemDatas) {
      const stubs = (itemDatas || []).map((d, i) => ({
        id: `created-item-${createdItems.length + i}`,
        uuid: `Item.created-item-${createdItems.length + i}`,
        name: d.name || 'Created Item',
        system: { quantity: d.system?.quantity || 1 }
      }));
      createdItems.push(...stubs);
      return stubs;
    }
  };
}

/**
 * Build an ingredient set that matches a specific item by id.
 */
function makeIngredientSet({ id = 'set-1', ingredientItem, quantity = 1 } = {}) {
  const ingredient = {
    systemItemId: ingredientItem.id,
    quantity,
    getDescription: () => `${quantity}x ${ingredientItem.name}`
  };
  return {
    id,
    ingredientGroups: [{ options: [{ componentId: ingredientItem.id, quantity }] }],
    matchIngredients(availableItems, matcher) {
      const matched = availableItems.find(i => matcher(ingredient, i));
      if (!matched) return [];
      return [{ item: matched, quantity, ingredient }];
    }
  };
}

/**
 * Build a minimal duck-typed recipe for CraftingEngine.
 * When steps is provided, recipe.getExecutionSteps() returns them.
 */
function makeRecipe({
  id = 'recipe-1',
  name = 'Test Recipe',
  craftingSystemId = 'sys-1',
  ingredientSets = [],
  resultGroups = [],
  outcomeRouting = null,
  resultSelection = null,
  steps = null
} = {}) {
  const recipe = {
    id,
    name,
    craftingSystemId,
    ingredientSets,
    resultGroups,
    outcomeRouting,
    resultSelection,
    transferEffects: false,
    validate() { return { valid: true, errors: [] }; },
    toJSON() { return { id: this.id, name: this.name, craftingSystemId: this.craftingSystemId }; }
  };
  recipe.getExecutionSteps = steps !== null ? () => steps : null;
  return recipe;
}

/**
 * Build a crafting system config.
 */
function makeSystem({
  id = 'sys-1',
  resolutionMode = 'simple',
  craftingCheck = null,
  managedItems = [],
  features = {}
} = {}) {
  const sys = {
    id,
    resolutionMode,
    features: { multiStepRecipes: false, craftingChecks: false, essences: false, ...features },
    craftingCheck: craftingCheck || {
      enabled: false,
      macroUuid: null,
      successMacroUuid: null,
      failureMacroUuid: null,
      outcomes: [],
      progressive: null,
      consumption: { consumeIngredientsOnFail: true, consumeCatalystsOnFail: false }
    },
    managedItems,
    components: managedItems
  };
  return sys;
}

/**
 * Build a ResolutionModeService wired to a specific system.
 */
function makeResolutionService(system) {
  const craftingSystemManager = {
    getSystem: (id) => (system && id === system.id ? system : null)
  };
  return new ResolutionModeService(craftingSystemManager);
}

/**
 * Build a RecipeManager mock that uses item identity (by id) for ingredient matching.
 */
function makeRecipeManager({ ingredientItem, toolItem = null, toolModel = null, ingredientSet } = {}) {
  return {
    canCraft(_actors, _recipe) {
      return { canCraft: true, satisfiableSet: ingredientSet, missing: { ingredients: [], essences: [] } };
    },
    getToolsForSet(_recipe, _set) {
      return toolModel ? [toolModel] : [];
    },
    toolMatchesItem(_recipe, _tool, item) {
      return toolItem ? item === toolItem : false;
    },
    ingredientMatchesItem(_recipe, ingredient, item) {
      return item === ingredientItem && item.id === ingredient.systemItemId;
    }
  };
}

/**
 * Set globalThis.game with a system configuration.
 */
function setupGame(system) {
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => ({
        getSystem: (id) => (system && id === system.id ? system : null)
      }),
      getResolutionModeService: () => null,
      getRecipeVisibilityService: () => null
    },
    user: { id: 'user-gm', isGM: true },
    time: { worldTime: 1000 }
  };
}

// ===========================================================================
// Group 1: Simple mode — validate, consume, create result
// ===========================================================================

test('simple mode: successful craft consumes ingredient and creates result item', async () => {
  const system = makeSystem({
    id: 'sys-1',
    resolutionMode: 'simple',
    managedItems: [{ id: 'comp-potion', sourceUuid: 'uuid:potion', difficulty: 1 }]
  });
  setupGame(system);

  const potionSource = makeSourceItem('Potion');
  globalThis.fromUuid = async (uuid) => uuid === 'uuid:potion' ? potionSource : null;

  const herb = makeItem({ id: 'herb-1', name: 'Herb', quantity: 2 });
  const ingredientSet = makeIngredientSet({ ingredientItem: herb, quantity: 1 });

  const recipe = makeRecipe({
    craftingSystemId: 'sys-1',
    ingredientSets: [ingredientSet],
    resultGroups: [{ id: 'rg-1', results: [{ id: 'r-1', componentId: 'comp-potion', quantity: 1 }] }]
  });

  const sourceActor = makeActor({ id: 'a1', items: [herb] });
  const craftingActor = makeActor({ id: 'a1' });

  const resolutionService = makeResolutionService(system);
  const recipeManager = makeRecipeManager({ ingredientItem: herb, ingredientSet });
  const engine = new CraftingEngine(recipeManager, null, resolutionService);
  engine._runCraftingCheck = async () => ({ success: true, outcome: null, value: null, data: {} });
  engine._runSuccessMacro = async () => {};
  engine._runFailureMacro = async () => {};

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result.success, true, 'craft should succeed');
  assert.ok(result.message.includes(recipe.name), 'message should reference recipe name');

  // Ingredient consumed: quantity was 2, requested 1, so update to 1
  assert.equal(herb.updateCalled, true, 'ingredient should have been consumed via update');
  assert.equal(herb.system.quantity, 1, 'ingredient quantity should be reduced by 1');
  assert.equal(herb.deleteCalled, false, 'ingredient should not be deleted when quantity > requested');

  // Result item created on craftingActor
  assert.equal(craftingActor.createdItems.length, 1, 'one result item should be created');
  assert.equal(craftingActor.createdItems[0].name, 'Potion', 'created item should be named Potion');
});

test('simple mode: returns failure when ingredient is missing', async () => {
  const system = makeSystem({ id: 'sys-1', resolutionMode: 'simple' });
  setupGame(system);
  globalThis.fromUuid = async () => null;

  const herb = makeItem({ id: 'herb-1', name: 'Herb', quantity: 1 });
  const ingredientSet = makeIngredientSet({ ingredientItem: herb, quantity: 1 });
  const recipe = makeRecipe({
    craftingSystemId: 'sys-1',
    ingredientSets: [ingredientSet],
    resultGroups: [{ id: 'rg-1', results: [] }]
  });

  const craftingActor = makeActor({ id: 'a1' });
  const sourceActor = makeActor({ id: 'a1', items: [] }); // no ingredients

  const recipeManager = {
    canCraft() {
      return {
        canCraft: false,
        satisfiableSet: null,
        missing: {
          ingredients: [{ ingredient: { getDescription: () => '1x Herb' }, have: 0, need: 1 }],
          essences: [],
        }
      };
    },
    ingredientMatchesItem: () => false
  };

  const resolutionService = makeResolutionService(system);
  const engine = new CraftingEngine(recipeManager, null, resolutionService);

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result.success, false, 'craft should fail when ingredient is missing');
  assert.match(result.message, /Missing required items/i);
  assert.equal(craftingActor.createdItems.length, 0, 'no items should be created on failure');
  assert.equal(herb.deleteCalled, false, 'ingredient should not be consumed when missing');
});

test('simple mode: exact quantity match deletes ingredient item', async () => {
  const system = makeSystem({
    id: 'sys-1',
    resolutionMode: 'simple',
    managedItems: [{ id: 'comp-potion', sourceUuid: 'uuid:potion', difficulty: 1 }]
  });
  setupGame(system);

  const potionSource = makeSourceItem('Potion');
  globalThis.fromUuid = async (uuid) => uuid === 'uuid:potion' ? potionSource : null;

  const herb = makeItem({ id: 'herb-exact', name: 'Herb', quantity: 1 });
  const ingredientSet = makeIngredientSet({ ingredientItem: herb, quantity: 1 });

  const recipe = makeRecipe({
    craftingSystemId: 'sys-1',
    ingredientSets: [ingredientSet],
    resultGroups: [{ id: 'rg-1', results: [{ id: 'r-1', componentId: 'comp-potion', quantity: 1 }] }]
  });

  const sourceActor = makeActor({ id: 'a1', items: [herb] });
  const craftingActor = makeActor({ id: 'a1' });

  const recipeManager = makeRecipeManager({ ingredientItem: herb, ingredientSet });
  const resolutionService = makeResolutionService(system);
  const engine = new CraftingEngine(recipeManager, null, resolutionService);
  engine._runCraftingCheck = async () => ({ success: true, outcome: null, value: null, data: {} });
  engine._runSuccessMacro = async () => {};
  engine._runFailureMacro = async () => {};

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result.success, true, 'craft should succeed');
  // quantity was 1, required 1 → delete, not update
  assert.equal(herb.deleteCalled, true, 'ingredient with exact quantity should be deleted');
  assert.equal(herb.updateCalled, false, 'ingredient should not be updated when deleted');
});

// ===========================================================================
// Group 2: Multi-step — start, advance, complete
// ===========================================================================

/**
 * Build a minimal CraftingRunManager for multi-step tests.
 * Tracks a single run through its lifecycle.
 * @param {number} totalSteps - total number of steps in the recipe
 */
function makeRunManager(totalSteps = 2) {
  let runStore = null;
  return {
    get storedRun() { return runStore; },
    getActiveRun(_actor, runId) {
      return runStore && runStore.id === runId ? runStore : null;
    },
    findActiveRunForRecipe(_actor, _recipeId) {
      return runStore && runStore.status === 'inProgress' ? runStore : null;
    },
    async createRun(_actor, recipe) {
      runStore = {
        id: 'run-1',
        recipeId: recipe.id,
        status: 'inProgress',
        currentStepIndex: 0,
        steps: [],
        startedAt: 1000,
        finishedAt: null
      };
      return runStore;
    },
    canProceedTimeGate() { return true; },
    async markStepWaitingForTime(_actor, run) { return run; },
    async markStepInProgress(_actor, run) { return run; },
    async completeStepSuccess(_actor, run, stepIndex, _data) {
      run.steps[stepIndex] = { stepName: `Step ${stepIndex + 1}`, status: 'succeeded' };
      if (stepIndex >= totalSteps - 1) {
        run.status = 'succeeded';
        run.finishedAt = 2000;
      } else {
        run.currentStepIndex = stepIndex + 1;
      }
      return run;
    },
    async completeStepFailure(_actor, run, stepIndex, reason) {
      run.steps[stepIndex] = { status: 'failed', failureReason: reason };
      run.status = 'failed';
      run.finishedAt = 2000;
      return run;
    }
  };
}

test('multi-step: craft() advances through two steps to completion', async () => {
  const system = makeSystem({
    id: 'sys-1',
    resolutionMode: 'simple',
    managedItems: [
      { id: 'comp-extract', sourceUuid: 'uuid:extract', difficulty: 1 },
      { id: 'comp-ingot', sourceUuid: 'uuid:ingot', difficulty: 1 }
    ]
  });
  setupGame(system);

  const extractSource = makeSourceItem('Extract');
  const ingotSource = makeSourceItem('Ingot');
  globalThis.fromUuid = async (uuid) => {
    if (uuid === 'uuid:extract') return extractSource;
    if (uuid === 'uuid:ingot') return ingotSource;
    return null;
  };

  const herb = makeItem({ id: 'herb-ms', name: 'Herb', quantity: 3 });
  const ore = makeItem({ id: 'ore-ms', name: 'Ore', quantity: 2 });

  const set1 = makeIngredientSet({ id: 'set-step1', ingredientItem: herb, quantity: 1 });
  const set2 = makeIngredientSet({ id: 'set-step2', ingredientItem: ore, quantity: 1 });

  const steps = [
    {
      id: 'step-1', name: 'Step 1',
      ingredientSets: [set1],
      resultGroups: [{ id: 'rg-s1', results: [{ id: 'r-s1', componentId: 'comp-extract', quantity: 1 }] }], outcomeRouting: null, timeRequirement: null
    },
    {
      id: 'step-2', name: 'Step 2',
      ingredientSets: [set2],
      resultGroups: [{ id: 'rg-s2', results: [{ id: 'r-s2', componentId: 'comp-ingot', quantity: 1 }] }], outcomeRouting: null, timeRequirement: null
    }
  ];

  const recipe = makeRecipe({ craftingSystemId: 'sys-1', steps });

  const sourceActor = makeActor({ id: 'a-ms', items: [herb, ore] });
  const craftingActor = makeActor({ id: 'a-ms' });

  const runManager = makeRunManager(2);

  const recipeManager = {
    canCraft(_actors, executionRecipe) {
      const currentSets = executionRecipe.ingredientSets || [];
      if (currentSets.some(s => s.id === 'set-step1')) {
        return { canCraft: true, satisfiableSet: set1, missing: { ingredients: [], essences: [] } };
      }
      if (currentSets.some(s => s.id === 'set-step2')) {
        return { canCraft: true, satisfiableSet: set2, missing: { ingredients: [], essences: [] } };
      }
      return { canCraft: false, satisfiableSet: null, missing: { ingredients: [{ ingredient: { getDescription: () => 'Item' }, have: 0, need: 1 }], essences: [] } };
    },
    ingredientMatchesItem(_recipe, ingredient, item) { return item.id === ingredient.systemItemId; }
  };

  const resolutionService = makeResolutionService(system);
  const engine = new CraftingEngine(recipeManager, runManager, resolutionService);
  engine._runCraftingCheck = async () => ({ success: true, outcome: null, value: null, data: {} });
  engine._runSuccessMacro = async () => {};
  engine._runFailureMacro = async () => {};

  // Step 1: craft creates the run and executes step 0
  const result1 = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result1.success, true, 'step 1 should succeed');
  assert.equal(runManager.storedRun.currentStepIndex, 1, 'run should advance to step index 1 after step 1');
  assert.equal(runManager.storedRun.status, 'inProgress', 'run should still be inProgress after step 1');
  assert.ok(herb.updateCalled || herb.deleteCalled, 'herb should be consumed in step 1');

  // Step 2: craft resumes existing run and executes step 1
  const result2 = await engine.craft(craftingActor, [sourceActor], recipe, null, { runId: 'run-1' });

  assert.equal(result2.success, true, 'step 2 should succeed');
  assert.equal(runManager.storedRun.status, 'succeeded', 'run should be succeeded after final step');
  assert.ok(ore.updateCalled || ore.deleteCalled, 'ore should be consumed in step 2');

  // Both steps created result items
  assert.ok(craftingActor.createdItems.length >= 2, 'result items created across both steps');
});

test('multi-step: craft() returns failure when step ingredient is insufficient', async () => {
  const system = makeSystem({ id: 'sys-1', resolutionMode: 'simple' });
  setupGame(system);
  globalThis.fromUuid = async () => null;

  const herb = makeItem({ id: 'herb-insuf', name: 'Herb', quantity: 1 });
  const set1 = makeIngredientSet({ id: 'set-step1', ingredientItem: herb, quantity: 2 });

  const steps = [{
    id: 'step-1', name: 'Step 1',
    ingredientSets: [set1],
    resultGroups: [{ id: 'rg-s1', results: [] }], outcomeRouting: null, timeRequirement: null
  }];

  const recipe = makeRecipe({ craftingSystemId: 'sys-1', steps });
  const craftingActor = makeActor({ id: 'a-insuf' });
  const sourceActor = makeActor({ id: 'a-insuf', items: [herb] });

  const recipeManager = {
    canCraft() {
      return {
        canCraft: false,
        satisfiableSet: null,
        missing: {
          ingredients: [{ ingredient: { getDescription: () => '2x Herb' }, have: 1, need: 2 }],
          essences: [],
        }
      };
    },
    ingredientMatchesItem: () => false
  };

  const resolutionService = makeResolutionService(system);
  const engine = new CraftingEngine(recipeManager, null, resolutionService);

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result.success, false, 'craft should fail when step ingredient is insufficient');
  assert.match(result.message, /Missing required items/i);
});

// ===========================================================================
// Group 3: Routed check — check macro returns outcome, name-matched to a result group
// ===========================================================================

function makeLegacyOutcomeRoutingSystem(id = 'sys-legacy-routing') {
  return makeSystem({
    id,
    resolutionMode: 'routed',
    craftingCheck: {
      enabled: true,
      macroUuid: 'macro:check',
      successMacroUuid: null,
      failureMacroUuid: null,
      outcomes: ['critical', 'pass', 'fail'],
      progressive: null,
      consumption: { consumeIngredientsOnFail: false, consumeCatalystsOnFail: false }
    },
    managedItems: [
      { id: 'comp-great-potion', sourceUuid: 'uuid:great-potion', difficulty: 1 },
      { id: 'comp-potion', sourceUuid: 'uuid:potion', difficulty: 1 }
    ]
  });
}

function makeLegacyOutcomeRoutingRecipeFixture(system) {
  const herb = makeItem({ id: 'herb-routing', name: 'Herb', quantity: 5 });
  const ingredientSet = makeIngredientSet({ id: 'set-routing', ingredientItem: herb, quantity: 1 });

  // Canonical routed + check (the 1.4.0 migration output): groups are
  // name-matched against the outcome. The non-reserved outcomes `critical`/`pass`
  // name their groups; the reserved `fail` outcome takes the failure path.
  const step = {
    id: 'step-1', name: 'Step 1',
    ingredientSets: [ingredientSet],
    resultGroups: [
      { id: 'rg-critical', name: 'critical', results: [{ id: 'r-critical', componentId: 'comp-great-potion', quantity: 1 }] },
      { id: 'rg-pass', name: 'pass', results: [{ id: 'r-pass', componentId: 'comp-potion', quantity: 1 }] }
    ],
    resultSelection: { provider: 'check' }, timeRequirement: null
  };

  const recipe = makeRecipe({
    craftingSystemId: system.id,
    resultSelection: { provider: 'check' },
    steps: [step]
  });

  return { herb, ingredientSet, step, recipe };
}

test('routed check: "critical" outcome routes to the critical-named result group', async () => {
  const system = makeLegacyOutcomeRoutingSystem('sys-legacy-routing-1');
  setupGame(system);

  const greatPotionSource = makeSourceItem('Greater Potion');
  const potionSource = makeSourceItem('Potion');
  globalThis.fromUuid = async (uuid) => {
    if (uuid === 'uuid:great-potion') return greatPotionSource;
    if (uuid === 'uuid:potion') return potionSource;
    return null;
  };

  const { herb, ingredientSet, recipe } = makeLegacyOutcomeRoutingRecipeFixture(system);
  const sourceActor = makeActor({ id: 'a-t1', items: [herb] });
  const craftingActor = makeActor({ id: 'a-t1' });

  const recipeManager = makeRecipeManager({ ingredientItem: herb, ingredientSet });
  const resolutionService = makeResolutionService(system);
  const engine = new CraftingEngine(recipeManager, null, resolutionService);
  engine._runCraftingCheck = async () => ({ success: true, outcome: 'critical', value: 20, data: {} });
  engine._runSuccessMacro = async () => {};
  engine._runFailureMacro = async () => {};

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result.success, true, 'routed check craft should succeed');
  assert.equal(craftingActor.createdItems.length, 1, 'exactly one result item created');
  assert.equal(craftingActor.createdItems[0].name, 'Greater Potion', '"critical" outcome routes to Greater Potion');
});

test('routed check: "pass" outcome routes to the pass-named result group', async () => {
  const system = makeLegacyOutcomeRoutingSystem('sys-legacy-routing-2');
  setupGame(system);

  const greatPotionSource = makeSourceItem('Greater Potion');
  const potionSource = makeSourceItem('Potion');
  globalThis.fromUuid = async (uuid) => {
    if (uuid === 'uuid:great-potion') return greatPotionSource;
    if (uuid === 'uuid:potion') return potionSource;
    return null;
  };

  const { herb, ingredientSet, recipe } = makeLegacyOutcomeRoutingRecipeFixture(system);
  // Use a different herb item to avoid state sharing from previous test
  herb.id = 'herb-routing-2';
  herb.system.quantity = 5;
  herb.updateCalled = false;
  herb.deleteCalled = false;

  const sourceActor = makeActor({ id: 'a-t2', items: [herb] });
  const craftingActor = makeActor({ id: 'a-t2' });

  const recipeManager = makeRecipeManager({ ingredientItem: herb, ingredientSet });
  const resolutionService = makeResolutionService(system);
  const engine = new CraftingEngine(recipeManager, null, resolutionService);
  engine._runCraftingCheck = async () => ({ success: true, outcome: 'pass', value: 10, data: {} });
  engine._runSuccessMacro = async () => {};
  engine._runFailureMacro = async () => {};

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result.success, true, 'routed check craft should succeed with "pass" outcome');
  assert.equal(craftingActor.createdItems.length, 1, 'exactly one result item created');
  assert.equal(craftingActor.createdItems[0].name, 'Potion', '"pass" outcome routes to normal Potion');
});

test('routed check: check failure returns failure without creating results', async () => {
  const system = makeLegacyOutcomeRoutingSystem('sys-legacy-routing-3');
  setupGame(system);
  globalThis.fromUuid = async () => null;

  const herb = makeItem({ id: 'herb-t3', name: 'Herb', quantity: 2 });
  const ingredientSet = makeIngredientSet({ id: 'set-t3', ingredientItem: herb, quantity: 1 });

  const step = {
    id: 'step-1', name: 'Step 1',
    ingredientSets: [ingredientSet],
    resultGroups: [{ id: 'rg-pass', name: 'pass', results: [{ id: 'r-pass', componentId: 'comp-potion', quantity: 1 }] }],
    resultSelection: { provider: 'check' }, timeRequirement: null
  };

  const recipe = makeRecipe({
    craftingSystemId: system.id,
    resultSelection: { provider: 'check' },
    steps: [step]
  });

  const sourceActor = makeActor({ id: 'a-t3', items: [herb] });
  const craftingActor = makeActor({ id: 'a-t3' });

  const recipeManager = makeRecipeManager({ ingredientItem: herb, ingredientSet });
  const resolutionService = makeResolutionService(system);
  const engine = new CraftingEngine(recipeManager, null, resolutionService);
  engine._runCraftingCheck = async () => ({ success: false, message: 'Roll too low', outcome: null, value: null, data: {} });
  engine._runSuccessMacro = async () => {};
  engine._runFailureMacro = async () => {};

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result.success, false, 'routed check craft should fail when check fails');
  assert.match(result.message, /Roll too low/i, 'failure message should propagate');
  assert.equal(craftingActor.createdItems.length, 0, 'no items created on check failure');
});

// ===========================================================================
// Group 4: Progressive mode — check macro returns value, awards based on difficulty
// ===========================================================================

function makeProgressiveSystem(id = 'sys-prog') {
  return makeSystem({
    id,
    resolutionMode: 'progressive',
    craftingCheck: {
      enabled: true,
      macroUuid: 'macro:check',
      successMacroUuid: null,
      failureMacroUuid: null,
      outcomes: [],
      progressive: { awardMode: 'equal' },
      consumption: { consumeIngredientsOnFail: false, consumeCatalystsOnFail: false }
    },
    managedItems: [
      { id: 'comp-a', sourceUuid: 'uuid:item-a', difficulty: 3 },
      { id: 'comp-b', sourceUuid: 'uuid:item-b', difficulty: 5 },
      { id: 'comp-c', sourceUuid: 'uuid:item-c', difficulty: 7 }
    ]
  });
}

test('progressive mode: check value 8 awards comp-a (cost 3) and comp-b (cost 5), not comp-c (cost 7)', async () => {
  const system = makeProgressiveSystem('sys-prog-1');
  setupGame(system);

  const itemA = makeSourceItem('Item A');
  const itemB = makeSourceItem('Item B');
  const itemC = makeSourceItem('Item C');
  globalThis.fromUuid = async (uuid) => {
    if (uuid === 'uuid:item-a') return itemA;
    if (uuid === 'uuid:item-b') return itemB;
    if (uuid === 'uuid:item-c') return itemC;
    return null;
  };

  const herb = makeItem({ id: 'herb-p1', name: 'Herb', quantity: 3 });
  const ingredientSet = makeIngredientSet({ id: 'set-p1', ingredientItem: herb, quantity: 1 });

  const step = {
    id: 'step-1', name: 'Step 1',
    ingredientSets: [ingredientSet],
    resultGroups: [{
      id: 'rg-prog',
      results: [
        { id: 'r-a', componentId: 'comp-a', quantity: 1 },
        { id: 'r-b', componentId: 'comp-b', quantity: 1 },
        { id: 'r-c', componentId: 'comp-c', quantity: 1 }
      ]
    }], outcomeRouting: null, timeRequirement: null
  };

  const recipe = makeRecipe({ craftingSystemId: system.id, steps: [step] });
  const sourceActor = makeActor({ id: 'a-p1', items: [herb] });
  const craftingActor = makeActor({ id: 'a-p1' });

  const recipeManager = makeRecipeManager({ ingredientItem: herb, ingredientSet });
  const resolutionService = makeResolutionService(system);
  const engine = new CraftingEngine(recipeManager, null, resolutionService);
  // Value 8: covers A (cost 3, remaining=5) and B (cost 5, remaining=0), but NOT C (cost 7)
  engine._runCraftingCheck = async () => ({ success: true, outcome: null, value: 8, data: {} });
  engine._runSuccessMacro = async () => {};
  engine._runFailureMacro = async () => {};

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result.success, true, 'progressive craft should succeed');
  assert.equal(craftingActor.createdItems.length, 2, 'exactly 2 items awarded (budget covers A and B)');
  const names = craftingActor.createdItems.map(i => i.name);
  assert.ok(names.includes('Item A'), 'Item A should be created');
  assert.ok(names.includes('Item B'), 'Item B should be created');
  assert.ok(!names.includes('Item C'), 'Item C should NOT be created (insufficient budget)');
});

test('progressive mode: check value 0 awards no results', async () => {
  const system = makeProgressiveSystem('sys-prog-2');
  setupGame(system);

  const itemA = makeSourceItem('Item A');
  globalThis.fromUuid = async (uuid) => uuid === 'uuid:item-a' ? itemA : null;

  const herb = makeItem({ id: 'herb-p2', name: 'Herb', quantity: 2 });
  const ingredientSet = makeIngredientSet({ id: 'set-p2', ingredientItem: herb, quantity: 1 });

  const step = {
    id: 'step-1', name: 'Step 1',
    ingredientSets: [ingredientSet],
    resultGroups: [{ id: 'rg-prog', results: [{ id: 'r-a', componentId: 'comp-a', quantity: 1 }] }], outcomeRouting: null, timeRequirement: null
  };

  const recipe = makeRecipe({ craftingSystemId: system.id, steps: [step] });
  const sourceActor = makeActor({ id: 'a-p2', items: [herb] });
  const craftingActor = makeActor({ id: 'a-p2' });

  const recipeManager = makeRecipeManager({ ingredientItem: herb, ingredientSet });
  const resolutionService = makeResolutionService(system);
  const engine = new CraftingEngine(recipeManager, null, resolutionService);
  engine._runCraftingCheck = async () => ({ success: true, outcome: null, value: 0, data: {} });
  engine._runSuccessMacro = async () => {};
  engine._runFailureMacro = async () => {};

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result.success, true, 'progressive craft should succeed even with value 0');
  assert.equal(craftingActor.createdItems.length, 0, 'no items awarded when check value is 0');
});

test('progressive mode: budget exceeding all costs awards all results', async () => {
  const system = makeProgressiveSystem('sys-prog-3');
  setupGame(system);

  const itemA = makeSourceItem('Item A');
  const itemB = makeSourceItem('Item B');
  globalThis.fromUuid = async (uuid) => {
    if (uuid === 'uuid:item-a') return itemA;
    if (uuid === 'uuid:item-b') return itemB;
    return null;
  };

  const herb = makeItem({ id: 'herb-p3', name: 'Herb', quantity: 5 });
  const ingredientSet = makeIngredientSet({ id: 'set-p3', ingredientItem: herb, quantity: 1 });

  const step = {
    id: 'step-1', name: 'Step 1',
    ingredientSets: [ingredientSet],
    resultGroups: [{
      id: 'rg-prog',
      results: [
        { id: 'r-a', componentId: 'comp-a', quantity: 1 },
        { id: 'r-b', componentId: 'comp-b', quantity: 1 }
      ]
    }], outcomeRouting: null, timeRequirement: null
  };

  const recipe = makeRecipe({ craftingSystemId: system.id, steps: [step] });
  const sourceActor = makeActor({ id: 'a-p3', items: [herb] });
  const craftingActor = makeActor({ id: 'a-p3' });

  const recipeManager = makeRecipeManager({ ingredientItem: herb, ingredientSet });
  const resolutionService = makeResolutionService(system);
  const engine = new CraftingEngine(recipeManager, null, resolutionService);
  // Value 20 easily covers A (cost 3) and B (cost 5)
  engine._runCraftingCheck = async () => ({ success: true, outcome: null, value: 20, data: {} });
  engine._runSuccessMacro = async () => {};
  engine._runFailureMacro = async () => {};

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result.success, true, 'progressive craft should succeed');
  assert.equal(craftingActor.createdItems.length, 2, 'both results awarded when budget covers all');
  const names = craftingActor.createdItems.map(i => i.name);
  assert.ok(names.includes('Item A'), 'Item A should be created');
  assert.ok(names.includes('Item B'), 'Item B should be created');
});
