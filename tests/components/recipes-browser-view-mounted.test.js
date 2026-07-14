/**
 * The rebuilt GM recipe library (issue 643) and its extracted inspector.
 *
 * The load-bearing assertions here are the DEFAULTS the smoke harness depends on
 * (groups expanded, filters at `all`, a page size that clears the fixture count —
 * the harness waits for a VISIBLE row and throws "Manager rendered no table rows"
 * on zero) and the blocked-enable flash, which must OWN the refusal message: the
 * store suppresses its Foundry notification while a flash handler is supplied, so a
 * component that surfaced the error itself would double-report it.
 */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const RECIPE_RAW_MODULES = [
  'src/ui/svelte/util/foundryBridge.js',
  'src/ui/svelte/util/craftingImageDefaults.js',
  'src/utils/recipeCategories.js',
  'src/utils/recipeBrowserModel.js'
];

const RECIPE_PRIMITIVES = [
  'src/ui/svelte/components/Pagination.svelte',
  'src/ui/svelte/components/Medallion.svelte',
  'src/ui/svelte/components/StatusPill.svelte',
  'src/ui/svelte/components/CollapsibleGroupHeader.svelte'
];

const browser = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-recipes-browser-',
  rawModules: RECIPE_RAW_MODULES,
  compiledModules: [
    ...RECIPE_PRIMITIVES,
    'src/ui/svelte/apps/manager/SegmentedControl.svelte',
    'src/ui/svelte/apps/manager/RecipesBrowserView.svelte'
  ],
  componentPath: 'src/ui/svelte/apps/manager/RecipesBrowserView.svelte'
});

const inspector = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-recipe-browser-inspector-',
  rawModules: RECIPE_RAW_MODULES,
  compiledModules: [
    ...RECIPE_PRIMITIVES,
    'src/ui/svelte/apps/manager/recipes/RecipeBrowserInspector.svelte'
  ],
  componentPath: 'src/ui/svelte/apps/manager/recipes/RecipeBrowserInspector.svelte'
});

function makeRecipe(overrides = {}) {
  return {
    id: overrides.id || 'r1',
    name: overrides.name || 'Healing Draught',
    description: 'Restores a small amount of health.',
    img: 'icons/svg/book.svg',
    category: 'general',
    enabled: true,
    locked: false,
    incomplete: false,
    stepCount: 1,
    ingredientCount: 2,
    resultItemCount: 1,
    resultGroupCount: 1,
    checkSummary: { kind: 'dc', dc: 15 },
    requirementsPreview: [],
    ...overrides
  };
}

const CATEGORIES = [
  { name: 'alchemy', count: 1 },
  { name: 'smithing', count: 1 }
];

const GROUPED = [
  makeRecipe({ id: 'r1', name: 'Acid Flask', category: 'alchemy' }),
  makeRecipe({ id: 'r2', name: 'Bronze Ingot', category: 'smithing', ingredientCount: 4 })
];

function rowIds(root) {
  return [...root.querySelectorAll('.manager-recipe-row')].map((row) => row.dataset.recipeId);
}

before(async () => {
  await browser.setup();
  await inspector.setup();
});
after(() => {
  browser.teardown();
  inspector.teardown();
});
afterEach(() => {
  browser.remount();
  inspector.remount();
});

describe('RecipesBrowserView defaults (the smoke harness depends on these)', () => {
  it('renders every recipe with its category groups EXPANDED and no filter applied', async () => {
    const root = await browser.mount({
      recipes: GROUPED,
      recipeCategories: CATEGORIES,
      showRecipeCategories: true
    });

    assert.deepEqual(rowIds(root), ['r1', 'r2'], 'both recipes are visible on page 1');
    const headers = [...root.querySelectorAll('[data-group-header]')];
    assert.equal(headers.length, 2, 'one header per category');
    for (const header of headers) {
      assert.equal(header.getAttribute('aria-expanded'), 'true', 'groups default to expanded');
    }
    assert.equal(root.querySelector('[data-recipe-filter-chip]'), null, 'no filter starts active');
    assert.equal(root.querySelector('.manager-pagination'), null, 'the fixture fits one page');
  });

  it('renders the rows as a list of cards, not a table', async () => {
    const root = await browser.mount({ recipes: GROUPED, showRecipeCategories: false });
    assert.equal(root.querySelector('.manager-recipe-group-list').getAttribute('role'), 'list');
    assert.equal(root.querySelector('.manager-recipe-row').tagName, 'LI');
    assert.equal(root.querySelector('[role="table"]'), null);
  });

  it('collapses and re-expands a category group through its header button', async () => {
    const root = await browser.mount({
      recipes: GROUPED,
      recipeCategories: CATEGORIES,
      showRecipeCategories: true
    });
    const header = root.querySelector('[data-group-header]');
    const controls = header.getAttribute('aria-controls');

    header.click();
    flushSync();
    assert.equal(header.getAttribute('aria-expanded'), 'false');
    assert.equal(root.querySelector(`#${controls}`), null, 'the collapsed group hides its rows');
    assert.deepEqual(rowIds(root), ['r2']);

    header.click();
    flushSync();
    assert.deepEqual(rowIds(root), ['r1', 'r2']);
  });
});

