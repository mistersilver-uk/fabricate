import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GATHERING_RUN_HISTORY_LIMIT,
  GatheringRunManager,
  GatheringRunManagerError
} from '../src/systems/GatheringRunManager.js';

class FakeActor {
  constructor(name = 'Gatherer') {
    this.id = name.toLowerCase().replace(/\s+/g, '-');
    this.uuid = `Actor.${this.id}`;
    this.flags = {};
    this.setFlagCalls = [];
  }

  getFlag(namespace, key) {
    return this.flags?.[namespace]?.[key];
  }

  async setFlag(namespace, key, value) {
    this.setFlagCalls.push({ namespace, key, value });
    this.flags[namespace] = this.flags[namespace] || {};
    this.flags[namespace][key] = value;
    return value;
  }
}

class RejectingActor extends FakeActor {
  async setFlag(namespace, key, value) {
    this.setFlagCalls.push({ namespace, key, value });
    throw new Error('setFlag failed');
  }
}

class MergingActor extends FakeActor {
  constructor(name = 'Gatherer') {
    super(name);
    this.updateCalls = [];
  }

  async update(updates) {
    this.updateCalls.push(updates);
    for (const [path, value] of Object.entries(updates)) {
      const parts = path.split('.');
      const deleteToken = parts.at(-1);
      if (!deleteToken?.startsWith('-=') || value !== null) continue;

      let target = this;
      for (const part of parts.slice(0, -1)) {
        target = target?.[part];
      }
      if (target) delete target[deleteToken.slice(2)];
    }
  }

  async setFlag(namespace, key, value) {
    this.setFlagCalls.push({ namespace, key, value });
    this.flags[namespace] = this.flags[namespace] || {};
    this.flags[namespace][key] = mergeObjects(this.flags[namespace][key], value);
    return this.flags[namespace][key];
  }
}

function manager(options = {}) {
  let id = 0;
  return new GatheringRunManager({
    randomID: () => `run-${++id}`,
    nowWorldTime: () => 1000,
    getUserId: () => 'user-1',
    getActors: () => [],
    ...options
  });
}

function runData(overrides = {}) {
  return {
    craftingSystemId: 'system-1',
    environmentId: 'env-1',
    taskId: 'task-1',
    ...overrides
  };
}

test('GatheringRunManager writes canonical gatheringRuns flag path only', async () => {
  const actor = new FakeActor();
  const runs = manager();

  await runs.createRun(actor, runData());

  assert.ok(actor.flags.fabricate.gatheringRuns);
  assert.equal(actor.flags.fabricate.fabricate, undefined);
  assert.deepEqual(
    actor.setFlagCalls.map(call => [call.namespace, call.key]),
    [['fabricate', 'gatheringRuns']]
  );
});

test('GatheringRunManager normalizes missing and malformed containers', () => {
  const actor = new FakeActor();
  actor.flags.fabricate = {
    gatheringRuns: {
      active: {
        malformed: null,
        duplicateOld: {
          id: 'old',
          actorUuid: actor.uuid,
          userId: 'user-1',
          craftingSystemId: 'system-1',
          environmentId: 'env-1',
          taskId: 'task-1',
          status: 'waitingTime',
          startedAtWorldTime: 10,
          updatedAtWorldTime: 20,
          unknown: true
        },
        duplicateNew: {
          id: 'new',
          actorUuid: actor.uuid,
          userId: 'user-1',
          craftingSystemId: 'system-1',
          environmentId: 'env-1',
          taskId: 'task-1',
          status: 'inProgress',
          startedAtWorldTime: 30,
          updatedAtWorldTime: 40,
          blindLabel: 'Secret Spring'
        },
        terminalInActive: {
          id: 'terminal',
          craftingSystemId: 'system-1',
          environmentId: 'env-1',
          taskId: 'task-2',
          status: 'succeeded'
        }
      },
      history: 'not an array'
    }
  };

  const runs = manager();

  assert.deepEqual(runs.getActiveRuns(actor), [{
    id: 'new',
    actorUuid: actor.uuid,
    userId: 'user-1',
    craftingSystemId: 'system-1',
    environmentId: 'env-1',
    taskId: 'task-1',
    status: 'inProgress',
    startedAtWorldTime: 30,
    updatedAtWorldTime: 40,
    usedTools: [],
    createdResults: []
  }]);
  assert.deepEqual(runs.getRunHistory(actor), []);

  const emptyActor = new FakeActor('Empty');
  assert.deepEqual(runs.getActiveRuns(emptyActor), []);
  assert.deepEqual(runs.getRunHistory(emptyActor), []);
});

