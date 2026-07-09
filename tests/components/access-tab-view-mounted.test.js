import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-access-tab-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/craftingImageDefaults.js',
    'src/utils/recipeCategories.js'
  ],
  compiledModules: [
    'src/ui/svelte/components/Pagination.svelte',
    'src/ui/svelte/apps/manager/AccessTabView.svelte'
  ],
  componentPath: 'src/ui/svelte/apps/manager/AccessTabView.svelte'
});

function makeRecipe(overrides = {}) {
  const characterCount = overrides.characterCount ?? 0;
  const playerCount = overrides.playerCount ?? 0;
  return {
    id: overrides.id || 'r1',
    name: overrides.name || 'Alloy Bronze',
    img: 'icons/svg/book.svg',
    category: overrides.category || 'smithing',
    accessSummary: { characterCount, playerCount },
    ...overrides
  };
}

function grantChipText(root, id) {
  return root.querySelector(`[data-access-grant="${id}"] span`).textContent.trim();
}

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('AccessTabView (mounted)', () => {
  it('renders a row per recipe with name, category, and grant chip', async () => {
    const root = await harness.mount({
      recipes: [
        makeRecipe({ id: 'alloy', name: 'Alloy Bronze', characterCount: 2, playerCount: 0 }),
        makeRecipe({ id: 'soul', name: 'Soul-Ash', characterCount: 0, playerCount: 1 })
      ],
      selectedSystemName: 'Mythwright'
    });

    assert.equal(root.querySelectorAll('[data-access-row]').length, 2);
    assert.equal(grantChipText(root, 'alloy'), '2 char · 0 player');
    assert.equal(grantChipText(root, 'soul'), '0 char · 1 player');
  });

  it('renders the danger "No access" chip when no one is granted', async () => {
    const root = await harness.mount({
      recipes: [makeRecipe({ id: 'longsword', name: 'Longsword', characterCount: 0, playerCount: 0 })]
    });
    const chip = root.querySelector('[data-access-grant="longsword"]');
    assert.equal(chip.querySelector('span').textContent.trim(), 'No access');
    assert.ok(chip.classList.contains('is-danger'));
  });

  it('filters by access state (granted / none)', async () => {
    const root = await harness.mount({
      recipes: [
        makeRecipe({ id: 'granted', name: 'Granted One', characterCount: 1, playerCount: 0 }),
        makeRecipe({ id: 'open', name: 'Open One', characterCount: 0, playerCount: 0 })
      ]
    });
    assert.equal(root.querySelectorAll('[data-access-row]').length, 2);

    const filter = root.querySelector('[data-access-filter]');
    filter.value = 'none';
    filter.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();

    const rows = root.querySelectorAll('[data-access-row]');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].getAttribute('data-access-row'), 'open');
  });

  it('marks the selected row and fires onSelectRecipe on click', async () => {
    let selected = null;
    const root = await harness.mount({
      recipes: [makeRecipe({ id: 'alloy', name: 'Alloy Bronze', characterCount: 1, playerCount: 0 })],
      selectedRecipeId: 'alloy',
      onSelectRecipe: (id) => { selected = id; }
    });

    const row = root.querySelector('[data-access-row="alloy"]');
    assert.ok(row.classList.contains('is-selected'));
    row.click();
    assert.equal(selected, 'alloy');
  });

  it('renders the empty state when there are no recipes', async () => {
    const root = await harness.mount({ recipes: [] });
    assert.ok(root.querySelector('.manager-empty'));
    assert.equal(root.querySelectorAll('[data-access-row]').length, 0);
  });
});
