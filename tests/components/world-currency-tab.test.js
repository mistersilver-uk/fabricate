import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  SELECT_COMPILED_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';
import {
  assertSelectHasResolvedName,
  chooseSelectOption,
  closeSelectPanel,
  selectOptionLabels,
  selectOptionValues,
} from '../helpers/select-control.js';
import { assertNoElement } from '../helpers/svelte-dom.js';
import { installLangBackedI18n } from '../helpers/langBackedI18n.js';
import { FOUNDRY_BRIDGE_RAW_MODULES } from '../helpers/foundryBridgeModules.js';

const repoRoot = resolve(import.meta.dirname, '../..');

/** World > Currency (issue 1278), mounted on its own. */
const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-world-currency-tab-',
  rawModules: [
    ...FOUNDRY_BRIDGE_RAW_MODULES,
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
    'src/ui/svelte/util/foundryIconCatalogue.json',
    'src/ui/svelte/util/iconPickerPopover.js',
    'src/ui/svelte/util/listboxNavigation.js',
    'src/ui/svelte/util/pickerOptionModel.js',
    'src/ui/svelte/util/overlayHost.js'
  ],
  compiledModules: [
    // THE APP'S ONE SELECT AND ITS WHOLE COMPILED CLOSURE (issue 1510), spread rather than copied.
    ...SELECT_COMPILED_MODULES,
    // A `.svelte` the tree renders but the harness omits HANGS the suite (# cancelled) rather
    // than failing it, so every one is named.
    'src/ui/svelte/components/Chip.svelte',
    'src/ui/svelte/components/EmptyState.svelte',
    'src/ui/svelte/components/IconPicker.svelte',
    'src/ui/svelte/components/SearchablePopover.svelte',
    'src/ui/svelte/components/SearchablePopoverPanel.svelte',
    'src/ui/svelte/components/Field.svelte',
    // THE manager's labelled push-button (issue 1118). The currency card header and each expanded unit render it.
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

/**
 * The same ladder with gold broken down, which is what the sub-unit controls need (issue 1691).
 * Copper is the third rung: the Add sub-unit builder renders only while an eligible unit is left.
 */
const NESTED_UNITS = Object.freeze([
  {
    ...UNITS[0],
    denomination: 100,
    contains: [{ unitId: 'sp', amount: 10 }]
  },
  { ...UNITS[1], denomination: 10 },
  {
    id: 'cp',
    label: 'Copper',
    abbreviation: 'cp',
    actorPath: 'system.currency.cp',
    denomination: 1,
    contains: []
  }
]);

const PROVIDERS = Object.freeze([{ id: 'dnd5e-inventory', label: 'D&D 5e actor inventory' }]);

const hook = (root, selector) => root.querySelector(selector);

function assertHooks(root, selectors, present) {
  for (const selector of selectors) {
    assert.equal(Boolean(hook(root, selector)), present, `${selector} rendered=${present}`);
  }
}

/** Open one unit's editor, which is where the whole per-unit ladder lives. */
async function expandUnit(root, unitId) {
  hook(root, `[data-world-currency-unit-expand="${unitId}"]`).dispatchEvent(clickEvent());
  await flushRender();
  return root;
}

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('World > Currency tab (mounted)', () => {
  it('renders the ladder with NO crafting system in hand', async () => {
    // The point of the move. The tab takes no system prop at all, and it is deliberately ungated:
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
    // The shell renders <h1>World Currency</h1>.
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
    // Pinned by its label, not by "the first tooltipped button on the page".
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

  // ── The default actorProperty ladder (issue 1691, converted from the source contract) ──
  it('offers the two header actions and writes them to the world seam', async () => {
    const calls = [];
    const root = await harness.mount({
      currencyUnits: UNITS,
      currencyPresetsSupported: true,
      onAddCurrencyUnit: async () => {
        calls.push('add');
        return null;
      },
      onSeedCurrencyPresets: async () => calls.push('seed')
    });

    assert.ok(hook(root, '.manager-currency-unit-card'), 'the ladder is one edit card');
    hook(root, '[data-add-currency-unit]').dispatchEvent(clickEvent());
    hook(root, '[data-seed-currency-presets]').dispatchEvent(clickEvent());
    await flushRender();

    assert.deepEqual(calls, ['add', 'seed']);
  });

  it('collapses a unit to a summary row and expands it into the sub-unit ladder', async () => {
    const root = await harness.mount({ currencyUnits: NESTED_UNITS });

    assert.ok(hook(root, '.manager-character-modifier-summary'), 'a closed unit is a summary row');
    assertHooks(root, ['.manager-currency-subunit-builder', '[data-world-currency-subunit]'], false);

    await expandUnit(root, 'gp');

    assertHooks(
      root,
      [
        '.manager-currency-subunit-builder',
        '.manager-currency-subunit-section',
        '[data-world-currency-subunit="sp"]',
        '.manager-currency-subunit-amount'
      ],
      true
    );
    assert.equal(
      root.querySelectorAll('[data-world-currency-subunit]').length,
      1,
      'one chip per contained unit, and none from any other branch'
    );
  });

  it('edits and removes a sub-unit through the world sub-unit actions', async () => {
    const updates = [];
    const deletes = [];
    const root = await harness.mount({
      currencyUnits: NESTED_UNITS,
      onUpdateCurrencySubUnit: async (...args) => updates.push(args),
      onDeleteCurrencySubUnit: async (...args) => deletes.push(args)
    });
    await expandUnit(root, 'gp');

    const amount = hook(root, '.manager-currency-subunit-amount');
    amount.value = '25';
    amount.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }));
    await flushRender();
    assert.deepEqual(updates, [['gp', 'sp', '25']], 'the amount edit names the pair it changes');

    hook(root, '[data-world-currency-subunit="sp"] [data-chip-remove]').dispatchEvent(
      clickEvent()
    );
    await flushRender();
    assert.deepEqual(deletes, [['gp', 'sp']], 'and removing the chip unlinks the same pair');
  });

  // ── The three peer spend strategies (issue 1278) ──
  it('offers the three peer spend strategies and reports the chosen one', async () => {
    const chosen = [];
    const root = await harness.mount({
      currencyUnits: UNITS,
      onSetCurrencySpendStrategy: async (next) => chosen.push(next)
    });
    const strategy = '[data-world-currency-strategy-select]';

    assert.deepEqual(selectOptionValues(root, strategy), [
      'actorProperty',
      'actorInventory',
      'macro'
    ]);
    closeSelectPanel(root, strategy);
    chooseSelectOption(root, strategy, 'macro');
    await flushRender();

    assert.deepEqual(chosen, ['macro'], 'the shared Select hands the caller its own typed value');
    assertHooks(root, ['[data-world-currency-inventory-mode-select]'], false);
  });

  it('reflects the selected strategy in the one shared hint', async () => {
    const onProperty = await harness.mount({ currencyUnits: UNITS });
    const property = hook(onProperty, '[data-world-currency-strategy-hint]').textContent;

    harness.remount();
    const onMacro = await harness.mount({ currencyUnits: UNITS, currencySpendStrategy: 'macro' });

    assert.notEqual(
      hook(onMacro, '[data-world-currency-strategy-hint]').textContent.trim(),
      property.trim(),
      'the hint changes with the strategy rather than restating one fixed line'
    );
  });

  it('steers a provider-less world to macro without wiping its ladder', async () => {
    const root = await harness.mount({
      currencyUnits: UNITS,
      currencySpendStrategy: 'actorInventory',
      currencyProviderOptions: []
    });

    assertHooks(root, ['[data-world-currency-no-provider]', '[data-world-currency-unit="gp"]'], true);
    assertHooks(root, ['[data-world-currency-provider-select]'], false);
  });

  it('hands the provider the ladder, read-only, and takes the editing affordances away', async () => {
    const chosen = [];
    const root = await harness.mount({
      currencyUnits: NESTED_UNITS,
      currencySpendStrategy: 'actorInventory',
      currencyProviderId: 'dnd5e-inventory',
      currencyProviderOptions: PROVIDERS,
      onSetCurrencyProvider: async (next) => chosen.push(next)
    });

    assertHooks(
      root,
      [
        '[data-world-currency-provider-managed]',
        '.manager-currency-provider-managed-callout',
        '.manager-currency-provider-managed-summary',
        '.manager-currency-readonly-fields',
        '[data-world-currency-readonly-label]',
        '[data-world-currency-abbreviation]',
        '[data-world-currency-denomination]'
      ],
      true
    );
    assertHooks(
      root,
      [
        '[data-add-currency-unit]',
        '[data-seed-currency-presets]',
        '[data-world-currency-subunit]',
        '[data-world-currency-unit-expand="gp"]'
      ],
      false
    );

    chooseSelectOption(root, '[data-world-currency-provider-select]', 'dnd5e-inventory');
    await flushRender();
    assert.deepEqual(chosen, ['dnd5e-inventory']);
  });

  // ── Macro mode (issue 1278): three zones, one row, and no ladder arithmetic ──
  it('draws the three macro zones side by side, each named for its own field', async () => {
    const root = await harness.mount({ currencyUnits: UNITS, currencySpendStrategy: 'macro' });

    const zones = root.querySelector('[data-world-currency-macros]');
    assert.ok(zones, 'the macro card renders');
    assert.equal(zones.classList.contains('manager-currency-macro-zones'), true);
    assert.equal(zones.classList.contains('manager-currency-macro-row'), true, 'in a single row');

    const empty = [...root.querySelectorAll('[data-world-currency-macro-dropzone]')];
    assert.ok(empty.length >= 3, `three macro fields draw a zone each (found ${empty.length})`);
    for (const zone of empty) {
      assert.equal(zone.classList.contains('manager-component-source-drop-zone'), true);
    }
    const names = empty.map((zone) => zone.getAttribute('aria-label'));
    assert.equal(new Set(names).size, names.length, `each zone is named for its field: ${names}`);
  });

  it('unlinks a linked macro from the zone that carries it', async () => {
    const cleared = [];
    const root = await harness.mount({
      currencyUnits: UNITS,
      currencySpendStrategy: 'macro',
      currencyMacros: { canAfford: 'Macro.abc', increment: '', decrement: '', balance: '' },
      onClearCurrencyMacro: async (key) => cleared.push(key)
    });

    const linked = hook(root, '[data-world-currency-macro="canAfford"]');
    assert.ok(linked, 'a linked macro replaces its drop zone');
    linked.querySelector('button').dispatchEvent(clickEvent());
    await flushRender();

    assert.deepEqual(cleared, ['canAfford'], 'unlinking names the field it clears');
  });

  it('replaces the per-unit breakdown with a conversion note under the macro strategy', async () => {
    const root = await harness.mount({
      currencyUnits: NESTED_UNITS,
      currencySpendStrategy: 'macro'
    });
    await expandUnit(root, 'gp');

    assertHooks(root, ['[data-world-currency-unit-macro-note]'], true);
    assertHooks(
      root,
      [
        '.manager-currency-subunit-section',
        '.manager-currency-subunit-builder',
        '[data-world-currency-subunit]'
      ],
      false
    );
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

  /** The world profile's validation report (issue 1493). */
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
    // The list is keyed on the INDEX.
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
    // A permanently mounted live region has to be a REAL hidden element while it is silent.
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

// Issue 1493 (revision 3) — the note has to be true of the screen it appears on.

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

  // The one lang<->fallback mirror this change keeps.
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

  it('names both converted currency controls by their captions, and keeps their option lists', async () => {
    // THE PROVIDER CONTROL'S FIRST MOUNTED COVERAGE (issue 1510).
    // change touched. The strategy control's wrapper demoted to `Field as="div"`; the provider's
    // was DELETED, its caption and its hint riding the primitive's own `label=`/`hint=` form —
    // which is `hint`'s first caller in the corpus.
    const root = await harness.mount({
      currencyUnits: UNITS,
      currencySpendStrategy: 'actorInventory',
      currencyProviderId: 'dnd5e-inventory',
      currencyProviderOptions: [
        { id: 'dnd5e-inventory', label: 'D&D 5e actor inventory currency' },
        { id: 'pf2e-inventory', label: 'Pathfinder 2e actor inventory currency' },
      ],
    });

    const provider = '[data-world-currency-provider-select]';
    assert.deepEqual(selectOptionValues(root, provider), ['dnd5e-inventory', 'pf2e-inventory']);
    assert.deepEqual(selectOptionLabels(root, provider), [
      'D&D 5e actor inventory currency',
      'Pathfinder 2e actor inventory currency',
    ]);
    closeSelectPanel(root, provider);

    // BOTH NAMES NARROWED, DELIBERATELY.
    assert.equal(assertSelectHasResolvedName(root, provider), 'Provider');
    assert.equal(
      assertSelectHasResolvedName(root, '[data-world-currency-strategy-select]'),
      'Spend strategy'
    );

    // The provider's hint is the primitive's own note line.
    assert.ok(
      root.querySelector(provider).closest('.manager-field').querySelector('.fabricate-select-note'),
      'the provider hint renders through `hint=`, under the control'
    );
    assert.ok(
      root.querySelector('[data-world-currency-strategy-hint]'),
      'and the strategy hint stays the caller`s own hooked element'
    );
    // AND BOTH HINTS ARE ANNOUNCED, not merely drawn. Each control lost its `<label>`
    // containment, which is what used to fold the hint into the announced name — narrowing the
    // name was the right repair, but it left two hints on screen that nothing read. The provider
    // rides the primitive's own note through `hint=`; the strategy's is the caller's `<small>`,
    // drawn here because its copy changes with the chosen strategy, and reached through
    // `ariaDescribedBy`. Both are resolved to their rendered TEXT, because a pointer at a missing
    // element is exactly the failure this clause exists to catch.
    for (const [selector, expected] of [
      [
        provider,
        'A preconfigured adapter that reads and spends coins from the actor inventory.',
      ],
      [
        '[data-world-currency-strategy-select]',
        'Use a preconfigured provider that reads and spends coins from the actor inventory (e.g. pf2e).',
      ],
    ]) {
      const describedBy = root.querySelector(selector).getAttribute('aria-describedby');
      assert.ok(Boolean(describedBy), `${selector} describes itself by the hint beside it`);
      assert.equal(
        root.querySelector(`#${describedBy}`)?.textContent.trim(),
        expected,
        `${selector}'s aria-describedby resolves to the hint the GM can see`
      );
    }
    assert.equal(
      root
        .querySelector('[data-world-currency-strategy-select]')
        .getAttribute('aria-describedby'),
      root.querySelector('[data-world-currency-strategy-hint]').id,
      'and the strategy points at the caller`s own hooked element, not at a note the primitive ' +
        'would have drawn instead'
    );

    // BOTH TRIGGERS, because "either" is what the message claims and one of them was never
    // asked. The strategy is the demote-and-point site — the caller's own wrapper became a
    // `Field as="div"` — and the provider is the primitive's own labelled form, whose host this
    // change swapped inside `Select.svelte`; a regression in either place is a caption that
    // forwards its click into a panel dismissed on `mousedown`.
    for (const trigger of [provider, '[data-world-currency-strategy-select]']) {
      assert.ok(
        !root.querySelector(trigger).closest('label'),
        `no \`<label>\` survives around ${trigger}`
      );
    }
  });
});
