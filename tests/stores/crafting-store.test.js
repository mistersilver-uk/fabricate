import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';

import { createSvelteModuleCompiler } from '../helpers/compile-svelte-module.js';

let compiler;
let createCraftingStore;

function makeServices(overrides = {}) {
  const calls = { listCraftingForActor: [], craftRecipe: [], notify: [], toggleFavourite: [] };
  // Stateful favourites fake so toggleFavourite round-trips like the real setting.
  let favourites = Array.isArray(overrides.favourites) ? [...overrides.favourites] : [];
  const services = {
    listCraftingForActor: async (opts) => {
      calls.listCraftingForActor.push(opts);
      return overrides.listing ?? { recipes: [] };
    },
    craftRecipe:
      overrides.craftRecipe ??
      (async (opts) => {
        calls.craftRecipe.push(opts);
        return { success: true, results: [] };
      }),
    notify: (message) => calls.notify.push(message),
    craftErrorMessage: () => 'Crafting failed.',
    getRecipeManager: () => overrides.recipeManager ?? null,
    getCraftingSourceActors: () => overrides.sourceActors ?? [],
    getSelectedCraftingActorId: () => overrides.actorId ?? 'actor-1',
    getCraftingComponentSourceIds: () => overrides.sourceIds ?? [],
    getFavouriteRecipeIds: () => [...favourites],
    toggleFavouriteRecipe: (id) => {
      calls.toggleFavourite.push(id);
      if (id) {
        favourites = favourites.includes(id)
          ? favourites.filter((entry) => entry !== id)
          : [...favourites, id];
      }
      return [...favourites];
    },
  };
  return { services, calls };
}

function recipe(id, name, extra = {}) {
  return {
    id,
    name,
    ingredientSets: [{ id: `${id}-set`, craftability: {} }],
    defaultSetId: `${id}-set`,
    ...extra,
  };
}

