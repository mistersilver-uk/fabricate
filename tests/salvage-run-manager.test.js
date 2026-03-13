import test from 'node:test';
import assert from 'node:assert/strict';

import { SalvageRunManager } from '../src/systems/SalvageRunManager.js';

class FakeActor {
  constructor(name = 'Test Actor') {
    this.id = name.replace(/\s+/g, '-').toLowerCase();
    this.name = name;
    this.uuid = `Actor.${this.id}`;
    this._flags = {};
  }

  getFlag(namespace, key) {
    return this._flags?.[namespace]?.[key];
  }

  async setFlag(namespace, key, value) {
    this._flags[namespace] = this._flags[namespace] || {};
    this._flags[namespace][key] = value;
    return value;
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

test('SalvageRunManager: history retention limit enforced — 50th entry no truncation, 51st discards oldest, most-recent-first order', async () => {
  const actor = new FakeActor('HistoryLimit');
  setupGlobals(1000, [actor]);
  const manager = new SalvageRunManager();

  // Create and complete 50 runs
  const completedIds = [];
  for (let i = 0; i < 50; i++) {
    const run = await manager.createRun(actor, {
      craftingSystemId: 'system-limit',
      componentId: `component-${i}`
    });
    const completed = await manager.completeRun(actor, run, 'succeeded');
    completedIds.push(completed.id);
  }

  // After 50 entries, no truncation has occurred
  const historyAt50 = manager.getRunHistory(actor);
  assert.equal(historyAt50.length, 50);

  // Most-recent-first: last completed run is at index 0, first at index 49
  assert.equal(historyAt50[0].id, completedIds[49]);
  assert.equal(historyAt50[49].id, completedIds[0]);

  // Insert the 51st run — oldest should be discarded, length stays at 50
  const run51 = await manager.createRun(actor, {
    craftingSystemId: 'system-limit',
    componentId: 'component-51'
  });
  const completed51 = await manager.completeRun(actor, run51, 'succeeded');

  const historyAt51 = manager.getRunHistory(actor);
  assert.equal(historyAt51.length, 50);
  assert.equal(historyAt51.find(r => r.id === completedIds[0]), undefined, 'oldest entry should be evicted');
  assert.equal(historyAt51[0].id, completed51.id, 'newest entry should be first');
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
