import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync, tick } from '../../node_modules/svelte/src/index-client.js';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

// The player Inventory tab tree. Its raw `.js` deps (foundryBridge +
// craftingImageDefaults) are the same ones the Crafting tree already uses, so no
// new raw module is needed — only the inventory `.svelte` components (plus the
// shared Pagination + CraftingThumb they reuse) are compiled.
const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-inventory-view-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/craftingImageDefaults.js'
  ],
  compiledModules: [
    'src/ui/svelte/components/Pagination.svelte',
    'src/ui/svelte/apps/crafting/CraftingThumb.svelte',
    'src/ui/svelte/apps/inventory/InventoryItemCard.svelte',
    'src/ui/svelte/apps/inventory/InventoryFilters.svelte',
    'src/ui/svelte/apps/inventory/InventoryGrid.svelte',
    'src/ui/svelte/apps/inventory/InventoryDetail.svelte',
    'src/ui/svelte/apps/inventory/InventoryView.svelte'
  ],
  componentPath: 'src/ui/svelte/apps/inventory/InventoryView.svelte'
});

function makeItem() {
  return {
    key: 'sys:c1',
    componentId: 'c1',
    name: 'Mordant Gland',
    img: 'icons/gland.webp',
    icon: null,
    tags: ['Beast', 'Mordant'],
    tier: 1,
    isEssenceSource: false,
    isTool: true,
    totalQuantity: 7,
    sources: [
      { actorId: 'a1', actorName: 'Akra', actorImg: null, quantity: 2 },
      { actorId: 'a2', actorName: 'Camp Chest', actorImg: null, quantity: 5 }
    ],
    essences: [{ id: 'fire', name: 'Fire', icon: 'fas fa-fire', quantity: 2 }],
    usedBy: [{ recipeId: 'r1', recipeName: "Alchemist's Crucible", recipeImg: null, role: 'ingredient' }],
    producedBy: [
      { kind: 'recipe', recipeId: 'r2', name: 'Distil Gland', img: null },
      { kind: 'gathering', recipeId: null, name: 'Harvest Beast', img: null }
    ],
    contributors: []
  };
}

function makeEssenceItem() {
  return {
    key: 'sys:fire',
    componentId: 'fire',
    name: 'Fire',
    img: null,
    icon: 'fas fa-fire',
    tags: [],
    tier: null,
    isEssenceSource: true,
    isTool: false,
    totalQuantity: 6,
    sources: [{ actorId: 'a1', actorName: 'Akra', actorImg: null, quantity: 6 }],
    essences: [],
    usedBy: [],
    producedBy: [],
    contributors: [{ componentId: 'c1', name: 'Iron', img: 'icons/iron.webp', quantity: 6 }]
  };
}

// A plain (non-reactive) store stand-in: this is a render + interaction smoke
// test, so a POJO exposing the getters InventoryView reads is sufficient. The
// real store's derivations are unit-tested separately.
function makeServices(item) {
  const calls = { navigate: [] };
  const store = {
    rows: [item],
    loading: false,
    loadedOnce: true,
    error: null,
    hasActor: true,
    search: '',
    filter: 'all',
    sort: 'name',
    filterCounts: { all: 1, components: 1, essences: 0, tools: 1 },
    page: 0,
    pageSize: 25,
    visibleItems: [item],
    pageItems: [item],
    selectedItem: item,
    select() {},
    setSearch() {},
    setFilter() {},
    setSort() {},
    setPage() {},
    setPageSize() {},
    load() {},
    tickWorldTime() {}
  };
  const services = {
    inventory: store,
    craftingSources: { load() {}, setCraftingActor() {}, selectedSourceIds: [] },
    actorBar: { selectedActorId: 'a1' },
    setSelectedCraftingActorId() {},
    navigateToCraftingRecipe: (id) => calls.navigate.push(id)
  };
  return { services, calls, store };
}

async function settle() {
  flushSync();
  await tick();
  await tick();
  flushSync();
}

describe('InventoryView (mounted)', () => {
  before(harness.setup);
  after(harness.teardown);
  afterEach(harness.remount);

  it('renders the populated layout with an item card and the selected item detail', async () => {
    const { services } = makeServices(makeItem());
    const target = await harness.mount({ services });
    await settle();

    assert.ok(target.querySelector('[data-inventory-state="populated"]'), 'renders the populated layout');
    assert.ok(target.querySelector('[data-inventory-card="sys:c1"]'), 'renders the item card');

    const detail = target.querySelector('[data-inventory-detail="sys:c1"]');
    assert.ok(detail, 'renders the selected item detail');
    assert.match(detail.textContent, /Mordant Gland/, 'detail shows the item name');
    assert.match(detail.textContent, /Akra/, 'detail lists a source actor');
    assert.match(detail.textContent, /Alchemist's Crucible/, 'detail lists the using recipe');
    // Produced By section lists the producing recipe + gathering task.
    assert.match(detail.textContent, /Distil Gland/, 'detail lists a producing recipe');
    assert.match(detail.textContent, /Harvest Beast/, 'detail lists a producing gathering task');
  });

  it('shows essence and tool pips on a component card', async () => {
    const { services } = makeServices(makeItem());
    const target = await harness.mount({ services });
    await settle();

    const card = target.querySelector('[data-inventory-card="sys:c1"]');
    assert.ok(card.querySelector('[data-inventory-pip="essence"]'), 'renders an essence pip');
    assert.ok(card.querySelector('[data-inventory-pip="tool"]'), 'renders a tool pip');
  });

  it('shows contributing components when an essence is selected', async () => {
    const item = makeEssenceItem();
    const { services } = makeServices(item);
    const target = await harness.mount({ services });
    await settle();

    const detail = target.querySelector('[data-inventory-detail="sys:fire"]');
    assert.ok(detail, 'renders the essence detail');
    assert.ok(detail.querySelector('[data-inventory-contributor="c1"]'), 'lists a contributing component');
    assert.match(detail.textContent, /Iron/, 'names the contributing component');
    // An essence has no Produced By section.
    assert.equal(detail.querySelector('[data-inventory-produced-by]'), null, 'essence has no produced-by');
  });

  it('shows the empty state when the actor owns nothing', async () => {
    const { services, store } = makeServices(makeItem());
    store.rows = [];
    store.visibleItems = [];
    store.pageItems = [];
    store.selectedItem = null;
    const target = await harness.mount({ services });
    await settle();

    assert.ok(target.querySelector('[data-inventory-state="empty"]'), 'renders the empty state');
    assert.equal(target.querySelector('[data-inventory-state="populated"]'), null, 'no populated grid');
  });

  it('navigates to the Crafting tab when a used-by recipe is activated', async () => {
    const { services, calls } = makeServices(makeItem());
    const target = await harness.mount({ services });
    await settle();

    const usedBy = target.querySelector('[data-inventory-used-by="r1"]');
    assert.ok(usedBy, 'renders a clickable used-by recipe');
    usedBy.click();
    flushSync();
    assert.deepEqual(calls.navigate, ['r1'], 'clicking a used-by recipe navigates to that recipe');

    // A recipe producer is clickable and navigates too.
    const producedBy = target.querySelector('[data-inventory-produced-by="r2"]');
    assert.ok(producedBy, 'renders a clickable produced-by recipe');
    producedBy.click();
    flushSync();
    assert.deepEqual(calls.navigate, ['r1', 'r2'], 'clicking a produced-by recipe navigates to it');
  });
});
