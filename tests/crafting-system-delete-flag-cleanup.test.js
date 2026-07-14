import test from 'node:test';
import assert from 'node:assert/strict';

import {
  notifications,
  importManager,
  fakeRecipeManager,
  fakeEnvironmentStore,
  fakeGatheringRunManager,
  fakeSalvageRunManager,
  fakeRichStateService,
  fakeRecipeVisibilityService,
} from './helpers/craftingSystemDeleteHarness.js';

// Three recipes belong to the system being deleted; one belongs to a system that
// is kept, so the post-deletion valid-id set is exactly ['recipe-keep'].
function threeRecipeSystem() {
  return [
    { id: 'recipe-a', craftingSystemId: 'sys-delete', name: 'A' },
    { id: 'recipe-b', craftingSystemId: 'sys-delete', name: 'B' },
    { id: 'recipe-c', craftingSystemId: 'sys-delete', name: 'C' },
    { id: 'recipe-keep', craftingSystemId: 'sys-keep', name: 'Keep' },
  ];
}

// A stateful crafting-run manager that stores active runs and removes those whose
// craftingSystemId matches, mirroring CraftingRunManager.removeRunsForSystem.
function statefulCraftingRunManager(calls, runs) {
  return {
    activeRuns: runs,
    async removeRunsForSystem(systemId) {
      calls.push({ method: 'craftingRunManager.removeRunsForSystem', systemId });
      for (let i = runs.length - 1; i >= 0; i--) {
        if (runs[i].craftingSystemId === systemId) runs.splice(i, 1);
      }
    },
  };
}

test('deleteSystem bulk-cleans learned-recipe flags in a single pass across all actors', async () => {
  notifications.length = 0;
  const calls = [];
  const actorA = { id: 'actor-a', learned: { 'recipe-a': true, 'recipe-b': true } };
  const actorB = { id: 'actor-b', learned: { 'recipe-c': true, 'recipe-keep': true } };
  const activeRuns = [
    { id: 'run-1', craftingSystemId: 'sys-delete', recipeId: 'recipe-a' },
    { id: 'run-2', craftingSystemId: 'sys-keep', recipeId: 'recipe-keep' },
  ];

  globalThis.game = {
    user: { isGM: true },
    actors: [actorA, actorB],
    settings: { get: () => '', set: async () => {} },
    fabricate: {
      getGatheringEnvironmentStore: () => fakeEnvironmentStore(calls),
      getGatheringRunManager: () => fakeGatheringRunManager(calls),
      getSalvageRunManager: () => fakeSalvageRunManager(calls),
      // Fresh factory result per lookup — the exactly-once check must count via the
      // shared `calls` array, not an instance counter.
      getCraftingRunManager: () => statefulCraftingRunManager(calls, activeRuns),
      getGatheringRichStateService: () => fakeRichStateService(calls),
      getRecipeVisibilityService: () => fakeRecipeVisibilityService(calls),
    },
  };

  const CraftingSystemManager = await importManager();
  const manager = new CraftingSystemManager(fakeRecipeManager(threeRecipeSystem()));
  manager.initialized = true;
  manager.save = async () => {};
  manager.systems.set('sys-delete', manager._normalizeSystem({ id: 'sys-delete', name: 'Bulk' }));

  await manager.deleteSystem('sys-delete');

  // Exactly ONE bulk learned-recipe pass, not one per deleted recipe.
  const learnedCalls = calls.filter((c) => c.method === 'visibilityService.cleanupLearnedRecipes');
  assert.equal(
    learnedCalls.length,
    1,
    'learned-recipe cleanup runs exactly once, not once per deleted recipe'
  );

  // The valid-id set is computed AFTER the recipes are removed, so it excludes the
  // three deleted recipes and retains only the kept-system recipe.
  assert.deepEqual(
    learnedCalls[0].validRecipeIds.sort(),
    ['recipe-keep'],
    'the bulk pass receives the post-deletion valid recipe-id set'
  );

  // Deleted recipes' learned flags are gone from every actor; the kept one stays.
  assert.deepEqual(actorA.learned, {}, 'actor-a learned flags for deleted recipes pruned');
  assert.deepEqual(
    actorB.learned,
    { 'recipe-keep': true },
    'actor-b keeps only the surviving recipe flag'
  );

  // The in-progress run for a deleted recipe is removed; the kept-system run stays.
  assert.deepEqual(
    activeRuns.map((r) => r.id),
    ['run-2'],
    'active run referencing a deleted recipe is removed'
  );

  assert.equal(manager.getSystem('sys-delete'), null);
});

test('deleteSystem survives a throwing learned-recipe cleanup and still tears down', async () => {
  notifications.length = 0;
  const calls = [];
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => {
    errors.push(args);
  };

  const activeRuns = [{ id: 'run-1', craftingSystemId: 'sys-delete', recipeId: 'recipe-a' }];

  try {
    globalThis.game = {
      user: { isGM: true },
      actors: [{ id: 'actor-a', learned: { 'recipe-a': true } }],
      settings: { get: () => '', set: async () => {} },
      fabricate: {
        getGatheringEnvironmentStore: () => fakeEnvironmentStore(calls),
        getGatheringRunManager: () => fakeGatheringRunManager(calls),
        getSalvageRunManager: () => fakeSalvageRunManager(calls),
        getCraftingRunManager: () => statefulCraftingRunManager(calls, activeRuns),
        getGatheringRichStateService: () => fakeRichStateService(calls),
        getRecipeVisibilityService: () =>
          fakeRecipeVisibilityService(calls, { throwOnCleanup: true }),
      },
    };

    const CraftingSystemManager = await importManager();
    const manager = new CraftingSystemManager(fakeRecipeManager(threeRecipeSystem()));
    manager.initialized = true;
    manager.save = async () => {};
    manager.systems.set(
      'sys-delete',
      manager._normalizeSystem({ id: 'sys-delete', name: 'Resilient' })
    );

    await manager.deleteSystem('sys-delete');

    // The throw is caught and logged, not propagated.
    assert.equal(errors.length, 1, 'the throwing learned-recipe cleanup is logged once');
    assert.match(String(errors[0][0]), /learned-recipe cleanup failed/);

    // Teardown still completes: system gone and its crafting runs still removed.
    assert.equal(manager.getSystem('sys-delete'), null);
    assert.deepEqual(activeRuns, [], 'crafting runs for the deleted system are still removed');
  } finally {
    console.error = originalError;
  }
});
