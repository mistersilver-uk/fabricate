/**
 * Integration tests for T-026: End-to-End Crafting Flow
 *
 * Exercises the full CraftingEngine.craft() pipeline across four resolution
 * modes using real ResolutionModeService and CraftingRunManager instances.
 * Only _runCraftingCheck and _createSingleResult are stubbed.
 *
 * Groups:
 *   1. Simple mode  — validate + consume + create result (AC1)
 *   2. Multistep    — start run, advance 2 steps, complete (AC2)
 *   3. Routed check — outcome routed to a name-matched result group (AC3)
 *   4. Progressive  — value-based awarding by difficulty (AC4)
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import { CraftingRunManager } from '../src/systems/CraftingRunManager.js';
import { ResolutionModeService } from '../src/systems/ResolutionModeService.js';

// ---------------------------------------------------------------------------
// Globals
// ---------------------------------------------------------------------------

function getProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path).split('.').reduce((v, k) => (v == null ? undefined : v[k]), object);
}

let _idCounter = 0;
globalThis.foundry = {
  utils: {
    getProperty,
    randomID: () => `id-${++_idCounter}`
  }
};
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };

// ---------------------------------------------------------------------------
// FakeItem
// ---------------------------------------------------------------------------

class FakeItem {
  constructor(id, name, quantity = 1, componentSourceUuid = null) {
    this.id = id;
    this.uuid = `Item.${id}`;
    this.name = name;
    this.parent = null;
    this.system = { quantity };
    this.flags = componentSourceUuid ? { core: { sourceId: componentSourceUuid } } : {};
    this._deleted = false;
    this._updates = [];
  }
  async delete() { this._deleted = true; }
  async update(payload) {
    this._updates.push({ ...payload });
    if (payload['system.quantity'] !== undefined) this.system.quantity = payload['system.quantity'];
  }
}

// ---------------------------------------------------------------------------
// FakeActor
// ---------------------------------------------------------------------------

class FakeActor {
  constructor(name, items = []) {
    this.id = `actor-${name}`;
    this.uuid = `Actor.${name}`;
    this.name = name;
    this.items = items;
    this._flags = {};
    this._createdDocs = [];
  }
  // Namespace used by getFabricateFlag / setFabricateFlag: 'fabricate'
  getFlag(ns, key) { return this._flags?.[ns]?.[key]; }
  async setFlag(ns, key, value) {
    this._flags[ns] = this._flags[ns] || {};
    this._flags[ns][key] = value;
    return value;
  }
  async createEmbeddedDocuments(type, data) {
    const created = data.map((d, i) =>
      new FakeItem(`created-${this._createdDocs.length + i}`, d.name, d.system?.quantity || 1)
    );
    this._createdDocs.push(...created);
    return created;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock RecipeManager. ingredientMatchesItem compares by componentId or
 * systemItemId against item.id.
 */
function buildMockRecipeManager(canCraftResult = true) {
  return {
    canCraft(actors, recipe) {
      const ingredientSets = recipe.ingredientSets || [];
      if (!canCraftResult) {
        return {
          canCraft: false,
          satisfiableSet: null,
          missing: { ingredients: [{ ingredient: { getDescription: () => 'item' }, have: 0, need: 1 }], essences: [], tools: [] }
        };
      }
      return { canCraft: true, satisfiableSet: ingredientSets[0] || null, missing: { ingredients: [], essences: [], tools: [] } };
    },
    ingredientMatchesItem(_recipe, ingredient, item) {
      return item.id === (ingredient.componentId || ingredient.systemItemId);
    }
  };
}

/**
 * Build a duck-typed ingredient set.
 * @param {string} id
 * @param {Array<{componentId: string, quantity: number}>} ingredientDefs
 * @param {string|null} resultGroupId - for mapped mode
 */
function buildIngredientSet(id, ingredientDefs, resultGroupId = null) {
  const obj = { id, resultGroupId };
  obj.matchIngredients = function(availableItems, matchFn) {
    const matched = [];
    for (const def of ingredientDefs) {
      const ingredient = { componentId: def.componentId, systemItemId: def.componentId, quantity: def.quantity, getDescription: () => `${def.quantity}x ${def.componentId}` };
      const item = availableItems.find(i => matchFn(ingredient, i));
      if (item) matched.push({ item, quantity: def.quantity, ingredient });
    }
    return matched;
  };
  return obj;
}

