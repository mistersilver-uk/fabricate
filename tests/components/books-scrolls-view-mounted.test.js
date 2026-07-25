import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-books-scrolls-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    // The creation drop-zone (issue 844) resolves a drop via resolveDropData and
    // wires the drop listeners through the dragDrop action. Omitting either raw
    // module from the allowlist does not fail the mount — it HANGS (# cancelled).
    'src/ui/svelte/util/dropUtils.js',
    'src/ui/svelte/actions/dragDrop.js'
  ],
  compiledModules: [
    'src/ui/svelte/components/Pagination.svelte',
    'src/ui/svelte/apps/manager/BooksScrollsView.svelte'
  ],
  componentPath: 'src/ui/svelte/apps/manager/BooksScrollsView.svelte'
});

// Dispatch a Foundry-style drop on a node. getDragEventData (no `foundry` global in
// the harness) falls back to parsing `dataTransfer.getData('text/plain')`, so a
// JSON payload here round-trips exactly as a real world/compendium item drag would.
// Passing `data: null` simulates a drop with no payload.
function fireDrop(node, data) {
  const raw = data === undefined ? null : JSON.stringify(data);
  const event = new Event('drop', { bubbles: true, cancelable: true });
  event.dataTransfer = { getData: () => raw };
  node.dispatchEvent(event);
}

function makeItem(overrides = {}) {
  return {
    id: 'primer',
    resolvedName: "Journeyman's Primer",
    resolvedImg: 'icons/svg/book.svg',
    derivedType: 'Book',
    enabled: true,
    caps: { item: { limitUses: false }, learn: { limitLearning: false } },
    recipes: [
      { id: 'r1', name: 'Smelt Copper', category: 'Smithing' },
      { id: 'r2', name: 'Forge Rivets', category: 'Smithing' }
    ],
    learnedByCount: 3,
    linkMissing: false,
    ...overrides
  };
}

