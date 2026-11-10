import test from 'node:test';
import assert from 'node:assert/strict';

import { SalvageRunManager } from '../src/systems/SalvageRunManager.js';
import { mergeHistoryFlag } from './helpers/journal-fixtures.js';
import {
  insertTerminalRuns,
  assertCappedMostRecentFirst,
  RETENTION_LIMIT
} from './helpers/run-history-retention.js';

class FakeActor {
  constructor(name = 'Test Actor', { isOwner = true } = {}) {
    this.id = name.replace(/\s+/g, '-').toLowerCase();
    this.name = name;
    this.uuid = `Actor.${this.id}`;
    this._flags = {};
    // See the crafting run-manager fixture: the startup cleanup only touches
    // actors this client may write (issue 970).
    this.isOwner = isOwner;
  }

  getFlag(namespace, key) {
    return this._flags?.[namespace]?.[key];
  }

  async setFlag(namespace, key, value) {
    this._flags[namespace] = this._flags[namespace] || {};
    this._flags[namespace][key] = mergeHistoryFlag(this._flags[namespace][key], value);
    return this;
  }
}

function setupGlobals(worldTime = 1000, actors = []) {
  let id = 0;
  globalThis.foundry = {
    utils: {
      randomID: () => `rid-${++id}`
    }
  };
  globalThis.game = {
    user: { id: 'user-1' },
    time: { worldTime },
    actors
  };
}

test('SalvageRunManager: create, wait, complete flow moves run into history', async () => {
  const actor = new FakeActor('Salvager');
  setupGlobals(1000, [actor]);
  const manager = new SalvageRunManager();

  let run = await manager.createRun(actor, {
    craftingSystemId: 'system-1',
    componentId: 'component-1',
    componentName: 'Iron Sword'
  });
  assert.equal(run.status, 'inProgress');

  run = await manager.markRunWaitingForTime(actor, run, { minutes: 5 });
  assert.equal(run.status, 'waitingTime');
  assert.ok(run.timeGate?.availableAt > 1000);

  setupGlobals(run.timeGate.availableAt, [actor]);
  run = await manager.markRunInProgress(actor, run);
  const completed = await manager.completeRun(actor, run, 'succeeded', {
    createdResults: [{ itemUuid: 'Item.scrap', quantity: 2 }]
  });

  assert.equal(completed.status, 'succeeded');
  assert.equal(manager.getActiveRuns(actor).length, 0);
  assert.equal(manager.getRunHistory(actor).length, 1);
});

test('SalvageRunManager: processWorldTime promotes ready waiting runs and triggers callback', async () => {
  const actor = new FakeActor('Timer');
  setupGlobals(1000, [actor]);
  const manager = new SalvageRunManager();

  let run = await manager.createRun(actor, {
    craftingSystemId: 'system-1',
    componentId: 'component-1'
  });
  run = await manager.markRunWaitingForTime(actor, run, { minutes: 1 });

  const callbackRuns = [];
  await manager.processWorldTime(1020, async () => {
    throw new Error('callback should not run before gate is ready');
  });

  await manager.processWorldTime(run.timeGate.availableAt, async (_actor, readyRun) => {
    callbackRuns.push(readyRun.id);
  });

  const resumed = manager.getActiveRun(actor, run.id);
  assert.equal(resumed.status, 'inProgress');
  assert.deepEqual(callbackRuns, [run.id]);
});

test('SalvageRunManager: cleanupInvalidRuns removes active and historical runs with invalid references', async () => {
  const actor = new FakeActor('Cleanup');
  setupGlobals(1000, [actor]);
  const manager = new SalvageRunManager();

  const validRun = await manager.createRun(actor, {
    craftingSystemId: 'system-valid',
    componentId: 'component-valid'
  });
  const invalidRun = await manager.createRun(actor, {
    craftingSystemId: 'system-missing',
    componentId: 'component-missing'
  });
  await manager.completeRun(actor, invalidRun, 'cancelled');
  await manager.completeRun(actor, validRun, 'succeeded');

  const freshActive = await manager.createRun(actor, {
    craftingSystemId: 'system-valid',
    componentId: 'component-invalid'
  });

  await manager.cleanupInvalidRuns(
    new Set(['system-valid']),
    new Map([['system-valid', new Set(['component-valid'])]])
  );

  assert.equal(manager.getActiveRun(actor, freshActive.id), null);
  assert.equal(manager.getRunHistory(actor).length, 1);
  assert.equal(manager.getRunHistory(actor)[0].componentId, 'component-valid');
});

