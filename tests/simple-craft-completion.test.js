/**
 * T-091: Fix Completed Simple Crafts Persisting as In-Progress and Double Chat Success
 *
 * Test cases:
 *  1. _onCraft does NOT call _createChatMessage on success (chat handled by CraftingEngine)
 *  2. _prepareContext excludes runs with status 'succeeded' from activeRuns
 *  3. _prepareContext excludes runs with status 'failed' from activeRuns
 *  4. _prepareContext includes runs with status 'inProgress' in activeRuns
 *  5. _prepareContext includes runs with status 'waitingTime' in activeRuns
 */
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.foundry = {
  applications: {
    api: {
      HandlebarsApplicationMixin: (Base) => class extends Base {},
      ApplicationV2: class {
        async _prepareContext() {
          return {};
        }
      }
    }
  }
};

globalThis.game = {
  user: { id: 'user-1', character: null },
  time: { worldTime: 1000 },
  actors: []
};

globalThis.ui = {
  notifications: {
    info: () => {},
    warn: () => {},
    error: () => {}
  }
};

globalThis.ChatMessage = {
  create: () => {},
  getSpeaker: () => ({})
};

const { CraftingApp } = await import('../src/ui/CraftingApp.js');

function createAppHarness() {
  const actor = { id: 'a1', name: 'Crafter', items: { size: 0 } };
  const app = Object.create(CraftingApp.prototype);
  app.craftingActor = actor;
  app.componentSourceActors = [actor];
  app.render = async () => {};
  app._notifyInfo = () => {};
  app._notifyWarn = () => {};
  app._notifyError = () => {};
  return app;
}

function makeRecipe(id = 'r1', name = 'Test Recipe') {
  return {
    id,
    name,
    description: '',
    img: 'icons/svg/item-bag.svg',
    category: 'alchemy',
    ingredientSets: [],
    steps: [],
    getResultDescription: () => '1x Result',
    isSimpleRecipe: () => true
  };
}

function emptyEvaluation() {
  return {
    canCraft: true,
    satisfiableSet: null,
    missing: { ingredients: [], essences: [], catalysts: [] },
    ingredientStates: [],
    essenceStates: [],
    catalystStates: []
  };
}

// ---------------------------------------------------------------------------
// Test 1: _onCraft does NOT call _createChatMessage on success
// ---------------------------------------------------------------------------

test('T-091: _onCraft does not call _createChatMessage on success (chat handled by CraftingEngine)', async () => {
  const app = createAppHarness();
  let chatMessageCalls = 0;
  app._createChatMessage = () => { chatMessageCalls++; };
  app._getSetting = () => true; // autoCraft = true, skips confirm

  const recipe = makeRecipe();
  app._getRecipeManager = () => ({ getRecipe: () => recipe });
  app._getCraftingEngine = () => ({
    craft: async () => ({ success: true, message: 'Crafted successfully!' })
  });
  app._trackRecentCraft = async () => {};

  await CraftingApp._onCraft.call(app, {}, {
    dataset: { recipeId: 'r1', runId: '', skipConfirm: 'true' }
  });

  assert.equal(chatMessageCalls, 0,
    '_createChatMessage must NOT be called from _onCraft; chat is handled by CraftingEngine');
});

// ---------------------------------------------------------------------------
// Test 2: _prepareContext excludes runs with status 'succeeded' from activeRuns
// ---------------------------------------------------------------------------

test('T-091: _prepareContext excludes succeeded runs from activeRuns', async () => {
  const app = createAppHarness();
  app.searchTerm = '';
  app.selectedCategory = '';
  app.showOnlyAvailable = false;

  app._getSetting = () => false;
  app._getAvailableActors = () => [app.craftingActor];
  app._getOwnedActors = () => [app.craftingActor];
  app._getRecipeVisibilityService = () => null;
  app._getRecipeManager = () => ({
    getRecipes: () => [],
    evaluateCraftability: () => emptyEvaluation(),
    getRecipe: () => ({ id: 'r1', name: 'Test Recipe' })
  });
  app._getRunManager = () => ({
    getActiveRuns: () => ([
      {
        id: 'run-done',
        recipeId: 'r1',
        status: 'succeeded',
        startedAt: 100,
        currentStepIndex: null,
        steps: []
      }
    ]),
    getRunHistory: () => []
  });

  const context = await CraftingApp.prototype._prepareContext.call(app, {});

  assert.equal(context.activeRuns.length, 0,
    'Succeeded run must not appear in activeRuns (propagation-delay fix)');
});

