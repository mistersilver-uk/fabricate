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
  ].map((site) =>
    Object.freeze({ ...site, column: false, floor: 144, pinned: true, drive: true, rung: 'toolbar' })
  ),
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
    // A CONTROL WHOSE VALUE NO PROP CAN SEED is put in the state by the act that reaches it: open
    // the panel and click the row, which is what the GM does and what `select-control.js` does.
    if (drive) {
      await pressPointerOn(page, hook);
      await pressPointerOn(page, `.fabricate-select-popover [data-popover-option="${value}"]`);
    }
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
    // `start` is inert for a `drive` site, which nothing seeds through `?value=`, so those six
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
  ];

  for (const site of PANEL_SITES) {
    it(`draws every option label of ${site.name} whole`, async () => {
      const page = await openFixture(site.subject, site.start);
      try {
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
