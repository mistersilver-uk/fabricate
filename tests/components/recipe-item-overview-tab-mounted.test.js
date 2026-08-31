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
    'src/ui/svelte/util/listReorderAnnouncement.js',
    'src/ui/svelte/util/dropUtils.js',
    'src/ui/svelte/actions/dragDrop.js',
  ],
  compiledModules: [
    'src/ui/svelte/apps/manager/ItemDropZone.svelte',
    'src/ui/svelte/apps/manager/recipe-item/RecipeItemOverviewTab.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/recipe-item/RecipeItemOverviewTab.svelte',
});

const LINKED_ITEM = {
  uuid: 'Item.abc',
  name: 'Ashfall Compendium',
  img: 'a.png',
  type: 'Tome',
  description: 'A heavy tome.',
};
before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('RecipeItemOverviewTab (mounted)', () => {
  it('renders the filled link chip with name, copy and unlink (no raw UUID text)', async () => {
    const root = await harness.mount({
      recipeItem: { id: 'ri1', enabled: true, caps: { item: {}, learn: {} } },
      linkedItem: LINKED_ITEM,
    });
    assert.ok(root.querySelector('[data-recipe-item-link]'), 'expected the filled link chip');
    // The raw UUID text is no longer shown — the Copy button carries it.
    assert.equal(root.querySelector('[data-recipe-item-uuid]'), null);
    assert.equal(
      root.querySelector('[data-recipe-item-name]').textContent.trim(),
      'Ashfall Compendium'
    );
    assert.equal(
      root.querySelector('[data-recipe-item-description]').textContent.trim(),
      'A heavy tome.'
    );
    assert.ok(root.querySelector('[data-recipe-item-copy-uuid]'));
    assert.ok(root.querySelector('[data-recipe-item-unlink]'));
    assert.equal(root.querySelector('[data-recipe-item-dropzone]'), null);
  });

  it('shows a drag-only drop zone and placeholder name when unlinked', async () => {
    const root = await harness.mount({
      recipeItem: { id: 'ri1', enabled: true, caps: { item: {}, learn: {} } },
      linkedItem: null,
    });
    const dropzone = root.querySelector('[data-recipe-item-dropzone]');
    assert.ok(dropzone, 'expected the empty drop zone');
    assert.equal(root.querySelector('[data-recipe-item-link]'), null);
    assert.equal(
      root.querySelector('[data-recipe-item-name]').textContent.trim(),
      'Untitled recipe item'
    );
  });

  it('does not open a picker and links only from a dropped Item UUID', async () => {
    const calls = [];
    const root = await harness.mount({
      recipeItem: { id: 'ri1', enabled: true, caps: { item: {}, learn: {} } },
      linkedItem: null,
      onLinkItem: (uuid) => calls.push(uuid),
    });
    const dropzone = root.querySelector('[data-recipe-item-dropzone]');
    dropzone.click();
    assert.equal(document.querySelector('.manager-item-picker-dialog'), null);
    assert.deepEqual(calls, []);

    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', {
      value: {
        getData: () =>
          JSON.stringify({
            type: 'Item',
            uuid: 'Compendium.fabricate.items.Item.primer',
          }),
      },
    });
    dropzone.dispatchEvent(drop);
    assert.deepEqual(calls, ['Compendium.fabricate.items.Item.primer']);

    // Issue 1036/7: still rejects every payload that is not an Item naming a document.
    // `{ type: 'Item', pack, id }` moved OUT of this list deliberately — see below.
    for (const payload of [
      { type: 'Actor', uuid: 'Actor.hero' },
      { type: 'Macro', uuid: 'Macro.dc' },
      { type: 'Item' },
      { type: 'Item', uuid: '   ' },
      { type: 'Item', pack: 'fabricate.items' },
    ]) {
      const rejectedDrop = new Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(rejectedDrop, 'dataTransfer', {
        value: { getData: () => JSON.stringify(payload) },
      });
      dropzone.dispatchEvent(rejectedDrop);
    }
    assert.deepEqual(
      calls,
      ['Compendium.fabricate.items.Item.primer'],
      'the shared Item drop zone rejects non-Item and document-less drag shapes'
    );

    // The legacy COMPENDIUM shape `{ pack, id }` — no `uuid` — is now ACCEPTED (issue
    // 1036). The zone's guard read `data.uuid` directly, which made it stricter than every
    // one of its own consumers: each already calls `resolveDropUuid` in its `onDrop` and
    // would have handled this shape, but the zone refused it first. Foundry emits exactly
    // this payload for a compendium drag, so the effect was that dragging an item out of a
    // compendium silently did nothing.
    const legacyDrop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(legacyDrop, 'dataTransfer', {
      value: {
        getData: () => JSON.stringify({ type: 'Item', pack: 'fabricate.items', id: 'legacy' }),
      },
    });
    dropzone.dispatchEvent(legacyDrop);
    assert.deepEqual(calls, [
      'Compendium.fabricate.items.Item.primer',
      'Compendium.fabricate.items.legacy',
    ]);
  });

  it('fires onUnlinkItem when Unlink is clicked', async () => {
    let unlinked = 0;
    const root = await harness.mount({
      recipeItem: { id: 'ri1', enabled: true, caps: { item: {}, learn: {} } },
      linkedItem: LINKED_ITEM,
      onUnlinkItem: () => {
        unlinked += 1;
      },
    });
    root.querySelector('[data-recipe-item-unlink]').click();
    assert.equal(unlinked, 1);
  });

  it('routes Copy UUID through the Manager clipboard/notification seam', async () => {
    const copied = [];
    const root = await harness.mount({
      recipeItem: { id: 'ri1', enabled: true, caps: { item: {}, learn: {} } },
      linkedItem: LINKED_ITEM,
      onCopyItemUuid: (uuid) => copied.push(uuid),
    });
    root.querySelector('[data-recipe-item-copy-uuid]').click();
    assert.deepEqual(copied, ['Item.abc']);
  });

  it('emits an enabled patch when the toggle is clicked', async () => {
    const patches = [];
    const root = await harness.mount({
      recipeItem: { id: 'ri1', enabled: true, caps: { item: {}, learn: {} } },
      linkedItem: LINKED_ITEM,
      onPatch: (patch) => patches.push(patch),
    });
    const toggle = root.querySelector('[data-recipe-item-enabled]');
    assert.ok(toggle.classList.contains('is-on'));
    toggle.click();
    assert.deepEqual(patches, [{ enabled: false }]);
  });
});
