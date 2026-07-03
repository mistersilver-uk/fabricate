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
});
