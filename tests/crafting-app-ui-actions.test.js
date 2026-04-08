import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { createCraftingStore } from '../src/ui/svelte/stores/craftingStore.js';

globalThis.game = {
  i18n: {
    localize: (key) => `loc:${key}`,
    format: (key, data) => `loc:${key}:${data?.name || ''}`
  }
};

function makeActor(id = 'a1', name = 'Crafter') {
  return {
    id,
    uuid: `Actor.${id}`,
    name,
    isOwner: true,
    items: []
  };
}

function makeRecipe(id = 'r1', name = 'Potion') {
  return {
    id,
    name,
    description: '',
    img: 'icons/svg/item-bag.svg',
    category: 'alchemy',
    ingredientSets: [],
    results: [],
    steps: [],
    getResultDescription: () => '1x Result',
    isSimpleRecipe: () => false
  };
}

function emptyEvaluation() {
  return {
    canCraft: true,
    satisfiableSet: {},
    missing: { ingredients: [], essences: [], catalysts: [] },
    ingredientStates: [],
    essenceStates: [],
    catalystStates: []
  };
}

function makeServices(overrides = {}) {
  const actor = makeActor();
  const recipes = [makeRecipe('r1', 'Potion'), makeRecipe('r2', 'Elixir')];
  const settings = {
    favouriteRecipes: [],
    recentlyCrafted: [],
    autoCraft: false,
    showSimpleRecipesOnly: false,
    lastCraftingActor: actor.id,
    lastComponentSources: [actor.id]
  };
  const runManager = {
    getActiveRuns: () => [],
    getRunHistory: () => [],
    getActiveRun: () => null,
    cancelRun: async () => true
  };

  const services = {
    getSetting: (key) => settings[key] ?? null,
    setSetting: async (key, value) => { settings[key] = value; },
    getRecipeManager: () => ({
      getRecipes: () => recipes,
      getRecipe: (id) => recipes.find(recipe => recipe.id === id) || null,
      evaluateCraftability: () => emptyEvaluation()
    }),
    getRecipeVisibilityService: () => null,
    getCraftingRunManager: () => runManager,
    getSalvageRunManager: () => ({
      getActiveRuns: () => [],
      getRunHistory: () => [],
      getActiveRun: () => null,
      cancelRun: async () => true
    }),
    getCraftingEngine: () => ({
      craft: async () => ({ success: true, message: 'Crafted!' })
    }),
    getCraftingSystemManager: () => ({ getSystems: () => [], getSystem: () => null }),
    getAvailableActors: () => [actor],
    getOwnedActors: () => [actor],
    getGameUser: () => ({ id: 'user-1', character: actor }),
    getWorldTime: () => 1000,
    notify: { info: () => {}, warn: () => {}, error: () => {} },
    confirmDialog: async () => true,
    createChatMessage: async () => ({}),
    getChatSpeaker: () => ({})
  };

  return { ...services, ...overrides, _settings: settings, _actor: actor, _recipes: recipes, _runManager: runManager };
}

test('crafting store forwards runId and skips confirmation when skipConfirm is true', async () => {
  let confirmCalls = 0;
  let craftArgs = null;
  let errorMessage = null;
  const services = makeServices({
    confirmDialog: async () => {
      confirmCalls += 1;
      return true;
    },
    getCraftingEngine: () => ({
      craft: async (...args) => {
        craftArgs = args;
        return { success: false, message: 'blocked for test' };
      }
    }),
    notify: {
      info: () => {},
      warn: () => {},
      error: (message) => { errorMessage = message; }
    }
  });
  const store = createCraftingStore(services);

  await store.craft('r1', { runId: 'run-42', skipConfirm: true });

  assert.equal(confirmCalls, 0);
  assert.equal(craftArgs[4].runId, 'run-42');
  assert.equal(errorMessage, 'blocked for test');
});

test('crafting store restartRun cancels the active run and re-crafts without a continuation runId', async () => {
  let cancelRunArgs = null;
  let craftArgs = null;
  const services = makeServices();
  services._runManager.getActiveRun = () => ({ id: 'run-9', recipeId: 'r1', status: 'inProgress' });
  services._runManager.cancelRun = async (...args) => {
    cancelRunArgs = args;
    return { id: 'run-9', status: 'cancelled' };
  };
  services.getCraftingEngine = () => ({
    craft: async (...args) => {
      craftArgs = args;
      return { success: true, message: 'Crafted!' };
    }
  });
  const store = createCraftingStore(services);

  await store.restartRun('r1', 'run-9');

  assert.equal(cancelRunArgs[0], services._actor);
  assert.equal(cancelRunArgs[1], 'run-9');
  assert.equal(craftArgs[2].id, 'r1');
  assert.equal(craftArgs[4].runId, null);
});

