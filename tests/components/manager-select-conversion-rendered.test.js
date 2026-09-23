/*
 * THE THREE THINGS A MOUNTED SUITE CANNOT SEE ABOUT THE MANAGER SELECT CONVERSION (issue 1510).
 * ── 3. WHETHER THE PANEL IS WIDE ENOUGH FOR THE LIST IT OPENS ───────────────────────────────
 * The panel band resolves to ONE number — `clamp(max(triggerWidth, minWidth), minWidth,
 * maxWidth)` — written by `actions/anchoredPopover.js` as an inline style at run time, so there
 * is no declaration anywhere to read. A ticked row then spends part of that width on a tick
 * gutter, row padding and panel chrome before it draws a label at 12px. A panel sized from its
 * trigger can therefore truncate an option label the trigger itself renders whole. The
 * non-truncation clause below opens every converted panel and asserts no option label is
 * ellipsised, and its negative control proves the clause can see a panel that is too narrow.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createViteFixtureServer, pressPointerOn } from '../helpers/vite-fixture-server.js';

/** Sub-pixel slack for a rect comparison. Widths here differ by whole pixels or not at all. */
const EPSILON = 0.5;

const fixtureServer = createViteFixtureServer({ styleMountPrefix: '/@manager-select-styles/' });

before(async () => {
  await fixtureServer.start();
});

after(async () => {
  await fixtureServer.stop();
});

/**
 * Open the fixture on one subject and hand back the page.
 *
 * @param {string} subject The `?subject=` value.
 * @param {string} [value] The option the control starts on.
 * @returns {Promise<import('playwright').Page>}
 */
async function openFixture(subject, value = '') {
  const page = await fixtureServer.newPage({ viewport: { width: 1280, height: 900 } });
  const query = `subject=${subject}${value ? `&value=${encodeURIComponent(value)}` : ''}`;
  await page.goto(fixtureServer.url(`/tests/fixtures/manager-select/index.html?${query}`), {
    waitUntil: 'load',
  });
  await page.waitForFunction(() => globalThis.__managerSelectFixtureReady === true);
  return page;
}

/** Whether the portaled panel is on the page right now. */
function panelIsOpen(page) {
  return page.evaluate(() => Boolean(document.querySelector('.fabricate-select-popover')));
}

/**
 * Both legs of the caption-click proof for one wrapper shape.
 *
 * @param {string} subject
 * @param {string} captionSelector
 * @param {string} [triggerSelector]
 * @returns {Promise<{openedFromClosed: boolean, closedFromOpen: boolean, accessibleName: string}>}
 */
async function captionClickLegs(
  subject,
  captionSelector,
  triggerSelector = '[data-fixture-select]'
) {
  const page = await openFixture(subject);
  try {
    assert.equal(await panelIsOpen(page), false, `${subject} starts closed`);

    // LEG 1 — from closed.
    await pressPointerOn(page, captionSelector);
    const openedFromClosed = await panelIsOpen(page);

    // LEG 2 — from open. If leg 1 did not open it.
    if (!openedFromClosed) await pressPointerOn(page, triggerSelector);
    assert.equal(await panelIsOpen(page), true, `${subject} is open before leg 2`);
    await pressPointerOn(page, captionSelector);
    const closedFromOpen = !(await panelIsOpen(page));

    const accessibleName = await page.evaluate((selector) => {
      const trigger = document.querySelector(selector);
      const labelledBy = trigger.getAttribute('aria-labelledby');
      if (labelledBy) return document.getElementById(labelledBy)?.textContent?.trim() ?? '';
      if (trigger.getAttribute('aria-label')) return trigger.getAttribute('aria-label');
      const wrapper = trigger.closest('label');
      return wrapper ? wrapper.textContent.trim() : '';
    }, triggerSelector);
    return { openedFromClosed, closedFromOpen, accessibleName };
  } finally {
    await page.close();
  }
}