/**
 * Build a duck-typed recipe.
 * @param {object} opts
 */
function buildRecipe({ id = 'recipe-1', name = 'Test Recipe', craftingSystemId = 'sys-1', ingredientSets = [], resultGroups = [], outcomeRouting = null, resultSelection = null, steps = null } = {}) {
  const recipe = {
    id, name, craftingSystemId, ingredientSets, resultGroups, outcomeRouting, resultSelection,
    toolIds: [], transferEffects: false,
    validate() { return { valid: true, errors: [] }; },
    toJSON() { return { id: this.id, name: this.name, craftingSystemId: this.craftingSystemId }; }
  };
  if (steps !== null) {
    recipe.getExecutionSteps = () => steps;
  } else {
    recipe.getExecutionSteps = null;
  }
  return recipe;
}

/**
 * Set up globalThis.game with the given crafting system.
 */
function setupGame(system) {
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => ({ getSystem: id => (id === system.id ? system : null) }),
      getResolutionModeService: () => null,
      getRecipeVisibilityService: () => null
    },
    user: { id: 'user-gm', isGM: true },
    time: { worldTime: 1000 },
    actors: []
  };
}

/**
 * Build a ResolutionModeService wired to a system.
 */
function buildResolutionService(system) {
  return new ResolutionModeService({ getSystem: id => (id === system.id ? system : null) });
}

/**
 * Build a crafting system config.
 */
function buildSystem({ id = 'sys-1', resolutionMode = 'simple', craftingCheck = null, managedItems = [] } = {}) {
  return {
    id,
    resolutionMode,
    features: { multiStepRecipes: true, craftingChecks: !!craftingCheck?.enabled, essences: false },
    craftingCheck: craftingCheck || {
      enabled: false,
      macroUuid: null,
      successMacroUuid: null,
      failureMacroUuid: null,
      outcomes: [],
      progressive: null,
      consumption: { consumeIngredientsOnFail: false, breakToolsOnFail: false }
    },
    managedItems,
    components: managedItems
  };
}

/**
 * Stub _runCraftingCheck and _createSingleResult on an engine.
 * @param {CraftingEngine} engine
 * @param {object} checkResult - returned by _runCraftingCheck
 * @param {FakeItem|null} createdItem - returned by _createSingleResult (null means no item)
 */
function stubEngine(engine, checkResult, createdItem = null) {
  engine._runCraftingCheck = async () => checkResult;
  engine._runSuccessMacro = async () => {};
  engine._runFailureMacro = async () => {};
  if (createdItem !== null) {
    engine._createSingleResult = async () => createdItem;
  }
}

// ===========================================================================
// Group 1: Simple mode integration (AC1)
// ===========================================================================

test('simple mode: validate, consume ingredients, create result item', async () => {
  const system = buildSystem({ id: 'sys-simple', resolutionMode: 'simple' });
  setupGame(system);

  const wood = new FakeItem('wood', 'Wood', 2);
  const plank = new FakeItem('plank-result', 'Plank', 1);

  const ingredientSet = buildIngredientSet('set-1', [{ componentId: 'wood', quantity: 1 }]);
  const resultGroup = { id: 'rg-1', results: [{ id: 'r-1', componentId: 'plank', quantity: 1 }] };

  const recipe = buildRecipe({
    craftingSystemId: 'sys-simple',
    ingredientSets: [ingredientSet],
    resultGroups: [resultGroup]
  });

  const sourceActor = new FakeActor('Crafter', [wood]);
  const craftingActor = new FakeActor('Crafter');

  const recipeManager = buildMockRecipeManager(true);
  const resolutionService = buildResolutionService(system);
  const engine = new CraftingEngine(recipeManager, null, resolutionService);
  stubEngine(engine, { success: true, outcome: null, value: null, data: {} }, plank);

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result.success, true, 'craft should succeed in simple mode');
  assert.ok(result.message.length > 0, 'result should have a message');

  // Wood consumed: had 2, needed 1, should update to 1
  assert.equal(wood._updates.length, 1, 'wood should have been updated (consumed)');
  assert.equal(wood.system.quantity, 1, 'wood quantity should be reduced from 2 to 1');
  assert.equal(wood._deleted, false, 'wood should not be deleted when quantity > required');

  // Result item returned
  assert.ok(Array.isArray(result.results), 'result.results should be an array');
  assert.equal(result.results.length, 1, 'one result item should be created');
  assert.equal(result.results[0].name, 'Plank', 'result item should be the plank');
});