test('crafting store learnRecipe localizes visibility service messages', async () => {
  let infoMessage = null;
  const services = makeServices({
    getRecipeVisibilityService: () => ({
      evaluateRecipeAccess: () => ({ visible: true, craftable: true, reason: 'ok' }),
      learnRecipe: async () => ({
        success: true,
        message: 'FABRICATE.Knowledge.LearnedRecipe',
        messageData: { name: 'Potion' }
      })
    }),
    notify: {
      info: (message) => { infoMessage = message; },
      warn: () => {},
      error: () => {}
    }
  });
  const store = createCraftingStore(services);

  await store.learnRecipe('r1');

  assert.equal(infoMessage, 'loc:FABRICATE.Knowledge.LearnedRecipe:Potion');
});

test('crafting store groups active runs by recipe and prefers the latest active run', async () => {
  const services = makeServices();
  services._runManager.getActiveRuns = () => [
    { id: 'run-old', recipeId: 'r1', status: 'inProgress', startedAt: 100, currentStepIndex: 0, steps: [{ stepName: 'Step 1', status: 'inProgress' }] },
    { id: 'run-new', recipeId: 'r1', status: 'waitingTime', startedAt: 200, currentStepIndex: 0, steps: [{ stepName: 'Step 1', status: 'waitingTime', timeGate: { availableAt: 2000 } }] }
  ];
  services._runManager.getRunHistory = () => [
    { id: 'run-history', recipeId: 'r1', status: 'succeeded', startedAt: 10, finishedAt: 20, currentStepIndex: null, steps: [{ stepName: 'Step 1', status: 'succeeded' }] }
  ];
  const store = createCraftingStore(services);

  await store.refresh();

  const viewState = get(store.viewState);
  assert.equal(viewState.activeRuns.length, 2);
  assert.equal(viewState.activeRuns[0].id, 'run-new');
  assert.equal(viewState.runHistory.length, 1);
  const recipeRow = viewState.recipes.find(recipe => recipe.id === 'r1');
  assert.equal(recipeRow.activeRunCount, 2);
  assert.equal(recipeRow.hasMultipleActiveRuns, true);
  assert.equal(recipeRow.activeRunId, 'run-new');
  assert.equal(recipeRow.craftButtonLabel, 'Waiting');
});

test('crafting store refresh tolerates multi-step recipes with empty top-level ingredientSets', async () => {
  const multiStepRecipe = {
    id: 'r-multi-step',
    name: 'Complex Potion',
    description: '',
    img: 'icons/svg/item-bag.svg',
    category: 'alchemy',
    ingredientSets: [],
    results: [
      { id: 'i-potion', itemId: 'i-potion', name: 'Potion', quantity: 1 }
    ],
    steps: [
      {
        id: 'step-1',
        name: 'Prepare Base',
        ingredientSets: [
          { ingredients: [{ id: 'i-herb', itemId: 'i-herb', name: 'Herb', quantity: 1 }] }
        ],
        results: []
      },
      {
        id: 'step-2',
        name: 'Finish Brew',
        ingredientSets: [
          { ingredients: [{ id: 'i-water', itemId: 'i-water', name: 'Water', quantity: 1 }] }
        ],
        results: [{ id: 'i-potion', itemId: 'i-potion', name: 'Potion', quantity: 1 }]
      }
    ],
    getResultDescription: () => '1x Potion',
    isSimpleRecipe: () => false
  };

  const services = makeServices({
    getRecipeManager: () => ({
      getRecipes: () => [multiStepRecipe],
      getRecipe: (id) => id === multiStepRecipe.id ? multiStepRecipe : null,
      evaluateCraftability: () => ({
        canCraft: true,
        satisfiableSet: {},
        missing: { ingredients: [], essences: [], catalysts: [] },
        ingredientStates: [],
        essenceStates: [],
        catalystStates: []
      })
    })
  });
  const store = createCraftingStore(services);

  await assert.doesNotReject(async () => {
    await store.refresh();
  });

  const viewState = get(store.viewState);
  assert.ok(viewState.recipes.find(r => r.id === 'r-multi-step'));
});
