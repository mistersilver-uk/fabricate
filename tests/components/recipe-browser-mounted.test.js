import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';

import {
  createMountedComponentHarness,
  CRAFTING_APP_RAW_MODULES,
  CRAFTING_APP_COMPILED_MODULES,
} from '../helpers/svelte-component-harness.js';
import { recipe } from '../helpers/crafting-fixtures.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-recipe-browser-',
  rawModules: CRAFTING_APP_RAW_MODULES,
  compiledModules: CRAFTING_APP_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/apps/crafting/RecipeBrowser.svelte',
});

describe('RecipeBrowser mounted behavior', () => {
  before(harness.setup);
  after(harness.teardown);
  afterEach(harness.remount);

  it('renders a status-badged row per recipe and marks the selected one', async () => {
    const recipes = [
      recipe({ id: 'r1', name: 'Healing Potion' }),
      recipe({ id: 'r2', name: 'Antitoxin', browseStatus: 'missingMaterials' }),
    ];
    const target = await harness.mount({
      recipes,
      totalCount: recipes.length,
      selectedRecipeId: 'r2',
    });

    assert.equal(target.querySelectorAll('[data-recipe-id]').length, 2, 'one row per recipe');
    assert.ok(
      target.querySelector('[data-recipe-id="r1"] [data-crafting-status]'),
      'row carries a status badge'
    );
    const selected = target.querySelector('[data-recipe-id="r2"]');
    assert.equal(selected.getAttribute('data-selected'), 'true', 'selected row marked');
    assert.equal(
      target.querySelector('[data-recipe-id="r2"][data-recipe-status="missingMaterials"]') != null,
      true,
      'row exposes its browse status'
    );
  });

  it('calls out an uncraftable row with the error tint and a thumbnail pip (no meta badge)', async () => {
    const recipes = [
      recipe({ id: 'r1', name: 'Healing Potion' }),
      recipe({ id: 'r2', name: 'Antitoxin', browseStatus: 'missingMaterials' }),
    ];
    const target = await harness.mount({ recipes, totalCount: recipes.length });

    const craftable = target.querySelector('[data-recipe-id="r1"]');
    const uncraftable = target.querySelector('[data-recipe-id="r2"]');

    // Whole-row error tint only on the uncraftable recipe.
    assert.ok(uncraftable.classList.contains('is-uncraftable'), 'uncraftable row is tinted');
    assert.equal(
      craftable.classList.contains('is-uncraftable'),
      false,
      'craftable row is not tinted'
    );

    // The status moves onto the thumbnail as a pip; the meta badge is dropped.
    assert.ok(
      uncraftable.querySelector('.crafting-recipe-row-thumb .crafting-recipe-row-pip'),
      'error pip overlays the thumbnail'
    );
    assert.ok(
      uncraftable.querySelector('.crafting-recipe-row-thumb.is-uncraftable'),
      'thumbnail is flagged for the faded/scrim treatment'
    );
    assert.equal(
      uncraftable.querySelector('.crafting-recipe-row-meta [data-crafting-status]'),
      null,
      'uncraftable row drops its compact meta badge'
    );

    // A craftable row keeps its meta badge and shows no pip.
    assert.ok(
      craftable.querySelector('.crafting-recipe-row-meta [data-crafting-status]'),
      'craftable row keeps the compact meta badge'
    );
    assert.equal(
      craftable.querySelector('.crafting-recipe-row-pip'),
      null,
      'craftable row has no thumbnail pip'
    );
  });

  it('renders the recents strip when recents are present', async () => {
    const recipes = [recipe({ id: 'r1', name: 'Healing Potion' })];
    const target = await harness.mount({
      recipes,
      totalCount: 1,
      recents: [{ id: 'r1', name: 'Healing Potion', img: null }],
    });
    assert.ok(target.querySelector('[data-crafting-recents]'), 'recents strip rendered');
    assert.ok(target.querySelector('[data-recent-id="r1"]'), 'recent chip rendered');
  });

  it('forwards search input to onSearch', async () => {
    const searches = [];
    const target = await harness.mount({
      recipes: [recipe()],
      totalCount: 1,
      onSearch: (value) => searches.push(value),
    });

    const input = target.querySelector('.crafting-browser-search input');
    input.value = 'heal';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    flushSync();
    assert.deepEqual(searches, ['heal'], 'onSearch called with the typed value');
  });

  it('selects a recipe on row click', async () => {
    const selected = [];
    const target = await harness.mount({
      recipes: [recipe({ id: 'r1' }), recipe({ id: 'r2', name: 'Antitoxin' })],
      totalCount: 2,
      onSelect: (id) => selected.push(id),
    });

    target.querySelector('[data-recipe-id="r2"] .crafting-recipe-row-main').click();
    flushSync();
    assert.deepEqual(selected, ['r2'], 'onSelect called with the clicked recipe id');
  });

  it('adds a recipe to the shopping list via the row cart button', async () => {
    const added = [];
    const target = await harness.mount({
      recipes: [recipe({ id: 'r1' })],
      totalCount: 1,
      onAddToShoppingList: (id) => added.push(id),
    });

    target.querySelector('[data-recipe-id="r1"] .crafting-recipe-row-add').click();
    flushSync();
    assert.deepEqual(added, ['r1'], 'onAddToShoppingList called with the recipe id');
  });

  it('shows a no-matches message while searching with no results', async () => {
    const target = await harness.mount({ recipes: [], totalCount: 0, search: 'zzz' });
    const empty = target.querySelector('[data-crafting-browser-empty]');
    assert.ok(empty, 'empty message rendered');
    assert.match(empty.textContent, /NoMatches/, 'uses the no-matches localization key');
  });

  it('shows a generic empty message when not searching and there are no recipes', async () => {
    const target = await harness.mount({ recipes: [], totalCount: 0, search: '' });
    const empty = target.querySelector('[data-crafting-browser-empty]');
    assert.ok(empty, 'empty message rendered');
    assert.match(empty.textContent, /Browser\.Empty/, 'uses the generic empty localization key');
  });
});