describe('a caption click cannot close a list it is wrapped in a <label> with (issue 1510)', () => {
  it('forwards a caption press into the trigger from CLOSED only while the wrapper is a label', async () => {
    const demoted = await captionClickLegs('span', '.fixture-caption');
    const surviving = await captionClickLegs('label', '.fixture-caption');

    assert.equal(
      surviving.openedFromClosed,
      true,
      'the surviving label forwards the press into the trigger, which opens the panel — this is ' +
        'the forwarding the demotion removes, and the leg that proves the sequence drives the ' +
        'control at all'
    );
    assert.equal(
      demoted.openedFromClosed,
      false,
      'and the demoted span forwards nothing, so the caption is no longer a hit target. THE ' +
        'ACCEPTED COST, measured, at every demote-and-point site this change converts.'
    );
  });

  it('closes from open ONLY once the wrapper is demoted', async () => {
    const demoted = await captionClickLegs('span', '.fixture-caption');
    const surviving = await captionClickLegs('label', '.fixture-caption');

    assert.equal(
      surviving.closedFromOpen,
      false,
      'THE DEFECT. With the panel open, the caption’s own mousedown is caught by the ' +
        'capture-phase dismisser and closes the list, and the click the `<label>` forwards then ' +
        're-opens it — so the caption can never close the list it opened. If this ever passes, ' +
        'the demotion rule has lost its measured ground and must be restated or withdrawn ' +
        'rather than quietly kept.'
    );
    assert.equal(
      demoted.closedFromOpen,
      true,
      'and with the wrapper demoted to a `<span>` there is nothing to forward: the mousedown ' +
        'dismisses the panel and it stays dismissed'
    );
  });

  it('closes from open on a DEMOTED CONVERTED SITE, not only on the synthetic shape', async () => {
    // THE SECOND SUBJECT acceptance 11 names: a site this change actually converted.
    const converted = await captionClickLegs(
      'currency',
      '[data-world-currency-strategy] .manager-field > span',
      '[data-world-currency-strategy-select]'
    );
    assert.equal(
      converted.closedFromOpen,
      true,
      'the converted spend-strategy control closes when its own caption is pressed, which is ' +
        'the property the demotion buys'
    );
    assert.match(
      converted.accessibleName,
      /Spend strategy/,
      'and it is still named by that caption through `aria-labelledby`'
    );
  });

  it('closes from open on the PRIMITIVE’S OWN labelled form, which this change repaired', async () => {
    // THE THIRD SUBJECT, and the one the maintainer ruled into this phase. `Select label=`
    // rendered `<Field as="label">` around its trigger until this change, so all twelve shipped
    // interactables callers carried the defect leg 2 measures. The host is `Field as="div"` now,
    // with the caption span carrying the id the trigger's `aria-labelledby` already pointed at.
    const field = await captionClickLegs('field', '.fabricate-select-caption');

    assert.equal(
      field.openedFromClosed,
      false,
      'the repaired labelled form’s caption is no longer a hit target, exactly as a demoted ' +
        'caller wrapper’s is not — the same accepted cost, now paid inside the primitive'
    );
    assert.equal(
      field.closedFromOpen,
      true,
      'THE REPAIR. Before it, the caption’s mousedown dismissed the panel and the `<label>` ' +
        'forwarded a click that re-opened it, so the list could never be closed from its own ' +
        'caption at any of the twelve shipped `Select label=` call sites. A failure here is a ' +
        'defect in this change, not a question for the maintainer.'
    );
    assert.equal(
      field.accessibleName,
      'Sort',
      'and the repair changed no announced name: the trigger was named by `aria-labelledby` to ' +
        'the caption before it and is named by the same pointer after it'
    );
  });
});

/** The conditions card's time-of-day picker, which carries no hook of its own. */
const CONDITION_PICKER =
  '[data-gathering-condition-panel="timeOfDay"] .manager-condition-current .fabricate-select-trigger';

/**
 * The converted sites this fixture can mount, and what each one's row is measured against.
 * "Alchemical reagent" measures 152.08px in this fixture, above the 140px floor by design.
 * `rung` is the `size=` each call site passes (absent means the primitive's `form` default), and it
 * is asserted because nothing else in the corpus reads a converted trigger's height band.
 */