// Issue 970: the pass runs on every client at startup and writes directly to actor
// documents, so it must only touch the actors this client owns.
test('SalvageRunManager: cleanupInvalidRuns skips actors this client cannot write', async () => {
  const mine = new FakeActor('MySalvager');
  const theirs = new FakeActor('TheirSalvager', { isOwner: false });
  setupGlobals(1000, [mine, theirs]);
  const manager = new SalvageRunManager();

  const myRun = await manager.createRun(mine, {
    craftingSystemId: 'system-missing',
    componentId: 'component-missing'
  });
  const theirRun = await manager.createRun(theirs, {
    craftingSystemId: 'system-missing',
    componentId: 'component-missing'
  });

  await manager.cleanupInvalidRuns(new Set(['system-valid']), new Map());

  assert.equal(manager.getActiveRun(mine, myRun.id), null, 'my own stale run is cleaned');
  assert.ok(
    manager.getActiveRun(theirs, theirRun.id),
    'a character I do not own keeps its run rather than triggering a refused write'
  );
});

test('SalvageRunManager: removeRunsForSystem and removeRunsForComponent cancel active runs and trim history', async () => {
  const actor = new FakeActor('Prune');
  setupGlobals(1000, [actor]);
  const manager = new SalvageRunManager();

  const runA = await manager.createRun(actor, {
    craftingSystemId: 'system-a',
    componentId: 'component-a'
  });
  const runB = await manager.createRun(actor, {
    craftingSystemId: 'system-b',
    componentId: 'component-b'
  });
  await manager.completeRun(actor, runB, 'succeeded');

  await manager.removeRunsForSystem('system-a', { cancelActive: true, removeHistory: true });
  assert.equal(manager.getActiveRun(actor, runA.id), null);
  assert.equal(manager.getRunHistory(actor).some(run => run.craftingSystemId === 'system-a'), false);

  await manager.removeRunsForComponent('component-b', {
    systemId: 'system-b',
    cancelActive: true,
    removeHistory: true
  });
  assert.equal(manager.getRunHistory(actor).some(run => run.componentId === 'component-b'), false);
});

test('SalvageRunManager: retention limit caps salvageRuns.history at 50, discarding the oldest (most-recent-first)', async () => {
  const actor = new FakeActor('SalvageCap');
  setupGlobals(1000, [actor]);
  const manager = new SalvageRunManager();

  const insertedIds = await insertTerminalRuns(RETENTION_LIMIT + 1, async (i) => {
    const run = await manager.createRun(actor, {
      craftingSystemId: 'system-cap',
      componentId: `component-${i}`
    });
    const completed = await manager.completeRun(actor, run, 'succeeded');
    return completed.id;
  });

  const history = manager.getRunHistory(actor);
  assert.equal(history.length, RETENTION_LIMIT);
  // The 51st insertion discards the oldest entry.
  assert.equal(history.some((run) => run.id === insertedIds[0]), false);
  assertCappedMostRecentFirst(assert, history, insertedIds);
});

