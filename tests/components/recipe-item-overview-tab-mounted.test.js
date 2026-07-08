import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-recipe-item-overview-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/dropUtils.js',
    'src/ui/svelte/actions/dragDrop.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js'
  ],
  compiledModules: [
    'src/ui/svelte/components/Pagination.svelte',
    'src/ui/svelte/apps/manager/ItemPickerModal.svelte',
    'src/ui/svelte/apps/manager/recipe-item/RecipeItemOverviewTab.svelte'
  ],
  componentPath: 'src/ui/svelte/apps/manager/recipe-item/RecipeItemOverviewTab.svelte'
});

const LINKED_ITEM = { uuid: 'Item.abc', name: 'Ashfall Compendium', img: 'a.png', type: 'Tome', description: 'A heavy tome.' };
const WORLD_ITEMS = [
  { uuid: 'Item.x', name: 'Scroll of Fire', img: '', type: 'Scroll' },
  { uuid: 'Item.y', name: 'Journeyman Primer', img: '', type: 'Book' }
];

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('RecipeItemOverviewTab (mounted)', () => {
  it('renders the filled link chip with name, uuid, copy and unlink', async () => {
    const root = await harness.mount({
      recipeItem: { id: 'ri1', enabled: true, caps: { item: {}, learn: {} } },
      linkedItem: LINKED_ITEM
    });
    assert.ok(root.querySelector('[data-recipe-item-link]'), 'expected the filled link chip');
    assert.equal(root.querySelector('[data-recipe-item-uuid]').textContent.trim(), 'Item.abc');
    assert.equal(root.querySelector('[data-recipe-item-name]').textContent.trim(), 'Ashfall Compendium');
    assert.equal(root.querySelector('[data-recipe-item-description]').textContent.trim(), 'A heavy tome.');
    assert.ok(root.querySelector('[data-recipe-item-copy-uuid]'));
    assert.ok(root.querySelector('[data-recipe-item-unlink]'));
    assert.equal(root.querySelector('[data-recipe-item-dropzone]'), null);
  });

  it('shows a danger drop zone and placeholder name when unlinked', async () => {
    const root = await harness.mount({
      recipeItem: { id: 'ri1', enabled: true, caps: { item: {}, learn: {} } },
      linkedItem: null
    });
    const dropzone = root.querySelector('[data-recipe-item-dropzone]');
    assert.ok(dropzone, 'expected the empty drop zone');
    assert.equal(root.querySelector('[data-recipe-item-link]'), null);
    assert.equal(root.querySelector('[data-recipe-item-name]').textContent.trim(), 'Untitled recipe item');
  });

  it('opens the item picker from the empty drop zone and links the picked uuid', async () => {
    const calls = [];
    const root = await harness.mount({
      recipeItem: { id: 'ri1', enabled: true, caps: { item: {}, learn: {} } },
      linkedItem: null,
      worldItems: WORLD_ITEMS,
      onLinkItem: (uuid) => calls.push(uuid)
    });
    root.querySelector('[data-recipe-item-dropzone]').click();
    flushSync();
    const dialog = document.querySelector('.manager-item-picker-dialog');
    assert.ok(dialog, 'expected the item picker dialog to open');
    document.querySelector('[data-item-picker-row="Item.y"]').click();
    flushSync();
    assert.deepEqual(calls, ['Item.y']);
  });

  it('fires onUnlinkItem when Unlink is clicked', async () => {
    let unlinked = 0;
    const root = await harness.mount({
      recipeItem: { id: 'ri1', enabled: true, caps: { item: {}, learn: {} } },
      linkedItem: LINKED_ITEM,
      onUnlinkItem: () => { unlinked += 1; }
    });
    root.querySelector('[data-recipe-item-unlink]').click();
    assert.equal(unlinked, 1);
  });

  it('does not throw when Copy UUID is clicked without a clipboard', async () => {
    const root = await harness.mount({
      recipeItem: { id: 'ri1', enabled: true, caps: { item: {}, learn: {} } },
      linkedItem: LINKED_ITEM
    });
    assert.doesNotThrow(() => root.querySelector('[data-recipe-item-copy-uuid]').click());
  });

  it('emits an enabled patch when the toggle is clicked', async () => {
    const patches = [];
    const root = await harness.mount({
      recipeItem: { id: 'ri1', enabled: true, caps: { item: {}, learn: {} } },
      linkedItem: LINKED_ITEM,
      onPatch: (patch) => patches.push(patch)
    });
    const toggle = root.querySelector('[data-recipe-item-enabled]');
    assert.ok(toggle.classList.contains('is-on'));
    toggle.click();
    assert.deepEqual(patches, [{ enabled: false }]);
  });
});
