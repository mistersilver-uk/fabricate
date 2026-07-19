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

// Foundry's setFlag performs a RECURSIVE MERGE that never removes keys deleted
// from an object, so a run removed from `active` would linger in the stored flag
// and resurrect on reload. This actor reproduces that merge (and the `-=` deletion
// that `_persist` must issue to counter it); the default FakeActor.setFlag simply
// replaces the value and cannot catch the regression.
class MergeActor {
  constructor(name = 'Merge') {
    this.id = `id-${name}`;
    this.name = name;
    this.uuid = `Actor.${name}`;
    this._stored = null; // the persisted craftingRuns container
    this.updateCalls = [];
  }

  getFlag(_scope, key) {
    return String(key).endsWith('craftingRuns') ? this._stored : undefined;
  }

  async setFlag(_scope, _key, value) {
    // Recursive-merge `active` (never deletes), replace `history` (array replace).
    const priorActive = this._stored?.active ?? {};
    this._stored = {
      active: { ...priorActive, ...(value?.active ?? {}) },
      history: Array.isArray(value?.history) ? value.history : (this._stored?.history ?? []),
    };
    return value;
  }

  async update(data) {
    this.updateCalls.push(data);
    for (const path of Object.keys(data)) {
      const match = /craftingRuns\.active\.-=(.+)$/.exec(path);
      if (match && this._stored?.active) delete this._stored.active[match[1]];
    }
  }
}

