import test from 'node:test';
import assert from 'node:assert/strict';

import {
  notifications,
  importManager,
  fakeRecipeManager,
  fakeEnvironmentStore,
  fakeGatheringRunManager,
  fakeSalvageRunManager,
  fakeCraftingRunManager,
  fakeRichStateService,
} from './helpers/craftingSystemDeleteHarness.js';

test('deleteSystem cascades cleanup to every system-scoped service', async () => {
  notifications.length = 0;
  const calls = [];
  globalThis.game = {
    user: { isGM: true },
    actors: [],
    settings: {
      get: () => '',
      set: async () => {},
    },
    fabricate: {
      getGatheringEnvironmentStore: () => fakeEnvironmentStore(calls),
      getGatheringRunManager: () => fakeGatheringRunManager(calls),
      getSalvageRunManager: () => fakeSalvageRunManager(calls),
      getCraftingRunManager: () => fakeCraftingRunManager(calls),
      getGatheringRichStateService: () => fakeRichStateService(calls),
    },
  };

  const CraftingSystemManager = await importManager();
  const manager = new CraftingSystemManager(fakeRecipeManager());
  manager.initialized = true;
  manager.save = async () => {};
  manager.systems.set(
    'sys-delete',
    manager._normalizeSystem({
      id: 'sys-delete',
      name: 'Mythwright',
      components: [{ id: 'c1', name: 'Raw Ore' }],
      essenceDefinitions: [{ id: 'fire', name: 'Fire' }],
    })
  );

  await manager.deleteSystem('sys-delete');

  const methods = calls.map((c) => c.method);
  assert.deepEqual(
    methods,
    [
      'environmentStore.cleanupByCraftingSystem',
      'gatheringRunManager.removeRunsForSystem',
      'salvageRunManager.removeRunsForSystem',
      'craftingRunManager.removeRunsForSystem',
      'richStateService.removeSystem',
    ],
    'cascade fans out to every system-scoped store in order'
  );

  for (const call of calls) {
    assert.equal(call.systemId, 'sys-delete', `${call.method} received the deleted system id`);
  }

  const salvageCall = calls.find((c) => c.method === 'salvageRunManager.removeRunsForSystem');
  assert.deepEqual(
    salvageCall.options,
    { cancelActive: false, removeHistory: true },
    'salvage cleanup is a full purge, not a cancellation'
  );

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
    fabricate: {},
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
  console.error = (...args) => {
    errors.push(args);
  };

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
          },
        }),
        getGatheringRunManager: () => fakeGatheringRunManager(calls),
        getSalvageRunManager: () => fakeSalvageRunManager(calls),
        getCraftingRunManager: () => fakeCraftingRunManager(calls),
        getGatheringRichStateService: () => fakeRichStateService(calls),
      },
    };

    const CraftingSystemManager = await importManager();
    const manager = new CraftingSystemManager(fakeRecipeManager());
    manager.initialized = true;
    manager.save = async () => {};
    manager.systems.set(
      'sys-delete',
      manager._normalizeSystem({ id: 'sys-delete', name: 'Resilient' })
    );

    await manager.deleteSystem('sys-delete');

    assert.ok(calls.includes('env'));
    assert.ok(calls.some((c) => c?.method === 'gatheringRunManager.removeRunsForSystem'));
    assert.ok(calls.some((c) => c?.method === 'richStateService.removeSystem'));
    assert.equal(errors.length, 1, 'the failing cleanup is logged but does not abort');
    assert.equal(manager.getSystem('sys-delete'), null);
  } finally {
    console.error = originalError;
  }
});
