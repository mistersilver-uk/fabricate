/**
 * The delete cascades in `manager/deleteCascades.js` (issue 1923): each writer's GM gate and error
 * text, the exact notification each sends through `globalThis.ui`, and the manager members it
 * reaches through `io`. A later call, or one replaced mid-call, must see replaced members, so every
 * bag entry reads its member at call time and the bag is never cached.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

globalThis.foundry = { utils: { randomID: () => 'cascade-rid' } };
globalThis.game = { user: { isGM: false }, system: { id: 'dnd5e' }, actors: [], fabricate: null };

const { CraftingSystemManager } = await import('../../src/systems/CraftingSystemManager.js');

/** Install a fresh `globalThis.ui` whose notifications are recorded as `level: text`. */
function recordNotifications() {
  const notes = [];
  globalThis.ui = {
    notifications: {
      info: (text) => void notes.push(`info: ${text}`),
      warn: (text) => void notes.push(`warn: ${text}`),
    },
  };
  return notes;
}

function recipeFake(calls, recipes) {
  return {
    getRecipes: (filter = {}) =>
      recipes.filter((r) => !filter.craftingSystemId || r.craftingSystemId === filter.craftingSystemId),
    getRecipe: (id) => recipes.find((r) => r.id === id) ?? null,
    deleteRecipe: async (id) => void calls.push(`deleteRecipe:${id}`),
    deleteRecipes: async (ids) => {
      calls.push(`deleteRecipes:${ids.join(',')}`);
      return { deleted: ids.length, recipeIds: ids };
    },
    updateRecipe: async (id) => void calls.push(`updateRecipe:${id}`),
    save: async () => void calls.push('recipes.save'),
    notifyRecipesChanged: () => void calls.push('notifyRecipesChanged'),
    cleanupOrphanedRecipeFlags: async () => void calls.push('cleanupOrphanedRecipeFlags'),
    disableSignatureConflicts: async () => [{ name: 'Alpha' }, { name: 'Beta' }],
  };
}

function cascadeManager(calls = [], { resolutionMode = 'standard' } = {}) {
  const recipes = [
    { id: 'r1', name: 'Alpha', craftingSystemId: 'sysB', results: [{ componentId: 'c1' }] },
  ];
  const manager = new CraftingSystemManager(recipeFake(calls, recipes));
  manager.save = async () => void calls.push('save');
  manager._notifySystemsChanged = () => void calls.push('_notifySystemsChanged');
  manager._cleanupSalvageRunsForComponent = async (id) => void calls.push(`salvage:${id}`);
  manager.systems.set(
    'sysB',
    manager._normalizeSystem({
      id: 'sysB',
      name: 'Sys B',
      resolutionMode,
      essenceDefinitions: [{ id: 'fire', name: 'Fire' }],
      items: [
        { id: 'c1', name: 'Ore', category: 'general', tags: [] },
        { id: 'c2', name: 'Ash', category: 'general', tags: [] },
      ],
      recipeItemDefinitions: [{ id: 'book-1', name: 'Book', recipeIds: ['r1'] }],
    })
  );
  return manager;
}

/** Replace each named member with a recorder that answers `result` without running it. */
function stubMembers(manager, calls, names, result = undefined) {
  for (const name of names) {
    manager[name] = async (...args) => {
      calls.push(name);
      return typeof result === 'function' ? result(...args) : result;
    };
  }
}

test('non-GM: each delete rejects with the GM-permission message naming its own action', async () => {
  globalThis.game.user.isGM = false;
  const calls = [];
  const manager = cascadeManager(calls);

  await assert.rejects(manager.deleteSystem('sysB'), {
    message: 'GM permissions required: delete crafting system',
  });
  await assert.rejects(manager.deleteItem('sysB', 'c1'), {
    message: 'GM permissions required: delete component',
  });
  await assert.rejects(manager.deleteComponents('sysB', ['c1']), {
    message: 'GM permissions required: delete components',
  });
  assert.deepEqual(calls, [], 'a refused delete writes nothing');
  assert.ok(manager.getSystem('sysB'), 'and the system survives');
});

test('GM: each unknown-system refusal carries its exact text', async () => {
  globalThis.game.user.isGM = true;
  const calls = [];
  const manager = cascadeManager(calls);

  await assert.rejects(manager.deleteSystem('nope'), { message: 'Crafting system not found: nope' });
  await assert.rejects(manager.deleteItem('nope', 'c1'), {
    message: 'Crafting system not found: nope',
  });
  await assert.rejects(manager.deleteComponents('nope', ['c1']), {
    message: 'Crafting system not found: nope',
  });
  assert.deepEqual(calls, [], 'a refused delete writes nothing');
});

test('deleteSystem deletes, saves, cleans up, then notifies, reaching members replaced mid-call', async () => {
  globalThis.game.user.isGM = true;
  const calls = [];
  const manager = cascadeManager(calls);
  stubMembers(manager, calls, ['_cleanupSystemScopedState']);
  // Replaced after the bag is built, so only an entry that reads its member when called sees them.
  const deleteRecipe = manager.recipeManager.deleteRecipe;
  manager.recipeManager.deleteRecipe = async (id) => {
    stubMembers(manager, calls, ['_cleanupSystemScopedState'], () => calls.push('replaced'));
    manager.systems = new Map(manager.systems);
    return deleteRecipe(id);
  };
  const notes = recordNotifications();

  await manager.deleteSystem('sysB');
  assert.deepEqual(calls, [
    'deleteRecipe:r1',
    'save',
    '_cleanupSystemScopedState',
    'replaced',
    '_notifySystemsChanged',
  ]);
  assert.equal(manager.systems.has('sysB'), false, 'the reassigned map lost the system');
  assert.deepEqual(notes, ['info: Deleted crafting system "Sys B" and 5 related entities.']);
});

