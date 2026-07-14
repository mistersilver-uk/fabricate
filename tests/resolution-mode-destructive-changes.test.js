import test from 'node:test';
import assert from 'node:assert/strict';

let idSeq = 0;
globalThis.foundry = {
  utils: {
    randomID: () => `rid-${++idSeq}`,
    getProperty: () => undefined
  }
};
globalThis.ui = { notifications: { warn: () => {}, info: () => {}, error: () => {} } };

const settingsStore = new Map();
globalThis.game = {
  user: { isGM: true },
  actors: [],
  settings: {
    get: (_namespace, key) => settingsStore.get(key),
    set: async (_namespace, key, value) => {
      settingsStore.set(key, value);
      return value;
    }
  }
};

const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');

// A recipe-manager mock that records migration calls. Recipes are plain JSON; the
// `updateRecipe` path records the migrated `resultSelection` so tests can assert
// the matrix outcome, and `deleteRecipe` records deletions.
function makeRecipeManager(recipes = []) {
  let mutableRecipes = recipes.map((r) => ({ ...r }));
  const deleted = [];
  const updated = [];
  let signatureChecks = 0;

  return {
    getRecipes(filters = {}) {
      if (filters.craftingSystemId) {
        return mutableRecipes.filter((recipe) => recipe.craftingSystemId === filters.craftingSystemId);
      }
      return mutableRecipes;
    },
    async updateRecipe(recipeId, updates) {
      updated.push({ recipeId, updates });
      mutableRecipes = mutableRecipes.map((recipe) =>
        recipe.id === recipeId ? { ...recipe, ...updates } : recipe
      );
    },
    async deleteRecipe(recipeId) {
      deleted.push(recipeId);
      mutableRecipes = mutableRecipes.filter((recipe) => recipe.id !== recipeId);
    },
    async disableSignatureConflicts() {
      signatureChecks += 1;
      return [];
    },
    _notifyRecipesChanged() {},
    getDeletedRecipeIds() {
      return [...deleted];
    },
    getUpdatedRecipeIds() {
      return updated.map((u) => u.recipeId);
    },
    getUpdate(recipeId) {
      return updated.find((u) => u.recipeId === recipeId)?.updates;
    },
    getSignatureCheckCount() {
      return signatureChecks;
    }
  };
}

function makeManager(recipeManager, { recordSaves } = {}) {
  const manager = new CraftingSystemManager(recipeManager);
  manager.initialized = true;
  manager.save = async () => {
    recordSaves?.('system-save', manager.getSystem('sys-1')?.resolutionMode);
  };
  return manager;
}

function oneByOneRecipe(id, systemId, overrides = {}) {
  return {
    id,
    name: id,
    craftingSystemId: systemId,
    ingredientSets: [{ id: `${id}-s1` }],
    resultGroups: [{ id: `${id}-g1`, name: 'Default' }],
    ...overrides
  };
}

function multiGroupRecipe(id, systemId, overrides = {}) {
  return {
    id,
    name: id,
    craftingSystemId: systemId,
    ingredientSets: [{ id: `${id}-s1` }, { id: `${id}-s2` }],
    resultGroups: [
      { id: `${id}-g1`, name: 'Alpha' },
      { id: `${id}-g2`, name: 'Beta' }
    ],
    resultSelection: { provider: 'ingredientSet' },
    ...overrides
  };
}

test('changing resolutionMode migrates 1×1 recipes instead of deleting them (inverted) and cleans stale progressive preferences', async () => {
  settingsStore.clear();
  settingsStore.set('lastManagedCraftingSystem', 'sys-1');
  settingsStore.set('progressiveResultOrder', {
    'recipe-1': ['a', 'b'],
    'recipe-2': ['c', 'd']
  });

  const recipeManager = makeRecipeManager([
    oneByOneRecipe('recipe-1', 'sys-1'),
    oneByOneRecipe('recipe-2', 'sys-2')
  ]);
  const manager = makeManager(recipeManager);
  manager.systems.set('sys-1', manager._normalizeSystem({
    id: 'sys-1',
    name: 'Alchemy Bench',
    resolutionMode: 'simple'
  }));

  // The legacy `tiered` token normalizes to `routedByCheck`; the mode still
  // changes (simple → routedByCheck). Migration-first: the 1×1 recipe-1 is now
  // CARRIED, not deleted (intended behavior change for issue 429), and recipe-2
  // belongs to a different system so it is untouched.
  await manager.updateSystem('sys-1', { resolutionMode: 'tiered' });

  assert.equal(manager.getSystem('sys-1').resolutionMode, 'routedByCheck');
  assert.deepEqual(recipeManager.getDeletedRecipeIds(), []);
  assert.deepEqual(recipeManager.getUpdatedRecipeIds(), ['recipe-1']);
  // The routed modes carry no resultSelection (the routing basis is the mode).
  assert.equal(recipeManager.getUpdate('recipe-1').resultSelection ?? null, null);
  // Preferences cleanup still runs on a mode change.
  assert.equal(settingsStore.get('lastManagedCraftingSystem'), 'sys-1');
});

