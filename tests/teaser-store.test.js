/**
 * Store-level teaser tests for craftingStore._buildPreparedRecipes
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

global.foundry = { utils: { randomID: () => `id-${Math.random().toString(36).slice(2)}` } };
global.game = { user: { name: 'Test', isGM: false, id: 'player-1' } };
global.Hooks = { on: () => {} };

const { Recipe } = await import('../src/models/Recipe.js');

// We test the _buildPreparedRecipes logic by providing a crafting store
// that has teaser-mode set and checking prepared recipe fields

// A minimal services object that returns teaser-mode access for certain recipes
function makeServices({ recipe, teaserState = null }) {
  const isTeaser = teaserState !== null;
  const access = isTeaser
    ? { visible: true, craftable: false, reason: 'teaser', teaserState }
    : { visible: true, craftable: true, reason: 'ok' };

  return {
    getRecipeManager: () => ({
      getRecipes: () => [recipe],
      evaluateCraftability: () => ({
        canCraft: teaserState === null, // non-teaser recipes are craftable in these tests
        satisfiableSet: null,
        missing: { ingredients: [], essences: [], catalysts: [] },
        ingredientStates: [{ description: 'Potion', have: 0, need: 1, satisfied: false }],
        essenceStates: [],
        catalystStates: []
      }),
      getRecipe: () => recipe
    }),
    getRecipeVisibilityService: () => ({
      evaluateRecipeAccess: () => access
    }),
    getCraftingRunManager: () => null,
    getWorldTime: () => 0,
    getGameUser: () => ({ id: 'player-1', isGM: false }),
    getAvailableActors: () => [{ id: 'actor-1', name: 'Test Actor', isOwner: true }],
    getOwnedActors: () => [{ id: 'actor-1', name: 'Test Actor', isOwner: true, items: { size: 0 } }],
    getSetting: (key) => {
      if (key === 'lastCraftingActor') return 'actor-1';
      if (key === 'lastComponentSources') return ['actor-1'];
      if (key === 'favouriteRecipes') return [];
      if (key === 'recentlyCrafted') return [];
      return null;
    },
    setSetting: async () => {},
    localize: (key) => key
  };
}

function makeRecipe(overrides = {}) {
  return new Recipe({
    id: 'recipe-1',
    name: 'Test Recipe',
    description: 'Real description',
    craftingSystemId: 'sys-1',
    teaser: { enabled: true, hiddenFields: ['ingredients', 'results', 'description'], revealThreshold: 100, teaserDescription: 'Mysterious recipe...' },
    resultGroups: [{ id: 'g', results: [{ id: 'r', itemUuid: 'uuid' }] }],
    ingredientSets: [{ id: 'is', ingredientGroups: [{ id: 'ig', options: [{ itemUuid: 'uuid', quantity: 1 }] }] }],
    ...overrides
  });
}

// Import the build function directly from craftingStore module
const craftingStoreModule = await import('../src/ui/svelte/stores/craftingStore.js');

function buildPreparedRecipesViaStore(services) {
  // We create the store and call refresh to get viewState data
  // But since _buildPreparedRecipes is not exported, we call createCraftingStore
  // and then get the computed viewState
  const store = craftingStoreModule.createCraftingStore(services);
  // Manually invoke refresh by calling a no-op that triggers the pipeline
  // For testing purposes we instead test through the public refresh + viewState
  return store;
}

describe('Teaser store - prepared recipe has isTeaser fields', () => {
  it('prepared recipe has isTeaser:true when in teaser mode with partial progress', async () => {
    const recipe = makeRecipe();
    const teaserState = {
      isTeaser: true,
      progress: 45,
      hiddenFields: ['ingredients', 'results', 'description'],
      teaserDescription: 'Mysterious recipe...'
    };
    const services = makeServices({ recipe, teaserState });
    const store = buildPreparedRecipesViaStore(services);
    await store.refresh();

    const { get } = await import('svelte/store');
    const viewState = get(store.viewState);
    assert.equal(viewState.recipes.length, 1);
    const prepared = viewState.recipes[0];
    assert.equal(prepared.isTeaser, true);
    assert.equal(prepared.teaserProgress, 45);
    assert.deepEqual(prepared.teaserHiddenFields, ['ingredients', 'results', 'description']);
  });

  it('masked fields (ingredients, results, description) replaced in teaser state', async () => {
    const recipe = makeRecipe();
    const teaserState = {
      isTeaser: true,
      progress: 30,
      hiddenFields: ['ingredients', 'results', 'description'],
      teaserDescription: 'Mysterious recipe...'
    };
    const services = makeServices({ recipe, teaserState });
    const store = buildPreparedRecipesViaStore(services);
    await store.refresh();

    const { get } = await import('svelte/store');
    const viewState = get(store.viewState);
    const prepared = viewState.recipes[0];
    assert.deepEqual(prepared.ingredients, []);
    assert.deepEqual(prepared.essences, []);
    assert.deepEqual(prepared.catalysts, []);
    assert.ok(prepared.description !== 'Real description');
    assert.ok(prepared.resultDescription !== recipe.getResultDescription() || prepared.resultDescription === 'FABRICATE.Teaser.HiddenResults');
  });

  it('fully discovered recipe shows all fields normally', async () => {
    const recipe = makeRecipe({ teaser: { enabled: false, hiddenFields: [], revealThreshold: 100, teaserDescription: '' } });
    const services = makeServices({ recipe, teaserState: null });
    const store = buildPreparedRecipesViaStore(services);
    await store.refresh();

    const { get } = await import('svelte/store');
    const viewState = get(store.viewState);
    const prepared = viewState.recipes[0];
    assert.equal(prepared.isTeaser, false);
    assert.equal(prepared.description, 'Real description');
  });

  it('non-teaser recipes render normally even when teaser mode is enabled', async () => {
    const recipe = makeRecipe({ teaser: { enabled: false, hiddenFields: [], revealThreshold: 100, teaserDescription: '' } });
    const services = makeServices({ recipe, teaserState: null });
    const store = buildPreparedRecipesViaStore(services);
    await store.refresh();

    const { get } = await import('svelte/store');
    const viewState = get(store.viewState);
    const prepared = viewState.recipes[0];
    assert.equal(prepared.isTeaser, false);
    assert.equal(prepared.canCraft, true);
  });
});
