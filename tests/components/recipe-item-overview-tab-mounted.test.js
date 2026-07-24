import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-recipe-item-overview-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/dropUtils.js',
    'src/ui/svelte/actions/dragDrop.js',
  ],
  compiledModules: [
    'src/ui/svelte/apps/manager/ItemDropZone.svelte',
    'src/ui/svelte/apps/manager/recipe-item/RecipeItemOverviewTab.svelte'
  ],
  componentPath: 'src/ui/svelte/apps/manager/recipe-item/RecipeItemOverviewTab.svelte'
});

const LINKED_ITEM = { uuid: 'Item.abc', name: 'Ashfall Compendium', img: 'a.png', type: 'Tome', description: 'A heavy tome.' };
before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('RecipeItemOverviewTab (mounted)', () => {
  it('renders the filled link chip with name, copy and unlink (no raw UUID text)', async () => {
    const root = await harness.mount({
      recipeItem: { id: 'ri1', enabled: true, caps: { item: {}, learn: {} } },
      linkedItem: LINKED_ITEM
    });
    assert.ok(root.querySelector('[data-recipe-item-link]'), 'expected the filled link chip');
    // The raw UUID text is no longer shown — the Copy button carries it.
    assert.equal(root.querySelector('[data-recipe-item-uuid]'), null);
    assert.equal(root.querySelector('[data-recipe-item-name]').textContent.trim(), 'Ashfall Compendium');
    assert.equal(root.querySelector('[data-recipe-item-description]').textContent.trim(), 'A heavy tome.');
    assert.ok(root.querySelector('[data-recipe-item-copy-uuid]'));
    assert.ok(root.querySelector('[data-recipe-item-unlink]'));
    assert.equal(root.querySelector('[data-recipe-item-dropzone]'), null);
  });

  it('shows a drag-only drop zone and placeholder name when unlinked', async () => {
    const root = await harness.mount({
      recipeItem: { id: 'ri1', enabled: true, caps: { item: {}, learn: {} } },
      linkedItem: null
    });
    const dropzone = root.querySelector('[data-recipe-item-dropzone]');
    assert.ok(dropzone, 'expected the empty drop zone');
    assert.equal(root.querySelector('[data-recipe-item-link]'), null);
    assert.equal(root.querySelector('[data-recipe-item-name]').textContent.trim(), 'Untitled recipe item');
  });

  it('does not open a picker and links only from a dropped Item UUID', async () => {
    const calls = [];
    const root = await harness.mount({
      recipeItem: { id: 'ri1', enabled: true, caps: { item: {}, learn: {} } },
      linkedItem: null,
      onLinkItem: (uuid) => calls.push(uuid)
    });
    const dropzone = root.querySelector('[data-recipe-item-dropzone]');
    dropzone.click();
    assert.equal(document.querySelector('.manager-item-picker-dialog'), null);
    assert.deepEqual(calls, []);

    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', {
      value: {
        getData: () => JSON.stringify({ type: 'Item', pack: 'fabricate.items', id: 'primer' }),
      },
    });
    dropzone.dispatchEvent(drop);
    assert.deepEqual(calls, ['Compendium.fabricate.items.primer']);
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
