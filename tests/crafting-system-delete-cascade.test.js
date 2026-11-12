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

/** A scope store over a persisted-shape payload whose saves are recorded onto `calls`. */
function recordingScopeStore(calls, scope, records, { failSave = false } = {}) {
  const state = {
    payload: {
      entities: [],
      defaults: {},
      membership: Object.fromEntries(records.map((r) => [`${r.entityId}|${r.systemId}`, r])),
    },
  };
  state.store = {
    get: () => structuredClone(state.payload),
    load: () => {
      calls.push({ method: `${scope}Scope.load`, systemId: 'sys-delete' });
    },
    save: async (next) => {
      calls.push({ method: `${scope}Scope.save`, systemId: 'sys-delete' });
      if (failSave) throw new Error(`${scope} save refused`);
      state.payload = structuredClone(next);
    },
  };
  return state;
}

const member = (entityId, systemId) => ({ entityId, systemId, inherit: {} });

/** A GM world whose settings read empty, so the persisted snapshot holds no system. */
function installGame(fabricate) {
  globalThis.game = {
    user: { isGM: true },
    actors: [],
    settings: { get: () => '', set: async () => {} },
    fabricate,
  };
}

test('deleteSystem cascades cleanup to every system-scoped service', async () => {
  notifications.length = 0;
  const calls = [];
  const scopes = {
    component: recordingScopeStore(calls, 'component', [
      member('c1', 'sys-delete'),
      member('c1', 'sys-keep'),
    ]),
    essence: recordingScopeStore(calls, 'essence', [member('fire', 'sys-keep')]),
    tool: recordingScopeStore(calls, 'tool', [member('t1', 'sys-delete')]),
  };
  const before = {
    component: scopes.component.store.get(),
    essence: scopes.essence.store.get(),
  };
  installGame({
    getGatheringEnvironmentStore: () => fakeEnvironmentStore(calls),
    getGatheringRunManager: () => fakeGatheringRunManager(calls),
    getSalvageRunManager: () => fakeSalvageRunManager(calls),
    getCraftingRunManager: () => fakeCraftingRunManager(calls),
    getGatheringRichStateService: () => fakeRichStateService(calls),
    getComponentScopeStore: () => scopes.component.store,
    getEssenceScopeStore: () => scopes.essence.store,
    getToolScopeStore: () => scopes.tool.store,
  });

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
      'componentScope.save',
      'toolScope.save',
    ],
    'cascade fans out to every system-scoped store in order, the membership prunes last and ' +
      'only in a scope holding a record naming the system'
  );
  assert.deepEqual(Object.keys(scopes.component.payload.membership), ['c1|sys-keep']);
  assert.deepEqual(
    scopes.component.payload.membership['c1|sys-keep'],
    before.component.membership['c1|sys-keep'],
    'the record naming another system equals its pre-prune value'
  );
  assert.deepEqual(scopes.essence.payload, before.essence, 'an unmatched scope is not written');
  assert.deepEqual(scopes.tool.payload.membership, {});

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
  installGame({});

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
    installGame({
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
    });

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

test('deleteSystem still prunes the other scopes when one membership write fails', async () => {
  notifications.length = 0;
  const calls = [];
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => {
    errors.push(args);
  };
  const scopes = {
    component: recordingScopeStore(calls, 'component', [member('c1', 'sys-delete')], {
      failSave: true,
    }),
    essence: recordingScopeStore(calls, 'essence', [member('fire', 'sys-delete')]),
    tool: recordingScopeStore(calls, 'tool', [member('t1', 'sys-delete')]),
  };
  try {
    installGame({
      getComponentScopeStore: () => scopes.component.store,
      getEssenceScopeStore: () => scopes.essence.store,
      getToolScopeStore: () => scopes.tool.store,
    });
    const CraftingSystemManager = await importManager();
    const manager = new CraftingSystemManager(fakeRecipeManager());
    manager.initialized = true;
    manager.save = async () => {};
    manager.systems.set('sys-delete', manager._normalizeSystem({ id: 'sys-delete', name: 'X' }));

    await manager.deleteSystem('sys-delete');
  } finally {
    console.error = originalError;
  }

  assert.deepEqual(
    calls.map((call) => call.method),
    ['componentScope.save', 'componentScope.load', 'essenceScope.save', 'toolScope.save']
  );
  assert.deepEqual(Object.keys(scopes.component.payload.membership), ['c1|sys-delete']);
  assert.deepEqual(scopes.essence.payload.membership, {});
  assert.deepEqual(scopes.tool.payload.membership, {});
  assert.equal(errors.length, 1, 'the failed scope is logged');
  assert.match(String(errors[0][0]), /component membership cleanup failed/);
  assert.equal(notifications.length, 1, 'and the delete still completes');
});

test('deleteSystem prunes no membership when the persisted setting cannot be read', async () => {
  notifications.length = 0;
  const calls = [];
  const scope = recordingScopeStore(calls, 'component', [member('c1', 'sys-delete')]);
  installGame({ getComponentScopeStore: () => scope.store });
  const CraftingSystemManager = await importManager();
  const manager = new CraftingSystemManager(fakeRecipeManager());
  manager.initialized = true;
  manager.save = async () => {};
  manager._repository = {
    readReplicatedSnapshot: () => {
      throw new Error('unreadable');
    },
  };
  manager.systems.set('sys-delete', manager._normalizeSystem({ id: 'sys-delete', name: 'X' }));

  await manager.deleteSystem('sys-delete');

  assert.deepEqual(calls, [], 'an unreadable setting prunes nothing');
  assert.deepEqual(Object.keys(scope.payload.membership), ['c1|sys-delete']);
});

test('deleteSystem prunes no membership while the persisted setting still holds the system', async () => {
  notifications.length = 0;
  const calls = [];
  const scope = recordingScopeStore(calls, 'component', [member('c1', 'sys-delete')]);
  installGame({ getComponentScopeStore: () => scope.store });
  const CraftingSystemManager = await importManager();
  const manager = new CraftingSystemManager(fakeRecipeManager());
  manager.initialized = true;
  manager.save = async () => {};
  manager._repository = { readReplicatedSnapshot: () => [{ id: 'sys-delete', components: [] }] };
  manager.systems.set('sys-delete', manager._normalizeSystem({ id: 'sys-delete', name: 'X' }));

  await manager.deleteSystem('sys-delete');

  assert.deepEqual(calls, [], 'a delete the setting has not taken leaves the records alone');
  assert.deepEqual(Object.keys(scope.payload.membership), ['c1|sys-delete']);
});
