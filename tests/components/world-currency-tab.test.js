import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { assertNoElement } from '../helpers/svelte-dom.js';

const repoRoot = resolve(import.meta.dirname, '../..');

/**
 * World > Currency (issue 1278), mounted on its own.
 *
 * The strategy branches, provider read-only list and macro drop zones are covered through the
 * whole-manager mount in `manager-mounted.test.js`, which is where the route and its chrome are
 * asserted. What this suite pins is what the RELOCATION changed about the card itself: it is a
 * page now rather than one section among several on a crafting system's Settings tab, so its
 * collapse state is its own, its reorder announcement travels with it, and it renders without any
 * crafting system in hand at all.
 */
const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-world-currency-tab-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/actions/dragDrop.js',
    'src/ui/svelte/util/dropUtils.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js',
    'src/ui/svelte/util/essenceIcons.js',
    'src/ui/svelte/util/foundryIconVocabulary.js',
    'src/ui/svelte/util/foundryIconCatalogue.js',
    'src/ui/svelte/util/iconPickerPopover.js'
  ],
  compiledModules: [
    // A `.svelte` the tree renders but the harness omits HANGS the suite (# cancelled) rather
    // than failing it, so every one is named.
    'src/ui/svelte/apps/manager/Chip.svelte',
    'src/ui/svelte/apps/manager/EmptyState.svelte',
    'src/ui/svelte/components/IconPicker.svelte',
    'src/ui/svelte/apps/manager/world/WorldCurrencyTab.svelte'
  ],
  componentPath: 'src/ui/svelte/apps/manager/world/WorldCurrencyTab.svelte'
});

function flushRender() {
  return new Promise((resolveTick) => setTimeout(resolveTick, 0));
}

function clickEvent() {
  return new globalThis.window.Event('click', { bubbles: true });
}

