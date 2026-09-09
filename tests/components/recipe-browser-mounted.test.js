import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';

import {
  createMountedComponentHarness,
  CRAFTING_APP_RAW_MODULES,
  CRAFTING_APP_COMPILED_MODULES,
} from '../helpers/svelte-component-harness.js';
import { recipe } from '../helpers/crafting-fixtures.js';
import { chipToneOf } from '../helpers/chipTone.js';
import {
  chooseSelectOption,
  openSelectPanel,
  selectOptionValues,
} from '../helpers/select-control.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-recipe-browser-',
  rawModules: CRAFTING_APP_RAW_MODULES,
  compiledModules: CRAFTING_APP_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/apps/crafting/RecipeBrowser.svelte',
  // THE PLAYER ROOT, and it is load-bearing rather than cosmetic (issue 1511). The harness
  // defaults its mount target to `fabricate-manager`, and `SearchablePopover` PORTALS the panel
  // its two converted filters open to the nearest Fabricate application root. This component's
  // production host is the player window, so without the real root every panel here would land
  // on `<body>` and `select-control.js` would find nothing to click.
  rootClass: 'fabricate-app',
});

/**
 * A rect literal in the shape `getBoundingClientRect` returns.
 *
 * @param {number} width
 * @returns {DOMRect} enough of one for the layout to read.
 */
function rectOf(width) {
  return { left: 0, top: 0, width, height: 30, right: width, bottom: 30 };
}

/**
 * Stub the two boxes `anchoredPopover` measures, BEFORE the panel opens.
 *
 * BOTH, and in this order, because happy-dom lays nothing out and returns zeros for every rect.
 * The trigger's width is what the band resolves against; the HOST's is what caps it —
 * `computeIconPickerPopoverLayout` works in `availableWidth = hostWidth − 2 × viewportMargin` and
 * returns `null` outright for a zero-width viewport, at which point `anchoredPopover` writes an
 * EMPTY style attribute with or without a `maxWidth` and the assertion below would pass over the
 * defect it exists to catch. `sync()` measures at action mount, so both stubs must be installed
 * before the click rather than before the read.
 *
 * @param {HTMLElement} root The mount target, which is the overlay host.
 * @param {string} triggerSelector
 * @param {number} triggerWidth
 * @returns {void}
 */
