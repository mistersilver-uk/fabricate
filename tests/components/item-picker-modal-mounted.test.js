import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-item-picker-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js'
  ],
  compiledModules: [
    'src/ui/svelte/components/Pagination.svelte',
    'src/ui/svelte/apps/manager/ItemPickerModal.svelte'
  ],
  componentPath: 'src/ui/svelte/apps/manager/ItemPickerModal.svelte'
});

const ITEMS = [
  { uuid: 'Item.a', name: 'Alloy Ingot', img: 'a.png', type: 'loot' },
  { uuid: 'Item.b', name: 'Bronze Bar', img: '', type: 'consumable' },
  { uuid: 'Item.c', name: 'Copper Ore', img: '', type: 'loot' }
];

// The dialog portals to document.body, so it lives outside the mount target.
function dialog() {
  return document.querySelector('.manager-item-picker-dialog');
}

function typeSearch(value) {
  const input = document.querySelector('[data-item-picker-search]');
  input.value = value;
  input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
  flushSync();
}

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('ItemPickerModal (mounted)', () => {
  it('renders nothing when closed', async () => {
    await harness.mount({ open: false, items: ITEMS });
    assert.equal(dialog(), null);
  });

  it('renders a row per item when open', async () => {
    await harness.mount({ open: true, items: ITEMS });
    assert.ok(dialog(), 'expected the dialog to be portaled');
    const rows = document.querySelectorAll('.manager-item-picker-row');
    assert.equal(rows.length, 3);
    assert.equal(rows[0].querySelector('.manager-item-picker-name').textContent, 'Alloy Ingot');
    assert.equal(rows[0].querySelector('.manager-item-picker-type').textContent, 'loot');
  });

  it('filters the list by the search term', async () => {
    await harness.mount({ open: true, items: ITEMS });
    typeSearch('bronze');
    const rows = document.querySelectorAll('.manager-item-picker-row');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].querySelector('.manager-item-picker-name').textContent, 'Bronze Bar');
  });

  it('shows the empty hint when nothing matches', async () => {
    await harness.mount({ open: true, items: ITEMS });
    typeSearch('zzz');
    assert.equal(document.querySelectorAll('.manager-item-picker-row').length, 0);
    assert.ok(document.querySelector('.manager-item-picker-empty'));
  });

  it('calls onPick with the uuid then onClose when a row is chosen', async () => {
    const picks = [];
    let closed = 0;
    await harness.mount({
      open: true,
      items: ITEMS,
      onPick: (uuid) => picks.push(uuid),
      onClose: () => { closed += 1; }
    });
    document.querySelector('[data-item-picker-row="Item.b"]').click();
    assert.deepEqual(picks, ['Item.b']);
    assert.equal(closed, 1);
  });

  it('calls onClose when the close button is pressed', async () => {
    let closed = 0;
    await harness.mount({ open: true, items: ITEMS, onClose: () => { closed += 1; } });
    document.querySelector('[data-item-picker-close]').click();
    assert.equal(closed, 1);
  });

  it('paginates when there are more items than one page', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      uuid: `Item.${i}`,
      name: `Item ${String(i).padStart(2, '0')}`,
      type: 'loot'
    }));
    await harness.mount({ open: true, items: many });
    // Page size 10 → first page shows 10 rows, pagination footer visible.
    assert.equal(document.querySelectorAll('.manager-item-picker-row').length, 10);
    assert.ok(document.querySelector('.manager-pagination'));
  });
});
