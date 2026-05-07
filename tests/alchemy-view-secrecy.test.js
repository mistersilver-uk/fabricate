/**
 * Tests for the actor-crafting-app-v2 Alchemy view inspector secrecy.
 *
 * The selectedDiscoveredRecipe inspector payload MUST be derived from the
 * filtered `discoveredRecipes` writable. Non-GM viewers must never see
 * inspector data for a hidden / unlearned recipe, even when an attacker
 * forces a hidden recipe id into `selectedDiscoveredRecipeId`.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

const { createCraftingStore } = await import('../src/ui/svelte/stores/craftingStore.js');

function makeRecipe(id, name, opts = {}) {
  return {
    id,
    name,
    img: opts.img ?? null,
    description: opts.description ?? '',
    craftingSystemId: opts.systemId ?? 'alch-1',
    ingredientSets: opts.ingredientSets ?? [],
    results: opts.results ?? [],
    steps: opts.steps ?? [],
    isSimpleRecipe: () => true,
    getResultDescription: () => opts.resultDescription ?? `${name} (1)`
  };
}

function makeAlchemySystem(id, recipeIds) {
  return {
    id,
    name: `Alchemy System ${id}`,
    enabled: true,
    resolutionMode: 'alchemy',
    components: [],
    recipeIds,
    features: { essences: false }
  };
}

function makeServices({ isGM = false, learnedRecipes = {}, recipes = [] } = {}) {
  const actorA = {
    id: 'a1',
    name: 'Alice',
    isOwner: true,
    items: [],
    flags: { fabricate: { learnedRecipes } }
  };

  const recipeManager = {
    getRecipes: () => recipes,
    getRecipe: (id) => recipes.find(r => r.id === id) ?? null,
    evaluateCraftability: () => ({
      canCraft: true,
      satisfiableSet: {},
      missing: { ingredients: [], essences: [], catalysts: [] },
      ingredientStates: [
        { description: 'Silverleaf x2', need: 2, have: 2, satisfied: true }
      ],
      essenceStates: [
        { type: 'Life', need: 1, have: 1, satisfied: true }
      ],
      catalystStates: []
    })
  };

  const alchemySystems = recipes.length
    ? [makeAlchemySystem('alch-1', recipes.map(r => r.id))]
    : [];

  const csm = {
    getSystems: () => alchemySystems,
    getRecipesForSystem: () => recipes,
    getAlchemySystems: () => alchemySystems
  };

  const settingStore = {
    lastAlchemySystem: alchemySystems[0]?.id ?? '',
    isAlchemyMode: alchemySystems.length > 0
  };

  return {
    getRecipeManager: () => recipeManager,
    getRecipeVisibilityService: () => ({
      evaluateRecipeAccess: () => ({ visible: true, craftable: true, reason: 'ok' }),
      learnRecipe: async () => ({ success: true, message: '' })
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
    getGameUser: () => ({ id: 'u1', character: actorA, isGM }),
    getWorldTime: () => 1000,
    notify: { info: () => {}, warn: () => {}, error: () => {} },
    confirmDialog: async () => true,
    createChatMessage: async () => ({}),
    getChatSpeaker: () => ({})
  };
}

describe('AlchemyView secrecy: selectedDiscoveredRecipe inspector', () => {
  it('non-GM viewer cannot see inspector data for an unlearned recipe even when forced', async () => {
    const hidden = makeRecipe('rh', 'Hidden Bomb');
    const services = makeServices({
      isGM: false,
      learnedRecipes: {},
      recipes: [hidden]
    });
    const store = createCraftingStore(services);
    await store.refresh();

    // Pre-condition: discoveredRecipes is empty for non-GM with no learned
    // recipes, even though the system has the recipe.
    const discovered = get(store.discoveredRecipes);
    assert.equal(discovered.length, 0, 'non-GM with no learned recipes sees nothing in discoveredRecipes');

    // Force a hidden recipe id into the selection writable directly.
    store.selectedDiscoveredRecipeId.set('rh');
    store.selectDiscoveredRecipe('rh'); // triggers recompute

    const inspector = get(store.selectedDiscoveredRecipe);
    assert.equal(inspector, null, 'inspector payload must remain null for hidden recipes');
  });

  it('non-GM viewer with the recipe learned can select it and see inspector data', async () => {
    const learned = makeRecipe('rl', 'Healing Draught');
    const services = makeServices({
      isGM: false,
      learnedRecipes: { rl: true },
      recipes: [learned]
    });
    const store = createCraftingStore(services);
    await store.refresh();

    const discovered = get(store.discoveredRecipes);
    assert.equal(discovered.length, 1, 'non-GM sees their learned recipe');

    store.selectDiscoveredRecipe('rl');
    const inspector = get(store.selectedDiscoveredRecipe);

    assert.ok(inspector, 'inspector payload should be populated');
    assert.equal(inspector.id, 'rl');
    assert.equal(inspector.name, 'Healing Draught');
    assert.equal(inspector.resultDescription, 'Healing Draught (1)');
    assert.equal(inspector.ingredientStates.length, 1);
    assert.equal(inspector.essenceStates.length, 1);
  });

  it('GM viewer sees inspector data for any recipe in the system', async () => {
    const r1 = makeRecipe('r1', 'Visible Tonic');
    const r2 = makeRecipe('r2', 'Another Tonic');
    const services = makeServices({
      isGM: true,
      learnedRecipes: {},
      recipes: [r1, r2]
    });
    const store = createCraftingStore(services);
    await store.refresh();

    const discovered = get(store.discoveredRecipes);
    assert.equal(discovered.length, 2, 'GM sees all recipes in the system');

    store.selectDiscoveredRecipe('r2');
    const inspector = get(store.selectedDiscoveredRecipe);
    assert.ok(inspector);
    assert.equal(inspector.id, 'r2');
    assert.equal(inspector.name, 'Another Tonic');
  });

  it('switching alchemy systems clears the selected discovered recipe', async () => {
    const r1 = makeRecipe('r1', 'Tonic');
    const services = makeServices({
      isGM: true,
      learnedRecipes: {},
      recipes: [r1]
    });
    const store = createCraftingStore(services);
    await store.refresh();
    store.selectDiscoveredRecipe('r1');
    assert.ok(get(store.selectedDiscoveredRecipe), 'selection should be set before switching systems');

    await store.selectAlchemySystem('non-existent');
    assert.equal(
      get(store.selectedDiscoveredRecipeId),
      null,
      'selection id must be cleared when switching systems'
    );
    assert.equal(
      get(store.selectedDiscoveredRecipe),
      null,
      'inspector payload must be cleared when switching systems'
    );
  });

  it('selectedDiscoveredRecipeId is isolated per store instance', () => {
    const recipes = [makeRecipe('r1', 'Tonic')];
    const servicesA = makeServices({ isGM: true, recipes });
    const servicesB = makeServices({ isGM: true, recipes });
    const a = createCraftingStore(servicesA);
    const b = createCraftingStore(servicesB);

    a.selectedDiscoveredRecipeId.set('r1');
    assert.equal(get(a.selectedDiscoveredRecipeId), 'r1');
    assert.equal(get(b.selectedDiscoveredRecipeId), null, 'instance B must not share selection');
  });
});
