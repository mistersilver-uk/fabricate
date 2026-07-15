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
import { createRecipeBrowserState } from '../../src/utils/recipeBrowserModel.js';

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

  // The model groups the PAGE, not the filtered list. A header counting the filtered
  // list therefore reads "12 recipes" above the three rows page 2 actually renders.
  it('counts what the group RENDERS, not what the whole filtered list holds', async () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      makeRecipe({
        id: `r${index + 1}`,
        // Zero-padded so name-ascending order is also numeric order.
        name: `Draught ${String(index + 1).padStart(2, '0')}`,
        category: 'alchemy'
      })
    );
    const root = await browser.mount({
      recipes: many,
      recipeCategories: [{ name: 'alchemy', count: 12 }],
      showRecipeCategories: true
    });

    const countText = () => root.querySelector('.fab-group-count').textContent.trim();
    const renderedRows = () => root.querySelectorAll('.manager-recipe-row').length;

    assert.equal(renderedRows(), 12, 'the default page holds all twelve');
    assert.equal(countText(), '12 recipes');

    const size = root.querySelector('[data-pagination-size]');
    size.value = '10';
    size.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
    flushSync();

    assert.equal(renderedRows(), 10, 'page 1 of a 10-row page');
    assert.equal(countText(), '10 recipes', 'the header counts the page, not the 12 filtered');

    root.querySelector('[data-pagination-next]').click();
    flushSync();

    assert.equal(renderedRows(), 2, 'page 2 holds the remaining two');
    assert.equal(countText(), '2 recipes', 'the header agrees with the two rows below it');
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

  it('says "1 group", never "1 groups"', async () => {
    const root = await browser.mount({
      recipes: [makeRecipe({ resultGroupCount: 1 })],
      resolutionMode: 'routedByCheck'
    });
    const io = root.querySelector('[data-recipe-io]').textContent;
    assert.match(io, /1 group\b/);
    assert.equal(/1 groups/.test(io), false);
  });

  it('shows the projected check DC in the mono face', async () => {
    const withDc = await browser.mount({ recipes: [makeRecipe({ checkSummary: { kind: 'dc', dc: 18 } })] });
    const dcPill = withDc.querySelector('[data-recipe-check]');
    assert.equal(dcPill.dataset.recipeCheck, 'dc');
    assert.match(dcPill.textContent, /DC 18/);
    // The DC is the archetypal numeric in this row: it takes the mono face. The
    // word-only kinds below do not — mono marks a number, it does not decorate a pill.
    assert.ok(dcPill.classList.contains('is-mono'), 'a DC is a numeric and reads in the mono face');
    browser.remount();

    const dynamic = await browser.mount({
      recipes: [makeRecipe({ checkSummary: { kind: 'dynamic', dc: null } })]
    });
    assert.equal(
      dynamic.querySelector('[data-recipe-check]').classList.contains('is-mono'),
      false,
      'a macro-resolved DC has no number to set'
    );
  });

  // The two check-LESS states are not the same fact, and the row must not tell the GM they
  // are. `none` means the system cannot roll for this recipe at all — a state a GM should
  // be able to SCAN a library for, which an em dash behind a ban glyph never let them do.
  // `ingredients` is its neutral sibling: a routedByIngredients craft resolves off the
  // ingredient set that was used, so no check is a working configuration, not a gap.
  it('warns when the system cannot roll for a recipe, and stays neutral when it need not', async () => {
    const noCheck = await browser.mount({
      recipes: [makeRecipe({ checkSummary: { kind: 'none', dc: null } })]
    });
    const warning = noCheck.querySelector('[data-recipe-check]');
    assert.equal(warning.dataset.recipeCheck, 'none');
    assert.match(warning.textContent, /No check/, 'a warning that says nothing is not a warning');
    assert.equal(/—/.test(warning.textContent), false, 'the em dash said nothing at all');
    assert.ok(warning.querySelector('i.fa-triangle-exclamation'), 'it reads as a warning');
    assert.equal(warning.querySelector('i.fa-ban'), null, 'the ban glyph is retired');
    assert.equal(warning.classList.contains('is-mono'), false, 'a phrase is not a number');
    browser.remount();

    const byIngredients = await browser.mount({
      recipes: [makeRecipe({ checkSummary: { kind: 'ingredients', dc: null } })]
    });
    const neutral = byIngredients.querySelector('[data-recipe-check]');
    assert.equal(neutral.dataset.recipeCheck, 'ingredients');
    assert.match(neutral.textContent, /By ingredients/);
    assert.ok(neutral.querySelector('i.fa-code-branch'), 'routing, not a roll');
    assert.equal(
      neutral.querySelector('i.fa-triangle-exclamation'),
      null,
      'a working configuration must not be reported as a problem'
    );
  });
});