test('GatheringRunManager creates active runs with only canonical fields', async () => {
  const actor = new FakeActor();
  const runs = manager();

  const run = await runs.createRun(actor, runData({
    id: 'caller-id',
    taskName: 'Hidden Task',
    blindLabel: 'Generic Gather',
    environmentSnapshot: { name: 'Snapshot' },
    checkResult: { total: 18, leaked: 'allowed because checkResult is opaque' },
    usedTools: [{ actorUuid: actor.uuid, itemUuid: 'Item.tool', quantity: 1, label: 'Tool' }],
    createdResults: [{ actorUuid: actor.uuid, itemUuid: 'Item.herb', quantity: 2, name: 'Herb' }]
  }));

  assert.deepEqual(Object.keys(run), [
    'id',
    'actorUuid',
    'userId',
    'craftingSystemId',
    'environmentId',
    'taskId',
    'status',
    'startedAtWorldTime',
    'updatedAtWorldTime',
    'checkResult',
    'usedTools',
    'createdResults'
  ]);
  assert.equal(run.id, 'run-1');
  assert.equal(run.status, 'inProgress');
  assert.deepEqual(run.usedTools, [{ actorUuid: actor.uuid, itemUuid: 'Item.tool', quantity: 1 }]);
  assert.deepEqual(run.createdResults, [{ actorUuid: actor.uuid, itemUuid: 'Item.herb', quantity: 2 }]);
  assert.equal('blindLabel' in actor.flags.fabricate.gatheringRuns.active[run.id], false);
  assert.equal('environmentSnapshot' in actor.flags.fabricate.gatheringRuns.active[run.id], false);
});

test('GatheringRunManager rejects persistence failures without dirtying the cache', async () => {
  const actor = new RejectingActor();
  const runs = manager();

  await assert.rejects(
    () => runs.createRun(actor, runData()),
    /setFlag failed/
  );

  assert.equal(actor.flags.fabricate, undefined);
  assert.deepEqual(runs.getActiveRuns(actor), []);
  assert.deepEqual(runs.getRunHistory(actor), []);
});

test('GatheringRunManager blocks duplicate active runs for one task', async () => {
  const actor = new FakeActor();
  const runs = manager();
  await runs.createRun(actor, runData());

  await assert.rejects(
    () => runs.createRun(actor, runData({ environmentId: 'env-2' })),
    error => error instanceof GatheringRunManagerError && error.code === 'DUPLICATE_ACTIVE_TASK'
  );

  assert.equal(runs.getActiveRuns(actor).length, 1);
});

test('GatheringRunManager blocks duplicate active runs using trimmed task IDs', async () => {
  const actor = new FakeActor();
  const runs = manager();
  await runs.createRun(actor, runData({ taskId: 'task-trimmed' }));

  await assert.rejects(
    () => runs.createRun(actor, runData({ taskId: ' task-trimmed ' })),
    error => error instanceof GatheringRunManagerError && error.code === 'DUPLICATE_ACTIVE_TASK'
  );
});

test('GatheringRunManager rejects waitingTime active runs without a valid time gate', async () => {
  const actor = new FakeActor();
  const runs = manager();

  await assert.rejects(
    () => runs.createRun(actor, runData({ status: 'waitingTime' })),
    error => error instanceof GatheringRunManagerError && error.code === 'INVALID_TIME_GATE'
  );

  assert.deepEqual(runs.getActiveRuns(actor), []);
});

test('GatheringRunManager drops persisted waitingTime active records without a valid time gate', async () => {
  const actor = new FakeActor();
  actor.flags.fabricate = {
    gatheringRuns: {
      active: {
        malformedWaiting: {
          id: 'malformed-waiting',
          actorUuid: actor.uuid,
          userId: 'user-1',
          craftingSystemId: 'system-1',
          environmentId: 'env-1',
          taskId: 'task-waiting',
          status: 'waitingTime',
          startedAtWorldTime: 10,
          updatedAtWorldTime: 20
        }
      },
      history: []
    }
  };
  const runs = manager();

  assert.deepEqual(runs.getActiveRuns(actor), []);
  const run = await runs.createRun(actor, runData({ taskId: 'task-waiting' }));
  assert.equal(run.taskId, 'task-waiting');
});

