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

test('CraftingRunManager: history retention - 50th entry added without truncation', async () => {
  setupGlobals(3000);
  const manager = new CraftingRunManager();
  const actor = new FakeActor('Hist50');
  const recipe = {
    id: 'recipe-h',
    craftingSystemId: 'system-h',
    getExecutionSteps: () => [{ id: 'step-1', name: 'Step' }]
  };

  // Pre-populate cache with 49 historical entries
  const existing = Array.from({ length: 49 }, (_, i) => ({ id: `hist-${i}`, recipeId: 'recipe-h', craftingSystemId: 'system-h' }));
  manager._cache.set(actor.id, { active: {}, history: existing });

  const run = await manager.createRun(actor, recipe, [], 'user-1');
  await manager.cancelRun(actor, run.id);

  const history = manager.getRunHistory(actor);
  assert.equal(history.length, 50, 'history should have exactly 50 entries after 50th addition');
  assert.equal(history[0].status, 'cancelled', 'most recent entry should be first');
});

test('CraftingRunManager: history retention - 51st entry discards oldest, length stays 50', async () => {
  setupGlobals(3000);
  const manager = new CraftingRunManager();
  const actor = new FakeActor('Hist51');
  const recipe = {
    id: 'recipe-h',
    craftingSystemId: 'system-h',
    getExecutionSteps: () => [{ id: 'step-1', name: 'Step' }]
  };

  // Pre-populate cache with 50 entries; oldest sentinel is last (index 49)
  const recent = Array.from({ length: 49 }, (_, i) => ({ id: `hist-${i}`, recipeId: 'recipe-h', craftingSystemId: 'system-h' }));
  const oldest = { id: 'oldest-sentinel', recipeId: 'recipe-h', craftingSystemId: 'system-h' };
  manager._cache.set(actor.id, { active: {}, history: [...recent, oldest] });

  const run = await manager.createRun(actor, recipe, [], 'user-1');
  await manager.cancelRun(actor, run.id);

  const history = manager.getRunHistory(actor);
  assert.equal(history.length, 50, 'history must not exceed 50 entries');
  assert.ok(!history.find(r => r.id === 'oldest-sentinel'), 'oldest entry must be discarded');
  assert.equal(history[0].status, 'cancelled', 'most recent entry must be first');
});

test('CraftingRunManager: history is stored most-recent-first', async () => {
  setupGlobals(3000);
  const manager = new CraftingRunManager();
  const actor = new FakeActor('Ordering');
  const recipe = {
    id: 'recipe-ord',
    craftingSystemId: 'system-ord',
    getExecutionSteps: () => [{ id: 'step-1', name: 'Step' }]
  };

  const runA = await manager.createRun(actor, recipe, [], 'user-1');
  await manager.cancelRun(actor, runA.id);
  const runB = await manager.createRun(actor, recipe, [], 'user-1');
  await manager.cancelRun(actor, runB.id);

  const history = manager.getRunHistory(actor);
  assert.equal(history[0].id, runB.id, 'most recently completed run must be first');
  assert.equal(history[1].id, runA.id, 'earlier run must be second');
});
