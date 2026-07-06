import test from 'node:test';
import assert from 'node:assert/strict';

import { CraftingRunManager } from '../src/systems/CraftingRunManager.js';
import {
  insertTerminalRuns,
  assertCappedMostRecentFirst,
  RETENTION_LIMIT,
} from './helpers/run-history-retention.js';

function singleStepRecipe(suffix) {
  return {
    id: `recipe-${suffix}`,
    craftingSystemId: 'system-cap',
    getExecutionSteps: () => [{ id: `step-${suffix}`, name: 'Only Step' }],
  };
}

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
      randomID: () => `rid-${++id}`,
    },
  };
  globalThis.game = {
    user: { id: 'user-1' },
    time: { worldTime },
    actors: [],
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
      { id: 'step-2', name: 'Step Two' },
    ],
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
    getExecutionSteps: () => [{ id: 'step-1', name: 'Only Step' }],
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

test('CraftingRunManager.completeRun never archives a duplicate history id (legacy zombie twin)', async () => {
  setupGlobals();
  const manager = new CraftingRunManager();
  const actor = new FakeActor('Zombie');

  const recipe = singleStepRecipe('z');
  const run = await manager.createRun(actor, recipe, [actor], 'user-1');
  // First completion archives it to history and clears it from active.
  await manager.completeRun(actor, run, 'succeeded');
  assert.equal(manager.getRunHistory(actor).length, 1);
  assert.equal(manager.getActiveRuns(actor).length, 0);

  // Simulate a legacy zombie: the same run still lingering in active while its
  // twin is already in history. Completing it must NOT add a second history row.
  const container = manager._getContainer(actor);
  container.active[run.id] = run;

  const warnings = [];
  const original = console.warn;
  console.warn = (msg) => warnings.push(String(msg));
  try {
    await manager.completeRun(actor, run, 'succeeded');
  } finally {
    console.warn = original;
  }

  const history = manager.getRunHistory(actor);
  assert.equal(history.length, 1, 'no duplicate history entry was archived');
  assert.deepEqual(
    history.map((r) => r.id),
    [run.id]
  );
  assert.equal(manager.getActiveRuns(actor).length, 0, 'the zombie is still cleared from active');
  assert.ok(
    warnings.some((w) => w.includes(run.id) && w.includes('already in history')),
    'a warning names the un-archived duplicate'
  );
});

test('CraftingRunManager.removeRunsForSystem purges active and history entries for the system', async () => {
  setupGlobals();
  const manager = new CraftingRunManager();
  const actor = new FakeActor('Multi');
  globalThis.game.actors = [actor];

  const recipeA = {
    id: 'recipe-a',
    craftingSystemId: 'sys-doomed',
    getExecutionSteps: () => [{ id: 'a-1', name: 'A' }],
  };
  const recipeB = {
    id: 'recipe-b',
    craftingSystemId: 'sys-keep',
    getExecutionSteps: () => [{ id: 'b-1', name: 'B' }],
  };

  const doomedActive = await manager.createRun(actor, recipeA, [actor], 'user-1');
  const keepActive = await manager.createRun(actor, recipeB, [actor], 'user-1');

  const doomedHistorySource = await manager.createRun(actor, recipeA, [actor], 'user-1');
  await manager.cancelRun(actor, doomedHistorySource.id);

  const keepHistorySource = await manager.createRun(actor, recipeB, [actor], 'user-1');
  await manager.cancelRun(actor, keepHistorySource.id);

  await manager.removeRunsForSystem('sys-doomed');

  const active = manager.getActiveRuns(actor);
  assert.deepEqual(
    active.map((r) => r.id),
    [keepActive.id]
  );
  assert.equal(manager.getRun(actor, doomedActive.id), null);

  const history = manager.getRunHistory(actor);
  assert.equal(history.length, 1);
  assert.equal(history[0].craftingSystemId, 'sys-keep');
});

test('CraftingRunManager.removeRunsForSystem is a no-op when no runs match', async () => {
  setupGlobals();
  const manager = new CraftingRunManager();
  const actor = new FakeActor('Untouched');
  globalThis.game.actors = [actor];

  const recipe = {
    id: 'recipe-only',
    craftingSystemId: 'sys-stable',
    getExecutionSteps: () => [{ id: 's', name: 'S' }],
  };
  const run = await manager.createRun(actor, recipe, [actor], 'user-1');

  await manager.removeRunsForSystem('sys-other');

  assert.deepEqual(
    manager.getActiveRuns(actor).map((r) => r.id),
    [run.id]
  );
});

test('CraftingRunManager: retention limit caps craftingRuns.history at 50, discarding the oldest (most-recent-first)', async () => {
  setupGlobals();
  const manager = new CraftingRunManager();
  const actor = new FakeActor('CraftCap');

  const insertedIds = await insertTerminalRuns(RETENTION_LIMIT + 1, async (i) => {
    const run = await manager.createRun(actor, singleStepRecipe(i), [actor], 'user-1');
    await manager.cancelRun(actor, run.id);
    return run.id;
  });

  const history = manager.getRunHistory(actor);
  assert.equal(history.length, RETENTION_LIMIT);
  // The 51st insertion discards the oldest entry.
  assert.equal(
    history.some((run) => run.id === insertedIds[0]),
    false
  );
  assertCappedMostRecentFirst(assert, history, insertedIds);
});

