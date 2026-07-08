import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-books-scrolls-',
  rawModules: ['src/ui/svelte/util/foundryBridge.js'],
  compiledModules: [
    'src/ui/svelte/components/Pagination.svelte',
    'src/ui/svelte/apps/manager/BooksScrollsView.svelte'
  ],
  componentPath: 'src/ui/svelte/apps/manager/BooksScrollsView.svelte'
});

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
    const item = makeItem({ caps: { item: { limitUses: true, maxUses: 3 }, learn: { limitLearning: true, learningMode: 'once' } } });

    const knowledge = await harness.mount({ recipeItems: [item], visibilityMode: 'knowledge' });
    assert.equal(capChipText(knowledge, 'primer'), 'Learn once');

    harness.remount();
    const itemMode = await harness.mount({ recipeItems: [item], visibilityMode: 'item' });
    assert.equal(capChipText(itemMode, 'primer'), '3 uses');
  });

  it('renders the party-learn and unlimited/free chip variants', async () => {
    const party = await harness.mount({
      recipeItems: [makeItem({ caps: { learn: { limitLearning: true, learningMode: 'party' } } })],
      visibilityMode: 'knowledge'
    });
    assert.equal(capChipText(party, 'primer'), 'Party learn');

    harness.remount();
    const free = await harness.mount({
      recipeItems: [makeItem({ caps: { learn: { limitLearning: false } } })],
      visibilityMode: 'knowledge'
    });
    assert.equal(capChipText(free, 'primer'), 'Learn freely');
  });

  it('fires select, edit, toggle, and create callbacks', async () => {
    let selected = null;
    let edited = null;
    let toggled = null;
    let created = 0;
    const root = await harness.mount({
      recipeItems: [makeItem()],
      visibilityMode: 'knowledge',
      onSelectRecipeItem: (id) => { selected = id; },
      onOpenRecipeItem: (id) => { edited = id; },
      onToggleEnabled: (id, enabled) => { toggled = { id, enabled }; },
      onCreateRecipeItem: () => { created += 1; }
    });

    root.querySelector('[data-books-scrolls-select="primer"]').click();
    assert.equal(selected, 'primer');

    root.querySelector('[data-books-scrolls-edit="primer"]').click();
    assert.equal(edited, 'primer');

    // Enabled item → toggle requests disable (enabled: false).
    root.querySelector('[data-books-scrolls-toggle="primer"]').click();
    assert.deepEqual(toggled, { id: 'primer', enabled: false });

    root.querySelector('[data-books-scrolls-create]').click();
    assert.equal(created, 1);
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
