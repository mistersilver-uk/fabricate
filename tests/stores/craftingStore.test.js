/**
 * Tests for craftingStore factory (T-110)
 * Uses node:test + node:assert/strict
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

// ---------------------------------------------------------------------------
// Mock service helpers
// ---------------------------------------------------------------------------

function makeActor(id, name = `Actor-${id}`, owned = true) {
  return {
    id,
    name,
    isOwner: owned,
    items: { size: 3 }
  };
}

function makeRecipe(id, name = `Recipe-${id}`, category = 'potions') {
  return {
    id,
    name,
    description: `Description of ${name}`,
    img: 'img.png',
    category,
    ingredientSets: [],
    results: [],
    steps: [],
    isSimpleRecipe: () => true,
    getResultDescription: () => 'some result'
  };
}

function makeRun(id, recipeId, status = 'inProgress') {
  return {
    id,
    recipeId,
    status,
    steps: [{ stepName: 'Step A', timeGate: null }],
    currentStepIndex: 0,
    startedAt: 1000,
    finishedAt: null
  };
}

function emptyEvaluation() {
  return {
    canCraft: false,
    satisfiableSet: null,
    missing: { ingredients: [], essences: [], catalysts: [] },
    ingredientStates: [],
    essenceStates: [],
    catalystStates: []
  };
}

/**
 * Creates a fully-stubbed services object.
 * Override individual properties via the `overrides` map.
 */
function createMockServices(overrides = {}) {
  const store = {
    [/* LAST_CRAFTING_ACTOR */ 'lastCraftingActor']: '',
    [/* LAST_COMPONENT_SOURCES */ 'lastComponentSources']: [],
    [/* FAVOURITE_RECIPES */ 'favouriteRecipes']: [],
    [/* RECENTLY_CRAFTED */ 'recentlyCrafted']: [],
    [/* AUTO_CRAFT */ 'autoCraft']: false,
    [/* SHOW_SIMPLE_RECIPES_ONLY */ 'showSimpleRecipesOnly']: false
  };

  const actorA = makeActor('a1', 'Alice');
  const actorB = makeActor('a2', 'Bob');

  const recipe1 = makeRecipe('r1', 'Healing Potion');
  const recipe2 = makeRecipe('r2', 'Strength Potion');

  const defaultRecipeManager = {
    getRecipes: () => [recipe1, recipe2],
    getRecipe: (id) => [recipe1, recipe2].find(r => r.id === id) || null,
    evaluateCraftability: () => ({
      canCraft: true,
      satisfiableSet: {},
      missing: { ingredients: [], essences: [], catalysts: [] },
      ingredientStates: [],
      essenceStates: [],
      catalystStates: []
    })
  };

  const defaultRunManager = {
    getActiveRuns: () => [],
    getRunHistory: () => [],
    getActiveRun: () => null,
    getRun: () => null,
    cancelRun: async () => true
  };

  const defaultVisibilityService = {
    evaluateRecipeAccess: () => ({ visible: true, craftable: true, reason: 'ok' }),
    learnRecipe: async () => ({ success: true, message: 'Learned!' })
  };

  const defaultEngine = {
    craft: async () => ({ success: true, message: 'Crafted!' })
  };

  const base = {
    getRecipeManager: () => defaultRecipeManager,
    getRecipeVisibilityService: () => defaultVisibilityService,
    getCraftingRunManager: () => defaultRunManager,
    getCraftingEngine: () => defaultEngine,
    getSetting: (key) => store[key] ?? null,
    setSetting: async (key, value) => { store[key] = value; },
    getAvailableActors: () => [actorA, actorB],
    getOwnedActors: () => [actorA, actorB],
    getGameUser: () => ({ id: 'u1', character: actorA }),
    getWorldTime: () => 1000,
    notify: {
      info: () => {},
      warn: () => {},
      error: () => {}
    },
    confirmDialog: async () => true,
    createChatMessage: async () => ({}),
    getChatSpeaker: () => ({})
  };

  return { ...base, ...overrides, _store: store, _actors: { actorA, actorB }, _recipes: { recipe1, recipe2 } };
}

