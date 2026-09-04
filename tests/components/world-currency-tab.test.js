import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { assertNoElement } from '../helpers/svelte-dom.js';
import { installLangBackedI18n } from '../helpers/langBackedI18n.js';

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
    'src/ui/svelte/util/listReorderAnnouncement.js',
    'src/ui/svelte/actions/dragDrop.js',
    'src/ui/svelte/util/dropUtils.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js',
    'src/ui/svelte/actions/anchoredPopover.js',
    'src/ui/svelte/util/overlayBounds.js',
    'src/ui/svelte/util/essenceIcons.js',
    'src/ui/svelte/util/foundryIconVocabulary.js',
    'src/ui/svelte/util/foundryIconCatalogue.js',
    'src/ui/svelte/util/iconPickerPopover.js',
    'src/ui/svelte/util/overlayHost.js'
  ],
  compiledModules: [
    // A `.svelte` the tree renders but the harness omits HANGS the suite (# cancelled) rather
    // than failing it, so every one is named.
    'src/ui/svelte/apps/manager/Chip.svelte',
    'src/ui/svelte/apps/manager/EmptyState.svelte',
    'src/ui/svelte/components/IconPicker.svelte',
    'src/ui/svelte/components/Field.svelte',
    // THE manager's labelled push-button (issue 1118). The currency card header and each expanded unit render it.
    // Omitting a rendered `.svelte` HANGS the suite (# cancelled) rather than failing it.
    'src/ui/svelte/components/ManagerButton.svelte',
    'src/ui/svelte/components/IconButton.svelte',
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

  it('renders a repeated validator message rather than throwing on it', async () => {
    // The list is keyed on the INDEX, never on the message. Svelte 5 throws `each_key_duplicate`
    // on a repeated key in BOTH its dev and production branches, and these rows are plain
    // validator strings, so keying on the string itself would turn a duplicated message into a
    // crash of the whole route. They are distinct today only because `validateCurrencyProfile`
    // happens to return `[...new Set(errors)]`, an unpinned detail of a file this surface does
    // not own. (Unkeyed is not on the table: `svelte/require-each-key` fails `lint:svelte`.)
    const repeated = 'Currency unit "Gold" is missing an actor data path.';
    const root = await harness.mount({
      currencyUnits: UNITS,
      currencyValidationErrors: [repeated, repeated]
    });

    const errors = [...root.querySelectorAll('[data-world-currency-validation-error]')].map(
      (item) => item.textContent.trim()
    );
    assert.deepEqual(errors, [repeated, repeated], 'both rows render, and neither one throws');
  });

  it('keeps the live region in the DOM while it has nothing to say', async () => {
    // The whole point of the wrapper. A live region inserted in the same tick as its content is
    // not announced, so rendering the element that carries `aria-live` conditionally would
    // announce nothing at the one moment that matters — the strategy switch that breaks the
    // currency profile. The region outlives its content; only the note inside it comes and goes.
    const healthy = await harness.mount({ currencyUnits: UNITS, currencyValidationErrors: [] });

    const region = healthy.querySelector('[data-world-currency-validation]');
    assert.ok(region, 'the region is present with no errors to report');
    assert.equal(region.getAttribute('role'), 'status');
    assert.equal(region.getAttribute('aria-live'), 'polite');
    assertNoElement(
      healthy,
      '[data-world-currency-validation-note]',
      'but it says nothing while the currency profile is sound'
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

  it('hides the silent region with the shipped visually-hidden utility, not a margin hack', async () => {
    // A permanently mounted live region has to be a REAL hidden element while it is silent, or it
    // leaves a phantom row in the section's gapped flex column. `.visually-hidden`
    // (`styles/fabricate.css`, under `.fabricate-manager`) is the shipped utility for exactly
    // that, and it is the one the reorder announcer at the top of this same component already
    // uses; it clips the element out of flow while leaving it in the accessibility tree.
    //
    // This asserts the CLASS, never a computed style: happy-dom cannot compute the cascade, so a
    // `getComputedStyle` assertion here would pass against a stylesheet that was never loaded.
    const silent = await harness.mount({ currencyUnits: UNITS, currencyValidationErrors: [] });
    const hidden = silent.querySelector('[data-world-currency-validation]');
    assert.equal(
      hidden.classList.contains('visually-hidden'),
      true,
      'the silent region is hidden, not collapsed by a negative margin'
    );

    harness.remount();
    const speaking = await harness.mount({
      currencyUnits: UNITS,
      currencyValidationErrors: ['Currency unit "Gold" is missing an actor data path.']
    });
    const shown = speaking.querySelector('[data-world-currency-validation]');
    assert.equal(
      shown.classList.contains('visually-hidden'),
      false,
      'and it becomes visible the moment it has something to report'
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
      'an empty currency profile is not an error the GM has made'
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

// ---------------------------------------------------------------------------
// Issue 1493 (revision 3) — the note has to be true of the screen it appears on.
//
// The published `currency-macro` frame shows this note above FIVE perfectly healthy units,
// reporting two errors that are not about any unit at all: a missing "can afford" macro and
// a missing "decrement" one. `validateCurrencyProfile` raises at least four non-unit-scoped
// errors, so "these currency units can't be spent yet" and "fix the units below" named the
// wrong thing and pointed the wrong way — the problems are listed ABOVE the sentence.
//
// `game.i18n` is backed by the real `lang/en.json` here, so these are assertions on the
// shipped copy rather than on the component's inline fallbacks.
// ---------------------------------------------------------------------------

describe('WorldCurrencyTab validation copy (issue 1493)', () => {
  let restoreI18n = () => {};

  before(async () => {
    await harness.setup();
    restoreI18n = installLangBackedI18n(repoRoot);
  });
  after(() => {
    restoreI18n();
    harness.teardown();
  });
  afterEach(harness.remount);

  const MACRO_ERRORS = [
    'A "can afford" currency macro is required for macro spending.',
    'A "decrement" currency macro is required for macro spending.'
  ];

  async function mountWithMacroErrors() {
    return harness.mount({ currencyUnits: UNITS, currencyValidationErrors: MACRO_ERRORS });
  }

  it('blames the currency, not the units, when no unit is at fault', async () => {
    const root = await mountWithMacroErrors();
    const copy = root.querySelector('.currency-validation-copy');

    assert.equal(copy.querySelector('strong').textContent.trim(), "Currency can't be spent yet");
    assert.ok(
      !/units/i.test(copy.querySelector('strong').textContent),
      'the five units on this page are healthy; the missing macros are the fault'
    );
  });

  it('points at the problems it actually sits below', async () => {
    const root = await mountWithMacroErrors();
    const copy = root.querySelector('.currency-validation-copy');

    assert.deepEqual(
      [...copy.children].map((child) => child.tagName),
      ['STRONG', 'UL', 'SPAN'],
      'the list is between the title and the hint, so "listed above" is literally true'
    );
    assert.equal(
      copy.querySelector('span').textContent.trim(),
      "Crafting can't price or spend currency until you fix the problems listed above." +
        ' Each spend strategy needs different things from your setup, so switching it can' +
        ' raise new ones. Saving still works.'
    );
    assert.ok(
      !/below/i.test(copy.querySelector('span').textContent),
      'nothing to fix sits below this sentence'
    );
  });

  // The one lang<->fallback mirror this change keeps: `WorldCurrencyTab` predates the
  // decision to drop these shims and uses `text(key, fallback)` throughout, so unwinding it
  // here would leave the file half-converted. Guarded instead, because a fallback that
  // drifts from the shipped copy silently changes the wording rather than degrading to it —
  // which is exactly what this revision found: both fallbacks still held the OLD sentences.
  it('keeps its validation fallbacks byte-identical to the shipped copy', () => {
    const source = readFileSync(
      resolve(repoRoot, 'src/ui/svelte/apps/manager/world/WorldCurrencyTab.svelte'),
      'utf8'
    );
    const lang = JSON.parse(readFileSync(resolve(repoRoot, 'lang/en.json'), 'utf8'));
    const shipped = lang.FABRICATE.Admin.Manager.CurrencyUnits;

    for (const leaf of ['ValidationTitle', 'ValidationHint']) {
      const key = `FABRICATE.Admin.Manager.CurrencyUnits.${leaf}`;
      const pattern = new RegExp(
        `text\\(\\s*'${key.replace(/\./g, '\\.')}',\\s*("(?:[^"\\\\]|\\\\.)*")\\s*\\)`
      );
      const found = source.match(pattern);
      assert.ok(found, `${leaf} must be read through its key with a string fallback`);
      assert.equal(
        JSON.parse(found[1]),
        shipped[leaf],
        `the ${leaf} fallback must read exactly what lang/en.json ships`
      );
    }
  });
});
