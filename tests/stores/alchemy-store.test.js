/**
 * Tests for T-099: craftingStore alchemy mode
 * Covers isAlchemyMode detection, alchemy item management, and submitAlchemyAttempt.
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

function makeItem(id) {
  return { id, uuid: `Item.${id}`, name: `Item-${id}`, img: 'icon.png' };
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
    autoCraft: true,
    showSimpleRecipesOnly: false
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
// Alchemy item management
// ============================================================================

test('addAlchemyItem appends item to alchemyItems store', () => {
  const services = createMockServices();
  const store = createCraftingStore(services);

  const item = makeItem('i1');
  store.addAlchemyItem(item);

  const items = get(store.alchemyItems);
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'i1');
});

test('addAlchemyItem ignores null/undefined', () => {
  const services = createMockServices();
  const store = createCraftingStore(services);

  store.addAlchemyItem(null);
  store.addAlchemyItem(undefined);

  const items = get(store.alchemyItems);
  assert.equal(items.length, 0);
});

test('removeAlchemyItem removes item at given index', () => {
  const services = createMockServices();
  const store = createCraftingStore(services);

  store.addAlchemyItem(makeItem('i1'));
  store.addAlchemyItem(makeItem('i2'));
  store.addAlchemyItem(makeItem('i3'));

  store.removeAlchemyItem(1); // remove i2

  const items = get(store.alchemyItems);
  assert.equal(items.length, 2);
  assert.equal(items[0].id, 'i1');
  assert.equal(items[1].id, 'i3');
});

test('clearAlchemyItems empties the store', () => {
  const services = createMockServices();
  const store = createCraftingStore(services);

  store.addAlchemyItem(makeItem('i1'));
  store.addAlchemyItem(makeItem('i2'));

  store.clearAlchemyItems();

  assert.equal(get(store.alchemyItems).length, 0);
});

// ============================================================================
// submitAlchemyAttempt
// ============================================================================

test('submitAlchemyAttempt notifies error when no crafting engine', async () => {
  const messages = [];
  const services = createMockServices({
    getCraftingEngine: () => null,
    getCraftingSystemManager: () => ({
      getSystems: () => [makeAlchemySystem()]
    }),
    notify: { info: () => {}, warn: () => {}, error: (m) => messages.push(m) }
  });
  const store = createCraftingStore(services);
  store.addAlchemyItem(makeItem('i1'));

  await store.submitAlchemyAttempt();

  assert.ok(messages.some(m => m.includes('engine') || m.includes('unavailable')));
});

test('submitAlchemyAttempt notifies warn when no items submitted', async () => {
  const warns = [];
  const services = createMockServices({
    getCraftingEngine: () => ({ craftAlchemy: async () => ({ success: false }) }),
    getCraftingSystemManager: () => ({
      getSystems: () => [makeAlchemySystem()]
    }),
    notify: { info: () => {}, warn: (m) => warns.push(m), error: () => {} }
  });
  const store = createCraftingStore(services);
  // No items added

  await store.submitAlchemyAttempt();

  assert.ok(warns.length > 0, 'should warn about empty ingredients');
});

test('submitAlchemyAttempt calls craftAlchemy with submitted items', async () => {
  let capturedArgs = null;
  const alchemySystem = makeAlchemySystem();

  const services = createMockServices({
    getOwnedActors: () => [makeActor('a1', 'Alice')],
    getAvailableActors: () => [makeActor('a1', 'Alice')],
    getSetting: (key) => {
      if (key === 'lastComponentSources') return ['a1'];
      return null;
    },
    getCraftingEngine: () => ({
      craftAlchemy: async (actor, sources, items, opts) => {
        capturedArgs = { actor, sources, items, opts };
        return { success: true, message: 'Crafted!' };
      }
    }),
    getCraftingSystemManager: () => ({
      getSystems: () => [alchemySystem]
    })
  });

  const store = createCraftingStore(services);
  await store.refresh(); // ensure actor is resolved

  const item = makeItem('i1');
  store.addAlchemyItem(item);

  await store.submitAlchemyAttempt();

  assert.ok(capturedArgs, 'craftAlchemy should have been called');
  assert.equal(capturedArgs.items.length, 1);
  assert.equal(capturedArgs.items[0].id, 'i1');
  assert.equal(capturedArgs.opts.craftingSystemId, 'alchemy-sys');
});

test('submitAlchemyAttempt uses the active alchemy recipe system in multi-system worlds', async () => {
  let capturedArgs = null;
  const simpleSystem = makeSimpleSystem();
  const alchemySystem = makeAlchemySystem();
  const simpleRecipe = makeRecipe('simple-recipe', simpleSystem.id, 'Simple Recipe');
  const alchemyRecipe = makeRecipe('alchemy-recipe', alchemySystem.id, 'Alchemy Recipe');

  const services = createMockServices({
    getOwnedActors: () => [makeActor('a1', 'Alice')],
    getAvailableActors: () => [makeActor('a1', 'Alice')],
    getSetting: (key) => {
      if (key === 'lastComponentSources') return ['a1'];
      return null;
    },
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
        visible: recipe.id === alchemyRecipe.id,
        craftable: recipe.id === alchemyRecipe.id,
        reason: 'ok'
      })
    }),
    getCraftingEngine: () => ({
      craftAlchemy: async (actor, sources, items, opts) => {
        capturedArgs = { actor, sources, items, opts };
        return { success: true, message: 'Crafted!' };
      }
    }),
    getCraftingSystemManager: () => ({
      getSystems: () => [simpleSystem, alchemySystem]
    })
  });

  const store = createCraftingStore(services);
  await store.refresh();
  store.addAlchemyItem(makeItem('i1'));

  await store.submitAlchemyAttempt();

  assert.ok(capturedArgs, 'craftAlchemy should have been called');
  assert.equal(capturedArgs.opts.craftingSystemId, alchemySystem.id);
});

test('submitAlchemyAttempt clears alchemy items after attempt', async () => {
  const alchemySystem = makeAlchemySystem();
  const services = createMockServices({
    getOwnedActors: () => [makeActor('a1', 'Alice')],
    getAvailableActors: () => [makeActor('a1', 'Alice')],
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

  store.addAlchemyItem(makeItem('i1'));
  store.addAlchemyItem(makeItem('i2'));

  await store.submitAlchemyAttempt();

  assert.equal(get(store.alchemyItems).length, 0, 'alchemy items should be cleared after attempt');
});

// ============================================================================
// Store shape -- new exports present
// ============================================================================

test('createCraftingStore exports alchemy-related stores and actions', () => {
  const services = createMockServices();
  const store = createCraftingStore(services);

  assert.ok('isAlchemyMode' in store, 'isAlchemyMode should be exported');
  assert.ok('alchemyItems' in store, 'alchemyItems should be exported');
  assert.ok('addAlchemyItem' in store, 'addAlchemyItem should be exported');
  assert.ok('removeAlchemyItem' in store, 'removeAlchemyItem should be exported');
  assert.ok('clearAlchemyItems' in store, 'clearAlchemyItems should be exported');
  assert.ok('submitAlchemyAttempt' in store, 'submitAlchemyAttempt should be exported');
});
