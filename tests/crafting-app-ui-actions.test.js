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
  const app = Object.create(CraftingApp.prototype);
  app.craftingActor = { id: 'a1', name: 'Crafter' };
  app.componentSourceActors = [{ id: 'a1', name: 'Crafter' }];
  app.render = async () => {};
  app._notifyInfo = () => {};
  app._notifyWarn = () => {};
  app._notifyError = () => {};
  app._createChatMessage = () => {};
  return app;
}

test('CraftingApp._onCraft forwards runId and skips confirm when skipConfirm=true', async () => {
  const app = createAppHarness();
  let confirmCalls = 0;
  let craftArgs = null;
  let errorMessage = null;

  const recipe = { id: 'r1', name: 'Potion' };
  app._getRecipeManager = () => ({ getRecipe: () => recipe });
  app._getSetting = () => false; // would normally require confirm
  app._confirmDialog = async () => {
    confirmCalls += 1;
    return true;
  };
  app._getCraftingEngine = () => ({
    craft: async (...args) => {
      craftArgs = args;
      return { success: false, message: 'blocked for test' };
    }
  });
  app._notifyError = (msg) => {
    errorMessage = msg;
  };

  await CraftingApp._onCraft.call(app, {}, {
    dataset: {
      recipeId: 'r1',
      runId: 'run-42',
      skipConfirm: 'true'
    }
  });

  assert.equal(confirmCalls, 0);
  assert.ok(Array.isArray(craftArgs));
  assert.equal(craftArgs[4]?.runId, 'run-42');
  assert.equal(errorMessage, 'blocked for test');
});

test('CraftingApp._onRestartRun cancels active run and re-invokes craft with skipConfirm', async () => {
  const app = createAppHarness();
  let cancelRunArgs = null;
  let craftInvocation = null;

  app._resolveRunEntry = () => ({ id: 'run-9', recipeId: 'r1' });
  app._getRecipeManager = () => ({
    getRecipe: () => ({ id: 'r1', name: 'Potion' })
  });
  app._confirmDialog = async () => true;
  app._getRunManager = () => ({
    cancelRun: async (...args) => {
      cancelRunArgs = args;
      return { id: 'run-9', status: 'cancelled' };
    }
  });
  app._onCraft = async (event, target) => {
    craftInvocation = { event, target };
  };

  await CraftingApp._onRestartRun.call(app, {}, {
    dataset: {
      recipeId: 'r1',
      runId: 'run-9'
    }
  });

  assert.ok(Array.isArray(cancelRunArgs));
  assert.equal(cancelRunArgs[0], app.craftingActor);
  assert.equal(cancelRunArgs[1], 'run-9');
  assert.ok(craftInvocation);
  assert.equal(craftInvocation.target.dataset.recipeId, 'r1');
  assert.equal(craftInvocation.target.dataset.runId, '');
  assert.equal(craftInvocation.target.dataset.skipConfirm, 'true');
});

test('CraftingApp._onShowRunDetails renders dialog with resolved step IO names', async () => {
  const app = createAppHarness();
  let rendered = null;

  app._resolveRunEntry = () => ({
    id: 'run-1',
    recipeId: 'r1',
    status: 'inProgress',
    currentStepIndex: 0,
    startedAt: 900,
    finishedAt: null,
    steps: [{
      stepName: 'Mix',
      status: 'inProgress',
      consumedIngredients: [{ actorUuid: 'Actor.A', itemUuid: 'Item.Herb', quantity: 2 }],
      usedCatalysts: [{ actorUuid: 'Actor.A', itemUuid: 'Item.Mortar', quantity: 1 }],
      createdResults: [{ actorUuid: 'Actor.A', itemUuid: 'Item.Potion', quantity: 1 }]
    }]
  });
  app._getRecipeManager = () => ({
    getRecipe: () => ({ id: 'r1', name: 'Potion Recipe' })
  });
  app._resolveRunEntityName = async (uuid, fallback) => {
    const map = {
      'Actor.A': 'Alchemist',
      'Item.Herb': 'Herb',
      'Item.Mortar': 'Mortar',
      'Item.Potion': 'Potion'
    };
    return map[uuid] || fallback;
  };
  app._renderDialog = (options) => {
    rendered = options;
  };

  await CraftingApp._onShowRunDetails.call(app, {}, {
    dataset: {
      runId: 'run-1',
      runScope: 'active'
    }
  });

  assert.ok(rendered);
  assert.match(rendered.title, /Run Details/i);
  assert.match(rendered.content, /Herb/);
  assert.match(rendered.content, /Mortar/);
  assert.match(rendered.content, /Potion/);
  assert.match(rendered.content, /Alchemist/);
});

