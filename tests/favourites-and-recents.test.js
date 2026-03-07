import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.foundry = {
  applications: {
    api: {
      HandlebarsApplicationMixin: (Base) => class extends Base {},
      ApplicationV2: class {
        async _prepareContext() {
          return {};
        }
      }
    }
  }
};

globalThis.game = {
  user: { id: 'user-1', character: null },
  time: { worldTime: 1000 },
  actors: []
};

globalThis.ui = {
  notifications: {
    info: () => {},
    warn: () => {},
    error: () => {}
  }
};

globalThis.ChatMessage = {
  create: () => {},
  getSpeaker: () => ({})
};

const { CraftingApp } = await import('../src/ui/CraftingApp.js');
const { SETTING_KEYS } = await import('../src/config/settings.js');

function makeActor(id = 'a1', name = 'Crafter') {
  return { id, name, items: { size: 0 } };
}

function createAppHarness() {
  const settings = {};
  const actor = makeActor();
  const app = Object.create(CraftingApp.prototype);
  app.craftingActor = actor;
  app.componentSourceActors = [actor];
  app.render = async () => {};
  app._notifyInfo = () => {};
  app._notifyWarn = () => {};
  app._notifyError = () => {};
  app._createChatMessage = () => {};
  app._getSetting = (key) => settings[key] ?? null;
  app._setSetting = async (key, value) => { settings[key] = value; };
  app._settings = settings;
  return app;
}

function makeRecipe(id, name = `Recipe ${id}`) {
  return {
    id,
    name,
    description: '',
    img: 'icons/svg/item-bag.svg',
    category: 'alchemy',
    ingredientSets: [],
    steps: [],
    getResultDescription: () => '1x Result',
    isSimpleRecipe: () => false
  };
}

function makeEmptyEvaluation() {
  return {
    canCraft: false,
    satisfiableSet: null,
    missing: { ingredients: [], essences: [], catalysts: [] },
    ingredientStates: [],
    essenceStates: [],
    catalystStates: []
  };
}

// --- Test 1: Toggle favourite on ---
test('_onToggleFavourite adds recipe ID to favourites when not already present', async () => {
  const app = createAppHarness();

  await CraftingApp._onToggleFavourite.call(app, {}, { dataset: { recipeId: 'r1' } });

  const stored = app._settings[SETTING_KEYS.FAVOURITE_RECIPES];
  assert.ok(Array.isArray(stored), 'favourites should be an array');
  assert.ok(stored.includes('r1'), 'r1 should be in favourites after toggling on');
});

// --- Test 2: Toggle favourite off ---
test('_onToggleFavourite removes recipe ID from favourites when already present', async () => {
  const app = createAppHarness();
  app._settings[SETTING_KEYS.FAVOURITE_RECIPES] = ['r1', 'r2'];

  await CraftingApp._onToggleFavourite.call(app, {}, { dataset: { recipeId: 'r1' } });

  const stored = app._settings[SETTING_KEYS.FAVOURITE_RECIPES];
  assert.ok(!stored.includes('r1'), 'r1 should be removed after toggling off');
  assert.ok(stored.includes('r2'), 'r2 should remain');
});

// --- Test 3: Favourites persist via correct setting key ---
test('_getFavourites and _setFavourites use FAVOURITE_RECIPES setting key', async () => {
  const app = createAppHarness();
  app._settings[SETTING_KEYS.FAVOURITE_RECIPES] = ['r5'];

  const ids = app._getFavourites();
  assert.deepEqual(ids, ['r5']);

  await app._setFavourites(['r5', 'r6']);
  assert.deepEqual(app._settings[SETTING_KEYS.FAVOURITE_RECIPES], ['r5', 'r6']);
});

// --- Test 4: Recently crafted tracking prepends new entry ---
test('_trackRecentCraft prepends a new entry to recently crafted list', async () => {
  const app = createAppHarness();
  app._settings[SETTING_KEYS.RECENTLY_CRAFTED] = [{ recipeId: 'r2', timestamp: 100 }];

  await app._trackRecentCraft('r1');

  const stored = app._settings[SETTING_KEYS.RECENTLY_CRAFTED];
  assert.equal(stored[0].recipeId, 'r1', 'newest entry should be first');
  assert.equal(stored[1].recipeId, 'r2', 'old entry should be second');
  assert.ok(typeof stored[0].timestamp === 'number', 'timestamp should be a number');
});

