/**
 * Tests for #156: palette recomputation guard inside refresh().
 *
 * Verifies that _buildPalette is not called on every refresh() when the
 * alchemy system and source actors have not changed, and that it IS called
 * when they change or when workbench actions trigger it directly.
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

function makeAlchemySystem(id = 'alchemy-sys') {
  return {
    id,
    resolutionMode: 'alchemy',
    alchemy: { learnOnCraft: true, consumeOnFail: true },
    components: [{ id: 'comp-1', name: 'Iron Ore', img: null }]
  };
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

/**
 * Subscribe to a store and return a counter object plus an unsubscribe fn.
 * The initial synchronous call on subscribe() is NOT counted.
 */
function countUpdates(store) {
  const counter = { count: 0 };
  let initialized = false;
  const unsub = store.subscribe(() => {
    if (!initialized) { initialized = true; return; }
    counter.count++;
  });
  return { counter, unsub };
}

// ============================================================================
// AC1: palette NOT recomputed when search term changes (system/actors same)
// ============================================================================

test('palette is not recomputed when search term changes without system or actor change', async () => {
  const alchemySystem = makeAlchemySystem();
  const actorA = makeActor('a1', 'Alice');
  const services = createMockServices({
    getCraftingSystemManager: () => ({ getSystems: () => [alchemySystem] }),
    getOwnedActors: () => [actorA],
    getAvailableActors: () => [actorA],
    getSetting: (key) => key === 'lastComponentSources' ? ['a1'] : null
  });

  const store = createCraftingStore(services);
  // Initial refresh establishes the baseline
  await store.refresh();

  const { counter, unsub } = countUpdates(store.palette);

  // setSearch triggers refresh() but system and actors haven't changed
  await store.setSearch('iron');
  await store.setSearch('ore');

  unsub();
  assert.equal(counter.count, 0, 'palette should not be recomputed when only search term changes');
});

// ============================================================================
// AC2: palette IS recomputed when selected alchemy system changes
// ============================================================================

test('palette is recomputed when the selected alchemy system changes', async () => {
  const system1 = makeAlchemySystem('sys-1');
  const system2 = makeAlchemySystem('sys-2');
  system2.components = [{ id: 'comp-2', name: 'Silver', img: null }];

  const actorA = makeActor('a1', 'Alice');
  const services = createMockServices({
    getCraftingSystemManager: () => ({ getSystems: () => [system1, system2] }),
    getOwnedActors: () => [actorA],
    getAvailableActors: () => [actorA],
    getSetting: (key) => key === 'lastComponentSources' ? ['a1'] : null
  });

  const store = createCraftingStore(services);
  await store.refresh();

  const { counter, unsub } = countUpdates(store.palette);

  // Switch to a different system — selectAlchemySystem calls _recomputePalette directly,
  // and subsequent refresh() calls will also see a new systemId.
  await store.selectAlchemySystem('sys-2');

  unsub();
  assert.ok(counter.count >= 1, 'palette should be recomputed when alchemy system changes');
});

// ============================================================================
// AC3: palette IS recomputed when component source actors change
// ============================================================================

test('palette is recomputed when component source actors change', async () => {
  const alchemySystem = makeAlchemySystem();
  const actorA = makeActor('a1', 'Alice');
  const actorB = makeActor('b1', 'Bob');

  const settings = { lastComponentSources: ['a1'] };
  const services = createMockServices({
    getCraftingSystemManager: () => ({ getSystems: () => [alchemySystem] }),
    getOwnedActors: () => [actorA, actorB],
    getAvailableActors: () => [actorA, actorB],
    getSetting: (key) => settings[key] ?? null,
    setSetting: async (key, value) => { settings[key] = value; }
  });

  const store = createCraftingStore(services);
  await store.refresh();

  const { counter, unsub } = countUpdates(store.palette);

  // Toggle actor B on — changes componentSourceActors
  await store.toggleSourceActor('b1', true);

  unsub();
  assert.ok(counter.count >= 1, 'palette should be recomputed when source actors change');
});

// ============================================================================
// AC4: workbench add/remove still triggers palette recomputation
// ============================================================================

test('addToWorkbench triggers palette recomputation', async () => {
  const alchemySystem = makeAlchemySystem();
  const actorA = makeActor('a1', 'Alice');
  actorA.items = new Map([
    ['item-1', { id: 'item-1', name: 'Iron Ore', uuid: 'Item.item-1', system: { quantity: 5 } }]
  ]);
  actorA.items[Symbol.iterator] = function* () { yield* this.values(); };

  const services = createMockServices({
    getCraftingSystemManager: () => ({ getSystems: () => [alchemySystem] }),
    getOwnedActors: () => [actorA],
    getAvailableActors: () => [actorA],
    getSetting: (key) => key === 'lastComponentSources' ? ['a1'] : null
  });

  const store = createCraftingStore(services);
  await store.refresh();

  const { counter, unsub } = countUpdates(store.palette);

  store.addToWorkbench('comp-1');

  unsub();
  assert.ok(counter.count >= 1, 'palette should be recomputed when adding to workbench');
});

test('removeFromWorkbench triggers palette recomputation', async () => {
  const alchemySystem = makeAlchemySystem();
  const actorA = makeActor('a1', 'Alice');
  actorA.items = new Map([
    ['item-1', { id: 'item-1', name: 'Iron Ore', uuid: 'Item.item-1', system: { quantity: 5 } }]
  ]);
  actorA.items[Symbol.iterator] = function* () { yield* this.values(); };

  const services = createMockServices({
    getCraftingSystemManager: () => ({ getSystems: () => [alchemySystem] }),
    getOwnedActors: () => [actorA],
    getAvailableActors: () => [actorA],
    getSetting: (key) => key === 'lastComponentSources' ? ['a1'] : null
  });

  const store = createCraftingStore(services);
  await store.refresh();
  store.addToWorkbench('comp-1');

  const { counter, unsub } = countUpdates(store.palette);

  store.removeFromWorkbench('comp-1');

  unsub();
  assert.ok(counter.count >= 1, 'palette should be recomputed when removing from workbench');
});

// ============================================================================
// AC5 variant: multiple unrelated refresh() calls do not pile up palette work
// ============================================================================

test('repeated refresh() calls without system/actor change do not recompute palette', async () => {
  const alchemySystem = makeAlchemySystem();
  const actorA = makeActor('a1', 'Alice');
  const services = createMockServices({
    getCraftingSystemManager: () => ({ getSystems: () => [alchemySystem] }),
    getOwnedActors: () => [actorA],
    getAvailableActors: () => [actorA],
    getSetting: (key) => key === 'lastComponentSources' ? ['a1'] : null
  });

  const store = createCraftingStore(services);
  await store.refresh();

  const { counter, unsub } = countUpdates(store.palette);

  // Trigger several refreshes that don't touch system or actors
  await store.refresh();
  await store.refresh();
  await store.refresh();

  unsub();
  assert.equal(counter.count, 0, 'palette should not be recomputed on repeated refresh() with unchanged inputs');
});
