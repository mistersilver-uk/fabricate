import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

let idSeq = 0;
const settingsStore = new Map();
// Records the key of every game.settings.set call so a test can pin the number of
// `recipes` world-setting writes a mutation issues (the #776 batch invariant).
const settingsSetKeys = [];
const notifications = [];

globalThis.foundry = {
  utils: {
    randomID: () => `rid-${++idSeq}`,
    getProperty: (obj, path) => String(path || '').split('.').reduce((value, key) => value?.[key], obj)
  }
};

globalThis.game = {
  user: { isGM: true },
  actors: [],
  fabricate: {},
  settings: {
    get: (_namespace, key) => settingsStore.get(key),
    set: async (_namespace, key, value) => {
      settingsSetKeys.push(key);
      settingsStore.set(key, value);
      return value;
    }
  }
};

globalThis.ui = {
  notifications: {
    info: message => notifications.push({ level: 'info', message }),
    warn: message => notifications.push({ level: 'warn', message }),
    error: message => notifications.push({ level: 'error', message })
  }
};

const { Recipe } = await import('../src/models/Recipe.js');
const { RecipeManager } = await import('../src/systems/RecipeManager.js');

function makeRecipeData(overrides = {}) {
  return {
    id: overrides.id || `recipe-${++idSeq}`,
    name: overrides.name || 'Test Recipe',
    craftingSystemId: overrides.craftingSystemId || 'sys-1',
    ingredientSets: [{
      id: 'set-1',
      ingredientGroups: [{
        id: 'group-1',
        name: 'Ingredients',
        options: [{ id: 'ingredient-1', itemUuid: 'Item.ingredient', quantity: 1 }]
      }],
      essences: {}
    }],
    resultGroups: [{
      id: 'result-group-1',
      results: [{ id: 'result-1', itemUuid: 'Item.result', quantity: 1 }]
    }],
    ...overrides
  };
}

function makeManager() {
  const manager = new RecipeManager();
  manager.initialized = true;
  return manager;
}