// The count is quiet right-aligned METADATA and reports the page WINDOW. As a bordered
// mono chip reading "6 of 6" it looked like a control and never told the GM which page
// they were on.
describe('RecipesBrowserView result count', () => {
  it('reports the page window as a range, in plain muted text', async () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      makeRecipe({ id: `r${index + 1}`, name: `Draught ${String(index + 1).padStart(2, '0')}` })
    );
    const root = await browser.mount({ recipes: many });

    const count = root.querySelector('[data-recipe-count]');
    assert.equal(count.textContent.trim(), '1–12 of 12');
    assert.equal(count.classList.contains('manager-chip'), false, 'the count is not a chip to press');

    const size = root.querySelector('[data-pagination-size]');
    size.value = '10';
    size.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
    flushSync();
    assert.equal(root.querySelector('[data-recipe-count]').textContent.trim(), '1–10 of 12');

    root.querySelector('[data-pagination-next]').click();
    flushSync();
    assert.equal(
      root.querySelector('[data-recipe-count]').textContent.trim(),
      '11–12 of 12',
      'the count names the page the GM is actually looking at'
    );
  });
});

describe('RecipesBrowserView lock and enable controls', () => {
  it('never hides the lock or enable controls, and toggles the lock in both directions', async () => {
    const locks = [];
    const root = await browser.mount({
      recipes: [makeRecipe({ id: 'r1', locked: false }), makeRecipe({ id: 'r2', locked: true })],
      onToggleLocked: (id, locked) => locks.push([id, locked])
    });

    for (const id of ['r1', 'r2']) {
      const row = root.querySelector(`[data-recipe-id="${id}"]`);
      assert.ok(row.querySelector('[data-recipe-lock]'), 'the lock control is present');
      assert.ok(row.querySelector('.manager-status-toggle'), 'the enable toggle is present');
      // Duplicate / Delete stay inspector-only (issue 643): the row carries a single Edit
      // pencil, not the old three-icon action group.
      assert.equal(row.querySelector('.manager-action-group'), null, 'the row carries no action group');
    }

    root.querySelector('[data-recipe-id="r1"] [data-recipe-lock]').click();
    root.querySelector('[data-recipe-id="r2"] [data-recipe-lock]').click();
    flushSync();

    assert.deepEqual(locks, [['r1', true], ['r2', false]], 'lock toggles both ways');
  });

  // The row's Edit pencil is restored (issue 643), styled like the Books & Scrolls row
  // edit: a `.manager-icon-button` with a `fa-pen`, sitting after the enable toggle. It
  // is the primary way to open the editor from the row.
  it('renders a single Edit pencil per row that reports the recipe id', async () => {
    const edits = [];
    const root = await browser.mount({
      recipes: [makeRecipe({ id: 'r1', name: 'Acid Flask' }), makeRecipe({ id: 'r2', name: 'Bronze Ingot' })],
      onEditRecipe: (id) => edits.push(id)
    });

    for (const id of ['r1', 'r2']) {
      const editButton = root.querySelector(`[data-recipe-id="${id}"] [data-recipe-edit]`);
      assert.ok(editButton, 'the row carries its own Edit pencil');
      assert.ok(editButton.classList.contains('manager-icon-button'), 'styled like the Books & Scrolls row edit');
      assert.ok(editButton.querySelector('i.fa-pen'), 'the Edit affordance is a pen, matching Books & Scrolls');
    }

    root.querySelector('[data-recipe-id="r2"] [data-recipe-edit]').click();
    flushSync();
    assert.deepEqual(edits, ['r2'], 'clicking the pencil opens the editor for that row');
  });
});

