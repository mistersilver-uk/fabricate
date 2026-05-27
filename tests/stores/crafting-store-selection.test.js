/**
 * Tests for actor-crafting-app-v2 Slice 2 store additions:
 * - selectedRecipeId / selectedRecipeInspector
 * - selectRecipe action
 * - auto-select-first behaviour
 * - per-instance isolation
 * - page index / page size writables
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

const { createCraftingStore } = await import('../../src/ui/svelte/stores/craftingStore.js');

const ALARA_IMAGE = 'icons/svg/mystery-man.svg';

function makeRecipe(id, name, opts = {}) {
  return {
    id,
    name,
    img: opts.img ?? null,
    description: opts.description ?? `${name} description`,
    craftingSystemId: opts.systemId ?? 'sys-1',
    category: opts.category ?? 'general',
    enabled: true,
    ingredientSets: opts.ingredientSets ?? [{ groups: [], essences: {} }],
    results: opts.results ?? [],
    steps: opts.steps ?? [],
    isSimpleRecipe: () => true,
    getResultDescription: () => opts.resultDescription ?? `${name} (1)`
  };
}

function makeSystem(id, recipeIds, mode = 'simple') {
  return {
    id,
    name: `System ${id}`,
    enabled: true,
    resolutionMode: mode,
    components: [],
    recipeIds,
    features: { essences: false }
  };
}

function makeServices({ recipes = [], systems = [] } = {}) {
  const actorA = {
    id: 'a1',
    name: 'Alara',
    img: ALARA_IMAGE,
    isOwner: true,
    items: [],
    flags: { fabricate: { learnedRecipes: {} } }
  };

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
    getAvailableActors: () => [actorA],
    getOwnedActors: () => [actorA],
    getGameUser: () => ({ id: 'u1', character: actorA, isGM: true }),
    getWorldTime: () => 1000,
    notify: { info: () => {}, warn: () => {}, error: () => {} },
    confirmDialog: async () => true,
    createChatMessage: async () => ({}),
    getChatSpeaker: () => ({})
  };
}

describe('Slice 2 store: selected recipe inspector', () => {
  it('exports the new writables and actions', () => {
    const services = makeServices();
    const store = createCraftingStore(services);
    assert.ok('selectedRecipeId' in store);
    assert.ok('selectedRecipeInspector' in store);
    assert.equal(typeof store.selectRecipe, 'function');
    assert.ok('craftingPageIndex' in store);
    assert.ok('historyPageIndex' in store);
    assert.ok('pageSize' in store);
    assert.equal(typeof store.setCraftingPageIndex, 'function');
    assert.equal(typeof store.setHistoryPageIndex, 'function');
    assert.equal(typeof store.setPageSize, 'function');
  });

  it('auto-selects the first prepared recipe on initial refresh when nothing is selected', async () => {
    const r1 = makeRecipe('r1', 'Healing Potion');
    const r2 = makeRecipe('r2', 'Strength Potion');
    const sys = makeSystem('sys-1', ['r1', 'r2']);
    const services = makeServices({ recipes: [r1, r2], systems: [sys] });
    const store = createCraftingStore(services);

    await store.refresh();
    const inspector = get(store.selectedRecipeInspector);
    assert.ok(inspector, 'inspector should be auto-populated');
    assert.equal(get(store.selectedRecipeId), inspector.id);
    assert.equal(inspector.id, 'r1', 'auto-select should default to the first recipe');
  });

  it('selectRecipe(id) updates the inspector payload', async () => {
    const r1 = makeRecipe('r1', 'Healing Potion');
    const r2 = makeRecipe('r2', 'Strength Potion');
    const sys = makeSystem('sys-1', ['r1', 'r2']);
    const services = makeServices({ recipes: [r1, r2], systems: [sys] });
    const store = createCraftingStore(services);
    await store.refresh();

    store.selectRecipe('r2');
    const inspector = get(store.selectedRecipeInspector);
    assert.equal(inspector?.id, 'r2');
    assert.equal(inspector?.name, 'Strength Potion');
  });

  it('selectedRecipeId is isolated per store instance', () => {
    const services = makeServices();
    const a = createCraftingStore(services);
    const b = createCraftingStore(services);
    a.selectedRecipeId.set('r1');
    assert.equal(get(a.selectedRecipeId), 'r1');
    assert.equal(get(b.selectedRecipeId), null, 'instance B must not share selection');
  });

  it('setPageSize clamps invalid input and persists via services.setSetting', async () => {
    const services = makeServices();
    let persisted = null;
    const persistOverride = {
      ...services,
      setSetting: async (key, value) => { if (key === 'actorAppPageSize') persisted = value; }
    };
    const store = createCraftingStore(persistOverride);

    store.setPageSize(25);
    assert.equal(get(store.pageSize), 25);
    assert.equal(persisted, 25);

    store.setPageSize('not-a-number');
    assert.equal(get(store.pageSize), 25, 'invalid input should leave pageSize unchanged');
  });

  it('setCraftingPageIndex / setHistoryPageIndex clamp negative input to 0', () => {
    const services = makeServices();
    const store = createCraftingStore(services);
    store.setCraftingPageIndex(-5);
    assert.equal(get(store.craftingPageIndex), 0);
    store.setHistoryPageIndex(-1);
    assert.equal(get(store.historyPageIndex), 0);
  });

  it('inspectorVisible defaults to true and toggleInspectorVisible flips it', () => {
    const services = makeServices();
    const store = createCraftingStore(services);
    assert.equal(get(store.inspectorVisible), true, 'inspector starts visible');
    store.toggleInspectorVisible();
    assert.equal(get(store.inspectorVisible), false, 'toggle hides the inspector');
    store.toggleInspectorVisible();
    assert.equal(get(store.inspectorVisible), true, 'toggle restores the inspector');
  });

  it('setInspectorVisible coerces to boolean and is per-store-instance isolated', () => {
    const services = makeServices();
    const a = createCraftingStore(services);
    const b = createCraftingStore(services);
    a.setInspectorVisible(0);
    assert.equal(get(a.inspectorVisible), false, 'falsy input must hide inspector');
    a.setInspectorVisible('on');
    assert.equal(get(a.inspectorVisible), true, 'truthy input must show inspector');
    assert.equal(get(b.inspectorVisible), true, 'instance B must not be affected by A');
  });
});
