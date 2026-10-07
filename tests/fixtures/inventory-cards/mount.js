/**
 * Mount three real inventory cards in a list, and a preview card beside them, recording each
 * card's inspect and bulk-toggle callbacks on the document (issue 1778).
 */
import { mount } from 'svelte';

import en from '../../../lang/en.json';
import InventoryItemCard from '../../../src/ui/svelte/apps/inventory/InventoryItemCard.svelte';
import { installFixtureI18n } from '../select-fixture-shared.js';

installFixtureI18n(en);

/** Appends `value` to the document's `data-<key>` list, which the suite reads back. */
const record = (key) => (value) => {
  const { dataset } = document.documentElement;
  dataset[key] = [dataset[key], value].filter(Boolean).join(' ');
};

const item = (key, name) => ({ key, name, img: '', totalQuantity: 3, essences: [] });

const root = document.createElement('div');
root.className = 'fabricate fabricate-app';
const list = document.createElement('div');
list.setAttribute('role', 'list');
list.dataset.case = 'list';
list.style.cssText = 'display:grid;grid-template-columns:repeat(3,132px);gap:12px';
const preview = document.createElement('div');
preview.dataset.case = 'preview';
preview.style.width = '132px';
root.append(list, preview);
document.body.append(root);

for (const [key, name] of [
  ['sys:gland', 'Mordant Gland'],
  ['sys:ingot', 'Bronze Ingot'],
  ['sys:fire', 'Fire'],
]) {
  mount(InventoryItemCard, {
    target: list,
    props: {
      item: item(key, name),
      selected: key === 'sys:gland',
      onSelect: record('selected'),
      onBulkToggle: record('bulk'),
    },
  });
}
mount(InventoryItemCard, {
  target: preview,
  props: { item: item('sys:preview', 'Ember Ash'), interactive: false },
});

document.documentElement.dataset.inventoryCardsReady = 'true';
