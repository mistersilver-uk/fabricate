/**
 * CraftingRunManager cache and lifecycle tests (T-091).
 *
 * Tests:
 *  6. completeStepSuccess on a one-step recipe removes run from activeRuns
 *  7. cache returns fresh data immediately after completeRun (no stale flag read)
 *  8. invalidateCache clears cached data so next read falls back to flags
 */
import test from 'node:test';
import assert from 'node:assert/strict';

if (!globalThis.foundry) {
  globalThis.foundry = {};
}
if (!globalThis.foundry.utils) {
  globalThis.foundry.utils = {};
}
if (!globalThis.foundry.utils.randomID) {
  let _runId = 0;
  globalThis.foundry.utils.randomID = () => `rid-${++_runId}`;
}

globalThis.game = {
  user: { id: 'user-1', character: null },
  time: { worldTime: 1000 },
  actors: []
};

const { CraftingRunManager } = await import('../src/systems/CraftingRunManager.js');

function makeActor(id = 'a1') {
  const flags = {};
  return {
    id,
    uuid: `Actor.${id}`,
    getFlag(ns, key) { return flags[key]; },
    setFlag(ns, key, value) { flags[key] = value; return Promise.resolve(); }
  };
}

function makeOneStepRecipe(id = 'r1') {
  return {
    id,
    craftingSystemId: 'sys1',
    getExecutionSteps: () => [{ id: 'step-1', name: 'Mix' }]
  };
}

// ---------------------------------------------------------------------------
// Test 6: completeStepSuccess on a one-step recipe removes run from activeRuns
// ---------------------------------------------------------------------------

test('T-091: completeStepSuccess on one-step recipe moves run out of activeRuns', async () => {
  const manager = new CraftingRunManager();
  const actor = makeActor();
  const recipe = makeOneStepRecipe();

  const run = await manager.createRun(actor, recipe, [], 'user-1');
  assert.equal(manager.getActiveRuns(actor).length, 1, 'run should start in active');

  await manager.completeStepSuccess(actor, run, 0, {});

  assert.equal(manager.getActiveRuns(actor).length, 0,
    'completed run must not appear in activeRuns after completeStepSuccess');

  const history = manager.getRunHistory(actor);
  assert.equal(history.length, 1, 'completed run must appear in history');
  assert.equal(history[0].status, 'succeeded', 'completed run must have status succeeded');
});

// ---------------------------------------------------------------------------
// Test 7: cache returns fresh data immediately after completeRun (no stale flag read)
// ---------------------------------------------------------------------------

test('T-091: cache returns fresh state immediately after completeRun (stale-flag prevention)', async () => {
  // Simulate a stale-flag race: after persist, getFlag would return the OLD data
  // (run still in active). The cache must serve the correct post-completion state.
  const manager = new CraftingRunManager();
  const recipe = makeOneStepRecipe('r2');

  let persistedContainer = null;
  const actor = {
    id: 'a2',
    uuid: 'Actor.a2',
    getFlag(ns, key) {
      // Simulate race: return null so _normalizeContainer produces empty container.
      // Only the cached value (written by _persist) should matter for subsequent reads.
      return null;
    },
    setFlag(ns, key, value) {
      persistedContainer = value;
      return Promise.resolve();
    }
  };

  // Manually poison the cache with stale data (run still inProgress) to simulate
  // what would happen if getFlag returned stale data on the next read
  const run = await manager.createRun(actor, recipe, [], 'user-1');
  // Poison: overwrite cache with a copy that still has the run as inProgress
  const staleContainer = {
    active: { [run.id]: { ...run, status: 'inProgress' } },
    history: []
  };
  manager._cache.set('a2', staleContainer);

  // Now complete the run — _getContainer will read stale cache, but _persist must overwrite it
  await manager.completeStepSuccess(actor, run, 0, {});

  // After completion, cache must reflect the completed state (run removed from active)
  const activeRuns = manager.getActiveRuns(actor);
  assert.equal(activeRuns.length, 0,
    'getActiveRuns must return empty after completeRun even when cache was stale before the call');
});

// ---------------------------------------------------------------------------
// Test 8: invalidateCache clears cached data so next read falls back to flags
// ---------------------------------------------------------------------------

test('T-091: invalidateCache clears per-actor cache entry', async () => {
  const manager = new CraftingRunManager();
  const actor = makeActor('a3');
  const recipe = makeOneStepRecipe('r3');

  await manager.createRun(actor, recipe, [], 'user-1');
  assert.equal(manager._cache.has('a3'), true, 'cache should be populated after createRun');

  manager.invalidateCache('a3');
  assert.equal(manager._cache.has('a3'), false, 'cache entry should be cleared after invalidateCache');
});