test('GatheringRunManager keeps terminal identity refs from the active run', async () => {
  const actor = new FakeActor();
  const runs = manager();
  const run = await runs.createRun(actor, runData({
    craftingSystemId: 'system-original',
    environmentId: 'env-original',
    taskId: 'task-original'
  }));

  const completed = await runs.completeRun(actor, run, 'succeeded', {
    craftingSystemId: 'system-conflicting',
    environmentId: 'env-conflicting',
    taskId: 'task-conflicting',
    createdResults: [{ actorUuid: actor.uuid, itemUuid: 'Item.herb', quantity: 1 }]
  });

  assert.equal(completed.craftingSystemId, 'system-original');
  assert.equal(completed.environmentId, 'env-original');
  assert.equal(completed.taskId, 'task-original');
  assert.equal(runs.getRunHistory(actor)[0].taskId, 'task-original');
});

test('GatheringRunManager clears created results for failed and cancelled completions', async () => {
  const actor = new FakeActor();
  const runs = manager();
  const failedRun = await runs.createRun(actor, runData({ taskId: 'task-failed' }));
  const cancelledRun = await runs.createRun(actor, runData({ taskId: 'task-cancelled' }));

  const failed = await runs.completeRun(actor, failedRun, 'failed', {
    createdResults: [{ actorUuid: actor.uuid, itemUuid: 'Item.herb', quantity: 1 }]
  });
  const cancelled = await runs.completeRun(actor, cancelledRun, 'cancelled', {
    createdResults: [{ actorUuid: actor.uuid, itemUuid: 'Item.ore', quantity: 1 }]
  });

  assert.deepEqual(failed.createdResults, []);
  assert.deepEqual(cancelled.createdResults, []);
  assert.deepEqual(runs.getRunHistory(actor).map(run => run.createdResults), [[], []]);
});

test('GatheringRunManager preserves waiting time gates on completion and cancellation', async () => {
  const actor = new FakeActor();
  const runs = manager({ nowWorldTime: () => 1000 });
  const timeRequirement = { minutes: 45 };
  const expectedGate = {
    requiredSeconds: 2700,
    availableAt: 3700,
    initiatedAt: 1000
  };

  const completedRun = await runs.createWaitingRun(actor, runData({ taskId: 'task-complete' }), timeRequirement);
  const cancelledRun = await runs.createWaitingRun(actor, runData({ taskId: 'task-cancel' }), timeRequirement);

  const completed = await runs.completeRun(actor, completedRun, 'succeeded');
  const cancelled = await runs.cancelRun(actor, cancelledRun.id);

  assert.deepEqual(completed.timeGate, expectedGate);
  assert.deepEqual(cancelled.timeGate, expectedGate);
  assert.deepEqual(runs.getRunHistory(actor).map(run => run.timeGate), [expectedGate, expectedGate]);
});

test('GatheringRunManager drops malformed run item refs', async () => {
  const actor = new FakeActor();
  const runs = manager();

  const run = await runs.createRun(actor, runData({
    usedTools: [
      { actorUuid: actor.uuid, itemUuid: 'Item.valid-tool', quantity: 1 },
      { actorUuid: actor.uuid, quantity: 1 },
      { itemUuid: 'Item.missing-actor', quantity: 1 }
    ],
    createdResults: [
      { actorUuid: actor.uuid, itemUuid: 'Item.valid-result', quantity: 2 },
      { actorUuid: '', itemUuid: 'Item.invalid-result', quantity: 1 },
      { actorUuid: actor.uuid, itemUuid: null, quantity: 1 }
    ]
  }));

  assert.deepEqual(run.usedTools, [{ actorUuid: actor.uuid, itemUuid: 'Item.valid-tool', quantity: 1 }]);
  assert.deepEqual(run.createdResults, [{ actorUuid: actor.uuid, itemUuid: 'Item.valid-result', quantity: 2 }]);
});

