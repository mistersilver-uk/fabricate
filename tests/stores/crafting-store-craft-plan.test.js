/**
 * Tests for actor-crafting-app-v2 Slice 3 store additions:
 * - selectedPathByRecipeId Map writable + selectPath(recipeId, pathIndex) action
 * - craftPlan derivation in _recomputeSelectedRecipeInspector for complex recipes
 * - source allocation derived as read-only advisory display data
 * - per-instance isolation
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

const { createCraftingStore } = await import('../../src/ui/svelte/stores/craftingStore.js');

function makeIngredientOption(id, componentId, quantity = 1) {
  return {
    id,
    quantity,
    name: `Ingredient ${id}`,
    componentId,
    match: { type: 'component', componentId },
    matches(item) {
      return item?.system?.componentId === componentId
        || item?.flags?.fabricate?.componentId === componentId;
    }
  };
}

function makeIngredientGroup(id, options) {
  return { id, name: `Group ${id}`, options };
}

function makeIngredientSet(id, name, groups, opts = {}) {
  return {
    id,
    name,
    ingredientGroups: groups,
    essences: opts.essences ?? {},
    catalysts: opts.catalysts ?? [],
    resultGroupId: opts.resultGroupId ?? null
  };
}

function makeComplexRecipe(id, name, ingredientSets, opts = {}) {
  return {
    id,
    name,
    img: null,
    description: '',
    craftingSystemId: 'sys-1',
    enabled: true,
    ingredientSets,
    results: opts.results ?? [],
    steps: opts.steps ?? [],
    isVariable: opts.isVariable ?? false,
    outcomeRouting: opts.outcomeRouting ?? null,
    isSimpleRecipe: () => false,
    getResultDescription: () => opts.resultDescription ?? `${name} (1)`
  };
}

function makeActor(id, name, componentItems = []) {
  return {
    id,
    name,
    isOwner: true,
    items: componentItems.map(componentId => ({
      id: `it-${id}-${componentId}`,
      uuid: `Item.${id}.${componentId}`,
      name: componentId,
      system: { componentId, quantity: 1 }
    })),
    flags: { fabricate: { learnedRecipes: {} } }
  };
}

function makeServices({ recipes = [], systems = [], actors = [] } = {}) {
  const settingStore = { actorAppPageSize: 10 };
  const recipeManager = {
    getRecipes: () => recipes,
    getRecipe: (id) => recipes.find(r => r.id === id) ?? null,
    evaluateCraftability: () => ({
      canCraft: true,
      satisfiableSet: {},
      missing: { ingredients: [], essences: [], catalysts: [] },
      ingredientStates: [],
      essenceStates: [],
      catalystStates: []
    })
  };
  const csm = {
    getSystems: () => systems,
    getRecipesForSystem: () => recipes
  };
  return {
    getRecipeManager: () => recipeManager,
    getRecipeVisibilityService: () => ({
      evaluateRecipeAccess: () => ({ visible: true, craftable: true, reason: 'ok' }),
      learnRecipe: async () => ({ success: true })
    }),
    getCraftingRunManager: () => ({
      getActiveRuns: () => [],
      getRunHistory: () => [],
      getActiveRun: () => null,
      getRun: () => null,
      cancelRun: async () => true
    }),
    getSalvageRunManager: () => ({
      getActiveRuns: () => [],
      getRunHistory: () => [],
      cancelRun: async () => true
    }),
    getCraftingEngine: () => ({ craft: async () => ({ success: true }) }),
    getCraftingSystemManager: () => csm,
    getSetting: (key) => settingStore[key] ?? null,
    setSetting: async (key, value) => { settingStore[key] = value; },
    getAvailableActors: () => actors,
    getOwnedActors: () => actors,
    getGameUser: () => ({ id: 'u1', character: actors[0] ?? null, isGM: true }),
    getWorldTime: () => 1000,
    notify: { info: () => {}, warn: () => {}, error: () => {} },
    confirmDialog: async () => true,
    createChatMessage: async () => ({}),
    getChatSpeaker: () => ({})
  };
}

describe('Slice 3 store: complex recipe craftPlan derivation', () => {
  it('exports selectedPathByRecipeId writable and selectPath action', () => {
    const services = makeServices();
    const store = createCraftingStore(services);
    assert.ok('selectedPathByRecipeId' in store);
    assert.equal(typeof store.selectPath, 'function');
  });

  it('builds a craftPlan with paths, source allocation, and outcome for a complex recipe', async () => {
    const opt1 = makeIngredientOption('o1', 'iron', 2);
    const opt2 = makeIngredientOption('o2', 'silver', 1);
    const path1 = makeIngredientSet('p1', 'Standard Path', [
      makeIngredientGroup('g1', [opt1])
    ]);
    const path2 = makeIngredientSet('p2', 'Silver Path', [
      makeIngredientGroup('g2', [opt2])
    ]);
    const recipe = makeComplexRecipe('rcomp', 'Forged Blade', [path1, path2], {
      resultDescription: 'Forged Blade x1',
      results: [{ id: 'res1' }]
    });
    const sys = { id: 'sys-1', name: 'Smithing', enabled: true, resolutionMode: 'simple', components: [], features: { essences: false } };
    const brom = makeActor('brom', 'Brom', ['iron', 'iron']);
    const stash = makeActor('stash', 'Party Stash', ['silver']);
    const services = makeServices({ recipes: [recipe], systems: [sys], actors: [brom, stash] });
    const store = createCraftingStore(services);
    await store.refresh();

    const inspector = get(store.selectedRecipeInspector);
    assert.ok(inspector, 'inspector payload should be set');
    assert.equal(inspector.classification.isComplex, true);
    assert.equal(inspector.classification.pathCount, 2);
    assert.ok(inspector.craftPlan, 'craftPlan should be built for complex recipe');
    assert.equal(inspector.craftPlan.paths.length, 2);
    assert.equal(inspector.craftPlan.selectedPathIndex, 0, 'first path is selected by default');
    assert.equal(inspector.craftPlan.paths[0].name, 'Standard Path');

    // Source allocation: option o1 (iron x2) needs 2 of 'iron' — Brom has 2 (advisory).
    const selectedPath = inspector.craftPlan.paths[0];
    const firstOption = selectedPath.groups[0].options[0];
    assert.equal(firstOption.satisfied, true, 'iron x2 should be satisfied by Brom');
    assert.equal(firstOption.source?.actorName, 'Brom');

    // Outcome should be classified as 'fixed' for this simple variable=false case.
    assert.equal(inspector.craftPlan.outcome.type, 'fixed');
    assert.equal(inspector.craftPlan.outcome.label, 'Forged Blade x1');
  });

  it('selectPath(recipeId, idx) updates the selected path inside craftPlan', async () => {
    const opt1 = makeIngredientOption('o1', 'iron', 1);
    const opt2 = makeIngredientOption('o2', 'silver', 1);
    const recipe = makeComplexRecipe('rcomp', 'Blade', [
      makeIngredientSet('p1', 'Standard', [makeIngredientGroup('g1', [opt1])]),
      makeIngredientSet('p2', 'Silver', [makeIngredientGroup('g2', [opt2])])
    ]);
    const sys = { id: 'sys-1', name: 'Smithing', enabled: true, resolutionMode: 'simple', components: [], features: { essences: false } };
    const services = makeServices({ recipes: [recipe], systems: [sys], actors: [makeActor('a', 'Alice', ['iron', 'silver'])] });
    const store = createCraftingStore(services);
    await store.refresh();

    store.selectPath('rcomp', 1);
    const inspector = get(store.selectedRecipeInspector);
    assert.equal(inspector.craftPlan.selectedPathIndex, 1);
    assert.equal(inspector.craftPlan.paths[1].name, 'Silver');
    assert.equal(inspector.craftPlan.paths[1].isSelected, true);
  });

  it('classifies recipes correctly: isComplex / isMultiStep / pathCount / choiceCount', async () => {
    const optA = makeIngredientOption('oA', 'comp-a', 1);
    const optB = makeIngredientOption('oB', 'comp-b', 1);
    const path = makeIngredientSet('p1', 'Only Path', [
      makeIngredientGroup('g1', [optA, optB]) // OR group with 2 options
    ]);
    const recipe = makeComplexRecipe('rOR', 'Choice Recipe', [path], {
      steps: [{ id: 's1', name: 'Step 1' }, { id: 's2', name: 'Step 2' }]
    });
    const sys = { id: 'sys-1', name: 's', enabled: true, resolutionMode: 'simple', components: [], features: { essences: false } };
    const services = makeServices({ recipes: [recipe], systems: [sys], actors: [makeActor('a', 'A', [])] });
    const store = createCraftingStore(services);
    await store.refresh();

    const c = get(store.selectedRecipeInspector).classification;
    assert.equal(c.isComplex, true);
    assert.equal(c.isMultiStep, true);
    assert.equal(c.pathCount, 1);
    assert.equal(c.choiceCount, 1, 'one OR group with 2 options should count as 1 choice');
  });

  it('marks unsatisfiable paths and missing source allocation when no items match', async () => {
    const opt = makeIngredientOption('o1', 'unobtainium', 5);
    const path = makeIngredientSet('p1', 'Hard Path', [makeIngredientGroup('g1', [opt])]);
    const recipe = makeComplexRecipe('rmiss', 'Missing', [path]);
    const sys = { id: 'sys-1', name: 's', enabled: true, resolutionMode: 'simple', components: [], features: { essences: false } };
    const services = makeServices({ recipes: [recipe], systems: [sys], actors: [makeActor('a', 'A', ['iron'])] });
    const store = createCraftingStore(services);
    await store.refresh();

    const inspector = get(store.selectedRecipeInspector);
    const selectedPath = inspector.craftPlan.paths[0];
    assert.equal(selectedPath.isSatisfiable, false);
    assert.equal(selectedPath.groups[0].options[0].satisfied, false);
    assert.equal(selectedPath.groups[0].options[0].have, 0);
    assert.equal(selectedPath.groups[0].options[0].source, null, 'no source actor should be reported when nothing matches');
  });

  it('selectedPathByRecipeId is isolated per store instance', () => {
    const services = makeServices();
    const a = createCraftingStore(services);
    const b = createCraftingStore(services);
    a.selectPath('r1', 2);
    const aMap = get(a.selectedPathByRecipeId);
    const bMap = get(b.selectedPathByRecipeId);
    assert.equal(aMap.get('r1'), 2);
    assert.equal(bMap.get('r1'), undefined, 'instance B must not share path selection');
  });

  it('simple recipes do not get a craftPlan payload', async () => {
    // A simple recipe (single set, single option per group, no catalysts, etc.)
    const opt = makeIngredientOption('o1', 'iron', 1);
    const path = makeIngredientSet('p1', '', [makeIngredientGroup('g1', [opt])]);
    const recipe = {
      id: 'rsimple',
      name: 'Simple Forge',
      img: null,
      description: '',
      craftingSystemId: 'sys-1',
      enabled: true,
      ingredientSets: [path],
      results: [],
      steps: [],
      isVariable: false,
      outcomeRouting: null,
      isSimpleRecipe: () => true,
      getResultDescription: () => 'Simple Forge'
    };
    const sys = { id: 'sys-1', name: 's', enabled: true, resolutionMode: 'simple', components: [], features: { essences: false } };
    const services = makeServices({ recipes: [recipe], systems: [sys], actors: [makeActor('a', 'A', ['iron'])] });
    const store = createCraftingStore(services);
    await store.refresh();

    const inspector = get(store.selectedRecipeInspector);
    assert.equal(inspector.classification.isComplex, false);
    assert.equal(inspector.craftPlan, null, 'simple recipes should not get a craftPlan');
  });
});