test('updating a system without changing resolutionMode does not migrate or delete recipes', async () => {
  settingsStore.clear();
  settingsStore.set('progressiveResultOrder', { 'recipe-1': ['a', 'b'] });

  const recipeManager = makeRecipeManager([oneByOneRecipe('recipe-1', 'sys-1')]);
  const manager = makeManager(recipeManager);
  manager.systems.set('sys-1', manager._normalizeSystem({
    id: 'sys-1',
    name: 'Forge',
    resolutionMode: 'simple'
  }));

  await manager.updateSystem('sys-1', { name: 'Grand Forge' });

  assert.equal(manager.getSystem('sys-1').name, 'Grand Forge');
  assert.deepEqual(recipeManager.getDeletedRecipeIds(), []);
  assert.deepEqual(recipeManager.getUpdatedRecipeIds(), []);
  assert.deepEqual(settingsStore.get('progressiveResultOrder'), { 'recipe-1': ['a', 'b'] });
});

test('widening simple → routed deletes zero recipes and seeds providers', async () => {
  settingsStore.clear();
  const recipeManager = makeRecipeManager([
    oneByOneRecipe('recipe-1', 'sys-1'),
    multiGroupRecipe('recipe-2', 'sys-1', { resultSelection: undefined })
  ]);
  const manager = makeManager(recipeManager);
  manager.systems.set('sys-1', manager._normalizeSystem({
    id: 'sys-1',
    name: 'Forge',
    resolutionMode: 'simple'
  }));

  await manager.updateSystem('sys-1', { resolutionMode: 'routed' });

  assert.deepEqual(recipeManager.getDeletedRecipeIds(), []);
  assert.deepEqual(recipeManager.getUpdatedRecipeIds().sort(), ['recipe-1', 'recipe-2']);
});

test('narrowing routed → simple deletes ONLY the multi-set recipe and migrates the 1×1', async () => {
  settingsStore.clear();
  const recipeManager = makeRecipeManager([
    oneByOneRecipe('keep-me', 'sys-1', { resultSelection: { provider: 'ingredientSet' } }),
    multiGroupRecipe('delete-me', 'sys-1')
  ]);
  const manager = makeManager(recipeManager);
  manager.systems.set('sys-1', manager._normalizeSystem({
    id: 'sys-1',
    name: 'Forge',
    resolutionMode: 'routed'
  }));

  await manager.updateSystem('sys-1', { resolutionMode: 'simple' });

  assert.deepEqual(recipeManager.getDeletedRecipeIds(), ['delete-me']);
  assert.deepEqual(recipeManager.getUpdatedRecipeIds(), ['keep-me']);
  assert.equal(recipeManager.getUpdate('keep-me').resultSelection, null);
});

test('moving a multi-step recipe into alchemy is the only alchemy-direction delete', async () => {
  settingsStore.clear();
  const recipeManager = makeRecipeManager([
    {
      id: 'stepped',
      name: 'stepped',
      craftingSystemId: 'sys-1',
      steps: [
        { id: 'st-1', ingredientSets: [{ id: 's1' }], resultGroups: [{ id: 'g1', name: 'A' }] },
        { id: 'st-2', ingredientSets: [{ id: 's2' }], resultGroups: [{ id: 'g2', name: 'B' }] }
      ],
      resultSelection: { provider: 'check' }
    },
    oneByOneRecipe('flat', 'sys-1', { resultSelection: { provider: 'check' } })
  ]);
  const manager = makeManager(recipeManager);
  manager.systems.set('sys-1', manager._normalizeSystem({
    id: 'sys-1',
    name: 'Bench',
    resolutionMode: 'routed'
  }));

  await manager.updateSystem('sys-1', { resolutionMode: 'alchemy' });

  assert.deepEqual(recipeManager.getDeletedRecipeIds(), ['stepped']);
  // The flat routed recipe carries verbatim into alchemy.
  assert.deepEqual(recipeManager.getUpdatedRecipeIds(), ['flat']);
});