function stubPopoverGeometry(root, triggerSelector, triggerWidth) {
  const trigger = root.querySelector(triggerSelector);
  assert.ok(Boolean(trigger), `no converted select trigger matches ${triggerSelector}`);
  trigger.getBoundingClientRect = () => rectOf(triggerWidth);
  root.getBoundingClientRect = () => rectOf(triggerWidth + 32);
}

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

    // Issue 1506: that meta badge is the shared chip's ICON-ONLY face. `AVAILABLE` returns
    // `tone: 'success'`, which `Chip` does not paint, so the tone is routed through the map — and
    // the label the retired badge carried only as a `title` is now the chip's accessible NAME.
    const chip = craftable.querySelector('.crafting-recipe-row-meta [data-crafting-status]');
    assert.ok(chip.classList.contains('is-icon-only'), 'the row badge is the square face');
    assert.ok(chip.classList.contains('is-list'), 'at the browser row scale');
    assert.equal(chipToneOf(chip), 'positive', 'and an available recipe still reads as green');
    assert.equal(chip.getAttribute('role'), 'img', 'a bare span drops an aria-label without one');
    assert.ok((chip.getAttribute('aria-label') ?? '') !== '', 'and it carries a name to announce');
    assert.equal(chip.textContent.trim(), '', 'the label itself is suppressed, which is the face');
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

    // DRIVEN THE WAY A PLAYER DRIVES IT (issue 1511): the control is a `<button>` opening a
    // portaled list, so reading the offered values means opening the panel, and choosing one is
    // two clicks rather than a `value` write and a synthetic `change`.
    const trigger = '[data-crafting-system-filter]';
    assert.deepEqual(
      selectOptionValues(target, trigger),
      ['__unchanged__', 'sys-a', 'sys-b'],
      'all-systems sentinel plus one row per system, the sentinel addressable by its own handle'
    );
    chooseSelectOption(target, trigger, 'sys-b');
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

    const trigger = '[data-crafting-category-filter]';
    const values = selectOptionValues(target, trigger);
    assert.equal(values.length, 3, 'all-categories + one row per distinct category');
    assert.equal(
      values[0],
      '__unchanged__',
      'the leading row is the empty-value all-categories sentinel, which the primitive gives a ' +
        'non-empty handle so it is addressable at all'
    );

    chooseSelectOption(target, trigger, 'weapons');
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
  it('names each converted filter by the caption it renders, not by a duplicated string', async () => {
    // THE `aria-label` BOTH FILTERS CARRIED IS GONE, and this is the assertion that says what
    // replaced it. `ariaLabelledBy` and `ariaLabel` are mutually exclusive on this primitive —
    // a labelledby wins in the accessibility tree — so passing both would have left a string
    // free to drift from the caption beside it.
    const target = await harness.mount({
      recipes: [recipe({ id: 'r1' })],
      totalCount: 1,
      systems: [{ id: 'sys-a', name: 'Alchemy' }],
      categories: [{ id: 'armor', name: 'Armor' }],
    });

    for (const [hook, captionClass] of [
      ['[data-crafting-category-filter]', '.crafting-browser-filter-category'],
      ['[data-crafting-system-filter]', '.crafting-browser-filter-system'],
    ]) {
      const trigger = target.querySelector(hook);
      assert.ok(Boolean(trigger), `${hook} renders a trigger`);
      assert.ok(!trigger.getAttribute('aria-label'), `${hook} carries no duplicated aria-label`);
      const caption = target.querySelector(`${captionClass} .crafting-browser-filter-label`);
      assert.ok(Boolean(caption), `${captionClass} still draws its own caption`);
      assert.equal(
        trigger.getAttribute('aria-labelledby'),
        caption.id,
        `${hook} is named by the caption its wrapper renders`
      );
      assert.ok(caption.id, 'the caption carries a minted id rather than an empty string');
      assert.ok(
        caption.textContent.trim().length > 0,
        'and the caption it points at has text, which an aria-labelledby to an empty node ' +
          'would not — and the primitive would not warn about'
      );
    }
  });

  it('demotes each filter wrapper to a span that keeps its class', async () => {
    // THE COST AND THE MECHANISM IN ONE ASSERTION (issue 1511). A `<label>` forwards a caption
    // click into the control it wraps; the control is a `<button>` toggling a portaled panel
    // whose dismissal listens on `mousedown` while open, so from the OPEN state the caption's
    // own mousedown dismissed the list and the forwarded click re-opened it. The class survives
    // because the wrapper's column layout and its scoped width rule both hang off it.
    const target = await harness.mount({
      recipes: [recipe({ id: 'r1' })],
      totalCount: 1,
      systems: [{ id: 'sys-a', name: 'Alchemy' }],
      categories: [{ id: 'armor', name: 'Armor' }],
    });

    for (const wrapper of ['.crafting-browser-filter-category', '.crafting-browser-filter-system']) {
      const element = target.querySelector(wrapper);
      assert.ok(Boolean(element), `${wrapper} still renders`);
      assert.equal(element.tagName, 'SPAN', `${wrapper} is a span rather than a label`);
    }
    assert.ok(
      !target.querySelector('label.crafting-browser-filter-category'),
      'no label wrapper survives the conversion'
    );
  });

  it('opens each filter’s panel at the trigger’s own width, not the inline rung’s 240px ceiling', async () => {
    // THE WIRING PROOF FOR `maxWidth` (issue 1511 acceptance 11b). `select-popover-width.test.js`
    // measures what the sheet does to a band in Chromium and never reads this component; this is
    // the half that says THIS caller's prop reaches the layout. Without the `maxWidth` the
    // `inline` rung's own 240 ceiling clamps a 280px trigger's panel to 240, so the figures below
    // differ with and without it.
    //
    // Read from `getAttribute('style')` rather than `style.cssText`: happy-dom drops a nested
    // `var()` out of `cssText`, and the attribute is the verbatim string the action wrote.
    const target = await harness.mount({
      recipes: [recipe({ id: 'r1' })],
      totalCount: 1,
      systems: [{ id: 'sys-a', name: 'Alchemy' }],
      categories: [{ id: 'armor', name: 'Armor' }],
    });

    for (const [hook, width] of [
      ['[data-crafting-category-filter]', 280],
      ['[data-crafting-system-filter]', 906],
    ]) {
      stubPopoverGeometry(target, hook, width);
      const panel = openSelectPanel(target, hook);
      const style = panel.getAttribute('style') ?? '';
      for (const property of ['width', 'min-width', 'max-width']) {
        assert.ok(
          style.includes(`${property}: ${width}px`),
          `${hook} opened a panel whose ${property} is not the trigger's own ${width}px. ` +
            `Style written: "${style}"`
        );
      }
      target.querySelector(hook).click();
      flushSync();
    }
  });

  it('keeps both filters full-width by restating it, since a trigger hugs its value', async () => {
    // THE REFUSAL HALF of the width axis, asserted on the RULE rather than on a computed box,
    // because happy-dom computes no cascade. What is under contract is that the two full-width
    // restatements are ancestor-qualified: a leading bare `:global(.fabricate-select-trigger)`
    // is document-wide and would reach the pager's trigger one row below, which deliberately
    // refuses a width floor.
    const source = readFileSync(
      resolve(repoRoot, 'src/ui/svelte/apps/crafting/RecipeBrowser.svelte'),
      'utf8'
    );
    for (const wrapper of ['.crafting-browser-filter-category', '.crafting-browser-filter-system']) {
      assert.ok(
        source.includes(`${wrapper} :global(.fabricate-select-trigger)`),
        `${wrapper} no longer qualifies its :global() trigger rule by its own wrapper class`
      );
    }
    assert.ok(
      !/^\s*:global\(\.fabricate-select-trigger\)/mu.test(source),
      'a leading bare :global() rule reaches every trigger in the document, including the ' +
        'pager one row below that refuses a width floor'
    );
    // THE DECLARATIONS ARE READ FROM THE BLOCK, NOT FROM THE FILE. A file-wide `includes` for
    // `background: var(--fab-surface);` cannot fail here: this component declares that fill at
    // three other elements, so the clause was green whether or not the trigger rule carried it.
    const blockStart = source.indexOf('.crafting-browser-filter-category :global(');
    assert.ok(blockStart !== -1, 'the category filter no longer opens a scoped :global() block');
    const block = source.slice(blockStart, source.indexOf('}', blockStart) + 1);
    assert.ok(
      block.includes('.crafting-browser-filter-system :global(.fabricate-select-trigger)'),
      'the two filters no longer share one trigger block, so this clause is reading the ' +
        `category filter's alone. It reads: ${block}`
    );
    for (const declaration of ['width: 100%;', 'background: var(--fab-surface);']) {
      assert.ok(
        block.includes(declaration),
        `the filters' own trigger block no longer declares \`${declaration}\` — the two ` +
          'properties this call site keeps are the width core used to supply and the column ' +
          `fill the pager beside it restates. The block reads: ${block}`
      );
    }
  });
});