describe('RecipeManager notification controls', () => {
  beforeEach(() => {
    notifications.length = 0;
    settingsStore.clear();
    settingsSetKeys.length = 0;
  });

  it('notifies for direct recipe create, update, and delete by default', async () => {
    const manager = makeManager();

    const recipe = await manager.createRecipe(makeRecipeData({ id: 'recipe-default', name: 'Default Notice' }));
    await manager.updateRecipe(recipe.id, { name: 'Updated Notice' });
    await manager.deleteRecipe(recipe.id);

    assert.deepEqual(
      notifications.filter(entry => entry.level === 'info').map(entry => entry.message),
      [
        'Recipe "Default Notice" created',
        'Recipe "Updated Notice" updated',
        'Recipe "Updated Notice" deleted'
      ]
    );
  });

  it('suppresses recipe create, update, and delete notifications when notify is false', async () => {
    const manager = makeManager();

    const recipe = await manager.createRecipe(
      makeRecipeData({ id: 'recipe-suppressed', name: 'Suppressed Notice' }),
      { notify: false }
    );
    await manager.updateRecipe(recipe.id, { name: 'Still Suppressed' }, { notify: false });
    await manager.deleteRecipe(recipe.id, { notify: false });

    assert.deepEqual(notifications, []);
    assert.equal(manager.getRecipe(recipe.id), null);
  });

  it('emits recipe change hooks for direct and import mutations', async () => {
    const previousHooks = globalThis.Hooks;
    const hookPayloads = [];
    globalThis.Hooks = {
      callAll: (hookName, payload) => {
        if (hookName === 'fabricate.recipesChanged') hookPayloads.push(payload);
      }
    };
    const manager = makeManager();

    try {
      const recipe = await manager.createRecipe(makeRecipeData({ id: 'recipe-hook', name: 'Hooked Recipe' }), { notify: false });
      await manager.updateRecipe(recipe.id, { name: 'Hooked Update' }, { notify: false });
      await manager.deleteRecipe(recipe.id, { notify: false });
      await manager.importRecipes([makeRecipeData({ id: 'recipe-import-hook', name: 'Hooked Import' })], true);

      assert.deepEqual(
        hookPayloads.map(payload => payload.action),
        ['create', 'update', 'delete', 'import']
      );
      assert.equal(hookPayloads[0].recipeId, 'recipe-hook');
      assert.equal(hookPayloads.at(-1).imported, 1);
      assert.equal(hookPayloads.at(-1).total, 1);
    } finally {
      globalThis.Hooks = previousHooks;
    }
  });

  it('deleteRecipe suppresses the per-recipe flag cleanup only when cleanupFlags is false', async () => {
    const manager = makeManager();
    // Spy on the per-recipe actor-flag fan-out so the gate is pinned against the
    // REAL RecipeManager: a gate-only revert (deleteRecipe ignoring cleanupFlags and
    // always fanning out) would reintroduce the N×M regression and fail here.
    let cleanupCalls = 0;
    manager._cleanupFlagsAfterRecipeMutation = async () => {
      cleanupCalls += 1;
    };

    await manager.createRecipe(makeRecipeData({ id: 'recipe-gate-off', name: 'Gate Off' }), {
      notify: false
    });
    await manager.createRecipe(makeRecipeData({ id: 'recipe-gate-on', name: 'Gate On' }), {
      notify: false
    });

    // Batch caller opting out: no per-recipe cleanup.
    await manager.deleteRecipe('recipe-gate-off', { notify: false, cleanupFlags: false });
    assert.equal(cleanupCalls, 0, 'cleanupFlags: false suppresses _cleanupFlagsAfterRecipeMutation');

    // Default / omitted option: the per-recipe cleanup still runs.
    await manager.deleteRecipe('recipe-gate-on', { notify: false });
    assert.equal(cleanupCalls, 1, 'default deleteRecipe still runs _cleanupFlagsAfterRecipeMutation');
  });

  it('#775 Q3: updateRecipe retains a stored importSource when the GM edit omits it', async () => {
    const manager = makeManager();
    await manager.createRecipe(
      makeRecipeData({ id: 'prov-recipe', name: 'Provenanced', importSource: { systemId: 'pack-A', importedAt: 111 } }),
      { notify: false }
    );
    assert.deepEqual(
      manager.getRecipe('prov-recipe').importSource,
      { systemId: 'pack-A', importedAt: 111 },
      'the stamped provenance persists through create'
    );

    // A GM edit that omits importSource must inherit the stored value via the
    // `{ ...recipe.toJSON(), ...updates }` merge — so an edited imported recipe stays
    // provenance-matched (and remains auto-prunable, the documented D1 semantics).
    await manager.updateRecipe('prov-recipe', { name: 'GM Edited' }, { notify: false });
    const edited = manager.getRecipe('prov-recipe');
    assert.equal(edited.name, 'GM Edited');
    assert.deepEqual(
      edited.importSource,
      { systemId: 'pack-A', importedAt: 111 },
      'provenance survives a GM edit that never mentions importSource'
    );
  });

  it('#775 Q7: deleteRecipe persist:false mutates the map without a recipes write; default persists once', async () => {
    const manager = makeManager();
    await manager.createRecipe(makeRecipeData({ id: 'del-defer', name: 'Deferred Delete' }), {
      notify: false,
      emitChange: false
    });
    await manager.createRecipe(makeRecipeData({ id: 'del-write', name: 'Written Delete' }), {
      notify: false,
      emitChange: false
    });
    settingsSetKeys.length = 0; // reset the write counter after the two seed creates

    await manager.deleteRecipe('del-defer', {
      notify: false,
      emitChange: false,
      persist: false,
      cleanupFlags: false
    });
    assert.equal(manager.getRecipe('del-defer'), null, 'persist:false still removes the recipe from the map');
    assert.equal(
      settingsSetKeys.filter(key => key === 'recipes').length,
      0,
      'a persist:false delete issues no recipes write (folds into the batch save)'
    );

    await manager.deleteRecipe('del-write', { notify: false, emitChange: false });
    assert.equal(manager.getRecipe('del-write'), null);
    assert.equal(
      settingsSetKeys.filter(key => key === 'recipes').length,
      1,
      'a default delete issues exactly one recipes write (persist defaults to true)'
    );
  });

  it('#775: cleanupOrphanedRecipeFlags delegates to the single bulk _cleanupFlagsAfterRecipeMutation pass', async () => {
    const manager = makeManager();
    let calls = 0;
    manager._cleanupFlagsAfterRecipeMutation = async () => {
      calls += 1;
    };
    await manager.cleanupOrphanedRecipeFlags();
    assert.equal(calls, 1, 'the public wrapper runs exactly one bulk cleanup pass');
  });

  it('importRecipes emits one aggregate notification and returns counts', async () => {
    const manager = makeManager();
    manager.recipes.set('existing-recipe', new Recipe(makeRecipeData({ id: 'existing-recipe', name: 'Existing' })));

    const result = await manager.importRecipes([
      makeRecipeData({ id: 'existing-recipe', name: 'Existing Import' }),
      makeRecipeData({
        id: 'new-recipe',
        name: 'New Import',
        ingredientSets: [{
          id: 'set-2',
          ingredientGroups: [{
            id: 'group-2',
            name: 'Ingredients',
            options: [{ id: 'ingredient-2', itemUuid: 'Item.other-ingredient', quantity: 1 }]
          }],
          essences: {}
        }]
      })
    ]);

    assert.equal(result.imported, 1);
    assert.equal(result.skipped, 1);
    assert.equal(result.total, 2);
    // The counts notification (spec item 4) stays distinct and unchanged.
    assert.deepEqual(
      notifications.filter(entry => entry.level === 'info').map(entry => entry.message),
      ['Imported 1 recipes (1 skipped)']
    );
    assert.equal(manager.getRecipe('new-recipe')?.name, 'New Import');

    // The return value additively carries per-recipe conflict reasons (spec item 3).
    assert.deepEqual(result.conflicts, [
      { recipeId: 'existing-recipe', recipeName: 'Existing Import', reason: 'duplicate-id' }
    ]);

    // One aggregated conflict report (spec item 3) names the skipped recipe + reason,
    // distinct from the counts notification. Duplicate-id skips are no longer silent.
    const warnings = notifications.filter(entry => entry.level === 'warn').map(entry => entry.message);
    assert.equal(warnings.length, 1, 'exactly one aggregated conflict report');
    assert.match(warnings[0], /could not be imported/);
    assert.match(warnings[0], /"Existing Import" \(duplicate id\)/);
  });

  it('importRecipes aggregates invalid-recipe conflicts into the report instead of console.warn', async () => {
    const manager = makeManager();

    const result = await manager.importRecipes([
      // An invalid recipe: no ingredient sets / results, so activation validation fails.
      { id: 'broken-recipe', name: 'Broken', craftingSystemId: 'sys-1', ingredientSets: [], resultGroups: [] }
    ]);

    assert.equal(result.imported, 0);
    assert.equal(result.skipped, 1);
    assert.equal(result.conflicts.length, 1);
    assert.equal(result.conflicts[0].recipeId, 'broken-recipe');
    assert.equal(result.conflicts[0].reason, 'invalid');
    assert.ok(Array.isArray(result.conflicts[0].errors), 'invalid conflict carries the validation errors');

    const warnings = notifications.filter(entry => entry.level === 'warn').map(entry => entry.message);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /"Broken" \(invalid\)/);
  });

  it('importRecipes emits no conflict report when every recipe imports cleanly', async () => {
    const manager = makeManager();

    const result = await manager.importRecipes([
      makeRecipeData({ id: 'clean-recipe', name: 'Clean Import' })
    ]);

    assert.equal(result.imported, 1);
    assert.deepEqual(result.conflicts, []);
    assert.equal(
      notifications.filter(entry => entry.level === 'warn').length,
      0,
      'no aggregated conflict report when there are no conflicts'
    );
  });

  it('persist:false mutates the in-memory map but issues no recipes world write', async () => {
    const manager = makeManager();

    await manager.createRecipe(
      makeRecipeData({ id: 'no-write-create', name: 'Deferred Create' }),
      { notify: false, emitChange: false, persist: false }
    );
    assert.equal(
      manager.getRecipe('no-write-create')?.name,
      'Deferred Create',
      'the map holds the created recipe even though nothing was persisted'
    );
    assert.equal(
      settingsSetKeys.filter(key => key === 'recipes').length,
      0,
      'a persist:false create issues no recipes write'
    );

    await manager.updateRecipe(
      'no-write-create',
      { name: 'Deferred Update' },
      { notify: false, emitChange: false, persist: false }
    );
    assert.equal(
      manager.getRecipe('no-write-create')?.name,
      'Deferred Update',
      'the map reflects the update'
    );
    assert.equal(
      settingsSetKeys.filter(key => key === 'recipes').length,
      0,
      'a persist:false update still issues no recipes write'
    );
  });

  it('persist defaults to true: a plain create and update each issue exactly one recipes write', async () => {
    const manager = makeManager();

    // Backward-compat pin: flipping the default to false would drop these writes.
    await manager.createRecipe(makeRecipeData({ id: 'write-create', name: 'Written' }), {
      notify: false,
      emitChange: false
    });
    assert.equal(
      settingsSetKeys.filter(key => key === 'recipes').length,
      1,
      'a default create issues exactly one recipes write'
    );

    await manager.updateRecipe(
      'write-create',
      { name: 'Rewritten' },
      { notify: false, emitChange: false }
    );
    assert.equal(
      settingsSetKeys.filter(key => key === 'recipes').length,
      2,
      'a default update issues one more recipes write'
    );
  });
});