test('simple mode: fails when ingredients missing', async () => {
  const system = buildSystem({ id: 'sys-simple-fail', resolutionMode: 'simple' });
  setupGame(system);

  const ingredientSet = buildIngredientSet('set-1', [{ componentId: 'wood', quantity: 1 }]);
  const recipe = buildRecipe({
    craftingSystemId: 'sys-simple-fail',
    ingredientSets: [ingredientSet],
    resultGroups: [{ id: 'rg-1', results: [] }]
  });

  const craftingActor = new FakeActor('Crafter');
  const sourceActor = new FakeActor('Crafter', []); // no items

  const recipeManager = buildMockRecipeManager(false); // canCraft returns false
  const resolutionService = buildResolutionService(system);
  const engine = new CraftingEngine(recipeManager, null, resolutionService);
  stubEngine(engine, { success: true }, null);

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result.success, false, 'craft should fail when ingredients are missing');
  assert.match(result.message, /Missing required items/i, 'message should mention missing items');
  assert.equal(craftingActor._createdDocs.length, 0, 'no items should be created on failure');
});

test('unknown resolution mode: craft fails instead of creating all result groups', async () => {
  const system = buildSystem({ id: 'sys-unknown', resolutionMode: 'unknown-mode' });
  setupGame(system);

  const wood = new FakeItem('wood', 'Wood', 2);
  const ingredientSet = buildIngredientSet('set-1', [{ componentId: 'wood', quantity: 1 }]);
  const resultGroups = [
    { id: 'rg-1', results: [{ id: 'r-1', componentId: 'plank', quantity: 1 }] },
    { id: 'rg-2', results: [{ id: 'r-2', componentId: 'beam', quantity: 1 }] }
  ];
  const recipe = buildRecipe({
    craftingSystemId: 'sys-unknown',
    ingredientSets: [ingredientSet],
    resultGroups
  });

  const sourceActor = new FakeActor('Crafter', [wood]);
  const craftingActor = new FakeActor('Crafter');
  const recipeManager = buildMockRecipeManager(true);
  const resolutionService = buildResolutionService(system);
  const engine = new CraftingEngine(recipeManager, null, resolutionService);
  let createSingleResultCalled = false;
  engine._runCraftingCheck = async () => ({ success: true, outcome: null, value: null, data: {} });
  engine._runSuccessMacro = async () => {};
  engine._runFailureMacro = async () => {};
  engine._createSingleResult = async () => {
    createSingleResultCalled = true;
    return new FakeItem('unexpected', 'Unexpected');
  };

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result.success, false, 'craft should fail for unknown resolution mode');
  assert.equal(result.results, null, 'failed craft should not return created results');
  assert.equal(result.message, 'Unknown resolution mode');
  assert.equal(createSingleResultCalled, false, 'no result items should be created when resolution fails');
  assert.equal(craftingActor._createdDocs.length, 0, 'actor should not receive created documents on failure');
});

test('_createSingleResult uses deterministic loot fallback type when managed source item is missing', async () => {
  const system = buildSystem({
    id: 'sys-fallback-type',
    managedItems: [{
      id: 'comp-potion',
      name: 'Potion',
      img: 'icons/svg/potion.svg',
      sourceUuid: 'uuid:missing-potion'
    }]
  });
  setupGame(system);
  globalThis.fromUuid = async () => null;

  const engine = new CraftingEngine({});
  const createdPayloads = [];
  const craftingActor = {
    id: 'actor-crafter',
    uuid: 'Actor.actor-crafter',
    name: 'Crafter',
    items: { contents: [{ type: 'weapon' }] },
    async createEmbeddedDocuments(_type, itemDatas) {
      createdPayloads.push(...itemDatas.map(itemData => ({
        ...itemData,
        system: { ...(itemData.system || {}) }
      })));
      return itemDatas.map((itemData, index) => ({
        id: `created-${index}`,
        uuid: `Item.created-${index}`,
        name: itemData.name,
        type: itemData.type,
        system: { ...(itemData.system || {}) }
      }));
    }
  };
  const warningMessages = [];
  const originalWarn = console.warn;
  console.warn = (message) => warningMessages.push(message);

  try {
    const createdItem = await engine._createSingleResult(
      craftingActor,
      { componentId: 'comp-potion', quantity: 1 },
      [],
      [],
      { craftingSystemId: 'sys-fallback-type', transferEffects: false },
      null,
      null
    );

    assert.ok(createdItem, 'fallback path should still create an item');
    assert.equal(createdPayloads.length, 1, 'one item payload should be created');
    assert.equal(createdPayloads[0].type, 'loot', 'fallback item type should not depend on actor inventory');
    assert.equal(createdItem.type, 'loot', 'created item should use deterministic loot type');
    assert.ok(warningMessages.some(message => message.includes('Managed result source item could not be resolved')),
      'fallback path should emit a warning');
  } finally {
    console.warn = originalWarn;
  }
});