describe('RecipesBrowserView column header (issue 643)', () => {
  it('labels the row columns once, above the whole list', async () => {
    const root = await browser.mount({
      recipes: GROUPED,
      recipeCategories: CATEGORIES,
      showRecipeCategories: true
    });

    const head = root.querySelector('.manager-recipe-table-head');
    assert.ok(head, 'the list carries a column header');
    // One header for the whole list — NOT one per category group.
    assert.equal(root.querySelectorAll('.manager-recipe-table-head').length, 1);
    assert.match(head.textContent, /Recipe/);
    assert.match(head.textContent, /Requirements/);
    assert.match(head.textContent, /Check/);
    assert.match(head.textContent, /Status/);
    // The header is decorative chrome; the rows carry their own labels.
    assert.equal(head.getAttribute('aria-hidden'), 'true');
  });

  it('renders no column header when the library is empty', async () => {
    const root = await browser.mount({ recipes: [] });
    assert.equal(root.querySelector('.manager-recipe-table-head'), null);
  });
});

// The filter / sort / group / paginate view-state is lifted to the manager root so it
// survives the edit round-trip (issue 643). The component reads and WRITES an external
// `browserState` object when one is bound; the round-trip itself is proven end-to-end in
// the mounted manager suite, but here we prove the seam: a bound object is mutated in
// place (so the root sees the change) and seeds the controls (so a restored object
// re-applies the GM's filters on remount).
describe('RecipesBrowserView lifted browser state', () => {
  it('writes control changes back into the bound browserState object', async () => {
    // A plain object is not a Svelte `$state` proxy, so the write lands but does not
    // reactively refilter the view here — the root passes a real proxy, and the live
    // refilter + round-trip is proven end-to-end in the mounted manager suite. This
    // proves the write REACHES the shared object rather than a hidden local copy.
    const shared = createRecipeBrowserState();
    const root = await browser.mount({
      recipes: [makeRecipe({ id: 'r1', name: 'On' }), makeRecipe({ id: 'r2', name: 'Off', enabled: false })],
      browserState: shared
    });

    const off = root.querySelector('[data-recipe-status-option="off"] input');
    off.checked = true;
    off.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
    flushSync();

    assert.equal(shared.statusFilter, 'off', 'the control write lands on the bound object, not local state');

    const direction = root.querySelector('[data-recipe-sort-direction]');
    direction.click();
    flushSync();
    assert.equal(shared.sortDirection, 'desc', 'the sort direction write lands on the bound object too');
  });

  it('seeds its controls from a restored browserState object on mount', async () => {
    const restored = createRecipeBrowserState();
    restored.statusFilter = 'off';
    restored.sortDirection = 'desc';
    const root = await browser.mount({
      recipes: [makeRecipe({ id: 'r1', name: 'On' }), makeRecipe({ id: 'r2', name: 'Off', enabled: false })],
      browserState: restored
    });

    // The status filter the GM left is re-applied without any interaction.
    assert.deepEqual(rowIds(root), ['r2'], 'the restored status filter is applied on mount');
    assert.equal(
      root.querySelector('[data-recipe-sort-direction]').dataset.recipeSortDirection,
      'desc',
      'the restored sort direction is applied on mount'
    );
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

// The library inspector against brief §3.3: a 2x2 stat grid answering the four
// questions a GM has about the recipe they just clicked, then what it REQUIRES and
// what it PRODUCES. An inspector that cannot say what a recipe makes is not finished.
const INSPECTOR_COMPONENTS = [
  { id: 'cmp-herb', name: 'Mountain Herb', img: 'icons/herb.webp' },
  { id: 'cmp-potion', name: 'Healing Potion', img: 'icons/potion.webp' }
];
const INSPECTOR_ESSENCES = [{ id: 'fire', name: 'Fire', icon: 'fas fa-fire' }];

function makeAuthoredRecipe(overrides = {}) {
  return makeRecipe({
    ingredientSets: [
      {
        id: 'set-1',
        essences: { fire: 2 },
        ingredientGroups: [
          {
            id: 'grp-1',
            options: [
              { id: 'o1', quantity: 2, match: { type: 'component', componentId: 'cmp-herb' } },
              { id: 'o2', quantity: 1, match: { type: 'currency', unit: 'gp', amount: 25 } }
            ]
          }
        ]
      }
    ],
    resultGroups: [
      {
        id: 'g1',
        name: 'On success',
        results: [{ id: 'res-1', componentId: 'cmp-potion', quantity: 3 }]
      }
    ],
    ...overrides
  });
}

describe('RecipeBrowserInspector (mounted)', () => {
  it('answers Ingredients / Results / Steps / Crafting check in the stat grid', async () => {
    const root = await inspector.mount({
      selectedRecipe: makeRecipe({
        id: 'r1',
        stepCount: 2,
        ingredientCount: 4,
        resultItemCount: 3,
        checkSummary: { kind: 'dc', dc: 17 }
      }),
      recipeCount: 1
    });

    const stat = (id) => root.querySelector(`[data-recipe-fact="${id}"] .manager-recipe-stat-value`);
    assert.equal(stat('ingredients').textContent, '4');
    assert.equal(stat('results').textContent, '3');
    assert.equal(stat('steps').textContent, '2');
    assert.equal(stat('check').textContent, 'DC 17', 'the store already projects the resolved DC');
    assert.equal(
      root.querySelector('[data-recipe-fact="structure"]'),
      null,
      'Structure restated the row the GM just clicked and is gone'
    );
  });

  it('marks a recipe that produces nothing as a DANGER stat, not merely a zero', async () => {
    const root = await inspector.mount({
      selectedRecipe: makeRecipe({ id: 'r1', resultItemCount: 0, resultGroups: [] }),
      recipeCount: 1
    });
    assert.ok(
      root
        .querySelector('[data-recipe-fact="results"] .manager-recipe-stat-value')
        .classList.contains('is-danger')
    );
  });

  // `Edit recipe` is the POINT of the inspector: the accent-filled primary and the loudest
  // thing on the panel. There used to be NO Edit button at all, and Delete sat as a visual
  // peer of Duplicate — so the panel's loudest action was destroying the recipe.
  it('renders the selected recipe with its image and its Duplicate / Edit / Delete ladder', async () => {
    let edited = 0;
    let duplicated = 0;
    let deleted = 0;
    const root = await inspector.mount({
      selectedRecipe: makeAuthoredRecipe({ id: 'r1' }),
      recipeCount: 1,
      showRecipeCategories: true,
      onEdit: () => { edited += 1; },
      onDuplicate: () => { duplicated += 1; },
      onDelete: () => { deleted += 1; }
    });

    assert.equal(root.querySelector('[data-medallion]').dataset.medallion, 'image');
    assert.ok(root.querySelector('[data-recipe-category]'), 'the category is a hero chip, not a stat');

    assert.deepEqual(
      [...root.querySelectorAll('.manager-recipe-browser-inspector-actions [data-recipe-action]')].map(
        (button) => button.dataset.recipeAction
      ),
      ['duplicate', 'edit', 'delete'],
      'Duplicate (secondary), then Edit (primary), then Delete demoted below it'
    );

    root.querySelector('[data-recipe-action="edit"]').click();
    root.querySelector('[data-recipe-action="duplicate"]').click();
    root.querySelector('[data-recipe-action="delete"]').click();
    flushSync();
    assert.deepEqual([edited, duplicated, deleted], [1, 1, 1]);
  });

  // The inspector is ONE column on the panel background, not five nested boxes.
  it('renders its sections as micro-labels on the panel, not as nested cards', async () => {
    const root = await inspector.mount({
      selectedRecipe: makeAuthoredRecipe({ id: 'r1' }),
      recipeCount: 1,
      componentOptions: INSPECTOR_COMPONENTS
    });

    assert.equal(
      root.querySelectorAll('.manager-inspector-card').length,
      0,
      'a panel inside a window does not also need five boxes'
    );
    assert.equal(
      root.textContent.includes('Recipe details'),
      false,
      'the invented heading over the stat grid is gone'
    );
    assert.deepEqual(
      [...root.querySelectorAll('.manager-recipe-browser-inspector-label')].map((label) =>
        label.textContent.trim()
      ),
      ['Selected recipe', 'Requires', 'Produces']
    );
  });

  // Exactly TWO chips on one line: what it is, and whether it is on. The third used to be
  // "Unlocked" — a pill for a NON-state, which forced the row to wrap — and the status chip
  // read "Active" while the row's switch inches away read "On".
  it('shows the category and an On/Off status dot, and no chip for the absence of a state', async () => {
    const on = await inspector.mount({
      selectedRecipe: makeRecipe({ id: 'r1', enabled: true, locked: false }),
      recipeCount: 1,
      showRecipeCategories: true
    });

    assert.equal(on.querySelectorAll('.manager-chip-row > *').length, 2, 'category + status, one line');
    const status = on.querySelector('[data-status-pill="success"]');
    assert.equal(status.textContent.trim(), 'On', 'the same state has the same name as the row switch');
    assert.ok(status.querySelector('i.fa-circle'), 'the status pill leads with a dot');
    assert.equal(on.textContent.includes('Unlocked'), false, 'unlocked is not a state to chip');
    assert.equal(on.textContent.includes('Active'), false, 'the state is named On, as the row names it');
    inspector.remount();

    const off = await inspector.mount({
      selectedRecipe: makeRecipe({ id: 'r1', enabled: false, locked: true }),
      recipeCount: 1,
      showRecipeCategories: true
    });
    assert.equal(off.querySelector('[data-status-pill="subtle"]').textContent.trim(), 'Off');
    assert.ok(off.querySelector('[data-status-pill="accent"]'), 'Locked IS a state and keeps its pill');
  });

  // The panel is the one surface with the room for the recipe's flavour text; it used to
  // cut it at 160 characters anyway.
  it('shows the flavour text whole', async () => {
    const description = 'A classic arming sword. '.repeat(12).trim();
    const root = await inspector.mount({
      selectedRecipe: makeRecipe({ id: 'r1', description }),
      recipeCount: 1
    });
    assert.equal(root.querySelector('.manager-recipe-browser-inspector-flavour').textContent.trim(), description);
    assert.equal(root.textContent.includes('…'), false, 'nothing is truncated');
  });

  // The rows render `getRecipeCategoryLabel(...)`; the inspector rendered
  // `selectedRecipe.category` raw, so the same recipe read "General" in the row and
  // "general" in the inspector inches away. (The harness's i18n stub echoes the key,
  // so the localized reserved label surfaces here as its key — which is exactly the
  // evidence that the helper, not the raw field, produced it.)
  it('labels the category through the same helper the rows use', async () => {
    const general = await inspector.mount({
      selectedRecipe: makeRecipe({ id: 'r1', category: 'general' }),
      recipeCount: 1,
      showRecipeCategories: true
    });
    assert.equal(
      general.querySelector('[data-recipe-category]').textContent.trim(),
      'FABRICATE.Common.General',
      'the reserved category is localized, not printed raw'
    );
    inspector.remount();

    const custom = await inspector.mount({
      selectedRecipe: makeRecipe({ id: 'r1', category: 'Alchemy' }),
      recipeCount: 1,
      showRecipeCategories: true
    });
    assert.equal(
      custom.querySelector('[data-recipe-category]').textContent.trim(),
      'Alchemy',
      'a custom category keeps the GM-authored name'
    );
  });

  it('falls back to the reserved label when the recipe carries no category', async () => {
    const root = await inspector.mount({
      selectedRecipe: makeRecipe({ id: 'r1', category: '' }),
      recipeCount: 1,
      showRecipeCategories: true
    });
    assert.equal(
      root.querySelector('[data-recipe-category]').textContent.trim(),
      'FABRICATE.Common.General'
    );
  });

  it('lists what the recipe REQUIRES, each option as its own match type', async () => {
    const root = await inspector.mount({
      selectedRecipe: makeAuthoredRecipe({ id: 'r1' }),
      recipeCount: 1,
      componentOptions: INSPECTOR_COMPONENTS,
      essenceOptions: INSPECTOR_ESSENCES
    });

    // The two options share ONE requirement, so they render as equal members inside an
    // ANY-ONE-OF group — neither promoted above the other.
    const group = root.querySelector('[data-recipe-requirement="anyOf"]');
    assert.ok(group, 'a two-option requirement renders as an any-one-of group');
    assert.ok(
      group.querySelector('.manager-recipe-flow-anyof-label'),
      'the group is led by an ANY ONE OF label'
    );
    const members = [...group.querySelectorAll('[data-recipe-requirement]')];
    assert.deepEqual(
      members.map((member) => member.dataset.recipeRequirement),
      ['component', 'currency'],
      'a currency cost is not a component; both are equal members of the group'
    );
    assert.match(members[0].textContent, /Mountain Herb/);
    assert.match(members[0].querySelector('.manager-recipe-flow-qty').textContent, /×2/);
    assert.match(members[1].textContent, /25 gp/);
    // No member is inset or promoted — the group frame carries the "alternatives" signal.
    assert.equal(root.querySelector('.is-alternative'), null);

    // The per-SET essence is an AND requirement: a flat entry, not a group member.
    const essence = root.querySelector(
      '.manager-recipe-flow-list > [data-recipe-requirement="essence"]'
    );
    assert.ok(essence, 'the set essence is a flat requirement outside the any-one-of group');
    assert.match(essence.textContent, /Fire/);
  });

  it('lists what the recipe PRODUCES, with a success-toned group pill and a mono quantity', async () => {
    const root = await inspector.mount({
      selectedRecipe: makeAuthoredRecipe({ id: 'r1' }),
      recipeCount: 1,
      componentOptions: INSPECTOR_COMPONENTS
    });

    const rows = [...root.querySelectorAll('[data-recipe-produces]')];
    assert.equal(rows.length, 1);
    assert.equal(rows[0].dataset.recipeProduces, 'success');
    assert.match(rows[0].textContent, /Healing Potion/);
    // The pill carries the GM-AUTHORED group name — Fabricate's outcome tiers are authored,
    // so the name is the recipe's and never an invented crit/success/fail vocabulary. Its
    // TONE is not the recipe's: it is the role the group plays.
    const pill = rows[0].querySelector('.manager-recipe-flow-group');
    assert.equal(pill.textContent.trim(), 'On success');
    assert.ok(pill.classList.contains('is-success'));
    assert.match(rows[0].querySelector('.manager-recipe-flow-qty').textContent, /×3/);
    assert.equal(root.querySelector('[data-recipe-produces-empty]'), null);
  });

  it('says outright that a recipe with no results makes nothing on a successful craft', async () => {
    const root = await inspector.mount({
      selectedRecipe: makeRecipe({ id: 'r1', resultGroups: [], resultItemCount: 0 }),
      recipeCount: 1,
      componentOptions: INSPECTOR_COMPONENTS
    });

    const empty = root.querySelector('[data-recipe-produces-empty]');
    assert.ok(empty, 'the GM is told, not left with a blank card');
    assert.match(empty.textContent, /a successful craft makes nothing/);
  });

  // The reserved alchemy-Simple failure group is what a FAILED craft makes. Filtering it out
  // of Produces (as this used to) made an alchemy recipe's failure output INVISIBLE in the one
  // surface whose job is to say what a recipe makes. It is shown, in danger, and the
  // successful-craft-makes-nothing warning still fires — because it is still true.
  //
  // No failure row is ever INVENTED: it exists only where the model has one. The routed modes
  // produce nothing at all on a failure and carry no such group.
  it("shows the reserved role: 'failure' group in danger, and still says a success makes nothing", async () => {
    const root = await inspector.mount({
      selectedRecipe: makeRecipe({
        id: 'r1',
        resultItemCount: 1,
        resultGroups: [
          {
            id: 'g-fail',
            name: 'On a failed check',
            role: 'failure',
            results: [{ id: 'x', componentId: 'cmp-potion', quantity: 1 }]
          }
        ]
      }),
      recipeCount: 1,
      componentOptions: INSPECTOR_COMPONENTS
    });

    const rows = [...root.querySelectorAll('[data-recipe-produces]')];
    assert.equal(rows.length, 1, 'the failure output is not deleted from the panel');
    assert.equal(rows[0].dataset.recipeProduces, 'failure');
    assert.ok(rows[0].classList.contains('is-failure'), 'a failure output rings in danger');
    assert.ok(rows[0].querySelector('.manager-recipe-flow-group.is-failure'), 'and its group pill does too');
    assert.ok(
      root.querySelector('[data-recipe-produces-empty]'),
      'a recipe whose only group is the failure group still makes nothing on a success'
    );
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

  // Routed-by-ingredients pairing (issue 643): set-1 (Herb route) requires Mountain Herb
  // and routes to grp-1 (produces Healing Potion); set-2 (Potion route) requires Healing
  // Potion and routes to grp-2 (produces Mountain Herb) — so a route's requirement and its
  // produce name each other's component, making the filtered lists unambiguous.
  function makeRoutedByIngredientsRecipe(overrides = {}) {
    return makeRecipe({
      id: 'r-routed',
      resultItemCount: 2,
      resultGroupCount: 2,
      checkSummary: { kind: 'ingredients', dc: null },
      ingredientSets: [
        {
          id: 'set-1',
          name: 'Herb route',
          resultGroupId: 'grp-1',
          ingredientGroups: [{ id: 'ig1', options: [{ id: 'o1', quantity: 2, match: { type: 'component', componentId: 'cmp-herb' } }] }]
        },
        {
          id: 'set-2',
          name: 'Potion route',
          resultGroupId: 'grp-2',
          ingredientGroups: [{ id: 'ig2', options: [{ id: 'o2', quantity: 1, match: { type: 'component', componentId: 'cmp-potion' } }] }]
        }
      ],
      resultGroups: [
        { id: 'grp-1', name: 'Result Group 1', results: [{ id: 'x1', componentId: 'cmp-potion', quantity: 3 }] },
        { id: 'grp-2', name: 'Result Group 2', results: [{ id: 'x2', componentId: 'cmp-herb', quantity: 1 }] }
      ],
      ...overrides
    });
  }

  function changeSelect(select, value) {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
  }

  it('routed by ingredients: one ingredient-set dropdown filters both lists and drops the group pill', async () => {
    const root = await inspector.mount({
      selectedRecipe: makeRoutedByIngredientsRecipe(),
      resolutionMode: 'routedByIngredients',
      recipeCount: 1,
      componentOptions: INSPECTOR_COMPONENTS
    });

    const setSelect = root.querySelector('[data-recipe-route="ingredient-set"]');
    assert.ok(setSelect, 'the ingredient-set dropdown renders');
    // The lower result-set dropdown was removed — the single set dropdown drives both lists.
    assert.equal(root.querySelector('[data-recipe-route="result-set"]'), null, 'no redundant result-set dropdown');
    assert.deepEqual([...setSelect.options].map((o) => o.textContent.trim()), ['Herb route', 'Potion route']);
    assert.equal(setSelect.value, 'set-1', 'defaults to the first set');

    const requires = root.querySelector('.manager-recipe-flow-list');
    assert.match(requires.textContent, /Mountain Herb/, 'Requires shows set-1 requirement');
    assert.doesNotMatch(requires.textContent, /Healing Potion/, 'and only that set');

    const produceRows = [...root.querySelectorAll('[data-recipe-produces]')];
    assert.equal(produceRows.length, 1, 'only the routed result group is produced');
    assert.match(produceRows[0].textContent, /Healing Potion/, 'grp-1 produces the potion');
    assert.equal(root.querySelector('.manager-recipe-flow-group'), null, 'no Result Group pill in the produces list');
  });

  it('routed by ingredients: choosing an ingredient set re-filters both the Requires and Produces lists', async () => {
    const root = await inspector.mount({
      selectedRecipe: makeRoutedByIngredientsRecipe(),
      resolutionMode: 'routedByIngredients',
      recipeCount: 1,
      componentOptions: INSPECTOR_COMPONENTS
    });

    changeSelect(root.querySelector('[data-recipe-route="ingredient-set"]'), 'set-2');

    const requires = root.querySelector('.manager-recipe-flow-list');
    assert.match(requires.textContent, /Healing Potion/, 'Requires now shows set-2');
    assert.doesNotMatch(requires.textContent, /Mountain Herb/);
    const produceRows = [...root.querySelectorAll('[data-recipe-produces]')];
    assert.equal(produceRows.length, 1);
    assert.match(produceRows[0].textContent, /Mountain Herb/, 'set-2 routes to grp-2, which produces the herb');
  });

  it('non-routed modes keep the flat lists and the group pill, with no dropdowns', async () => {
    const root = await inspector.mount({
      selectedRecipe: makeRoutedByIngredientsRecipe(),
      resolutionMode: 'simple',
      recipeCount: 1,
      componentOptions: INSPECTOR_COMPONENTS
    });

    assert.equal(root.querySelector('[data-recipe-route]'), null, 'no routing dropdowns outside routed-by-ingredients');
    // Both groups' produces are listed, each keeping its group pill.
    const produceRows = [...root.querySelectorAll('[data-recipe-produces]')];
    assert.equal(produceRows.length, 2);
    assert.ok(root.querySelector('.manager-recipe-flow-group'), 'the group pill stays outside routed-by-ingredients');
  });
});