const CONVERTED_SITES = Object.freeze([
  Object.freeze({
    subject: 'prerequisites',
    name: 'the character prerequisite operator',
    hook: '[data-prerequisite-operator]',
    values: ['gte', 'neq'],
    column: true,
    rung: 'form',
  }),
  Object.freeze({
    subject: 'currency',
    name: 'the world currency spend strategy',
    hook: '[data-world-currency-strategy-select]',
    values: ['macro', 'actorProperty'],
    column: true,
    rung: 'form',
  }),
  Object.freeze({
    subject: 'import',
    name: 'the folder import category',
    hook: '[data-import-mapping-row="f1"] [data-import-mapping-category]',
    secondHook: '[data-import-mapping-row="f2"] [data-import-mapping-category]',
    values: ['', ''],
    column: false,
    floor: 140,
    rung: 'form',
  }),
  Object.freeze({
    subject: 'economy',
    name: 'the gathering regeneration unit',
    hook: '[data-economy-regen-unit]',
    values: ['hours', 'minutes'],
    column: true,
    rung: 'form',
  }),
  // ISSUE 1510 COMMIT 2a — the recipe studio. Its cells sit in `.manager-recipe-field` rather than
  // in a `Field` column, and their width came from `.manager-recipe-field select`, so the
  // counterpart is a sheet rule off the same wrapper class.
  Object.freeze({
    subject: 'recipe-overview',
    name: 'the recipe check tier',
    hook: '[data-recipe-field="checkTierId"]',
    values: ['tier-easy', 'tier-legendary'],
    column: true,
    columnSelector: '.manager-recipe-field',
    rung: 'form',
  }),
  Object.freeze({
    subject: 'recipe-overview',
    name: 'the recipe category',
    hook: '[data-recipe-category-select]',
    values: ['Metal', 'Alchemical reagent'],
    column: true,
    columnSelector: '.manager-recipe-field',
    rung: 'form',
  }),
  Object.freeze({
    subject: 'recipe-overview',
    name: 'the recipe minimum success tier',
    hook: '[data-recipe-field="minSuccessOutcomeId"]',
    values: ['tier-easy', 'tier-legendary'],
    column: true,
    columnSelector: '.manager-recipe-field',
    rung: 'form',
  }),
  Object.freeze({
    subject: 'recipe-overview',
    name: 'the eligible modifier set',
    hook: '[data-recipe-field="craftingModifierSet"]',
    values: ['inherit', 'custom'],
    column: true,
    columnSelector: '.manager-recipe-modifier-set-field',
    rung: 'form',
  }),
  // The one 2a site whose row hugs by design: the kind picker states 132px on the picker ROOT and
  // the trigger fills it, so both option words measure the same fixed slot.
  Object.freeze({
    subject: 'recipe-option',
    name: 'the requirement kind',
    hook: '[data-recipe-option-kind]',
    values: ['component', 'tags'],
    column: false,
    floor: 132,
    rung: 'inline',
  }),
  // ISSUE 1510 COMMIT 2e — the danger ceiling, the one 2e site whose value a prop can drive. Its
  // counterpart is one sheet rule off the wrapper class its three pickers share.
  Object.freeze({
    subject: 'environment-overview',
    name: 'the environment danger ceiling',
    hook: '[data-environment-field="dangerLevel"]',
    values: ['safe', 'hazardous'],
    column: true,
    columnSelector: '.manager-environment-context-field',
    rung: 'form',
  }),
  // Issue 1510 commit 3a — the systems, access and recipe-item browse toolbars. Their filter values
  // are component state no `?value=` can seed, so each is `drive`n through its own panel; and their
  // claim is the shared 144px floor under `.manager-filter` rather than a column, because a browse
  // bar's filters hug in a row of siblings. `pinned` is the regression the floor exists to stop: at
  // the native rule's 128 four of these bars re-measured as the GM chose, shifting every control to
  // the right of the one that changed.
  ...[
    {
      subject: 'systems-browser',
      name: 'the systems status filter',
      hook: '.manager-filter .fabricate-select-trigger',
      values: ['all', 'active'],
    },
    {
      subject: 'access-tab',
      name: 'the recipe access category filter',
      hook: '[data-access-category-filter]',
      values: ['all', 'Smithing'],
    },
    {
      subject: 'access-tab',
      name: 'the recipe access state filter',
      hook: '[data-access-filter]',
      values: ['all', 'granted'],
    },
    {
      subject: 'books-scrolls',
      name: 'the recipe-item status filter',
      hook: '[data-books-scrolls-status-filter]',
      values: ['all', 'enabled'],
    },
    {
      subject: 'books-scrolls',
      name: 'the recipe-item type filter',
      hook: '[data-books-scrolls-type-filter]',
      values: ['all', 'Scroll'],
    },
    {
      subject: 'books-scrolls',
      name: 'the recipe-item limits filter',
      hook: '[data-books-scrolls-cap-filter]',
      values: ['all', 'limited'],
    },
    // Issue 1510 commit 3b — the environments toolbar's four, which carry no hook of their own and
    // are addressed by the `aria-label` each trigger keeps.
    ...[
      ['status', ['all', 'active']],
      ['selection mode', ['all', 'targeted']],
      ['risk', ['all', 'hazardous']],
      ['biome', ['all', 'forest']],
    ].map(([axis, values]) => ({
      subject: 'environments-browser',
      name: `the environments ${axis} filter`,
      hook: `.fabricate-select-trigger[aria-label="Filter environments by ${axis}"]`,
      values,
    })),
    // Issue 1510 commit 3c — the gathering task and event toolbars' three each. None carries an
    // `aria-label` or a hook, so each is addressed by the caption id that names it.
    ...[
      ['tasks', 'status', ['all', 'active']],
      ['tasks', 'biome', ['all', 'forest']],
      ['tasks', 'availability', ['all', 'any']],
      ['events', 'status', ['all', 'active']],
      ['events', 'biome', ['all', 'forest']],
      ['events', 'danger', ['all', 'deadly']],
    ].map(([browser, axis, values]) => ({
      subject: `gathering-${browser}-browser`,
      name: `the gathering ${browser} ${axis} filter`,
      hook: `[data-gathering-${browser}-browser] .fabricate-select-trigger[aria-labelledby$="-${axis}-filter"]`,
      values,
    })),
  ].map((site) =>
    Object.freeze({ ...site, column: false, floor: 144, pinned: true, drive: true, rung: 'toolbar' })
  ),
  // And the conditions card's current-value picker, whose value a prop seeds. Its counterpart is
  // one sheet rule off the demoted field's class, as the danger ceiling's is.
  Object.freeze({
    subject: 'environments-settings',
    name: 'the current time of day',
    hook: CONDITION_PICKER,
    values: ['day', 'dawn'],
    column: true,
    columnSelector: '.manager-condition-current',
    rung: 'form',
  }),
]);

/**
 * The three 2e sites a `?value=` cannot drive — both add controls rest on the sentinel and the Tool
 * roster holds component state — measured at rest against the column each must fill (issue 1510).
 */
const RESTING_WIDTH_SITES = Object.freeze([
  Object.freeze({
    subject: 'environment-overview',
    name: 'the realm membership add control',
    hook: '[data-environment-field="includedRealmIds"] .fabricate-select-trigger',
    columnSelector: '.manager-environment-context-field',
    rung: 'form',
  }),
  Object.freeze({
    subject: 'environment-overview',
    name: 'the biome membership add control',
    hook: '.manager-environment-context-biomes .fabricate-select-trigger',
    columnSelector: '.manager-environment-context-field',
    rung: 'form',
  }),
  Object.freeze({
    subject: 'tool-preview',
    name: 'the Tool rails Preview as roster',
    hook: '[data-tool-preview-actor]',
    columnSelector: '[data-tool-actor-preview]',
    rung: 'toolbar',
  }),
]);

/**
 * The recipe, component and essence toolbars' six (issue 1510). Their filters are bare and their
 * sorts hug beside a micro-label, so neither a column nor the `.manager-filter` floor sizes them,
 * and the claim they carry here is the panel's; the category filter's cap has a clause of its own.
 */