// ===========================================================================
// Group 2: Multistep mode integration (AC2)
// ===========================================================================

test('multistep: start run, advance through 2 steps, complete', async () => {
  const system = buildSystem({ id: 'sys-multi', resolutionMode: 'simple' });
  setupGame(system);

  const herb = new FakeItem('herb', 'Herb', 3);
  const ore = new FakeItem('ore', 'Ore', 2);

  const set1 = buildIngredientSet('set-s1', [{ componentId: 'herb', quantity: 1 }]);
  const set2 = buildIngredientSet('set-s2', [{ componentId: 'ore', quantity: 1 }]);

  const steps = [
    {
      id: 'step-1', name: 'Gather',
      ingredientSets: [set1],
      resultGroups: [{ id: 'rg-s1', results: [{ id: 'r-s1', componentId: 'extract', quantity: 1 }] }],
      toolIds: [], outcomeRouting: null, timeRequirement: null
    },
    {
      id: 'step-2', name: 'Refine',
      ingredientSets: [set2],
      resultGroups: [{ id: 'rg-s2', results: [{ id: 'r-s2', componentId: 'ingot', quantity: 1 }] }],
      toolIds: [], outcomeRouting: null, timeRequirement: null
    }
  ];

  const recipe = buildRecipe({ craftingSystemId: 'sys-multi', steps });

  const sourceActor = new FakeActor('Worker', [herb, ore]);
  const craftingActor = new FakeActor('Worker');

  // Per step, canCraft uses the current step's ingredient sets
  let stepCall = 0;
  const recipeManager = {
    canCraft(actors, executionRecipe) {
      const sets = executionRecipe.ingredientSets || [];
      const isStep1 = sets.some(s => s.id === 'set-s1');
      const isStep2 = sets.some(s => s.id === 'set-s2');
      if (isStep1) return { canCraft: true, satisfiableSet: set1, missing: { ingredients: [], essences: [], tools: [] } };
      if (isStep2) return { canCraft: true, satisfiableSet: set2, missing: { ingredients: [], essences: [], tools: [] } };
      return { canCraft: false, satisfiableSet: null, missing: { ingredients: [{ ingredient: { getDescription: () => 'item' }, have: 0, need: 1 }], essences: [], tools: [] } };
    },
    ingredientMatchesItem(_recipe, ingredient, item) {
      return item.id === (ingredient.componentId || ingredient.systemItemId);
    }
  };

  const runManager = new CraftingRunManager();
  const resolutionService = buildResolutionService(system);
  const engine = new CraftingEngine(recipeManager, runManager, resolutionService);

  const resultItem1 = new FakeItem('extract-1', 'Extract', 1);
  const resultItem2 = new FakeItem('ingot-1', 'Ingot', 1);
  let callCount = 0;
  engine._runCraftingCheck = async () => ({ success: true, outcome: null, value: null, data: {} });
  engine._runSuccessMacro = async () => {};
  engine._runFailureMacro = async () => {};
  engine._createSingleResult = async () => {
    callCount++;
    return callCount === 1 ? resultItem1 : resultItem2;
  };

  // --- Step 1 ---
  const result1 = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result1.success, true, 'step 1 should succeed');

  // The run should have been created and herb consumed
  const activeRuns = runManager.getActiveRuns(craftingActor);
  assert.equal(activeRuns.length, 1, 'one active run should exist after step 1');
  const run = activeRuns[0];
  assert.equal(run.currentStepIndex, 1, 'run should advance to step index 1 after step 1');
  assert.ok(herb._updates.length > 0 || herb._deleted, 'herb should have been consumed in step 1');

  // --- Step 2 (resume by runId) ---
  const result2 = await engine.craft(craftingActor, [sourceActor], recipe, null, { runId: run.id });

  assert.equal(result2.success, true, 'step 2 should succeed');
  assert.ok(ore._updates.length > 0 || ore._deleted, 'ore should have been consumed in step 2');

  // Run should be completed and moved to history
  const activeRunsAfter = runManager.getActiveRuns(craftingActor);
  assert.equal(activeRunsAfter.length, 0, 'no active runs should remain after completion');

  const history = runManager.getRunHistory(craftingActor);
  assert.equal(history.length, 1, 'one completed run should be in history');
  assert.equal(history[0].status, 'succeeded', 'completed run should have status "succeeded"');
});

