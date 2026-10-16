/**
 * Mount the real inventory view, populated with ten cards, beside a stand-in nav rail in a host
 * the size of the player window's content area, `?width=` wide by `?height=` tall. `?bulk=<n>`
 * opens the bulk panel on n queued components instead of the single-item inspector.
 */
import { mount } from 'svelte';

import en from '../../../lang/en.json';
import InventoryView from '../../../src/ui/svelte/apps/inventory/InventoryView.svelte';
import { playerViewHost } from '../player-view-host.js';
import { installFixtureI18n } from '../select-fixture-shared.js';

installFixtureI18n(en);

const items = Array.from({ length: 10 }, (_, index) => ({
  key: `sys:item-${index}`,
  name: `Item ${index}`,
  img: '',
  totalQuantity: 2,
  essences: [],
}));
const bulk = Number(new URLSearchParams(location.search).get('bulk') ?? 0);
const queued = Array.from({ length: bulk }, (_, index) => ({
  key: `sys:queued-${index}`,
  name: `Queued ${index}`,
  img: '',
  actorQuantity: 2,
}));
const store = {
  loadedOnce: true,
  hasActor: true,
  rows: items,
  pageItems: items,
  visibleItems: items,
  page: 0,
  pageSize: 25,
  filterCounts: {},
  bulkSelectedKeys: queued.map((item) => item.key),
  bulkActive: bulk > 0,
  bulkEntries: queued,
  bulkSalvageable: queued,
  bulkCounts: { selected: bulk, salvageable: bulk, blocked: 0 },
  load() {},
  select() {},
  setPage() {},
  setPageSize() {},
};

mount(InventoryView, { target: playerViewHost(), props: { services: { inventory: store } } });

document.documentElement.dataset.inventoryViewReady = 'true';