// ---------------------------------------------------------------------------
// Test 3: _prepareContext excludes runs with status 'failed' from activeRuns
// ---------------------------------------------------------------------------

test('T-091: _prepareContext excludes failed runs from activeRuns', async () => {
  const app = createAppHarness();
  app.searchTerm = '';
  app.selectedCategory = '';
  app.showOnlyAvailable = false;

  app._getSetting = () => false;
  app._getAvailableActors = () => [app.craftingActor];
  app._getOwnedActors = () => [app.craftingActor];
  app._getRecipeVisibilityService = () => null;
  app._getRecipeManager = () => ({
    getRecipes: () => [],
    evaluateCraftability: () => emptyEvaluation(),
    getRecipe: () => ({ id: 'r1', name: 'Test Recipe' })
  });
  app._getRunManager = () => ({
    getActiveRuns: () => ([
      {
        id: 'run-failed',
        recipeId: 'r1',
        status: 'failed',
        startedAt: 100,
        currentStepIndex: null,
        steps: []
      }
    ]),
    getRunHistory: () => []
  });

  const context = await CraftingApp.prototype._prepareContext.call(app, {});

  assert.equal(context.activeRuns.length, 0,
    'Failed run must not appear in activeRuns (propagation-delay fix)');
});

// ---------------------------------------------------------------------------
// Test 4: _prepareContext includes runs with status 'inProgress' in activeRuns
// ---------------------------------------------------------------------------

test('T-091: _prepareContext includes inProgress runs in activeRuns', async () => {
  const app = createAppHarness();
  app.searchTerm = '';
  app.selectedCategory = '';
  app.showOnlyAvailable = false;

  app._getSetting = () => false;
  app._getAvailableActors = () => [app.craftingActor];
  app._getOwnedActors = () => [app.craftingActor];
  app._getRecipeVisibilityService = () => null;
  app._getRecipeManager = () => ({
    getRecipes: () => [],
    evaluateCraftability: () => emptyEvaluation(),
    getRecipe: () => ({ id: 'r1', name: 'Test Recipe' })
  });
  app._getRunManager = () => ({
    getActiveRuns: () => ([
      {
        id: 'run-active',
        recipeId: 'r1',
        status: 'inProgress',
        startedAt: 100,
        currentStepIndex: 0,
        steps: [{ stepName: 'Mix', status: 'inProgress' }]
      }
    ]),
    getRunHistory: () => []
  });

  const context = await CraftingApp.prototype._prepareContext.call(app, {});

  assert.equal(context.activeRuns.length, 1,
    'inProgress run should remain in activeRuns');
  assert.equal(context.activeRuns[0].id, 'run-active');
});

// ---------------------------------------------------------------------------
// Test 5: _prepareContext includes runs with status 'waitingTime' in activeRuns
// ---------------------------------------------------------------------------

test('T-091: _prepareContext includes waitingTime runs in activeRuns', async () => {
  const app = createAppHarness();
  app.searchTerm = '';
  app.selectedCategory = '';
  app.showOnlyAvailable = false;

  app._getSetting = () => false;
  app._getAvailableActors = () => [app.craftingActor];
  app._getOwnedActors = () => [app.craftingActor];
  app._getRecipeVisibilityService = () => null;
  app._getRecipeManager = () => ({
    getRecipes: () => [],
    evaluateCraftability: () => emptyEvaluation(),
    getRecipe: () => ({ id: 'r1', name: 'Test Recipe' })
  });
  app._getRunManager = () => ({
    getActiveRuns: () => ([
      {
        id: 'run-waiting',
        recipeId: 'r1',
        status: 'waitingTime',
        startedAt: 100,
        currentStepIndex: 0,
        steps: [{
          stepName: 'Rest',
          status: 'waitingTime',
          timeGate: { availableAt: 5000 }
        }]
      }
    ]),
    getRunHistory: () => []
  });

  const context = await CraftingApp.prototype._prepareContext.call(app, {});

  assert.equal(context.activeRuns.length, 1,
    'waitingTime run should remain in activeRuns');
  assert.equal(context.activeRuns[0].id, 'run-waiting');
});

