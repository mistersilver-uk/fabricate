/**
 * Tests for adminStore graph integration (T-057)
 * Uses node:test + node:assert/strict
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { createAdminStore } from '../../src/ui/svelte/stores/adminStore.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function makeSystem(overrides = {}) {
  const id = overrides.id || 'sys1';
  return {
    id,
    name: overrides.name || `System ${id}`,
    description: '',
    features: {},
    categories: [],
    itemTags: [],
    essenceDefinitions: [],
    items: overrides.items || [],
    requirements: { time: { enabled: false }, currency: { enabled: false, units: [] } },
    craftingCheck: { mode: 'passFail', macroUuid: null, outcomes: [] },
    recipeVisibility: { listMode: 'global' },
    ...overrides
  };
}

function makeRecipe(id, name, inputComponentIds = [], outputComponentIds = []) {
  return {
    id,
    name,
    img: 'icon.png',
    category: '',
    craftingSystemId: 'sys1',
    enabled: true,
    locked: false,
    visibility: {},
    ingredientSets: inputComponentIds.length > 0
      ? [{ ingredientGroups: [{ options: inputComponentIds.map(cid => ({ match: { componentId: cid } })) }] }]
      : [],
    resultGroups: outputComponentIds.length > 0
      ? [{ results: outputComponentIds.map(cid => ({ componentId: cid })) }]
      : [],
    isSimpleRecipe: () => true,
    toJSON: () => ({ id, name, craftingSystemId: 'sys1' })
  };
}

function createMockServices(recipes = [], system = null) {
  const defaultSystem = system || makeSystem({ id: 'sys1' });
  const systems = [defaultSystem];
  const store = { lastManagedCraftingSystem: 'sys1' };

  const mockSystemManager = {
    getSystems: () => systems,
    getSystem: (id) => systems.find(s => s.id === id) || null,
    getItems: (systemId) => defaultSystem.items || []
  };

  const mockRecipeManager = {
    getRecipes: (filter) => {
      if (filter?.craftingSystemId) return recipes.filter(r => r.craftingSystemId === filter.craftingSystemId);
      return recipes;
    },
    getRecipe: (id) => recipes.find(r => r.id === id) || null
  };

  return {
    getSetting: (key) => store[key] ?? '',
    setSetting: async (key, value) => { store[key] = value; },
    getCraftingSystemManager: () => mockSystemManager,
    getRecipeManager: () => mockRecipeManager,
    getScriptMacros: () => [],
    notify: { info: () => {}, warn: () => {}, error: () => {} },
    confirmDialog: async () => true,
    localize: (key) => key,
    copyToClipboard: async () => {},
    openRecipeEditor: () => {},
    renderImportDialog: async () => {}
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('adminStore — graph integration', () => {
  it('1. Graph tab triggers graph computation in viewState', async () => {
    const recipes = [
      makeRecipe('A', 'Iron Ingot', [], ['c1']),
      makeRecipe('B', 'Iron Sword', ['c1'], [])
    ];
    const services = createMockServices(recipes);
    const store = createAdminStore(services);

    // Switch to graph tab
    await store.setTab('graph');

    const state = get(store.viewState);
    assert.ok(state.graphData, 'graphData should be present');
    assert.ok(Array.isArray(state.graphData.nodes));
    assert.ok(Array.isArray(state.graphData.edges));
    assert.equal(state.graphData.nodes.length, 2);
    assert.equal(state.graphData.edges.length, 1);
    assert.equal(state.graphData.edges[0].id, 'A->B');
  });

  it('2. Graph search term filters graph data', async () => {
    const recipes = [
      makeRecipe('A', 'Iron Ingot', [], ['c1']),
      makeRecipe('B', 'Iron Sword', ['c1'], []),
      makeRecipe('C', 'Health Potion', [], [])
    ];
    const services = createMockServices(recipes);
    const store = createAdminStore(services);

    await store.setTab('graph');
    await store.setGraphSearch('iron');

    const state = get(store.viewState);
    assert.equal(state.graphData.nodes.length, 2);
    assert.equal(state.graphSearchTerm, 'iron');
  });

  it('3. Non-graph tabs do not compute graph data (graphData remains empty)', async () => {
    const recipes = [
      makeRecipe('A', 'Iron Ingot', [], ['c1']),
      makeRecipe('B', 'Iron Sword', ['c1'], [])
    ];
    const services = createMockServices(recipes);
    const store = createAdminStore(services);

    // Start at 'systems' tab (default)
    await store.setTab('recipes');

    const state = get(store.viewState);
    // Should not have computed graph data on non-graph tabs
    assert.equal(state.graphData.nodes.length, 0);
    assert.equal(state.graphData.edges.length, 0);
  });

  it('4. System with no recipes produces empty graph data', async () => {
    const services = createMockServices([]);
    const store = createAdminStore(services);

    await store.setTab('graph');

    const state = get(store.viewState);
    assert.equal(state.graphData.nodes.length, 0);
    assert.equal(state.graphData.edges.length, 0);
  });
});