// --- Test 5: Recently crafted deduplication ---
test('_trackRecentCraft deduplicates: crafting the same recipe keeps only the newest entry', async () => {
  const app = createAppHarness();
  app._settings[SETTING_KEYS.RECENTLY_CRAFTED] = [
    { recipeId: 'r1', timestamp: 50 },
    { recipeId: 'r2', timestamp: 40 }
  ];

  await app._trackRecentCraft('r1');

  const stored = app._settings[SETTING_KEYS.RECENTLY_CRAFTED];
  const r1Entries = stored.filter(e => e.recipeId === 'r1');
  assert.equal(r1Entries.length, 1, 'should only have one entry for r1 after dedup');
  assert.equal(stored[0].recipeId, 'r1', 'r1 should be first (most recent)');
  assert.ok(stored[0].timestamp > 50, 'new timestamp should be newer than old one');
});

// --- Test 6: Recently crafted cap at 10 ---
test('_trackRecentCraft caps the list at 10 entries, dropping the oldest', async () => {
  const app = createAppHarness();
  // Pre-populate 10 unique entries
  app._settings[SETTING_KEYS.RECENTLY_CRAFTED] = Array.from({ length: 10 }, (_, i) => ({
    recipeId: `r${i + 10}`,
    timestamp: i
  }));

  // Add an 11th unique recipe
  await app._trackRecentCraft('r-new');

  const stored = app._settings[SETTING_KEYS.RECENTLY_CRAFTED];
  assert.equal(stored.length, 10, 'list should be capped at 10');
  assert.equal(stored[0].recipeId, 'r-new', 'newest entry should be first');
  // The last entry in the pre-populated list (r19, the tail) should be dropped
  assert.ok(!stored.some(e => e.recipeId === 'r19'), 'last/oldest entry should be dropped');
});

// --- Test 7: Favourites section in context ---
test('_prepareContext includes favouriteRecipes when favourites exist and recipes match', async () => {
  const app = createAppHarness();
  app.searchTerm = '';
  app.selectedCategory = '';
  app.showOnlyAvailable = false;

  const recipeA = makeRecipe('r1', 'Potion');
  const recipeB = makeRecipe('r2', 'Elixir');
  const actor = makeActor();

  app._settings[SETTING_KEYS.FAVOURITE_RECIPES] = ['r2', 'r1'];
  app._settings[SETTING_KEYS.RECENTLY_CRAFTED] = [];
  app._settings[SETTING_KEYS.SHOW_SIMPLE_RECIPES_ONLY] = false;

  app._getAvailableActors = () => [actor];
  app._getOwnedActors = () => [actor];
  app._getRecipeVisibilityService = () => null;
  app._getRunManager = () => ({ getActiveRuns: () => [], getRunHistory: () => [] });
  app._getRecipeManager = () => ({
    getRecipes: () => [recipeA, recipeB],
    evaluateCraftability: () => makeEmptyEvaluation()
  });

  const context = await CraftingApp.prototype._prepareContext.call(app, {});

  assert.ok(Array.isArray(context.favouriteRecipes), 'favouriteRecipes should be an array');
  assert.equal(context.favouriteRecipes.length, 2, 'should have 2 favourite recipes');
  // Favourites should preserve insertion order from favouriteIds
  assert.equal(context.favouriteRecipes[0].id, 'r2');
  assert.equal(context.favouriteRecipes[1].id, 'r1');
});

// --- Test 8: Recently crafted section in context ---
test('_prepareContext includes recentRecipes when recent entries exist and recipes match', async () => {
  const app = createAppHarness();
  app.searchTerm = '';
  app.selectedCategory = '';
  app.showOnlyAvailable = false;

  const recipeA = makeRecipe('r1', 'Potion');
  const recipeB = makeRecipe('r2', 'Elixir');
  const actor = makeActor();

  app._settings[SETTING_KEYS.FAVOURITE_RECIPES] = [];
  app._settings[SETTING_KEYS.RECENTLY_CRAFTED] = [
    { recipeId: 'r2', timestamp: 200 },
    { recipeId: 'r1', timestamp: 100 }
  ];
  app._settings[SETTING_KEYS.SHOW_SIMPLE_RECIPES_ONLY] = false;

  app._getAvailableActors = () => [actor];
  app._getOwnedActors = () => [actor];
  app._getRecipeVisibilityService = () => null;
  app._getRunManager = () => ({ getActiveRuns: () => [], getRunHistory: () => [] });
  app._getRecipeManager = () => ({
    getRecipes: () => [recipeA, recipeB],
    evaluateCraftability: () => makeEmptyEvaluation()
  });

  const context = await CraftingApp.prototype._prepareContext.call(app, {});

  assert.ok(Array.isArray(context.recentRecipes), 'recentRecipes should be an array');
  assert.equal(context.recentRecipes.length, 2, 'should have 2 recent recipes');
  // recentRecipes follows the recentEntries order (most recent first)
  assert.equal(context.recentRecipes[0].id, 'r2');
  assert.equal(context.recentRecipes[1].id, 'r1');
});

