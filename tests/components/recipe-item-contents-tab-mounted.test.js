import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-recipe-item-contents-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    // The recipe thumbnails resolve through the shared pure image helper (issue 544).
    'src/ui/svelte/util/craftingImageDefaults.js',
  ],
  compiledModules: ['src/ui/svelte/apps/manager/recipe-item/RecipeItemContentsTab.svelte'],
  componentPath: 'src/ui/svelte/apps/manager/recipe-item/RecipeItemContentsTab.svelte',
});

const LINKED = [
  { id: 'r1', name: 'Alloy Bronze', category: 'Smithing' },
  { id: 'r2', name: 'Refine Steel', category: 'Smithing' },
];
const AVAILABLE = [
  { id: 'r1', name: 'Alloy Bronze', category: 'Smithing' },
  { id: 'r3', name: 'Veil Powder', category: 'Alchemy' },
];

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('RecipeItemContentsTab (mounted)', () => {
  it('lists the linked recipes with name and category', async () => {
    const root = await harness.mount({ linkedRecipes: LINKED, availableRecipes: AVAILABLE });
    const rows = root.querySelectorAll('[data-recipe-item-recipe]');
    assert.equal(rows.length, 2);
    assert.equal(
      rows[0].querySelector('.manager-recipe-item-recipe-name').textContent.trim(),
      'Alloy Bronze'
    );
    assert.equal(
      rows[0].querySelector('.manager-recipe-item-recipe-cat').textContent.trim(),
      'Smithing'
    );
  });

  it('shows an empty state with no linked recipes', async () => {
    const root = await harness.mount({ linkedRecipes: [], availableRecipes: AVAILABLE });
    assert.ok(root.querySelector('[data-recipe-item-contents-empty]'));
  });

  it('renders the blueprint (not the item-bag) for a recipe with a generic/empty image (issue 544)', async () => {
    const root = await harness.mount({
      linkedRecipes: [
        { id: 'bag', name: 'Forge Club', category: 'Smithing', img: 'icons/svg/item-bag.svg' },
        { id: 'empty', name: 'Forge Handaxe', category: 'Smithing', img: '' },
        {
          id: 'real',
          name: 'Alloy Bronze',
          category: 'Smithing',
          img: 'icons/tools/smithing/anvil.webp',
        },
      ],
      availableRecipes: [],
    });
    const src = (id) =>
      root.querySelector(`[data-recipe-item-recipe="${id}"] img`).getAttribute('src');
    assert.match(
      src('bag'),
      /blueprint-recipe-alchemical\.webp$/,
      'a generic-bag recipe shows the blueprint'
    );
    assert.ok(!/item-bag\.svg$/.test(src('bag')), 'the bag SVG is not shown');
    assert.match(
      src('empty'),
      /blueprint-recipe-alchemical\.webp$/,
      'an empty-image recipe shows the blueprint'
    );
    assert.equal(
      src('real'),
      'icons/tools/smithing/anvil.webp',
      'a real authored image passes through'
    );
  });

  it('fires onRemoveRecipe with the recipe id', async () => {
    const calls = [];
    const root = await harness.mount({
      linkedRecipes: LINKED,
      availableRecipes: AVAILABLE,
      onRemoveRecipe: (id) => calls.push(id),
    });
    root.querySelector('[data-recipe-item-remove-recipe="r2"]').click();
    assert.deepEqual(calls, ['r2']);
  });

  it('opens the link picker offering only unlinked recipes and fires onLinkRecipe', async () => {
    const calls = [];
    const root = await harness.mount({
      linkedRecipes: LINKED,
      availableRecipes: AVAILABLE,
      onLinkRecipe: (id) => calls.push(id),
    });
    root.querySelector('[data-recipe-item-link-recipe-toggle]').click();
    flushSync();
    const options = root.querySelectorAll('[data-recipe-item-link-recipe-option]');
    // r1 is already linked, so only r3 is offered.
    assert.equal(options.length, 1);
    assert.equal(options[0].getAttribute('data-recipe-item-link-recipe-option'), 'r3');
    options[0].click();
    assert.deepEqual(calls, ['r3']);
  });

  it('disables the link affordance when nothing is linkable', async () => {
    const root = await harness.mount({ linkedRecipes: LINKED, availableRecipes: LINKED });
    assert.equal(root.querySelector('[data-recipe-item-link-recipe-toggle]').disabled, true);
  });
});
