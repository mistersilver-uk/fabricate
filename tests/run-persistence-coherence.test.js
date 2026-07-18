import test from 'node:test';
import assert from 'node:assert/strict';

import { SalvageRunManager } from '../src/systems/SalvageRunManager.js';
import { GatheringRunManager } from '../src/systems/GatheringRunManager.js';

// Salvage + gathering twins of the crafting stale-cache clobber regression
// (failed-craft-journal-gap.test.js test 3, issues 733 + 739): a second writer whose
// in-memory container predates a terminal run persisted by another writer must NOT drop
// that run when it persists its own change.

class FakeActor {
  constructor(name = 'Shared') {
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
  globalThis.foundry = { utils: { randomID: () => `rid-${++id}` } };
  globalThis.game = { user: { id: 'gm-1' }, time: { worldTime }, actors };
}

test('SalvageRunManager: a stale-cache resume persist keeps a terminal run written by another writer', async () => {
  const actor = new FakeActor('SalvageShared');
  setupGlobals(1000, [actor]);
  const managerA = new SalvageRunManager();
  const managerB = new SalvageRunManager();

  // (1) B seeds its cache with a maturing timed run — its snapshot predates A's write.
  let bRun = await managerB.createRun(actor, {
    craftingSystemId: 'sys',
    componentId: 'comp-b',
    status: 'inProgress',
  });
  bRun = await managerB.markRunWaitingForTime(actor, bRun, { hours: 1 });

  // (2) A writes an immediate FAILED salvage to the shared document.
  const aRun = await managerA.createRun(actor, {
    craftingSystemId: 'sys',
    componentId: 'comp-a',
    status: 'inProgress',
  });
  await managerA.completeRun(actor, aRun, 'failed');
  assert.equal(
    new SalvageRunManager().getRunHistory(actor).some((r) => r.id === aRun.id),
    true,
    'A failed run is in the document'
  );

  // (3) B's timer matures; the primary GM (B, stale cache) resumes + completes it.
  globalThis.game.time.worldTime = bRun.timeGate.availableAt + 10;
  await managerB.processWorldTime(globalThis.game.time.worldTime);
  await managerB.completeRun(actor, managerB.getActiveRun(actor, bRun.id), 'succeeded');

  // (4) Both terminal runs survive (a fresh manager reads the persisted document).
  const ids = new SalvageRunManager()
    .getRunHistory(actor)
    .map((r) => r.id)
    .sort();
  assert.ok(ids.includes(aRun.id), 'the failed salvage survives B stale-cache resume');
  assert.ok(ids.includes(bRun.id), 'B succeeded salvage is present');
});

function gatheringManager() {
  let id = 0;
  return new GatheringRunManager({
    randomID: () => `grun-${++id}`,
    nowWorldTime: () => Number(globalThis.game?.time?.worldTime || 0),
    getUserId: () => 'gm-1',
    getActors: () => globalThis.game?.actors || [],
  });
}

test('GatheringRunManager: a stale-cache completion keeps a terminal run written by another writer', async () => {
  const actor = new FakeActor('GatherShared');
  setupGlobals(1000, [actor]);
  const managerA = gatheringManager();
  const managerB = gatheringManager();

  // (1) B seeds its cache with a maturing waiting run for one task.
  const bRun = await managerB.createWaitingRun(
    actor,
    { craftingSystemId: 'sys', environmentId: 'env', taskId: 'task-b' },
    { hours: 1 }
  );

  // (2) A archives a terminal run for a DIFFERENT task into the shared document.
  const aRun = await managerA.createTerminalRun(
    actor,
    { craftingSystemId: 'sys', environmentId: 'env', taskId: 'task-a' },
    'failed'
  );
  assert.equal(
    gatheringManager()
      .getRunHistory(actor)
      .some((r) => r.id === aRun.id),
    true,
    'A terminal run is in the document'
  );

  // (3) B's timer matures; B (stale cache) completes its run.
  globalThis.game.time.worldTime = bRun.timeGate.availableAt + 10;
  await managerB.completeRun(actor, managerB.getActiveRun(actor, bRun.id), 'succeeded');

  // (4) Both terminal runs survive (a fresh manager reads the persisted document).
  const ids = gatheringManager()
    .getRunHistory(actor)
    .map((r) => r.id)
    .sort();
  assert.ok(ids.includes(aRun.id), 'the failed gathering run survives B stale-cache completion');
  assert.ok(ids.includes(bRun.id), 'B succeeded gathering run is present');
});