describe('craftingStore', () => {
  before(async () => {
    compiler = createSvelteModuleCompiler('fabricate-crafting-store-');
    compiler.copyPlain('src/ui/svelte/util/shoppingListAggregator.js');
    ({ createCraftingStore } = await compiler.load('src/ui/svelte/stores/craftingStore.svelte.js'));
  });

  after(() => {
    compiler.cleanup();
  });

  it('load fetches the listing with the current actor + source ids and sets loadedOnce', async () => {
    const listing = { recipes: [recipe('r1', 'Anvil')] };
    const { services, calls } = makeServices({ listing, actorId: 'hero', sourceIds: ['a1', 'a2'] });
    const store = createCraftingStore({ services });

    await store.load();
    flushSync();

    assert.equal(store.loadedOnce, true);
    assert.equal(store.loading, false);
    assert.equal(store.listing.recipes.length, 1);
    assert.deepEqual(calls.listCraftingForActor[0], {
      rememberedActorId: 'hero',
      componentSourceActorIds: ['a1', 'a2'],
    });
  });

  it('records the error message and clears loading when the fetch throws', async () => {
    const { services } = makeServices();
    services.listCraftingForActor = async () => {
      throw new Error('boom');
    };
    const store = createCraftingStore({ services });

    await store.load();
    flushSync();

    assert.equal(store.error, 'boom');
    assert.equal(store.loading, false);
  });

  it('filters the visible list by search (case-insensitive) and resets the page', async () => {
    const listing = {
      recipes: [
        recipe('r1', 'Iron Sword'),
        recipe('r2', 'Bronze Shield'),
        recipe('r3', 'Iron Dagger'),
      ],
    };
    const { services } = makeServices({ listing });
    const store = createCraftingStore({ services });
    await store.load();
    store.setPage(2);
    flushSync();

    store.setSearch('iron');
    flushSync();

    assert.equal(store.page, 0, 'search resets to the first page');
    assert.deepEqual(
      store.visibleRecipes.map((entry) => entry.id),
      ['r3', 'r1'],
      'sorted A→Z by name, filtered to matches'
    );
  });

  it('paginates the visible recipes by page size', async () => {
    const listing = {
      recipes: ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'].map((name, idx) =>
        recipe(`r${idx}`, name)
      ),
    };
    const { services } = makeServices({ listing });
    const store = createCraftingStore({ services });
    await store.load();

    store.setPageSize(2);
    flushSync();
    assert.deepEqual(
      store.pageItems.map((entry) => entry.name),
      ['Alpha', 'Bravo']
    );

    store.setPage(1);
    flushSync();
    assert.deepEqual(
      store.pageItems.map((entry) => entry.name),
      ['Charlie', 'Delta']
    );
  });

  it('filters the visible list to favourites and resets the page', async () => {
    const listing = {
      recipes: [recipe('r1', 'Iron Sword'), recipe('r2', 'Bronze Shield'), recipe('r3', 'Oak Bow')],
    };
    const { services } = makeServices({ listing, favourites: ['r3', 'r1'] });
    const store = createCraftingStore({ services });
    await store.load();
    store.setPage(2);
    flushSync();

    store.setFavouritesOnly(true);
    flushSync();

    assert.equal(store.page, 0, 'toggling a filter resets to the first page');
    assert.deepEqual(
      store.visibleRecipes.map((entry) => entry.id),
      ['r1', 'r3'],
      'only favourited recipes remain, sorted A→Z'
    );
  });

  it('filters the visible list to craftable (available) recipes only', async () => {
    const listing = {
      recipes: [
        recipe('r1', 'Iron Sword', { browseStatus: 'available' }),
        recipe('r2', 'Bronze Shield', { browseStatus: 'missingMaterials' }),
        recipe('r3', 'Oak Bow', { browseStatus: 'available' }),
      ],
    };
    const { services } = makeServices({ listing });
    const store = createCraftingStore({ services });
    await store.load();

    store.setCraftableOnly(true);
    flushSync();

    assert.deepEqual(
      store.visibleRecipes.map((entry) => entry.id),
      ['r1', 'r3'],
      'only available recipes remain'
    );
  });

  it('filters the visible list by crafting system and exposes the system options', async () => {
    const listing = {
      recipes: [
        recipe('r1', 'Iron Sword', { systemId: 'sys-a', systemName: 'Smithing' }),
        recipe('r2', 'Bronze Shield', { systemId: 'sys-b', systemName: 'Armoury' }),
        recipe('r3', 'Oak Bow', { systemId: 'sys-a', systemName: 'Smithing' }),
      ],
    };
    const { services } = makeServices({ listing });
    const store = createCraftingStore({ services });
    await store.load();
    flushSync();

    assert.deepEqual(
      store.availableSystems,
      [
        { id: 'sys-b', name: 'Armoury' },
        { id: 'sys-a', name: 'Smithing' },
      ],
      'de-duped system options sorted A→Z by name'
    );

    store.setSystemFilter('sys-a');
    flushSync();
    assert.deepEqual(
      store.visibleRecipes.map((entry) => entry.id),
      ['r1', 'r3'],
      'only the selected system remains'
    );

    store.setSystemFilter(null);
    flushSync();
    assert.equal(store.visibleRecipes.length, 3, 'clearing the system filter restores all');
  });

  it('filters the visible list by category and exposes de-duped, sorted category options', async () => {
    const listing = {
      recipes: [
        recipe('r1', 'Iron Sword', { category: 'weapons', categoryLabel: 'Weapons' }),
        recipe('r2', 'Bronze Shield', { category: 'armor', categoryLabel: 'Armor' }),
        recipe('r3', 'Oak Bow', { category: 'weapons', categoryLabel: 'Weapons' }),
        recipe('r4', 'Odd Trinket', { category: 'general', categoryLabel: 'General' }),
      ],
    };
    const { services } = makeServices({ listing });
    const store = createCraftingStore({ services });
    await store.load();
    flushSync();

    assert.deepEqual(
      store.availableCategories,
      [
        { id: 'armor', name: 'Armor' },
        { id: 'weapons', name: 'Weapons' },
        { id: 'general', name: 'General' },
      ],
      'de-duped options sorted non-general A→Z, then General pinned last'
    );

    store.setPage(2);
    store.setCategoryFilter('weapons');
    flushSync();
    assert.equal(store.page, 0, 'setting the category filter resets to the first page');
    assert.deepEqual(
      store.visibleRecipes.map((entry) => entry.id),
      ['r1', 'r3'],
      'only the selected category remains'
    );

    store.setCategoryFilter(null);
    flushSync();
    assert.equal(store.visibleRecipes.length, 4, 'clearing the category filter restores all');
  });

  it('composes the category filter (AND) with active search and system filters', async () => {
    const listing = {
      recipes: [
        recipe('r1', 'Iron Sword', {
          category: 'weapons',
          categoryLabel: 'Weapons',
          systemId: 'sys-a',
          systemName: 'Smithing',
        }),
        recipe('r2', 'Iron Dagger', {
          category: 'weapons',
          categoryLabel: 'Weapons',
          systemId: 'sys-b',
          systemName: 'Armoury',
        }),
        recipe('r3', 'Iron Shield', {
          category: 'armor',
          categoryLabel: 'Armor',
          systemId: 'sys-a',
          systemName: 'Smithing',
        }),
      ],
    };
    const { services } = makeServices({ listing });
    const store = createCraftingStore({ services });
    await store.load();

    store.setSearch('iron');
    store.setSystemFilter('sys-a');
    store.setCategoryFilter('weapons');
    flushSync();

    assert.deepEqual(
      store.visibleRecipes.map((entry) => entry.id),
      ['r1'],
      'category composes AND with the search AND system filter'
    );
  });

  it('toggles a recipe favourite through the services seam and updates the id list', async () => {
    const listing = { recipes: [recipe('r1', 'Iron Sword')] };
    const { services, calls } = makeServices({ listing });
    const store = createCraftingStore({ services });
    await store.load();

    store.toggleFavourite('r1');
    flushSync();
    assert.deepEqual(store.favouriteIds, ['r1'], 'favourite persisted and reflected');
    assert.deepEqual(calls.toggleFavourite, ['r1']);

    store.toggleFavourite('r1');
    flushSync();
    assert.deepEqual(store.favouriteIds, [], 'toggling again removes it');
  });

  it('selects a recipe and resets the chosen ingredient set', async () => {
    const listing = { recipes: [recipe('r1', 'Sword'), recipe('r2', 'Shield')] };
    const { services } = makeServices({ listing });
    const store = createCraftingStore({ services });
    await store.load();

    store.select('r2');
    store.chooseIngredientSet('r2-set');
    flushSync();
    assert.equal(store.selectedRecipe.id, 'r2');
    assert.equal(store.selectedIngredientSetId, 'r2-set');

    store.select('r1');
    flushSync();
    assert.equal(store.selectedRecipe.id, 'r1', 'find-or-first resolves the new selection');
    assert.equal(store.selectedIngredientSetId, null, 'selecting resets the ingredient set');
    assert.equal(store.selectedSet.id, 'r1-set', 'selectedSet falls back to the default set');
  });

  it('aggregates the shopping list with Have / Need / Missing', async () => {
    const recipeManager = {
      getRecipe: (id) => ({ id, name: `Recipe ${id}` }),
      evaluateCraftability: () => ({
        ingredientStates: [
          { componentId: 'wood', description: 'Wood', need: 2, have: 1, satisfied: false },
        ],
        essenceStates: [],
        toolStates: [],
      }),
    };
    const { services } = makeServices({ recipeManager, sourceActors: [{ id: 'a1', items: [] }] });
    const store = createCraftingStore({ services });

    store.addToShoppingList('r1', 3);
    flushSync();

    const aggregate = store.shoppingAggregate;
    assert.equal(aggregate.totalRecipes, 1);
    assert.equal(aggregate.ingredients.length, 1);
    const wood = aggregate.ingredients[0];
    assert.equal(wood.totalNeed, 6, 'need x quantity');
    assert.equal(wood.have, 1);
    assert.equal(wood.missing, 5);
    assert.equal(wood.satisfied, false);
  });

  it('removes and clears shopping list entries', async () => {
    const { services } = makeServices();
    const store = createCraftingStore({ services });

    store.addToShoppingList('r1', 1);
    store.addToShoppingList('r1', 2);
    flushSync();
    assert.deepEqual(
      store.shoppingEntries,
      [{ recipeId: 'r1', quantity: 3 }],
      'bumps existing entry'
    );

    store.addToShoppingList('r2', 1);
    store.removeFromShoppingList('r1');
    flushSync();
    assert.deepEqual(store.shoppingEntries, [{ recipeId: 'r2', quantity: 1 }]);

    store.clearShoppingList();
    flushSync();
    assert.deepEqual(store.shoppingEntries, []);
  });

  it('craft guards against re-entrancy while a craft is in flight', async () => {
    let resolveCraft;
    const craftRecipe = () => new Promise((res) => (resolveCraft = res));
    const { services } = makeServices({ craftRecipe });
    const store = createCraftingStore({ services });

    const first = store.craft({ id: 'r1' });
    flushSync();
    assert.equal(store.craftInFlight, true);

    const blocked = await store.craft({ id: 'r1' });
    assert.equal(blocked, null, 'a second craft is blocked while one is in flight');

    resolveCraft({ success: true, results: [] });
    await first;
    flushSync();
    assert.equal(store.craftInFlight, false);
  });

  it('notifies and does not refresh the listing on a failed craft', async () => {
    const craftRecipe = async () => ({ success: false, message: 'Missing materials' });
    const { services, calls } = makeServices({ craftRecipe });
    const store = createCraftingStore({ services });

    const result = await store.craft({ id: 'r1' });
    flushSync();

    assert.equal(result.success, false);
    assert.deepEqual(calls.notify, ['Missing materials']);
    assert.equal(calls.listCraftingForActor.length, 0, 'failed craft does not refetch');
  });

  it('surfaces a thrown craftRecipe as a notification and clears craftInFlight', async () => {
    const craftRecipe = async () => {
      throw new Error('macro exploded');
    };
    const { services, calls } = makeServices({ craftRecipe });
    const store = createCraftingStore({ services });
    await store.load();
    const loadsAfterInitial = calls.listCraftingForActor.length;

    const result = await store.craft({ id: 'r1' });
    flushSync();

    assert.equal(result.success, false, 'a thrown craft resolves to a failure result');
    assert.deepEqual(calls.notify, ['Crafting failed.'], 'the generic craft-error message is notified');
    assert.equal(store.craftInFlight, false, 'a thrown craft never leaves craftInFlight stuck');
    assert.equal(
      calls.listCraftingForActor.length,
      loadsAfterInitial,
      'a thrown craft does not refresh the listing'
    );
  });

  it('on success records the roll result, marks the recipe recent, and refreshes', async () => {
    const { services, calls } = makeServices();
    const store = createCraftingStore({ services });
    await store.load();
    const loadsAfterInitial = calls.listCraftingForActor.length;

    const result = await store.craft({ id: 'r1' });
    flushSync();

    assert.equal(result.success, true);
    assert.ok(store.lastRollResult.r1, 'roll result stored per recipe');
    assert.deepEqual(store.recents, ['r1']);
    assert.equal(
      calls.listCraftingForActor.length,
      loadsAfterInitial + 1,
      'a successful craft quietly refreshes the listing'
    );
  });

  it('markRecent dedupes and caps newest-first', () => {
    const { services } = makeServices();
    const store = createCraftingStore({ services });

    store.markRecent('r1');
    store.markRecent('r2');
    store.markRecent('r1');
    flushSync();

    assert.deepEqual(store.recents, ['r1', 'r2'], 'newest first, no duplicates');
  });

  it('tickWorldTime bumps the world-time tick', () => {
    const { services } = makeServices();
    const store = createCraftingStore({ services });

    assert.equal(store.worldTimeTick, 0);
    store.tickWorldTime();
    flushSync();
    assert.equal(store.worldTimeTick, 1);
  });
});
