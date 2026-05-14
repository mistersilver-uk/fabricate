import test from 'node:test';
import assert from 'node:assert/strict';

let idSeq = 0;

globalThis.foundry = {
  utils: {
    randomID: () => `rid-${++idSeq}`,
    getProperty: (obj, path) => String(path || '').split('.').reduce((value, key) => value?.[key], obj)
  }
};

const notifications = [];
globalThis.ui = {
  notifications: {
    info: message => notifications.push(message),
    warn: () => {},
    error: () => {}
  }
};

function fakeRecipeManager() {
  const recipes = [
    { id: 'recipe-1', craftingSystemId: 'sys-delete', name: 'R1' },
    { id: 'recipe-2', craftingSystemId: 'sys-keep', name: 'R2' }
  ];
  return {
    getRecipes(filters = {}) {
      if (filters.craftingSystemId) {
        return recipes.filter(r => r.craftingSystemId === filters.craftingSystemId);
      }
      return recipes;
    },
    async deleteRecipe(id) {
      const idx = recipes.findIndex(r => r.id === id);
      if (idx >= 0) recipes.splice(idx, 1);
    }
  };
}

function fakeEnvironmentStore(calls) {
  return {
    async cleanupByCraftingSystem(systemId) {
      calls.push({ method: 'environmentStore.cleanupByCraftingSystem', systemId });
      return true;
    }
  };
}

function fakeGatheringRunManager(calls) {
  return {
    async removeRunsForSystem(systemId) {
      calls.push({ method: 'gatheringRunManager.removeRunsForSystem', systemId });
    }
  };
}

function fakeSalvageRunManager(calls) {
  return {
    async removeRunsForSystem(systemId, options) {
      calls.push({ method: 'salvageRunManager.removeRunsForSystem', systemId, options });
    }
  };
}

function fakeCraftingRunManager(calls) {
  return {
    async removeRunsForSystem(systemId) {
      calls.push({ method: 'craftingRunManager.removeRunsForSystem', systemId });
    }
  };
}

function fakeRichStateService(calls) {
  return {
    async removeSystem(systemId) {
      calls.push({ method: 'richStateService.removeSystem', systemId });
      return true;
    }
  };
}

async function importManager() {
  // Fresh import each time to avoid cached module state between tests.
  const mod = await import(`../src/systems/CraftingSystemManager.js?cb=${idSeq}`);
  return mod.CraftingSystemManager;
}

test('deleteSystem cascades cleanup to every system-scoped service', async () => {
  notifications.length = 0;
  const calls = [];
  globalThis.game = {
    user: { isGM: true },
    actors: [],
    settings: {
      get: () => '',
      set: async () => {}
    },
    fabricate: {
      getGatheringEnvironmentStore: () => fakeEnvironmentStore(calls),
      getGatheringRunManager: () => fakeGatheringRunManager(calls),
      getSalvageRunManager: () => fakeSalvageRunManager(calls),
      getCraftingRunManager: () => fakeCraftingRunManager(calls),
      getGatheringRichStateService: () => fakeRichStateService(calls)
    }
  };

  const CraftingSystemManager = await importManager();
  const manager = new CraftingSystemManager(fakeRecipeManager());
  manager.initialized = true;
  manager.save = async () => {};
  manager.systems.set('sys-delete', manager._normalizeSystem({
    id: 'sys-delete',
    name: 'Mythwright',
    components: [{ id: 'c1', name: 'Raw Ore' }],
    essenceDefinitions: [{ id: 'fire', name: 'Fire' }]
  }));

  await manager.deleteSystem('sys-delete');

  const methods = calls.map(c => c.method);
  assert.deepEqual(methods, [
    'environmentStore.cleanupByCraftingSystem',
    'gatheringRunManager.removeRunsForSystem',
    'salvageRunManager.removeRunsForSystem',
    'craftingRunManager.removeRunsForSystem',
    'richStateService.removeSystem'
  ], 'cascade fans out to every system-scoped store in order');

  for (const call of calls) {
    assert.equal(call.systemId, 'sys-delete', `${call.method} received the deleted system id`);
  }

  const salvageCall = calls.find(c => c.method === 'salvageRunManager.removeRunsForSystem');
  assert.deepEqual(salvageCall.options, { cancelActive: false, removeHistory: true },
    'salvage cleanup is a full purge, not a cancellation');

  assert.equal(manager.getSystem('sys-delete'), null);
  assert.equal(notifications.length, 1, 'single summary notification preserved');
  assert.match(notifications[0], /Deleted crafting system "Mythwright"/);
});

test('deleteSystem succeeds when no fabricate services are registered', async () => {
  notifications.length = 0;
  globalThis.game = {
    user: { isGM: true },
    actors: [],
    settings: { get: () => '', set: async () => {} },
    fabricate: {}
  };

  const CraftingSystemManager = await importManager();
  const manager = new CraftingSystemManager(fakeRecipeManager());
  manager.initialized = true;
  manager.save = async () => {};
  manager.systems.set('sys-delete', manager._normalizeSystem({ id: 'sys-delete', name: 'Bare' }));

  await manager.deleteSystem('sys-delete');

  assert.equal(manager.getSystem('sys-delete'), null);
  assert.equal(notifications.length, 1);
});

test('deleteSystem continues cascade when one cleanup throws', async () => {
  notifications.length = 0;
  const calls = [];
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => { errors.push(args); };

  try {
    globalThis.game = {
      user: { isGM: true },
      actors: [],
      settings: { get: () => '', set: async () => {} },
      fabricate: {
        getGatheringEnvironmentStore: () => ({
          async cleanupByCraftingSystem() {
            calls.push('env');
            throw new Error('boom');
          }
        }),
        getGatheringRunManager: () => fakeGatheringRunManager(calls),
        getSalvageRunManager: () => fakeSalvageRunManager(calls),
        getCraftingRunManager: () => fakeCraftingRunManager(calls),
        getGatheringRichStateService: () => fakeRichStateService(calls)
      }
    };

    const CraftingSystemManager = await importManager();
    const manager = new CraftingSystemManager(fakeRecipeManager());
    manager.initialized = true;
    manager.save = async () => {};
    manager.systems.set('sys-delete', manager._normalizeSystem({ id: 'sys-delete', name: 'Resilient' }));

    await manager.deleteSystem('sys-delete');

    assert.ok(calls.includes('env'));
    assert.ok(calls.some(c => c?.method === 'gatheringRunManager.removeRunsForSystem'));
    assert.ok(calls.some(c => c?.method === 'richStateService.removeSystem'));
    assert.equal(errors.length, 1, 'the failing cleanup is logged but does not abort');
    assert.equal(manager.getSystem('sys-delete'), null);
  } finally {
    console.error = originalError;
  }
});
