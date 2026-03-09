/**
 * Tests for T-099: craftingStore cauldron mode
 * Covers isCauldronMode detection, cauldron item management, and submitCauldronAttempt.
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

function makeCauldronSystem(id = 'cauldron-sys') {
  return { id, resolutionMode: 'cauldron', cauldron: { learnOnCraft: true, consumeOnFail: true } };
}

function makeSimpleSystem(id = 'simple-sys') {
  return { id, resolutionMode: 'simple', cauldron: null };
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
// isCauldronMode detection
// ============================================================================

test('isCauldronMode is false when no craftingSystemManager provided', () => {
  const services = createMockServices({ getCraftingSystemManager: () => null });
  const store = createCraftingStore(services);
  assert.equal(get(store.isCauldronMode), false);
});

test('isCauldronMode is false when active system is simple mode', async () => {
  const simpleSystem = makeSimpleSystem();
  const services = createMockServices({
    getCraftingSystemManager: () => ({
      getSystems: () => [simpleSystem]
    })
  });
  const store = createCraftingStore(services);
  await store.refresh();
  assert.equal(get(store.isCauldronMode), false);
});

test('isCauldronMode is true when active system is cauldron mode', async () => {
  const cauldronSystem = makeCauldronSystem();
  const services = createMockServices({
    getCraftingSystemManager: () => ({
      getSystems: () => [cauldronSystem]
    })
  });
  const store = createCraftingStore(services);
  await store.refresh();
  assert.equal(get(store.isCauldronMode), true);
});

// ============================================================================
// Cauldron item management
// ============================================================================

test('addCauldronItem appends item to cauldronItems store', () => {
  const services = createMockServices();
  const store = createCraftingStore(services);

  const item = makeItem('i1');
  store.addCauldronItem(item);

  const items = get(store.cauldronItems);
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'i1');
});

test('addCauldronItem ignores null/undefined', () => {
  const services = createMockServices();
  const store = createCraftingStore(services);

  store.addCauldronItem(null);
  store.addCauldronItem(undefined);

  const items = get(store.cauldronItems);
  assert.equal(items.length, 0);
});

test('removeCauldronItem removes item at given index', () => {
  const services = createMockServices();
  const store = createCraftingStore(services);

  store.addCauldronItem(makeItem('i1'));
  store.addCauldronItem(makeItem('i2'));
  store.addCauldronItem(makeItem('i3'));

  store.removeCauldronItem(1); // remove i2

  const items = get(store.cauldronItems);
  assert.equal(items.length, 2);
  assert.equal(items[0].id, 'i1');
  assert.equal(items[1].id, 'i3');
});

test('clearCauldronItems empties the store', () => {
  const services = createMockServices();
  const store = createCraftingStore(services);

  store.addCauldronItem(makeItem('i1'));
  store.addCauldronItem(makeItem('i2'));

  store.clearCauldronItems();

  assert.equal(get(store.cauldronItems).length, 0);
});

// ============================================================================
// submitCauldronAttempt
// ============================================================================

test('submitCauldronAttempt notifies error when no crafting engine', async () => {
  const messages = [];
  const services = createMockServices({
    getCraftingEngine: () => null,
    getCraftingSystemManager: () => ({
      getSystems: () => [makeCauldronSystem()]
    }),
    notify: { info: () => {}, warn: () => {}, error: (m) => messages.push(m) }
  });
  const store = createCraftingStore(services);
  store.addCauldronItem(makeItem('i1'));

  await store.submitCauldronAttempt();

  assert.ok(messages.some(m => m.includes('engine') || m.includes('unavailable')));
});

test('submitCauldronAttempt notifies warn when no items submitted', async () => {
  const warns = [];
  const services = createMockServices({
    getCraftingEngine: () => ({ craftCauldron: async () => ({ success: false }) }),
    getCraftingSystemManager: () => ({
      getSystems: () => [makeCauldronSystem()]
    }),
    notify: { info: () => {}, warn: (m) => warns.push(m), error: () => {} }
  });
  const store = createCraftingStore(services);
  // No items added

  await store.submitCauldronAttempt();

  assert.ok(warns.length > 0, 'should warn about empty ingredients');
});

test('submitCauldronAttempt calls craftCauldron with submitted items', async () => {
  let capturedArgs = null;
  const cauldronSystem = makeCauldronSystem();

  const services = createMockServices({
    getOwnedActors: () => [makeActor('a1', 'Alice')],
    getAvailableActors: () => [makeActor('a1', 'Alice')],
    getSetting: (key) => {
      if (key === 'lastComponentSources') return ['a1'];
      return null;
    },
    getCraftingEngine: () => ({
      craftCauldron: async (actor, sources, items, opts) => {
        capturedArgs = { actor, sources, items, opts };
        return { success: true, message: 'Crafted!' };
      }
    }),
    getCraftingSystemManager: () => ({
      getSystems: () => [cauldronSystem]
    })
  });

  const store = createCraftingStore(services);
  await store.refresh(); // ensure actor is resolved

  const item = makeItem('i1');
  store.addCauldronItem(item);

  await store.submitCauldronAttempt();

  assert.ok(capturedArgs, 'craftCauldron should have been called');
  assert.equal(capturedArgs.items.length, 1);
  assert.equal(capturedArgs.items[0].id, 'i1');
  assert.equal(capturedArgs.opts.craftingSystemId, 'cauldron-sys');
});

test('submitCauldronAttempt clears cauldron items after attempt', async () => {
  const cauldronSystem = makeCauldronSystem();
  const services = createMockServices({
    getOwnedActors: () => [makeActor('a1', 'Alice')],
    getAvailableActors: () => [makeActor('a1', 'Alice')],
    getSetting: (key) => {
      if (key === 'lastComponentSources') return ['a1'];
      return null;
    },
    getCraftingEngine: () => ({
      craftCauldron: async () => ({ success: false, message: 'No match', disposition: 'no-match' })
    }),
    getCraftingSystemManager: () => ({
      getSystems: () => [cauldronSystem]
    }),
    notify: { info: () => {}, warn: () => {}, error: () => {} }
  });

  const store = createCraftingStore(services);
  await store.refresh();

  store.addCauldronItem(makeItem('i1'));
  store.addCauldronItem(makeItem('i2'));

  await store.submitCauldronAttempt();

  assert.equal(get(store.cauldronItems).length, 0, 'cauldron items should be cleared after attempt');
});

// ============================================================================
// Store shape — new exports present
// ============================================================================

test('createCraftingStore exports cauldron-related stores and actions', () => {
  const services = createMockServices();
  const store = createCraftingStore(services);

  assert.ok('isCauldronMode' in store, 'isCauldronMode should be exported');
  assert.ok('cauldronItems' in store, 'cauldronItems should be exported');
  assert.ok('addCauldronItem' in store, 'addCauldronItem should be exported');
  assert.ok('removeCauldronItem' in store, 'removeCauldronItem should be exported');
  assert.ok('clearCauldronItems' in store, 'clearCauldronItems should be exported');
  assert.ok('submitCauldronAttempt' in store, 'submitCauldronAttempt should be exported');
});