// ---------------------------------------------------------------------------
// Tests 6-8: CraftingRunManager cache behavior
// ---------------------------------------------------------------------------

// Extend foundry global with utils.randomID needed by CraftingRunManager
let _runId = 0;
if (!globalThis.foundry.utils) {
  globalThis.foundry.utils = { randomID: () => `rid-${++_runId}` };
}

const { CraftingRunManager } = await import('../src/systems/CraftingRunManager.js');

function makeActor(id = 'a1') {
  const flags = {};
  return {
    id,
    uuid: `Actor.${id}`,
    getFlag(ns, key) { return flags[key]; },
    setFlag(ns, key, value) { flags[key] = value; return Promise.resolve(); }
  };
}

function makeOneStepRecipe(id = 'r1') {
  return {
    id,
    craftingSystemId: 'sys1',
    getExecutionSteps: () => [{ id: 'step-1', name: 'Mix' }]
  };
}

// ---------------------------------------------------------------------------
// Test 6: completeStepSuccess on a one-step recipe removes run from activeRuns
// ---------------------------------------------------------------------------

test('T-091: completeStepSuccess on one-step recipe moves run out of activeRuns', async () => {
  const manager = new CraftingRunManager();
  const actor = makeActor();
  const recipe = makeOneStepRecipe();

  const run = await manager.createRun(actor, recipe, [], 'user-1');
  assert.equal(manager.getActiveRuns(actor).length, 1, 'run should start in active');

  await manager.completeStepSuccess(actor, run, 0, {});

  assert.equal(manager.getActiveRuns(actor).length, 0,
    'completed run must not appear in activeRuns after completeStepSuccess');

  const history = manager.getRunHistory(actor);
  assert.equal(history.length, 1, 'completed run must appear in history');
  assert.equal(history[0].status, 'succeeded', 'completed run must have status succeeded');
});

// ---------------------------------------------------------------------------
// Test 7: cache returns fresh data immediately after completeRun (no stale flag read)
// ---------------------------------------------------------------------------

test('T-091: cache returns fresh state immediately after completeRun (stale-flag prevention)', async () => {
  // Simulate a stale-flag race: after persist, getFlag would return the OLD data
  // (run still in active). The cache must serve the correct post-completion state.
  const manager = new CraftingRunManager();
  const recipe = makeOneStepRecipe('r2');

  let persistedContainer = null;
  const actor = {
    id: 'a2',
    uuid: 'Actor.a2',
    getFlag(ns, key) {
      // Simulate race: return null so _normalizeContainer produces empty container.
      // Only the cached value (written by _persist) should matter for subsequent reads.
      return null;
    },
    setFlag(ns, key, value) {
      persistedContainer = value;
      return Promise.resolve();
    }
  };

  // Manually poison the cache with stale data (run still inProgress) to simulate
  // what would happen if getFlag returned stale data on the next read
  const run = await manager.createRun(actor, recipe, [], 'user-1');
  // Poison: overwrite cache with a copy that still has the run as inProgress
  const staleContainer = {
    active: { [run.id]: { ...run, status: 'inProgress' } },
    history: []
  };
  manager._cache.set('a2', staleContainer);

  // Now complete the run — _getContainer will read stale cache, but _persist must overwrite it
  await manager.completeStepSuccess(actor, run, 0, {});

  // After completion, cache must reflect the completed state (run removed from active)
  const activeRuns = manager.getActiveRuns(actor);
  assert.equal(activeRuns.length, 0,
    'getActiveRuns must return empty after completeRun even when cache was stale before the call');
});

// ---------------------------------------------------------------------------
// Test 8: invalidateCache clears cached data so next read falls back to flags
// ---------------------------------------------------------------------------

test('T-091: invalidateCache clears per-actor cache entry', async () => {
  const manager = new CraftingRunManager();
  const actor = makeActor('a3');
  const recipe = makeOneStepRecipe('r3');

  await manager.createRun(actor, recipe, [], 'user-1');
  assert.equal(manager._cache.has('a3'), true, 'cache should be populated after createRun');

  manager.invalidateCache('a3');
  assert.equal(manager._cache.has('a3'), false, 'cache entry should be cleared after invalidateCache');
});