const UNITS = Object.freeze([
  { id: 'gp', label: 'Gold', abbreviation: 'gp', actorPath: 'system.currency.gp', contains: [] },
  { id: 'sp', label: 'Silver', abbreviation: 'sp', actorPath: 'system.currency.sp', contains: [] }
]);

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('World > Currency tab (mounted)', () => {
  it('renders the ladder with NO crafting system in hand', async () => {
    // The point of the move. The tab takes no system prop at all, and it is deliberately ungated:
    // a GM has to be able to author coins BEFORE any system can switch currency on, so gating this
    // page on participation would be a chicken-and-egg lock-out.
    const root = await harness.mount({ currencyUnits: UNITS });

    assert.ok(root.querySelector('[data-world-currency-page]'), 'the page root renders');
    assert.ok(root.querySelector('[data-world-currency-units]'), 'the units card renders');
    assert.ok(root.querySelector('[data-world-currency-unit="gp"]'), 'gold renders');
    assert.ok(root.querySelector('[data-world-currency-unit="sp"]'), 'silver renders');
  });

  it('carries NO collapse toggle, because collapsing a whole route only blanks it', async () => {
    // On the Settings tab the chevron yielded space to the sibling cards below it. As a route
    // there is nothing to make room for, so the same control would hide the page and leave a
    // bare header row.
    const root = await harness.mount({ currencyUnits: UNITS });

    assertNoElement(
      root,
      '[data-section-collapse="currency"]',
      'the collapse chevron does not belong on a route that has no siblings'
    );
    assert.ok(
      root.querySelector('#manager-section-body-currency'),
      'and the body it used to hide renders unconditionally'
    );
  });

  it('gives the page a single section heading directly under the shell heading', async () => {
    // The shell renders <h1>World Currency</h1>; the card's own title used to be an <h3> under
    // the Settings tab's <h2>. Left as an h3 it would skip a level, which costs a screen-reader
    // user the landmark they navigate the page by.
    const root = await harness.mount({ currencyUnits: UNITS });
    const heading = root.querySelector('.manager-card-title');

    assert.equal(heading.tagName.toLowerCase(), 'h2');
  });

  it('renders an empty state instead of a bare card when no coins are authored yet', async () => {
    const root = await harness.mount({ currencyUnits: [] });

    assert.ok(root.querySelector('[data-world-currency-units]'), 'the card is still the page');
    assertNoElement(
      root,
      '[data-world-currency-unit]',
      'no unit rows should render for an empty ladder'
    );
  });

  it('disables Seed presets when the world ruleset has no preset bundle', async () => {
    const unsupported = await harness.mount({ currencyUnits: [], currencyPresetsSupported: false });
    // Pinned by its label, not by "the first tooltipped button on the page" — that would pass on
    // any other disabled control that happens to carry a tooltip.
    const seedOff = [...unsupported.querySelectorAll('button')].find((button) =>
      button.textContent.includes('Seed presets')
    );
    assert.equal(seedOff.disabled, true, 'Seed presets is disabled');
    assert.ok(seedOff.getAttribute('data-tooltip'), 'and explains itself in a tooltip');

    harness.remount();
    const supported = await harness.mount({ currencyUnits: [], currencyPresetsSupported: true });
    const seedOn = [...supported.querySelectorAll('button')].find((button) =>
      button.textContent.includes('Seed presets')
    );
    assert.equal(seedOn.disabled, false);
  });

  it('announces a reorder through its OWN polite live region', async () => {
    // The chevrons reflow the list, so to a screen-reader user the move is only observable through
    // this region. It travelled with the list rather than staying behind on the Settings tab.
    const calls = [];
    const root = await harness.mount({
      currencyUnits: UNITS,
      onReorderCurrencyUnit: async (fromIndex, toIndex) => { calls.push([fromIndex, toIndex]); }
    });

    const announcement = root.querySelector('[data-list-reorder-announcement]');
    assert.ok(announcement, 'the tab carries its own announcement region');
    assert.equal(announcement.getAttribute('aria-live'), 'polite');
    assert.equal(announcement.textContent.trim(), '', 'silent until something moves');

    root.querySelector('[data-move-currency-up="sp"]').dispatchEvent(clickEvent());
    await flushRender();

    assert.deepEqual(calls, [[1, 0]], 'the reorder op fires with (index, index-1)');
    const text = announcement.textContent;
    assert.ok(text.includes('Silver'), `the moved unit is named: ${text}`);
    assert.ok(text.includes('1'), `its new position is stated: ${text}`);
  });

  it('disables the chevron that would move a unit off either end of the ladder', async () => {
    const root = await harness.mount({ currencyUnits: UNITS });

    assert.equal(root.querySelector('[data-move-currency-up="gp"]').disabled, true);
    assert.equal(root.querySelector('[data-move-currency-down="sp"]').disabled, true);
    assert.equal(root.querySelector('[data-move-currency-down="gp"]').disabled, false);
    assert.equal(root.querySelector('[data-move-currency-up="sp"]').disabled, false);
  });

  /**
   * The world profile's validation report (issue 1493).
   *
   * `validateCurrencyProfile` had no caller in the manager at all, so a ladder that could not be
   * spent against looked perfectly healthy on the page that authors it. The errors arrive as plain
   * strings from `adminStore`; this component deliberately does not import `currencyProfile.js`.
   */
  it('renders the validation errors, each one, where the ladder is authored', async () => {
    const root = await harness.mount({
      currencyUnits: UNITS,
      currencyValidationErrors: [
        'Currency unit "Gold" is missing an actor data path.',
        'Currency unit "Silver" is missing an actor data path.'
      ]
    });

    const note = root.querySelector('[data-world-currency-validation-note]');
    assert.ok(note, 'the report renders');
    const errors = [...root.querySelectorAll('[data-world-currency-validation-error]')].map(
      (item) => item.textContent.trim()
    );
    assert.deepEqual(errors, [
      'Currency unit "Gold" is missing an actor data path.',
      'Currency unit "Silver" is missing an actor data path.'
    ]);
  });

  it('keeps the live region in the DOM while it has nothing to say', async () => {
    // The whole point of the wrapper. A live region inserted in the same tick as its content is
    // not announced, so rendering the element that carries `aria-live` conditionally would
    // announce nothing at the one moment that matters — the strategy switch that breaks the
    // ladder. The region outlives its content; only the note inside it comes and goes.
    const healthy = await harness.mount({ currencyUnits: UNITS, currencyValidationErrors: [] });

    const region = healthy.querySelector('[data-world-currency-validation]');
    assert.ok(region, 'the region is present with no errors to report');
    assert.equal(region.getAttribute('role'), 'status');
    assert.equal(region.getAttribute('aria-live'), 'polite');
    assertNoElement(
      healthy,
      '[data-world-currency-validation-note]',
      'but it says nothing while the ladder is sound'
    );

    harness.remount();
    const broken = await harness.mount({
      currencyUnits: UNITS,
      currencyValidationErrors: ['Currency unit "Gold" is missing an actor data path.']
    });
    const spoken = broken.querySelector('[data-world-currency-validation]');
    assert.ok(
      spoken.querySelector('[data-world-currency-validation-note]'),
      'and the note appears INSIDE the region rather than beside it'
    );
  });

  it('says nothing at all to a GM who has authored no coins yet', async () => {
    // `validateCurrencyProfile([])` reports "No currency units are configured." — true, but not a
    // mistake. The route already greets a fresh world with a friendly empty state, and stacking an
    // error on top of it tells a new GM they are wrong for having done nothing yet.
    const root = await harness.mount({
      currencyUnits: [],
      currencyValidationErrors: ['No currency units are configured.']
    });

    assert.ok(
      root.querySelector('[data-world-currency-validation]'),
      'the region is still present, so a later report is still announceable'
    );
    assertNoElement(
      root,
      '[data-world-currency-validation-note]',
      'the empty ladder is not an error the GM has made'
    );
  });

  it('wears the warning tone alone, never composed with the neutral callout class', async () => {
    // `manager-environment-comp-callout` is later in the sheet at equal specificity and overrides
    // the amber warning tone with a neutral accent. The sibling callouts on this page compose the
    // two deliberately; this one must not, because it is the only one that reports a fault.
    const root = await harness.mount({
      currencyUnits: UNITS,
      currencyValidationErrors: ['Currency unit "Gold" is missing an actor data path.']
    });

    const note = root.querySelector('[data-world-currency-validation-note]');
    assert.equal(note.classList.contains('manager-currency-subunit-warning'), true);
    assert.equal(
      note.classList.contains('manager-environment-comp-callout'),
      false,
      'composing the neutral callout class would repaint the warning as an accent'
    );
    assert.equal(note.getAttribute('role'), 'note');
  });
});
