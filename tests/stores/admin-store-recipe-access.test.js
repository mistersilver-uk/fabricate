/**
 * Per-recipe access grants in the admin store (Books & Scrolls `restricted`
 * visibility mode, Stream 3).
 *
 * Covers:
 *   - the recipe-list projection's `access` snapshot + `accessSummary`
 *     ({ characterCount, playerCount }) derived from each recipe's toJSON;
 *   - `getPcRoster()` delegating to services.getPlayerCharacterActors;
 *   - `saveRecipeAccess(recipeId, { characterIds, playerIds })` replacing the whole
 *     `access` object via recipeManager.updateRecipe (allowIncomplete) + refresh.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

const { createAdminStore } = await import('../../src/ui/svelte/stores/adminStore.js');

function makeRecipe(overrides = {}) {
  const id = overrides.id || `recipe-${Math.random().toString(36).slice(2)}`;
  const access = overrides.access || { characterIds: [], playerIds: [] };
  return {
    id,
    name: overrides.name || `Recipe ${id}`,
    description: '',
    img: 'recipe.png',
    category: overrides.category || 'general',
    enabled: true,
    locked: false,
    visibility: {},
    ingredientSets: [],
    recipeItemId: '',
    craftingSystemId: overrides.craftingSystemId || 'sys1',
    isSimpleRecipe: () => true,
    toJSON: () => ({
      id,
      name: overrides.name || `Recipe ${id}`,
      craftingSystemId: overrides.craftingSystemId || 'sys1',
      access,
    }),
    ...overrides,
  };
}

function makeSystem(overrides = {}) {
  return {
    id: 'sys1',
    name: 'System One',
    description: '',
    resolutionMode: 'simple',
    visibilityMode: 'restricted',
    features: {},
    categories: [],
    itemTags: [],
    essenceDefinitions: [],
    items: [],
    requirements: { time: { enabled: false }, currency: { enabled: false, units: [] } },
    craftingCheck: { mode: 'passFail', macroUuid: null, outcomes: [] },
    recipeVisibility: { listMode: 'global' },
    recipeItemDefinitions: [],
    ...overrides,
  };
}

function createServices(recipes, capture, extra = {}) {
  const systems = [makeSystem()];
  const systemManager = {
    getSystems: () => systems,
    getSystem: (id) => systems.find((s) => s.id === id) || null,
    getItems: () => [],
  };
  const recipeManager = {
    getRecipes: (filter) =>
      filter?.craftingSystemId
        ? recipes.filter((r) => r.craftingSystemId === filter.craftingSystemId)
        : recipes,
    getRecipe: (id) => recipes.find((r) => r.id === id) || null,
    updateRecipe: async (id, updates, options) => {
      capture.push({ id, updates, options });
    },
  };
  return {
    getSetting: (key) => (key === 'lastManagedCraftingSystem' ? 'sys1' : ''),
    setSetting: async () => {},
    getCraftingSystemManager: () => systemManager,
    getRecipeManager: () => recipeManager,
    getScriptMacros: () => [],
    getSceneOptions: () => [],
    getWorldUsers: () => [],
    localize: (key) => key,
    notify: { info: () => {}, warn: () => {}, error: () => {} },
    ...extra,
  };
}

function recipeById(vs, id) {
  return (vs.recipes || []).find((r) => r.id === id);
}

describe('adminStore per-recipe access', () => {
  it('projects access + accessSummary onto each recipe row', async () => {
    const recipes = [
      makeRecipe({ id: 'r1', name: 'Alloy Bronze', access: { characterIds: ['akra', 'brann'], playerIds: [] } }),
      makeRecipe({ id: 'r2', name: 'Soul-Ash', access: { characterIds: [], playerIds: ['p2'] } }),
      makeRecipe({ id: 'r3', name: 'Longsword', access: { characterIds: [], playerIds: [] } }),
    ];
    const store = createAdminStore(createServices(recipes, []));
    await store.refresh();
    const vs = get(store.viewState);

    const r1 = recipeById(vs, 'r1');
    assert.deepEqual(r1.access, { characterIds: ['akra', 'brann'], playerIds: [] });
    assert.deepEqual(r1.accessSummary, { characterCount: 2, playerCount: 0 });

    const r2 = recipeById(vs, 'r2');
    assert.deepEqual(r2.accessSummary, { characterCount: 0, playerCount: 1 });

    const r3 = recipeById(vs, 'r3');
    assert.deepEqual(r3.accessSummary, { characterCount: 0, playerCount: 0 });
  });

  it('accessSummary defaults to zero counts when toJSON omits access', async () => {
    const bare = makeRecipe({ id: 'bare', name: 'Bare' });
    bare.toJSON = () => ({ id: 'bare', name: 'Bare', craftingSystemId: 'sys1' });
    const store = createAdminStore(createServices([bare], []));
    await store.refresh();
    const vs = get(store.viewState);
    const row = recipeById(vs, 'bare');
    assert.deepEqual(row.access, { characterIds: [], playerIds: [] });
    assert.deepEqual(row.accessSummary, { characterCount: 0, playerCount: 0 });
  });

  it('getPcRoster delegates to services.getPlayerCharacterActors', () => {
    const roster = [
      { id: 'akra', name: 'Akra', img: 'akra.png' },
      { id: 'brann', name: 'Brann', img: 'brann.png' },
    ];
    const store = createAdminStore(
      createServices([makeRecipe({ id: 'r1' })], [], { getPlayerCharacterActors: () => roster })
    );
    assert.deepEqual(store.getPcRoster(), roster);
  });

  it('getPcRoster returns [] when the service is absent', () => {
    const store = createAdminStore(createServices([makeRecipe({ id: 'r1' })], []));
    assert.deepEqual(store.getPcRoster(), []);
  });

  it('saveRecipeAccess replaces the whole access object via updateRecipe (allowIncomplete)', async () => {
    const capture = [];
    const store = createAdminStore(createServices([makeRecipe({ id: 'r1' })], capture));
    const ok = await store.saveRecipeAccess('r1', { characterIds: ['akra'], playerIds: ['p2'] });

    assert.equal(ok, true);
    assert.equal(capture.length, 1);
    assert.equal(capture[0].id, 'r1');
    assert.deepEqual(capture[0].updates, { access: { characterIds: ['akra'], playerIds: ['p2'] } });
    assert.equal(capture[0].options.allowIncomplete, true);
  });

  it('saveRecipeAccess coerces missing arrays to empty and always sends the full snapshot', async () => {
    const capture = [];
    const store = createAdminStore(createServices([makeRecipe({ id: 'r1' })], capture));
    await store.saveRecipeAccess('r1', { characterIds: ['akra'] });
    assert.deepEqual(capture[0].updates, { access: { characterIds: ['akra'], playerIds: [] } });
  });

  it('saveRecipeAccess returns false and notifies when updateRecipe rejects', async () => {
    const errors = [];
    const recipes = [makeRecipe({ id: 'r1' })];
    const services = createServices(recipes, [], {
      notify: { info: () => {}, warn: () => {}, error: (msg) => errors.push(msg) },
    });
    const origManager = services.getRecipeManager();
    services.getRecipeManager = () => ({
      ...origManager,
      updateRecipe: async () => {
        throw new Error('access boom');
      },
    });
    const store = createAdminStore(services);
    const ok = await store.saveRecipeAccess('r1', { characterIds: [], playerIds: [] });
    assert.equal(ok, false);
    assert.deepEqual(errors, ['access boom']);
  });
});