test('GatheringRunManager creates terminal history directly for immediate attempts', async () => {
  const actor = new FakeActor();
  let worldTime = 2000;
  let id = 0;
  const runs = manager({
    randomID: () => `terminal-${++id}`,
    nowWorldTime: () => worldTime
  });

  const succeeded = await runs.createTerminalRun(actor, runData({ taskId: 'task-success' }), 'succeeded', {
    createdResults: [{ actorUuid: actor.uuid, itemUuid: 'Item.herb', quantity: 3 }]
  });
  worldTime += 10;
  const failed = await runs.createTerminalRun(actor, runData({ taskId: 'task-failed' }), 'failed', {
    createdResults: [{ actorUuid: actor.uuid, itemUuid: 'Item.should-drop', quantity: 1 }]
  });

  assert.equal(succeeded.status, 'succeeded');
  assert.deepEqual(succeeded.createdResults, [{ actorUuid: actor.uuid, itemUuid: 'Item.herb', quantity: 3 }]);
  assert.equal(failed.status, 'failed');
  assert.deepEqual(failed.createdResults, []);
  assert.deepEqual(runs.getActiveRuns(actor), []);
  assert.deepEqual(runs.getRunHistory(actor).map(run => run.taskId), ['task-failed', 'task-success']);
});

test('GatheringRunManager blocks direct terminal creation when the task is already active', async () => {
  const actor = new FakeActor();
  const runs = manager();
  await runs.createRun(actor, runData({ taskId: 'task-active' }));

  await assert.rejects(
    () => runs.createTerminalRun(actor, runData({ taskId: ' task-active ' }), 'succeeded'),
    error => error instanceof GatheringRunManagerError && error.code === 'DUPLICATE_ACTIVE_TASK'
  );

  assert.deepEqual(runs.getRunHistory(actor), []);
});

test('GatheringRunManager caps directly-created terminal history at 50', async () => {
  const actor = new FakeActor();
  let worldTime = 3000;
  let id = 0;
  const runs = manager({
    randomID: () => `terminal-${++id}`,
    nowWorldTime: () => worldTime
  });

  for (let index = 0; index < GATHERING_RUN_HISTORY_LIMIT + 1; index += 1) {
    worldTime += 1;
    await runs.createTerminalRun(actor, runData({ taskId: `task-${index}` }), 'succeeded');
  }

  const history = runs.getRunHistory(actor);
  assert.equal(history.length, GATHERING_RUN_HISTORY_LIMIT);
  assert.equal(history[0].taskId, 'task-50');
  assert.equal(history.at(-1).taskId, 'task-1');
  assert.equal(history.some(run => run.taskId === 'task-0'), false);
});

test('GatheringRunManager completes terminal runs newest-first and caps history at 50', async () => {
  const actor = new FakeActor();
  let worldTime = 1000;
  let id = 0;
  const runs = manager({
    randomID: () => `run-${++id}`,
    nowWorldTime: () => worldTime
  });

  for (let index = 0; index < GATHERING_RUN_HISTORY_LIMIT + 1; index += 1) {
    worldTime += 1;
    const run = await runs.createRun(actor, runData({ taskId: `task-${index}` }));
    worldTime += 1;
    await runs.completeRun(actor, run, index % 2 === 0 ? 'succeeded' : 'failed', {
      createdResults: [{ actorUuid: actor.uuid, itemUuid: `Item.${index}`, quantity: 1 }]
    });
  }

  const history = runs.getRunHistory(actor);
  assert.equal(runs.getActiveRuns(actor).length, 0);
  assert.equal(history.length, GATHERING_RUN_HISTORY_LIMIT);
  assert.equal(history[0].taskId, 'task-50');
  assert.equal(history.at(-1).taskId, 'task-1');
  assert.equal(history.some(run => run.taskId === 'task-0'), false);
  assert.ok(history.every(run => Number.isFinite(run.completedAtWorldTime)));
});

test('GatheringRunManager deletes completed active runs before replacing flags in Foundry-style merging updates', async () => {
  const actor = new MergingActor();
  const runs = manager();
  const run = await runs.createWaitingRun(actor, runData({ taskId: 'task-time' }), { minutes: 1 });

  await runs.completeRun(actor, run, 'succeeded');

  assert.deepEqual(Object.keys(actor.flags.fabricate.gatheringRuns.active), []);
  assert.equal(actor.flags.fabricate.gatheringRuns.history[0].taskId, 'task-time');
  assert.deepEqual(runs.getActiveRuns(actor), []);
  assert.ok(
    actor.updateCalls.some(call => Object.hasOwn(call, `flags.fabricate.gatheringRuns.active.-=${run.id}`)),
    'completed run should be explicitly deleted for merging Foundry flag updates'
  );
});

test('GatheringRunManager waiting runs store normalized time gate fields', async () => {
  const actor = new FakeActor();
  const runs = manager({ nowWorldTime: () => 500 });

  const run = await runs.createWaitingRun(actor, runData(), { hours: 1, minutes: 30 });

  assert.equal(run.status, 'waitingTime');
  assert.deepEqual(run.timeGate, {
    requiredSeconds: 5400,
    availableAt: 5900,
    initiatedAt: 500
  });
});

