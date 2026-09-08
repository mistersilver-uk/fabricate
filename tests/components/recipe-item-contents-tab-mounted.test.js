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
    'src/ui/svelte/util/listReorderAnnouncement.js',
    // The recipe thumbnails resolve through the shared pure image helper (issue 544).
    'src/ui/svelte/util/craftingImageDefaults.js',
    // The Link-recipe menu is a `SearchablePopover` (issue 1458): it dismisses on an
    // outside click, portals its panel to the manager host and lays it out against the
    // trigger.
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js',
    'src/ui/svelte/actions/anchoredPopover.js',
    'src/ui/svelte/util/overlayBounds.js',
    'src/ui/svelte/util/iconPickerPopover.js',
    'src/ui/svelte/util/listboxNavigation.js',
    'src/ui/svelte/util/overlayHost.js',
  ],
  compiledModules: [
    'src/ui/svelte/components/Medallion.svelte',
    // The manager's ONE chip (issue 883). A `.svelte` the tree renders but the harness
    // omits HANGS the suite (# cancelled) rather than failing it.
    'src/ui/svelte/components/Chip.svelte',
    'src/ui/svelte/components/IconButton.svelte',
    // `SearchablePopover` and the two primitives IT renders (issue 1458). The add menu is
    // the shared picker now, so this tree reaches all three; an omission does not fail this
    // suite, it cancels every test in it.
    'src/ui/svelte/components/ManagerButton.svelte',
    'src/ui/svelte/components/SearchablePopover.svelte',
    'src/ui/svelte/apps/manager/EmptyState.svelte',
    'src/ui/svelte/apps/manager/recipe-item/RecipeItemContentsTab.svelte',
  ],
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

// A library rather than a handful, because the search field and the matched-of-total count are
// only meaningful over one — and because the two "Verd…" names are what let a typed query
// narrow the list to more than one row, which is the state a choose has to survive.
const LIBRARY = [
  { id: 'r1', name: 'Alloy Bronze', category: 'Smithing' },
  { id: 'r2', name: 'Refine Steel', category: 'Smithing' },
  { id: 'r3', name: 'Veil Powder', category: 'Alchemy' },
  { id: 'r4', name: 'Verdant Tonic', category: 'Alchemy' },
  { id: 'r5', name: 'Verdigris Salve', category: 'Alchemy' },
];

function openPicker(root) {
  root.querySelector('[data-recipe-item-link-recipe-toggle]').click();
  flushSync();
  return {
    panel: () => root.querySelector('.manager-travel-popover'),
    search: () => root.querySelector('.manager-travel-popover-search input'),
    count: () => root.querySelector('[data-popover-filtered-count]'),
    options: () => root.querySelectorAll('[data-recipe-item-link-recipe-option]'),
  };
}

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

  // ── THE PICKER IS SEARCHABLE (issue 1513) ──────────────────────────────────────────────
  // It passed `showSearch={false}` and announced `aria-haspopup="listbox"`, which is the shape
  // of the four converted MENUS — a handful of fixed names. This panel offers every recipe in
  // the world that is not already linked, so the field and the count come on and the truthful
  // `dialog` default comes back with them.
  it('renders a search field over the linkable library and states matched-of-total', async () => {
    const root = await harness.mount({ linkedRecipes: [], availableRecipes: LIBRARY });
    const picker = openPicker(root);

    assert.ok(Boolean(picker.search()), 'the panel renders its search field');
    assert.equal(picker.search().getAttribute('placeholder'), 'Search recipes…');
    assert.equal(picker.search().getAttribute('aria-label'), 'Search recipes…');
    assert.equal(picker.count().textContent.trim(), '5 of 5');

    picker.search().value = 'Verd';
    picker.search().dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();

    assert.equal(picker.options().length, 2);
    assert.equal(picker.count().textContent.trim(), '2 of 5');
  });

  // `triggerHasPopup` came off WITH `showSearch={false}`, because the two are one statement read
  // from either end: with a query field in it the panel is a dialog that CONTAINS a listbox, and
  // announcing a bare listbox promises a control the GM never gets. The source contract holds
  // the rule; this holds the rendered attribute, which is the thing a screen reader reads.
  it('announces the dialog it opens rather than a bare listbox', async () => {
    const root = await harness.mount({ linkedRecipes: [], availableRecipes: LIBRARY });
    assert.equal(
      root.querySelector('[data-recipe-item-link-recipe-toggle]').getAttribute('aria-haspopup'),
      'dialog'
    );
    // Single-select is UNCHANGED: `stayOpen` is the gate alone, so the list must not announce
    // itself as multi-selectable.
    const picker = openPicker(root);
    assert.equal(
      picker.panel().querySelector('[role="listbox"]').hasAttribute('aria-multiselectable'),
      false,
      'linking is one choice at a time, so the list is not multi-selectable'
    );
  });

  // ── THE PANEL SURVIVES A CHOICE (issue 1513) ───────────────────────────────────────────
  // Linking a second recipe was: re-open the trigger, re-type the query, re-find the place in
  // the library. `stayOpen` is that whole cost, and the query surviving with it is half of the
  // point — a panel that reopened empty-handed would still be closing the loop on the GM.
  it('stays open across choices, keeping the typed query and the rows it matched', async () => {
    const calls = [];
    const root = await harness.mount({
      linkedRecipes: [],
      availableRecipes: LIBRARY,
      onLinkRecipe: (id) => calls.push(id),
    });
    const picker = openPicker(root);

    picker.search().value = 'Verd';
    picker.search().dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    assert.equal(picker.options().length, 2);

    picker.options()[0].click();
    flushSync();

    assert.deepEqual(calls, ['r4'], 'the first choice reaches the caller');
    assert.ok(Boolean(picker.panel()), 'the panel is still open after a choice');
    assert.equal(picker.search().value, 'Verd', 'the typed query survives the choice');
    assert.equal(picker.options().length, 2, 'the matched rows survive the choice');

    // THE SECOND LINK WITHOUT RE-OPENING, which is the whole capability. A gate that closed the
    // panel would leave nothing here to click.
    picker.options()[1].click();
    flushSync();
    assert.deepEqual(calls, ['r4', 'r5']);
  });

  it('disables the link affordance when nothing is linkable', async () => {
    const root = await harness.mount({ linkedRecipes: LINKED, availableRecipes: LINKED });
    assert.equal(root.querySelector('[data-recipe-item-link-recipe-toggle]').disabled, true);
  });
});
