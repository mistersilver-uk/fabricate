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

  it('renders the favourites/craftable toggles and reflects their active state', async () => {
    const target = await harness.mount({
      recipes: [recipe({ id: 'r1' })],
      totalCount: 1,
      favouritesOnly: true,
      craftableOnly: false,
    });

    const fav = target.querySelector('[data-filter="favourites"]');
    const craft = target.querySelector('[data-filter="craftable"]');
    assert.ok(fav && craft, 'both filter toggles render on one row');
    assert.ok(fav.classList.contains('is-active'), 'favourites toggle reflects the active filter');
    assert.equal(fav.getAttribute('aria-pressed'), 'true');
    assert.equal(craft.classList.contains('is-active'), false, 'craftable toggle is inactive');
  });

  it('forwards the filter toggle and system-change callbacks', async () => {
    let favToggles = 0;
    let craftToggles = 0;
    const systems = [];
    const target = await harness.mount({
      recipes: [recipe({ id: 'r1' })],
      totalCount: 1,
      systems: [
        { id: 'sys-a', name: 'Smithing' },
        { id: 'sys-b', name: 'Armoury' },
      ],
      onToggleFavourites: () => (favToggles += 1),
      onToggleCraftable: () => (craftToggles += 1),
      onSystemChange: (id) => systems.push(id),
    });

    target.querySelector('[data-filter="favourites"]').click();
    target.querySelector('[data-filter="craftable"]').click();
    flushSync();
    assert.equal(favToggles, 1, 'favourites toggle callback fired');
    assert.equal(craftToggles, 1, 'craftable toggle callback fired');

    const select = target.querySelector('.crafting-browser-filter-system select');
    assert.ok(select, 'system dropdown renders on its own line');
    assert.equal(
      select.querySelectorAll('option').length,
      3,
      'all-systems + one option per system'
    );
    select.value = 'sys-b';
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
    flushSync();
    assert.deepEqual(systems, ['sys-b'], 'system change forwards the selected id');
  });

  it('marks favourited rows and forwards the row favourite toggle', async () => {
    const toggled = [];
    const target = await harness.mount({
      recipes: [recipe({ id: 'r1' }), recipe({ id: 'r2', name: 'Antitoxin' })],
      totalCount: 2,
      favouriteIds: ['r2'],
      onToggleFavourite: (id) => toggled.push(id),
    });

    const r1Fav = target.querySelector('[data-recipe-id="r1"] .crafting-recipe-row-fav');
    const r2Fav = target.querySelector('[data-recipe-id="r2"] .crafting-recipe-row-fav');
    assert.equal(r1Fav.classList.contains('is-active'), false, 'unfavourited row star is inactive');
    assert.ok(r2Fav.classList.contains('is-active'), 'favourited row star is active');

    r1Fav.click();
    flushSync();
    assert.deepEqual(toggled, ['r1'], 'row star forwards onToggleFavourite with the recipe id');
  });

  it('hides the system dropdown when no systems are supplied', async () => {
    const target = await harness.mount({
      recipes: [recipe({ id: 'r1' })],
      totalCount: 1,
      systems: [],
    });
    assert.equal(
      target.querySelector('.crafting-browser-filter-system'),
      null,
      'no system dropdown without systems'
    );
  });

  it('renders the category badge with the localized label (not the raw token) on a non-general row', async () => {
    const target = await harness.mount({
      recipes: [recipe({ id: 'r1', category: 'weapons', categoryLabel: 'Weapons' })],
      totalCount: 1,
    });
    const badge = target.querySelector('[data-recipe-id="r1"] .crafting-recipe-row-category');
    assert.ok(badge, 'a non-general row shows the category badge');
    assert.equal(badge.textContent.trim(), 'Weapons', 'badge text is the categoryLabel, not the raw token');
    assert.equal(badge.getAttribute('title'), 'Weapons', 'full label available via title on hover');
  });

  it('suppresses the category badge for a general recipe (keyed on category, not redaction)', async () => {
    const target = await harness.mount({
      // A general recipe that is NOT redacted → badge must still be suppressed.
      recipes: [recipe({ id: 'r1', category: 'general', categoryLabel: 'General' })],
      totalCount: 1,
    });
    const row = target.querySelector('[data-recipe-id="r1"]');
    assert.equal(
      row.querySelector('.crafting-recipe-row-category'),
      null,
      'the reserved general bucket is not badged'
    );
  });

  it('renders the category badge on an uncraftable/danger row too', async () => {
    const target = await harness.mount({
      recipes: [
        recipe({
          id: 'r1',
          browseStatus: 'missingMaterials',
          category: 'weapons',
          categoryLabel: 'Weapons',
        }),
      ],
      totalCount: 1,
    });
    const row = target.querySelector('[data-recipe-id="r1"]');
    assert.ok(row.classList.contains('is-uncraftable'), 'row is the danger layout');
    const badge = row.querySelector('.crafting-recipe-row-category');
    assert.ok(badge, 'the category badge renders in the uncraftable layout');
    assert.equal(badge.textContent.trim(), 'Weapons');
  });

  it('renders the category dropdown with an all-categories option and forwards the change', async () => {
    const chosen = [];
    const target = await harness.mount({
      recipes: [recipe({ id: 'r1' })],
      totalCount: 1,
      categories: [
        { id: 'armor', name: 'Armor' },
        { id: 'weapons', name: 'Weapons' },
      ],
      onCategoryChange: (id) => chosen.push(id),
    });

    const select = target.querySelector('.crafting-browser-filter-category select');
    assert.ok(select, 'category dropdown renders');
    const options = select.querySelectorAll('option');
    assert.equal(options.length, 3, 'all-categories + one option per distinct category');
    assert.equal(options[0].value, '', 'the first option is the value="" all-categories option');

    select.value = 'weapons';
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
    flushSync();
    assert.deepEqual(chosen, ['weapons'], 'category change forwards the selected id');
  });

  it('hides the category dropdown when no categories are supplied', async () => {
    const target = await harness.mount({
      recipes: [recipe({ id: 'r1' })],
      totalCount: 1,
      categories: [],
    });
    assert.equal(
      target.querySelector('.crafting-browser-filter-category'),
      null,
      'no category dropdown without categories'
    );
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