describe('RecipesBrowserView filtering and sorting', () => {
  it('filters by status and by lock state, each with a clearable chip', async () => {
    const rows = [
      makeRecipe({ id: 'r1', name: 'On' }),
      makeRecipe({ id: 'r2', name: 'Off', enabled: false }),
      makeRecipe({ id: 'r3', name: 'Locked', locked: true })
    ];
    const root = await browser.mount({ recipes: rows });

    const off = root.querySelector('[data-recipe-status-option="off"] input');
    off.checked = true;
    off.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
    flushSync();
    assert.deepEqual(rowIds(root), ['r2']);
    assert.ok(root.querySelector('[data-recipe-filter-chip="status"]'));

    root.querySelector('[data-recipe-filter-chip="status"] .manager-recipe-chip-clear').click();
    flushSync();

    const locked = root.querySelector('[data-recipe-lock-option="locked"] input');
    locked.checked = true;
    locked.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
    flushSync();
    assert.deepEqual(rowIds(root), ['r3']);
    assert.ok(root.querySelector('[data-recipe-filter-chip="lock"]'));
  });

  it('flips the sort direction without changing the sort key', async () => {
    const root = await browser.mount({ recipes: GROUPED, showRecipeCategories: false });
    assert.deepEqual(rowIds(root), ['r1', 'r2'], 'name ascending by default');

    const direction = root.querySelector('[data-recipe-sort-direction]');
    assert.equal(direction.dataset.recipeSortDirection, 'asc');
    direction.click();
    flushSync();

    assert.equal(
      root.querySelector('[data-recipe-sort-direction]').dataset.recipeSortDirection,
      'desc'
    );
    assert.deepEqual(rowIds(root), ['r2', 'r1']);
  });

  it('offers an empty state that clears the filters', async () => {
    const root = await browser.mount({ recipes: [makeRecipe({ id: 'r1' })] });

    const off = root.querySelector('[data-recipe-status-option="off"] input');
    off.checked = true;
    off.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
    flushSync();
    assert.deepEqual(rowIds(root), []);

    root.querySelector('[data-clear-filters="recipes"]').click();
    flushSync();
    assert.deepEqual(rowIds(root), ['r1']);
  });
});

describe('RecipesBrowserView row readout (issue 643 §9)', () => {
  const recipe = makeRecipe({ ingredientCount: 2, resultItemCount: 1, resultGroupCount: 3 });

  it('shows N in and N out in simple mode', async () => {
    const root = await browser.mount({ recipes: [recipe], resolutionMode: 'simple' });
    const io = root.querySelector('[data-recipe-io]');
    assert.match(io.textContent, /2 in/);
    assert.match(io.textContent, /1 out/);
    assert.equal(io.querySelector('.manager-recipe-io-routed'), null);
  });

  it('replaces the out half with the result-GROUP count plus a routing glyph in routed modes', async () => {
    for (const mode of ['routedByIngredients', 'routedByCheck']) {
      const root = await browser.mount({ recipes: [recipe], resolutionMode: mode });
      const io = root.querySelector('[data-recipe-io]');
      assert.match(io.textContent, /2 in/, `${mode} still reports the ingredient count`);
      assert.match(io.textContent, /3 groups/, `${mode} reports result GROUPS`);
      assert.equal(io.textContent.includes('out'), false, `${mode} must not invent an outputs count`);
      assert.ok(io.querySelector('.manager-recipe-io-routed'), `${mode} shows the routing glyph`);
      browser.remount();
    }
  });

  it('shows the projected check DC, and an em dash when the system has no usable check', async () => {
    const withDc = await browser.mount({ recipes: [makeRecipe({ checkSummary: { kind: 'dc', dc: 18 } })] });
    assert.equal(withDc.querySelector('[data-recipe-check]').dataset.recipeCheck, 'dc');
    assert.match(withDc.querySelector('[data-recipe-check]').textContent, /DC 18/);
    browser.remount();

    const noCheck = await browser.mount({ recipes: [makeRecipe({ checkSummary: { kind: 'none', dc: null } })] });
    const pill = noCheck.querySelector('[data-recipe-check]');
    assert.equal(pill.dataset.recipeCheck, 'none');
    assert.match(pill.textContent, /—/);
  });
});