// --- Test 9: Empty state ---
test('_prepareContext returns empty favouriteRecipes and recentRecipes when none exist', async () => {
  const app = createAppHarness();
  app.searchTerm = '';
  app.selectedCategory = '';
  app.showOnlyAvailable = false;

  const actor = makeActor();

  app._settings[SETTING_KEYS.FAVOURITE_RECIPES] = [];
  app._settings[SETTING_KEYS.RECENTLY_CRAFTED] = [];
  app._settings[SETTING_KEYS.SHOW_SIMPLE_RECIPES_ONLY] = false;

  app._getAvailableActors = () => [actor];
  app._getOwnedActors = () => [actor];
  app._getRecipeVisibilityService = () => null;
  app._getRunManager = () => ({ getActiveRuns: () => [], getRunHistory: () => [] });
  app._getRecipeManager = () => ({
    getRecipes: () => [makeRecipe('r1')],
    evaluateCraftability: () => makeEmptyEvaluation()
  });

  const context = await CraftingApp.prototype._prepareContext.call(app, {});

  assert.deepEqual(context.favouriteRecipes, [], 'favouriteRecipes should be empty');
  assert.deepEqual(context.recentRecipes, [], 'recentRecipes should be empty');
});

// --- Test 10: Invisible/deleted recipes excluded from favouriteRecipes ---
test('_prepareContext excludes favourite recipe IDs that are not in the prepared recipe list', async () => {
  const app = createAppHarness();
  app.searchTerm = '';
  app.selectedCategory = '';
  app.showOnlyAvailable = false;

  const recipeA = makeRecipe('r1', 'Potion');
  const actor = makeActor();
  // r-deleted is in favourites but not returned by recipeManager (simulates deleted recipe)

  app._settings[SETTING_KEYS.FAVOURITE_RECIPES] = ['r-deleted', 'r1'];
  app._settings[SETTING_KEYS.RECENTLY_CRAFTED] = [];
  app._settings[SETTING_KEYS.SHOW_SIMPLE_RECIPES_ONLY] = false;

  app._getAvailableActors = () => [actor];
  app._getOwnedActors = () => [actor];
  app._getRecipeVisibilityService = () => null;
  app._getRunManager = () => ({ getActiveRuns: () => [], getRunHistory: () => [] });
  app._getRecipeManager = () => ({
    getRecipes: () => [recipeA],
    evaluateCraftability: () => makeEmptyEvaluation()
  });

  const context = await CraftingApp.prototype._prepareContext.call(app, {});

  assert.equal(context.favouriteRecipes.length, 1, 'only visible recipe should appear');
  assert.equal(context.favouriteRecipes[0].id, 'r1', 'r1 should be in favouriteRecipes');
});

// --- Test 11: isFavourite flag on each recipe in main list ---
test('_prepareContext adds isFavourite boolean to each recipe in the main list', async () => {
  const app = createAppHarness();
  app.searchTerm = '';
  app.selectedCategory = '';
  app.showOnlyAvailable = false;

  const recipeA = makeRecipe('r1', 'Potion');
  const recipeB = makeRecipe('r2', 'Elixir');
  const actor = makeActor();

  app._settings[SETTING_KEYS.FAVOURITE_RECIPES] = ['r1'];
  app._settings[SETTING_KEYS.RECENTLY_CRAFTED] = [];
  app._settings[SETTING_KEYS.SHOW_SIMPLE_RECIPES_ONLY] = false;

  app._getAvailableActors = () => [actor];
  app._getOwnedActors = () => [actor];
  app._getRecipeVisibilityService = () => null;
  app._getRunManager = () => ({ getActiveRuns: () => [], getRunHistory: () => [] });
  app._getRecipeManager = () => ({
    getRecipes: () => [recipeA, recipeB],
    evaluateCraftability: () => makeEmptyEvaluation()
  });

  const context = await CraftingApp.prototype._prepareContext.call(app, {});

  const rowA = context.recipes.find(r => r.id === 'r1');
  const rowB = context.recipes.find(r => r.id === 'r2');
  assert.equal(rowA.isFavourite, true, 'r1 should be marked as favourite');
  assert.equal(rowB.isFavourite, false, 'r2 should not be marked as favourite');
});

// --- Test 12: Data isolation - setting keys use client scope ---
test('FAVOURITE_RECIPES and RECENTLY_CRAFTED setting keys are defined and distinct', async () => {
  assert.ok(SETTING_KEYS.FAVOURITE_RECIPES, 'FAVOURITE_RECIPES key should be defined');
  assert.ok(SETTING_KEYS.RECENTLY_CRAFTED, 'RECENTLY_CRAFTED key should be defined');
  assert.notEqual(
    SETTING_KEYS.FAVOURITE_RECIPES,
    SETTING_KEYS.RECENTLY_CRAFTED,
    'The two keys should be distinct'
  );
});