test('the merged system (with its new mode) is saved BEFORE recipes are migrated', async () => {
  settingsStore.clear();
  const events = [];
  const recipeManager = makeRecipeManager([oneByOneRecipe('recipe-1', 'sys-1')]);
  // Record the in-memory mode at the moment updateRecipe runs so we can prove the
  // system was already persisted with the new mode first.
  const originalUpdate = recipeManager.updateRecipe.bind(recipeManager);
  let managerRef = null;
  recipeManager.updateRecipe = async (recipeId, updates) => {
    events.push(`migrate:${managerRef.getSystem('sys-1').resolutionMode}`);
    return originalUpdate(recipeId, updates);
  };
  const manager = makeManager(recipeManager, {
    recordSaves: (_event, mode) => events.push(`save:${mode}`)
  });
  managerRef = manager;
  manager.systems.set('sys-1', manager._normalizeSystem({
    id: 'sys-1',
    name: 'Forge',
    resolutionMode: 'simple'
  }));

  await manager.updateSystem('sys-1', { resolutionMode: 'routedByIngredients' });

  const firstSave = events.indexOf('save:routedByIngredients');
  const firstMigrate = events.indexOf('migrate:routedByIngredients');
  assert.ok(firstSave >= 0, 'system saved with the new mode');
  assert.ok(firstMigrate >= 0, 'recipe migrated reading the new mode');
  assert.ok(firstSave < firstMigrate, 'system save must precede recipe migration');
});

test('switching to alchemy runs the signature reconciliation after migration', async () => {
  settingsStore.clear();
  const recipeManager = makeRecipeManager([
    oneByOneRecipe('recipe-1', 'sys-1', { resultSelection: { provider: 'check' } })
  ]);
  const manager = makeManager(recipeManager);
  manager.systems.set('sys-1', manager._normalizeSystem({
    id: 'sys-1',
    name: 'Bench',
    resolutionMode: 'routed'
  }));

  await manager.updateSystem('sys-1', { resolutionMode: 'alchemy' });

  assert.equal(recipeManager.getSignatureCheckCount(), 1);
});

test('a non-alchemy mode change does not run signature reconciliation', async () => {
  settingsStore.clear();
  const recipeManager = makeRecipeManager([oneByOneRecipe('recipe-1', 'sys-1')]);
  const manager = makeManager(recipeManager);
  manager.systems.set('sys-1', manager._normalizeSystem({
    id: 'sys-1',
    name: 'Forge',
    resolutionMode: 'simple'
  }));

  await manager.updateSystem('sys-1', { resolutionMode: 'routed' });

  assert.equal(recipeManager.getSignatureCheckCount(), 0);
});

// ---------------------------------------------------------------------------
// Crafting-check slot movement across the routedByIngredients boundary (issue 532)
// CraftingSystemManager._reconcileCraftingCheckSlotsForModeChange, run in
// updateSystem after normalization and before the first persist, keyed on the
// resolution-mode change. `routedByIngredients` reads craftingCheck.simple; the
// tier-routing routedByCheck reads craftingCheck.routed.
// ---------------------------------------------------------------------------

test('switching routedByCheck → routedByIngredients copies the pass/fail config routed → simple', async () => {
  settingsStore.clear();
  const recipeManager = makeRecipeManager([]);
  const manager = makeManager(recipeManager);
  manager.systems.set('sys-1', manager._normalizeSystem({
    id: 'sys-1',
    name: 'Forge',
    resolutionMode: 'routedByCheck',
    craftingCheck: {
      routed: {
        rollFormula: '1d20+3',
        dc: 17,
        thresholdMode: 'exceed',
        tiers: [{ id: 'tier-hard', name: 'Hard', dc: 22 }]
      }
    }
  }));

  await manager.updateSystem('sys-1', { resolutionMode: 'routedByIngredients' });

  const check = manager.getSystem('sys-1').craftingCheck;
  assert.equal(check.simple.rollFormula, '1d20+3', 'formula copied into the simple slot');
  assert.equal(check.simple.dc, 17);
  assert.equal(check.simple.thresholdMode, 'exceed');
  assert.equal(check.simple.tiers[0].id, 'tier-hard', 'tier ids preserved');
});

