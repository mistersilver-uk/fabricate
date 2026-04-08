import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { SETTING_KEYS } from '../src/config/settings.js';
import { createCraftingStore } from '../src/ui/svelte/stores/craftingStore.js';

function makeActor(id = 'a1', name = 'Crafter') {
  return {
    id,
    uuid: `Actor.${id}`,
    name,
    isOwner: true,
    items: []
  };
}

function makeRecipe(id, name = `Recipe ${id}`) {
  return {
    id,
    name,
    description: '',
    img: 'icons/svg/item-bag.svg',
    category: 'alchemy',
    ingredientSets: [],
    results: [],
    steps: [],
    getResultDescription: () => '1x Result',
    isSimpleRecipe: () => false
  };
}

function makeServices(overrides = {}) {
  const actor = makeActor();
  const recipes = [makeRecipe('r1', 'Potion'), makeRecipe('r2', 'Elixir')];
  const settings = {
    favouriteRecipes: [],
    recentlyCrafted: [],
    autoCraft: true,
    showSimpleRecipesOnly: false,
    lastCraftingActor: actor.id,
    lastComponentSources: [actor.id]
  };

  const services = {
    getSetting: (key) => settings[key] ?? null,
    setSetting: async (key, value) => { settings[key] = value; },
    getRecipeManager: () => ({
      getRecipes: () => recipes,
      getRecipe: (id) => recipes.find(recipe => recipe.id === id) || null,
      evaluateCraftability: () => ({
        canCraft: true,
        satisfiableSet: {},
        missing: { ingredients: [], essences: [], catalysts: [] },
        ingredientStates: [],
        essenceStates: [],
        catalystStates: []
      })
    }),
    getRecipeVisibilityService: () => null,
    getCraftingRunManager: () => ({
      getActiveRuns: () => [],
      getRunHistory: () => [],
      getActiveRun: () => null,
      cancelRun: async () => true
    }),
    getSalvageRunManager: () => ({
      getActiveRuns: () => [],
      getRunHistory: () => [],
      getActiveRun: () => null,
      cancelRun: async () => true
    }),
    getCraftingEngine: () => ({
      craft: async () => ({ success: true, message: 'Crafted!' })
    }),
    getCraftingSystemManager: () => ({ getSystems: () => [], getSystem: () => null }),
    getAvailableActors: () => [actor],
    getOwnedActors: () => [actor],
    getGameUser: () => ({ id: 'user-1', character: actor }),
    getWorldTime: () => 1000,
    notify: { info: () => {}, warn: () => {}, error: () => {} },
    confirmDialog: async () => true,
    createChatMessage: async () => ({}),
    getChatSpeaker: () => ({})
  };

  return { ...services, ...overrides, _settings: settings, _actor: actor, _recipes: recipes };
}

test('crafting store toggles favourites through the active Svelte store path', async () => {
  const services = makeServices();
  const store = createCraftingStore(services);

  await store.toggleFavourite('r1');
  assert.deepEqual(services._settings.favouriteRecipes, ['r1']);

  await store.toggleFavourite('r1');
  assert.deepEqual(services._settings.favouriteRecipes, []);
});

test('crafting store exposes favourite and recent recipe sections from active view state', async () => {
  const services = makeServices();
  services._settings.favouriteRecipes = ['r2', 'r1'];
  services._settings.recentlyCrafted = [
    { recipeId: 'r2', timestamp: 200 },
    { recipeId: 'r1', timestamp: 100 }
  ];
  const store = createCraftingStore(services);

  await store.refresh();

  const viewState = get(store.viewState);
  assert.deepEqual(viewState.favouriteRecipes.map(recipe => recipe.id), ['r2', 'r1']);
  assert.deepEqual(viewState.recentRecipes.map(recipe => recipe.id), ['r2', 'r1']);
  assert.equal(viewState.recipes.find(recipe => recipe.id === 'r1').isFavourite, true);
});

test('crafting store tracks recently crafted recipes with newest-first dedupe and cap', async () => {
  const services = makeServices();
  services._settings.recentlyCrafted = Array.from({ length: 10 }, (_, index) => ({
    recipeId: `old-${index}`,
    timestamp: index
  }));
  const store = createCraftingStore(services);

  await store.craft('r1', { skipConfirm: true });
  await store.craft('r1', { skipConfirm: true });

  const recents = services._settings.recentlyCrafted;
  assert.equal(recents.length, 10);
  assert.equal(recents[0].recipeId, 'r1');
  assert.equal(recents.filter(entry => entry.recipeId === 'r1').length, 1);
});

test('client setting keys for favourites and recents remain distinct', () => {
  assert.ok(SETTING_KEYS.FAVOURITE_RECIPES);
  assert.ok(SETTING_KEYS.RECENTLY_CRAFTED);
  assert.notEqual(SETTING_KEYS.FAVOURITE_RECIPES, SETTING_KEYS.RECENTLY_CRAFTED);
});
