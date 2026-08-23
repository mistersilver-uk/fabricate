import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';

import { createSvelteModuleCompiler } from '../helpers/compile-svelte-module.js';
import {
  SYS_A,
  SYS_B,
  multiSystemCardRow,
  multiSystemProgressiveCardRow,
} from '../helpers/inventoryCollapseFixtures.js';

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
    // The store reconciles the player's stage order and recomputes cumulative
    // thresholds through these two leaves (issue 675). Both are import-free, so
    // copying them verbatim is enough for the compiled store's imports to resolve.
    compiler.copyPlain('src/utils/progressiveResultOrder.js');
    compiler.copyPlain('src/utils/progressiveStageThresholds.js');
    // And the fired-tense marker's closure (issue 1286):
    // progressiveStageComplications -> complicationPlan -> componentComplications.
    compiler.copyPlain('src/utils/progressiveStageComplications.js');
    compiler.copyPlain('src/utils/complicationPlan.js');
    compiler.copyPlain('src/utils/componentComplications.js');
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

      await store.salvage('sys', 'c1');
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
      await store.salvage('sys', 'c1');
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

      const result = await store.salvage('sys', 'c1');
      flushSync();

      assert.equal(result.cancelled, true);
      assert.deepEqual(notes, [], 'a cancel is not an error');
      assert.equal(store.salvageResult, null, 'no ribbon, no outcome held');
      assert.equal(store.salvagingKey, null, 'the busy state is released');
    });

    it('AC9: a time-gated salvage (waiting: true) shows a waiting state, no ribbon', async () => {
      const { services, notes } = salvageServices({
        result: {
          success: true,
          // Issue 859: the store reads the engine's explicit `waiting` flag now,
          // not `results == null` — see `salvage()`'s own docblock.
          waiting: true,
          results: null,
          message: 'Salvage started for Iron (60s remaining)',
        },
      });
      const store = createInventoryStore({ services });
      await store.load();
      flushSync();

      await store.salvage('sys', 'c1');
      flushSync();

      assert.equal(store.salvageResult.state, 'waiting');
      assert.equal(store.salvageResult.message, 'Salvage started for Iron (60s remaining)');
      assert.notEqual(store.salvageResult.state, 'success', 'a started run awarded nothing');
      assert.deepEqual(notes, [], 'a started run is not a failure');
    });

    it('a successful salvage holds the outcome and quietly reloads the listing', async () => {
      const { services, calls: _calls } = salvageServices({
        // Issue 675: the engine threads the rolled total top-level as `value`; the store
        // must carry it onto `salvageResult.rollValue` for the summary's roll phrase.
        result: { success: true, results: [{}], message: 'Salvaged Iron', value: 23 },
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
      await store.salvage('sys', 'c1');
      flushSync();

      assert.equal(store.salvageResult.state, 'success');
      assert.equal(store.salvageResult.rollValue, 23, 'the rolled total is held for the summary');
      assert.equal(
        listCalls.listInventoryForActor.length,
        before + 1,
        'the awarded materials must appear'
      );
    });

    it('a no-check salvage holds a null rollValue so the summary omits the roll phrase', async () => {
      // The engine returns `value: null` for a no-check "Guaranteed" salvage — nothing
      // was rolled. The store must keep it null, never coerce it to 0.
      const { services } = salvageServices({
        result: { success: true, results: [{}], message: 'Salvaged Iron', value: null },
      });
      const store = createInventoryStore({ services });
      await store.load();
      flushSync();

      await store.salvage('sys', 'c1');
      flushSync();

      assert.equal(store.salvageResult.state, 'success');
      assert.equal(store.salvageResult.rollValue, null, 'no roll happened — no roll phrase');
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

      const result = await store.salvage('sys', 'c1');
      flushSync();

      assert.equal(result.success, false);
      assert.deepEqual(notes, [
        'progressive salvage mode requires a configured salvage check roll formula',
      ]);
      assert.equal(store.salvageResult, null, 'no success ribbon on a GM-config failure');
    });

    it('refuses a double-submit while a salvage is in flight', async () => {
      let resolveCall;
      // Built up front, not inside the factory: `salvage()` awaits the order flush
      // before it ever calls the seam, so the factory has not run yet at the point the
      // second press is made.
      const inFlight = new Promise((resolve) => (resolveCall = resolve));
      const { services, calls } = salvageServices({ result: () => inFlight });
      const store = createInventoryStore({ services });
      await store.load();
      flushSync();

      const first = store.salvage('sys', 'c1');
      flushSync();
      // The busy state is claimed SYNCHRONOUSLY, ahead of the awaited order flush, so a
      // second press inside that window is refused before it can reach the engine.
      assert.equal(store.salvagingKey, 'c1');
      const second = await store.salvage('sys', 'c1');
      assert.deepEqual(second, { success: false }, 'the second press is refused');

      resolveCall({ success: true, results: [{}] });
      await first;
      flushSync();
      assert.equal(calls.length, 1, 'exactly one run reached the engine');
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

      await store.salvage('sys', 'c1');
      flushSync();

      assert.equal(store.rows.length, 1, 'the salvaged row has left the listing');
      assert.equal(store.selectedItem.key, 'sys:c1', 'the ribbon stays on the SALVAGED component');
      assert.equal(store.salvageResult.state, 'success');
      // Defect 3 (issue 675): the held snapshot carries the TRUE post-salvage remaining
      // (0 — the last copy was consumed), never the stale pre-roll count of 1.
      assert.equal(
        store.selectedItem.totalQuantity,
        0,
        'the held row reads the honest depleted remaining, not the pre-roll 1'
      );

      // Selecting another item releases the hold.
      store.select('sys:c9');
      flushSync();
      assert.equal(store.selectedItem.key, 'sys:c9');
      assert.equal(store.salvageResult, null, 'the ribbon is dismissed with the selection');
    });

    // Defect 3 (issue 675): when copies REMAIN after the salvage, the live row is still
    // in the listing (with a decremented count) and `selectedItem` prefers it — the
    // header shows the real remaining, and "Salvage again" stays available upstream.
    it('reads the decremented live count when copies remain after salvage', async () => {
      const rowWithStock = (totalQuantity) => ({ ...salvageRow(), totalQuantity });
      let listingRows = [rowWithStock(3)];
      const services = {
        listInventoryForActor: async () => ({ selectedActorId: 'hero', rows: listingRows }),
        getSelectedCraftingActorId: () => 'hero',
        getCraftingComponentSourceIds: () => [],
        notify: () => {},
        salvageComponent: async () => {
          // One copy consumed; two remain, so the row stays in the listing.
          listingRows = [rowWithStock(2)];
          return { success: true, results: [{}], message: 'Salvaged Iron' };
        },
      };
      const store = createInventoryStore({ services });
      await store.load();
      flushSync();
      store.select('sys:c1');
      flushSync();

      await store.salvage('sys', 'c1');
      flushSync();

      assert.equal(store.rows.length, 1, 'the row is still in the listing');
      assert.equal(store.selectedItem.key, 'sys:c1');
      assert.equal(
        store.selectedItem.totalQuantity,
        2,
        'the live decremented count is shown, never the stale 3'
      );
      assert.equal(store.salvageResult.state, 'success');
    });

    it('resetSalvage() releases the held row and the ribbon ("Salvage again")', async () => {
      const { services } = salvageServices({ result: { success: true, results: [{}] } });
      const store = createInventoryStore({ services });
      await store.load();
      flushSync();
      store.select('sys:c1');
      await store.salvage('sys', 'c1');
      flushSync();

      store.resetSalvage();
      flushSync();
      assert.equal(store.salvageResult, null);
    });
  });

  // --- Progressive salvage reorder (issue 675) ----------------------------------
  //
  // The first consumer of `Component.salvage.allowPlayerResultReorder`. The store's
  // only job is writing the STANDING PREFERENCE (`salvage:<componentId>`); the engine
  // captures it onto the run record at start, and there is deliberately no settings
  // fallback there.

  function progressiveRow() {
    return row('sys:c1', 'Iron', {
      systemId: 'sys',
      componentId: 'c1',
      salvage: {
        enabled: true,
        mode: 'progressive',
        checkUsable: true,
        misconfigured: false,
        allowPlayerResultReorder: true,
        awardMode: 'equal',
        results: [],
        routedOutcomes: [],
        stages: [
          { id: 's1', componentId: 'c2', name: 'Shard', difficulty: 5, threshold: 5 },
          { id: 's2', componentId: 'c3', name: 'Slag', difficulty: 3, threshold: 8 },
        ],
        targetActorId: 'a1',
      },
    });
  }

  function orderServices({ setOrder, orders = {}, salvageResult } = {}) {
    const log = [];
    const services = {
      listInventoryForActor: async () => ({ selectedActorId: 'hero', rows: [progressiveRow()] }),
      getSelectedCraftingActorId: () => 'hero',
      getCraftingComponentSourceIds: () => [],
      getProgressiveResultOrder: () => orders,
      progressiveOrderRevertMessage: () => 'Your order could not be saved and was restored.',
      notify: () => {},
      setProgressiveResultOrder: async (key, order) => {
        log.push(['setProgressiveResultOrder', key, order]);
        if (setOrder) return setOrder(key, order);
        return undefined;
      },
      salvageComponent: async (opts) => {
        log.push(['salvageComponent', opts.componentId]);
        return salvageResult ?? { success: true, results: [{ name: 'Shard' }] };
      },
    };
    return { services, log };
  }

  async function loadedProgressiveStore(overrides) {
    const { services, log } = orderServices(overrides);
    const store = createInventoryStore({ services });
    await store.load();
    flushSync();
    store.select('sys:c1');
    flushSync();
    return { store, log, services };
  }

  describe('inventoryStore - resetting the progressive salvage order', () => {
    it('reports a custom order only when the rendered order actually differs', async () => {
      const { store } = await loadedProgressiveStore();
      assert.equal(store.salvageOrderIsCustom, false, 'nothing has moved yet');

      store.reorderSalvageStage(0, 1, '');
      flushSync();
      assert.equal(store.salvageOrderIsCustom, true);

      // Moved back. A stored order still EXISTS under this key, so a presence check
      // would say "custom" and offer a Reset that does nothing when pressed.
      store.reorderSalvageStage(1, 0, '');
      flushSync();
      assert.equal(
        store.salvageOrderIsCustom,
        false,
        "the order is the GM's again, whatever is stored under the key"
      );
    });

    it("resets by persisting NO preference, not by pinning today's authored ids", async () => {
      const { store, log } = await loadedProgressiveStore();
      store.reorderSalvageStage(0, 1, '');
      flushSync();
      await store.flushSalvageOrder();
      flushSync();
      log.length = 0;

      store.resetSalvageOrder("Order reset to your GM's.");
      flushSync();

      assert.deepEqual(
        store.orderedSalvageStages.map((s) => s.id),
        ['s1', 's2'],
        "the GM's authored order is restored, optimistically"
      );
      assert.equal(store.salvageOrderIsCustom, false);
      assert.equal(store.salvageOrderAnnouncement, "Order reset to your GM's.");
      assert.deepEqual(log, [], 'and the write is debounced like every other order write');

      assert.deepEqual(await store.flushSalvageOrder(), { ok: true });
      assert.deepEqual(
        log,
        [['setProgressiveResultOrder', 'salvage:sys:c1', []]],
        'EMPTY, not [s1, s2]: "no preference" follows a later GM re-author, whereas the ' +
          'authored ids would pin this sequence and silently outlive it'
      );
    });

    it('restores the thresholds the authored order carries', async () => {
      const { store } = await loadedProgressiveStore();
      store.reorderSalvageStage(0, 1, '');
      flushSync();
      assert.deepEqual(
        store.orderedSalvageStages.map((s) => [s.id, s.threshold]),
        [
          ['s2', 3],
          ['s1', 8],
        ],
        'the reordered list recomputes its cumulative thresholds'
      );

      store.resetSalvageOrder('');
      flushSync();
      assert.deepEqual(
        store.orderedSalvageStages.map((s) => [s.id, s.threshold]),
        [
          ['s1', 5],
          ['s2', 8],
        ],
        'and reset puts the authored ones back — a stale threshold would have the top ' +
          'row claiming a higher bar than the row beneath it'
      );
    });

    it('refuses to reset an order the GM pinned', async () => {
      const { services } = orderServices();
      const row = progressiveRow();
      row.salvage.allowPlayerResultReorder = false;
      services.listInventoryForActor = async () => ({ selectedActorId: 'hero', rows: [row] });
      const store = createInventoryStore({ services });
      await store.load();
      flushSync();
      store.select('sys:c1');
      flushSync();

      store.resetSalvageOrder('nope');
      flushSync();
      assert.equal(store.salvageOrderAnnouncement, '', 'there is no player order to reset');
      assert.equal(store.salvageOrderIsCustom, false);
    });
  });

  describe('inventoryStore - progressive salvage order', () => {
    it('reorders under the salvage: key, storing IDS (not indices) so a GM edit survives', async () => {
      const { store, log } = await loadedProgressiveStore();

      store.reorderSalvageStage(0, 1, 'Shard moved to position 2 of 2');
      flushSync();

      assert.deepEqual(
        store.orderedSalvageStages.map((s) => s.id),
        ['s2', 's1'],
        'the move is optimistic - it shows immediately'
      );
      assert.equal(store.salvageOrderAnnouncement, 'Shard moved to position 2 of 2');
      assert.deepEqual(log, [], 'the write is debounced, not issued per gesture');

      const flush = await store.flushSalvageOrder();
      flushSync();
      assert.deepEqual(flush, { ok: true });
      assert.deepEqual(log, [['setProgressiveResultOrder', 'salvage:sys:c1', ['s2', 's1']]]);
    });

    // The threshold is CUMULATIVE - a property of a stage's POSITION, not of the stage.
    // `applyPlayerResultOrder` returns elements ===-identical to its inputs, so a carried
    // threshold would have the top row claiming a HIGHER bar than the row beneath it.
    it('RECOMPUTES thresholds for the new order rather than carrying them', async () => {
      const { store } = await loadedProgressiveStore();
      assert.deepEqual(
        store.orderedSalvageStages.map((s) => [s.id, s.threshold]),
        [
          ['s1', 5],
          ['s2', 8],
        ],
        'authored order: 5 then 5+3'
      );

      store.reorderSalvageStage(0, 1, '');
      flushSync();

      assert.deepEqual(
        store.orderedSalvageStages.map((s) => [s.id, s.threshold]),
        [
          ['s2', 3],
          ['s1', 8],
        ],
        'moved up, Slag is now reached at its own cost - NOT its authored-position 8'
      );
    });

    it('refuses to reorder when the GM pinned the order', async () => {
      const { services } = orderServices();
      services.listInventoryForActor = async () => {
        const target = progressiveRow();
        target.salvage.allowPlayerResultReorder = false;
        return { selectedActorId: 'hero', rows: [target] };
      };
      const store = createInventoryStore({ services });
      await store.load();
      flushSync();
      store.select('sys:c1');

      store.reorderSalvageStage(0, 1, 'nope');
      flushSync();

      assert.deepEqual(
        store.orderedSalvageStages.map((s) => s.id),
        ['s1', 's2'],
        'the authored order stands'
      );
    });

    // AC5. Stated as an ORDERED CALL LOG against a DEFERRED mock because "await the
    // flush" is not pinnable against the crafting store's shape: its
    // `commitProgressiveOrder` swallows rejections, so its flush resolves successfully
    // even when the write failed and the order was silently reverted.
    it('AC5: the order write is SETTLED before salvageComponent is invoked', async () => {
      let releaseWrite;
      const deferred = new Promise((resolve) => (releaseWrite = resolve));
      const { store, log } = await loadedProgressiveStore({ setOrder: () => deferred });

      store.reorderSalvageStage(0, 1, '');
      flushSync();

      // Press Salvage INSIDE the debounce window: without the flush, the engine would
      // capture the stale order.
      const attempt = store.salvage('sys', 'c1');
      await Promise.resolve();
      assert.deepEqual(
        log.map((entry) => entry[0]),
        ['setProgressiveResultOrder'],
        'the write is issued first, and the run has NOT started while it is in flight'
      );

      releaseWrite();
      await attempt;
      flushSync();

      assert.deepEqual(
        log.map((entry) => entry[0]),
        ['setProgressiveResultOrder', 'salvageComponent'],
        'and only then does the run start'
      );
      assert.deepEqual(log[0][2], ['s2', 's1'], 'the order captured is the CURRENT one');
    });

    // AC6 / decision 9. The write is optimistic, so by the time a rejection returns the
    // row has already moved and the live region has already announced it. Proceeding
    // would consume the component against an order the player can see was undone.
    it('AC6: a REJECTED order write reverts, announces, and ABORTS the salvage', async () => {
      const { store, log } = await loadedProgressiveStore({
        setOrder: () => Promise.reject(new Error('user setting write failed')),
      });

      store.reorderSalvageStage(0, 1, 'Shard moved to position 2 of 2');
      flushSync();

      const result = await store.salvage('sys', 'c1');
      flushSync();

      assert.equal(result.success, false, 'the salvage is aborted');
      assert.deepEqual(
        log.map((entry) => entry[0]),
        ['setProgressiveResultOrder'],
        'salvageComponent is NEVER invoked - nothing is consumed'
      );
      assert.deepEqual(
        store.orderedSalvageStages.map((s) => s.id),
        ['s1', 's2'],
        'the order reverts to the last persisted one'
      );
      assert.equal(
        store.salvageOrderAnnouncement,
        'Your order could not be saved and was restored.',
        'the revert is announced through the SAME live region - a toast is not enough for a keyboard user'
      );
    });

    // The whole reason the failure is a RETURN STATUS and not a rethrow: this flush is
    // wired into `SvelteFabricateApp._flushPendingOrderWrite`, whose `void` + sync-only
    // try/catch would turn a rejection into an unhandled rejection at window teardown.
    it('flushSalvageOrder never REJECTS - it reports {ok:false}', async () => {
      const { store } = await loadedProgressiveStore({
        setOrder: () => Promise.reject(new Error('user setting write failed')),
      });
      store.reorderSalvageStage(0, 1, '');
      flushSync();

      const flush = await store.flushSalvageOrder();
      assert.deepEqual(flush, { ok: false });
    });

    it('flushSalvageOrder is a no-op when nothing is pending, so a double call writes once', async () => {
      const { store, log } = await loadedProgressiveStore();
      assert.deepEqual(await store.flushSalvageOrder(), { ok: true });
      assert.deepEqual(log, []);

      store.reorderSalvageStage(0, 1, '');
      flushSync();
      await store.flushSalvageOrder();
      await store.flushSalvageOrder();
      assert.equal(log.length, 1, 'close() and _onClose() both flushing must write once');
    });

    it('seeds the stored order from settings on load', async () => {
      const { store } = await loadedProgressiveStore({ orders: { 'salvage:sys:c1': ['s2', 's1'] } });
      assert.deepEqual(
        store.orderedSalvageStages.map((s) => s.id),
        ['s2', 's1'],
        'the standing preference is honoured on first render'
      );
    });
  });

  // --- Selected-participation salvage routing (issue 766) ------------------------
  describe('inventoryStore - multi-system participation routing', () => {
    function multiSystemServices() {
      const calls = [];
      const { services } = makeServices({
        listing: { selectedActorId: 'hero', rows: [multiSystemCardRow({ total: 2, actorId: 'a1' })] },
      });
      services.notify = () => {};
      services.salvageComponent = async (opts) => {
        calls.push(opts);
        return { success: true, results: [{ name: 'Recovered' }] };
      };
      return { services, calls };
    }

    it('salvage routes to the SELECTED participation, explicitly not the primary', async () => {
      const { services, calls } = multiSystemServices();
      const store = createInventoryStore({ services });
      await store.load();
      store.select(`${SYS_A}:cA`);
      store.selectSystem(SYS_B);
      flushSync();

      // The view hands the store the selected participation's ids.
      await store.salvage(store.selectedParticipation.systemId, store.selectedParticipation.componentId);
      flushSync();

      assert.equal(calls.length, 1);
      assert.equal(calls[0].systemId, SYS_B, 'System B, the selected participation');
      assert.equal(calls[0].componentId, 'cB');
      assert.notEqual(calls[0].systemId, SYS_A, 'explicitly NOT the primary (System A)');
      assert.notEqual(calls[0].componentId, 'cA');
      // targetActorId scoped to the selected participation's own documents.
      assert.equal(calls[0].actorId, 'a1');
    });

    it('the progressive order commit key is distinct per system for a SHARED component id', async () => {
      // Two participations whose component ids COLLIDE ('shared') must still commit to
      // DISTINCT keys — the pre-existing latent collision the collapse surfaces (component
      // ids are not globally unique). Routed through the store's OWN `salvageOrderId` /
      // `selectedParticipation` derivation (reorder → flush → observe the committed key),
      // NOT pre-composed ids handed to `progressiveOrderKey` — so dropping the `systemId`
      // term from `salvageOrderId` collapses BOTH commits onto `salvage:shared` and flips
      // this test, which the neighbouring flush/reorder tests would not catch.
      const committed = [];
      const { services } = makeServices({
        listing: {
          selectedActorId: 'hero',
          rows: [multiSystemProgressiveCardRow({ actorId: 'a1' })],
        },
      });
      services.notify = () => {};
      services.getProgressiveResultOrder = () => ({});
      services.setProgressiveResultOrder = async (key) => {
        committed.push(key);
      };
      const store = createInventoryStore({ services });
      await store.load();

      // System A (the primary): reorder a stage and flush; observe the commit key.
      store.select(`${SYS_A}:shared`);
      flushSync();
      store.reorderSalvageStage(0, 1, '');
      flushSync();
      await store.flushSalvageOrder();

      // System B (same component id): reorder and flush again.
      store.selectSystem(SYS_B);
      flushSync();
      store.reorderSalvageStage(0, 1, '');
      flushSync();
      await store.flushSalvageOrder();

      assert.deepEqual(committed, [`salvage:${SYS_A}:shared`, `salvage:${SYS_B}:shared`]);
      assert.notEqual(committed[0], committed[1], 'the shared component id does not collide the keys');
    });

    it('selectedParticipation defaults to the primary and follows selectSystem', async () => {
      const { services } = multiSystemServices();
      const store = createInventoryStore({ services });
      await store.load();
      store.select(`${SYS_A}:cA`);
      flushSync();
      assert.equal(store.selectedParticipation.systemId, SYS_A, 'defaults to the primary');

      store.selectSystem(SYS_B);
      flushSync();
      assert.equal(store.selectedParticipation.systemId, SYS_B);

      // Reselecting the card resets to the primary.
      store.select(`${SYS_A}:cA`);
      flushSync();
      assert.equal(store.selectedParticipation.systemId, SYS_A);
    });
  });

  // =========================================================================
  // Bulk salvage / bulk destroy (issue 859).
  // =========================================================================

  /** A salvage projection with every field the bulk partition and preview read. */
  function salvageProjection(overrides = {}) {
    return {
      enabled: true,
      mode: 'simple',
      checkUsable: false,
      misconfiguredReason: null,
      toolsAvailable: true,
      toolStates: [],
      results: [],
      routedOutcomes: [],
      routedType: null,
      stages: [],
      targetActorId: 'a1',
      ...overrides,
    };
  }

  /** A single-system inventory row whose top-level identity IS its participation. */
  function bulkRow(componentId, name, salvage = salvageProjection(), extra = {}) {
    return row(`sys:${componentId}`, name, {
      componentId,
      systemId: 'sys',
      img: `icons/${componentId}.webp`,
      isRecipeItem: false,
      broken: false,
      totalQuantity: 3,
      sources: [{ actorId: 'a1', actorName: 'Akra', quantity: 3 }],
      salvage,
      ...extra,
    });
  }

  /**
   * A reorderable PROGRESSIVE row — the only kind of card that can carry a pending stage
   * order into a bulk run. Stage ids are derived from `componentId`, so two of these
   * never collide.
   *
   * ONE definition, not one per describe: three tests drive this exact shape, and the
   * copies were a normalized self-duplication Sonar counts.
   */
  function progressiveBulkRow(componentId, name) {
    return bulkRow(
      componentId,
      name,
      salvageProjection({
        mode: 'progressive',
        checkUsable: true,
        allowPlayerResultReorder: true,
        stages: [
          {
            id: `${componentId}-s1`,
            componentId: 'x',
            name: 'Shard',
            difficulty: 5,
            threshold: 5,
          },
          {
            id: `${componentId}-s2`,
            componentId: 'y',
            name: 'Slag',
            difficulty: 3,
            threshold: 8,
          },
        ],
      })
    );
  }

  /**
   * A store loaded with `rows`, plus a recording services object covering the four
   * bulk seams. `reporter` is a FUNCTION carrying a `dismiss` — the shape
   * `createProgressReporter` returns and `bulkSalvage`'s `finally` calls both halves of.
   */
  function bulkServices(rows, overrides = {}) {
    const log = [];
    const listings = Array.isArray(overrides.listings) ? [...overrides.listings] : null;
    const reporter = (update) => log.push(['progress', update]);
    reporter.dismiss = () => log.push(['dismiss']);
    /**
     * Emit the INTERMEDIATE ticks the real services report, so the store's own
     * `onProgress` callback body runs. A fake that accepts `args` and never calls
     * `args.onProgress` leaves that body dead: only the terminal `bulkProgress === null`
     * is then observable, and a store that had stopped updating the panel counter or the
     * toast fraction mid-run would look identical.
     */
    const emitProgress = (args) => {
      for (const tick of overrides.progressTicks ?? []) {
        // A bare number ticks against the queue it was handed; a `[current, total]` pair
        // reports a DIFFERENT denominator, which is what the facade really does when its
        // owner gate refused a row.
        const [current, total] = Array.isArray(tick) ? tick : [tick, args.targets.length];
        args?.onProgress?.(current, total);
      }
    };
    const services = {
      listInventoryForActor: async () => {
        log.push(['load']);
        const next = listings?.length ? listings.shift() : rows;
        return { selectedActorId: 'hero', rows: next };
      },
      getSelectedCraftingActorId: () => 'hero',
      getCraftingComponentSourceIds: () => [],
      getProgressiveResultOrder: () => overrides.orders ?? {},
      progressiveOrderRevertMessage: () => 'reverted',
      notify: () => {},
      createProgressReporter: () => {
        log.push(['createProgressReporter']);
        return reporter;
      },
      setProgressiveResultOrder: async (key, order) => {
        log.push(['setProgressiveResultOrder', key, order]);
        return overrides.setOrder?.(key, order);
      },
      confirmDialog: async (prompt) => {
        log.push(['confirmDialog', prompt]);
        // A caller-held gate, so a test can act WHILE the modal stands — the window in
        // which the listing can reload out from under the set the player is agreeing to.
        if (overrides.confirmGate) await overrides.confirmGate;
        // NOT `?? true`: `null` and `undefined` are two of the falsy values under test.
        return 'confirmed' in overrides ? overrides.confirmed : true;
      },
      salvageComponents: async (args) => {
        log.push(['salvageComponents', args]);
        emitProgress(args);
        // A caller-held gate, so a test can observe the store MID-RUN. Without it the
        // whole run resolves inside the first microtask turn and `bulkRunning` is never
        // observably true.
        if (overrides.salvageGate) await overrides.salvageGate;
        if (overrides.salvageThrows) throw new Error('the engine blew up');
        return overrides.salvageResult ?? { cancelled: false, items: [], counts: {}, posted: true };
      },
      destroyComponents: async (args) => {
        log.push(['destroyComponents', args]);
        emitProgress(args);
        if (overrides.destroyThrows) throw new Error('the delete blew up');
        return overrides.destroyResult ?? { items: [], unitsDeleted: 0, documentsDeleted: 0 };
      },
    };
    return { services, log, reporter };
  }

  async function loadedBulkStore(rows, overrides = {}) {
    const { services, log } = bulkServices(rows, overrides);
    const store = createInventoryStore({ services });
    await store.load();
    flushSync();
    return { store, log, services };
  }

  /**
   * Yield until the store is observably mid-run, ASSERTING that it got there.
   *
   * `bulkSalvage` sets `bulkRunning` only after awaiting the order flush, so a test that
   * looked at the store immediately after calling it would be inspecting a store that had
   * not started — and would pass whatever the suppression did.
   */
  async function waitForBulkRunning(store) {
    for (let attempt = 0; attempt < 10 && !store.bulkRunning; attempt += 1) {
      await Promise.resolve();
    }
    assert.equal(store.bulkRunning, true, 'the run is observably in flight');
  }

  describe('inventoryStore - bulk selection', () => {
    it('promotes the inspected card on the FIRST shift-click', async () => {
      // Acceptance 1. The first shift-click on a second card enters bulk with BOTH
      // selected, because the player was already looking at the first one.
      const { store } = await loadedBulkStore([bulkRow('c1', 'Iron'), bulkRow('c2', 'Bronze')]);
      store.select('sys:c1');
      flushSync();

      store.toggleBulkSelection('sys:c2');
      flushSync();

      assert.deepEqual(store.bulkSelectedKeys, ['sys:c1', 'sys:c2']);
      assert.equal(store.bulkActive, true);
    });

    it('shift-clicking the ALREADY-inspected card first selects exactly ONE', async () => {
      // The guard a naive promotion gets wrong: promoting unconditionally would select
      // the same card twice, and the panel would show a two-row queue for one item.
      const { store } = await loadedBulkStore([bulkRow('c1', 'Iron'), bulkRow('c2', 'Bronze')]);
      store.select('sys:c1');
      flushSync();

      store.toggleBulkSelection('sys:c1');
      flushSync();

      assert.deepEqual(store.bulkSelectedKeys, ['sys:c1']);
      assert.equal(store.bulkCounts.selected, 1);
    });

    it('promotes nothing when no card is inspected', async () => {
      const { store } = await loadedBulkStore([bulkRow('c1', 'Iron'), bulkRow('c2', 'Bronze')]);
      store.toggleBulkSelection('sys:c2');
      flushSync();
      assert.deepEqual(store.bulkSelectedKeys, ['sys:c2']);
    });

    it('toggles a selected card back out', async () => {
      const { store } = await loadedBulkStore([bulkRow('c1', 'Iron'), bulkRow('c2', 'Bronze')]);
      store.toggleBulkSelection('sys:c1');
      store.toggleBulkSelection('sys:c2');
      flushSync();
      store.toggleBulkSelection('sys:c1');
      flushSync();

      assert.deepEqual(store.bulkSelectedKeys, ['sys:c2']);
    });

    it('select(key) clears the whole selection — a plain click leaves bulk', async () => {
      const { store } = await loadedBulkStore([bulkRow('c1', 'Iron'), bulkRow('c2', 'Bronze')]);
      store.toggleBulkSelection('sys:c1');
      store.toggleBulkSelection('sys:c2');
      flushSync();

      store.select('sys:c2');
      flushSync();

      assert.deepEqual(store.bulkSelectedKeys, []);
      assert.equal(store.bulkActive, false);
      assert.equal(store.selectedKey, 'sys:c2', 'and the clicked card is inspected');
    });

    it('refuses the 26th selection, and reports WHY rather than failing silently', async () => {
      // The store holds no i18n (the `onResetSalvageOrder` precedent), so the refusal is
      // a plain signal the view localizes and hands to `services.notify`.
      const rows = Array.from({ length: 30 }, (unused, index) =>
        bulkRow(`c${index}`, `Item ${index}`)
      );
      const { store } = await loadedBulkStore(rows);

      for (let index = 0; index < 25; index += 1) {
        assert.deepEqual(
          store.toggleBulkSelection(`sys:c${index}`),
          { refused: false },
          `selection ${index + 1} is accepted`
        );
      }
      flushSync();
      assert.equal(store.bulkSelectedKeys.length, 25);
      assert.equal(
        store.bulkCounts.atMax,
        true,
        'the cap is ANNOUNCED on the click that reaches it'
      );

      assert.deepEqual(store.toggleBulkSelection('sys:c25'), {
        refused: true,
        reason: 'bulkLimit',
      });
      flushSync();
      assert.equal(store.bulkSelectedKeys.length, 25, 'and nothing was added');
    });

    it('still lets a refused player DESELECT at the cap', async () => {
      const rows = Array.from({ length: 26 }, (unused, index) =>
        bulkRow(`c${index}`, `Item ${index}`)
      );
      const { store } = await loadedBulkStore(rows);
      for (let index = 0; index < 25; index += 1) store.toggleBulkSelection(`sys:c${index}`);
      flushSync();

      assert.deepEqual(store.toggleBulkSelection('sys:c0'), { refused: false });
      flushSync();
      assert.equal(store.bulkSelectedKeys.length, 24);
    });

    it('the store literal MATCHES the shared BULK_MAX_ITEMS it duplicates', async () => {
      // The store declares its own `BULK_MAX_ITEMS` rather than importing the service's:
      // importing pulls the bulk chat-card builder, `componentStacking.js` and
      // `itemStackQuantity.js` into this harness's module graph for the sake of one
      // integer. A hand-maintained mirror rots silently, so it is pinned against the
      // real export — the only way a divergence can be caught at all.
      const { readFileSync } = await import('node:fs');
      const { resolve } = await import('node:path');
      const { BULK_MAX_ITEMS } = await import('../../src/systems/BulkSalvageService.js');
      const storeSource = readFileSync(
        resolve(import.meta.dirname, '../../src/ui/svelte/stores/inventoryStore.svelte.js'),
        'utf8'
      );
      assert.ok(
        storeSource.includes(`const BULK_MAX_ITEMS = ${BULK_MAX_ITEMS};`),
        `the store must declare ${BULK_MAX_ITEMS}, matching BulkSalvageService`
      );
    });
  });

  describe('inventoryStore - the bulk report is invalidated by every selection change', () => {
    /** Run a bulk salvage so a report exists, then hand the store back. */
    async function storeWithReport() {
      const rows = [bulkRow('c1', 'Iron'), bulkRow('c2', 'Bronze')];
      const { store } = await loadedBulkStore(rows, {
        salvageResult: {
          cancelled: false,
          items: [{ outcome: 'succeeded' }, { outcome: 'succeeded' }],
          counts: { total: 2, succeeded: 2 },
          posted: true,
        },
      });
      store.toggleBulkSelection('sys:c1');
      store.toggleBulkSelection('sys:c2');
      flushSync();
      await store.bulkSalvage();
      flushSync();
      assert.ok(store.bulkReport, 'the fixture produced a report');
      return store;
    }

    const MUTATIONS = [
      { label: 'toggleBulkSelection', apply: (store) => store.toggleBulkSelection('sys:c1') },
      {
        label: 'removeFromBulkSelection',
        apply: (store) => store.removeFromBulkSelection('sys:c1'),
      },
      { label: 'clearBulkSelection', apply: (store) => store.clearBulkSelection() },
      { label: 'select', apply: (store) => store.select('sys:c1') },
    ];

    for (const mutation of MUTATIONS) {
      it(`${mutation.label} drops the standing report`, async () => {
        // A report for a set the selection no longer describes is a lie about what just
        // happened, and the panel would render it beside the new queue.
        const store = await storeWithReport();
        mutation.apply(store);
        flushSync();
        assert.equal(store.bulkReport, null);
      });
    }
  });

  describe('inventoryStore - the blocked-reason vocabulary, in first-match order', () => {
    const BLOCKED_CASES = [
      {
        reason: 'essence',
        row: () => bulkRow('c1', 'Fire', salvageProjection(), { isEssenceSource: true }),
      },
      {
        reason: 'recipeItem',
        row: () => bulkRow('c1', 'Tome', salvageProjection(), { isRecipeItem: true }),
      },
      {
        reason: 'salvageDisabled',
        row: () => bulkRow('c1', 'Iron', salvageProjection({ enabled: false })),
      },
      { reason: 'salvageDisabled', row: () => bulkRow('c1', 'Iron', null) },
      {
        reason: 'simpleMultiGroup',
        row: () =>
          bulkRow('c1', 'Iron', salvageProjection({ misconfiguredReason: 'simpleMultiGroup' })),
      },
      {
        reason: 'routedNoFormula',
        row: () =>
          bulkRow('c1', 'Iron', salvageProjection({ misconfiguredReason: 'routedNoFormula' })),
      },
      {
        reason: 'progressiveNoFormula',
        row: () =>
          bulkRow('c1', 'Iron', salvageProjection({ misconfiguredReason: 'progressiveNoFormula' })),
      },
      {
        reason: 'toolsUnavailable',
        row: () =>
          bulkRow(
            'c1',
            'Iron',
            salvageProjection({
              toolsAvailable: false,
              toolStates: [
                { name: 'Hammer', available: false },
                { name: 'Tongs', available: true },
                { name: 'Anvil', available: false },
              ],
            })
          ),
      },
      {
        reason: 'depleted',
        row: () => bulkRow('c1', 'Iron', salvageProjection(), { totalQuantity: 0 }),
      },
    ];

    for (const testCase of BLOCKED_CASES) {
      it(`blocks with ${testCase.reason}`, async () => {
        const { store } = await loadedBulkStore([testCase.row()]);
        store.toggleBulkSelection('sys:c1');
        flushSync();

        assert.equal(store.bulkSalvageable.length, 0);
        assert.equal(store.bulkBlocked.length, 1);
        assert.equal(store.bulkBlocked[0].blockedReason, testCase.reason);
        assert.equal(store.bulkCounts.blocked, 1);
      });
    }

    it('names the MISSING tools, and only those, behind toolsUnavailable', async () => {
      const { store } = await loadedBulkStore([BLOCKED_CASES[7].row()]);
      store.toggleBulkSelection('sys:c1');
      flushSync();
      assert.deepEqual(store.bulkBlocked[0].missingTools, ['Hammer', 'Anvil']);
    });

    it('a BROKEN but salvageable row stays in the QUEUE', async () => {
      // Divergence 1 / acceptance 3. Brokenness is about USABILITY, not salvageability,
      // and Fabricate has no repair action to point a blocked player at — so blocking
      // here would refuse something Fabricate permits and name a remedy it does not have.
      const { store } = await loadedBulkStore([
        bulkRow('c1', 'Cracked Hammer', salvageProjection(), { broken: true }),
      ]);
      store.toggleBulkSelection('sys:c1');
      flushSync();

      assert.equal(store.bulkBlocked.length, 0, 'broken is NOT a blocked reason');
      assert.equal(store.bulkSalvageable.length, 1);
      assert.equal(store.bulkSalvageable[0].broken, true, 'but the queue row still says so');
    });

    it('partitions a mixed selection, name-sorted within each half', async () => {
      // Acceptance 2, and the ordering the run and the report both inherit.
      const { store } = await loadedBulkStore([
        bulkRow('c1', 'Zinc'),
        bulkRow('c2', 'Ash'),
        bulkRow('c3', 'Yew', salvageProjection({ enabled: false })),
        bulkRow('c4', 'Bark', salvageProjection({ enabled: false })),
      ]);
      for (const key of ['sys:c1', 'sys:c2', 'sys:c3', 'sys:c4']) store.toggleBulkSelection(key);
      flushSync();

      assert.deepEqual(
        store.bulkSalvageable.map((entry) => entry.name),
        ['Ash', 'Zinc']
      );
      assert.deepEqual(
        store.bulkBlocked.map((entry) => entry.name),
        ['Bark', 'Yew']
      );
      assert.deepEqual(store.bulkCounts, {
        selected: 4,
        salvageable: 2,
        blocked: 2,
        atMax: false,
      });
    });
  });

  describe('inventoryStore - the best-case yield preview, per mode', () => {
    /** The aggregate preview for one selected row. */
    async function previewFor(salvage) {
      const { store } = await loadedBulkStore([bulkRow('c1', 'Iron', salvage)]);
      store.toggleBulkSelection('sys:c1');
      flushSync();
      return store.bulkYieldPreview;
    }

    it('simple with NO check: the results verbatim, fully guaranteed', async () => {
      const preview = await previewFor(
        salvageProjection({
          mode: 'simple',
          checkUsable: false,
          results: [{ name: 'Shard', img: 'icons/shard.webp', quantity: 2 }],
        })
      );
      // Row shape 1 — `guaranteed === quantity > 0`, the commonest configuration by far,
      // which the panel renders with a Guaranteed pill and NO "up to" affix.
      assert.deepEqual(preview, [
        { componentId: null, name: 'Shard', img: 'icons/shard.webp', quantity: 2, guaranteedQuantity: 2 },
      ]);
    });

    it('simple WITH a usable check: the same list, guaranteed nothing', async () => {
      const preview = await previewFor(
        salvageProjection({
          mode: 'simple',
          checkUsable: true,
          results: [{ name: 'Shard', img: 'icons/shard.webp', quantity: 2 }],
        })
      );
      // Row shape 3 — `guaranteed === 0`, which the panel renders as Possible.
      assert.deepEqual(preview, [
        { componentId: null, name: 'Shard', img: 'icons/shard.webp', quantity: 2, guaranteedQuantity: 0 },
      ]);
    });

    it('routed: the max over SUCCESS outcomes, with a failure tier contributing 0', async () => {
      // Divergence 2, and the rule that CHANGED DIRECTION — therefore the one most
      // likely to be implemented wrong. `salvage()` returns at `if (!checkResult.success)`
      // BEFORE `_resolveSalvageResultGroups`, so a failure tier awards nothing at all;
      // and because routed salvage clamps a below-lowest total to the lowest tier, a
      // failing lowest tier is always reachable, so the guaranteed floor is 0.
      const preview = await previewFor(
        salvageProjection({
          mode: 'routed',
          routedType: 'relative',
          checkUsable: true,
          routedOutcomes: [
            { name: 'Critical', success: true, results: [{ name: 'Shard', quantity: 4 }] },
            { name: 'Success', success: true, results: [{ name: 'Shard', quantity: 1 }] },
            { name: 'Failure', success: false, results: [{ name: 'Shard', quantity: 9 }] },
          ],
        })
      );
      assert.deepEqual(preview, [{ componentId: null, name: 'Shard', img: null, quantity: 4, guaranteedQuantity: 0 }]);
    });

    it('routed with ONLY success tiers: a guaranteed floor below the best case', async () => {
      // Row shape 2 — `guaranteed > 0 && quantity > guaranteed`, which the panel renders
      // as the guaranteed count plus an "up to {quantity}" affix. This is the ONLY shape
      // that carries the affix, and it needs every authored tier to be a success tier.
      const preview = await previewFor(
        salvageProjection({
          mode: 'routed',
          routedType: 'relative',
          checkUsable: true,
          routedOutcomes: [
            { name: 'Critical', success: true, results: [{ name: 'Shard', quantity: 5 }] },
            { name: 'Success', success: true, results: [{ name: 'Shard', quantity: 2 }] },
          ],
        })
      );
      assert.deepEqual(preview, [{ componentId: null, name: 'Shard', img: null, quantity: 5, guaranteedQuantity: 2 }]);
    });

    it('routed FIXED guarantees nothing even with only success tiers', async () => {
      // A total outside every authored range yields no match at all, so `fixed` can
      // always award nothing however the tiers are written.
      const preview = await previewFor(
        salvageProjection({
          mode: 'routed',
          routedType: 'fixed',
          checkUsable: true,
          routedOutcomes: [
            { name: 'Low', success: true, results: [{ name: 'Shard', quantity: 2 }] },
            { name: 'High', success: true, results: [{ name: 'Shard', quantity: 5 }] },
          ],
        })
      );
      assert.deepEqual(preview, [{ componentId: null, name: 'Shard', img: null, quantity: 5, guaranteedQuantity: 0 }]);
    });

    it('a success tier with NO results contributes 0 to its component', async () => {
      const preview = await previewFor(
        salvageProjection({
          mode: 'routed',
          routedType: 'relative',
          checkUsable: true,
          routedOutcomes: [
            { name: 'Critical', success: true, results: [{ name: 'Shard', quantity: 3 }] },
            { name: 'Success', success: true, results: [] },
          ],
        })
      );
      assert.deepEqual(preview, [{ componentId: null, name: 'Shard', img: null, quantity: 3, guaranteedQuantity: 0 }]);
    });

    it('progressive: one per stage, always possible, null-threshold stages OMITTED', async () => {
      // Divergence 3. `progressiveStageThresholds` pushes null exactly when the cost is
      // non-finite or below 1, and `resolveProgressiveAward` runs `invalidCost: 'skip'` —
      // so a null-threshold stage is unreachable at EVERY budget and previewing it would
      // promise something the engine can never award.
      const preview = await previewFor(
        salvageProjection({
          mode: 'progressive',
          checkUsable: true,
          stages: [
            { id: 's1', name: 'Shard', img: 'icons/shard.webp', threshold: 5 },
            { id: 's2', name: 'Shard', img: 'icons/shard.webp', threshold: 9 },
            { id: 's3', name: 'Slag', img: 'icons/slag.webp', threshold: null },
          ],
        })
      );
      assert.deepEqual(preview, [
        { componentId: null, name: 'Shard', img: 'icons/shard.webp', quantity: 2, guaranteedQuantity: 0 },
      ]);
    });

    it('keeps SAME-NAMED components apart, aggregating on id rather than display name', async () => {
      // The defect this closes: the preview aggregated on `name`, so two genuinely
      // different components that share a display name collapsed into ONE row and the
      // player was shown a subset of what a best-case roll actually yields. Names are
      // GM-authored and not unique — across systems or within one ladder — so identity
      // is the only safe key. Reported against Mythwright's Slain Balehound Pup and
      // Denmother (issue 859).
      const preview = await previewFor(
        salvageProjection({
          mode: 'progressive',
          checkUsable: true,
          stages: [
            { id: 's1', componentId: 'pup-fang', name: 'Fang', img: 'icons/fang.webp', threshold: 5 },
            { id: 's2', componentId: 'den-fang', name: 'Fang', img: 'icons/fang2.webp', threshold: 9 },
          ],
        })
      );
      // Two rows, NOT one row of quantity 2 — that collapse is the bug.
      assert.equal(preview.length, 2);
      // Insertion order, not alphabetical: the preview sorts by NAME and both names
      // are identical, so the sort is a stable no-op between these two.
      assert.deepEqual(
        preview.map((row) => [row.componentId, row.quantity]),
        [
          ['pup-fang', 1],
          ['den-fang', 1],
        ]
      );
    });

    it('a progressive row with EVERY stage unreachable previews nothing but stays queued', async () => {
      const { store } = await loadedBulkStore([
        bulkRow(
          'c1',
          'Iron',
          salvageProjection({
            mode: 'progressive',
            checkUsable: true,
            stages: [{ id: 's1', name: 'Shard', threshold: null }],
          })
        ),
      ]);
      store.toggleBulkSelection('sys:c1');
      flushSync();

      assert.deepEqual(store.bulkYieldPreview, []);
      assert.equal(store.bulkSalvageable.length, 1, 'salvageable, just unpreviewable');
      assert.deepEqual(store.bulkSalvageable[0].yieldRows, []);
    });

    it('sums quantity and the guaranteed floor INDEPENDENTLY per component name', async () => {
      // Two rows can yield the same component at different certainties, and the affix is
      // only correct under independent sums: adding a guaranteed 2 to a possible 5 must
      // read "2 guaranteed, up to 7", never "7 guaranteed".
      const { store } = await loadedBulkStore([
        bulkRow(
          'c1',
          'Iron',
          salvageProjection({ results: [{ name: 'Shard', img: 'icons/shard.webp', quantity: 2 }] })
        ),
        bulkRow(
          'c2',
          'Bronze',
          salvageProjection({
            checkUsable: true,
            results: [{ name: 'Shard', img: 'icons/shard.webp', quantity: 5 }],
          })
        ),
      ]);
      store.toggleBulkSelection('sys:c1');
      store.toggleBulkSelection('sys:c2');
      flushSync();

      assert.deepEqual(store.bulkYieldPreview, [
        { componentId: null, name: 'Shard', img: 'icons/shard.webp', quantity: 7, guaranteedQuantity: 2 },
      ]);
    });

    it('previews only the QUEUE, never a blocked row', async () => {
      const { store } = await loadedBulkStore([
        bulkRow('c1', 'Iron', salvageProjection({ results: [{ name: 'Shard', quantity: 2 }] })),
        bulkRow(
          'c2',
          'Bronze',
          salvageProjection({ enabled: false, results: [{ name: 'Dross', quantity: 9 }] })
        ),
      ]);
      store.toggleBulkSelection('sys:c1');
      store.toggleBulkSelection('sys:c2');
      flushSync();

      assert.deepEqual(
        store.bulkYieldPreview.map((entry) => entry.name),
        ['Shard']
      );
    });
  });

  describe('inventoryStore - bulkSalvage', () => {
    it('flushes the pending order ONCE before the run', async () => {
      const { store, log } = await loadedBulkStore([progressiveBulkRow('c1', 'Iron')]);
      store.select('sys:c1');
      flushSync();
      store.reorderSalvageStage(0, 1, '');
      flushSync();
      store.toggleBulkSelection('sys:c1');
      flushSync();

      await store.bulkSalvage();
      flushSync();

      const writes = log.filter(([name]) => name === 'setProgressiveResultOrder');
      assert.equal(writes.length, 1, 'the debounced write lands exactly once');
      const order = log.findIndex(([name]) => name === 'setProgressiveResultOrder');
      const run = log.findIndex(([name]) => name === 'salvageComponents');
      assert.ok(order >= 0 && run >= 0 && order < run, 'and it lands BEFORE the run starts');
    });

    it('ABORTS before anything starts when the order flush rejects', async () => {
      // A queued row must not run against a stale order — the same contract the
      // single-item path has. Nothing runs, no toast, no reload.
      const { store, log } = await loadedBulkStore([progressiveBulkRow('c1', 'Iron')], {
        setOrder: () => {
          throw new Error('no');
        },
      });
      store.select('sys:c1');
      flushSync();
      store.reorderSalvageStage(0, 1, '');
      flushSync();
      store.toggleBulkSelection('sys:c1');
      flushSync();
      const loadsBefore = log.filter(([name]) => name === 'load').length;

      const result = await store.bulkSalvage();
      flushSync();

      assert.equal(result.cancelled, true);
      assert.deepEqual(
        log.filter(([name]) => name === 'salvageComponents'),
        []
      );
      assert.deepEqual(
        log.filter(([name]) => name === 'createProgressReporter'),
        []
      );
      assert.equal(log.filter(([name]) => name === 'load').length, loadsBefore, 'no reload either');
      assert.equal(store.bulkRunning, false);
    });

    it('sends the name-sorted queue as targets, and nothing blocked', async () => {
      const { store, log } = await loadedBulkStore([
        bulkRow('c1', 'Zinc'),
        bulkRow('c2', 'Ash'),
        bulkRow('c3', 'Yew', salvageProjection({ enabled: false })),
      ]);
      for (const key of ['sys:c1', 'sys:c2', 'sys:c3']) store.toggleBulkSelection(key);
      flushSync();

      await store.bulkSalvage();
      flushSync();

      const [, args] = log.find(([name]) => name === 'salvageComponents');
      assert.deepEqual(args.targets, [
        { actorId: 'a1', actorName: 'Akra', systemId: 'sys', componentId: 'c2' },
        { actorId: 'a1', actorName: 'Akra', systemId: 'sys', componentId: 'c1' },
      ]);
      assert.equal(args.interactive, true, 'a player gesture always prompts');
    });

    it('the report SURVIVES the terminal reload that empties the listing', async () => {
      // The bulk analogue of `heldItem`: the terminal `load(true)` drops every consumed
      // row, so the report has to be built from a snapshot taken BEFORE the await.
      const rows = [bulkRow('c1', 'Iron')];
      const { store } = await loadedBulkStore(rows, {
        listings: [rows, []],
        salvageResult: {
          cancelled: false,
          items: [{ outcome: 'succeeded', results: [{ name: 'Shard', quantity: 2 }] }],
          counts: { total: 1, succeeded: 1 },
          posted: true,
        },
      });
      store.toggleBulkSelection('sys:c1');
      flushSync();

      await store.bulkSalvage();
      flushSync();

      assert.equal(store.rows.length, 0, 'the listing reloaded to nothing');
      assert.equal(store.bulkReport.items.length, 1, 'the report still stands');
      assert.equal(store.bulkReport.items[0].name, 'Iron', 'carrying its pre-run identity');
      assert.equal(store.bulkReport.items[0].outcome, 'succeeded');
      assert.equal(store.bulkReport.mode, 'salvage');
      assert.equal(store.bulkReport.posted, true);
    });

    it('discharges the whole exit obligation on a THROWN run', async () => {
      // The sharpest correctness risk in the feature. `reloadOnDocumentChange` reads
      // `bulkRunning` at FIRE time, forever — so a throw escaping with the flag still
      // true leaves the inventory permanently deaf to document-change reloads for the
      // rest of the session, silently and with no error anywhere.
      const rows = [bulkRow('c1', 'Iron')];
      const { store, log } = await loadedBulkStore(rows, { salvageThrows: true });
      store.toggleBulkSelection('sys:c1');
      flushSync();
      const loadsBefore = log.filter(([name]) => name === 'load').length;

      const result = await store.bulkSalvage();
      flushSync();

      assert.equal(store.bulkRunning, false, 'the busy flag cleared');
      assert.equal(store.bulkDestroying, false, 'and so did its sibling');
      assert.equal(store.bulkProgress, null);
      assert.deepEqual(
        log.filter(([name]) => name === 'dismiss'),
        [['dismiss']],
        'toast removed'
      );
      assert.equal(
        log.filter(([name]) => name === 'load').length - loadsBefore,
        1,
        'exactly ONE terminal reload'
      );
      assert.equal(result.error, 'the engine blew up');
      assert.equal(store.bulkReport.error, 'the engine blew up', 'and the player is told');
    });

    it('suppresses document-change reloads only WHILE a run is in flight', async () => {
      // A DROP, not a defer — sound only because the terminal reload is a full one.
      const rows = [bulkRow('c1', 'Iron')];
      let release;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const { store, log } = await loadedBulkStore(rows, {
        salvageGate: gate,
        salvageResult: { cancelled: false, items: [{ outcome: 'succeeded' }], counts: {} },
      });
      store.toggleBulkSelection('sys:c1');
      flushSync();

      const running = store.bulkSalvage();
      await waitForBulkRunning(store);
      const duringLoads = log.filter(([name]) => name === 'load').length;

      store.reloadOnDocumentChange();
      store.reloadOnDocumentChange();
      await Promise.resolve();
      assert.equal(
        log.filter(([name]) => name === 'load').length,
        duringLoads,
        'both hook fires were dropped'
      );

      release();
      await running;
      flushSync();

      const afterRun = log.filter(([name]) => name === 'load').length;
      store.reloadOnDocumentChange();
      await Promise.resolve();
      assert.ok(
        log.filter(([name]) => name === 'load').length > afterRun,
        'and the subscription is live again the moment the run ends'
      );
    });

    it('advances bulkProgress and the toast on each INTERMEDIATE tick', async () => {
      // Observed MID-RUN, behind the gate: the terminal state is `null` for a run that
      // reported nothing at all, so a store that never advanced would be indistinguishable
      // at the end.
      //
      // The tick below deliberately reports `1 of 1` for a queue of TWO — the facade's
      // own stated limit, since its `total` counts only the rows the owner gate let
      // through. The denominator the player sees must stay the store's OWN snapshot
      // length, or a refused row would visibly SHRINK the bar mid-run.
      let release;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const { store, log } = await loadedBulkStore([bulkRow('c1', 'Iron'), bulkRow('c2', 'Ash')], {
        salvageGate: gate,
        progressTicks: [[1, 1]],
      });
      store.toggleBulkSelection('sys:c1');
      store.toggleBulkSelection('sys:c2');
      flushSync();

      const running = store.bulkSalvage();
      await waitForBulkRunning(store);
      flushSync();

      assert.deepEqual(store.bulkProgress, { current: 1, total: 2 }, 'one of two, mid-run');
      assert.deepEqual(
        log.filter(([name]) => name === 'progress'),
        [['progress', { pct: 0.5 }]],
        'and the toast is half full, not still empty'
      );

      release();
      await running;
      flushSync();
      assert.equal(store.bulkProgress, null, 'and the terminal state still clears');
    });

    it('never OPENS the progress toast on a run that ticked zero times', async () => {
      // `createDefaultProgressReporter` opens its toast LAZILY, on its first call. An
      // unconditional terminal `pct: 1` therefore opened a toast for the first time on a
      // dismissed batch prompt — which returns before the first target is touched — and
      // drove it straight to 100%: a completion notification for a run that called the
      // engine zero times. `dismiss()` is documented as a no-op when the reporter never
      // started, so the exit-path obligation is still fully discharged.
      const { store, log } = await loadedBulkStore([bulkRow('c1', 'Iron')], {
        salvageResult: { cancelled: true, items: [] },
      });
      store.toggleBulkSelection('sys:c1');
      flushSync();

      await store.bulkSalvage();
      flushSync();

      assert.deepEqual(
        log.filter(([name]) => name === 'progress'),
        [],
        'nothing ticked, so the reporter was never called and no toast ever opened'
      );
      assert.deepEqual(
        log.filter(([name]) => name === 'dismiss'),
        [['dismiss']],
        'and the terminal dismissal still runs — a no-op against a toast that never opened'
      );
    });

    it('refuses to start a second run while one is in flight', async () => {
      let release;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const { store } = await loadedBulkStore([bulkRow('c1', 'Iron')], { salvageGate: gate });
      store.toggleBulkSelection('sys:c1');
      flushSync();

      const first = store.bulkSalvage();
      await waitForBulkRunning(store);
      const second = await store.bulkSalvage();
      release();
      await first;

      assert.deepEqual(second, { cancelled: true });
    });

    it('does nothing at all when the queue is empty', async () => {
      const { store, log } = await loadedBulkStore([
        bulkRow('c1', 'Iron', salvageProjection({ enabled: false })),
      ]);
      store.toggleBulkSelection('sys:c1');
      flushSync();

      assert.deepEqual(await store.bulkSalvage(), { cancelled: true, items: [] });
      assert.deepEqual(
        log.filter(([name]) => name === 'salvageComponents'),
        []
      );
    });
  });

  describe('inventoryStore - bulkDestroy', () => {
    it('hands the confirm prompt to the seam VERBATIM', async () => {
      // The store holds no i18n: the caller composes the whole dialog copy — the row
      // count AND the unit count — and the store must not reshape it.
      const prompt = {
        title: 'Destroy 3 components (47 items)',
        content: '<p>Permanently destroyed.</p>',
        yes: { label: 'Destroy' },
      };
      const { store, log } = await loadedBulkStore([bulkRow('c1', 'Iron')]);
      store.toggleBulkSelection('sys:c1');
      flushSync();

      await store.bulkDestroy(prompt);
      flushSync();

      const [, passed] = log.find(([name]) => name === 'confirmDialog');
      assert.equal(passed, prompt, 'the same object, not a copy or a reshape');
    });

    for (const confirmed of [false, null, undefined, 0, '']) {
      it(`treats a ${JSON.stringify(confirmed)} confirmation as NOT confirmed`, async () => {
        // Covers both `null` (dismissed) and `false` (No, `DialogV2.confirm`'s own
        // default button) with one falsy rule.
        const { store, log } = await loadedBulkStore([bulkRow('c1', 'Iron')], { confirmed });
        store.toggleBulkSelection('sys:c1');
        flushSync();

        assert.deepEqual(await store.bulkDestroy({}), { confirmed: false });
        assert.deepEqual(
          log.filter(([name]) => name === 'destroyComponents'),
          []
        );
      });
    }

    it('destroys BLOCKED rows too — destroy is not gated on salvageability', async () => {
      // Acceptance 10. The snapshot is the whole partition, never `bulkSalvageable`.
      const { store, log } = await loadedBulkStore([
        bulkRow('c1', 'Iron'),
        bulkRow('c2', 'Fire', salvageProjection(), { isEssenceSource: true }),
      ]);
      store.toggleBulkSelection('sys:c1');
      store.toggleBulkSelection('sys:c2');
      flushSync();

      await store.bulkDestroy({});
      flushSync();

      const [, args] = log.find(([name]) => name === 'destroyComponents');
      assert.deepEqual(
        args.targets.map((entry) => entry.componentId),
        ['c1', 'c2']
      );
    });

    it('reports each destroy tick to the toast before the terminal one', async () => {
      // Destroy has no mid-run gate to observe `bulkProgress` behind, but the reporter log
      // SURVIVES the run: the intermediate fractions have to be there, in order, ahead of
      // the `finally` block's terminal 1. A callback body that never ran would leave only
      // that terminal entry.
      const { store, log } = await loadedBulkStore(
        [bulkRow('c1', 'Iron'), bulkRow('c2', 'Ash'), bulkRow('c3', 'Zinc')],
        { progressTicks: [1, 2, 3] }
      );
      for (const key of ['sys:c1', 'sys:c2', 'sys:c3']) store.toggleBulkSelection(key);
      flushSync();

      await store.bulkDestroy({});
      flushSync();

      assert.deepEqual(
        log.filter(([name]) => name === 'progress').map(([, update]) => update.pct),
        [1 / 3, 2 / 3, 1, 1],
        'three ticks, then the terminal one the finally block sends once a run has ticked'
      );
    });

    it('discharges the same exit obligation on a thrown destroy', async () => {
      const { store, log } = await loadedBulkStore([bulkRow('c1', 'Iron')], {
        destroyThrows: true,
      });
      store.toggleBulkSelection('sys:c1');
      flushSync();
      const loadsBefore = log.filter(([name]) => name === 'load').length;

      const result = await store.bulkDestroy({});
      flushSync();

      assert.equal(store.bulkDestroying, false);
      assert.equal(store.bulkProgress, null);
      assert.deepEqual(
        log.filter(([name]) => name === 'dismiss'),
        [['dismiss']]
      );
      assert.equal(log.filter(([name]) => name === 'load').length - loadsBefore, 1);
      assert.equal(result.confirmed, true, 'the player DID confirm — the run then failed');
      assert.equal(result.error, 'the delete blew up');
    });

    it('never OPENS the progress toast on a destroy that ticked zero times', async () => {
      // The mirror of `bulkSalvage`'s own zero-tick gate, and reachable WITHOUT a throw:
      // a destroy every row of which the facade's owner gate REFUSES returns a full
      // result set having called `onProgress` not once. `createDefaultProgressReporter`
      // opens its toast lazily on its FIRST call, so an unconditional terminal `pct: 1`
      // in the `finally` opens a toast for the first time at 100% — a completion
      // notification for a run that deleted nothing.
      const { store, log } = await loadedBulkStore([bulkRow('c1', 'Iron')], {
        destroyResult: {
          items: [{ outcome: 'notPermitted', unitsDeleted: 0, documentsDeleted: 0 }],
          unitsDeleted: 0,
          documentsDeleted: 0,
        },
      });
      store.toggleBulkSelection('sys:c1');
      flushSync();

      await store.bulkDestroy({});
      flushSync();

      assert.deepEqual(
        log.filter(([name]) => name === 'progress'),
        [],
        'nothing ticked, so the reporter was never called and no toast ever opened'
      );
      assert.deepEqual(
        log.filter(([name]) => name === 'dismiss'),
        [['dismiss']],
        'and the terminal dismissal still runs — a no-op against a toast that never opened'
      );
      assert.equal(
        store.bulkReport.items[0].outcome,
        'notPermitted',
        'while the refusal itself is still reported in the panel'
      );
    });

    it('destroys the set SNAPSHOTTED before the dialog, not the one it reloaded into', async () => {
      // The listing reloads on world-time, scene and source changes, any of which can
      // fire while the modal stands. The set the caller counted for the confirmation copy
      // — "3 components (47 items)" — has to be the set that is destroyed, so the
      // snapshot is taken BEFORE the await on `confirmDialog`, never after. Re-read
      // afterwards, this run finds an empty selection and deletes nothing at all while
      // still reporting a confirmed destroy.
      const rows = [bulkRow('c1', 'Iron'), bulkRow('c2', 'Ash')];
      let release;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const { store, log } = await loadedBulkStore(rows, {
        confirmGate: gate,
        // The reload behind the modal returns a listing holding NEITHER selected card.
        listings: [rows, []],
      });
      store.toggleBulkSelection('sys:c1');
      store.toggleBulkSelection('sys:c2');
      flushSync();

      const running = store.bulkDestroy({});
      for (let attempt = 0; attempt < 10; attempt += 1) {
        if (log.some(([name]) => name === 'confirmDialog')) break;
        await Promise.resolve();
      }
      assert.ok(
        log.some(([name]) => name === 'confirmDialog'),
        'the modal is observably open'
      );

      await store.load(true);
      flushSync();
      assert.deepEqual(store.bulkEntries, [], 'and the listing went out from under it');

      release();
      await running;
      flushSync();

      const destroyed = log.find(([name]) => name === 'destroyComponents');
      assert.ok(destroyed, 'the run went ahead against the set the player agreed to');
      assert.deepEqual(
        destroyed[1].targets.map((entry) => entry.componentId),
        ['c1', 'c2']
      );
    });

    it('records a destroy report carrying the unit counts', async () => {
      const rows = [bulkRow('c1', 'Iron')];
      const { store } = await loadedBulkStore(rows, {
        destroyResult: {
          items: [{ outcome: 'succeeded', unitsDeleted: 7, documentsDeleted: 2 }],
          unitsDeleted: 7,
          documentsDeleted: 2,
        },
      });
      store.toggleBulkSelection('sys:c1');
      flushSync();

      await store.bulkDestroy({});
      flushSync();

      assert.equal(store.bulkReport.mode, 'destroy');
      assert.equal(store.bulkReport.unitsDeleted, 7);
      assert.equal(store.bulkReport.documentsDeleted, 2);
      assert.equal(store.bulkReport.items[0].name, 'Iron');
    });
  });

  describe('inventoryStore - the pendingOrderKey fix', () => {
    // Two progressive cards (the shared `progressiveBulkRow` above), so a selection
    // change between the gesture and the flush is real.
    it('commits the key captured when the reorder was SCHEDULED, not the live one', async () => {
      // The latent bug this change fixes: `reorderSalvageStage` computed the order key at
      // SCHEDULE time but `flushSalvageOrder` re-derived it at FLUSH time, so a selection
      // change in between committed the reordered array under a DIFFERENT participation's
      // key — silently, with no error and no visible symptom until the wrong card opened
      // in the wrong order.
      const { store, log } = await loadedBulkStore([
        progressiveBulkRow('cA', 'Alpha'),
        progressiveBulkRow('cB', 'Beta'),
      ]);
      store.select('sys:cA');
      flushSync();
      store.reorderSalvageStage(0, 1, '');
      flushSync();

      store.select('sys:cB');
      flushSync();
      await store.flushSalvageOrder();

      const writes = log.filter(([name]) => name === 'setProgressiveResultOrder');
      assert.equal(writes.length, 1);
      assert.equal(writes[0][1], 'salvage:sys:cA', "card A's key, not the card now selected");
      assert.deepEqual(writes[0][2], ['cA-s2', 'cA-s1'], "and card A's reordered stage ids");
    });

    it('clears the captured key, so a second flush writes nothing', async () => {
      const { store, log } = await loadedBulkStore([progressiveBulkRow('cA', 'Alpha')]);
      store.select('sys:cA');
      flushSync();
      store.reorderSalvageStage(0, 1, '');
      flushSync();

      assert.deepEqual(await store.flushSalvageOrder(), { ok: true });
      assert.deepEqual(await store.flushSalvageOrder(), { ok: true });

      assert.equal(log.filter(([name]) => name === 'setProgressiveResultOrder').length, 1);
    });
  });
});
