import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync, tick } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { scopedComponentCss } from '../helpers/scoped-component-css.js';

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

function trigger(root) {
  return root.querySelector('[data-recipe-item-link-recipe-toggle]');
}

function openPicker(root) {
  trigger(root).click();
  flushSync();
  return {
    panel: () => root.querySelector('.manager-travel-popover'),
    search: () => root.querySelector('.manager-travel-popover-search input'),
    count: () => root.querySelector('[data-popover-filtered-count]'),
    list: () => root.querySelector('.manager-travel-popover [role="listbox"]'),
    options: () => root.querySelectorAll('[data-recipe-item-link-recipe-option]'),
  };
}

/**
 * A keydown from wherever focus is, which is how the primitive's dismissal is reached.
 *
 * `settle` rather than `flushSync` alone: the primitive returns focus to the trigger from a
 * `tick().then(...)`, so the move needs a real turn of the loop.
 */
async function pressKey(key) {
  document.activeElement.dispatchEvent(
    new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  );
  flushSync();
  await tick();
  await new Promise((done) => setTimeout(done, 0));
  flushSync();
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

  // ── THE CLOSED AFFORDANCE STAYS REACHABLE (issue 1513, review r1) ──────────────────
  // `triggerAriaDisabled` rather than `disabled`, and `stayOpen` is what makes the difference
  // reachable: the last linkable recipe is linked WITH THE PANEL OPEN, so a native `disabled`
  // would put `disabled` and `aria-expanded="true"` on one button and then drop the keyboard
  // user to `<body>` on Escape, because `focus()` on a disabled button is a silent no-op.
  it('closes the link affordance without removing it from the keyboard', async () => {
    const root = await harness.mount({ linkedRecipes: LINKED, availableRecipes: LINKED });
    const button = trigger(root);
    assert.equal(button.getAttribute('aria-disabled'), 'true');
    assert.equal(button.disabled, false, 'it is not removed from the tab order');

    button.click();
    flushSync();
    assert.ok(!root.querySelector('.manager-travel-popover'), 'and it still refuses to open');

    button.focus();
    assert.ok(document.activeElement === button, 'an aria-disabled trigger still takes focus');
  });

  // AND IT IS STILL PAINTED AS CLOSED, which the clause above cannot see. happy-dom computes no
  // cascade, so a mounted assertion reads nothing the stylesheet says — and the swap from
  // `disabled` to `triggerAriaDisabled` moved the trigger OUT of the only selector that dimmed
  // it. `:disabled` matches an element carrying the native attribute, and this one no longer
  // does, so the "every recipe is already linked" panel drew a full-opacity trigger at
  // `cursor: pointer` that silently did nothing: a control that looks live and is not is worse
  // than one that looks dead. The rule is read out of the COMPILED CSS, which is the artifact
  // the browser is handed and the only place a pruned or mis-keyed selector shows up.
  it('paints the closed trigger through a selector that reads the ARIA flag it now carries', () => {
    const { css } = scopedComponentCss(
      resolve(repoRoot, 'src/ui/svelte/apps/manager/recipe-item/RecipeItemContentsTab.svelte')
    );
    const flat = css.replaceAll(/\/\*[\s\S]*?\*\//gu, '').replaceAll(/\s+/gu, ' ');
    const rules = [...flat.matchAll(/([^{}]+)\{([^{}]*)\}/gu)].map(([, selector, body]) => ({
      selector: selector.trim(),
      body,
    }));

    const closed = rules.filter((rule) =>
      rule.selector.includes('manager-recipe-item-link-recipe-toggle')
    );
    assert.equal(
      closed.length,
      1,
      `${closed.length} rules paint the link trigger, against the one this component writes. ` +
        'Svelte PRUNES a scoped rule it cannot match, so a rule deleted and a rule pruned look ' +
        'the same from here, and both leave the closed state unpainted'
    );
    assert.match(
      closed[0].selector,
      /\[aria-disabled='true'\]/u,
      'the selector must read `aria-disabled`, because that is the flag this call site sets: it ' +
        'passes `triggerAriaDisabled` so the button stays focusable, which means the native ' +
        '`:disabled` this rule was written against never matches it again'
    );
    assert.match(
      closed[0].body,
      /opacity: 0\.5/u,
      'and it still dims, or the state is announced and not drawn'
    );
    assert.match(closed[0].body, /cursor: not-allowed/u);
  });

  // THE STATE THE FIXTURE USED TO PIN AS AN ARTIFACT. The stay-open clause above asserts two rows
  // survive a choice, which is true of the FIXTURE and false of production: the parent re-projects
  // `linkedRecipes` after a link, so the option list shrinks under the open panel. Re-mounting the
  // shrunk projection is what makes the assertion about the product.
  it('re-projects the shrunk library under the open panel and keeps the query', async () => {
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
    assert.deepEqual(calls, ['r4']);

    // What the caller does with that id: r4 joins the linked list, so it leaves the linkable one.
    await harness.setProps({
      linkedRecipes: [LIBRARY[3]],
      availableRecipes: LIBRARY,
    });

    assert.ok(Boolean(picker.panel()), 'the panel survives the re-projection');
    assert.equal(picker.search().value, 'Verd', 'and so does the typed query');
    assert.equal(picker.options().length, 1, 'the linked recipe left the option list');
    assert.equal(
      picker.options()[0].getAttribute('data-recipe-item-link-recipe-option'),
      'r5',
      'and the one still linkable under the query is the row that remains'
    );
    assert.equal(root.querySelectorAll('[data-recipe-item-recipe]').length, 1);
  });

  // AND THE LAST LINK, which is the state the trigger's flag exists for: the library empties
  // under an open panel, the affordance closes, and Escape has to give the keyboard back.
  it('hands focus back to the closed trigger when the last linkable recipe is linked', async () => {
    const root = await harness.mount({
      linkedRecipes: [],
      availableRecipes: [LIBRARY[3]],
    });
    const picker = openPicker(root);
    assert.equal(picker.options().length, 1);

    picker.options()[0].click();
    flushSync();
    await harness.setProps({
      linkedRecipes: [LIBRARY[3]],
      availableRecipes: [LIBRARY[3]],
    });

    const button = trigger(root);
    assert.ok(Boolean(picker.panel()), 'the panel is still open over an empty library');
    assert.equal(button.getAttribute('aria-disabled'), 'true');
    assert.equal(button.disabled, false);
    assert.equal(button.getAttribute('aria-expanded'), 'true');

    await pressKey('Escape');
    assert.ok(!root.querySelector('.manager-travel-popover'), 'Escape closes it');
    assert.ok(
      document.activeElement === button,
      'and focus returns to the trigger rather than falling to <body>, where Foundry rearms its ' +
        'canvas keybindings'
    );
  });

  // ── THE PANEL AND ITS LIST ARE NAMED (issue 1513, review r1) ───────────────────────
  // `dialogAriaLabel` feeds BOTH the portaled `role="dialog"` and the `role="listbox"` inside it,
  // and a source read cannot finish that job: the call site's string is present and non-empty
  // there while resolving to '' at runtime for any caller naming the control by a caption.
  it('renders a non-empty accessible name on the panel and on its option list', async () => {
    const root = await harness.mount({ linkedRecipes: [], availableRecipes: LIBRARY });
    const picker = openPicker(root);

    const panelName = picker.panel().getAttribute('aria-label');
    const listName = picker.list().getAttribute('aria-label');
    assert.notEqual(panelName, '', 'the portaled dialog announces a name');
    assert.notEqual(listName, '', 'and so does the listbox inside it');
    assert.equal(panelName, 'Link recipe');
    assert.equal(listName, 'Link recipe');
  });

  // ── THE COUNT IS THE CHOICE'S ONLY FEEDBACK UNDER `stayOpen` (issue 1513, review r1) ──
  // A panel that closes on choose confirms the choice by closing. This one stays open, so the
  // matched-of-total header is what says a link landed — "5 of 5" becomes "4 of 4" — and it can
  // only say it to a screen reader if it is a live region.
  it('announces the count as a polite status', async () => {
    const root = await harness.mount({ linkedRecipes: [], availableRecipes: LIBRARY });
    const picker = openPicker(root);

    assert.equal(picker.count().getAttribute('role'), 'status');
    assert.equal(picker.count().getAttribute('aria-live'), 'polite');
    assert.equal(picker.count().textContent.trim(), '5 of 5');

    picker.options()[0].click();
    flushSync();
    await harness.setProps({ linkedRecipes: [LIBRARY[0]], availableRecipes: LIBRARY });

    assert.equal(
      picker.count().textContent.trim(),
      '4 of 4',
      'the live region\u2019s own text is what moves, so the link is announced without a second ' +
        'element'
    );
  });
});
