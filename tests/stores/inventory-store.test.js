import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';

import { createSvelteModuleCompiler } from '../helpers/compile-svelte-module.js';

let compiler;
let createInventoryStore;

function row(key, name, extra = {}) {
  return {
    key,
    componentId: key,
    name,
    isEssenceSource: false,
    totalQuantity: 1,
    tags: [],
    usedBy: [],
    sources: [],
    essences: [],
    ...extra,
  };
}

function makeServices(overrides = {}) {
  const calls = { listInventoryForActor: [] };
  const services = {
    listInventoryForActor: async (opts) => {
      calls.listInventoryForActor.push(opts);
      return overrides.listing ?? { rows: [], selectedActorId: null };
    },
    getSelectedCraftingActorId: () => overrides.actorId ?? 'actor-1',
    getCraftingComponentSourceIds: () => overrides.sourceIds ?? [],
    ...(overrides.craftingSources ? { craftingSources: overrides.craftingSources } : {}),
  };
  return { services, calls };
}

describe('inventoryStore', () => {
  before(async () => {
    compiler = createSvelteModuleCompiler('fabricate-inventory-store-');
    ({ createInventoryStore } = await compiler.load(
      'src/ui/svelte/stores/inventoryStore.svelte.js'
    ));
  });

  after(() => {
    compiler.cleanup();
  });

  it('load fetches the listing with the current actor + source ids and sets loadedOnce', async () => {
    const listing = { rows: [row('sys:c1', 'Iron')], selectedActorId: 'hero' };
    const { services, calls } = makeServices({ listing, actorId: 'hero', sourceIds: ['a1', 'a2'] });
    const store = createInventoryStore({ services });

    await store.load();
    flushSync();

    assert.equal(store.loadedOnce, true);
    assert.equal(store.loading, false);
    assert.equal(store.hasActor, true);
    assert.equal(store.rows.length, 1);
    assert.deepEqual(calls.listInventoryForActor[0], {
      rememberedActorId: 'hero',
      componentSourceActorIds: ['a1', 'a2'],
    });
  });

  it('records the error message and keeps loadedOnce false when the fetch throws', async () => {
    const { services } = makeServices();
    services.listInventoryForActor = async () => {
      throw new Error('boom');
    };
    const store = createInventoryStore({ services });

    await store.load();
    flushSync();

    assert.equal(store.error, 'boom');
    assert.equal(store.loading, false);
    assert.equal(store.loadedOnce, false);
  });

  it('prefers the sibling craftingSources store for source ids', async () => {
    const craftingSources = { selectedSourceIds: ['x1', 'x2'] };
    const { services, calls } = makeServices({ craftingSources, sourceIds: ['ignored'] });
    const store = createInventoryStore({ services });

    await store.load();
    flushSync();

    assert.deepEqual(calls.listInventoryForActor[0].componentSourceActorIds, ['x1', 'x2']);
  });

  it('filters the visible list by search (case-insensitive) and resets the page', async () => {
    const listing = {
      rows: [row('c1', 'Iron Sword'), row('c2', 'Bronze Shield'), row('c3', 'Iron Dagger')],
      selectedActorId: 'hero',
    };
    const { services } = makeServices({ listing });
    const store = createInventoryStore({ services });
    await store.load();
    store.setPage(2);
    flushSync();

    store.setSearch('iron');
    flushSync();

    assert.equal(store.page, 0, 'search resets to the first page');
    assert.deepEqual(
      store.visibleItems.map((entry) => entry.componentId),
      ['c3', 'c1'],
      'sorted A→Z by name, filtered to matches'
    );
  });

  it('matches search against tags and carried essence names, not just the name', async () => {
    const listing = {
      rows: [
        row('c1', 'Liquid Death', { tags: ['nasty', 'potion'] }),
        row('c2', 'Ham', { essences: [{ id: 'bacon', name: 'Bacon', icon: null, quantity: 3 }] }),
        row('c3', 'Iron', {}),
      ],
      selectedActorId: 'hero',
    };
    const { services } = makeServices({ listing });
    const store = createInventoryStore({ services });
    await store.load();
    flushSync();

    const idsFor = (query) => {
      store.setSearch(query);
      flushSync();
      return store.visibleItems.map((entry) => entry.componentId).sort();
    };

    assert.deepEqual(idsFor('nasty'), ['c1'], 'matches a tag');
    assert.deepEqual(idsFor('bacon'), ['c2'], 'matches a carried essence name');
    assert.deepEqual(idsFor('bac'), ['c2'], 'partially matches a carried essence name');
    assert.deepEqual(idsFor('iron'), ['c3'], 'still matches the item name');
    assert.equal(store.filterCounts.all, 1, 'filter counts reflect the query too');
  });

  it('subsets rows by each filter pill', async () => {
    const listing = {
      rows: [
        row('c1', 'Iron'),
        row('c2', 'Ruby'),
        row('c3', 'Hammer', { isTool: true }),
        row('e1', 'Fire', { isEssenceSource: true }),
      ],
      selectedActorId: 'hero',
    };
    const { services } = makeServices({ listing });
    const store = createInventoryStore({ services });
    await store.load();
    flushSync();

    const idsFor = (pill) => {
      store.setFilter(pill);
      flushSync();
      return store.visibleItems.map((entry) => entry.componentId).sort();
    };

    assert.deepEqual(idsFor('components'), ['c1', 'c2', 'c3']);
    assert.deepEqual(idsFor('essences'), ['e1']);
    assert.deepEqual(idsFor('tools'), ['c3'], 'tools pill selects registered tools (isTool)');
    assert.equal(store.filterCounts.all, 4);
    assert.equal(store.filterCounts.tools, 1);

    // 'rare' is no longer a valid filter — setFilter rejects it back to 'all'.
    store.setFilter('rare');
    flushSync();
    assert.equal(store.filter, 'all', 'unknown/removed filter falls back to all');
  });

  it('defaults the page size to 25', async () => {
    const { services } = makeServices();
    const store = createInventoryStore({ services });
    assert.equal(store.pageSize, 25);
  });

  it('sorts by name, quantity (desc), and type', async () => {
    const listing = {
      rows: [
        row('c1', 'Beta', { totalQuantity: 5 }),
        row('c2', 'Alpha', { totalQuantity: 2 }),
        row('e1', 'Gamma', { isEssenceSource: true, totalQuantity: 9 }),
      ],
      selectedActorId: 'hero',
    };
    const { services } = makeServices({ listing });
    const store = createInventoryStore({ services });
    await store.load();
    flushSync();

    store.setSort('name');
    flushSync();
    assert.deepEqual(
      store.visibleItems.map((r) => r.name),
      ['Alpha', 'Beta', 'Gamma']
    );

    store.setSort('quantity');
    flushSync();
    assert.deepEqual(
      store.visibleItems.map((r) => r.name),
      ['Gamma', 'Beta', 'Alpha']
    );

    store.setSort('type');
    flushSync();
    // Components (Alpha, Beta) before the essence (Gamma), A→Z within each.
    assert.deepEqual(
      store.visibleItems.map((r) => r.name),
      ['Alpha', 'Beta', 'Gamma']
    );
  });

  it('paginates the visible items by page size', async () => {
    const listing = {
      rows: ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'].map((name, idx) => row(`c${idx}`, name)),
      selectedActorId: 'hero',
    };
    const { services } = makeServices({ listing });
    const store = createInventoryStore({ services });
    await store.load();

    store.setPageSize(2);
    flushSync();
    assert.deepEqual(
      store.pageItems.map((r) => r.name),
      ['Alpha', 'Bravo']
    );
    assert.equal(store.pageCount, 3);

    store.setPage(1);
    flushSync();
    assert.deepEqual(
      store.pageItems.map((r) => r.name),
      ['Charlie', 'Delta']
    );
  });

  it('selects by key and falls back to the first visible item', async () => {
    const listing = {
      rows: [row('c1', 'Iron'), row('c2', 'Steel')],
      selectedActorId: 'hero',
    };
    const { services } = makeServices({ listing });
    const store = createInventoryStore({ services });
    await store.load();
    flushSync();

    assert.equal(store.selectedItem.componentId, 'c1', 'defaults to first visible (A→Z)');

    store.select('c2');
    flushSync();
    assert.equal(store.selectedItem.componentId, 'c2');
  });

  it('returns a null selection when there are no rows', async () => {
    const { services } = makeServices({ listing: { rows: [], selectedActorId: 'hero' } });
    const store = createInventoryStore({ services });
    await store.load();
    flushSync();
    assert.equal(store.selectedItem, null);
  });

  it('classifies books under the recipeItems pill and excludes them from components', async () => {
    const listing = {
      selectedActorId: 'hero',
      rows: [
        row('sys:c1', 'Iron'),
        row('essence:sys:fire', 'Fire', { isEssenceSource: true }),
        row('recipeitem:sys:def-1', 'Spellbook', { isRecipeItem: true, recipes: [] }),
      ],
    };
    const { services } = makeServices({ listing });
    const store = createInventoryStore({ services });
    await store.load();
    flushSync();

    store.setFilter('recipeItems');
    flushSync();
    assert.deepEqual(
      store.visibleItems.map((r) => r.key),
      ['recipeitem:sys:def-1'],
      'the recipeItems pill lists only books'
    );

    store.setFilter('components');
    flushSync();
    assert.deepEqual(
      store.visibleItems.map((r) => r.key),
      ['sys:c1'],
      'the components pill excludes books and essences'
    );
    assert.equal(store.filterCounts.recipeItems, 1);
  });

  it('learn() calls the seam, reloads on success, and clears the busy id', async () => {
    const listing = {
      selectedActorId: 'hero',
      rows: [row('recipeitem:sys:def-1', 'Book', { isRecipeItem: true })],
    };
    const learnCalls = [];
    const { services, calls } = makeServices({ listing, actorId: 'hero', sourceIds: ['a2'] });
    services.learnRecipeFromInventory = async (opts) => {
      learnCalls.push(opts);
      return { success: true };
    };
    const store = createInventoryStore({ services });
    await store.load();
    flushSync();

    const before = calls.listInventoryForActor.length;
    const result = await store.learn('r-a');
    flushSync();

    assert.equal(result.success, true);
    assert.deepEqual(learnCalls[0], {
      actorId: 'hero',
      recipeId: 'r-a',
      componentSourceActorIds: ['a2'],
    });
    assert.equal(store.learningRecipeId, null, 'busy id cleared after the learn resolves');
    assert.equal(
      calls.listInventoryForActor.length,
      before + 1,
      'a successful learn quietly reloads the listing'
    );
  });

  it('learn() surfaces the failure message through notify and does not reload', async () => {
    const listing = { selectedActorId: 'hero', rows: [] };
    const notes = [];
    const { services, calls } = makeServices({ listing });
    services.notify = (message) => notes.push(message);
    services.learnRecipeFromInventory = async () => ({
      success: false,
      message: 'FABRICATE.Knowledge.LearnBudgetSpent',
    });
    const store = createInventoryStore({ services });
    await store.load();
    flushSync();

    const before = calls.listInventoryForActor.length;
    const result = await store.learn('r-a');
    flushSync();

    assert.equal(result.success, false);
    assert.deepEqual(notes, ['FABRICATE.Knowledge.LearnBudgetSpent']);
    assert.equal(calls.listInventoryForActor.length, before, 'a failed learn does not reload');
  });

  // --- Salvage (issue 675) ------------------------------------------------------
  //
  // `salvage()` has FOUR outcomes, not two. The one that is easy to miss is a
  // `success` carrying NULL results: a time-gated run that has STARTED and awarded
  // nothing. Treating `success` as "done" shows a success ribbon for a run that gave
  // the player nothing.

  function salvageRow(overrides = {}) {
    return row('sys:c1', 'Iron', {
      systemId: 'sys',
      componentId: 'c1',
      salvage: {
        enabled: true,
        mode: 'simple',
        checkUsable: false,
        misconfigured: false,
        allowPlayerResultReorder: true,
        results: [],
        routedOutcomes: [],
        stages: [],
        targetActorId: 'a2',
        ...overrides,
      },
    });
  }

  function salvageServices({ result, listing } = {}) {
    const notes = [];
    const calls = [];
    const { services } = makeServices({
      listing: listing ?? { selectedActorId: 'hero', rows: [salvageRow()] },
    });
    services.notify = (message) => notes.push(message);
    services.salvageComponent = async (opts) => {
      calls.push(opts);
      return typeof result === 'function' ? result(opts) : result;
    };
    return { services, notes, calls };
  }

  describe('inventoryStore - salvage', () => {
    it('passes an actorId (never a uuid) plus interactive:true through the facade seam', async () => {
      // The facade's `_resolveCraftingActor` is the ONLY ownership gate on the salvage
      // path - the engine has none - so a uuid here would bypass it entirely.
      const { services, calls } = salvageServices({
        result: { success: true, results: [{}], message: 'Salvaged Iron' },
      });
      const store = createInventoryStore({ services });
      await store.load();
      flushSync();

      await store.salvage('c1');
      flushSync();

      assert.equal(calls.length, 1);
      assert.deepEqual(calls[0], {
        actorId: 'a2',
        systemId: 'sys',
        componentId: 'c1',
        interactive: true,
      });
      assert.equal('actorUuid' in calls[0], false, 'no uuid is accepted from the UI');
    });

    it('AC7: threads NO result order into the options bag', async () => {
      // The engine captures the player's order onto the run record at start. Threading
      // one here would reintroduce the executing-user read the capture exists to prevent.
      const { services, calls } = salvageServices({ result: { success: true, results: [{}] } });
      const store = createInventoryStore({ services });
      await store.load();
      flushSync();
      await store.salvage('c1');
      flushSync();

      assert.deepEqual(Object.keys(calls[0]).sort(), [
        'actorId',
        'componentId',
        'interactive',
        'systemId',
      ]);
    });

    it('AC4: a cancelled prompt returns to the pre-roll state and calls NO notify', async () => {
      // "No error toast" is the substance of AC3/AC4: the player CHOSE to dismiss the
      // prompt, so a warning would be a lie about a mutation that never happened.
      const { services, notes } = salvageServices({
        result: { success: false, cancelled: true, results: null },
      });
      const store = createInventoryStore({ services });
      await store.load();
      flushSync();

      const result = await store.salvage('c1');
      flushSync();

      assert.equal(result.cancelled, true);
      assert.deepEqual(notes, [], 'a cancel is not an error');
      assert.equal(store.salvageResult, null, 'no ribbon, no outcome held');
      assert.equal(store.salvagingKey, null, 'the busy state is released');
    });

    it('AC9: a time-gated salvage (success with null results) shows a waiting state, no ribbon', async () => {
      const { services, notes } = salvageServices({
        result: {
          success: true,
          results: null,
          message: 'Salvage started for Iron (60s remaining)',
        },
      });
      const store = createInventoryStore({ services });
      await store.load();
      flushSync();

      await store.salvage('c1');
      flushSync();

      assert.equal(store.salvageResult.state, 'waiting');
      assert.equal(store.salvageResult.message, 'Salvage started for Iron (60s remaining)');
      assert.notEqual(store.salvageResult.state, 'success', 'a started run awarded nothing');
      assert.deepEqual(notes, [], 'a started run is not a failure');
    });

    it('a successful salvage holds the outcome and quietly reloads the listing', async () => {
      const { services, calls: _calls } = salvageServices({
        result: { success: true, results: [{}], message: 'Salvaged Iron' },
      });
      const { services: base, calls: listCalls } = makeServices({
        listing: { selectedActorId: 'hero', rows: [salvageRow()] },
      });
      base.salvageComponent = services.salvageComponent;
      base.notify = services.notify;
      const store = createInventoryStore({ services: base });
      await store.load();
      flushSync();

      const before = listCalls.listInventoryForActor.length;
      await store.salvage('c1');
      flushSync();

      assert.equal(store.salvageResult.state, 'success');
      assert.equal(
        listCalls.listInventoryForActor.length,
        before + 1,
        'the awarded materials must appear'
      );
    });

    it('a failed salvage surfaces its message through notify and holds no ribbon', async () => {
      const { services, notes } = salvageServices({
        result: {
          success: false,
          results: null,
          message: 'progressive salvage mode requires a configured salvage check roll formula',
        },
      });
      const store = createInventoryStore({ services });
      await store.load();
      flushSync();

      const result = await store.salvage('c1');
      flushSync();

      assert.equal(result.success, false);
      assert.deepEqual(notes, [
        'progressive salvage mode requires a configured salvage check roll formula',
      ]);
      assert.equal(store.salvageResult, null, 'no success ribbon on a GM-config failure');
    });

    it('refuses a double-submit while a salvage is in flight', async () => {
      let resolveCall;
      const { services, calls } = salvageServices({
        result: () => new Promise((resolve) => (resolveCall = resolve)),
      });
      const store = createInventoryStore({ services });
      await store.load();
      flushSync();

      const first = store.salvage('c1');
      flushSync();
      assert.equal(store.salvagingKey, 'c1');
      await store.salvage('c1');
      assert.equal(calls.length, 1, 'the second press is refused');

      resolveCall({ success: true, results: [{}] });
      await first;
      flushSync();
      assert.equal(store.salvagingKey, null);
    });

    // AC10 / decision 11. Salvaging the last copy DROPS the row from the listing, and
    // `selectedItem` would fall through to `visibleItems[0]` - rendering the success
    // ribbon against a completely different component. This is the common case (the
    // smoke fixture seeds a single copy), not an edge.
    it('AC10: holds the salvaged row selected after its last copy is consumed', async () => {
      const other = row('sys:c9', 'Aether', { systemId: 'sys', componentId: 'c9' });
      let listingRows = [salvageRow(), other];
      const notes = [];
      const services = {
        listInventoryForActor: async () => ({ selectedActorId: 'hero', rows: listingRows }),
        getSelectedCraftingActorId: () => 'hero',
        getCraftingComponentSourceIds: () => [],
        notify: (message) => notes.push(message),
        salvageComponent: async () => {
          // The engine consumed the only copy: the row leaves the listing.
          listingRows = [other];
          return { success: true, results: [{}], message: 'Salvaged Iron' };
        },
      };
      const store = createInventoryStore({ services });
      await store.load();
      flushSync();
      store.select('sys:c1');
      flushSync();

      await store.salvage('c1');
      flushSync();

      assert.equal(store.rows.length, 1, 'the salvaged row has left the listing');
      assert.equal(store.selectedItem.key, 'sys:c1', 'the ribbon stays on the SALVAGED component');
      assert.equal(store.salvageResult.state, 'success');

      // Selecting another item releases the hold.
      store.select('sys:c9');
      flushSync();
      assert.equal(store.selectedItem.key, 'sys:c9');
      assert.equal(store.salvageResult, null, 'the ribbon is dismissed with the selection');
    });

    it('resetSalvage() releases the held row and the ribbon ("Salvage again")', async () => {
      const { services } = salvageServices({ result: { success: true, results: [{}] } });
      const store = createInventoryStore({ services });
      await store.load();
      flushSync();
      store.select('sys:c1');
      await store.salvage('c1');
      flushSync();

      store.resetSalvage();
      flushSync();
      assert.equal(store.salvageResult, null);
    });
  });
});