function capChipText(root, id) {
  return root.querySelector(`[data-books-scrolls-cap-chip="${id}"] span`).textContent.trim();
}

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('BooksScrollsView (mounted)', () => {
  it('renders a row per recipe item with name, type pill, and recipe count', async () => {
    const root = await harness.mount({
      recipeItems: [
        makeItem(),
        makeItem({ id: 'scroll', resolvedName: 'Scroll of Soul-Ash', derivedType: 'Scroll', recipes: [{ id: 'r9', name: 'Bind Ash', category: 'Arcana' }] }),
        makeItem({ id: 'empty', resolvedName: 'Blank Codex', derivedType: 'Incomplete', recipes: [] })
      ],
      visibilityMode: 'knowledge'
    });

    assert.equal(root.querySelectorAll('[data-books-scrolls-item]').length, 3);
    assert.equal(root.querySelector('[data-books-scrolls-name="primer"]').textContent.trim(), "Journeyman's Primer");
    // Type pill: Book (2+ recipes) is neutral, Scroll (1) is neutral, Incomplete (0) is danger.
    assert.equal(root.querySelector('[data-books-scrolls-type="primer"]').textContent.trim(), 'Book');
    assert.ok(!root.querySelector('[data-books-scrolls-type="primer"]').classList.contains('is-danger'));
    assert.equal(root.querySelector('[data-books-scrolls-type="scroll"]').textContent.trim(), 'Scroll');
    assert.equal(root.querySelector('[data-books-scrolls-recipe-count="primer"] span').textContent.trim(), '2 recipes');

    // A recipe item with no linked recipes reads as Incomplete (danger) and shows
    // the danger "No recipes" chip.
    const incompleteType = root.querySelector('[data-books-scrolls-type="empty"]');
    assert.equal(incompleteType.textContent.trim(), 'Incomplete');
    assert.ok(incompleteType.classList.contains('is-danger'));
    const emptyChip = root.querySelector('[data-books-scrolls-recipe-count="empty"]');
    assert.equal(emptyChip.querySelector('span').textContent.trim(), 'No recipes');
    assert.ok(emptyChip.classList.contains('is-danger'));
  });

  it('shows the USE chip in item mode', async () => {
    const root = await harness.mount({
      recipeItems: [makeItem({ caps: { item: { limitUses: true, maxUses: 3 }, learn: {} } })],
      visibilityMode: 'item'
    });
    assert.equal(capChipText(root, 'primer'), '3 uses');
  });

  it('shows the LEARNING chip in knowledge mode and switches with visibilityMode', async () => {
    const item = makeItem({ caps: { item: { limitUses: true, maxUses: 3 }, learn: { limitLearning: true, learnScope: 'perInstance', learnsAllowed: 1 } } });

    const knowledge = await harness.mount({ recipeItems: [item], visibilityMode: 'knowledge' });
    assert.equal(capChipText(knowledge, 'primer'), '1 / copy');

    harness.remount();
    const itemMode = await harness.mount({ recipeItems: [item], visibilityMode: 'item' });
    assert.equal(capChipText(itemMode, 'primer'), '3 uses');
  });

  it('renders the total-scope and free chip variants', async () => {
    const total = await harness.mount({
      recipeItems: [makeItem({ caps: { learn: { limitLearning: true, learnScope: 'total', learnsAllowed: 4 } } })],
      visibilityMode: 'knowledge'
    });
    assert.equal(capChipText(total, 'primer'), '4 total');

    harness.remount();
    const free = await harness.mount({
      recipeItems: [makeItem({ caps: { learn: { limitLearning: false } } })],
      visibilityMode: 'knowledge'
    });
    assert.equal(capChipText(free, 'primer'), 'Learn freely');
  });

  it('fires select, edit, and toggle callbacks', async () => {
    let selected = null;
    let edited = null;
    let toggled = null;
    const root = await harness.mount({
      recipeItems: [makeItem()],
      visibilityMode: 'knowledge',
      onSelectRecipeItem: (id) => { selected = id; },
      onOpenRecipeItem: (id) => { edited = id; },
      onToggleEnabled: (id, enabled) => { toggled = { id, enabled }; }
    });

    root.querySelector('[data-books-scrolls-select="primer"]').click();
    assert.equal(selected, 'primer');

    root.querySelector('[data-books-scrolls-edit="primer"]').click();
    assert.equal(edited, 'primer');

    // Enabled item → toggle requests disable (enabled: false).
    root.querySelector('[data-books-scrolls-toggle="primer"]').click();
    assert.deepEqual(toggled, { id: 'primer', enabled: false });

    // The blank-window "Create recipe item" dialog is gone (issue 844) — creation is
    // the drop-zone below. There is no create button.
    assert.equal(root.querySelector('[data-books-scrolls-create]'), null);
    assert.equal(root.querySelector('[data-books-scrolls-empty-create]'), null);
  });

  describe('creation drop-zone (issue 844)', () => {
    it('renders the drop-zone as the creation entry point (not a create button)', async () => {
      const root = await harness.mount({ recipeItems: [makeItem()], visibilityMode: 'item', dropEnabled: true });
      const zone = root.querySelector('[data-books-scrolls-drop-zone]');
      assert.ok(zone, 'expected the creation drop-zone');
      assert.equal(root.querySelector('[data-books-scrolls-create]'), null, 'the blank-dialog create button is gone');
      assert.equal(root.querySelector('[data-books-scrolls-drop-error]'), null, 'no error before any drop');
    });

    it('creates a recipe item from a dropped world Item uuid', async () => {
      const dropped = [];
      const root = await harness.mount({
        recipeItems: [],
        visibilityMode: 'item',
        dropEnabled: true,
        onDropRecipeItem: (uuid) => dropped.push(uuid)
      });
      fireDrop(root.querySelector('[data-books-scrolls-drop-zone]'), { type: 'Item', uuid: 'Item.abc123' });
      assert.deepEqual(dropped, ['Item.abc123']);
      assert.equal(root.querySelector('[data-books-scrolls-drop-error]'), null);
    });

    it('creates a recipe item from a dropped compendium Item (pack + id, no uuid)', async () => {
      const dropped = [];
      const root = await harness.mount({
        recipeItems: [],
        visibilityMode: 'item',
        dropEnabled: true,
        onDropRecipeItem: (uuid) => dropped.push(uuid)
      });
      fireDrop(root.querySelector('[data-books-scrolls-drop-zone]'), { type: 'Item', pack: 'dnd5e.items', id: 'xyz789' });
      assert.deepEqual(dropped, ['Compendium.dnd5e.items.xyz789']);
    });

    it('surfaces an error state (never a blank window) on a non-Item drop', async () => {
      const dropped = [];
      const root = await harness.mount({
        recipeItems: [],
        visibilityMode: 'item',
        dropEnabled: true,
        onDropRecipeItem: (uuid) => dropped.push(uuid)
      });
      fireDrop(root.querySelector('[data-books-scrolls-drop-zone]'), { type: 'Actor', uuid: 'Actor.def456' });
      flushSync();
      assert.deepEqual(dropped, [], 'a non-Item drop creates nothing');
      const errorNote = root.querySelector('[data-books-scrolls-drop-error]');
      assert.ok(errorNote, 'expected the inline error note');
      assert.ok(root.querySelector('[data-books-scrolls-drop-zone]').classList.contains('is-error'));
    });

    it('surfaces an error state on an unpersisted Item drop (type Item, no uuid)', async () => {
      const dropped = [];
      const root = await harness.mount({
        recipeItems: [],
        visibilityMode: 'item',
        dropEnabled: true,
        onDropRecipeItem: (uuid) => dropped.push(uuid)
      });
      // An unpersisted item drag carries `{ type: 'Item' }` with no resolvable uuid.
      fireDrop(root.querySelector('[data-books-scrolls-drop-zone]'), { type: 'Item' });
      flushSync();
      assert.deepEqual(dropped, []);
      assert.ok(root.querySelector('[data-books-scrolls-drop-error]'), 'expected the inline error note');
    });
  });

  it('dims disabled rows', async () => {
    const root = await harness.mount({
      recipeItems: [makeItem({ enabled: false })],
      visibilityMode: 'knowledge'
    });
    assert.ok(root.querySelector('[data-books-scrolls-item="primer"]').classList.contains('is-disabled'));
  });

  it('renders the empty state when there are no recipe items', async () => {
    const root = await harness.mount({ recipeItems: [], visibilityMode: 'knowledge' });
    assert.ok(root.querySelector('[data-books-scrolls-empty]'));
    assert.equal(root.querySelectorAll('[data-books-scrolls-item]').length, 0);
  });
});