test('CraftingRunManager: retention limit does not truncate craftingRuns.history at exactly 50', async () => {
  setupGlobals();
  const manager = new CraftingRunManager();
  const actor = new FakeActor('CraftExact');

  const insertedIds = await insertTerminalRuns(RETENTION_LIMIT, async (i) => {
    const run = await manager.createRun(actor, singleStepRecipe(i), [actor], 'user-1');
    await manager.cancelRun(actor, run.id);
    return run.id;
  });

  const history = manager.getRunHistory(actor);
  assert.equal(history.length, RETENTION_LIMIT);
  // The 50th insertion does NOT truncate: the oldest entry is retained.
  assert.equal(
    history.some((run) => run.id === insertedIds[0]),
    true
  );
  assertCappedMostRecentFirst(assert, history, insertedIds);
});

test('CraftingRunManager: retention cap holds across completeStepSuccess and completeStepFailure terminal paths', async () => {
  const terminalPaths = {
    completeStepSuccess: (manager, actor, run) => manager.completeStepSuccess(actor, run, 0, {}),
    completeStepFailure: (manager, actor, run) =>
      manager.completeStepFailure(actor, run, 0, 'check failed'),
  };

  for (const [label, finish] of Object.entries(terminalPaths)) {
    setupGlobals();
    const manager = new CraftingRunManager();
    const actor = new FakeActor(`Craft-${label}`);

    const insertedIds = await insertTerminalRuns(RETENTION_LIMIT + 1, async (i) => {
      const run = await manager.createRun(actor, singleStepRecipe(i), [actor], 'user-1');
      await finish(manager, actor, run);
      return run.id;
    });

    const history = manager.getRunHistory(actor);
    assert.equal(
      history.length,
      RETENTION_LIMIT,
      `${label} should cap history at ${RETENTION_LIMIT}`
    );
    assertCappedMostRecentFirst(assert, history, insertedIds);
  }
});

test('CraftingRunManager: discardRun removes from active WITHOUT archiving to history', async () => {
  setupGlobals();
  const manager = new CraftingRunManager();
  const actor = new FakeActor('Discarder');
  actor.id = 'disc-1';

  const run = await manager.createRun(actor, singleStepRecipe('d'), [actor], 'user-1');
  assert.equal(manager.getActiveRuns(actor).length, 1);

  const discarded = await manager.discardRun(actor, run.id);
  assert.equal(discarded?.id, run.id, 'returns the discarded run');
  assert.equal(manager.getActiveRuns(actor).length, 0, 'removed from active');
  assert.equal(
    manager.getRunHistory(actor).length,
    0,
    'NOT archived to history (unlike cancelRun)'
  );

  assert.equal(await manager.discardRun(actor, 'no-such-id'), null, 'unknown id returns null');
});

test('CraftingRunManager: pruneInstantaneousActiveRuns removes single-step no-time runs, keeps the rest', async () => {
  setupGlobals();
  const manager = new CraftingRunManager();
  const actor = new FakeActor('Pruner');
  actor.id = 'prune-1';
  globalThis.game.actors = [actor];

  const instant = {
    id: 'r-instant',
    craftingSystemId: 's',
    getExecutionSteps: () => [{ id: 's1', name: 'Only' }],
  };
  const timed = {
    id: 'r-timed',
    craftingSystemId: 's',
    getExecutionSteps: () => [{ id: 's1', name: 'Only', timeRequirement: { hours: 1 } }],
  };
  const multi = {
    id: 'r-multi',
    craftingSystemId: 's',
    getExecutionSteps: () => [{ id: 's1' }, { id: 's2' }],
  };
  const unknown = {
    id: 'r-unknown',
    craftingSystemId: 's',
    getExecutionSteps: () => [{ id: 's1' }],
  };

  await manager.createRun(actor, instant, [actor], 'u');
  await manager.createRun(actor, timed, [actor], 'u');
  await manager.createRun(actor, multi, [actor], 'u');
  await manager.createRun(actor, unknown, [actor], 'u');
  assert.equal(manager.getActiveRuns(actor).length, 4);

  const byId = { 'r-instant': instant, 'r-timed': timed, 'r-multi': multi };
  const pruned = await manager.pruneInstantaneousActiveRuns((id) => byId[id] ?? null);

  assert.equal(pruned, 1, 'only the single-step no-time run is pruned');
  const remaining = manager
    .getActiveRuns(actor)
    .map((r) => r.recipeId)
    .sort();
  assert.deepEqual(
    remaining,
    ['r-multi', 'r-timed', 'r-unknown'],
    'time-gated, multi-step, and unknown-recipe runs are kept'
  );
});