describe('RecipesBrowserView lock and enable controls', () => {
  it('never hides the lock, enable or edit controls, and toggles the lock in both directions', async () => {
    const locks = [];
    const root = await browser.mount({
      recipes: [makeRecipe({ id: 'r1', locked: false }), makeRecipe({ id: 'r2', locked: true })],
      onToggleLocked: (id, locked) => locks.push([id, locked])
    });

    for (const id of ['r1', 'r2']) {
      const row = root.querySelector(`[data-recipe-id="${id}"]`);
      assert.ok(row.querySelector('[data-recipe-lock]'), 'the lock control is present');
      assert.ok(row.querySelector('.manager-status-toggle'), 'the enable toggle is present');
      assert.ok(row.querySelector('.manager-action-group i.fa-edit'), 'the edit action is present');
    }

    root.querySelector('[data-recipe-id="r1"] [data-recipe-lock]').click();
    root.querySelector('[data-recipe-id="r2"] [data-recipe-lock]').click();
    flushSync();

    assert.deepEqual(locks, [['r1', true], ['r2', false]], 'lock toggles both ways');
  });

  it('claims a blocked enable through the store seam and flashes it in-window, dismissibly', async () => {
    // The row asks the STORE to enable and hands it an `onBlocked` sink. Supplying
    // that sink is exactly what makes the store SUPPRESS its Foundry notification
    // (asserted against the real store in tests/stores/admin-store-recipe-lock.test.js),
    // so the GM never sees the same refusal twice. The component must therefore never
    // surface the error itself — it has no notification path at all.
    const calls = [];
    const root = await browser.mount({
      recipes: [makeRecipe({ id: 'r1', enabled: false, incomplete: true })],
      onToggleEnabled: (id, enabled, options) => calls.push({ id, enabled, options })
    });

    assert.equal(root.querySelector('[data-recipe-flash]'), null, 'no flash before a refusal');

    root.querySelector('[data-recipe-id="r1"] .manager-status-toggle').click();
    flushSync();

    assert.equal(calls.length, 1);
    assert.deepEqual([calls[0].id, calls[0].enabled], ['r1', true]);
    assert.equal(
      typeof calls[0].options.onBlocked,
      'function',
      'the row hands the store a blocked-message sink — this is the suppression seam'
    );

    // The store refuses and pushes the localized reason back through the sink.
    calls[0].options.onBlocked('This recipe has no result groups.');
    flushSync();

    const flash = root.querySelector('[data-recipe-flash]');
    assert.ok(flash, 'the refusal renders in-window, not as a Foundry toast');
    assert.equal(flash.getAttribute('role'), 'alert');
    assert.match(flash.textContent, /This recipe has no result groups\./);

    root.querySelector('[data-recipe-flash-dismiss]').click();
    flushSync();
    assert.equal(root.querySelector('[data-recipe-flash]'), null, 'the flash is dismissible');
  });

  it('never reaches for a Foundry notification itself', async () => {
    const source = readFileSync(
      resolve(repoRoot, 'src/ui/svelte/apps/manager/RecipesBrowserView.svelte'),
      'utf8'
    );
    assert.equal(source.includes('ui.notifications'), false, 'no bare ui.notifications call');
    assert.equal(/\bnotify[?.]/.test(source), false, 'the refusal never bypasses the flash');
  });
});

describe('RecipeBrowserInspector (mounted)', () => {
  it('renders the selected recipe with its image, facts and actions', async () => {
    let duplicated = 0;
    let deleted = 0;
    const root = await inspector.mount({
      selectedRecipe: makeRecipe({ id: 'r1', stepCount: 2, resultGroupCount: 3 }),
      recipeCount: 1,
      showRecipeCategories: true,
      onDuplicate: () => { duplicated += 1; },
      onDelete: () => { deleted += 1; }
    });

    assert.equal(root.querySelector('[data-medallion]').dataset.medallion, 'image');
    assert.equal(root.querySelector('[data-recipe-fact="steps"] strong').textContent, '2');
    assert.equal(root.querySelector('[data-recipe-fact="result-groups"] strong').textContent, '3');

    root.querySelector('[data-recipe-action="duplicate"]').click();
    root.querySelector('[data-recipe-action="delete"]').click();
    flushSync();
    assert.deepEqual([duplicated, deleted], [1, 1]);
  });

  it("says a locked, incomplete, disabled recipe can't be enabled", async () => {
    const root = await inspector.mount({
      selectedRecipe: makeRecipe({ id: 'r1', enabled: false, locked: true, incomplete: true }),
      recipeCount: 1
    });

    assert.ok(root.querySelector('[data-status-pill="accent"]'), 'the locked state shows');
    assert.equal(
      root.querySelector('[data-status-pill="danger"]').textContent.trim(),
      "Can't enable"
    );
  });

  it('routes an empty, component-less system to Components rather than to a dead form', async () => {
    let addComponents = 0;
    const root = await inspector.mount({
      selectedRecipe: null,
      recipeCount: 0,
      componentCount: 0,
      onAddComponents: () => { addComponents += 1; }
    });

    assert.match(root.textContent, /Set up recipes/);
    root.querySelector('.manager-button.is-primary').click();
    flushSync();
    assert.equal(addComponents, 1);
  });

  it('prompts for a selection when recipes exist but none is selected', async () => {
    const root = await inspector.mount({ selectedRecipe: null, recipeCount: 3 });
    assert.match(root.textContent, /Select a recipe/);
    assert.equal(root.querySelector('[data-recipe-inspector]'), null);
  });
});