test('GatheringRunManager returns only matured active waiting runs across actors', async () => {
  const actor = new FakeActor('Gatherer');
  const otherActor = new FakeActor('Other');
  const actors = [actor, otherActor];
  let worldTime = 1000;
  const runs = manager({
    nowWorldTime: () => worldTime,
    getActors: () => actors
  });

  const ready = await runs.createWaitingRun(actor, runData({ taskId: 'ready' }), { minutes: 1 });
  const pending = await runs.createWaitingRun(actor, runData({ taskId: 'pending' }), { minutes: 5 });
  const otherReady = await runs.createWaitingRun(otherActor, runData({ taskId: 'other-ready' }), { minutes: 1 });

  worldTime = 1060;

  assert.deepEqual(
    runs.getMaturedWaitingRuns(worldTime).map(entry => [entry.actor.uuid, entry.run.id]),
    [
      [actor.uuid, ready.id],
      [otherActor.uuid, otherReady.id]
    ]
  );
  assert.equal(runs.getMaturedWaitingRuns(worldTime).some(entry => entry.run.id === pending.id), false);
});

test('GatheringRunManager clears an active run without writing terminal history', async () => {
  const actor = new FakeActor();
  const runs = manager();
  const run = await runs.createWaitingRun(actor, runData(), { minutes: 1 });

  const cleared = await runs.clearActiveRun(actor, run.id);

  assert.equal(cleared?.id, run.id);
  assert.deepEqual(runs.getActiveRuns(actor), []);
  assert.deepEqual(runs.getRunHistory(actor), []);
  assert.deepEqual(actor.flags.fabricate.gatheringRuns, { active: {}, history: [] });
});

test('GatheringRunManager cleanup by system, environment, and task removes matching active and history only', async () => {
  const actor = new FakeActor();
  const otherActor = new FakeActor('Other');
  const actors = [actor, otherActor];
  const runs = manager({ getActors: () => actors });

  const keep = await runs.createRun(actor, runData({ craftingSystemId: 'system-keep', environmentId: 'env-keep', taskId: 'task-keep' }));
  const bySystem = await runs.createRun(actor, runData({ craftingSystemId: 'system-delete', environmentId: 'env-a', taskId: 'task-a' }));
  await runs.completeRun(actor, bySystem, 'succeeded');
  await runs.createRun(actor, runData({ craftingSystemId: 'system-delete', environmentId: 'env-b', taskId: 'task-b' }));
  await runs.createRun(otherActor, runData({ craftingSystemId: 'system-keep', environmentId: 'env-delete', taskId: 'task-c' }));
  const byTaskHistory = await runs.createRun(otherActor, runData({ craftingSystemId: 'system-keep', environmentId: 'env-keep', taskId: 'task-delete' }));
  await runs.completeRun(otherActor, byTaskHistory, 'cancelled');

  await runs.removeRunsForSystem('system-delete');
  assert.equal(runs.getActiveRun(actor, keep.id)?.taskId, 'task-keep');
  assert.equal(runs.getActiveRuns(actor).some(run => run.craftingSystemId === 'system-delete'), false);
  assert.equal(runs.getRunHistory(actor).some(run => run.craftingSystemId === 'system-delete'), false);

  await runs.removeRunsForEnvironment('env-delete');
  assert.equal(runs.getActiveRuns(otherActor).some(run => run.environmentId === 'env-delete'), false);

  await runs.removeRunsForTask('task-delete', { environmentId: 'env-other' });
  assert.equal(runs.getRunHistory(otherActor).some(run => run.taskId === 'task-delete'), true);

  await runs.removeRunsForTask('task-delete', { environmentId: 'env-keep' });
  assert.equal(runs.getRunHistory(otherActor).some(run => run.taskId === 'task-delete'), false);
  assert.equal(runs.getActiveRun(actor, keep.id)?.taskId, 'task-keep');
});

function mergeObjects(previous, next) {
  if (!previous || typeof previous !== 'object' || Array.isArray(previous)) {
    return clonePlain(next);
  }
  if (!next || typeof next !== 'object' || Array.isArray(next)) {
    return clonePlain(next);
  }

  const merged = clonePlain(previous);
  for (const [key, value] of Object.entries(next)) {
    merged[key] = mergeObjects(merged[key], value);
  }
  return merged;
}

function clonePlain(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