test('multistep: step failure records failure and stops run', async () => {
  const system = buildSystem({ id: 'sys-multi-fail', resolutionMode: 'simple' });
  setupGame(system);

  const herb = new FakeItem('herb-f', 'Herb', 2);
  const set1 = buildIngredientSet('set-sf1', [{ componentId: 'herb-f', quantity: 1 }]);

  const steps = [
    {
      id: 'step-1', name: 'Gather',
      ingredientSets: [set1],
      resultGroups: [{ id: 'rg-sf1', results: [{ id: 'r-sf1', componentId: 'extract', quantity: 1 }] }],
      toolIds: [], outcomeRouting: null, timeRequirement: null
    },
    {
      id: 'step-2', name: 'Refine',
      ingredientSets: [set1],
      resultGroups: [{ id: 'rg-sf2', results: [] }],
      toolIds: [], outcomeRouting: null, timeRequirement: null
    }
  ];

  const recipe = buildRecipe({ craftingSystemId: 'sys-multi-fail', steps });
  const sourceActor = new FakeActor('Worker-f', [herb]);
  const craftingActor = new FakeActor('Worker-f');

  const recipeManager = {
    canCraft() { return { canCraft: true, satisfiableSet: set1, missing: { ingredients: [], essences: [], tools: [] } }; },
    ingredientMatchesItem(_r, ingredient, item) { return item.id === (ingredient.componentId || ingredient.systemItemId); }
  };

  const runManager = new CraftingRunManager();
  const resolutionService = buildResolutionService(system);
  const engine = new CraftingEngine(recipeManager, runManager, resolutionService);

  // Crafting check fails on first step
  engine._runCraftingCheck = async () => ({ success: false, message: 'Check failed: roll too low', outcome: null, value: null, data: {} });
  engine._runSuccessMacro = async () => {};
  engine._runFailureMacro = async () => {};
  engine._createSingleResult = async () => null;

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result.success, false, 'craft should fail when crafting check fails');
  assert.match(result.message, /Check failed/i, 'failure message should propagate');

  // Run should be failed and in history
  const activeRuns = runManager.getActiveRuns(craftingActor);
  assert.equal(activeRuns.length, 0, 'no active runs should remain after failure');

  const history = runManager.getRunHistory(craftingActor);
  assert.equal(history.length, 1, 'one failed run should be in history');
  assert.equal(history[0].status, 'failed', 'run should have status "failed"');
  assert.equal(craftingActor._createdDocs.length, 0, 'no items should be created on failure');
});

// ===========================================================================
// Group 3: Legacy tiered compatibility mode integration (AC3)
// ===========================================================================

// Canonical routed + check fixture (the shape the 1.4.0 migration produces
// from a former-tiered system): groups are matched by name. The migration renames
// the group routed from `pass` to "pass"; the `fail` outcome is a RESERVED failure
// keyword, so it takes the failure path and never names a group (its former target
// stays unrenamed and unreachable by name matching).
function buildLegacyOutcomeRoutingFixture() {
  const system = buildSystem({
    id: 'sys-legacy-routing',
    resolutionMode: 'routed',
    craftingCheck: {
      enabled: true,
      macroUuid: 'macro:check',
      successMacroUuid: null,
      failureMacroUuid: null,
      outcomes: ['pass', 'fail'],
      progressive: null,
      consumption: { consumeIngredientsOnFail: false, breakToolsOnFail: false }
    }
  });

  const herb = new FakeItem('herb-t', 'Herb', 5);
  const ingredientSet = buildIngredientSet('set-t', [{ componentId: 'herb-t', quantity: 1 }]);

  const step = {
    id: 'step-t', name: 'Brew',
    ingredientSets: [ingredientSet],
    resultGroups: [
      { id: 'rg-pass', name: 'pass', results: [{ id: 'r-pass', componentId: 'good-potion', quantity: 1 }] },
      { id: 'rg-fail', name: 'Weak Brew', results: [{ id: 'r-fail', componentId: 'weak-potion', quantity: 1 }] }
    ],
    resultSelection: { provider: 'check' },
    toolIds: [], timeRequirement: null
  };

  const recipe = buildRecipe({
    craftingSystemId: 'sys-legacy-routing',
    resultSelection: { provider: 'check' },
    steps: [step]
  });

  return { system, herb, ingredientSet, step, recipe };
}

