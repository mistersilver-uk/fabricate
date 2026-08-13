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
import { Tool } from '../src/models/Tool.js';

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
function makeItem({ id, name = `Item ${id}`, quantity = 1, registeredItemUuid = null } = {}) {
  return {
    id,
    uuid: `Item.${id}`,
    name,
    registeredItemUuid,
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
  features = {},
  toolBreakage = undefined
} = {}) {
  const sys = {
    id,
    resolutionMode,
    ...(toolBreakage ? { toolBreakage } : {}),
    features: { multiStepRecipes: false, craftingChecks: false, essences: false, ...features },
    craftingCheck: craftingCheck || {
      enabled: false,
      outcomes: [],
      progressive: null,
      consumption: { consumeIngredientsOnFail: true, breakToolsOnFail: false }
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
    managedItems: [{ id: 'comp-potion', registeredItemUuid: 'uuid:potion', difficulty: 1 }]
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
    managedItems: [{ id: 'comp-potion', registeredItemUuid: 'uuid:potion', difficulty: 1 }]
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
      { id: 'comp-extract', registeredItemUuid: 'uuid:extract', difficulty: 1 },
      { id: 'comp-ingot', registeredItemUuid: 'uuid:ingot', difficulty: 1 }
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

test('multi-step: a cancelled interactive continuation aborts the resume with zero mutation', async () => {
  const system = makeSystem({
    id: 'sys-1',
    resolutionMode: 'simple',
    managedItems: [
      { id: 'comp-extract', registeredItemUuid: 'uuid:extract', difficulty: 1 },
      { id: 'comp-ingot', registeredItemUuid: 'uuid:ingot', difficulty: 1 }
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

  const herb = makeItem({ id: 'herb-cc', name: 'Herb', quantity: 3 });
  const ore = makeItem({ id: 'ore-cc', name: 'Ore', quantity: 2 });

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
  const sourceActor = makeActor({ id: 'a-cc', items: [herb, ore] });
  const craftingActor = makeActor({ id: 'a-cc' });
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
      return { canCraft: false, satisfiableSet: null, missing: { ingredients: [], essences: [] } };
    },
    ingredientMatchesItem(_recipe, ingredient, item) { return item.id === ingredient.systemItemId; }
  };

  const resolutionService = makeResolutionService(system);
  const engine = new CraftingEngine(recipeManager, runManager, resolutionService);
  engine._runCraftingCheck = async () => ({ success: true, outcome: null, value: null, data: {} });

  // Step 1 succeeds and advances the run to step index 1.
  const result1 = await engine.craft(craftingActor, [sourceActor], recipe, null, {});
  assert.equal(result1.success, true, 'step 1 should succeed');
  assert.equal(runManager.storedRun.currentStepIndex, 1, 'advanced to step index 1');

  // The continuation (step 2) is triggered interactively and the player cancels the
  // roll dialog: abort with zero mutation and do NOT advance the run.
  engine._runCraftingCheck = async () => ({ success: false, cancelled: true });
  const oreConsumedBefore = ore.updateCalled || ore.deleteCalled;
  const result2 = await engine.craft(craftingActor, [sourceActor], recipe, null, {
    runId: 'run-1',
    interactive: true
  });

  assert.equal(result2.success, false, 'cancelled continuation is not a success');
  assert.equal(result2.cancelled, true, 'cancelled flag surfaced');
  assert.equal(runManager.storedRun.currentStepIndex, 1, 'run did NOT advance past step index 1');
  assert.equal(runManager.storedRun.status, 'inProgress', 'run still in progress after cancel');
  assert.equal(ore.updateCalled || ore.deleteCalled, oreConsumedBefore, 'step-2 ingredient not consumed on cancel');
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
    resolutionMode: 'routedByCheck',
    craftingCheck: {
      enabled: true,
      outcomes: ['critical', 'pass', 'fail'],
      progressive: null,
      consumption: { consumeIngredientsOnFail: false, breakToolsOnFail: false }
    },
    managedItems: [
      { id: 'comp-great-potion', registeredItemUuid: 'uuid:great-potion', difficulty: 1 },
      { id: 'comp-potion', registeredItemUuid: 'uuid:potion', difficulty: 1 }
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
      outcomes: [],
      progressive: { awardMode: 'equal', rollFormula: '1d20' },
      consumption: { consumeIngredientsOnFail: false, breakToolsOnFail: false }
    },
    managedItems: [
      { id: 'comp-a', registeredItemUuid: 'uuid:item-a', difficulty: 3 },
      { id: 'comp-b', registeredItemUuid: 'uuid:item-b', difficulty: 5 },
      { id: 'comp-c', registeredItemUuid: 'uuid:item-c', difficulty: 7 }
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

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result.success, true, 'progressive craft should succeed');
  assert.equal(craftingActor.createdItems.length, 2, 'both results awarded when budget covers all');
  const names = craftingActor.createdItems.map(i => i.name);
  assert.ok(names.includes('Item A'), 'Item A should be created');
  assert.ok(names.includes('Item B'), 'Item B should be created');
});

// ===========================================================================
// Group 5: Check-failure breakTools — the engine-evaluated forced-failure crit
// breaks the owned tool on the breakToolsOnFail path. Each half (the
// engine check surfacing data.breakTools, and _applyToolBreakage forcing a
// never-breaking tool) is unit-proven; this exercises the craft() glue end to end.
// ===========================================================================

// An owned tool item whose Foundry flag set is tracked in a plain map, so
// flagBroken on-break writes are observable without a Foundry runtime.
function makeOwnedToolItem(componentId = 'hammer') {
  const flags = {};
  const item = {
    id: `tool-${componentId}`,
    uuid: `Item.tool-${componentId}`,
    name: 'Hammer',
    parent: { uuid: 'Actor.owner', id: 'owner' },
    getFlag(ns, key) {
      return flags[`${ns}.${key}`];
    },
    async setFlag(ns, key, value) {
      flags[`${ns}.${key}`] = value;
      return value;
    },
  };
  return { item, flags };
}

test('check-failure breakTools: a forced-failure engine crit breaks the owned tool on the breakToolsOnFail path', async () => {
  const system = makeSystem({
    id: 'sys-break',
    resolutionMode: 'simple',
    // The routed/tier `data.breakTools` legacy bridge only force-breaks under
    // checkDriven authority (issue 419 either-or rule): a check never breaks tools
    // under toolSpecific.
    toolBreakage: { authority: 'checkDriven' },
    craftingCheck: {
      enabled: true,
      outcomes: [],
      progressive: null,
      consumption: { consumeIngredientsOnFail: true, breakToolsOnFail: true },
    },
    managedItems: [{ id: 'comp-potion', registeredItemUuid: 'uuid:potion', difficulty: 1 }],
  });
  setupGame(system);
  globalThis.fromUuid = async () => makeSourceItem('Potion');

  const herb = makeItem({ id: 'herb-break', name: 'Herb', quantity: 2 });
  const ingredientSet = makeIngredientSet({ ingredientItem: herb, quantity: 1 });
  const recipe = makeRecipe({
    craftingSystemId: 'sys-break',
    ingredientSets: [ingredientSet],
    resultGroups: [{ id: 'rg-1', results: [{ id: 'r-1', componentId: 'comp-potion', quantity: 1 }] }],
  });

  // A never-breaking tool (breakageChance 0) that records breakage via a flag — so
  // any observed break is the forced break, not chance.
  const tool = new Tool({
    componentId: 'hammer',
    breakage: { mode: 'breakageChance', breakageChance: 0 },
    onBreak: { mode: 'flagBroken' },
  });
  const { item: toolItem, flags } = makeOwnedToolItem('hammer');

  const sourceActor = makeActor({ id: 'a-break', items: [herb, toolItem] });
  const craftingActor = makeActor({ id: 'a-break' });

  const recipeManager = {
    canCraft() {
      return { canCraft: true, satisfiableSet: ingredientSet, missing: { ingredients: [], essences: [] } };
    },
    getToolsForSet() {
      return [tool];
    },
    toolMatchesItem(_recipe, _tool, item) {
      return item === toolItem;
    },
    ingredientMatchesItem(_recipe, ingredient, item) {
      return item === herb && item.id === ingredient.systemItemId;
    },
  };
  const resolutionService = makeResolutionService(system);
  const engine = new CraftingEngine(recipeManager, null, resolutionService);
  // Engine-evaluated FAILURE with a tier `data.breakTools` flag — mirrors what
  // _runRoutedCheck returns for a rerouted breakTools tier (the legacy bridge).
  engine._runCraftingCheck = async () => ({
    success: false,
    outcome: 'fail',
    value: 3,
    data: { breakTools: true },
    engineEvaluated: true,
  });

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result.success, false, 'the check failed, so the craft fails');
  assert.equal(
    flags['fabricate.fabricate.toolBroken'],
    true,
    'the forced-failure breakTools crit broke the owned tool on the failure path'
  );
  assert.equal(craftingActor.createdItems.length, 0, 'no result items on a failed craft');
});

test('check-failure breakTools: a macro data.breakTools does NOT force-break the tool', async () => {
  const system = makeSystem({
    id: 'sys-nobreak',
    resolutionMode: 'simple',
    craftingCheck: {
      enabled: true,
      outcomes: [],
      progressive: null,
      consumption: { consumeIngredientsOnFail: true, breakToolsOnFail: true },
    },
    managedItems: [{ id: 'comp-potion', registeredItemUuid: 'uuid:potion', difficulty: 1 }],
  });
  setupGame(system);
  globalThis.fromUuid = async () => makeSourceItem('Potion');

  const herb = makeItem({ id: 'herb-nobreak', name: 'Herb', quantity: 2 });
  const ingredientSet = makeIngredientSet({ ingredientItem: herb, quantity: 1 });
  const recipe = makeRecipe({
    craftingSystemId: 'sys-nobreak',
    ingredientSets: [ingredientSet],
    resultGroups: [{ id: 'rg-1', results: [{ id: 'r-1', componentId: 'comp-potion', quantity: 1 }] }],
  });

  const tool = new Tool({
    componentId: 'hammer',
    breakage: { mode: 'breakageChance', breakageChance: 0 },
    onBreak: { mode: 'flagBroken' },
  });
  const { item: toolItem, flags } = makeOwnedToolItem('hammer');

  const sourceActor = makeActor({ id: 'a-nobreak', items: [herb, toolItem] });
  const craftingActor = makeActor({ id: 'a-nobreak' });

  const recipeManager = {
    canCraft() {
      return { canCraft: true, satisfiableSet: ingredientSet, missing: { ingredients: [], essences: [] } };
    },
    getToolsForSet() {
      return [tool];
    },
    toolMatchesItem(_recipe, _tool, item) {
      return item === toolItem;
    },
    ingredientMatchesItem(_recipe, ingredient, item) {
      return item === herb && item.id === ingredient.systemItemId;
    },
  };
  const resolutionService = makeResolutionService(system);
  const engine = new CraftingEngine(recipeManager, null, resolutionService);
  // A MACRO failure (no engineEvaluated marker) returning data.breakTools verbatim:
  // it must NOT force breakage, since breakTools is not part of the macro contract.
  engine._runCraftingCheck = async () => ({
    success: false,
    outcome: 'fail',
    value: 3,
    data: { breakTools: true },
  });

  await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(
    flags['fabricate.fabricate.toolBroken'],
    undefined,
    'a macro data.breakTools passthrough must not force-break the tool'
  );
});

// ===========================================================================
// Group N (issue 1098): the CRAFTING failure award
//
// Until this issue `craft()` returned inside `if (!checkResult.success)` before any
// resolution ran, so a failed craft produced nothing whatever a recipe authored — the
// reserved `role: 'failure'` result set was reachable only through the alchemy-Simple
// path, and a routed recipe could not bind a result set to a failure tier at all.
//
// EVERY TEST HERE DRIVES `craft()`, never the producer alone. The producer could select
// the right group and the branch still report an empty award on three separate seams —
// the return value, the run record and the chat card — and a producer-level test cannot
// see any of them.
// ===========================================================================

/** The markup root only a CRAFTING/SALVAGE card carries — never a dice post. */
const CRAFT_CARD_MARKUP = 'fabricate-craft-chat';

/** Capture every `ChatMessage.create` payload for the duration of one test. */
function captureCraftChat(t) {
  const previous = globalThis.ChatMessage;
  const created = [];
  globalThis.ChatMessage = {
    create: async (payload) => {
      created.push(payload);
      return { id: `msg-${created.length}` };
    },
    getSpeaker: () => ({ alias: 'Crafter' }),
  };
  t.after(() => {
    if (previous === undefined) delete globalThis.ChatMessage;
    else globalThis.ChatMessage = previous;
  });
  return created;
}

/**
 * A run manager that RETAINS the `completeStepFailure` payload.
 *
 * `makeRunManager` above deliberately drops it — every earlier test asserts on the run's
 * status alone — and the whole point of this group is that the award reaches the record
 * that lands in the actor's Fabricate run-container flag.
 */
function makeFailureRecordingRunManager() {
  const base = makeRunManager(1);
  const payloads = [];
  return {
    ...base,
    get failurePayloads() {
      return payloads;
    },
    async completeStepFailure(actor, run, stepIndex, reason, payload) {
      payloads.push(payload);
      return base.completeStepFailure(actor, run, stepIndex, reason, payload);
    },
    // A single-step recipe with no time gate finishes inside , which discards a
    // phantom run on some abort paths; the base fake predates that seam and lacks it.
    async discardRun() {},
  };
}

/** The two result sets CF1's crafting analogue needs: a success one and a reserved one. */
function failureAwardResultGroups({ withFailureGroup = true } = {}) {
  const groups = [
    {
      id: 'rg-success',
      name: 'Potion',
      results: [{ id: 'r-success', componentId: 'comp-potion', quantity: 1 }],
    },
  ];
  if (withFailureGroup) {
    groups.push({
      id: 'rg-failure',
      role: 'failure',
      name: 'Sludge',
      results: [{ id: 'r-failure', componentId: 'comp-sludge', quantity: 1 }],
    });
  }
  return groups;
}

/**
 * A wired SIMPLE-mode craft whose check FAILS, with chat output on and the failure
 * consumption policy set so nothing is consumed and no tool breaks — so the only thing
 * these tests can be observing is the award itself.
 */
function makeCraftingFailureSetup(failureResultPolicy, { withFailureGroup = true } = {}) {
  const system = makeSystem({
    id: 'sys-fail-award',
    resolutionMode: 'simple',
    features: { craftingChecks: true, chatOutput: true },
    craftingCheck: {
      enabled: true,
      failureResultPolicy,
      outcomes: [],
      progressive: null,
      consumption: { consumeIngredientsOnFail: false, breakToolsOnFail: false },
    },
    managedItems: [
      { id: 'comp-potion', registeredItemUuid: 'uuid:potion', difficulty: 1 },
      { id: 'comp-sludge', registeredItemUuid: 'uuid:sludge', difficulty: 1 },
    ],
  });
  setupGame(system);

  const potionSource = makeSourceItem('Potion');
  const sludgeSource = makeSourceItem('Sludge');
  globalThis.fromUuid = async (uuid) => {
    if (uuid === 'uuid:potion') return potionSource;
    if (uuid === 'uuid:sludge') return sludgeSource;
    return null;
  };

  const herb = makeItem({ id: 'herb-fail', name: 'Herb', quantity: 2 });
  const ingredientSet = makeIngredientSet({ id: 'set-fail', ingredientItem: herb, quantity: 1 });
  const recipe = makeRecipe({
    craftingSystemId: system.id,
    resultGroups: failureAwardResultGroups({ withFailureGroup }),
    steps: [
      {
        id: 'step-1',
        name: 'Step 1',
        ingredientSets: [ingredientSet],
        resultGroups: failureAwardResultGroups({ withFailureGroup }),
        timeRequirement: null,
      },
    ],
  });

  const sourceActor = makeActor({ id: 'a-fail', items: [herb] });
  const craftingActor = makeActor({ id: 'a-fail' });
  const runManager = makeFailureRecordingRunManager();
  const engine = new CraftingEngine(
    makeRecipeManager({ ingredientItem: herb, ingredientSet }),
    runManager,
    makeResolutionService(system)
  );
  engine._runCraftingCheck = async () => ({
    success: false,
    message: 'Roll too low',
    outcome: null,
    value: 3,
    data: {},
  });

  return { engine, craftingActor, sourceActor, recipe, system, runManager, herb };
}

test('craft(): a failed check under always produces the reserved failure result set', async (t) => {
  captureCraftChat(t);
  const { engine, craftingActor, sourceActor, recipe } = makeCraftingFailureSetup('always');

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result.success, false, 'it is still a FAILED craft');
  assert.equal(craftingActor.createdItems.length, 1, 'exactly one item was produced');
  assert.equal(
    craftingActor.createdItems[0].name,
    'Sludge',
    'the reserved FAILURE set was produced, never the success one'
  );
});

test('craft(): the failure award is reported on the return value, the run record AND the chat card', async (t) => {
  const created = captureCraftChat(t);
  const { engine, craftingActor, sourceActor, recipe, runManager } =
    makeCraftingFailureSetup('always');

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  // 1. THE RETURN VALUE — what every caller of `craft()` reads. `null` here would report
  //    "produced nothing" while items sat on the actor.
  assert.ok(Array.isArray(result.results), 'results is an array, not null');
  assert.equal(result.results.length, 1);
  assert.equal(
    result.disposition,
    'produced-on-failure',
    'and the discriminator says a failure produced something'
  );

  // 2. THE RUN RECORD — it persists into the actor's Fabricate run-container flag, so an
  //    empty `createdResults` beside real items is a DURABLE contradiction.
  assert.equal(runManager.failurePayloads.length, 1, 'the failure was recorded');
  const recorded = runManager.failurePayloads[0].createdResults;
  assert.equal(recorded.length, 1, 'the award is in the run record');
  assert.equal(recorded[0].name, 'Sludge', 'in the SUCCESS branch shape, name captured at award time');
  assert.ok(recorded[0].actorUuid && recorded[0].itemUuid);

  // 3. THE RENDERED CHAT CARD, read as HTML rather than as the arguments passed to the
  //    poster. `buildResultCard`'s failure branch built its sections from `model.consumed`
  //    and `model.tools` ONLY and never read `model.results`, so a threaded award rendered
  //    as nothing — an argument-level assertion passes on a card that shows nothing.
  const card = created.find((payload) => String(payload.content).includes(CRAFT_CARD_MARKUP));
  assert.ok(card, 'the crafting card was posted');
  assert.match(String(card.content), /Sludge/, 'the failure card renders the produced item');
});

test('craft(): a failed check under never produces nothing, byte-for-byte as before', async (t) => {
  const created = captureCraftChat(t);
  const { engine, craftingActor, sourceActor, recipe, runManager } =
    makeCraftingFailureSetup('never');

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result.results, null, 'the return value is the pre-1098 one');
  assert.equal(
    Object.hasOwn(result, 'disposition'),
    false,
    'and carries no discriminator, so nothing about the old shape changed'
  );
  assert.equal(craftingActor.createdItems.length, 0, 'nothing was created on the actor');
  assert.deepEqual(runManager.failurePayloads[0].createdResults, []);
  const card = created.find((payload) => String(payload.content).includes(CRAFT_CARD_MARKUP));
  assert.ok(!String(card.content).includes('Sludge'), 'and the card shows no award');
});

test('craft(): under never, resolution is never ASKED — the short-circuit is before selection', async (t) => {
  captureCraftChat(t);
  // "`never` short-circuits BEFORE any group is selected" is a statement about WHEN, and
  // the item count cannot see it: the resolver's own failure branch is policy-gated too,
  // so removing the engine's gate leaves both the award and the count at zero while the
  // recipe's whole result model has been walked on every failed craft.
  //
  // This is the assertion that makes the engine gate load-bearing rather than defence in
  // depth, and it is why the gate is the FIRST statement of `_produceCraftingFailureResults`.
  const setup = makeCraftingFailureSetup('never');
  // Shadow the ONE method on the instance rather than spreading the service: it is a class
  // instance, so a spread copy loses every prototype method the engine also calls.
  const countCalls = (service) => {
    const counter = { calls: 0 };
    const original = service.resolveResultGroups.bind(service);
    service.resolveResultGroups = (...args) => {
      counter.calls += 1;
      return original(...args);
    };
    return counter;
  };
  const counted = countCalls(setup.engine.resolutionModeService);

  await setup.engine.craft(setup.craftingActor, [setup.sourceActor], setup.recipe, null, {});

  assert.equal(counted.calls, 0, 'a failed craft under never resolves nothing at all');

  // …and the same spy DOES count under a permitting policy, so the assertion above is
  // discriminating rather than vacuously true of a spy that was never wired up.
  const permitting = makeCraftingFailureSetup('always');
  const permittingCounted = countCalls(permitting.engine.resolutionModeService);
  await permitting.engine.craft(
    permitting.craftingActor,
    [permitting.sourceActor],
    permitting.recipe,
    null,
    {}
  );
  assert.ok(permittingCounted.calls > 0, 'a permitting policy does ask');
});

test('craft(): always on a recipe authoring NO failure result set produces nothing', async (t) => {
  captureCraftChat(t);
  const { engine, craftingActor, sourceActor, recipe } = makeCraftingFailureSetup('always', {
    withFailureGroup: false,
  });

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  // The policy SELECTS an authored failure output; it never fabricates one.
  assert.equal(result.results, null);
  assert.equal(craftingActor.createdItems.length, 0, 'and emphatically not the success set');
});

test('craft(): the failure award does not change what a failed craft COSTS', async (t) => {
  captureCraftChat(t);
  // A failure AWARD and a failure COST are separate decisions, and the consumption
  // toggles alone own the second. This recipe awards on failure AND keeps its
  // ingredients, which is only expressible if the two are genuinely independent.
  const { engine, craftingActor, sourceActor, recipe, herb } = makeCraftingFailureSetup('always');

  await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(herb.deleteCalled, false, 'consumeIngredientsOnFail: false still returns the herb');
  assert.equal(craftingActor.createdItems.length, 1, 'while the award still happened');
});

// ── routedByCheck: the single-result-group exemption is a TRAP on the failure path ────

/**
 * A routed-by-check system whose relative tiers carry ONE failure-marked tier.
 * `resultGroupCount: 1` reproduces the single-group exemption; `2` gives the failure tier
 * a group of its own to route to.
 */
function makeRoutedFailureSetup(failureResultPolicy, { resultGroupCount = 1 } = {}) {
  const system = makeSystem({
    id: 'sys-routed-fail',
    resolutionMode: 'routedByCheck',
    features: { craftingChecks: true, chatOutput: true },
    craftingCheck: {
      enabled: true,
      failureResultPolicy,
      outcomes: [],
      progressive: null,
      consumption: { consumeIngredientsOnFail: false, breakToolsOnFail: false },
      routed: {
        type: 'relative',
        rollFormula: '1d20',
        relativeOutcomes: [
          { id: 't-fine', name: 'Fine', success: true, dc: 0 },
          { id: 't-ruined', name: 'Ruined', success: false, dc: -5 },
        ],
        fixedOutcomes: [],
      },
    },
    managedItems: [
      { id: 'comp-potion', registeredItemUuid: 'uuid:potion', difficulty: 1 },
      { id: 'comp-sludge', registeredItemUuid: 'uuid:sludge', difficulty: 1 },
    ],
  });
  setupGame(system);

  const potionSource = makeSourceItem('Potion');
  const sludgeSource = makeSourceItem('Sludge');
  globalThis.fromUuid = async (uuid) => {
    if (uuid === 'uuid:potion') return potionSource;
    if (uuid === 'uuid:sludge') return sludgeSource;
    return null;
  };

  // The single-group case declares NO `checkOutcomeIds` at all, which is what makes it a
  // purely NAME-routed recipe and lets the single-group exemption actually fire. Declaring
  // one would resolve the failure tier and then report `unrouted-tier` instead — a
  // misconfiguration, which no policy awards — so the trap would never be reached and the
  // test would pass against an engine that still had it.
  const groups = [
    {
      id: 'rg-fine',
      name: 'Fine',
      ...(resultGroupCount > 1 ? { checkOutcomeIds: ['t-fine'] } : {}),
      results: [{ id: 'r-fine', componentId: 'comp-potion', quantity: 1 }],
    },
  ];
  if (resultGroupCount > 1) {
    groups.push({
      id: 'rg-ruined',
      name: 'Ruined',
      checkOutcomeIds: ['t-ruined'],
      results: [{ id: 'r-ruined', componentId: 'comp-sludge', quantity: 1 }],
    });
  }

  const herb = makeItem({ id: 'herb-routed-fail', name: 'Herb', quantity: 2 });
  const ingredientSet = makeIngredientSet({
    id: 'set-routed-fail',
    ingredientItem: herb,
    quantity: 1,
  });
  const recipe = makeRecipe({
    craftingSystemId: system.id,
    resultGroups: groups,
    steps: [
      {
        id: 'step-1',
        name: 'Step 1',
        ingredientSets: [ingredientSet],
        resultGroups: groups,
        timeRequirement: null,
      },
    ],
  });

  const sourceActor = makeActor({ id: 'a-routed-fail', items: [herb] });
  const craftingActor = makeActor({ id: 'a-routed-fail' });
  const engine = new CraftingEngine(
    makeRecipeManager({ ingredientItem: herb, ingredientSet }),
    makeFailureRecordingRunManager(),
    makeResolutionService(system)
  );
  engine._runCraftingCheck = async () => ({
    success: false,
    message: 'Ruined',
    outcome: 'Ruined',
    value: 2,
    data: {},
  });

  return { engine, craftingActor, sourceActor, recipe };
}

test('craft(): a routed failed check NEVER takes the single-group exemption and awards the success set', async (t) => {
  captureCraftChat(t);
  // THE CRAFTING ANALOGUE OF CF1. Under `routedByCheck` a step with exactly one result
  // group takes the single-group exemption, which was written for the success path and
  // returns that group with `disposition: 'success'` for any non-keyword outcome. Awarding
  // on anything but an explicit failure disposition therefore hands a failed craft its
  // full SUCCESS output — silent, exploitable, and invisible to a length-only assertion.
  const { engine, craftingActor, sourceActor, recipe } = makeRoutedFailureSetup('always', {
    resultGroupCount: 1,
  });

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result.success, false);
  assert.equal(craftingActor.createdItems.length, 0, 'the success set was NOT awarded');
  assert.equal(result.results, null);
});

test('craft(): a routed failed check awards the set bound to its FAILURE-marked tier', async (t) => {
  const created = captureCraftChat(t);
  const { engine, craftingActor, sourceActor, recipe } = makeRoutedFailureSetup('always', {
    resultGroupCount: 2,
  });

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result.success, false, 'still a failed craft');
  assert.equal(craftingActor.createdItems.length, 1);
  assert.equal(
    craftingActor.createdItems[0].name,
    'Sludge',
    'the set bound to the Ruined tier, never the one bound to Fine'
  );
  assert.equal(result.results.length, 1);
  const card = created.find((payload) => String(payload.content).includes(CRAFT_CARD_MARKUP));
  assert.match(String(card.content), /Sludge/);
});

test('craft(): under never a routed failure-marked tier routes nothing at all', async (t) => {
  captureCraftChat(t);
  const { engine, craftingActor, sourceActor, recipe } = makeRoutedFailureSetup('never', {
    resultGroupCount: 2,
  });

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(craftingActor.createdItems.length, 0);
  assert.equal(result.results, null);
});