const LIBRARY_TOOLBAR_SITES = Object.freeze(
  [
    ['recipes-browser', 'the recipe category filter', '[data-recipe-category-filter]'],
    ['recipes-browser', 'the recipe sort', '[data-recipe-sort]'],
    ['components-browser', 'the component category filter', '[data-component-category-filter]'],
    ['components-browser', 'the component essence filter', '[data-component-essence-filter]'],
    ['components-browser', 'the component sort', '[data-component-sort]'],
    ['essence-browser', 'the essence sort', '[data-essence-sort]'],
  ].map(([subject, name, hook]) => Object.freeze({ subject, name, hook, start: '' }))
);

/** The bare filter roots' cap, which the trigger must be held to (issue 1510). */
const FILTER_ROOT_CAP = 180;

/** The Tool library's sort, and the panel floor its call site states for `In this system`. */
const TOOL_SORT = '[data-tool-sort-key]';
const TOOL_SORT_PANEL_FLOOR = 112;

/** The recipe inspector's ingredient-set picker, which fills the inspector column. */
const ROUTE_PICKER = '[data-recipe-route="ingredient-set"]';

/** `anchoredPopover`'s inset from the overlay host, which bounds a panel under a full-width trigger. */
const OVERLAY_INSET = 16;

/**
 * Every option label a site's panel renders, with the two widths the truncation test compares.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<{panelWidth: number, labels: Array<{text: string, scroll: number, client: number}>}|null>}
 */
function readOpenPanel(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('.fabricate-select-popover');
    if (!panel) return null;
    return {
      panelWidth: Number(panel.getBoundingClientRect().width.toFixed(2)),
      labels: [...panel.querySelectorAll('[role="option"] .fabricate-select-label')].map(
        (label) => ({
          text: label.textContent.trim(),
          scroll: label.scrollWidth,
          client: label.clientWidth,
        })
      ),
    };
  });
}

/**
 * Put a control whose value no prop can seed in the state by the act that reaches it: open the
 * panel and click the row, which is what the GM does and what `select-control.js` does.
 *
 * @param {import('playwright').Page} page
 * @param {string} hook The trigger.
 * @param {string} value The option's own value.
 */
async function driveRenderedOption(page, hook, value) {
  await pressPointerOn(page, hook);
  await pressPointerOn(page, `.fabricate-select-popover [data-popover-option="${value}"]`);
}

/**
 * Measure one site's trigger as it ships and with its width rule neutralised inline.
 *
 * @param {string} subject
 * @param {string} hook
 * @param {string} value
 * @returns {Promise<{shipped: number, unfloored: number, face: string, column: number,
 *   rung: string, label: string}>}
 */
async function measureTrigger(subject, hook, value, columnSelector = '.manager-field', drive = false) {
  const page = await openFixture(subject, drive ? '' : value);
  try {
    if (drive) await driveRenderedOption(page, hook, value);
    return await page.evaluate(([selector, column_]) => {
      const trigger = document.querySelector(selector);
      const shipped = trigger.getBoundingClientRect().width;
      const face = globalThis.getComputedStyle(trigger).fontFamily;
      const column = trigger.closest(column_)?.getBoundingClientRect().width ?? 0;
      const rung = trigger.getAttribute('data-select-size');
      const label = trigger.querySelector('.fabricate-select-value')?.textContent.trim() ?? '';
      trigger.style.width = 'auto';
      trigger.style.minWidth = '0px';
      const unfloored = trigger.getBoundingClientRect().width;
      return {
        shipped: Number(shipped.toFixed(2)),
        unfloored: Number(unfloored.toFixed(2)),
        column: Number(column.toFixed(2)),
        face,
        rung,
        label,
      };
    }, [hook, columnSelector]);
  } finally {
    await page.close();
  }
}

/**
 * Assert one site's trigger reports the size rung its call site passes.
 *
 * @param {{name: string, rung: string}} site
 * @param {string|null} measured The trigger's `data-select-size`.
 */
function assertRung(site, measured) {
  // The rung names a HEIGHT, a corner, a type size and a fill together, so losing it puts a
  // 38px `form` box on a 34px rail line - four pixels proud of its own row. Every other clause
  // here reads width, which the rung does not touch, so this is the only thing that sees it.
  assert.equal(
    measured,
    site.rung,
    `${site.name} reports the \`${measured}\` size rung where its call site passes ` +
      `\`${site.rung}\`, so its height, corner, type size and fill are all a band out`
  );
}

