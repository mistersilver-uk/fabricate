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
    advancedOptionsEnabled: true,
    categories: [],
    itemTags: [],
    essenceDefinitions: [],
    items: overrides.items || [],
    requirements: { time: { enabled: false }, currency: { enabled: false, provider: 'macro' } },
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

  it('5. Graph data is stable after a non-data-changing mutation (cache hit)', async () => {
    // AC1: item search does not change recipe/component data, so the graph
    // should be identical after switching away and back to the graph tab.
    const recipes = [
      makeRecipe('A', 'Iron Ingot', [], ['c1']),
      makeRecipe('B', 'Iron Sword', ['c1'], [])
    ];
    const services = createMockServices(recipes);
    const store = createAdminStore(services);

    await store.setTab('graph');
    const firstState = get(store.viewState);
    const firstNodeIds = firstState.graphData.nodes.map(n => n.id).sort();

    // Non-data mutation: change item search, then switch back to graph tab
    await store.setItemSearch('iron');
    await store.setTab('recipes');
    await store.setTab('graph');

    const secondState = get(store.viewState);
    const secondNodeIds = secondState.graphData.nodes.map(n => n.id).sort();

    assert.deepEqual(secondNodeIds, firstNodeIds, 'Graph nodes should be unchanged after non-data mutation');
    assert.equal(secondState.graphData.edges.length, firstState.graphData.edges.length);
  });

  it('6. Graph is rebuilt after a new recipe is added (cache miss)', async () => {
    // AC2: adding a recipe mutates the recipe list, so the graph must reflect it.
    const recipes = [
      makeRecipe('A', 'Iron Ingot', [], ['c1'])
    ];
    const services = createMockServices(recipes);
    const store = createAdminStore(services);

    await store.setTab('graph');
    const firstState = get(store.viewState);
    assert.equal(firstState.graphData.nodes.length, 1);

    // Simulate a new recipe being persisted — mutate the recipes array in place
    // (the mock manager returns the same array reference)
    recipes.push(makeRecipe('B', 'Iron Sword', ['c1'], []));

    // Trigger a refresh (as any action handler would)
    await store.setTab('graph');

    const secondState = get(store.viewState);
    assert.equal(secondState.graphData.nodes.length, 2, 'Graph should include the newly added recipe');
    assert.equal(secondState.graphData.edges.length, 1, 'Edge from A to B should appear after rebuild');
  });

  it('7. Graph search filtering works after cache hit', async () => {
    // AC3: filterGraph is still applied to cached layout when the search term changes.
    const recipes = [
      makeRecipe('A', 'Iron Ingot', [], ['c1']),
      makeRecipe('B', 'Iron Sword', ['c1'], []),
      makeRecipe('C', 'Health Potion', [], [])
    ];
    const services = createMockServices(recipes);
    const store = createAdminStore(services);

    await store.setTab('graph');
    // No search: all 3 nodes
    assert.equal(get(store.viewState).graphData.nodes.length, 3);

    // Apply search: only iron recipes
    await store.setGraphSearch('iron');
    assert.equal(get(store.viewState).graphData.nodes.length, 2);

    // Clear search: all 3 nodes again (filter cleared, same cached layout)
    await store.setGraphSearch('');
    assert.equal(get(store.viewState).graphData.nodes.length, 3);
  });
});
