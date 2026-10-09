/**
 * Mount the real inventory view, populated with ten cards, beside a stand-in nav rail in a host
 * the size of the player window's content area, `?width=` wide.
 */
import { mount } from 'svelte';

import en from '../../../lang/en.json';
import InventoryView from '../../../src/ui/svelte/apps/inventory/InventoryView.svelte';
import { installFixtureI18n } from '../select-fixture-shared.js';

installFixtureI18n(en);

const width = Number(new URLSearchParams(location.search).get('width') ?? 1200);
const items = Array.from({ length: 10 }, (_, index) => ({
  key: `sys:item-${index}`,
  name: `Item ${index}`,
  img: '',
  totalQuantity: 2,
  essences: [],
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
  bulkSelectedKeys: [],
  load() {},
  select() {},
  setPage() {},
  setPageSize() {},
};

const root = document.createElement('div');
root.className = 'fabricate fabricate-app';
root.style.cssText = `display:flex;width:${width}px;height:820px`;
const rail = document.createElement('nav');
rail.style.cssText = 'flex:none;width:72px';
const host = document.createElement('div');
host.dataset.host = '';
host.style.cssText = 'flex:1;min-width:0;height:100%';
root.append(rail, host);
document.body.append(root);

mount(InventoryView, { target: host, props: { services: { inventory: store } } });

document.documentElement.dataset.inventoryViewReady = 'true';