describe('a converted manager trigger keeps the width its native select had (issue 1510)', () => {
  it('renders in the face the fixture declares, so every width below is reproducible', async () => {
    const { face } = await measureTrigger('economy', '[data-economy-regen-unit]', 'hours');
    assert.match(
      face,
      /Arial/iu,
      'the fixture declares `Arial, sans-serif` and every figure in this file was measured ' +
        'against it. A different face means these widths cannot be reproduced, and the width ' +
        'counterparts they justify were chosen against something else.'
    );
  });

  for (const site of CONVERTED_SITES) {
    const claim = site.column
      ? `holds ${site.name} at one width across its option labels`
      : `holds ${site.name} at or above its ${site.floor}px floor across its rows`;
    it(claim, async () => {
      const [shortest, longest] = await Promise.all([
        measureTrigger(site.subject, site.hook, site.values[0], site.columnSelector, site.drive),
        measureTrigger(
          site.subject,
          site.secondHook ?? site.hook,
          site.values[1],
          site.columnSelector,
          site.drive
        ),
      ]);

      assertRung(site, shortest.rung);
      assertRung(site, longest.rung);

      if (site.column) {
        assert.ok(
          Math.abs(shortest.shipped - longest.shipped) < EPSILON,
          `${site.name} measured ${shortest.shipped}px on its shortest option and ` +
            `${longest.shipped}px on its longest, so its width counterpart is not absorbing the ` +
            'difference and the row re-flows every time the GM changes the value'
        );
        assert.ok(
          Math.abs(shortest.shipped - shortest.column) < EPSILON,
          `${site.name} measured ${shortest.shipped}px inside a ${shortest.column}px field ` +
            'column. Its native `<select>` took `width: 100%` from `.fabricate-field.manager-' +
            'field select`, which is element-typed and reaches no `<button>`, so the caller ' +
            'states the width itself. The recipe studio pays the same regression through ' +
            '`.manager-recipe-field select`.'
        );
      } else {
        // A FLOOR, NOT AN EQUALITY. The row hugs its value by design.
        assert.ok(
          Math.abs(shortest.shipped - site.floor) < EPSILON,
          `${site.name} measured ${shortest.shipped}px on its first row against a declared ` +
            `floor of ${site.floor}px`
        );
        assert.ok(
          longest.shipped >= site.floor - EPSILON,
          `${site.name} measured ${longest.shipped}px on its second row, below the ` +
            `${site.floor}px floor its own scoped rule declares`
        );
        if (site.pinned) {
          // NON-VACUITY FOR THE PINNING CLAIM. A driven site's two states are reached by clicking a
          // row, and a click that missed would measure the resting value twice and pass.
          assert.notEqual(
            shortest.label,
            longest.label,
            `${site.name} read "${shortest.label}" in both measured states, so the two figures ` +
              'below are of one rendered string and the floor is proving nothing'
          );
          assert.ok(
            Math.abs(shortest.shipped - longest.shipped) < EPSILON,
            `${site.name} measured ${shortest.shipped}px on its shortest option and ` +
              `${longest.shipped}px on its longest, so the floor is not absorbing the difference ` +
              'and every control to the right of it shifts when the GM changes the filter'
          );
        }
      }
    });
  }

  it('renders two distinct category labels for the recipe category site, not one duplicated', async () => {
    // The category site's equal-width clause above is vacuous by CSS design — `width: 100%`
    // fixes both states at the same column regardless of content — so this reads the trigger's
    // own visible text for each measured state instead of its box.
    const site = CONVERTED_SITES.find((entry) => entry.hook === '[data-recipe-category-select]');
    const [firstLabelText, secondLabelText] = await Promise.all(
      site.values.map(async (value) => {
        const page = await openFixture(site.subject, value);
        try {
          return await page.evaluate(
            (selector) => document.querySelector(selector)?.textContent.trim() ?? '',
            site.hook
          );
        } finally {
          await page.close();
        }
      })
    );
    assert.notEqual(
      firstLabelText,
      secondLabelText,
      'the fixture renders two distinct category labels, not one duplicated'
    );
  });

  for (const site of RESTING_WIDTH_SITES) {
    it(`holds ${site.name} at its column width`, async () => {
      // No second value to compare, so the claim is the one the counterpart exists to make: the
      // trigger fills its column instead of hugging. `.fabricate-field.manager-field select`
      // supplied that width natively and is element-typed, so it reaches no `<button>`.
      const measured = await measureTrigger(site.subject, site.hook, '', site.columnSelector);
      assertRung(site, measured.rung);
      assert.ok(
        measured.column > 0,
        `${site.name} resolved no ${site.columnSelector} column to measure against`
      );
      assert.ok(
        Math.abs(measured.shipped - measured.column) < EPSILON,
        `${site.name} measured ${measured.shipped}px inside a ${measured.column}px column, and ` +
          `hugs at ${measured.unfloored}px with its width rule removed — so the caller-owned ` +
          'trigger width is not reaching it'
      );
    });
  }

  it('holds the add-sub-unit control at its column width across its option labels', async () => {
    // THE SITE THE CONVERSION REGRESSED, and the one `?value=` cannot reach.
    // control renders only inside an EXPANDED currency unit that still has assignable sub-units,
    // so it is driven here rather than mounted. Its native `<select>` filled the
    // `minmax(0, 1fr)` track of `.manager-currency-subunit-builder`; the `<button>` measured
    // 90.27px on "Silver (sp)" and 142.38px on "Electrum piece (ep)" in a 266px column until the
    // caller stated the width, which is a control that changes size as the GM reads its list.
    const page = await openFixture('currency');
    const builderTrigger = '.manager-currency-subunit-builder .fabricate-select-trigger';
    const read = () =>
      page.evaluate((selector) => {
        const trigger = document.querySelector(selector);
        if (!trigger) return null;
        const shipped = trigger.getBoundingClientRect().width;
        const column = trigger.closest('.manager-field')?.getBoundingClientRect().width ?? 0;
        return {
          label: trigger.textContent.replaceAll(/\s+/gu, ' ').trim(),
          shipped: Number(shipped.toFixed(2)),
          column: Number(column.toFixed(2)),
        };
      }, builderTrigger);

    try {
      await pressPointerOn(page, '[data-world-currency-unit-expand="gp"]');
      const shortest = await read();
      assert.ok(
        Boolean(shortest),
        'expanding the gold unit rendered no add-sub-unit trigger to measure, so this clause is ' +
          'quantifying over nothing'
      );

      await pressPointerOn(page, builderTrigger);
      await pressPointerOn(page, '[data-popover-option="electrum"]');
      const longest = await read();
      assert.ok(
        longest.label !== shortest.label,
        `choosing the electrum option left the trigger reading "${longest.label}", so the two ` +
          'measurements below are of the same rendered string and prove nothing'
      );

      for (const measurement of [shortest, longest]) {
        assert.ok(
          Math.abs(measurement.shipped - measurement.column) < EPSILON,
          `the add-sub-unit trigger measured ${measurement.shipped}px reading ` +
            `"${measurement.label}" inside a ${measurement.column}px field column, so it hugs ` +
            'its value inside a full-width grid track instead of filling it'
        );
      }
      assert.ok(
        Math.abs(shortest.shipped - longest.shipped) < EPSILON,
        `the add-sub-unit trigger measured ${shortest.shipped}px on "${shortest.label}" and ` +
          `${longest.shipped}px on "${longest.label}", so it re-sizes as the GM changes the ` +
          'sub-unit'
      );
    } finally {
      await page.close();
    }
  });

  it('holds a bare filter trigger inside its root’s 180px cap on a value longer than the cap', async () => {
    // THE TOP OF THE BAND. The root is the flex item and states the cap; the trigger is sized to its
    // value, so without its own rule a GM-authored category overflows the root it sits in.
    const page = await openFixture('components-browser-long-category');
    const hook = '[data-component-category-filter]';
    try {
      await driveRenderedOption(page, hook, 'Rare alchemical reagents and tinctures');
      const measured = await page.evaluate((selector) => {
        const trigger = document.querySelector(selector);
        const value = trigger.querySelector('.fabricate-select-value');
        const width = (element) => Number(element.getBoundingClientRect().width.toFixed(2));
        const shipped = {
          trigger: width(trigger),
          root: width(trigger.closest('.fabricate-select')),
          ellipsised: value.scrollWidth > value.clientWidth,
          chevronInside:
            trigger.querySelector(':scope > i:last-child').getBoundingClientRect().right <=
            trigger.getBoundingClientRect().right + 0.5,
        };
        trigger.style.maxWidth = 'none';
        return { ...shipped, uncapped: width(trigger) };
      }, hook);
      assert.ok(
        measured.uncapped > FILTER_ROOT_CAP,
        `the trigger measured ${measured.uncapped}px uncapped, inside the cap, so this value does ` +
          'not test the cap at all'
      );
      assert.ok(
        Math.abs(measured.root - FILTER_ROOT_CAP) < EPSILON &&
          Math.abs(measured.trigger - measured.root) < EPSILON,
        `the trigger measured ${measured.trigger}px in a ${measured.root}px root, so it overflows ` +
          'the cap the root states and pushes every control after it along the row'
      );
      assert.ok(measured.ellipsised, 'and the value ellipsises inside the capped trigger');
      assert.ok(measured.chevronInside, 'and the chevron stays inside the capped trigger');
    } finally {
      await page.close();
    }
  });

  it('inks the component toolbar triggers in the secondary text colour the reference draws', async () => {
    // `proto:1054`, `proto:1056` and `proto:1066` ink all three `--text2`. A route rule keyed on
    // `data-manager-view="components"` states it; the essence sort, on no such route, is the
    // non-vacuity leg, so a probe that resolved to the rung's own ink could not pass.
    const read = async (subject, hooks) => {
      const page = await openFixture(subject);
      try {
        return await page.evaluate((selectors) => {
          const probe = document.createElement('span');
          probe.style.color = 'var(--fab-text-secondary)';
          document.querySelector('.fabricate-manager').append(probe);
          const secondary = globalThis.getComputedStyle(probe).color;
          probe.remove();
          return {
            secondary,
            inks: selectors.map(
              (selector) => globalThis.getComputedStyle(document.querySelector(selector)).color
            ),
          };
        }, hooks);
      } finally {
        await page.close();
      }
    };
    const components = await read('components-browser', [
      '[data-component-category-filter]',
      '[data-component-essence-filter]',
      '[data-component-sort]',
    ]);
    assert.deepEqual(
      components.inks,
      [components.secondary, components.secondary, components.secondary],
      'the category, essence and sort triggers all compute to `--fab-text-secondary`'
    );
    const essences = await read('essence-browser', ['[data-essence-sort]']);
    assert.notEqual(
      essences.inks[0],
      essences.secondary,
      'and a trigger off that route does not, so the probe is not simply the rung’s own ink'
    );
  });

  it('shows a converted trigger DOES resize with its value once its width rule is removed', async () => {
    // NON-VACUITY for every clause above. Without it.
    const [shortest, longest] = await Promise.all([
      measureTrigger('currency', '[data-world-currency-strategy-select]', 'macro'),
      measureTrigger('currency', '[data-world-currency-strategy-select]', 'actorProperty'),
    ]);
    assert.ok(
      longest.unfloored - shortest.unfloored > 1,
      `unfloored, the spend strategy measured ${shortest.unfloored}px on "Macro" and ` +
        `${longest.unfloored}px on "Actor data path" — if those are equal, the control is not ` +
        'content-sized and the width counterpart is proving nothing'
    );
  });
});

