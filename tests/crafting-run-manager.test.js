import test from 'node:test';
import assert from 'node:assert/strict';

import { CraftingRunManager } from '../src/systems/CraftingRunManager.js';

class FakeActor {
  constructor(name = 'Test Actor') {
    this.name = name;
    this.uuid = `Actor.${name.replace(/\s+/g, '-')}`;
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

function setupGlobals(worldTime = 1000) {
  let id = 0;
  globalThis.foundry = {
    utils: {
      randomID: () => `rid-${++id}`
    }
  };
  globalThis.game = {
    user: { id: 'user-1' },
    time: { worldTime },
    actors: []
  };
}

test('CraftingRunManager: create/advance/cancel flow moves active run into history', async () => {
  setupGlobals();
  const manager = new CraftingRunManager();
  const actor = new FakeActor('Runner');
  const recipe = {
    id: 'recipe-1',
    craftingSystemId: 'system-1',
    getExecutionSteps: () => [
      { id: 'step-1', name: 'Step One' },
      { id: 'step-2', name: 'Step Two' }
    ]
  };

  const run = await manager.createRun(actor, recipe, [actor], 'user-1');
  assert.equal(run.status, 'inProgress');
  assert.equal(run.currentStepIndex, 0);
  assert.equal(run.steps.length, 2);

  const progressed = await manager.completeStepSuccess(actor, run, 0, {});
  assert.equal(progressed.status, 'inProgress');
  assert.equal(progressed.currentStepIndex, 1);
  assert.equal(progressed.steps[0].status, 'succeeded');
  assert.equal(progressed.steps[1].status, 'inProgress');

  await manager.cancelRun(actor, run.id);
  const active = manager.getActiveRuns(actor);
  assert.equal(active.length, 0);

  const history = manager.getRunHistory(actor);
  assert.equal(history.length, 1);
  assert.equal(history[0].status, 'cancelled');
  assert.equal(history[0].currentStepIndex, null);
});

test('CraftingRunManager: history retention limit enforced — 50th entry no truncation, 51st discards oldest, most-recent-first order', async () => {
  setupGlobals();
  const manager = new CraftingRunManager();
  const actor = new FakeActor('HistoryLimit');
  const recipe = {
    id: 'recipe-limit',
    craftingSystemId: 'system-limit',
    getExecutionSteps: () => [{ id: 'step-1', name: 'Only Step' }]
  };

  // Create and complete 50 runs
  const completedIds = [];
  for (let i = 0; i < 50; i++) {
    const run = await manager.createRun(actor, recipe, [], 'user-1');
    const completed = await manager.completeStepSuccess(actor, run, 0, {});
    completedIds.push(completed.id);
  }

  // After 50 entries, no truncation has occurred
  const historyAt50 = manager.getRunHistory(actor);
  assert.equal(historyAt50.length, 50);

  // Most-recent-first: last completed run is at index 0, first at index 49
  assert.equal(historyAt50[0].id, completedIds[49]);
  assert.equal(historyAt50[49].id, completedIds[0]);

  // Insert the 51st run — oldest should be discarded, length stays at 50
  const run51 = await manager.createRun(actor, recipe, [], 'user-1');
  const completed51 = await manager.completeStepSuccess(actor, run51, 0, {});

  const historyAt51 = manager.getRunHistory(actor);
  assert.equal(historyAt51.length, 50);
  assert.equal(historyAt51.find(r => r.id === completedIds[0]), undefined, 'oldest entry should be evicted');
  assert.equal(historyAt51[0].id, completed51.id, 'newest entry should be first');
});

test('CraftingRunManager: getRun and history limit helpers work for active + historical entries', async () => {
  setupGlobals(2000);
  const manager = new CraftingRunManager();
  const actor = new FakeActor('Reader');
  const recipe = {
    id: 'recipe-2',
    craftingSystemId: 'system-2',
    getExecutionSteps: () => [{ id: 'step-1', name: 'Only Step' }]
  };

  const runA = await manager.createRun(actor, recipe, [actor], 'user-1');
  await manager.cancelRun(actor, runA.id);

  const runB = await manager.createRun(actor, recipe, [actor], 'user-1');
  const activeLookup = manager.getRun(actor, runB.id);
  assert.equal(activeLookup?.id, runB.id);
  assert.equal(activeLookup?.status, 'inProgress');

  const historyLookup = manager.getRun(actor, runA.id);
  assert.equal(historyLookup?.id, runA.id);
  assert.equal(historyLookup?.status, 'cancelled');

  const limitedHistory = manager.getRunHistory(actor, 1);
  assert.equal(limitedHistory.length, 1);
});