// ---------------------------------------------------------------------------
// Import the store factory
// ---------------------------------------------------------------------------
const { createCraftingStore } = await import('../../src/ui/svelte/stores/craftingStore.js');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createCraftingStore', () => {

  // --- Factory shape ---

  describe('factory output shape', () => {
    it('returns all expected properties', () => {
      const services = createMockServices();
      const store = createCraftingStore(services);

      const expectedKeys = [
        'craftingActor', 'componentSourceActors', 'searchTerm',
        'selectedCategory', 'showOnlyAvailable', 'viewState',
        'selectActor', 'toggleSourceActor', 'setSearch', 'setCategory',
        'toggleAvailable', 'toggleFavourite', 'craft', 'learnRecipe',
        'cancelRun', 'restartRun', 'refresh', 'destroy'
      ];

      for (const key of expectedKeys) {
        assert.ok(key in store, `Expected store to have property: ${key}`);
      }
    });

    it('creates isolated instances — writable stores are not shared', () => {
      const services = createMockServices();
      const storeA = createCraftingStore(services);
      const storeB = createCraftingStore(services);

      storeA.searchTerm.set('hello');

      assert.equal(get(storeA.searchTerm), 'hello');
      assert.equal(get(storeB.searchTerm), '');
    });
  });

  // --- Default state ---

  describe('default actor resolution', () => {
    it('defaults craftingActor to the user character when no saved setting', () => {
      const services = createMockServices();
      const store = createCraftingStore(services);
      const actor = get(store.craftingActor);
      assert.equal(actor?.id, 'a1', 'should default to user character (a1)');
    });

    it('defaults craftingActor to saved setting actor when available', () => {
      const services = createMockServices({
        getSetting: (key) => {
          if (key === 'lastCraftingActor') return 'a2';
          return null;
        },
        getGameUser: () => ({ id: 'u1', character: null })
      });
      const store = createCraftingStore(services);
      const actor = get(store.craftingActor);
      assert.equal(actor?.id, 'a2');
    });

    it('falls back to first available actor when no character and no saved setting', () => {
      const services = createMockServices({
        getSetting: () => null,
        getGameUser: () => ({ id: 'u1', character: null })
      });
      const store = createCraftingStore(services);
      const actor = get(store.craftingActor);
      assert.equal(actor?.id, 'a1');
    });

    it('defaults componentSourceActors to craftingActor when it is owned', () => {
      const services = createMockServices();
      const store = createCraftingStore(services);
      const sources = get(store.componentSourceActors);
      assert.equal(sources.length, 1);
      assert.equal(sources[0].id, 'a1');
    });
  });

  // --- selectActor ---

  describe('selectActor', () => {
    it('updates craftingActor writable store', async () => {
      const services = createMockServices();
      const store = createCraftingStore(services);
      await store.selectActor('a2');
      assert.equal(get(store.craftingActor)?.id, 'a2');
    });

    it('persists selection via setSetting', async () => {
      let savedId = null;
      const services = createMockServices({
        setSetting: async (key, value) => {
          if (key === 'lastCraftingActor') savedId = value;
        }
      });
      const store = createCraftingStore(services);
      await store.selectActor('a2');
      assert.equal(savedId, 'a2');
    });

    it('calls refresh after selection', async () => {
      const services = createMockServices();
      const store = createCraftingStore(services);
      await store.selectActor('a2');
      // viewState should be updated — check hasCraftingActor reflects new actor
      const vs = get(store.viewState);
      assert.ok(vs.hasCraftingActor);
    });
  });

  // --- toggleSourceActor ---

  describe('toggleSourceActor', () => {
    it('adds actor to componentSourceActors when checked=true', async () => {
      const services = createMockServices({
        getSetting: () => null,
        getGameUser: () => ({ id: 'u1', character: null })
      });
      const store = createCraftingStore(services);
      // start with no sources
      const initialSources = get(store.componentSourceActors);
      const initialCount = initialSources.length;

      await store.toggleSourceActor('a2', true);
      const sources = get(store.componentSourceActors);
      assert.ok(sources.some(a => a.id === 'a2'));
    });

    it('removes actor from componentSourceActors when checked=false', async () => {
      const services = createMockServices();
      const store = createCraftingStore(services);
      // a1 is included by default
      await store.toggleSourceActor('a1', false);
      const sources = get(store.componentSourceActors);
      assert.ok(!sources.some(a => a.id === 'a1'));
    });

    it('does not duplicate actor when toggled on twice', async () => {
      const services = createMockServices({
        getSetting: () => null,
        getGameUser: () => ({ id: 'u1', character: null })
      });
      const store = createCraftingStore(services);
      await store.toggleSourceActor('a1', true);
      await store.toggleSourceActor('a1', true);
      const sources = get(store.componentSourceActors);
      assert.equal(sources.filter(a => a.id === 'a1').length, 1);
    });

    it('persists updated actor list via setSetting', async () => {
      let persisted = null;
      const services = createMockServices({
        setSetting: async (key, value) => {
          if (key === 'lastComponentSources') persisted = value;
        }
      });
      const store = createCraftingStore(services);
      await store.toggleSourceActor('a2', true);
      assert.ok(Array.isArray(persisted));
    });
  });

  // --- Filter state ---

  describe('setSearch', () => {
    it('updates searchTerm writable store and refreshes viewState', async () => {
      const services = createMockServices();
      const store = createCraftingStore(services);
      await store.setSearch('healing');
      assert.equal(get(store.searchTerm), 'healing');
    });
  });

  describe('setCategory', () => {
    it('updates selectedCategory writable store', async () => {
      const services = createMockServices();
      const store = createCraftingStore(services);
      await store.setCategory('potions');
      assert.equal(get(store.selectedCategory), 'potions');
    });
  });

  describe('toggleAvailable', () => {
    it('flips showOnlyAvailable from true to false', async () => {
      const services = createMockServices();
      const store = createCraftingStore(services);
      // Default is true
      const initial = get(store.showOnlyAvailable);
      await store.toggleAvailable();
      assert.equal(get(store.showOnlyAvailable), !initial);
    });

    it('flips showOnlyAvailable from false to true', async () => {
      const services = createMockServices();
      const store = createCraftingStore(services);
      store.showOnlyAvailable.set(false);
      await store.toggleAvailable();
      assert.equal(get(store.showOnlyAvailable), true);
    });
  });

  // --- Recipe computation ---

  describe('viewState recipes', () => {
    it('populates viewState.recipes from recipeManager', async () => {
      const services = createMockServices();
      const store = createCraftingStore(services);
      await store.refresh();
      const vs = get(store.viewState);
      assert.ok(Array.isArray(vs.recipes));
      assert.ok(vs.recipes.length >= 1);
    });

    it('filters recipes by searchTerm', async () => {
      const services = createMockServices();
      const store = createCraftingStore(services);
      store.searchTerm.set('Strength');
      await store.refresh();
      const vs = get(store.viewState);
      assert.ok(vs.recipes.every(r => r.name.toLowerCase().includes('strength') || r.description.toLowerCase().includes('strength')));
    });

    it('filters recipes by selectedCategory', async () => {
      const recipe1 = makeRecipe('r1', 'Healing Potion', 'potions');
      const recipe2 = makeRecipe('r2', 'Fire Sword', 'weapons');
      const services = createMockServices({
        getRecipeManager: () => ({
          getRecipes: () => [recipe1, recipe2],
          getRecipe: (id) => [recipe1, recipe2].find(r => r.id === id) || null,
          evaluateCraftability: () => ({ canCraft: true, satisfiableSet: {}, missing: { ingredients: [], essences: [], catalysts: [] }, ingredientStates: [], essenceStates: [], catalystStates: [] })
        })
      });
      const store = createCraftingStore(services);
      store.selectedCategory.set('weapons');
      await store.refresh();
      const vs = get(store.viewState);
      assert.ok(vs.recipes.every(r => r.category === 'weapons'));
    });

    it('each recipe entry has required display fields', async () => {
      const services = createMockServices();
      const store = createCraftingStore(services);
      await store.refresh();
      const vs = get(store.viewState);
      for (const recipe of vs.recipes) {
        assert.ok('id' in recipe);
        assert.ok('name' in recipe);
        assert.ok('canCraft' in recipe);
        assert.ok('isFavourite' in recipe);
        assert.ok('statusLabel' in recipe);
      }
    });
  });

  // --- Favourites ---

  describe('toggleFavourite', () => {
    it('adds recipe to favourites when not already favourited', async () => {
      let saved = [];
      const services = createMockServices({
        getSetting: (key) => {
          if (key === 'favouriteRecipes') return [];
          return null;
        },
        setSetting: async (key, value) => {
          if (key === 'favouriteRecipes') saved = value;
        }
      });
      const store = createCraftingStore(services);
      await store.toggleFavourite('r1');
      assert.ok(saved.includes('r1'));
    });

    it('removes recipe from favourites when already favourited', async () => {
      let saved = ['r1'];
      const services = createMockServices({
        getSetting: (key) => {
          if (key === 'favouriteRecipes') return ['r1'];
          return null;
        },
        setSetting: async (key, value) => {
          if (key === 'favouriteRecipes') saved = value;
        }
      });
      const store = createCraftingStore(services);
      await store.toggleFavourite('r1');
      assert.ok(!saved.includes('r1'));
    });

    it('viewState.favouriteRecipes intersects with visible recipes', async () => {
      const services = createMockServices({
        getSetting: (key) => {
          if (key === 'favouriteRecipes') return ['r1'];
          return null;
        }
      });
      const store = createCraftingStore(services);
      await store.refresh();
      const vs = get(store.viewState);
      assert.ok(Array.isArray(vs.favouriteRecipes));
      assert.ok(vs.favouriteRecipes.some(r => r.id === 'r1'));
    });
  });

  // --- Recent craft tracking ---

  describe('_trackRecentCraft (via craft action)', () => {
    it('adds crafted recipe to recentlyCrafted setting', async () => {
      let recents = [];
      const services = createMockServices({
        getSetting: (key) => {
          if (key === 'recentlyCrafted') return recents;
          if (key === 'autoCraft') return true; // skip confirm
          return null;
        },
        setSetting: async (key, value) => {
          if (key === 'recentlyCrafted') recents = value;
        }
      });
      const store = createCraftingStore(services);
      await store.craft('r1', { skipConfirm: true });
      assert.ok(recents.some(e => e.recipeId === 'r1'));
    });

    it('caps recentlyCrafted at RECENTLY_CRAFTED_MAX (10)', async () => {
      const existing = Array.from({ length: 11 }, (_, i) => ({ recipeId: `rx${i}`, timestamp: i }));
      let recents = [...existing];
      const services = createMockServices({
        getSetting: (key) => {
          if (key === 'recentlyCrafted') return recents;
          if (key === 'autoCraft') return true;
          return null;
        },
        setSetting: async (key, value) => {
          if (key === 'recentlyCrafted') recents = value;
        }
      });
      const store = createCraftingStore(services);
      await store.craft('r1', { skipConfirm: true });
      assert.ok(recents.length <= 10);
    });

    it('deduplicates recipeId in recentlyCrafted (keeps newest)', async () => {
      let recents = [{ recipeId: 'r1', timestamp: 1 }];
      const services = createMockServices({
        getSetting: (key) => {
          if (key === 'recentlyCrafted') return recents;
          if (key === 'autoCraft') return true;
          return null;
        },
        setSetting: async (key, value) => {
          if (key === 'recentlyCrafted') recents = value;
        }
      });
      const store = createCraftingStore(services);
      await store.craft('r1', { skipConfirm: true });
      const r1Entries = recents.filter(e => e.recipeId === 'r1');
      assert.equal(r1Entries.length, 1);
    });
  });

  // --- craft action ---

  describe('craft', () => {
    it('calls confirmDialog when autoCraft is false and skipConfirm is not set', async () => {
      let confirmCalled = false;
      const services = createMockServices({
        getSetting: (key) => {
          if (key === 'autoCraft') return false;
          return null;
        },
        confirmDialog: async () => {
          confirmCalled = true;
          return true;
        }
      });
      const store = createCraftingStore(services);
      await store.craft('r1');
      assert.ok(confirmCalled);
    });

    it('skips confirmDialog when skipConfirm is true', async () => {
      let confirmCalled = false;
      const services = createMockServices({
        getSetting: (key) => {
          if (key === 'autoCraft') return false;
          return null;
        },
        confirmDialog: async () => {
          confirmCalled = true;
          return true;
        }
      });
      const store = createCraftingStore(services);
      await store.craft('r1', { skipConfirm: true });
      assert.ok(!confirmCalled);
    });

    it('skips confirmDialog when autoCraft setting is true', async () => {
      let confirmCalled = false;
      const services = createMockServices({
        getSetting: (key) => {
          if (key === 'autoCraft') return true;
          return null;
        },
        confirmDialog: async () => {
          confirmCalled = true;
          return true;
        }
      });
      const store = createCraftingStore(services);
      await store.craft('r1');
      assert.ok(!confirmCalled);
    });

    it('delegates to craftingEngine.craft with correct arguments', async () => {
      let craftArgs = null;
      const services = createMockServices({
        getSetting: (key) => key === 'autoCraft' ? true : null,
        getCraftingEngine: () => ({
          craft: async (...args) => {
            craftArgs = args;
            return { success: true, message: 'ok' };
          }
        })
      });
      const store = createCraftingStore(services);
      await store.craft('r1', { skipConfirm: true });
      assert.ok(craftArgs !== null);
      assert.equal(craftArgs[2].id, 'r1');
    });

    it('notifies error when no craftingActor selected', async () => {
      let errorMsg = null;
      const services = createMockServices({
        getSetting: () => null,
        getGameUser: () => ({ id: 'u1', character: null }),
        getAvailableActors: () => [],
        notify: { info: () => {}, warn: () => {}, error: (m) => { errorMsg = m; } }
      });
      const store = createCraftingStore(services);
      await store.craft('r1', { skipConfirm: true });
      assert.ok(errorMsg !== null);
    });

    it('notifies error when confirm dialog is declined', async () => {
      let notified = false;
      const services = createMockServices({
        getSetting: (key) => key === 'autoCraft' ? false : null,
        confirmDialog: async () => false,
        notify: { info: () => {}, warn: () => {}, error: () => { notified = true; } }
      });
      const store = createCraftingStore(services);
      await store.craft('r1');
      // declined confirm → no error notification; the action just silently returns
      // (matches CraftingApp behaviour)
      assert.ok(!notified, 'Should not notify error when user cancels confirm');
    });

    // T-091: The CraftingEngine._postCraftChatMessage() handles chat output.
    // craft() must NOT emit a second chat message.
    it('does NOT call createChatMessage on successful craft (chat handled by CraftingEngine)', async () => {
      let chatMessageCount = 0;
      const services = createMockServices({
        getSetting: (key) => key === 'autoCraft' ? true : null,
        createChatMessage: async () => { chatMessageCount++; return {}; }
      });
      const store = createCraftingStore(services);
      await store.craft('r1', { skipConfirm: true });
      assert.equal(chatMessageCount, 0,
        'createChatMessage must NOT be called from craft(); the engine already posts chat');
    });
  });

  // --- Run management ---

  describe('viewState activeRuns / runHistory', () => {
    it('populates activeRuns from runManager', async () => {
      const run = makeRun('run1', 'r1');
      const services = createMockServices({
        getCraftingRunManager: () => ({
          getActiveRuns: () => [run],
          getRunHistory: () => [],
          getActiveRun: () => run,
          cancelRun: async () => true
        })
      });
      const store = createCraftingStore(services);
      await store.refresh();
      const vs = get(store.viewState);
      assert.equal(vs.activeRuns.length, 1);
      assert.equal(vs.activeRuns[0].recipeId, 'r1');
    });

    it('populates runHistory from runManager', async () => {
      const run = makeRun('run1', 'r1', 'succeeded');
      const services = createMockServices({
        getCraftingRunManager: () => ({
          getActiveRuns: () => [],
          getRunHistory: () => [run],
          getActiveRun: () => null,
          cancelRun: async () => true
        })
      });
      const store = createCraftingStore(services);
      await store.refresh();
      const vs = get(store.viewState);
      assert.equal(vs.runHistory.length, 1);
    });
  });

  describe('cancelRun', () => {
    it('calls runManager.cancelRun and notifies info on success', async () => {
      let cancelledId = null;
      let infoMsg = null;
      const run = makeRun('run1', 'r1');
      const services = createMockServices({
        getCraftingRunManager: () => ({
          getActiveRuns: () => [run],
          getRunHistory: () => [],
          getActiveRun: (actor, id) => id === 'run1' ? run : null,
          cancelRun: async (actor, id) => { cancelledId = id; return true; }
        }),
        notify: { info: (m) => { infoMsg = m; }, warn: () => {}, error: () => {} }
      });
      const store = createCraftingStore(services);
      await store.cancelRun('run1');
      assert.equal(cancelledId, 'run1');
      assert.ok(infoMsg !== null);
    });
  });

  // --- restartRun ---

  describe('restartRun', () => {
    it('calls confirmDialog, then cancelRun, then craft with the correct recipeId', async () => {
      let confirmCalled = false;
      let cancelledRunId = null;
      let craftedRecipeId = null;
      const run = makeRun('run1', 'r1');
      const services = createMockServices({
        getCraftingRunManager: () => ({
          getActiveRuns: () => [run],
          getRunHistory: () => [],
          getActiveRun: (actor, id) => id === 'run1' ? run : null,
          cancelRun: async (actor, id) => { cancelledRunId = id; return true; }
        }),
        getCraftingEngine: () => ({
          craft: async (actor, sources, recipe) => {
            craftedRecipeId = recipe.id;
            return { success: true, message: 'Crafted!' };
          }
        }),
        confirmDialog: async () => { confirmCalled = true; return true; }
      });
      const store = createCraftingStore(services);
      await store.restartRun('r1', 'run1');
      assert.ok(confirmCalled, 'should call confirmDialog');
      assert.equal(cancelledRunId, 'run1', 'should cancel the existing run');
      assert.equal(craftedRecipeId, 'r1', 'should craft with the correct recipeId');
    });

    it('does nothing when confirmDialog is declined', async () => {
      let cancelCalled = false;
      let craftCalled = false;
      const run = makeRun('run1', 'r1');
      const services = createMockServices({
        getCraftingRunManager: () => ({
          getActiveRuns: () => [run],
          getRunHistory: () => [],
          getActiveRun: (actor, id) => id === 'run1' ? run : null,
          cancelRun: async () => { cancelCalled = true; return true; }
        }),
        getCraftingEngine: () => ({
          craft: async () => { craftCalled = true; return { success: true, message: 'Crafted!' }; }
        }),
        confirmDialog: async () => false
      });
      const store = createCraftingStore(services);
      await store.restartRun('r1', 'run1');
      assert.ok(!cancelCalled, 'should not call cancelRun when declined');
      assert.ok(!craftCalled, 'should not call craft when declined');
    });

    it('notifies error and does not craft when cancelRun fails', async () => {
      let errorMsg = null;
      let craftCalled = false;
      const run = makeRun('run1', 'r1');
      const services = createMockServices({
        getCraftingRunManager: () => ({
          getActiveRuns: () => [run],
          getRunHistory: () => [],
          getActiveRun: (actor, id) => id === 'run1' ? run : null,
          cancelRun: async () => false
        }),
        getCraftingEngine: () => ({
          craft: async () => { craftCalled = true; return { success: true, message: 'Crafted!' }; }
        }),
        notify: { info: () => {}, warn: () => {}, error: (m) => { errorMsg = m; } }
      });
      const store = createCraftingStore(services);
      await store.restartRun('r1', 'run1');
      assert.ok(errorMsg !== null, 'should notify error when cancel fails');
      assert.ok(!craftCalled, 'should not craft when cancel failed');
    });
  });

  // --- Recipe visibility filtering ---

  describe('recipe visibility filtering', () => {
    it('excludes recipes where evaluateRecipeAccess returns visible:false', async () => {
      const recipe1 = makeRecipe('r1', 'Healing Potion');
      const recipe2 = makeRecipe('r2', 'Hidden Recipe');
      const services = createMockServices({
        getRecipeManager: () => ({
          getRecipes: () => [recipe1, recipe2],
          getRecipe: (id) => [recipe1, recipe2].find(r => r.id === id) || null,
          evaluateCraftability: () => ({ canCraft: true, satisfiableSet: {}, missing: { ingredients: [], essences: [], catalysts: [] }, ingredientStates: [], essenceStates: [], catalystStates: [] })
        }),
        getRecipeVisibilityService: () => ({
          evaluateRecipeAccess: ({ recipe }) =>
            recipe.id === 'r2'
              ? { visible: false, craftable: false, reason: 'locked' }
              : { visible: true, craftable: true, reason: 'ok' },
          learnRecipe: async () => ({ success: true, message: 'Learned!' })
        })
      });
      const store = createCraftingStore(services);
      await store.refresh();
      const vs = get(store.viewState);
      assert.ok(!vs.recipes.some(r => r.id === 'r2'), 'hidden recipe should not appear in viewState.recipes');
      assert.ok(vs.recipes.some(r => r.id === 'r1'), 'visible recipe should appear');
    });

    it('showOnlyAvailable=true filters to only craftable recipes', async () => {
      const recipe1 = makeRecipe('r1', 'Craftable Potion');
      const recipe2 = makeRecipe('r2', 'Uncraftable Potion');
      const services = createMockServices({
        getRecipeManager: () => ({
          getRecipes: () => [recipe1, recipe2],
          getRecipe: (id) => [recipe1, recipe2].find(r => r.id === id) || null,
          evaluateCraftability: (sources, recipe) =>
            recipe.id === 'r1'
              ? { canCraft: true, satisfiableSet: {}, missing: { ingredients: [], essences: [], catalysts: [] }, ingredientStates: [], essenceStates: [], catalystStates: [] }
              : { canCraft: false, satisfiableSet: null, missing: { ingredients: ['x'], essences: [], catalysts: [] }, ingredientStates: [], essenceStates: [], catalystStates: [] }
        }),
        getRecipeVisibilityService: () => ({
          evaluateRecipeAccess: () => ({ visible: true, craftable: true, reason: 'ok' }),
          learnRecipe: async () => ({ success: true, message: 'Learned!' })
        })
      });
      const store = createCraftingStore(services);
      store.showOnlyAvailable.set(true);
      await store.refresh();
      const vs = get(store.viewState);
      assert.ok(vs.recipes.every(r => r.canCraft), 'only craftable recipes should appear when showOnlyAvailable=true');
      assert.ok(!vs.recipes.some(r => r.id === 'r2'), 'uncraftable recipe r2 should be filtered out');
    });

    it('showOnlyAvailable=false shows all visible recipes regardless of craftability', async () => {
      const recipe1 = makeRecipe('r1', 'Craftable Potion');
      const recipe2 = makeRecipe('r2', 'Uncraftable Potion');
      const services = createMockServices({
        getRecipeManager: () => ({
          getRecipes: () => [recipe1, recipe2],
          getRecipe: (id) => [recipe1, recipe2].find(r => r.id === id) || null,
          evaluateCraftability: (sources, recipe) =>
            recipe.id === 'r1'
              ? { canCraft: true, satisfiableSet: {}, missing: { ingredients: [], essences: [], catalysts: [] }, ingredientStates: [], essenceStates: [], catalystStates: [] }
              : { canCraft: false, satisfiableSet: null, missing: { ingredients: ['x'], essences: [], catalysts: [] }, ingredientStates: [], essenceStates: [], catalystStates: [] }
        }),
        getRecipeVisibilityService: () => ({
          evaluateRecipeAccess: () => ({ visible: true, craftable: true, reason: 'ok' }),
          learnRecipe: async () => ({ success: true, message: 'Learned!' })
        })
      });
      const store = createCraftingStore(services);
      store.showOnlyAvailable.set(false);
      await store.refresh();
      const vs = get(store.viewState);
      assert.ok(vs.recipes.some(r => r.id === 'r1'), 'craftable recipe should appear');
      assert.ok(vs.recipes.some(r => r.id === 'r2'), 'uncraftable recipe should also appear when showOnlyAvailable=false');
    });
  });

  // --- learnRecipe ---

  describe('learnRecipe', () => {
    it('delegates to visibilityService.learnRecipe and notifies success', async () => {
      let learnCalled = false;
      let infoMsg = null;
      const services = createMockServices({
        getRecipeVisibilityService: () => ({
          evaluateRecipeAccess: () => ({ visible: true, craftable: true, reason: 'ok' }),
          learnRecipe: async () => {
            learnCalled = true;
            return { success: true, message: 'Learned!' };
          }
        }),
        notify: { info: (m) => { infoMsg = m; }, warn: () => {}, error: () => {} }
      });
      const store = createCraftingStore(services);
      await store.learnRecipe('r1');
      assert.ok(learnCalled);
      assert.equal(infoMsg, 'Learned!');
    });

    it('notifies warn when learnRecipe fails', async () => {
      let warnMsg = null;
      const services = createMockServices({
        getRecipeVisibilityService: () => ({
          evaluateRecipeAccess: () => ({ visible: true, craftable: true, reason: 'ok' }),
          learnRecipe: async () => ({ success: false, message: 'Cannot learn' })
        }),
        notify: { info: () => {}, warn: (m) => { warnMsg = m; }, error: () => {} }
      });
      const store = createCraftingStore(services);
      await store.learnRecipe('r1');
      assert.ok(warnMsg !== null);
    });
  });

  // --- Helper: _formatRemainingSeconds ---

  describe('_formatRemainingSeconds (via _buildRunDisplay)', () => {
    it('formats seconds < 60 as "Xs"', async () => {
      const run = makeRun('run1', 'r1', 'waitingTime');
      // timeGate availableAt = worldTime + 45
      run.steps[0].timeGate = { availableAt: 1000 + 45 };
      const services = createMockServices({
        getCraftingRunManager: () => ({
          getActiveRuns: () => [run],
          getRunHistory: () => [],
          cancelRun: async () => true
        })
      });
      const store = createCraftingStore(services);
      await store.refresh();
      const vs = get(store.viewState);
      const activeRun = vs.activeRuns[0];
      assert.ok(activeRun.statusLabel.includes('45s'), `Expected "45s" in "${activeRun.statusLabel}"`);
    });

    it('formats seconds >= 60 as "Xm Ys"', async () => {
      const run = makeRun('run1', 'r1', 'waitingTime');
      run.steps[0].timeGate = { availableAt: 1000 + 90 };
      const services = createMockServices({
        getCraftingRunManager: () => ({
          getActiveRuns: () => [run],
          getRunHistory: () => [],
          cancelRun: async () => true
        })
      });
      const store = createCraftingStore(services);
      await store.refresh();
      const vs = get(store.viewState);
      const activeRun = vs.activeRuns[0];
      assert.ok(activeRun.statusLabel.includes('1m 30s'), `Expected "1m 30s" in "${activeRun.statusLabel}"`);
    });
  });

  // --- viewState rendering contracts (AC3) ---

  describe('viewState rendering contracts', () => {
    it('craftable recipe has correct display fields (canCraft, allowCraftAction, statusLabel, craftButtonLabel)', async () => {
      const services = createMockServices({
        getRecipeManager: () => ({
          getRecipes: () => [makeRecipe('r1', 'Healing Potion')],
          getRecipe: (id) => id === 'r1' ? makeRecipe('r1', 'Healing Potion') : null,
          evaluateCraftability: () => ({
            canCraft: true,
            satisfiableSet: {},
            missing: { ingredients: [], essences: [], catalysts: [] },
            ingredientStates: [],
            essenceStates: [],
            catalystStates: []
          })
        }),
        getRecipeVisibilityService: () => ({
          evaluateRecipeAccess: () => ({ visible: true, craftable: true, reason: 'ok' }),
          learnRecipe: async () => ({ success: true, message: 'Learned!' })
        })
      });
      const store = createCraftingStore(services);
      await store.refresh();
      const vs = get(store.viewState);
      const recipe = vs.recipes.find(r => r.id === 'r1');
      assert.ok(recipe, 'recipe r1 should be in viewState');
      assert.equal(recipe.canCraft, true);
      assert.equal(recipe.allowCraftAction, true);
      assert.equal(recipe.statusLabel, 'Available');
      assert.equal(recipe.craftButtonLabel, 'Craft');
    });

    it('uncraftable recipe has canCraft:false, allowCraftAction:false, statusLabel:Missing materials', async () => {
      const services = createMockServices({
        getRecipeManager: () => ({
          getRecipes: () => [makeRecipe('r1', 'Hard Recipe')],
          getRecipe: (id) => id === 'r1' ? makeRecipe('r1', 'Hard Recipe') : null,
          evaluateCraftability: () => ({
            canCraft: false,
            satisfiableSet: null,
            missing: { ingredients: ['iron'], essences: [], catalysts: [] },
            ingredientStates: [],
            essenceStates: [],
            catalystStates: []
          })
        }),
        getRecipeVisibilityService: () => ({
          evaluateRecipeAccess: () => ({ visible: true, craftable: true, reason: 'ok' }),
          learnRecipe: async () => ({ success: true, message: 'Learned!' })
        })
      });
      const store = createCraftingStore(services);
      store.showOnlyAvailable.set(false);
      await store.refresh();
      const vs = get(store.viewState);
      const recipe = vs.recipes.find(r => r.id === 'r1');
      assert.ok(recipe, 'uncraftable recipe should appear when showOnlyAvailable=false');
      assert.equal(recipe.canCraft, false);
      assert.equal(recipe.allowCraftAction, false);
      assert.equal(recipe.statusLabel, 'Missing materials');
      assert.equal(recipe.craftButtonLabel, 'Craft');
    });

    it('recipe with knowledge reason and matchedItems has canLearn:true', async () => {
      const services = createMockServices({
        getRecipeManager: () => ({
          getRecipes: () => [makeRecipe('r1', 'Secret Recipe')],
          getRecipe: (id) => id === 'r1' ? makeRecipe('r1', 'Secret Recipe') : null,
          evaluateCraftability: () => ({
            canCraft: false,
            satisfiableSet: null,
            missing: { ingredients: [], essences: [], catalysts: [] },
            ingredientStates: [],
            essenceStates: [],
            catalystStates: []
          })
        }),
        getRecipeVisibilityService: () => ({
          evaluateRecipeAccess: () => ({
            visible: true,
            craftable: false,
            reason: 'knowledge',
            knowledge: { hasLearned: false, matchedItems: ['tome-of-secrets'] }
          }),
          learnRecipe: async () => ({ success: true, message: 'Learned!' })
        })
      });
      const store = createCraftingStore(services);
      store.showOnlyAvailable.set(false);
      await store.refresh();
      const vs = get(store.viewState);
      const recipe = vs.recipes.find(r => r.id === 'r1');
      assert.ok(recipe, 'knowledge-gated recipe should appear');
      assert.equal(recipe.canLearn, true);
    });

    it('viewState.favouriteRecipes only includes visible recipes that are favourited', async () => {
      const recipe1 = makeRecipe('r1', 'Healing Potion');
      const services = createMockServices({
        getSetting: (key) => {
          // r1 is visible, r-ghost is not in the recipe list
          if (key === 'favouriteRecipes') return ['r1', 'r-ghost'];
          return null;
        },
        getRecipeManager: () => ({
          getRecipes: () => [recipe1],
          getRecipe: (id) => id === 'r1' ? recipe1 : null,
          evaluateCraftability: () => ({ canCraft: true, satisfiableSet: {}, missing: { ingredients: [], essences: [], catalysts: [] }, ingredientStates: [], essenceStates: [], catalystStates: [] })
        })
      });
      const store = createCraftingStore(services);
      await store.refresh();
      const vs = get(store.viewState);
      assert.ok(vs.favouriteRecipes.some(r => r.id === 'r1'), 'visible favourite should appear');
      assert.ok(!vs.favouriteRecipes.some(r => r.id === 'r-ghost'), 'non-existent favourite should not appear');
    });

    it('activeRuns entries have canContinue and canCancel flags', async () => {
      const inProgressRun = makeRun('run1', 'r1', 'inProgress');
      const waitingRun = makeRun('run2', 'r2', 'waitingTime');
      // timeGate in the future — canContinue should be false
      waitingRun.steps[0].timeGate = { availableAt: 1000 + 300 };
      const services = createMockServices({
        getCraftingRunManager: () => ({
          getActiveRuns: () => [inProgressRun, waitingRun],
          getRunHistory: () => [],
          cancelRun: async () => true
        })
      });
      const store = createCraftingStore(services);
      await store.refresh();
      const vs = get(store.viewState);
      const run1 = vs.activeRuns.find(r => r.id === 'run1');
      const run2 = vs.activeRuns.find(r => r.id === 'run2');
      assert.ok(run1, 'inProgress run should appear in activeRuns');
      assert.equal(run1.canContinue, true, 'inProgress run should have canContinue:true');
      assert.equal(run1.canCancel, true, 'inProgress run should have canCancel:true');
      assert.ok(run2, 'waitingTime run should appear in activeRuns');
      assert.equal(run2.canContinue, false, 'waitingTime run with future gate should have canContinue:false');
      assert.equal(run2.canCancel, true, 'waitingTime run should have canCancel:true');
    });

    it('runHistory entries have canCancel:false', async () => {
      const succeededRun = makeRun('run1', 'r1', 'succeeded');
      succeededRun.finishedAt = 2000;
      const services = createMockServices({
        getCraftingRunManager: () => ({
          getActiveRuns: () => [],
          getRunHistory: () => [succeededRun],
          cancelRun: async () => true
        })
      });
      const store = createCraftingStore(services);
      await store.refresh();
      const vs = get(store.viewState);
      assert.equal(vs.runHistory.length, 1);
      assert.equal(vs.runHistory[0].canCancel, false, 'history runs should have canCancel:false');
      assert.ok('recipeName' in vs.runHistory[0], 'history run should have recipeName field');
      assert.ok('statusLabel' in vs.runHistory[0], 'history run should have statusLabel field');
    });
  });

  // --- destroy ---

  describe('destroy', () => {
    it('is a callable no-op', () => {
      const services = createMockServices();
      const store = createCraftingStore(services);
      assert.doesNotThrow(() => store.destroy());
    });
  });
});

