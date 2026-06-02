/**
 * Tests for Task 16: Filter alchemy runs in RunSummary
 * Verifies alchemyRuns, alchemyRunHistory, craftingRuns, craftingRunHistory
 * derived stores in craftingStore.js.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

globalThis.foundry = { utils: { randomID: () => `id-${Math.random().toString(36).slice(2)}` } };
globalThis.game = { user: { id: 'u1', character: null }, actors: [] };
globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

const { createCraftingStore } = await import('../../src/ui/svelte/stores/craftingStore.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeActor(id, name = `Actor-${id}`) {
  return { id, name, isOwner: true, items: { size: 0 } };
}

function makeAlchemySystem(id = 'alchemy-sys') {
  return { id, name: 'Alchemy System', resolutionMode: 'alchemy', components: [] };
}

function makeSimpleSystem(id = 'simple-sys') {
  return { id, name: 'Simple System', resolutionMode: 'simple', components: [] };
}

function makeRecipe(id, craftingSystemId) {
  return {
    id,
    craftingSystemId,
    name: `Recipe-${id}`,
    description: '',
    img: 'icon.png',
    category: '',
    ingredientSets: [],
    results: [],
    steps: [],
    isSimpleRecipe: () => true,
    getResultDescription: () => 'result'
  };
}

function makeRun(id, recipeId, status = 'inProgress') {
  return {
    id,
    recipeId,
    status,
    steps: [{ stepName: 'Step 1', timeGate: null }],
    currentStepIndex: 0,
    startedAt: Date.now(),
    finishedAt: null
  };
}

function makeHistoryRun(id, recipeId, status = 'succeeded') {
  return {
    id,
    recipeId,
    status,
    steps: [],
    currentStepIndex: null,
    startedAt: Date.now() - 1000,
    finishedAt: Date.now()
  };
}

function createMockServices({ alchemySystem, simpleSystem, activeRuns = [], historyRuns = [] } = {}) {
  const actorA = makeActor('a1', 'Alice');
  const allSystems = [
    ...(alchemySystem ? [alchemySystem] : []),
    ...(simpleSystem ? [simpleSystem] : [])
  ];
  const defaultSettings = {
    lastCraftingActor: '',
    lastComponentSources: ['a1'],
    favouriteRecipes: [],
    recentlyCrafted: []
  };

  const alchemyRecipe = alchemySystem ? makeRecipe('alchemy-recipe', alchemySystem.id) : null;
  const simpleRecipe = simpleSystem ? makeRecipe('simple-recipe', simpleSystem.id) : null;
  const allRecipes = [alchemyRecipe, simpleRecipe].filter(Boolean);

  return {
    getRecipeManager: () => ({
      getRecipes: () => allRecipes,
      getRecipe: (id) => allRecipes.find(r => r.id === id) || null,
      evaluateCraftability: () => ({
        canCraft: false,
        satisfiableSet: null,
        missing: { ingredients: [], essences: [], catalysts: [] },
        ingredientStates: [],
        essenceStates: [],
        catalystStates: []
      })
    }),
    getRecipeVisibilityService: () => null,
    getCraftingRunManager: () => ({
      getActiveRuns: () => activeRuns,
      getRunHistory: () => historyRuns
    }),
    getCraftingEngine: () => null,
    getCraftingSystemManager: () => ({
      getSystems: () => allSystems,
      getSystem: (id) => allSystems.find(s => s.id === id) || null
    }),
    getSetting: (key) => defaultSettings[key] ?? null,
    setSetting: async (key, value) => { defaultSettings[key] = value; },
    getAvailableActors: () => [actorA],
    getOwnedActors: () => [actorA],
    getGameUser: () => ({ id: 'u1', character: actorA }),
    getWorldTime: () => 0,
    notify: { info: () => {}, warn: () => {}, error: () => {} },
    confirmDialog: async () => true
  };
}

// ============================================================================
// alchemyRuns / alchemyRunHistory
// ============================================================================

test('alchemyRuns is exported by createCraftingStore', () => {
  const services = createMockServices();
  const store = createCraftingStore(services);
  assert.ok('alchemyRuns' in store, 'alchemyRuns should be exported');
  assert.ok('alchemyRunHistory' in store, 'alchemyRunHistory should be exported');
});

test('craftingRuns is exported by createCraftingStore', () => {
  const services = createMockServices();
  const store = createCraftingStore(services);
  assert.ok('craftingRuns' in store, 'craftingRuns should be exported');
  assert.ok('craftingRunHistory' in store, 'craftingRunHistory should be exported');
});

test('alchemyRuns includes only runs whose recipe belongs to an alchemy system', async () => {
  const alchemySystem = makeAlchemySystem();
  const simpleSystem = makeSimpleSystem();

  const alchemyRun = makeRun('run-alchemy', 'alchemy-recipe');
  const simpleRun = makeRun('run-simple', 'simple-recipe');

  const services = createMockServices({
    alchemySystem,
    simpleSystem,
    activeRuns: [alchemyRun, simpleRun]
  });

  const store = createCraftingStore(services);
  await store.refresh();

  const runs = get(store.alchemyRuns);
  assert.ok(Array.isArray(runs), 'alchemyRuns should be an array');
  assert.equal(runs.length, 1, 'should have exactly 1 alchemy run');
  assert.equal(runs[0].recipeId, 'alchemy-recipe');
});

test('craftingRuns excludes runs whose recipe belongs to an alchemy system', async () => {
  const alchemySystem = makeAlchemySystem();
  const simpleSystem = makeSimpleSystem();

  const alchemyRun = makeRun('run-alchemy', 'alchemy-recipe');
  const simpleRun = makeRun('run-simple', 'simple-recipe');

  const services = createMockServices({
    alchemySystem,
    simpleSystem,
    activeRuns: [alchemyRun, simpleRun]
  });

  const store = createCraftingStore(services);
  await store.refresh();

  const runs = get(store.craftingRuns);
  assert.ok(Array.isArray(runs), 'craftingRuns should be an array');
  assert.equal(runs.length, 1, 'should have exactly 1 crafting run');
  assert.equal(runs[0].recipeId, 'simple-recipe');
});

test('alchemyRunHistory includes only history runs from alchemy systems', async () => {
  const alchemySystem = makeAlchemySystem();
  const simpleSystem = makeSimpleSystem();

  const alchemyHist = makeHistoryRun('hist-alchemy', 'alchemy-recipe');
  const simpleHist = makeHistoryRun('hist-simple', 'simple-recipe');

  const services = createMockServices({
    alchemySystem,
    simpleSystem,
    historyRuns: [alchemyHist, simpleHist]
  });

  const store = createCraftingStore(services);
  await store.refresh();

  const history = get(store.alchemyRunHistory);
  assert.ok(Array.isArray(history), 'alchemyRunHistory should be an array');
  assert.equal(history.length, 1, 'should have exactly 1 alchemy history run');
  assert.equal(history[0].recipeId, 'alchemy-recipe');
});

test('craftingRunHistory excludes history runs from alchemy systems', async () => {
  const alchemySystem = makeAlchemySystem();
  const simpleSystem = makeSimpleSystem();

  const alchemyHist = makeHistoryRun('hist-alchemy', 'alchemy-recipe');
  const simpleHist = makeHistoryRun('hist-simple', 'simple-recipe');

  const services = createMockServices({
    alchemySystem,
    simpleSystem,
    historyRuns: [alchemyHist, simpleHist]
  });

  const store = createCraftingStore(services);
  await store.refresh();

  const history = get(store.craftingRunHistory);
  assert.ok(Array.isArray(history), 'craftingRunHistory should be an array');
  assert.equal(history.length, 1, 'should have exactly 1 crafting history run');
  assert.equal(history[0].recipeId, 'simple-recipe');
});

test('alchemyRuns is empty when no alchemy system exists', async () => {
  const simpleSystem = makeSimpleSystem();
  const simpleRun = makeRun('run-simple', 'simple-recipe');

  const services = createMockServices({
    simpleSystem,
    activeRuns: [simpleRun]
  });

  const store = createCraftingStore(services);
  await store.refresh();

  const runs = get(store.alchemyRuns);
  assert.equal(runs.length, 0, 'alchemyRuns should be empty with no alchemy system');
});

test('craftingRuns is empty when only alchemy runs exist', async () => {
  const alchemySystem = makeAlchemySystem();
  const alchemyRun = makeRun('run-alchemy', 'alchemy-recipe');

  const services = createMockServices({
    alchemySystem,
    activeRuns: [alchemyRun]
  });

  const store = createCraftingStore(services);
  await store.refresh();

  const runs = get(store.craftingRuns);
  assert.equal(runs.length, 0, 'craftingRuns should be empty when only alchemy runs exist');
});

test('runs with unknown recipeId are included in craftingRuns (safe fallback)', async () => {
  const alchemySystem = makeAlchemySystem();
  const simpleSystem = makeSimpleSystem();

  // Run with a recipe ID that doesn't match any known recipe
  const unknownRun = makeRun('run-unknown', 'unknown-recipe');

  const services = createMockServices({
    alchemySystem,
    simpleSystem,
    activeRuns: [unknownRun]
  });

  const store = createCraftingStore(services);
  await store.refresh();

  const craftingRuns = get(store.craftingRuns);
  const alchemyRuns = get(store.alchemyRuns);

  // Unknown recipes are non-alchemy by default (safe fallback)
  assert.equal(alchemyRuns.length, 0, 'unknown recipe runs should not appear in alchemyRuns');
  assert.equal(craftingRuns.length, 1, 'unknown recipe runs should fall through to craftingRuns');
});