test('deleteSystem warns with the undeleted count when a recipe delete fails', async () => {
  globalThis.game.user.isGM = true;
  const manager = cascadeManager();
  manager._cleanupSystemScopedState = async () => {};
  manager.recipeManager.deleteRecipe = async () => {
    throw new Error('refused');
  };
  const notes = recordNotifications();
  const logged = [];
  const consoleError = console.error;
  console.error = (...args) => void logged.push(args);
  try {
    await manager.deleteSystem('sysB');
  } finally {
    console.error = consoleError;
  }

  assert.equal(logged.length, 1);
  assert.deepEqual(notes, [
    'warn: Deleted crafting system "Sys B" and 5 related entities. 1 recipe could not be ' +
      'auto-deleted and may need manual removal (see the console for ids).',
  ]);
});

test('_cleanupSystemScopedState reaches the six service getters and the preference cleanup', async () => {
  globalThis.game.user.isGM = true;
  const calls = [];
  const manager = cascadeManager(calls);
  const getters = [
    '_getGatheringEnvironmentStore',
    '_getGatheringRunManager',
    '_getSalvageRunManager',
    '_getCraftingRunManager',
    '_getGatheringRichStateService',
    '_getRecipeVisibilityService',
  ];
  for (const name of getters) {
    manager[name] = () => {
      calls.push(name);
      return null;
    };
  }
  stubMembers(manager, calls, ['_cleanupCraftingPreferences']);

  await manager._cleanupSystemScopedState('sysB', { removedRecipeIds: ['r1'] });
  assert.deepEqual(calls, [...getters, '_cleanupCraftingPreferences']);
});

test('deleteItem reaches the component-set body and reconcile through the manager, and notifies', async () => {
  globalThis.game.user.isGM = true;
  const calls = [];
  const manager = cascadeManager(calls);
  stubMembers(manager, calls, ['_stripComponentsFromRecipes'], () => ({
    recipesUpdated: 1,
    recipesDisabled: 0,
  }));
  stubMembers(manager, calls, ['_reconcileAlchemySignaturesAfterDeletion']);
  const deleteComponentSet = manager._deleteComponentSet.bind(manager);
  manager._deleteComponentSet = (...args) => {
    calls.push('_deleteComponentSet');
    return deleteComponentSet(...args);
  };
  const notes = recordNotifications();

  assert.equal(await manager.deleteItem('sysB', 'c1'), true);
  assert.deepEqual(calls, [
    '_deleteComponentSet',
    '_stripComponentsFromRecipes',
    'salvage:c1',
    'save',
    '_reconcileAlchemySignaturesAfterDeletion',
  ]);
  assert.deepEqual(notes, ['info: Removed "Ore" and updated 1 recipe(s).']);
});

test('deleteComponents announces the set exactly and reaches a reconcile replaced mid-call', async () => {
  globalThis.game.user.isGM = true;
  const calls = [];
  const manager = cascadeManager(calls);
  const deleteComponentSet = manager._deleteComponentSet.bind(manager);
  manager._deleteComponentSet = (...args) => {
    stubMembers(manager, calls, ['_reconcileAlchemySignaturesAfterDeletion']);
    return deleteComponentSet(...args);
  };
  const notes = recordNotifications();

  assert.deepEqual(await manager.deleteComponents('sysB', ['c1', 'c2']), {
    deleted: 2,
    componentIds: ['c1', 'c2'],
    recipesUpdated: 1,
    recipesDisabled: 1,
  });
  assert.deepEqual(calls, [
    'updateRecipe:r1',
    'recipes.save',
    'notifyRecipesChanged',
    'salvage:c1',
    'salvage:c2',
    'save',
    '_notifySystemsChanged',
    '_reconcileAlchemySignaturesAfterDeletion',
  ]);
  assert.deepEqual(notes, ['info: Removed 2 component(s) and updated 1 recipe(s).']);
});

test('an alchemy reconcile names the disabled recipes through the ui of each call', async () => {
  globalThis.game.user.isGM = true;
  const manager = cascadeManager([], { resolutionMode: 'alchemy' });
  const expected = ['info: Disabled 2 recipe(s) with conflicting signatures: Alpha, Beta'];

  for (let call = 0; call < 2; call += 1) {
    const notes = recordNotifications();
    await manager._reconcileAlchemySignaturesAfterDeletion(manager.getSystem('sysB'));
    assert.deepEqual(notes, expected, `call ${call + 1} notifies through the ui installed for it`);
  }
});

test('_deleteRecipeSet prunes membership and persists through the manager at call time', async () => {
  globalThis.game.user.isGM = true;
  const calls = [];
  const manager = cascadeManager(calls);
  const normalize = manager._normalizeMembershipRecipeIds.bind(manager);
  manager._normalizeMembershipRecipeIds = (recipeIds) => {
    calls.push('_normalizeMembershipRecipeIds');
    return normalize(recipeIds);
  };

  const result = await manager.deleteRecipes('sysB', ['r1']);
  assert.equal(result.recipeItemsRewritten, 1);
  assert.deepEqual(manager.getSystem('sysB').recipeItemDefinitions[0].recipeIds, []);
  assert.deepEqual(calls, [
    'deleteRecipes:r1',
    '_normalizeMembershipRecipeIds',
    'save',
    'cleanupOrphanedRecipeFlags',
    '_notifySystemsChanged',
    'notifyRecipesChanged',
  ]);
});