test('SalvageRunManager: retention limit does not truncate salvageRuns.history at exactly 50', async () => {
  const actor = new FakeActor('SalvageExact');
  setupGlobals(1000, [actor]);
  const manager = new SalvageRunManager();

  const insertedIds = await insertTerminalRuns(RETENTION_LIMIT, async (i) => {
    const run = await manager.createRun(actor, {
      craftingSystemId: 'system-cap',
      componentId: `component-${i}`
    });
    const completed = await manager.completeRun(actor, run, 'succeeded');
    return completed.id;
  });

  const history = manager.getRunHistory(actor);
  assert.equal(history.length, RETENTION_LIMIT);
  // The 50th insertion does NOT truncate: the oldest entry is retained.
  assert.equal(history.some((run) => run.id === insertedIds[0]), true);
  assertCappedMostRecentFirst(assert, history, insertedIds);
});

test('SalvageRunManager: retention cap holds across completeRun, cancelRun, and terminal createRun paths', async () => {
  const terminalPaths = {
    completeRun: async (manager, actor, i) => {
      const run = await manager.createRun(actor, {
        craftingSystemId: 'system-cap',
        componentId: `component-${i}`
      });
      const completed = await manager.completeRun(actor, run, 'succeeded');
      return completed.id;
    },
    cancelRun: async (manager, actor, i) => {
      const run = await manager.createRun(actor, {
        craftingSystemId: 'system-cap',
        componentId: `component-${i}`
      });
      const cancelled = await manager.cancelRun(actor, run.id);
      return cancelled.id;
    },
    terminalCreate: async (manager, actor, i) => {
      const run = await manager.createRun(actor, {
        craftingSystemId: 'system-cap',
        componentId: `component-${i}`,
        status: 'cancelled'
      });
      return run.id;
    }
  };

  for (const [label, insertOne] of Object.entries(terminalPaths)) {
    const actor = new FakeActor(`Salvage-${label}`);
    setupGlobals(1000, [actor]);
    const manager = new SalvageRunManager();

    const insertedIds = await insertTerminalRuns(RETENTION_LIMIT + 1, (i) =>
      insertOne(manager, actor, i)
    );

    const history = manager.getRunHistory(actor);
    assert.equal(history.length, RETENTION_LIMIT, `${label} should cap history at ${RETENTION_LIMIT}`);
    assertCappedMostRecentFirst(assert, history, insertedIds);
  }
});

async function uncertainSalvageRun(manager, actor, overrides = {}) {
  const run = await manager.createRun(actor, {
    craftingSystemId: 'system-1',
    componentId: 'component-1',
    consumedComponents: [{ actorUuid: actor.uuid, itemUuid: `${actor.uuid}.Item.hide`, quantity: 1, name: 'Hide', img: null }],
    historySettlement: { consumption: 'complete', awards: 'uncertain' },
    ...overrides
  });
  return manager.markRunWaitingForTime(actor, run, { minutes: 1 });
}

const reconcileOptions = { disposition: 'reconciled', userId: 'gm-1', userName: 'GM', note: ' counted ' };

test('SalvageRunManager: Native Reconciliation archives an uncertain run cancelled without changing its evidence', async () => {
  const actor = new FakeActor('Native Salvager');
  setupGlobals(1000, [actor]);
  const manager = new SalvageRunManager();
  const run = await uncertainSalvageRun(manager, actor);
  const before = JSON.parse(JSON.stringify(manager.getActiveRun(actor, run.id)));
  let itemWrites = 0;
  actor.createEmbeddedDocuments = async () => { itemWrites += 1; };
  actor.updateEmbeddedDocuments = async () => { itemWrites += 1; };

  const result = await manager.reconcileUncertainRun(actor, run.id, reconcileOptions);

  assert.equal(result.status, 'archived');
  assert.equal(itemWrites, 0);
  const [entry] = new SalvageRunManager().getRunHistory(actor);
  assert.equal(entry.status, 'cancelled');
  assert.equal(entry.finishedAt, 1000);
  assert.deepEqual(entry.historySettlement, before.historySettlement);
  assert.deepEqual(entry.consumedComponents, before.consumedComponents);
  assert.deepEqual(entry.gmReconciliation, { disposition: 'reconciled', userId: 'gm-1', userName: 'GM', note: 'counted' });
  assert.equal(manager.getActiveRuns(actor).length, 0);
});

