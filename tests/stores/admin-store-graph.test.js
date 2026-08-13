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

  // A revision-token-minting recipe manager (issue 1076's contract), plus a call counter so a
  // test can assert that the graph index was NOT rebuilt. `getRecipes` is the only corpus
  // read the graph makes, so counting it counts index rebuilds.
  let recipeRevision = 1;
  const mockRecipeManager = {
    corpusReads: 0,
    getRecipes: (filter) => {
      mockRecipeManager.corpusReads += 1;
      if (filter?.craftingSystemId) return recipes.filter(r => r.craftingSystemId === filter.craftingSystemId);
      return recipes;
    },
    getRecipe: (id) => recipes.find(r => r.id === id) || null,
    revision: () => recipeRevision,
    advanceRevision: () => { recipeRevision += 1; }
  };

  return {
    recipeManager: mockRecipeManager,
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

// ---------------------------------------------------------------------------
// Bounding and index retention — issue 1082
// ---------------------------------------------------------------------------

describe('adminStore — bounded graph and retained index (issue 1082)', () => {
  function makeCorpus(count) {
    const recipes = [];
    for (let index = 0; index < count; index++) {
      recipes.push(
        makeRecipe(
          `r${index}`,
          `Recipe ${index}`,
          index === 0 ? [] : [`c${index - 1}`],
          [`c${index}`]
        )
      );
    }
    return recipes;
  }

  it('5. Publishes the bound descriptor alongside the graph', async () => {
    const services = createMockServices(makeCorpus(4));
    const store = createAdminStore(services);

    await store.setTab('graph');

    const { bound } = get(store.viewState).graphData;
    assert.ok(bound, 'graphData carries a bound descriptor');
    assert.equal(bound.complete, true);
    assert.equal(bound.scope, 'all');
    assert.equal(bound.totalRecipeCount, 4);
  });

  it('6. A corpus over the default bound is disclosed, never shown as a partial system', async () => {
    // 600 recipes against the 500-node default. The GM gets no nodes and a descriptor saying
    // the graph is incomplete and needs a scope — not a plausible-looking 500-recipe slice.
    const services = createMockServices(makeCorpus(600));
    const store = createAdminStore(services);

    await store.setTab('graph');

    const { nodes, bound } = get(store.viewState).graphData;
    assert.equal(nodes.length, 0);
    assert.equal(bound.complete, false);
    assert.equal(bound.requiresScope, true);
    assert.equal(bound.limitedBy, 'nodes');
    assert.equal(bound.candidateNodeCount, 600, 'the GM is told the real size');
    assert.equal(bound.maxNodes, 500);
  });

  it('7. A search over an oversized corpus still answers, scoped to the matches', async () => {
    const services = createMockServices(makeCorpus(600));
    const store = createAdminStore(services);

    await store.setTab('graph');
    await store.setGraphSearch('Recipe 42');

    const { nodes, bound } = get(store.viewState).graphData;
    // "Recipe 42" prefix-matches 42 and 420-429 — eleven rows, all inside the bound.
    assert.equal(nodes.length, 11);
    assert.equal(bound.scope, 'cohort');
    assert.equal(bound.complete, true, 'the searched cohort is shown in full');
  });

  it('8. Searching an unchanged corpus does not rebuild the producer/consumer index', async () => {
    const services = createMockServices(makeCorpus(20));
    const store = createAdminStore(services);
    const manager = services.recipeManager;

    await store.setTab('graph');
    const afterOpen = manager.corpusReads;
    await store.setGraphSearch('Recipe 1');
    const perSearchRefresh = manager.corpusReads - afterOpen;

    await store.setGraphSearch('Recipe 2');
    const secondSearch = manager.corpusReads;
    assert.equal(
      secondSearch - (afterOpen + perSearchRefresh),
      perSearchRefresh,
      'each search costs the same corpus reads — the graph index adds none'
    );

    // Now advance the revision token: the SAME search must rebuild, or the cache would serve
    // a stale corpus forever.
    manager.advanceRevision();
    const beforeInvalidated = manager.corpusReads;
    await store.setGraphSearch('Recipe 3');
    assert.equal(
      manager.corpusReads - beforeInvalidated,
      perSearchRefresh + 1,
      'a revision bump costs exactly one extra corpus read — the index rebuild'
    );
  });
});