describe('the two hints the currency card draws read in one treatment (issue 1510)', () => {
  it('renders the caller-drawn strategy hint exactly as the primitive draws the provider hint', async () => {
    // THE CARD HAS TWO HINTS AND ONE OF THEM IS THE PRIMITIVE'S. The provider adopted
    // `Select hint=`, which draws `.fabricate-select-note`; the strategy line is drawn by the
    // caller because its copy is conditional. Putting the class on the caller's `<small>` was
    // INERT: `.fabricate-field.manager-field small` is ELEMENT-TYPED at (0,2,1) and the note
    // class is (0,1,0), so the sheet's small print out-ranked it and the two hints went on
    // rendering in two different faces with the class present. The caller writes the same
    // ELEMENT the primitive does now. That is a cascade question and happy-dom computes no
    // cascade, so it is measured here rather than read off the markup.
    const page = await openFixture('currency', 'actorInventory');
    try {
      const [strategy, provider] = await page.evaluate(() => {
        const read = (selector) => {
          const element = document.querySelector(selector);
          if (!element) return null;
          const style = globalThis.getComputedStyle(element);
          return {
            color: style.color,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            lineHeight: style.lineHeight,
          };
        };
        return [
          read('[data-world-currency-strategy-hint]'),
          read('.fabricate-select-field .fabricate-select-note'),
        ];
      });
      assert.ok(Boolean(provider), 'the provider control rendered no hint of its own to match');
      assert.ok(Boolean(strategy), 'the spend-strategy control rendered no hint to compare');
      assert.deepEqual(
        strategy,
        provider,
        'the spend-strategy hint and the provider hint sit one above the other in the same card ' +
          'and must read the same. The strategy line is drawn by the caller, so it carries the ' +
          'note class itself — and on a `<small>` inside a `.manager-field` that class is ' +
          'out-ranked by the sheet`s element-typed small print, which is why the element matters.'
      );
    } finally {
      await page.close();
    }
  });
});