test('switching routedByIngredients → routedByCheck copies the pass/fail config simple → routed', async () => {
  settingsStore.clear();
  const recipeManager = makeRecipeManager([]);
  const manager = makeManager(recipeManager);
  manager.systems.set('sys-1', manager._normalizeSystem({
    id: 'sys-1',
    name: 'Forge',
    resolutionMode: 'routedByIngredients',
    craftingCheck: {
      simple: { rollFormula: '2d6+1', dc: 11, thresholdMode: 'meet' }
    }
  }));

  await manager.updateSystem('sys-1', { resolutionMode: 'routedByCheck' });

  const check = manager.getSystem('sys-1').craftingCheck;
  assert.equal(check.routed.rollFormula, '2d6+1', 'formula copied into the routed slot');
  assert.equal(check.routed.dc, 11);
  assert.equal(check.routed.thresholdMode, 'meet');
});

test('into routedByIngredients does NOT clobber an already-authored simple slot', async () => {
  settingsStore.clear();
  const recipeManager = makeRecipeManager([]);
  const manager = makeManager(recipeManager);
  manager.systems.set('sys-1', manager._normalizeSystem({
    id: 'sys-1',
    name: 'Forge',
    resolutionMode: 'routedByCheck',
    craftingCheck: {
      routed: { rollFormula: '1d20+3', dc: 17 },
      simple: { rollFormula: '1d8', dc: 6 }
    }
  }));

  await manager.updateSystem('sys-1', { resolutionMode: 'routedByIngredients' });

  const check = manager.getSystem('sys-1').craftingCheck;
  assert.equal(check.simple.rollFormula, '1d8', 'authored simple check is preserved');
  assert.equal(check.simple.dc, 6);
});

test('out of routedByIngredients does NOT clobber an already-authored routed slot', async () => {
  settingsStore.clear();
  const recipeManager = makeRecipeManager([]);
  const manager = makeManager(recipeManager);
  manager.systems.set('sys-1', manager._normalizeSystem({
    id: 'sys-1',
    name: 'Forge',
    resolutionMode: 'routedByIngredients',
    craftingCheck: {
      simple: { rollFormula: '2d6+1', dc: 11 },
      routed: { rollFormula: '1d20', dc: 25 }
    }
  }));

  await manager.updateSystem('sys-1', { resolutionMode: 'routedByCheck' });

  const check = manager.getSystem('sys-1').craftingCheck;
  assert.equal(check.routed.rollFormula, '1d20', 'authored routed check is preserved');
  assert.equal(check.routed.dc, 25);
});

test('a dynamic-DC simple check moved into routedByCheck loses its dynamic DC (routed has no dcMode)', async () => {
  settingsStore.clear();
  const recipeManager = makeRecipeManager([]);
  const manager = makeManager(recipeManager);
  manager.systems.set('sys-1', manager._normalizeSystem({
    id: 'sys-1',
    name: 'Forge',
    resolutionMode: 'routedByIngredients',
    craftingCheck: {
      simple: { rollFormula: '1d20', dc: 13, dcMode: 'dynamic', macroUuid: 'Macro.abc' }
    }
  }));

  await manager.updateSystem('sys-1', { resolutionMode: 'routedByCheck' });

  const routed = manager.getSystem('sys-1').craftingCheck.routed;
  assert.equal(routed.rollFormula, '1d20');
  // The routed slot carries no dcMode/macroUuid; the dynamic DC is lost and the
  // copied static routed.dc is whatever lingered in the simple slot (13 here).
  assert.equal('dcMode' in routed, false, 'routed slot has no dcMode');
  assert.equal(routed.dc, 13, 'copied static DC lingers from the simple slot (GM should re-author)');
});

test('crossing into a non-RI, non-routedByCheck mode moves no crafting-check config', async () => {
  settingsStore.clear();
  const recipeManager = makeRecipeManager([]);
  const manager = makeManager(recipeManager);
  manager.systems.set('sys-1', manager._normalizeSystem({
    id: 'sys-1',
    name: 'Forge',
    resolutionMode: 'routedByIngredients',
    craftingCheck: { simple: { rollFormula: '2d6', dc: 9 } }
  }));

  await manager.updateSystem('sys-1', { resolutionMode: 'progressive' });

  // progressive has no comparable pass/fail slot; the routed slot stays unauthored.
  assert.equal(manager.getSystem('sys-1').craftingCheck.routed.rollFormula, '');
});