test("routed check: 'pass' outcome routes craft to the pass-named result group", async () => {
  const { system, herb, ingredientSet, recipe } = buildLegacyOutcomeRoutingFixture();
  setupGame(system);

  const sourceActor = new FakeActor('Brewer', [herb]);
  const craftingActor = new FakeActor('Brewer');

  const recipeManager = buildMockRecipeManager(true);
  const resolutionService = buildResolutionService(system);
  const engine = new CraftingEngine(recipeManager, null, resolutionService);

  const passPotion = new FakeItem('good-potion-1', 'Good Potion', 1);
  const failPotion = new FakeItem('weak-potion-1', 'Weak Potion', 1);

  engine._runCraftingCheck = async () => ({ success: true, outcome: 'pass', value: null, data: {} });
  engine._runSuccessMacro = async () => {};
  engine._runFailureMacro = async () => {};
  engine._createSingleResult = async (_actor, result) => {
    // Return item matching the result componentId
    if (result.componentId === 'good-potion') return passPotion;
    if (result.componentId === 'weak-potion') return failPotion;
    return null;
  };

  const craftResult = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(craftResult.success, true, 'routed check craft should succeed with "pass" outcome');
  assert.equal(craftResult.results.length, 1, 'exactly one result item should be returned');
  assert.equal(craftResult.results[0].name, 'Good Potion', '"pass" outcome should yield Good Potion from the pass-named group');
});

test("routed check: reserved 'fail' outcome takes the failure path (no group awarded)", async () => {
  const { system, herb, ingredientSet, recipe } = buildLegacyOutcomeRoutingFixture();
  setupGame(system);

  // Use fresh herb to avoid state from previous test
  const herb2 = new FakeItem('herb-t2', 'Herb', 5);
  const sourceActor = new FakeActor('Brewer2', [herb2]);
  const craftingActor = new FakeActor('Brewer2');

  const recipeManager = {
    canCraft() { return { canCraft: true, satisfiableSet: ingredientSet, missing: { ingredients: [], essences: [], tools: [] } }; },
    ingredientMatchesItem(_r, ingredient, item) { return item.id === (ingredient.componentId || ingredient.systemItemId); }
  };

  const resolutionService = buildResolutionService(system);
  const engine = new CraftingEngine(recipeManager, null, resolutionService);

  const passPotion = new FakeItem('good-potion-2', 'Good Potion', 1);
  const failPotion = new FakeItem('weak-potion-2', 'Weak Potion', 1);

  engine._runCraftingCheck = async () => ({ success: true, outcome: 'fail', value: null, data: {} });
  engine._runSuccessMacro = async () => {};
  engine._runFailureMacro = async () => {};
  engine._createSingleResult = async (_actor, result) => {
    if (result.componentId === 'good-potion') return passPotion;
    if (result.componentId === 'weak-potion') return failPotion;
    return null;
  };

  const craftResult = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  // `fail` is a reserved failure keyword under canonical check: it routes
  // to the failure path and awards no result group (unlike legacy tiered, which
  // routed `fail` to an explicit group).
  assert.equal(craftResult.results.length, 0, 'reserved fail outcome awards no result group');
});

// ===========================================================================
// Group 4: Progressive mode integration (AC4)
// ===========================================================================

