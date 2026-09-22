import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import {
  SEARCHABLE_POPOVER_RAW_MODULES,
  SELECT_COMPILED_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';
import { FOUNDRY_BRIDGE_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
// Issue 1510: all three toolbar filters are shared `<Select>`s.
import {
  assertSelectHasResolvedName,
  chooseSelectOption,
  selectOptionLabels,
  selectTriggerText,
} from '../helpers/select-control.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-books-scrolls-',
  rawModules: [
    // Issue 1504: the raw closure the shared `<Select>` reaches through `SearchablePopover`.
    ...SEARCHABLE_POPOVER_RAW_MODULES,
    ...FOUNDRY_BRIDGE_RAW_MODULES,
    'src/ui/svelte/util/listReorderAnnouncement.js',
    // The creation drop-zone (issue 844) resolves a drop via resolveDropData and
    // wires the drop listeners through the dragDrop action. Omitting either raw
    // module from the allowlist does not fail the mount — it HANGS (# cancelled).
    'src/ui/svelte/util/dropUtils.js',
    'src/ui/svelte/actions/dragDrop.js',
    // Issue 1510: the toolbar's three filter vocabularies, an import-free leaf.
    'src/ui/svelte/apps/manager/booksScrollsSelectOptions.js'
  ],
  compiledModules: [
    'src/ui/svelte/components/Pagination.svelte',
    // Issue 1504: the shared `<Select>`'s whole compiled closure.
    ...SELECT_COMPILED_MODULES,
    'src/ui/svelte/components/IconButton.svelte',
    // Issue 1515: the filter bar has a search field now, and it is the shared one.
    'src/ui/svelte/components/ManagerSearchField.svelte',
    'src/ui/svelte/components/ManagerToolbar.svelte',
    'src/ui/svelte/components/StatusToggle.svelte',
    'src/ui/svelte/apps/manager/BooksScrollsView.svelte'
  ],
  componentPath: 'src/ui/svelte/apps/manager/BooksScrollsView.svelte'
});

// Dispatch a Foundry-style drop on a node. getDragEventData (no `foundry` global in
// the harness) falls back to parsing `dataTransfer.getData('text/plain')`, so a
// JSON payload here round-trips exactly as a real world/compendium item drag would.
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
    assert.equal(root.querySelector('[data-books-scrolls-type="primer"]').textContent.trim(), '2 Recipe Book');
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

    // The blank-window "Create recipe item" dialog is gone (issue 844).
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

  // The toolbar's three filters (issue 1510). Two keep the `aria-label` their `<select>` carried;
  // the limits filter is named by its own conditional caption, so its announced name follows the
  // visibility mode rather than staying a string the GM never reads.
  describe('the converted toolbar filters', () => {
    const LIBRARY = [
      makeItem(),
      makeItem({
        id: 'scroll',
        resolvedName: 'Scroll of Soul-Ash',
        derivedType: 'Scroll',
        enabled: false,
        caps: { item: { limitUses: false }, learn: { limitLearning: true, learnsAllowed: 2 } },
        recipes: [{ id: 'r9', name: 'Bind Ash', category: 'Arcana' }]
      })
    ];

    const rowIds = (root) =>
      [...root.querySelectorAll('[data-books-scrolls-item]')].map((row) =>
        row.getAttribute('data-books-scrolls-item')
      );

    it('narrows the library by status, and keeps the name its select carried', async () => {
      const root = await harness.mount({ recipeItems: LIBRARY, visibilityMode: 'knowledge' });
      const filter = '[data-books-scrolls-status-filter]';

      assert.equal(assertSelectHasResolvedName(root, filter), 'Filter recipe items by status');
      assert.deepEqual(selectOptionLabels(root, filter), ['All statuses', 'On', 'Off']);

      chooseSelectOption(root, filter, 'disabled');
      flushSync();
      assert.equal(selectTriggerText(root, filter), 'Off');
      assert.deepEqual(rowIds(root), ['scroll']);
    });

    it('narrows the library by type, over the vocabulary the library itself produces', async () => {
      const root = await harness.mount({ recipeItems: LIBRARY, visibilityMode: 'knowledge' });
      const filter = '[data-books-scrolls-type-filter]';

      assert.equal(assertSelectHasResolvedName(root, filter), 'Filter recipe items by type');
      assert.deepEqual(selectOptionLabels(root, filter), ['All types', 'Book', 'Scroll']);

      chooseSelectOption(root, filter, 'Scroll');
      flushSync();
      assert.deepEqual(rowIds(root), ['scroll']);
    });

    it('narrows the library by limits, and is named by the caption the mode chooses', async () => {
      const root = await harness.mount({ recipeItems: LIBRARY, visibilityMode: 'knowledge' });
      const filter = '[data-books-scrolls-cap-filter]';

      // THE NARROWED NAME, BOOKED. Its `<select>` announced "Filter recipe items by limits", which
      // did not contain the visible caption at all — a WCAG 2.5.3 label-in-name mismatch — so the
      // trigger is named by the caption instead and the name follows the mode with it.
      assert.equal(assertSelectHasResolvedName(root, filter), 'Learning');
      assert.deepEqual(selectOptionLabels(root, filter), [
        'All',
        'Limited learning',
        'Learn freely'
      ]);

      chooseSelectOption(root, filter, 'limited');
      flushSync();
      assert.deepEqual(rowIds(root), ['scroll']);
    });

    it('re-words the limits filter, its name and its rows in item visibility mode', async () => {
      const root = await harness.mount({ recipeItems: LIBRARY, visibilityMode: 'item' });
      const filter = '[data-books-scrolls-cap-filter]';

      assert.equal(assertSelectHasResolvedName(root, filter), 'Uses');
      assert.deepEqual(selectOptionLabels(root, filter), ['All', 'Limited use', 'Unlimited']);
    });

    it('renders each filter caption as a span rather than a label around the trigger', async () => {
      const root = await harness.mount({ recipeItems: LIBRARY, visibilityMode: 'knowledge' });

      for (const hook of [
        '[data-books-scrolls-status-filter]',
        '[data-books-scrolls-type-filter]',
        '[data-books-scrolls-cap-filter]'
      ]) {
        const trigger = root.querySelector(hook);
        assert.ok(Boolean(trigger), `${hook} renders no converted trigger`);
        assert.ok(
          !trigger.closest('label'),
          `${hook} sits inside a caller-rendered <label>, whose caption click would dismiss the ` +
            'panel and then re-open it'
        );
        assert.equal(trigger.closest('.manager-filter').tagName, 'SPAN');
      }
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