test('CraftingRunManager._persist deletes removed active runs from the stored flag (setFlag merge cannot)', async () => {
  setupGlobals();
  const manager = new CraftingRunManager();
  const actor = new MergeActor();

  const run = await manager.createRun(actor, singleStepRecipe('m'), [actor], 'user-1');
  assert.ok(actor._stored.active[run.id], 'the new run persisted into the stored active map');

  // Simulate a reload: drop the in-memory cache so completion re-reads the flag.
  manager.invalidateCache();
  await manager.completeRun(actor, run, 'succeeded');

  assert.ok(
    !actor._stored.active[run.id],
    'the completed run is actually removed from the stored active map (not just in memory)'
  );
  assert.equal(Object.keys(actor._stored.active).length, 0, 'no stale active run lingers');
  assert.equal(actor._stored.history.length, 1, 'the run is archived to history exactly once');
  assert.ok(
    actor.updateCalls.some((data) =>
      Object.keys(data).some((path) => path.includes(`active.-=${run.id}`))
    ),
    'the persist path issued a Foundry -= deletion for the removed run'
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

// --- Spec 002 (Data Models) "CraftingRun Requirements" invariants ---------
// Rule 4: `finishedAt` is required for terminal statuses (`succeeded`, `failed`,
//   `cancelled`) and must be absent for non-terminal statuses (`inProgress`,
//   `waitingTime`).
// Rule 2: `currentStepIndex` must be `null` for terminal statuses.
// `completeRun` is the sole funnel through which every terminal transition
// passes, so these guards pin all three terminal paths against it.
//
// NOTE ON "absent": the model represents an unfinished run as `finishedAt:
// undefined` (an own key with an undefined value), not a missing key. The
// normative meaning of "absent" here is "carries no finish timestamp", so these
// tests assert `=== undefined`, NOT key-absence. Asserting the key were missing
// would wrongly fail against the model's own `createRun` shape.
const TERMINAL_PATHS = {
  succeeded: (manager, actor, run) => manager.completeStepSuccess(actor, run, 0, {}),
  failed: (manager, actor, run) => manager.completeStepFailure(actor, run, 0, 'check failed'),
  cancelled: (manager, actor, run) => manager.cancelRun(actor, run.id),
};

test('CraftingRunManager: finishedAt is present, finite, and captures the completion world-time on every terminal transition (spec 002 rule 4)', async () => {
  for (const [expectedStatus, finish] of Object.entries(TERMINAL_PATHS)) {
    // Distinct create vs finish world-times: a finishedAt equal to the finish
    // time (not the start time) proves it is written AT the terminal transition,
    // so this fails if finishedAt were set prematurely at createRun.
    setupGlobals(1000);
    const manager = new CraftingRunManager();
    const actor = new FakeActor(`Terminal-${expectedStatus}`);

    const run = await manager.createRun(actor, singleStepRecipe(expectedStatus), [actor], 'user-1');
    assert.equal(run.finishedAt, undefined, 'finishedAt is absent while the run is in progress');
    assert.equal(run.startedAt, 1000, 'startedAt captures the creation world-time');

    const finishTime = 4321;
    globalThis.game.time.worldTime = finishTime;
    const finished = await finish(manager, actor, run);

    assert.equal(finished.status, expectedStatus, 'the run reached the expected terminal status');
    assert.notEqual(finished.finishedAt, undefined, `${expectedStatus} run has a finishedAt`);
    assert.ok(Number.isFinite(finished.finishedAt), 'finishedAt is a finite number');
    assert.equal(
      finished.finishedAt,
      finishTime,
      'finishedAt captures the completion world-time, not the start time'
    );

    // The archived history copy must preserve finishedAt so downstream duration /
    // finish-time ordering never reads undefined off a terminal run.
    const archived = manager.getRun(actor, run.id);
    assert.equal(archived.status, expectedStatus, 'the archived run is the terminal run');
    assert.equal(archived.finishedAt, finishTime, 'the history entry preserves finishedAt');
  }
});

test('CraftingRunManager: finishedAt is absent on createRun and stays absent across non-terminal transitions (spec 002 rule 4)', async () => {
  setupGlobals(1000);
  const manager = new CraftingRunManager();
  const actor = new FakeActor('NonTerminal');

  const twoStepTimed = {
    id: 'recipe-nt',
    craftingSystemId: 'system-nt',
    getExecutionSteps: () => [
      { id: 'nt-1', name: 'First', timeRequirement: { hours: 1 } },
      { id: 'nt-2', name: 'Second' },
    ],
  };

  // createRun -> inProgress
  const run = await manager.createRun(actor, twoStepTimed, [actor], 'user-1');
  assert.equal(run.status, 'inProgress');
  assert.equal(run.finishedAt, undefined, 'no finishedAt at creation (non-terminal)');

  // markStepWaitingForTime -> waitingTime (the other non-terminal status)
  await manager.markStepWaitingForTime(actor, run, 0, { hours: 1 });
  assert.equal(run.status, 'waitingTime');
  assert.equal(run.finishedAt, undefined, 'no finishedAt while blocked on elapsed time');

  // resume + intermediate step success -> inProgress on the next step
  globalThis.game.time.worldTime = 1000 + 3600;
  await manager.markStepInProgress(actor, run, 0);
  const intermediate = await manager.completeStepSuccess(actor, run, 0, {});
  assert.equal(intermediate.status, 'inProgress', 'a non-final step keeps the run in progress');
  assert.equal(intermediate.currentStepIndex, 1, 'the run advanced to the next step');
  assert.equal(
    intermediate.finishedAt,
    undefined,
    'no finishedAt after an intermediate (non-terminal) step succeeds'
  );
});

test('CraftingRunManager: currentStepIndex is null for terminal statuses and non-null while active (spec 002 rule 2)', async () => {
  for (const [expectedStatus, finish] of Object.entries(TERMINAL_PATHS)) {
    setupGlobals(1000);
    const manager = new CraftingRunManager();
    const actor = new FakeActor(`Idx-${expectedStatus}`);

    const run = await manager.createRun(
      actor,
      singleStepRecipe(`idx-${expectedStatus}`),
      [actor],
      'user-1'
    );
    assert.equal(run.currentStepIndex, 0, 'an active run points at its current step (non-null)');

    const finished = await finish(manager, actor, run);
    assert.equal(finished.status, expectedStatus);
    assert.equal(
      finished.currentStepIndex,
      null,
      `${expectedStatus} run clears currentStepIndex to null`
    );
  }
});

test('CraftingRunManager: a terminal run finishing at world time 0 records finishedAt=0 (present, not absent) (spec 002 rule 4)', async () => {
  // Precision guard: world time 0 is a valid, PRESENT finish timestamp. A naive
  // truthy check (`if (finishedAt)`) would misread 0 as absent and mis-order
  // history by finish time, so pin that 0 is distinct from undefined.
  setupGlobals(0);
  const manager = new CraftingRunManager();
  const actor = new FakeActor('ZeroTime');

  const run = await manager.createRun(actor, singleStepRecipe('zero'), [actor], 'user-1');
  const finished = await manager.cancelRun(actor, run.id);

  assert.equal(finished.status, 'cancelled');
  assert.equal(finished.finishedAt, 0, 'finishedAt is the numeric timestamp 0');
  assert.notEqual(
    finished.finishedAt,
    undefined,
    'zero is present, distinct from an absent finishedAt'
  );
  assert.ok(
    Number.isFinite(finished.finishedAt),
    'finishedAt is a finite number even at world time 0'
  );
});

test('CraftingRunManager: recordFizzle archives a failed recipe-less entry straight to history', async () => {
  setupGlobals();
  const manager = new CraftingRunManager();
  const actor = new FakeActor('Fizzler');

  const entry = await manager.recordFizzle(actor, {
    craftingSystemId: 'system-alc',
    userId: 'user-9',
  });

  assert.equal(entry.isFizzle, true, 'the entry is marked as a fizzle');
  assert.equal(entry.recipeId, null, 'a fizzle references no recipe');
  assert.equal(entry.status, 'failed', 'a fizzle is a failed attempt');
  assert.equal(entry.craftingSystemId, 'system-alc');
  assert.equal(entry.userId, 'user-9');
  assert.deepEqual(entry.steps, [], 'a fizzle carries no step/signature data');
  assert.equal(
    manager.getActiveRuns(actor).length,
    0,
    'a fizzle never enters the active container'
  );
  const history = manager.getRunHistory(actor);
  assert.equal(history.length, 1, 'the fizzle is recorded in history');
  assert.equal(history[0].id, entry.id);
});

test('CraftingRunManager: recordFizzle records unconditionally (no showAttemptHistoryToPlayers gate)', async () => {
  setupGlobals();
  const manager = new CraftingRunManager();
  const actor = new FakeActor('Fizzler2');

  await manager.recordFizzle(actor, { craftingSystemId: 'system-alc' });
  await manager.recordFizzle(actor, { craftingSystemId: 'system-alc' });

  assert.equal(
    manager.getRunHistory(actor).length,
    2,
    'every fizzle is recorded regardless of any player-visibility setting'
  );
});

test('CraftingRunManager: cleanupInvalidRuns keeps a fizzle on a valid system, prunes it on a removed system', async () => {
  setupGlobals();
  const manager = new CraftingRunManager();
  const actor = new FakeActor('FizzleCleanup');
  actor.id = 'fizzle-cleanup';
  globalThis.game.actors = [actor];

  const kept = await manager.recordFizzle(actor, { craftingSystemId: 'system-live' });
  const dropped = await manager.recordFizzle(actor, { craftingSystemId: 'system-gone' });

  // Only `system-live` remains valid; no recipe ids are valid (a fizzle is
  // recipe-less), so a naive recipe-keyed prune would drop BOTH.
  await manager.cleanupInvalidRuns(new Set(), new Set(['system-live']));

  const history = manager.getRunHistory(actor);
  assert.equal(history.length, 1, 'the fizzle on the removed system is pruned');
  assert.equal(history[0].id, kept.id, 'the fizzle on a still-valid system survives');
  assert.ok(
    !history.some((run) => run.id === dropped.id),
    'the removed-system fizzle is gone'
  );
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

test('createRun snapshots each step\'s component ingredient requirements (issue 738)', async () => {
  setupGlobals();
  const manager = new CraftingRunManager();
  const actor = new FakeActor('Snapshotter');
  const recipe = {
    id: 'recipe-req',
    craftingSystemId: 'system-1',
    getExecutionSteps: () => [
      {
        id: 'step-1',
        name: 'Forge',
        // Primary (first) ingredient set is snapshotted; component-backed
        // ingredients only (a tag/essence requirement carries no componentId).
        ingredientSets: [
          {
            ingredients: [
              { componentId: 'c-iron', quantity: 2 },
              { componentId: 'c-coal', quantity: 1 },
              { componentId: null, tag: 'flux' },
            ],
          },
          { ingredients: [{ componentId: 'c-alt', quantity: 5 }] },
        ],
      },
    ],
  };

  const run = await manager.createRun(actor, recipe, [actor], 'user-1');

  assert.deepEqual(run.steps[0].requirements, [
    { componentId: 'c-iron', quantity: 2 },
    { componentId: 'c-coal', quantity: 1 },
  ]);
});

test('createRun snapshots empty requirements for a step with no ingredient sets', async () => {
  setupGlobals();
  const manager = new CraftingRunManager();
  const actor = new FakeActor('Empty');
  const recipe = {
    id: 'recipe-empty',
    craftingSystemId: 'system-1',
    getExecutionSteps: () => [{ id: 'step-1', name: 'Only Step' }],
  };

  const run = await manager.createRun(actor, recipe, [actor], 'user-1');
  assert.deepEqual(run.steps[0].requirements, []);
});