function buildProgressiveFixture() {
  const system = buildSystem({
    id: 'sys-prog',
    resolutionMode: 'progressive',
    craftingCheck: {
      enabled: true,
      macroUuid: 'macro:check',
      successMacroUuid: null,
      failureMacroUuid: null,
      outcomes: [],
      progressive: { awardMode: 'equal' },
      consumption: { consumeIngredientsOnFail: false, breakToolsOnFail: false }
    },
    managedItems: [
      { id: 'comp-a', sourceUuid: 'uuid:a', difficulty: 2 },
      { id: 'comp-b', sourceUuid: 'uuid:b', difficulty: 3 },
      { id: 'comp-c', sourceUuid: 'uuid:c', difficulty: 5 }
    ]
  });

  const herb = new FakeItem('herb-p', 'Herb', 5);
  const ingredientSet = buildIngredientSet('set-p', [{ componentId: 'herb-p', quantity: 1 }]);

  const step = {
    id: 'step-p', name: 'Infuse',
    ingredientSets: [ingredientSet],
    resultGroups: [{
      id: 'rg-prog',
      results: [
        { id: 'r-a', componentId: 'comp-a', quantity: 1 },
        { id: 'r-b', componentId: 'comp-b', quantity: 1 },
        { id: 'r-c', componentId: 'comp-c', quantity: 1 }
      ]
    }],
    toolIds: [], outcomeRouting: null, timeRequirement: null
  };

  const recipe = buildRecipe({ craftingSystemId: 'sys-prog', steps: [step] });

  return { system, herb, ingredientSet, step, recipe };
}

test('progressive mode: check value 7 awards comp-a (cost 2) and comp-b (cost 3), not comp-c (cost 5)', async () => {
  const { system, herb, ingredientSet, recipe } = buildProgressiveFixture();
  setupGame(system);

  const sourceActor = new FakeActor('Alchemist', [herb]);
  const craftingActor = new FakeActor('Alchemist');

  const recipeManager = buildMockRecipeManager(true);
  const resolutionService = buildResolutionService(system);
  const engine = new CraftingEngine(recipeManager, null, resolutionService);

  const itemA = new FakeItem('result-a', 'Item A', 1);
  const itemB = new FakeItem('result-b', 'Item B', 1);
  const itemC = new FakeItem('result-c', 'Item C', 1);

  engine._runCraftingCheck = async () => ({ success: true, outcome: null, value: 7, data: {} });
  engine._runSuccessMacro = async () => {};
  engine._runFailureMacro = async () => {};
  engine._createSingleResult = async (_actor, result) => {
    if (result.componentId === 'comp-a') return itemA;
    if (result.componentId === 'comp-b') return itemB;
    if (result.componentId === 'comp-c') return itemC;
    return null;
  };

  // Budget 7: comp-a costs 2 (remaining 5), comp-b costs 3 (remaining 2), comp-c costs 5 > 2 → NOT awarded
  const craftResult = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(craftResult.success, true, 'progressive craft should succeed');
  assert.equal(craftResult.results.length, 2, 'exactly 2 results should be awarded (comp-a and comp-b)');
  const names = craftResult.results.map(r => r.name);
  assert.ok(names.includes('Item A'), 'comp-a (cost 2) should be awarded');
  assert.ok(names.includes('Item B'), 'comp-b (cost 3) should be awarded');
  assert.ok(!names.includes('Item C'), 'comp-c (cost 5) should NOT be awarded (insufficient budget)');
});

test('progressive mode: zero check value awards nothing', async () => {
  const { system, herb, recipe } = buildProgressiveFixture();
  setupGame(system);

  // Fresh herb for this test
  const herb2 = new FakeItem('herb-p2', 'Herb', 5);
  const sourceActor = new FakeActor('Alchemist2', [herb2]);
  const craftingActor = new FakeActor('Alchemist2');

  const recipeManager = buildMockRecipeManager(true);
  const resolutionService = buildResolutionService(system);
  const engine = new CraftingEngine(recipeManager, null, resolutionService);

  let createCalled = 0;
  engine._runCraftingCheck = async () => ({ success: true, outcome: null, value: 0, data: {} });
  engine._runSuccessMacro = async () => {};
  engine._runFailureMacro = async () => {};
  engine._createSingleResult = async () => { createCalled++; return new FakeItem(`prog-result-${createCalled}`, 'Result', 1); };

  const craftResult = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(craftResult.success, true, 'progressive craft should succeed even when value is 0');
  assert.equal(craftResult.results.length, 0, 'no results should be awarded when check value is 0');
  assert.equal(createCalled, 0, '_createSingleResult should never be called when value is 0');
});
