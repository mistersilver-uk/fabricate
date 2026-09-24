/**
 * The bulk edits in `manager/bulkEdits.js` (issue 1923): each writer's GM gate and error text, and
 * the manager members it reaches through `io`. A member replaced mid-call or before a later call
 * must be seen, so every bag entry reads its member at call time and the bag is never cached.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

globalThis.foundry = { utils: { randomID: () => 'bulk-rid' } };
globalThis.game = { user: { isGM: false }, system: { id: 'dnd5e' }, actors: [], fabricate: null };
globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

const { CraftingSystemManager } = await import('../../src/systems/CraftingSystemManager.js');

function recipeFake(calls, ids = ['r1', 'r2']) {
  return {
    getRecipes: () => ids.map((id) => ({ id, category: 'general', enabled: false })),
    updateRecipe: async (id) => void calls.push(`updateRecipe:${id}`),
    save: async () => void calls.push('recipes.save'),
    notifyRecipesChanged: () => void calls.push('notifyRecipesChanged'),
  };
}

function bulkManager(calls = []) {
  const manager = new CraftingSystemManager(recipeFake(calls));
  manager.save = async () => void calls.push('save');
  manager._notifySystemsChanged = () => void calls.push('_notifySystemsChanged');
  manager.systems.set(
    'sysB',
    manager._normalizeSystem({
      id: 'sysB',
      name: 'Sys B',
      essenceDefinitions: [{ id: 'fire', name: 'Fire' }],
      items: [{ id: 'c1', name: 'Ore', category: 'general', tags: [] }],
      recipeItemDefinitions: [{ id: 'book-1', name: 'Book', recipeIds: [] }],
    })
  );
  return manager;
}

/** Wrap each named member so a call through it is recorded before the original runs. */
function recordMembers(manager, calls, names) {
  for (const name of names) {
    const original = manager[name].bind(manager);
    manager[name] = (...args) => {
      calls.push(name);
      return original(...args);
    };
  }
}

test('non-GM: each bulk writer rejects with the GM-permission message naming its own action', async () => {
  globalThis.game.user.isGM = false;
  const manager = bulkManager();

  await assert.rejects(manager.applyBulkEditToComponents('sysB', ['c1'], { category: 'Ore' }), {
    message: 'GM permissions required: apply a bulk edit to components',
  });
  await assert.rejects(manager.applyBulkEditToRecipes('sysB', ['r1'], { locked: true }), {
    message: 'GM permissions required: apply a bulk edit to recipes',
  });
  await assert.rejects(manager.applyBulkEditToEssences('sysB', ['fire'], { enabled: false }), {
    message: 'GM permissions required: apply a bulk edit to essences',
  });
});

test('GM: each refusal carries its exact text', async () => {
  globalThis.game.user.isGM = true;
  const calls = [];
  const manager = bulkManager(calls);

  await assert.rejects(manager.applyBulkEditToComponents('nope', ['c1'], { category: 'Ore' }), {
    message: 'Crafting system not found: nope',
  });
  await assert.rejects(manager.applyBulkEditToRecipes('nope', ['r1'], { locked: true }), {
    message: 'Crafting system not found: nope',
  });
  await assert.rejects(manager.applyBulkEditToEssences('nope', ['fire'], { enabled: false }), {
    message: 'Crafting system not found: nope',
  });
  await assert.rejects(manager.applyBulkEditToRecipes('sysB', ['r1'], { checkTierId: 't-x' }), {
    message: 'Check tier not authored by crafting system sysB: t-x',
  });
  assert.deepEqual(calls, [], 'a refused edit writes nothing');
});

test('applyBulkEditToComponents reaches each collaborator through the manager, and a later call sees replaced members', async () => {
  globalThis.game.user.isGM = true;
  const calls = [];
  const manager = bulkManager(calls);
  recordMembers(manager, calls, [
    '_scopeBasis',
    '_salvageNormalizationContext',
    '_normalizeComponent',
  ]);

  await manager.applyBulkEditToComponents('sysB', ['c1'], { category: 'Ore' });
  assert.deepEqual(calls, [
    '_scopeBasis',
    '_salvageNormalizationContext',
    '_normalizeComponent',
    'save',
  ]);

  const later = [];
  manager.save = async () => void later.push('save');
  manager._scopeBasis = () => {
    later.push('_scopeBasis');
    return { essenceIds: null };
  };
  manager.systems = new Map([['sysB', manager.getSystem('sysB')]]);
  await manager.applyBulkEditToComponents('sysB', ['c1'], { addTags: ['rare'] });
  assert.deepEqual(later, ['_scopeBasis', 'save']);
  assert.deepEqual(manager.getSystem('sysB').components[0].tags, ['rare']);
});

test('applyBulkEditToRecipes reaches the manager and its recipe manager at call time, even for a member replaced mid-call', async () => {
  globalThis.game.user.isGM = true;
  const calls = [];
  const manager = bulkManager(calls);
  recordMembers(manager, calls, ['_seedMembershipFromLegacyScalars']);
  // The seed runs before the first membership normalization, so a replacement made here is
  // visible only to an entry that reads its member when called.
  const seed = manager._seedMembershipFromLegacyScalars;
  manager._seedMembershipFromLegacyScalars = (system) => {
    const original = manager._normalizeMembershipRecipeIds.bind(manager);
    manager._normalizeMembershipRecipeIds = (recipeIds) => {
      calls.push('_normalizeMembershipRecipeIds');
      return original(recipeIds);
    };
    return seed(system);
  };

  const result = await manager.applyBulkEditToRecipes('sysB', ['r1', 'r2'], {
    locked: true,
    addBookIds: ['book-1'],
  });
  assert.deepEqual(result.bookIds, ['book-1']);
  assert.deepEqual(result.recipeIds, ['r1', 'r2']);
  assert.deepEqual(calls, [
    '_seedMembershipFromLegacyScalars',
    '_normalizeMembershipRecipeIds',
    '_normalizeMembershipRecipeIds',
    'save',
    'updateRecipe:r1',
    'updateRecipe:r2',
    'recipes.save',
    '_notifySystemsChanged',
    'notifyRecipesChanged',
  ]);

  const later = [];
  manager.recipeManager = recipeFake(later, ['r3']);
  await manager.applyBulkEditToRecipes('sysB', ['r3'], { locked: true });
  assert.deepEqual(later, ['updateRecipe:r3', 'recipes.save', 'notifyRecipesChanged']);
});

test('applyBulkEditToEssences writes through the manager updateSystem', async () => {
  globalThis.game.user.isGM = true;
  const manager = bulkManager();
  const writes = [];
  manager.updateSystem = async (systemId, updates) => void writes.push([systemId, updates]);

  assert.deepEqual(await manager.applyBulkEditToEssences('sysB', ['fire'], { enabled: false }), {
    updated: 1,
    essenceIds: ['fire'],
  });
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0], 'sysB');
  assert.equal(writes[0][1].essenceDefinitions[0].enabled, false);
});