test('CraftingApp._prepareContext groups active runs by recipe and prefers latest run', async () => {
  const app = createAppHarness();
  game.time.worldTime = 1000;
  app.searchTerm = '';
  app.selectedCategory = '';
  app.showOnlyAvailable = false;

  const sourceActor = {
    id: 'a1',
    name: 'Crafter',
    items: []
  };
  app.craftingActor = sourceActor;
  app.componentSourceActors = [sourceActor];
  app._getAvailableActors = () => [sourceActor];
  app._getOwnedActors = () => [sourceActor];
  app._getSetting = (key) => key === 'showSimpleRecipesOnly' ? false : false;
  app._getRecipeVisibilityService = () => null;

  const recipeA = {
    id: 'r1',
    name: 'Recipe One',
    description: '',
    img: 'icons/svg/item-bag.svg',
    category: 'alchemy',
    ingredientSets: [{
      ingredientGroups: [{
        options: [{
          quantity: 1,
          getDescription: () => '1x Herb'
        }]
      }],
      essences: {}
    }],
    getResultDescription: () => '1x Result',
    isSimpleRecipe: () => false
  };
  const recipeB = {
    id: 'r2',
    name: 'Recipe Two',
    description: '',
    img: 'icons/svg/item-bag.svg',
    category: 'alchemy',
    ingredientSets: [{
      ingredientGroups: [{
        options: [{
          quantity: 1,
          getDescription: () => '1x Ore'
        }]
      }],
      essences: {}
    }],
    getResultDescription: () => '1x Result',
    isSimpleRecipe: () => false
  };

  app._getRecipeManager = () => ({
    getRecipes: () => [recipeA, recipeB],
    getRecipe: (id) => ({ r1: recipeA, r2: recipeB }[id] || null),
    canCraft: () => ({ canCraft: true, satisfiableSet: recipeA.ingredientSets[0] }),
    getCatalystsForSet: () => [],
    ingredientMatchesItem: () => false,
    catalystMatchesItem: () => false
  });

  app._getRunManager = () => ({
    getActiveRuns: () => ([
      {
        id: 'run-old',
        recipeId: 'r1',
        status: 'inProgress',
        startedAt: 100,
        currentStepIndex: 0,
        steps: [{ stepName: 'Step 1', status: 'inProgress' }]
      },
      {
        id: 'run-new',
        recipeId: 'r1',
        status: 'waitingTime',
        startedAt: 200,
        currentStepIndex: 0,
        steps: [{ stepName: 'Step 1', status: 'waitingTime', timeGate: { availableAt: 2000 } }]
      }
    ]),
    getRunHistory: () => ([
      {
        id: 'run-history',
        recipeId: 'r1',
        status: 'succeeded',
        startedAt: 10,
        finishedAt: 20,
        currentStepIndex: null,
        steps: [{ stepName: 'Step 1', status: 'succeeded' }]
      }
    ])
  });

  const context = await CraftingApp.prototype._prepareContext.call(app, {});
  assert.equal(context.activeRuns.length, 2);
  assert.equal(context.activeRuns[0].id, 'run-new');
  assert.equal(context.runHistory.length, 1);

  const rowA = context.recipes.find(r => r.id === 'r1');
  assert.ok(rowA);
  assert.equal(rowA.activeRunCount, 2);
  assert.equal(rowA.hasMultipleActiveRuns, true);
  assert.equal(rowA.activeRunId, 'run-new');
  assert.equal(rowA.craftButtonLabel, 'Waiting');

  const rowB = context.recipes.find(r => r.id === 'r2');
  assert.ok(rowB);
  assert.equal(rowB.activeRunCount, 0);
  assert.equal(rowB.hasMultipleActiveRuns, false);
  assert.equal(rowB.craftButtonLabel, 'Craft');
});
