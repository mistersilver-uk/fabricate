/**
 * Tests for T-099: craftingStore alchemy mode
 * Covers isAlchemyMode detection and submitAlchemyAttempt delegation.
 *
 * Task 15 cleanup: removed tests for addAlchemyItem, removeAlchemyItem,
 * clearAlchemyItems (deprecated API). submitAlchemyAttempt now delegates
 * to submitWorkbench().
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

// ---------------------------------------------------------------------------
// Foundry globals
// ---------------------------------------------------------------------------

globalThis.foundry = { utils: { randomID: () => `id-${Math.random().toString(36).slice(2)}` } };
globalThis.game = { user: { id: 'u1', character: null }, actors: [] };
globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

// ---------------------------------------------------------------------------
// Store factory import
// ---------------------------------------------------------------------------

const { createCraftingStore } = await import('../../src/ui/svelte/stores/craftingStore.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeActor(id, name = `Actor-${id}`) {
  return { id, name, isOwner: true, items: { size: 0 } };
}

function makeRecipe(id, craftingSystemId, name = `Recipe-${id}`) {
  return {
    id,
    craftingSystemId,
    name,
    description: `${name} description`,
    img: 'icon.png',
    category: 'potions',
    ingredientSets: [],
    results: [],
    steps: [],
    isSimpleRecipe: () => true,
    getResultDescription: () => 'result'
  };
}

function makeAlchemySystem(id = 'alchemy-sys') {
  return { id, resolutionMode: 'alchemy', alchemy: { learnOnCraft: true, consumeOnFail: true } };
}

function makeSimpleSystem(id = 'simple-sys') {
  return { id, resolutionMode: 'simple', alchemy: null };
}

function createMockServices(overrides = {}) {
  const actorA = makeActor('a1', 'Alice');
  const defaultSettings = {
    lastCraftingActor: '',
    lastComponentSources: ['a1'],
    favouriteRecipes: [],
    recentlyCrafted: [],
  };

  const defaultRecipeManager = {
    getRecipes: () => [],
    getRecipe: () => null,
    evaluateCraftability: () => ({
      canCraft: false,
      satisfiableSet: null,
      missing: { ingredients: [], essences: [], catalysts: [] },
      ingredientStates: [],
      essenceStates: [],
      catalystStates: []
    })
  };

  const defaultRunManager = {
    getActiveRuns: () => [],
    getRunHistory: () => []
  };

  const base = {
    getRecipeManager: () => defaultRecipeManager,
    getRecipeVisibilityService: () => null,
    getCraftingRunManager: () => defaultRunManager,
    getCraftingEngine: () => null,
    getCraftingSystemManager: () => null,
    getSetting: (key) => defaultSettings[key] ?? null,
    setSetting: async (key, value) => { defaultSettings[key] = value; },
    getAvailableActors: () => [actorA],
    getOwnedActors: () => [actorA],
    getGameUser: () => ({ id: 'u1', character: actorA }),
    getWorldTime: () => 0,
    notify: { info: () => {}, warn: () => {}, error: () => {} },
    confirmDialog: async () => true,
    createChatMessage: async () => ({}),
    getChatSpeaker: () => ({})
  };

  return { ...base, ...overrides };
}

// ============================================================================
// isAlchemyMode detection
// ============================================================================

test('isAlchemyMode is false when no craftingSystemManager provided', () => {
  const services = createMockServices({ getCraftingSystemManager: () => null });
  const store = createCraftingStore(services);
  assert.equal(get(store.isAlchemyMode), false);
});

test('isAlchemyMode is false when active system is simple mode', async () => {
  const simpleSystem = makeSimpleSystem();
  const services = createMockServices({
    getCraftingSystemManager: () => ({
      getSystems: () => [simpleSystem]
    })
  });
  const store = createCraftingStore(services);
  await store.refresh();
  assert.equal(get(store.isAlchemyMode), false);
});

test('isAlchemyMode is true when active system is alchemy mode', async () => {
  const alchemySystem = makeAlchemySystem();
  const services = createMockServices({
    getCraftingSystemManager: () => ({
      getSystems: () => [alchemySystem]
    })
  });
  const store = createCraftingStore(services);
  await store.refresh();
  assert.equal(get(store.isAlchemyMode), true);
});

test('isAlchemyMode stays false in multi-system worlds when visible recipes belong to a simple system', async () => {
  const simpleSystem = makeSimpleSystem();
  const alchemySystem = makeAlchemySystem();
  const simpleRecipe = makeRecipe('simple-recipe', simpleSystem.id, 'Simple Recipe');
  const alchemyRecipe = makeRecipe('alchemy-recipe', alchemySystem.id, 'Alchemy Recipe');

  const services = createMockServices({
    getRecipeManager: () => ({
      getRecipes: () => [simpleRecipe, alchemyRecipe],
      getRecipe: (id) => [simpleRecipe, alchemyRecipe].find(recipe => recipe.id === id) || null,
      evaluateCraftability: () => ({
        canCraft: true,
        satisfiableSet: {},
        missing: { ingredients: [], essences: [], catalysts: [] },
        ingredientStates: [],
        essenceStates: [],
        catalystStates: []
      })
    }),
    getRecipeVisibilityService: () => ({
      evaluateRecipeAccess: ({ recipe }) => ({
        visible: recipe.id === simpleRecipe.id,
        craftable: recipe.id === simpleRecipe.id,
        reason: 'ok'
      })
    }),
    getCraftingSystemManager: () => ({
      getSystems: () => [simpleSystem, alchemySystem]
    })
  });

  const store = createCraftingStore(services);
  await store.refresh();

  assert.equal(get(store.isAlchemyMode), false);
});

// ============================================================================
// submitAlchemyAttempt — delegates to submitWorkbench
// ============================================================================

test('submitAlchemyAttempt notifies warn when workbench is empty', async () => {
  const warns = [];
  const services = createMockServices({
    getCraftingEngine: () => ({ craftAlchemy: async () => ({ success: false }) }),
    getCraftingSystemManager: () => ({
      getSystems: () => [makeAlchemySystem()]
    }),
    notify: { info: () => {}, warn: (m) => warns.push(m), error: () => {} }
  });
  const store = createCraftingStore(services);
  await store.refresh();
  // No workbench items added

  await store.submitAlchemyAttempt();

  assert.ok(warns.length > 0, 'should warn about empty workbench');
});

test('submitAlchemyAttempt notifies error when no crafting engine', async () => {
  const errors = [];
  const alchemySystem = makeAlchemySystem();
  const component = { id: 'comp-1', name: 'Iron Ore', img: null };
  alchemySystem.components = [component];

  const services = createMockServices({
    getCraftingEngine: () => null,
    getCraftingSystemManager: () => ({
      getSystems: () => [alchemySystem]
    }),
    getSetting: (key) => {
      if (key === 'lastComponentSources') return ['a1'];
      return null;
    },
    getOwnedActors: () => [makeActor('a1', 'Alice')],
    getAvailableActors: () => [makeActor('a1', 'Alice')],
    notify: { info: () => {}, warn: () => {}, error: (m) => errors.push(m) }
  });
  const store = createCraftingStore(services);
  await store.refresh();

  // Add a workbench entry so we get past the empty check
  store.addToWorkbench('comp-1');

  await store.submitAlchemyAttempt();

  assert.ok(errors.some(m => m.includes('engine') || m.includes('unavailable')));
});

test('submitAlchemyAttempt delegates to submitWorkbench with workbench contents', async () => {
  let capturedArgs = null;
  const alchemySystem = makeAlchemySystem();
  const component = { id: 'comp-1', name: 'Iron Ore', img: null };
  alchemySystem.components = [component];

  const actor = makeActor('a1', 'Alice');
  // Give actor an item matching the component
  actor.items = new Map([['item-1', { id: 'item-1', name: 'Iron Ore', uuid: 'Item.item-1', system: { quantity: 5 } }]]);
  actor.items[Symbol.iterator] = function* () { yield* this.values(); };

  const services = createMockServices({
    getOwnedActors: () => [actor],
    getAvailableActors: () => [actor],
    getSetting: (key) => {
      if (key === 'lastComponentSources') return ['a1'];
      return null;
    },
    getCraftingEngine: () => ({
      craftAlchemy: async (a, sources, items, opts) => {
        capturedArgs = { a, sources, items, opts };
        return { success: true, message: 'Crafted!' };
      }
    }),
    getCraftingSystemManager: () => ({
      getSystems: () => [alchemySystem]
    })
  });

  const store = createCraftingStore(services);
  await store.refresh();
  store.addToWorkbench('comp-1');

  await store.submitAlchemyAttempt();

  assert.ok(capturedArgs !== null, 'craftAlchemy should have been called');
  assert.equal(capturedArgs.opts.craftingSystemId, alchemySystem.id);
});

test('submitAlchemyAttempt clears workbench after attempt', async () => {
  const alchemySystem = makeAlchemySystem();
  const component = { id: 'comp-1', name: 'Iron Ore', img: null };
  alchemySystem.components = [component];

  const actor = makeActor('a1', 'Alice');
  actor.items = new Map([['item-1', { id: 'item-1', name: 'Iron Ore', uuid: 'Item.item-1', system: { quantity: 5 } }]]);
  actor.items[Symbol.iterator] = function* () { yield* this.values(); };

  const services = createMockServices({
    getOwnedActors: () => [actor],
    getAvailableActors: () => [actor],
    getSetting: (key) => {
      if (key === 'lastComponentSources') return ['a1'];
      return null;
    },
    getCraftingEngine: () => ({
      craftAlchemy: async () => ({ success: false, message: 'No match', disposition: 'no-match' })
    }),
    getCraftingSystemManager: () => ({
      getSystems: () => [alchemySystem]
    }),
    notify: { info: () => {}, warn: () => {}, error: () => {} }
  });

  const store = createCraftingStore(services);
  await store.refresh();
  store.addToWorkbench('comp-1');
  assert.equal(get(store.workbench).length, 1, 'workbench should have 1 entry before attempt');

  await store.submitAlchemyAttempt();

  assert.equal(get(store.workbench).length, 0, 'workbench should be cleared after attempt');
});

// ============================================================================
// Store shape — key exports still present
// ============================================================================

test('createCraftingStore exports alchemy-related stores and actions', () => {
  const services = createMockServices();
  const store = createCraftingStore(services);

  assert.ok('isAlchemyMode' in store, 'isAlchemyMode should be exported');
  assert.ok('submitAlchemyAttempt' in store, 'submitAlchemyAttempt should be exported');
  // New workbench API
  assert.ok('workbench' in store, 'workbench should be exported');
  assert.ok('addToWorkbench' in store, 'addToWorkbench should be exported');
  assert.ok('removeFromWorkbench' in store, 'removeFromWorkbench should be exported');
  assert.ok('clearWorkbench' in store, 'clearWorkbench should be exported');
  assert.ok('submitWorkbench' in store, 'submitWorkbench should be exported');
  // Legacy API no longer exported
  assert.ok(!('alchemyItems' in store), 'alchemyItems should NOT be exported (deprecated)');
  assert.ok(!('addAlchemyItem' in store), 'addAlchemyItem should NOT be exported (deprecated)');
  assert.ok(!('removeAlchemyItem' in store), 'removeAlchemyItem should NOT be exported (deprecated)');
  assert.ok(!('clearAlchemyItems' in store), 'clearAlchemyItems should NOT be exported (deprecated)');
});