describe('a converted manager panel is wide enough for the list it opens (issue 1510)', () => {
  const PANEL_SITES = [
    // `start` is inert for a `drive` site, which nothing seeds through `?value=`, so those sites
    // measure the resting list; the panel still opens and every label is measured.
    ...CONVERTED_SITES.map((site) => ({ ...site, start: site.values[1] })),
    {
      subject: 'currency',
      name: 'the world currency provider roster',
      hook: '[data-world-currency-provider-select]',
      start: 'actorInventory',
    },
    {
      subject: 'economy',
      name: 'the gathering regeneration policy',
      hook: '[data-economy-regen-policy]',
      start: 'hours',
    },
    // The same three, opened at rest. The roster's labels are world actor names rather than a
    // closed vocabulary, so it is the one that can outgrow the `toolbar` rung's 320px cap.
    ...RESTING_WIDTH_SITES.map((site) => ({ ...site, start: '' })),
    ...LIBRARY_TOOLBAR_SITES,
    { subject: 'tools-browser', name: 'the Tool library sort', hook: TOOL_SORT, start: '' },
    { subject: 'recipe-inspector-1024', name: 'the ingredient-set picker', hook: ROUTE_PICKER, start: '' },
  ];

  for (const site of PANEL_SITES) {
    it(`draws every option label of ${site.name} whole`, async () => {
      const page = await openFixture(site.subject, site.start);
      try {
        // The conditions card sits below the economy card, under the fixture frame's fold.
        await page.locator(site.hook).first().scrollIntoViewIfNeeded();
        await pressPointerOn(page, site.hook);
        const panel = await readOpenPanel(page);
        assert.ok(Boolean(panel), `${site.hook} opened no panel to measure`);
        assert.ok(panel.labels.length > 0, `${site.hook} opened a panel with no option rows`);
        const clipped = panel.labels.filter((label) => label.scroll > label.client + EPSILON);
        assert.deepEqual(
          clipped.map((label) => label.text),
          [],
          `${site.name} opened a ${panel.panelWidth}px panel that ellipsises an option label. ` +
            'The panel band resolves to ONE number — `clamp(max(triggerWidth, minWidth), ' +
            'minWidth, maxWidth)` — and a ticked row then spends 52px of it on the tick gutter, ' +
            'the row padding and the panel chrome before it draws a label, so a panel driven by ' +
            'a narrow trigger truncates a label the trigger itself renders whole. State a ' +
            '`minWidth` at the call site.'
        );
      } finally {
        await page.close();
      }
    });
  }

  // THE `maxWidth` SITE, at both ends of the one-column band. The band resolves to
  // `clamp(max(trigger, min), min, max)`: at a 1024px window the trigger outgrows the `form` rung's
  // own 340px ceiling, and at the 1120px restack breakpoint it outgrows a 1024px cap as well, so a
  // cap below the breakpoint would draw the list narrower than the control it opened from.
  for (const [subject, overflow] of [
    ['environments-settings-1024', 340],
    ['environments-settings-1120', 1024],
  ]) {
    it(`draws the conditions card panel as wide as its trigger past ${overflow}px (${subject})`, async () => {
      const page = await openFixture(subject);
      try {
        await page.locator(CONDITION_PICKER).first().scrollIntoViewIfNeeded();
        await pressPointerOn(page, CONDITION_PICKER);
        const [trigger, panel] = await page.evaluate((selector) => {
          const width = (element) => Number(element.getBoundingClientRect().width.toFixed(2));
          return [
            width(document.querySelector(selector)),
            width(document.querySelector('.fabricate-select-popover')),
          ];
        }, CONDITION_PICKER);
        assert.ok(
          trigger > overflow,
          `the trigger measured ${trigger}px, inside ${overflow}px, so this subject is not ` +
            'measuring the overflow the call site raises the cap for'
        );
        assert.ok(
          Math.abs(panel - trigger) < EPSILON,
          `the panel measured ${panel}px under a ${trigger}px trigger, so the call site's ` +
            '`maxWidth` is not reaching the band and the list draws narrower than its control'
        );
      } finally {
        await page.close();
      }
    });
  }

  it('opens the Tool library sort at its call site’s panel floor, above its trigger', async () => {
    // The `inline` band's own 96px floor leaves 64px of label room unticked, which cut
    // `In this system` to an ellipsis; the call site's floor replaces the band's.
    const page = await openFixture('tools-browser');
    try {
      await pressPointerOn(page, TOOL_SORT);
      const measured = await page.evaluate((selector) => {
        const trigger = document.querySelector(selector);
        const width = (element) => Number(element.getBoundingClientRect().width.toFixed(2));
        const probe = document.createElement('span');
        probe.style.color = 'var(--fab-text-secondary)';
        document.querySelector('.fabricate-manager').append(probe);
        const secondary = globalThis.getComputedStyle(probe).color;
        probe.remove();
        return {
          trigger: width(trigger),
          panel: width(document.querySelector('.fabricate-select-popover')),
          rung: trigger.getAttribute('data-select-size'),
          ink: globalThis.getComputedStyle(trigger).color,
          secondary,
        };
      }, TOOL_SORT);
      assertRung({ name: 'the Tool library sort', rung: 'inline' }, measured.rung);
      assert.ok(
        measured.trigger < TOOL_SORT_PANEL_FLOOR,
        `the trigger measured ${measured.trigger}px, at or above the floor, so the panel's width ` +
          'here is the trigger’s and the floor is not what this clause measures'
      );
      assert.ok(
        Math.abs(measured.panel - TOOL_SORT_PANEL_FLOOR) < EPSILON,
        `the panel measured ${measured.panel}px against the call site’s ${TOOL_SORT_PANEL_FLOOR}px floor`
      );
      assert.equal(measured.ink, measured.secondary, 'and the trigger keeps the row’s secondary ink');
    } finally {
      await page.close();
    }
  });

  // The inspector's picker, at both ends of the one-column band it spans. The trigger fills the
  // inspector column, past the `inline` band's 240px ceiling at the bottom and past a 1024px cap at
  // the top, and at both ends it is wider than the overlay host's inset box, so the panel is held
  // to that box: the call site's cap must not bind before the host inset does.
  for (const [subject, overflow] of [
    ['recipe-inspector-1024', 240],
    ['recipe-inspector-1120', 1024],
  ]) {
    it(`draws the ingredient-set panel to the overlay host's inset past ${overflow}px (${subject})`, async () => {
      const page = await openFixture(subject);
      try {
        await pressPointerOn(page, ROUTE_PICKER);
        const [trigger, panel, host] = await page.evaluate((selector) => {
          const width = (element) => Number(element.getBoundingClientRect().width.toFixed(2));
          return [
            width(document.querySelector(selector)),
            width(document.querySelector('.fabricate-select-popover')),
            width(document.querySelector('.fabricate-manager')),
          ];
        }, ROUTE_PICKER);
        assert.ok(
          trigger > overflow,
          `the trigger measured ${trigger}px, inside ${overflow}px, so this subject is not ` +
            'measuring the overflow the call site raises the cap for'
        );
        const inset = host - 2 * OVERLAY_INSET;
        assert.ok(
          trigger > inset,
          `the trigger measured ${trigger}px inside the host's ${inset}px inset box, so the panel ` +
            'here would follow the trigger and this clause is not measuring the inset it names'
        );
        assert.ok(
          Math.abs(panel - inset) < EPSILON,
          `the panel measured ${panel}px against the ${inset}px the overlay host leaves in a ` +
            `${host}px host, so the call site's \`maxWidth\` binds before the host inset and the ` +
            'list draws narrower than the column it opens from'
        );
      } finally {
        await page.close();
      }
    });
  }

  it('shows the non-truncation clause CAN see a panel that is too narrow', async () => {
    // THE NEGATIVE CONTROL, and it perturbs the PANEL rather than the assertion.
    const page = await openFixture('currency', 'actorInventory');
    try {
      await pressPointerOn(page, '[data-world-currency-provider-select]');
      const before = await readOpenPanel(page);
      assert.deepEqual(
        before.labels.filter((label) => label.scroll > label.client + EPSILON).map((l) => l.text),
        [],
        'the provider roster draws whole at its shipped width, which is the state being perturbed'
      );
      const clippedAfter = await page.evaluate(() => {
        const panel = document.querySelector('.fabricate-select-popover');
        panel.style.width = '120px';
        panel.style.minWidth = '120px';
        panel.style.maxWidth = '120px';
        return [...panel.querySelectorAll('[role="option"] .fabricate-select-label')].filter(
          (label) => label.scrollWidth > label.clientWidth
        ).length;
      });
      assert.ok(
        clippedAfter > 0,
        'narrowed to 120px the provider roster still reports no ellipsised label, so the ' +
          'non-truncation clause above is quantifying over something it cannot measure'
      );
    } finally {
      await page.close();
    }
  });
});