test('SalvageRunManager: Native Reconciliation refuses a run without native uncertainty or a bad disposition', async () => {
  const actor = new FakeActor('Native Refusals');
  setupGlobals(1000, [actor]);
  const manager = new SalvageRunManager();
  const certain = await uncertainSalvageRun(manager, actor, { historySettlement: { consumption: 'complete', awards: 'complete' } });
  const pending = await uncertainSalvageRun(manager, actor, { historySettlement: { consumption: 'complete', awards: 'pending' } });
  const versioned = await uncertainSalvageRun(manager, actor, { lifecycleVersion: 1 });
  const uncertain = await uncertainSalvageRun(manager, actor);

  for (const run of [certain, pending, versioned]) {
    assert.deepEqual(await manager.reconcileUncertainRun(actor, run.id, reconcileOptions), { status: 'certain' });
  }
  assert.deepEqual(
    await manager.reconcileUncertainRun(actor, uncertain.id, { ...reconcileOptions, disposition: 'refunded' }),
    { status: 'invalid' }
  );
  assert.equal(manager.getActiveRuns(actor).length, 4);
  assert.equal(manager.getRunHistory(actor).length, 0);
});

test('SalvageRunManager: a repeated or stale-cache reconcile answers missing with one history entry', async () => {
  const actor = new FakeActor('Native Repeat');
  setupGlobals(1000, [actor]);
  const manager = new SalvageRunManager();
  const run = await uncertainSalvageRun(manager, actor);
  const stale = new SalvageRunManager();
  assert.ok(stale.getActiveRun(actor, run.id));
  stale._cache.set(actor.id, structuredClone(stale._getContainer(actor)));

  assert.equal((await manager.reconcileUncertainRun(actor, run.id, reconcileOptions)).status, 'archived');
  const first = manager.getRunHistory(actor)[0];
  assert.deepEqual(await manager.reconcileUncertainRun(actor, run.id, { ...reconcileOptions, disposition: 'abandoned' }), { status: 'missing' });
  assert.deepEqual(await stale.reconcileUncertainRun(actor, run.id, reconcileOptions), { status: 'missing' });
  const history = new SalvageRunManager().getRunHistory(actor);
  assert.equal(history.length, 1);
  assert.deepEqual(history[0], first);
});

test('SalvageRunManager: Native Reconciliation answers missing when the archive write does not cancel', async () => {
  const actor = new FakeActor('Native Unarchived');
  setupGlobals(1000, [actor]);
  const manager = new SalvageRunManager();
  const run = await uncertainSalvageRun(manager, actor);
  manager.completeRun = async (_actor, input) => input;

  assert.deepEqual(await manager.reconcileUncertainRun(actor, run.id, reconcileOptions), { status: 'missing' });
});

test('SalvageRunManager: after reconcile the component salvages again and world time resumes other runs', async () => {
  const actor = new FakeActor('Native Resume');
  setupGlobals(1000, [actor]);
  const manager = new SalvageRunManager();
  const stuck = await uncertainSalvageRun(manager, actor);
  const ready = await manager.markRunWaitingForTime(
    actor,
    await manager.createRun(actor, { craftingSystemId: 'system-1', componentId: 'component-2' }),
    { minutes: 1 }
  );
  await assert.rejects(manager.processWorldTime(2000), { code: 'HISTORY_EFFECT_UNCERTAIN' });

  await manager.reconcileUncertainRun(actor, stuck.id, reconcileOptions);

  assert.equal(manager.findActiveRunForComponent(actor, 'system-1', 'component-1'), null);
  const resumed = [];
  await manager.processWorldTime(2000, async (_actor, run) => {
    resumed.push(run.id);
  });
  assert.deepEqual(resumed, [ready.id]);
  const again = await manager.createRun(actor, { craftingSystemId: 'system-1', componentId: 'component-1' });
  assert.equal(manager.findActiveRunForComponent(actor, 'system-1', 'component-1').id, again.id);
});
