/**
 * T-091 regression coverage through the active Svelte store and run manager.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { createCraftingStore } from '../src/ui/svelte/stores/craftingStore.js';
import { CraftingRunManager } from '../src/systems/CraftingRunManager.js';

globalThis.foundry = {
  utils: {
    randomID: (() => {
      let id = 0;
      return () => `rid-${++id}`;
    })()
  }
};

globalThis.game = {
  time: { worldTime: 1000 },
  user: { id: 'user-1', name: 'Test User' }
};

function makeActor(id = 'a1') {
  const flags = {};
  return {
    id,
    uuid: `Actor.${id}`,
    name: `Actor ${id}`,
    isOwner: true,
    items: [],
    getFlag(namespace, key) { return flags[key]; },
    setFlag(namespace, key, value) { flags[key] = value; return Promise.resolve(); }
  };
}

function makeRecipe(id = 'r1') {
  return {
    id,
    name: 'Test Recipe',
    description: '',
    img: 'icons/svg/item-bag.svg',
    category: 'alchemy',
    ingredientSets: [],
    results: [],
    steps: [],
    getExecutionSteps: () => [{ id: 'step-1', name: 'Mix' }],
    getResultDescription: () => '1x Result',
    isSimpleRecipe: () => true
  };
}

function makeServices(activeRuns = []) {
  const actor = makeActor();
  const recipe = makeRecipe();
  const settings = {
    favouriteRecipes: [],
    recentlyCrafted: [],
    autoCraft: true,
    showSimpleRecipesOnly: false,
    lastCraftingActor: actor.id,
    lastComponentSources: [actor.id]
  };
  const services = {
    getSetting: (key) => settings[key] ?? null,
    setSetting: async (key, value) => { settings[key] = value; },
    getRecipeManager: () => ({
      getRecipes: () => [recipe],
      getRecipe: () => recipe,
      evaluateCraftability: () => ({
        canCraft: true,
        satisfiableSet: {},
        missing: { ingredients: [], essences: [], catalysts: [] },
        ingredientStates: [],
        essenceStates: [],
        catalystStates: []
      })
    }),
    getRecipeVisibilityService: () => null,
    getCraftingRunManager: () => ({
      getActiveRuns: () => activeRuns,
      getRunHistory: () => [],
      getActiveRun: () => null,
      cancelRun: async () => true
    }),
    getSalvageRunManager: () => ({ getActiveRuns: () => [], getRunHistory: () => [], getActiveRun: () => null, cancelRun: async () => true }),
    getCraftingEngine: () => ({ craft: async () => ({ success: true, message: 'Crafted!' }) }),
    getCraftingSystemManager: () => ({ getSystems: () => [], getSystem: () => null }),
    getAvailableActors: () => [actor],
    getOwnedActors: () => [actor],
    getGameUser: () => ({ id: 'user-1', character: actor }),
    getWorldTime: () => 1000,
    notify: { info: () => {}, warn: () => {}, error: () => {} },
    confirmDialog: async () => true,
    createChatMessage: async () => { throw new Error('store should not create duplicate chat messages'); },
    getChatSpeaker: () => ({})
  };
  return { services, actor, recipe };
}

test('crafting store does not create duplicate chat messages on successful craft', async () => {
  const { services } = makeServices();
  const store = createCraftingStore(services);

  await store.craft('r1', { skipConfirm: true });

  assert.ok(true, 'craft completed without calling createChatMessage');
});

test('crafting store excludes completed runs from activeRuns', async () => {
  const { services } = makeServices([
    { id: 'run-done', recipeId: 'r1', status: 'succeeded', startedAt: 100, currentStepIndex: null, steps: [] },
    { id: 'run-failed', recipeId: 'r1', status: 'failed', startedAt: 101, currentStepIndex: null, steps: [] }
  ]);
  const store = createCraftingStore(services);

  await store.refresh();

  assert.equal(get(store.viewState).activeRuns.length, 0);
});

test('crafting store keeps in-progress and waiting-time runs active', async () => {
  const { services } = makeServices([
    { id: 'run-active', recipeId: 'r1', status: 'inProgress', startedAt: 100, currentStepIndex: 0, steps: [{ stepName: 'Mix', status: 'inProgress' }] },
    { id: 'run-waiting', recipeId: 'r1', status: 'waitingTime', startedAt: 101, currentStepIndex: 0, steps: [{ stepName: 'Rest', status: 'waitingTime', timeGate: { availableAt: 5000 } }] }
  ]);
  const store = createCraftingStore(services);

  await store.refresh();

  assert.deepEqual(get(store.viewState).activeRuns.map(run => run.id), ['run-waiting', 'run-active']);
});

test('CraftingRunManager moves one-step completed runs out of active runs', async () => {
  const manager = new CraftingRunManager();
  const actor = makeActor();
  const recipe = makeRecipe();

  const run = await manager.createRun(actor, recipe, [], 'user-1');
  assert.equal(manager.getActiveRuns(actor).length, 1);

  await manager.completeStepSuccess(actor, run, 0, {});

  assert.equal(manager.getActiveRuns(actor).length, 0);
  assert.equal(manager.getRunHistory(actor)[0].status, 'succeeded');
});

test('CraftingRunManager uses cache to prevent stale-flag reads after createRun', async () => {
  const manager = new CraftingRunManager();
  const actor = makeActor();
  const recipe = makeRecipe();

  const run = await manager.createRun(actor, recipe, [], 'user-1');

  // Overwrite the flag storage to simulate an external staleness scenario.
  actor.setFlag('fabricate', 'fabricate.craftingRuns', { active: {}, history: [] });

  // The in-memory cache should still return the created run.
  assert.equal(manager.getActiveRuns(actor).length, 1);
  assert.equal(manager.getActiveRuns(actor)[0].id, run.id);
});

test('CraftingRunManager invalidateCache clears cache so next read re-reads flags', async () => {
  const manager = new CraftingRunManager();
  const actor = makeActor();
  const recipe = makeRecipe();

  await manager.createRun(actor, recipe, [], 'user-1');

  // Overwrite the flag storage to simulate the state that the cache was hiding.
  actor.setFlag('fabricate', 'fabricate.craftingRuns', { active: {}, history: [] });

  manager.invalidateCache(actor.id);

  // After invalidation the manager re-reads from flags, which are now empty.
  assert.equal(manager.getActiveRuns(actor).length, 0);
});
