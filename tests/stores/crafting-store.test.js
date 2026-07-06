import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';

import { createSvelteModuleCompiler } from '../helpers/compile-svelte-module.js';

let compiler;
let createCraftingStore;

function makeServices(overrides = {}) {
  const calls = {
    listCraftingForActor: [],
    craftRecipe: [],
    notify: [],
    toggleFavourite: [],
    confirmDialog: [],
    setSkipCraftConfirmation: [],
  };
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
  // Pre-craft confirmation seams (issue 61). Only wire the confirm seam when a
  // test supplies it, so the seam-less craft tests keep dispatching unchanged
  // (an absent `confirmDialog` makes the gate a no-op). The skip getter is opt-in
  // too; `setSkipCraftConfirmation` is always recorded (only reached inside the
  // confirm branch).
  if (overrides.confirmDialog) {
    services.confirmDialog = async (options) => {
      calls.confirmDialog.push(options);
      return overrides.confirmDialog(options);
    };
  }
  if ('skipCraftConfirmation' in overrides) {
    services.getSkipCraftConfirmation = () => overrides.skipCraftConfirmation === true;
  }
  services.setSkipCraftConfirmation = (value) => {
    calls.setSkipCraftConfirmation.push(value);
  };
  services.localize = (key) => key;
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
    // The real store now imports the pre-craft confirmation content builder
    // (issue 61); copy it verbatim so the compiled store's import resolves.
    compiler.copyPlain('src/ui/svelte/apps/crafting/craftConfirm.js');
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

  it('confirm gate: a declined confirmDialog cancels the craft without dispatching (issue 61)', async () => {
    const { services, calls } = makeServices({ confirmDialog: async () => false });
    const store = createCraftingStore({ services });

    const result = await store.craft({ id: 'r1' });
    flushSync();

    assert.deepEqual(result, { cancelled: true }, 'a declined confirm cancels the craft');
    assert.equal(calls.confirmDialog.length, 1, 'the confirmation dialog was shown');
    assert.equal(calls.craftRecipe.length, 0, 'no craft is dispatched when declined');
  });

  it('confirm gate: skip setting bypasses the dialog and dispatches directly (issue 61)', async () => {
    const { services, calls } = makeServices({
      skipCraftConfirmation: true,
      confirmDialog: async () => true,
    });
    const store = createCraftingStore({ services });

    const result = await store.craft({ id: 'r1' });
    flushSync();

    assert.equal(result.success, true, 'the craft dispatches');
    assert.equal(calls.confirmDialog.length, 0, 'the dialog is skipped when the setting is on');
    assert.equal(calls.craftRecipe.length, 1, 'the craft is dispatched once');
  });

  it('confirm gate: a ticked "don\'t ask again" persists the skip before dispatch (issue 61)', async () => {
    const { services, calls } = makeServices({
      confirmDialog: async (options) => {
        // DialogV2 invokes the yes button callback with the submitting button; the
        // form exposes the named checkbox. Tick it so the store persists the opt-out.
        await options.yes.callback(
          {},
          { form: { elements: { dontAskAgain: { checked: true } } } }
        );
        return true;
      },
    });
    const store = createCraftingStore({ services });

    const result = await store.craft({ id: 'r1' });
    flushSync();

    assert.equal(result.success, true, 'the craft dispatches after confirming');
    assert.deepEqual(calls.setSkipCraftConfirmation, [true], 'the opt-out is persisted');
    assert.equal(calls.craftRecipe.length, 1, 'the craft is dispatched once');
  });

  it('confirm gate: an unticked confirm dispatches without persisting the skip (issue 61)', async () => {
    const { services, calls } = makeServices({
      confirmDialog: async (options) => {
        // A normal Confirm-without-ticking: the callback must still resolve true so
        // the craft is not silently dropped (F1), and must not persist the opt-out.
        const resolved = await options.yes.callback(
          {},
          { form: { elements: { dontAskAgain: { checked: false } } } }
        );
        assert.equal(resolved, true, 'the yes callback returns true unconditionally');
        return true;
      },
    });
    const store = createCraftingStore({ services });

    const result = await store.craft({ id: 'r1' });
    flushSync();

    assert.equal(result.success, true, 'the craft dispatches');
    assert.deepEqual(calls.setSkipCraftConfirmation, [], 'the opt-out is not persisted');
    assert.equal(calls.craftRecipe.length, 1, 'the craft is dispatched once');
  });

  it('confirm gate: a dismissed dialog (resolves null) cancels quietly without an error toast (issue 61)', async () => {
    // A benign dismiss (Escape / X / click-away) resolves to null via the seam's
    // rejectClose:false default — it must read as cancel, NOT the craft-error toast.
    const { services, calls } = makeServices({ confirmDialog: async () => null });
    const store = createCraftingStore({ services });

    const result = await store.craft({ id: 'r1' });
    flushSync();

    assert.deepEqual(result, { cancelled: true }, 'a dismissed confirm cancels the craft');
    assert.equal(calls.craftRecipe.length, 0, 'no craft is dispatched on dismiss');
    assert.deepEqual(calls.notify, [], 'a dismiss raises no error notification');
  });

  it('confirm gate: a rejected confirmDialog is treated as a silent cancel, not an error (issue 61)', async () => {
    // Defensive: even if the seam ever rejects, the confirm-stage catch must yield a
    // quiet cancel rather than falling through to the outer craft-error toast.
    const { services, calls } = makeServices({
      confirmDialog: async () => {
        throw new Error('dialog blew up');
      },
    });
    const store = createCraftingStore({ services });

    const result = await store.craft({ id: 'r1' });
    flushSync();

    assert.deepEqual(result, { cancelled: true }, 'a rejected confirm cancels the craft');
    assert.equal(calls.craftRecipe.length, 0, 'no craft is dispatched on a confirm rejection');
    assert.deepEqual(calls.notify, [], 'a confirm rejection raises no error notification');
  });

  it('confirm gate: an absent confirmDialog seam is a no-op that dispatches (issue 61)', async () => {
    // No `confirmDialog` override → the seam is absent, so the gate must NOT block
    // the craft (opposite of the Manager discard-guard).
    const { services, calls } = makeServices();
    const store = createCraftingStore({ services });

    const result = await store.craft({ id: 'r1' });
    flushSync();

    assert.equal(result.success, true, 'the craft dispatches with no confirm seam');
    assert.equal(calls.confirmDialog.length, 0, 'no dialog is shown when the seam is absent');
    assert.equal(calls.craftRecipe.length, 1, 'the craft is dispatched once');
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
