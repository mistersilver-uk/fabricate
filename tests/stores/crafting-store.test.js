import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';

import { createSvelteModuleCompiler } from '../helpers/compile-svelte-module.js';
import { progressiveStageThresholds } from '../../src/utils/progressiveStageThresholds.js';
import { resolveProgressiveAward } from '../../src/utils/progressiveAward.js';

function makeServices(overrides = {}) {
  const calls = {
    listCraftingForActor: [],
    hydrateCraftingRecipe: [],
    craftRecipe: [],
    notify: [],
    toggleFavourite: [],
    evaluateSelectedSet: [],
  };
  // Stateful favourites fake so toggleFavourite round-trips like the real setting.
  let favourites = Array.isArray(overrides.favourites) ? [...overrides.favourites] : [];
  const services = {
    listCraftingForActor: async (opts) => {
      calls.listCraftingForActor.push(opts);
      return overrides.listing ?? { summaries: [] };
    },
    // The DETAIL phase seam (issue 1075). Answers from the registry every `recipe()` below
    // writes itself into, so it serves the tests that hand `makeServices` a listing AND the
    // ones that replace `listCraftingForActor` wholesale with a fresh literal.
    //
    // COUNTED, because the memo and its per-load wipe are behaviour no returned value can
    // show: a store that re-hydrated on every derive, or one that never invalidated after a
    // craft, answers the same object either way. The count is the only observation that
    // separates them.
    hydrateCraftingRecipe: (opts = {}) => {
      calls.hydrateCraftingRecipe.push(opts);
      if (typeof overrides.hydrateCraftingRecipe === 'function') {
        return overrides.hydrateCraftingRecipe(opts);
      }
      return HYDRATED.get(opts.recipeId) ?? null;
    },
    craftRecipe:
      overrides.craftRecipe ??
      (async (opts) => {
        calls.craftRecipe.push(opts);
        return { success: true, results: [] };
      }),
    notify: (message) => calls.notify.push(message),
    craftErrorMessage: () => 'Crafting failed.',
    evaluateSelectedSet:
      overrides.evaluateSelectedSet ??
      ((opts) => {
        calls.evaluateSelectedSet.push(opts);
        return overrides.recomputedCraftability ?? null;
      }),
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

/**
 * The rich models the hydration seam answers with, keyed by recipe id (issue 1075).
 *
 * A registry rather than a per-test wiring because several tests replace
 * `listCraftingForActor` with their own literal, and a hydration fixture that could only see
 * `makeServices`'s own listing would answer null for exactly those — leaving the detail-side
 * assertions passing against nothing. Last write per id wins, and every test builds its
 * fixture immediately before loading, so the most recently built shape is the one served.
 */
const HYDRATED = new Map();

/** A fixture model that is BOTH the browse summary and the hydrated detail for one recipe. */
function recipe(id, name, extra = {}) {
  const model = {
    id,
    name,
    ingredientSets: [{ id: `${id}-set`, craftability: {} }],
    defaultSetId: `${id}-set`,
    ...extra,
  };
  HYDRATED.set(id, model);
  return model;
}

/**
 * Compiles the crafting store module with its non-mocked leaf dependencies copied in
 * plain, and returns the loaded `createCraftingStore` factory alongside the compiler
 * (the caller owns `compiler.cleanup()`). Shared by both describe blocks below so
 * neither duplicates the copy list nor reaches into the other's `before`/`after`
 * bindings — each suite gets its own compiler instance under its own tmp prefix.
 *
 * @param {string} prefix Unique tmp-dir prefix for this suite's compiled output.
 * @returns {Promise<{ compiler: object, createCraftingStore: Function }>}
 */
async function setupCraftingStoreCompiler(prefix) {
  const compiler = createSvelteModuleCompiler(prefix);
  compiler.copyPlain('src/ui/svelte/util/shoppingListAggregator.js');
  // The store reconciles the player's stored stage order through this import-free leaf
  // (issue 651). A dependency the store imports but the compiler does not copy makes
  // the whole suite HANG (# cancelled), never fail.
  compiler.copyPlain('src/utils/progressiveResultOrder.js');
  // And the threshold helper: the store recomputes thresholds after a reorder.
  compiler.copyPlain('src/utils/progressiveStageThresholds.js');
  // The requirement rail's slot projection (issue 917) — same rule again.
  compiler.copyPlain('src/ui/svelte/util/requirementSlots.js');
  const { createCraftingStore } = await compiler.load('src/ui/svelte/stores/craftingStore.svelte.js');
  return { compiler, createCraftingStore };
}

describe('craftingStore', () => {
  let compiler;
  let createCraftingStore;

  before(async () => {
    ({ compiler, createCraftingStore } = await setupCraftingStoreCompiler('fabricate-crafting-store-'));
  });

  after(() => {
    compiler.cleanup();
  });

  it('load fetches the listing with the current actor + source ids and sets loadedOnce', async () => {
    const listing = { summaries: [recipe('r1', 'Anvil')] };
    const { services, calls } = makeServices({ listing, actorId: 'hero', sourceIds: ['a1', 'a2'] });
    const store = createCraftingStore({ services });

    await store.load();
    flushSync();

    assert.equal(store.loadedOnce, true);
    assert.equal(store.loading, false);
    assert.equal(store.listing.summaries.length, 1);
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
      summaries: [
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
      summaries: ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'].map((name, idx) =>
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
      summaries: [recipe('r1', 'Iron Sword'), recipe('r2', 'Bronze Shield'), recipe('r3', 'Oak Bow')],
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
      summaries: [
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
      summaries: [
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
      summaries: [
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
      summaries: [
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
    const listing = { summaries: [recipe('r1', 'Iron Sword')] };
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
    const listing = { summaries: [recipe('r1', 'Sword'), recipe('r2', 'Shield')] };
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

  it('on success records the roll result and refreshes', async () => {
    const { services, calls } = makeServices();
    const store = createCraftingStore({ services });
    await store.load();
    const loadsAfterInitial = calls.listCraftingForActor.length;

    const result = await store.craft({ id: 'r1' });
    flushSync();

    assert.equal(result.success, true);
    assert.ok(store.lastRollResult.r1, 'roll result stored per recipe');
    assert.equal(
      calls.listCraftingForActor.length,
      loadsAfterInitial + 1,
      'a successful craft quietly refreshes the listing'
    );
  });

  it('tickWorldTime bumps the world-time tick', () => {
    const { services } = makeServices();
    const store = createCraftingStore({ services });

    assert.equal(store.worldTimeTick, 0);
    store.tickWorldTime();
    flushSync();
    assert.equal(store.worldTimeTick, 1);
  });

  // ── Issue 552: per-group ingredient option overrides ──────────────────────
  function optionListing() {
    return {
      summaries: [
        recipe('r1', 'Potion', {
          ingredientSets: [{ id: 'r1-set', craftability: { canCraft: true, marker: 'baked' } }],
        }),
      ],
    };
  }

  it('chooseIngredientOption recomputes selectedCraftability through evaluateSelectedSet', async () => {
    const { services, calls } = makeServices({
      listing: optionListing(),
      actorId: 'hero',
      sourceIds: ['a1'],
      recomputedCraftability: { canCraft: false, marker: 'recomputed' },
    });
    const store = createCraftingStore({ services });
    await store.load();
    store.select('r1');
    flushSync();

    assert.equal(store.selectedCraftability.marker, 'baked', 'no override → baked craftability');
    assert.equal(calls.evaluateSelectedSet.length, 0, 'no recompute without an override');

    store.chooseIngredientOption('g1', { optionIndex: 1 });
    flushSync();

    assert.equal(store.selectedCraftability.marker, 'recomputed', 'override → recomputed craftability');
    assert.deepEqual(calls.evaluateSelectedSet.at(-1), {
      recipeId: 'r1',
      setId: 'r1-set',
      optionOverrides: { g1: { optionIndex: 1, heldItemId: null } },
      // Issue 917: the re-evaluate is now scoped and carries the essence funding.
      // A NULL allocation and a null step id are byte-for-byte today's behaviour (the
      // facade treats both as absent). Null rather than `{}` is load-bearing: the
      // model reads a supplied allocation as authoritative and never tops it up, so
      // an empty one means "the player emptied this pool" — sending it for a
      // choice-only override zeroed every essence bar and blocked the craft.
      essenceAllocation: null,
      stepId: null,
      actorId: 'hero',
      componentSourceActorIds: ['a1'],
    });
  });

  it('selecting a recipe resets the option overrides back to the default', async () => {
    const { services } = makeServices({
      listing: optionListing(),
      recomputedCraftability: { marker: 'recomputed' },
    });
    const store = createCraftingStore({ services });
    await store.load();
    store.select('r1');
    store.chooseIngredientOption('g1', { optionIndex: 1 });
    flushSync();
    assert.deepEqual(store.selectedIngredientOptions, { g1: { optionIndex: 1, heldItemId: null } });

    store.select('r1');
    flushSync();
    assert.deepEqual(store.selectedIngredientOptions, {}, 'select() clears overrides');
    assert.equal(store.selectedCraftability.marker, 'baked', 'back to the baked craftability');
  });

  it('chooseIngredientSet clears the option overrides (they are set-scoped)', async () => {
    const { services } = makeServices({ listing: optionListing() });
    const store = createCraftingStore({ services });
    await store.load();
    store.select('r1');
    store.chooseIngredientOption('g1', { optionIndex: 1 });
    flushSync();

    store.chooseIngredientSet('r1-set');
    flushSync();
    assert.deepEqual(store.selectedIngredientOptions, {}, 'switching sets clears overrides');
  });

  it('threads the option overrides into the craft call', async () => {
    const { services, calls } = makeServices({ listing: optionListing() });
    const store = createCraftingStore({ services });
    await store.load();
    store.select('r1');
    store.chooseIngredientOption('g1', { optionIndex: 2, heldItemId: 'held-x' });
    flushSync();

    await store.craft(store.selectedRecipe);
    assert.deepEqual(calls.craftRecipe.at(-1).ingredientOptionOverrides, {
      g1: { optionIndex: 2, heldItemId: 'held-x' },
    });
  });

  it('chooseIngredientOption with a null optionIndex clears that group override', async () => {
    const { services } = makeServices({
      listing: optionListing(),
      recomputedCraftability: { marker: 'recomputed' },
    });
    const store = createCraftingStore({ services });
    await store.load();
    store.select('r1');
    store.chooseIngredientOption('g1', { optionIndex: 1 });
    flushSync();
    assert.equal(store.selectedCraftability.marker, 'recomputed');

    store.chooseIngredientOption('g1', { optionIndex: null });
    flushSync();
    assert.deepEqual(store.selectedIngredientOptions, {});
    assert.equal(store.selectedCraftability.marker, 'baked', 'clearing the last override restores baked');
  });

  // ── Progressive stage order (issue 651) ──────────────────────────────────
  //
  // The ordering COMPOSITION lives here, not in the mounted component: craftingStore
  // is in neither harness list, so a mounted ProgressiveBody test can only prove
  // presentation-given-props and cannot reach this at all. These also carry the D7/D7a
  // claims, which are otherwise unfalsifiable and would ship green against a
  // fire-and-forget write.

  const STAGES = [
    { id: 's1', name: 'Rough', difficulty: 2, threshold: 2 },
    { id: 's2', name: 'Fine', difficulty: 3, threshold: 5 },
    { id: 's3', name: 'Master', difficulty: 4, threshold: 9 },
  ];

  function orderListing(extra = {}) {
    return {
      summaries: [
        recipe('r1', 'Blade', {
          progressiveStages: STAGES,
          allowPlayerResultReorder: true,
          ...extra,
        }),
      ],
    };
  }

  function makeOrderServices({ stored = {}, setImpl, ...rest } = {}) {
    const writes = [];
    const { services, calls } = makeServices({ listing: orderListing(), ...rest });
    services.getProgressiveResultOrder = () => ({ ...stored });
    services.setProgressiveResultOrder = async (key, order) => {
      writes.push({ key, order });
      if (setImpl) return setImpl(key, order);
      return {};
    };
    services.progressiveOrderRevertMessage = () =>
      'Could not save your order. Restored the last saved order.';
    return { services, calls, writes };
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const pinnedRecipe = () => ({
    summaries: [
      recipe('r1', 'Blade', { progressiveStages: STAGES, allowPlayerResultReorder: false }),
    ],
  });

  it('seeds the stored orders on load and applies them to the selected recipe', async () => {
    const { services } = makeOrderServices({ stored: { 'recipe:r1': ['s3', 's1'] } });
    const store = createCraftingStore({ services });
    await store.load();
    store.select('r1');
    flushSync();

    assert.deepEqual(
      store.orderedProgressiveStages.map((stage) => stage.id),
      ['s3', 's1', 's2'],
      'ranked first, the rest tail-appended in authored order'
    );
  });

  it('an unordered recipe keeps the authored order', async () => {
    const { services } = makeOrderServices();
    const store = createCraftingStore({ services });
    await store.load();
    store.select('r1');
    flushSync();
    assert.deepEqual(
      store.orderedProgressiveStages.map((stage) => stage.id),
      ['s1', 's2', 's3']
    );
  });

  it('allowPlayerResultReorder false IGNORES a stored order', async () => {
    const { services } = makeOrderServices({ stored: { 'recipe:r1': ['s3', 's2', 's1'] } });
    services.listCraftingForActor = async () => pinnedRecipe();
    const store = createCraftingStore({ services });
    await store.load();
    store.select('r1');
    flushSync();
    assert.deepEqual(
      store.orderedProgressiveStages.map((stage) => stage.id),
      ['s1', 's2', 's3']
    );
  });

  it('reorderProgressiveStage moves a stage optimistically and announces it', async () => {
    const { services } = makeOrderServices();
    const store = createCraftingStore({ services });
    await store.load();
    store.select('r1');
    flushSync();

    store.reorderProgressiveStage(2, 0, 'Master moved to position 1 of 3');
    flushSync();

    assert.deepEqual(
      store.orderedProgressiveStages.map((stage) => stage.id),
      ['s3', 's1', 's2'],
      'the row moves immediately, before the write resolves'
    );
    assert.equal(store.orderAnnouncement, 'Master moved to position 1 of 3');
    assert.deepEqual(store.progressiveOrders['recipe:r1'], ['s3', 's1', 's2'], 'stored as IDS');
    await store.flushProgressiveOrder();
  });

  it('reorderProgressiveStage is a no-op when the GM has pinned the order', async () => {
    const { services, writes } = makeOrderServices();
    services.listCraftingForActor = async () => pinnedRecipe();
    const store = createCraftingStore({ services });
    await store.load();
    store.select('r1');
    flushSync();

    store.reorderProgressiveStage(2, 0, 'nope');
    flushSync();
    await store.flushProgressiveOrder();

    assert.deepEqual(
      store.orderedProgressiveStages.map((stage) => stage.id),
      ['s1', 's2', 's3']
    );
    assert.equal(writes.length, 0, 'and nothing is written');
  });

  it('D7: DEBOUNCE — N intermediate moves commit ONCE on settle', async () => {
    // Every commit is a replicated document write under `scope: user`; a drag emits a
    // move per hovered row. Mutation: await the write per move instead of debouncing.
    const { services, writes } = makeOrderServices();
    const store = createCraftingStore({ services });
    await store.load();
    store.select('r1');
    flushSync();

    store.reorderProgressiveStage(2, 1, 'a');
    store.reorderProgressiveStage(1, 0, 'b');
    store.reorderProgressiveStage(0, 1, 'c');
    flushSync();
    assert.equal(writes.length, 0, 'nothing is written mid-drag');

    await sleep(600);
    assert.equal(writes.length, 1, 'exactly one write on settle');
    assert.equal(writes[0].key, 'recipe:r1');
  });

  it('D7: flushProgressiveOrder commits immediately (drop/settle) without waiting', async () => {
    const { services, writes } = makeOrderServices();
    const store = createCraftingStore({ services });
    await store.load();
    store.select('r1');
    flushSync();

    store.reorderProgressiveStage(2, 0, 'a');
    await store.flushProgressiveOrder();

    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0].order, ['s3', 's1', 's2']);
  });

  it('D7a: a REJECTED write reverts the rows AND announces the revert', async () => {
    // The failure this pins: with an optimistic write the row has already moved and the
    // live region has already announced the new position. A silent failure leaves the
    // player believing an order that was never stored, while the next craft awards down
    // the old one — this issue's own defect class at the UI edge.
    const { services } = makeOrderServices({
      stored: { 'recipe:r1': ['s2', 's1', 's3'] },
      setImpl: () => {
        throw new Error('setting rejected');
      },
    });
    const store = createCraftingStore({ services });
    await store.load();
    store.select('r1');
    flushSync();
    assert.deepEqual(
      store.orderedProgressiveStages.map((stage) => stage.id),
      ['s2', 's1', 's3']
    );

    store.reorderProgressiveStage(2, 0, 'Master moved to position 1 of 3');
    flushSync();
    assert.deepEqual(
      store.orderedProgressiveStages.map((stage) => stage.id),
      ['s3', 's2', 's1'],
      'optimistic: the row moved'
    );

    await store.flushProgressiveOrder();
    flushSync();

    assert.deepEqual(
      store.orderedProgressiveStages.map((stage) => stage.id),
      ['s2', 's1', 's3'],
      'reverted to the last PERSISTED order'
    );
    assert.equal(
      store.orderAnnouncement,
      'Could not save your order. Restored the last saved order.',
      'and the revert is announced through the SAME live region the move used'
    );
  });

  it('D7a: a rejected FIRST-EVER write drops the key rather than stranding it', async () => {
    const { services } = makeOrderServices({
      setImpl: () => {
        throw new Error('setting rejected');
      },
    });
    const store = createCraftingStore({ services });
    await store.load();
    store.select('r1');
    flushSync();

    store.reorderProgressiveStage(2, 0, 'moved');
    await store.flushProgressiveOrder();
    flushSync();

    assert.equal(store.progressiveOrders['recipe:r1'], undefined, 'no phantom stored order');
    assert.deepEqual(
      store.orderedProgressiveStages.map((stage) => stage.id),
      ['s1', 's2', 's3']
    );
  });

  it('D7a: a SUCCESSFUL write becomes the new revert target', async () => {
    let fail = false;
    const { services } = makeOrderServices({
      setImpl: () => {
        if (fail) throw new Error('rejected');
        return {};
      },
    });
    const store = createCraftingStore({ services });
    await store.load();
    store.select('r1');
    flushSync();

    store.reorderProgressiveStage(2, 0, 'first');
    await store.flushProgressiveOrder();
    flushSync();
    assert.deepEqual(
      store.orderedProgressiveStages.map((stage) => stage.id),
      ['s3', 's1', 's2']
    );

    fail = true;
    store.reorderProgressiveStage(2, 0, 'second');
    await store.flushProgressiveOrder();
    flushSync();
    assert.deepEqual(
      store.orderedProgressiveStages.map((stage) => stage.id),
      ['s3', 's1', 's2'],
      'reverts to the first (successfully persisted) order, not the authored one'
    );
  });

  // ── Thresholds are POSITIONAL, so a reorder must recompute them ──────────
  //
  // The threshold is a CUMULATIVE property of a stage's POSITION in the list the roll is
  // spent down — not an intrinsic property of the stage. Reordering therefore invalidates
  // every threshold at or after the move.
  //
  // The builder bakes thresholds in AUTHORED order, and `applyPlayerResultOrder` returns
  // elements ===-identical to its inputs (D5, load-bearing), so a reordered stage carries
  // its AUTHORED-position threshold with it unless something recomputes. Worked example,
  // `equal`, authored [A(5), B(3)] -> A>=5, B>=8; move B to the top and the rendered rows
  // read "B >=8, A >=5" — inverted, with the top row claiming a higher bar than the row
  // beneath, so the badge argues against the move the player just made. At budget 5 the
  // engine awards B while the badge claims A: the wrong STAGE, not merely a wrong number.
  //
  // These fixtures deliberately DERIVE their thresholds from the helper rather than
  // hardcoding them — a hardcoded-threshold fixture is exactly how this hid, since it
  // asserts the value the test author expected instead of the value the award loop implies.

  const COST_OF = (stage) => stage.difficulty ?? NaN;

  /** Authored stages with builder-equivalent thresholds baked in authored order. */
  function bakedStages(difficulties, awardMode) {
    const authored = difficulties.map((difficulty, i) => ({
      id: `s${i + 1}`,
      name: `Stage ${i + 1}`,
      difficulty,
    }));
    const thresholds = progressiveStageThresholds({ results: authored, costFor: COST_OF, awardMode });
    return authored.map((stage, i) => ({ ...stage, threshold: thresholds[i] }));
  }

  function thresholdStore(difficulties, awardMode, stored) {
    const stages = bakedStages(difficulties, awardMode);
    const { services } = makeServices({});
    services.listCraftingForActor = async () => ({
      summaries: [
        recipe('r1', 'Blade', {
          progressiveStages: stages,
          allowPlayerResultReorder: true,
          progressiveAwardMode: awardMode,
        }),
      ],
    });
    services.getProgressiveResultOrder = () => ({ 'recipe:r1': [...stored] });
    services.setProgressiveResultOrder = async () => ({});
    return createCraftingStore({ services });
  }

  for (const awardMode of ['equal', 'exceed', 'partial']) {
    it(`COMPOSED (${awardMode}): thresholds are recomputed for the PLAYER'S order, not the authored one`, async () => {
      // The store's stages are rendered verbatim (ProgressiveStageList emits
      // `data-progressive-stage-threshold={stage.threshold}` with no arithmetic of its
      // own), so a correct store here is a correct badge there.
      const store = thresholdStore([5, 3, 4], awardMode, ['s2', 's3', 's1']);
      await store.load();
      store.select('r1');
      flushSync();

      const ordered = store.orderedProgressiveStages;
      assert.deepEqual(
        ordered.map((stage) => stage.id),
        ['s2', 's3', 's1'],
        'precondition: the player order applied'
      );

      const expected = progressiveStageThresholds({
        results: ordered,
        costFor: COST_OF,
        awardMode,
      });
      assert.deepEqual(
        ordered.map((stage) => stage.threshold),
        expected,
        `${awardMode}: each threshold reflects the stage's NEW position`
      );
    });
  }

  it('COMPOSED: the reordered thresholds are non-decreasing down the list', async () => {
    // The invariant the defect broke most visibly: budget is spent top-down, so a lower
    // row can never be reached at a LOWER threshold than the row above it.
    const store = thresholdStore([5, 3, 4], 'equal', ['s2', 's3', 's1']);
    await store.load();
    store.select('r1');
    flushSync();

    const thresholds = store.orderedProgressiveStages.map((stage) => stage.threshold);
    for (let i = 1; i < thresholds.length; i++) {
      assert.ok(
        thresholds[i] >= thresholds[i - 1],
        `row ${i + 1} (>=${thresholds[i]}) must not be reached before row ${i} (>=${thresholds[i - 1]})`
      );
    }
  });

  it('COMPOSED: the displayed threshold agrees with the award loop at every budget', async () => {
    // The spec requirement in ui-integration §Crafting App (Player), asserted through the
    // real composition rather than against the helper in isolation.
    const store = thresholdStore([5, 3, 4], 'equal', ['s2', 's3', 's1']);
    await store.load();
    store.select('r1');
    flushSync();

    const ordered = store.orderedProgressiveStages;
    for (let budget = 0; budget <= 20; budget++) {
      const { awarded } = resolveProgressiveAward({
        results: ordered,
        initialRemaining: budget,
        costFor: COST_OF,
        awardMode: 'equal',
        invalidCost: 'skip',
      });
      const claimed = ordered.filter(
        (stage) => stage.threshold !== null && budget >= stage.threshold
      );
      assert.deepEqual(
        claimed.map((stage) => stage.id),
        awarded.map((stage) => stage.id),
        `budget ${budget}: the badge must claim exactly what the loop awards`
      );
    }
  });

  it('COMPOSED: an unreachable stage keeps a null threshold after a reorder', async () => {
    // difficulty null -> costFor NaN -> the award loop skips it -> reached at NO budget,
    // so the badge must stay omitted rather than acquire a number from its new position.
    const stages = [
      { id: 's1', name: 'One', difficulty: 2, threshold: 2 },
      { id: 's2', name: 'Broken', difficulty: null, threshold: null },
      { id: 's3', name: 'Three', difficulty: 3, threshold: 5 },
    ];
    const { services } = makeServices({});
    services.listCraftingForActor = async () => ({
      summaries: [
        recipe('r1', 'Blade', {
          progressiveStages: stages,
          allowPlayerResultReorder: true,
          progressiveAwardMode: 'equal',
        }),
      ],
    });
    services.getProgressiveResultOrder = () => ({ 'recipe:r1': ['s2', 's3', 's1'] });
    const store = createCraftingStore({ services });
    await store.load();
    store.select('r1');
    flushSync();

    const ordered = store.orderedProgressiveStages;
    assert.deepEqual(ordered.map((s) => s.id), ['s2', 's3', 's1']);
    assert.equal(ordered[0].threshold, null, 'the skipped stage still has no threshold');
    assert.deepEqual(
      ordered.map((stage) => stage.threshold),
      [null, 3, 5],
      'and it consumes no budget, so the stages after it are unaffected by its position'
    );
  });

  it('COMPOSED: a GM-pinned order leaves the authored thresholds untouched', async () => {
    const stages = bakedStages([5, 3, 4], 'equal');
    const { services } = makeServices({});
    services.listCraftingForActor = async () => ({
      summaries: [
        recipe('r1', 'Blade', {
          progressiveStages: stages,
          allowPlayerResultReorder: false,
          progressiveAwardMode: 'equal',
        }),
      ],
    });
    services.getProgressiveResultOrder = () => ({ 'recipe:r1': ['s2', 's3', 's1'] });
    const store = createCraftingStore({ services });
    await store.load();
    store.select('r1');
    flushSync();

    assert.deepEqual(
      store.orderedProgressiveStages.map((stage) => stage.threshold),
      [5, 8, 12],
      'no reorder, so the builder-baked authored thresholds stand'
    );
  });

  it('COMPOSED: a live reorder recomputes the thresholds immediately', async () => {
    const store = thresholdStore([5, 3, 4], 'equal', []);
    await store.load();
    store.select('r1');
    flushSync();
    assert.deepEqual(
      store.orderedProgressiveStages.map((stage) => stage.threshold),
      [5, 8, 12],
      'authored order first'
    );

    // Move the LAST stage (difficulty 4) to the top.
    store.reorderProgressiveStage(2, 0, 'moved');
    flushSync();

    const ordered = store.orderedProgressiveStages;
    assert.deepEqual(ordered.map((stage) => stage.id), ['s3', 's1', 's2']);
    assert.deepEqual(
      ordered.map((stage) => stage.threshold),
      [4, 9, 12],
      'the moved stage is now reached first, at its own difficulty'
    );
    await store.flushProgressiveOrder();
  });
});

// ---------------------------------------------------------------------------
// The detail-hydration mechanism (issue 1075)
// ---------------------------------------------------------------------------

describe('craftingStore detail hydration', () => {
  let compiler;
  let createCraftingStore;

  before(async () => {
    ({ compiler, createCraftingStore } = await setupCraftingStoreCompiler(
      'fabricate-crafting-store-hydration-'
    ));
  });

  after(() => {
    compiler.cleanup();
  });

  /** Two rows, so a filter can move which one the no-selection fallback lands on. */
  function twoRowListing() {
    return {
      summaries: [recipe('r1', 'Anvil'), recipe('r2', 'Bellows')],
    };
  }

  it('hydrates a selection ONCE however many times the model is re-derived', async () => {
    const { services, calls } = makeServices({ listing: twoRowListing() });
    const store = createCraftingStore({ services });
    await store.load();

    store.select('r1');
    flushSync();
    assert.equal(store.selectedRecipe?.id, 'r1');

    // Re-derive the same selection repeatedly. `selectedRecipe` depends on the page, the
    // search box and every filter, so without the memo each of these would pay a fresh
    // round-trip on the browse path this issue exists to keep free.
    store.setPage(0);
    flushSync();
    void store.selectedRecipe;
    void store.selectedRecipe;
    flushSync();

    assert.deepEqual(
      calls.hydrateCraftingRecipe.map((call) => call.recipeId),
      ['r1'],
      'one hydration for one selection, across every re-derive'
    );
  });

  it('re-hydrates after a load, because the previous pass describes a stale world', async () => {
    // The memo's invalidation. A hydrated model carries exact craftability derived from live
    // `actor.items`, and `load()` is what runs after a craft — so serving the pre-craft model
    // would tell the player they can craft something they have just spent the materials for.
    const { services, calls } = makeServices({ listing: twoRowListing() });
    const store = createCraftingStore({ services });
    await store.load();

    store.select('r1');
    flushSync();
    assert.equal(calls.hydrateCraftingRecipe.length, 1);

    await store.load();
    flushSync();
    void store.selectedRecipe;
    flushSync();

    assert.equal(
      calls.hydrateCraftingRecipe.length,
      2,
      'a fresh listing must drop the hydrated models of the previous pass'
    );
    assert.equal(calls.hydrateCraftingRecipe[1].recipeId, 'r1');
  });

  it('surfaces a null hydration as null, and still names the row it came from', async () => {
    // The two shapes are not substitutable: a summary has no `ingredientSets`, no `check` and
    // no `defaultSetId`, so falling back to it would render a detail panel silently missing
    // everything instead of an empty one that is visibly wrong. `selectedSummary` is what the
    // browser list highlights, so it must survive a failed hydration.
    const { services } = makeServices({
      listing: twoRowListing(),
      hydrateCraftingRecipe: () => null,
    });
    const store = createCraftingStore({ services });
    await store.load();

    store.select('r1');
    flushSync();

    assert.equal(store.selectedRecipe, null, 'no summary-shaped fallback');
    assert.equal(store.selectedSummary?.id, 'r1', 'the browser list still highlights the row');
    assert.equal(store.selectedSummary?.name, 'Anvil');
  });

  it('exposes the summary ROW, which is not the hydrated model', async () => {
    // Non-vacuity for the assertion above, and the reason `selectedSummary` exists as its
    // own read: it is the row out of `listing.summaries`, not a passthrough of
    // `selectedRecipe`. The default fixture makes the two the same object, which would let
    // a passthrough pass — so this one deliberately hydrates a DIFFERENT object.
    const { services } = makeServices({
      listing: twoRowListing(),
      hydrateCraftingRecipe: ({ recipeId }) => ({ id: recipeId, name: 'HYDRATED', check: {} }),
    });
    const store = createCraftingStore({ services });
    await store.load();

    store.select('r2');
    flushSync();

    assert.equal(store.selectedRecipe?.name, 'HYDRATED', 'the detail is the hydrated shape');
    assert.equal(store.selectedSummary?.name, 'Bellows', 'the summary is the browse row');
    // Compared against the store's OWN listing rather than the fixture literal: `listing` is
    // `$state`, so Svelte 5 hands back a deep proxy of the object the fake returned, and the
    // raw literal is never ===-identical to what any reader sees.
    assert.equal(
      store.selectedSummary,
      store.listing.summaries[1],
      'and it is the very row object the listing carried'
    );
  });

  it('hydrates nothing further when a filter moves under an EXPLICIT selection', async () => {
    // The spec's browse-phase rule: search, filters and paging are pure reads over summaries.
    const { services, calls } = makeServices({ listing: twoRowListing() });
    const store = createCraftingStore({ services });
    await store.load();

    store.select('r1');
    flushSync();
    const afterSelect = calls.hydrateCraftingRecipe.length;
    assert.equal(afterSelect, 1);

    store.setSearch('bell');
    flushSync();
    void store.selectedRecipe;
    store.setSearch('');
    flushSync();
    void store.selectedRecipe;
    flushSync();

    assert.equal(
      calls.hydrateCraftingRecipe.length,
      afterSelect,
      'an explicit selection survives a filter, so nothing is re-hydrated'
    );
  });

  it('hydrates the NEW fallback row when a filter moves it and nothing is selected', async () => {
    // The qualified half of the same rule, pinned so the spec text and the code cannot drift
    // apart again: with no explicit selection the app shows the first visible row, and a
    // filter that changes which row that is does hydrate the new one, once per distinct id,
    // never once per keystroke.
    const { services, calls } = makeServices({ listing: twoRowListing() });
    const store = createCraftingStore({ services });
    await store.load();
    flushSync();
    void store.selectedRecipe;
    flushSync();

    assert.deepEqual(
      calls.hydrateCraftingRecipe.map((call) => call.recipeId),
      ['r1'],
      'the fallback row is the first visible one'
    );

    store.setSearch('bell');
    flushSync();
    void store.selectedRecipe;
    flushSync();

    assert.deepEqual(
      calls.hydrateCraftingRecipe.map((call) => call.recipeId),
      ['r1', 'r2'],
      'the fallback moved, so the new row is hydrated'
    );

    // And typing on without moving the fallback again costs nothing more.
    store.setSearch('bello');
    flushSync();
    void store.selectedRecipe;
    flushSync();

    assert.equal(calls.hydrateCraftingRecipe.length, 2, 'memoised per id within the pass');
  });
});
