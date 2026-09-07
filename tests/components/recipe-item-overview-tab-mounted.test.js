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
    'src/ui/svelte/components/IconButton.svelte',
    'src/ui/svelte/apps/manager/ItemDropZone.svelte',
    'src/ui/svelte/components/StatusToggle.svelte',
    // The shared eyebrow (issue 1505). All three field labels are `<Kicker>`s, so
    // omitting it HANGS this suite (# cancelled), never fails it.
    'src/ui/svelte/components/Kicker.svelte',
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

describe('ItemDropZone emits the namespace root its rules are anchored on (issue 1509)', () => {
  /*
   * THE ONE ASSERTION IN THIS REPOSITORY THAT READS THE LINK FIELD'S RENDERED ROOT.
   *
   * Every other guard on this family reads SOURCE TEXT: the area-scope gate reads the component's
   * `class="…"` attribute, the sheet census reads the selectors, the fixture clauses read strings
   * in `tests/`. All of them are satisfied by a component that WRITES `fabricate-link-field` in
   * that attribute and stops putting the attribute on its root element -- at which point every
   * one of the fifteen re-rooted rules in `styles/fabricate.css` matches nothing and the zone
   * draws as an unstyled div in every host, the manager included.
   *
   * Read off the mounted DOM, in the shape `manager-button-mounted.test.js:83` uses. THIS suite
   * rather than one of the other eight callers', because this one is the only caller whose hook
   * bag is DERIVED -- `data-recipe-item-link` and `data-recipe-item-dropzone` are two faces of
   * one state -- so the same two mounts prove the root AND the per-state bag.
   */
  it('writes `fabricate-link-field` first on its root div, in the linked state', async () => {
    const root = await harness.mount({
      recipeItem: { id: 'ri1', enabled: true, caps: { item: {}, learn: {} } },
      linkedItem: LINKED_ITEM,
    });
    const zone = root.querySelector('[data-manager-item-drop-zone]');
    assert.ok(Boolean(zone), 'the tab must render the zone at all');
    assert.equal(zone.tagName.toLowerCase(), 'div');
    assert.equal(
      zone.className.replaceAll(/ ?svelte-[a-z0-9]+/g, ''),
      'fabricate-link-field manager-item-drop-zone is-linked',
      'the root must carry the primitive`s own namespace class FIRST -- every re-rooted rule in ' +
        '`styles/fabricate.css` names it as the leading compound -- then the zone`s own class, ' +
        'then whichever state the caller`s props put it in'
    );
  });

  it('writes it on the ROOT div and not on a nested one', async () => {
    // THE MUTATION CONTROL'S TARGET, stated as an assertion so the control has something to flip.
    // Moving the `fabricate-link-field` literal off the root and into the copy column's class
    // leaves it in the markup, so it stays in the area-scope gate's `written` set and `rootless`,
    // `gated` and the emission clause all stay green. Only a reading of WHICH element carries it
    // can see that move -- and it is the difference between a root that is an ancestor of the
    // whole family and one that is a sibling of most of it.
    const root = await harness.mount({
      recipeItem: { id: 'ri1', enabled: true, caps: { item: {}, learn: {} } },
      linkedItem: LINKED_ITEM,
    });
    const copy = root.querySelector('.manager-item-drop-zone-copy');
    assert.ok(Boolean(copy), 'the copy column must render, or this control has no subject');
    assert.ok(
      !copy.classList.contains('fabricate-link-field'),
      'the copy column carries the family root, which belongs on the zone`s own root div: every ' +
        'rule in the sheet roots at it as an ancestor of this column, so a root here matches ' +
        'nothing the column contains'
    );
    assert.ok(
      Boolean(copy.closest('.fabricate-link-field')),
      'and the column must still sit UNDER the root, which is the relationship the sheet encodes'
    );
  });

  it('renders the two faces of its DERIVED hook bag, one per link state, never both', async () => {
    // `data-recipe-item-link` and `data-recipe-item-dropzone` were `kind === 'recipe-item' && item`
    // and `&& !item` inside the primitive (issue 1509 replaced all thirteen such branches with one
    // `hookAttrs` bag). They key on `item`, NOT on the caller's id, so this site's bag is
    // `$derived` on its own link state; a static object here would render both or neither, and
    // that is a state no mount of a single face can see.
    const linked = await harness.mount({
      recipeItem: { id: 'ri1', enabled: true, caps: { item: {}, learn: {} } },
      linkedItem: LINKED_ITEM,
    });
    const linkedZone = linked.querySelector('[data-manager-item-drop-zone]');
    assert.ok(linkedZone.hasAttribute('data-recipe-item-link'), 'the linked face names itself');
    assert.ok(
      !linkedZone.hasAttribute('data-recipe-item-dropzone'),
      'and it must not ALSO carry the empty face`s hook, which is what a static bag would do'
    );
    harness.remount();

    const unlinked = await harness.mount({
      recipeItem: { id: 'ri1', enabled: true, caps: { item: {}, learn: {} } },
      linkedItem: null,
    });
    const emptyZone = unlinked.querySelector('[data-manager-item-drop-zone]');
    assert.ok(emptyZone.hasAttribute('data-recipe-item-dropzone'), 'the empty face names itself');
    assert.ok(
      !emptyZone.hasAttribute('data-recipe-item-link'),
      'and it must not ALSO carry the linked face`s hook'
    );
    assert.equal(
      emptyZone.className.replaceAll(/ ?svelte-[a-z0-9]+/g, ''),
      'fabricate-link-field manager-item-drop-zone',
      'and the root still leads in the empty state, where `is-linked` is absent'
    );
  });
});

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