// ---------------------------------------------------------------------------
// Duplicate-run-ID deduplication (T-168)
// ---------------------------------------------------------------------------

describe('run deduplication — each_key_duplicate guard', () => {

  it('deduplicates activeRuns when runManager returns duplicate run IDs', async () => {
    // Simulate a corrupt/race-condition state where the same run ID appears twice
    // in the active list (e.g. flag written twice or Object.values bug).
    const duplicateRun = makeRun('dup-run-1', 'r1', 'inProgress');
    const services = createMockServices({
      getCraftingRunManager: () => ({
        getActiveRuns: () => [duplicateRun, duplicateRun],
        getRunHistory: () => [],
        getActiveRun: () => null,
        cancelRun: async () => true
      })
    });
    const store = createCraftingStore(services);
    await store.refresh();
    const vs = get(store.viewState);
    const ids = vs.activeRuns.map(r => r.id);
    const unique = [...new Set(ids)];
    assert.deepEqual(ids, unique, 'activeRuns must not contain duplicate run IDs');
    assert.equal(vs.activeRuns.length, 1);
  });

  it('deduplicates runHistory when history array contains duplicate run IDs', async () => {
    // Simulate history array with the same run pushed twice (e.g. completeRun called twice).
    const finishedRun = makeRun('hist-run-1', 'r1', 'succeeded');
    finishedRun.finishedAt = 2000;
    const services = createMockServices({
      getCraftingRunManager: () => ({
        getActiveRuns: () => [],
        getRunHistory: () => [finishedRun, finishedRun],
        getActiveRun: () => null,
        cancelRun: async () => true
      })
    });
    const store = createCraftingStore(services);
    await store.refresh();
    const vs = get(store.viewState);
    const ids = vs.runHistory.map(r => r.id);
    const unique = [...new Set(ids)];
    assert.deepEqual(ids, unique, 'runHistory must not contain duplicate run IDs');
    assert.equal(vs.runHistory.length, 1);
  });

  it('preserves all unique activeRuns when IDs are distinct', async () => {
    const run1 = makeRun('run-a', 'r1', 'inProgress');
    const run2 = makeRun('run-b', 'r2', 'waitingTime');
    const services = createMockServices({
      getCraftingRunManager: () => ({
        getActiveRuns: () => [run1, run2],
        getRunHistory: () => [],
        getActiveRun: () => null,
        cancelRun: async () => true
      })
    });
    const store = createCraftingStore(services);
    await store.refresh();
    const vs = get(store.viewState);
    assert.equal(vs.activeRuns.length, 2);
  });

  it('activeRuns and runHistory can share same run ID without collision (separate lists)', async () => {
    // A run that just completed may briefly appear in both collections.
    // The deduplication is per-list; the shared ID must not cause any throws.
    const sharedRun = makeRun('shared-id', 'r1', 'inProgress');
    const completedRun = makeRun('shared-id', 'r1', 'succeeded');
    completedRun.finishedAt = 2000;
    const services = createMockServices({
      getCraftingRunManager: () => ({
        getActiveRuns: () => [sharedRun],
        getRunHistory: () => [completedRun],
        getActiveRun: () => null,
        cancelRun: async () => true
      })
    });
    const store = createCraftingStore(services);
    // Must not throw
    await assert.doesNotReject(() => store.refresh());
    const vs = get(store.viewState);
    assert.equal(vs.activeRuns.length, 1);
    assert.equal(vs.runHistory.length, 1);
  });
  // ---------------------------------------------------------------------------
  // T-091: Completed runs must not appear in activeRuns
  // ---------------------------------------------------------------------------

  describe('T-091: activeRuns excludes terminal-status runs', () => {
    it('excludes runs with status "succeeded" from activeRuns', async () => {
      const run = makeRun('run-done', 'r1', 'succeeded');
      const services = createMockServices({
        getCraftingRunManager: () => ({
          getActiveRuns: () => [run],
          getRunHistory: () => [],
          getActiveRun: () => null,
          cancelRun: async () => true
        })
      });
      const store = createCraftingStore(services);
      await store.refresh();
      const vs = get(store.viewState);
      assert.equal(vs.activeRuns.length, 0,
        'Succeeded run must not appear in activeRuns (flag propagation-delay fix)');
    });

    it('excludes runs with status "failed" from activeRuns', async () => {
      const run = makeRun('run-failed', 'r1', 'failed');
      const services = createMockServices({
        getCraftingRunManager: () => ({
          getActiveRuns: () => [run],
          getRunHistory: () => [],
          getActiveRun: () => null,
          cancelRun: async () => true
        })
      });
      const store = createCraftingStore(services);
      await store.refresh();
      const vs = get(store.viewState);
      assert.equal(vs.activeRuns.length, 0,
        'Failed run must not appear in activeRuns (flag propagation-delay fix)');
    });

    it('keeps runs with status "inProgress" in activeRuns', async () => {
      const run = makeRun('run-active', 'r1', 'inProgress');
      const services = createMockServices({
        getCraftingRunManager: () => ({
          getActiveRuns: () => [run],
          getRunHistory: () => [],
          getActiveRun: () => run,
          cancelRun: async () => true
        })
      });
      const store = createCraftingStore(services);
      await store.refresh();
      const vs = get(store.viewState);
      assert.equal(vs.activeRuns.length, 1, 'inProgress run must remain in activeRuns');
      assert.equal(vs.activeRuns[0].id, 'run-active');
    });

    it('keeps runs with status "waitingTime" in activeRuns', async () => {
      const run = {
        id: 'run-waiting',
        recipeId: 'r1',
        status: 'waitingTime',
        steps: [{ stepName: 'Rest', timeGate: { availableAt: 5000 } }],
        currentStepIndex: 0,
        startedAt: 1000,
        finishedAt: null
      };
      const services = createMockServices({
        getCraftingRunManager: () => ({
          getActiveRuns: () => [run],
          getRunHistory: () => [],
          getActiveRun: () => run,
          cancelRun: async () => true
        })
      });
      const store = createCraftingStore(services);
      await store.refresh();
      const vs = get(store.viewState);
      assert.equal(vs.activeRuns.length, 1, 'waitingTime run must remain in activeRuns');
      assert.equal(vs.activeRuns[0].id, 'run-waiting');
    });
  });

});
