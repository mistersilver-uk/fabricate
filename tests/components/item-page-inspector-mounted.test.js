import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-item-page-',
  rawModules: ['src/ui/svelte/util/foundryBridge.js'],
  compiledModules: ['src/ui/svelte/apps/manager/ItemPageInspector.svelte'],
  componentPath: 'src/ui/svelte/apps/manager/ItemPageInspector.svelte'
});

function makeItem(overrides = {}) {
  return {
    id: 'primer',
    resolvedName: "Journeyman's Primer",
    resolvedImg: 'icons/svg/book.svg',
    derivedType: 'Book',
    description: 'Starter recipes for every apprentice.',
    enabled: true,
    caps: { item: { limitUses: true, maxUses: 4 }, learn: { limitLearning: true, learningMode: 'once' } },
    recipes: [
      { id: 'r1', name: 'Smelt Copper', category: 'Smithing' },
      { id: 'r2', name: 'Forge Rivets', category: 'Smithing' },
      { id: 'r3', name: 'Basic Whetstone', category: 'Smithing' },
      { id: 'r4', name: 'Mend Tool', category: 'Smithing' },
      { id: 'r5', name: 'Render Tallow', category: 'Alchemy' }
    ],
    learnedByCount: 6,
    linkMissing: false,
    ...overrides
  };
}

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('ItemPageInspector (mounted)', () => {
  it('shows the three-stat grid with the middle stat switching by visibility mode', async () => {
    const itemMode = await harness.mount({ item: makeItem(), visibilityMode: 'item' });
    assert.equal(itemMode.querySelector('[data-item-page-recipe-count]').textContent.trim(), '5');
    assert.equal(itemMode.querySelector('[data-item-page-learned-by]').textContent.trim(), '6');
    assert.equal(itemMode.querySelector('[data-item-page-mid-label]').textContent.trim(), 'Uses');
    assert.equal(itemMode.querySelector('[data-item-page-mid-value]').textContent.trim(), '4');

    harness.remount();
    const knowledge = await harness.mount({ item: makeItem(), visibilityMode: 'knowledge' });
    assert.equal(knowledge.querySelector('[data-item-page-mid-label]').textContent.trim(), 'Learning');
    assert.equal(knowledge.querySelector('[data-item-page-mid-value]').textContent.trim(), '1×');
  });

  it('renders the name, type, description, and a "recipes inside" preview with a +N more line', async () => {
    const root = await harness.mount({ item: makeItem(), visibilityMode: 'knowledge' });
    assert.equal(root.querySelector('[data-item-page-name]').textContent.trim(), "Journeyman's Primer");
    assert.equal(root.querySelector('[data-item-page-type]').textContent.trim(), 'Book');
    assert.equal(root.querySelector('[data-item-page-desc]').textContent.trim(), 'Starter recipes for every apprentice.');

    // Only the first three recipes preview; the rest collapse into "+2 more".
    assert.equal(root.querySelectorAll('[data-item-page-recipe]').length, 3);
    assert.equal(root.querySelector('[data-item-page-more]').textContent.trim(), '+2 more recipes');
  });

  it('marks a recipe item with no linked recipes as an Incomplete (danger) type', async () => {
    const root = await harness.mount({
      item: makeItem({ derivedType: 'Incomplete', recipes: [] }),
      visibilityMode: 'knowledge'
    });
    const typePill = root.querySelector('[data-item-page-type]');
    assert.equal(typePill.textContent.trim(), 'Incomplete');
    assert.ok(typePill.classList.contains('is-danger'));
    assert.equal(root.querySelector('[data-item-page-recipe-count]').textContent.trim(), '0');
  });

  it('fires the edit, enable-toggle, and quick-limit callbacks', async () => {
    let edited = null;
    let toggled = null;
    let quickLimit = null;
    const root = await harness.mount({
      item: makeItem({ caps: { item: { limitUses: false }, learn: { limitLearning: false } } }),
      visibilityMode: 'item',
      onOpenRecipeItem: (id) => { edited = id; },
      onToggleEnabled: (id, enabled) => { toggled = { id, enabled }; },
      onToggleQuickLimit: (id, limited) => { quickLimit = { id, limited }; }
    });

    root.querySelector('[data-item-page-edit]').click();
    assert.equal(edited, 'primer');

    root.querySelector('[data-item-page-toggle]').click();
    assert.deepEqual(toggled, { id: 'primer', enabled: false });

    // Currently unlimited → toggling requests Limited use (limited: true).
    root.querySelector('[data-item-page-quick-limit-toggle]').click();
    assert.deepEqual(quickLimit, { id: 'primer', limited: true });
  });

  it('renders a placeholder when no item is selected', async () => {
    const root = await harness.mount({ item: null, visibilityMode: 'item' });
    assert.ok(root.querySelector('[data-item-page-empty]'));
    assert.equal(root.querySelector('[data-item-page-stats]'), null);
  });

  it('reads the unlimited use value as the infinity glyph', async () => {
    const root = await harness.mount({
      item: makeItem({ caps: { item: { limitUses: false }, learn: {} } }),
      visibilityMode: 'item'
    });
    assert.equal(root.querySelector('[data-item-page-mid-value]').textContent.trim(), '∞');
  });
});
