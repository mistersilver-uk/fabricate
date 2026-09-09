/*
 * THE THREE THINGS A MOUNTED SUITE CANNOT SEE ABOUT THE MANAGER SELECT CONVERSION (issue 1510).
 *
 * ── 1. WHY THE WRAPPER IS DEMOTED, AND WHY THE PRIMITIVE'S OWN FORM WAS REPAIRED ────────────
 * A `<label>` forwards a click on its caption into the control it wraps; the converted control
 * is a `<button>` toggling a portaled panel; and that panel's outside-click dismissal
 * (`actions/dismissOnOutsideClick.js`) listens on `mousedown`, IN THE CAPTURE PHASE, and only
 * while the panel is open. So the defect is asymmetric and the two legs measure different
 * things:
 *
 *   LEG 1, from CLOSED — the caption's mousedown meets no dismisser and the forwarded click
 *     reaches the trigger, so a `<label>` OPENS the panel. A demoted `<span>` forwards nothing,
 *     so it does not. This leg proves the forwarding is real and measures the demotion's
 *     ACCEPTED COST: the caption stops being a hit target.
 *   LEG 2, from OPEN — the caption's own mousedown is caught by the capture-phase dismisser and
 *     CLOSES the panel; the forwarded click then reaches the trigger and RE-OPENS it. In a
 *     `<label>` the list can therefore never be closed by clicking its caption.
 *
 * Issue 1511 proved both legs on a hand-wrapped `<label>` and reported leg 2 on the primitive's
 * OWN labelled form, which rendered `<Field as="label">` around the trigger. It failed there
 * too, at all twelve shipped `Select label=` call sites. The maintainer ruled the repair into
 * this issue rather than into a caller sweep: `Select`'s labelled form now hosts on
 * `Field as="div"`, its caption span carries the `id` the trigger's `aria-labelledby` already
 * pointed at, and the caption keeps its class and its layout. So the third subject below is
 * ASSERTED rather than reported — a labelled form failing leg 2 after that repair is a defect
 * in this change, not an open question. Its pre-repair red is recorded in this change's handoff.
 *
 * A synthetic `element.click()` proves nothing here: it dispatches a `click` and no `mousedown`
 * at all, so the dismisser never runs and every shape passes. The sequence below is the real one
 * a pointer produces, dispatched through Playwright's own mouse.
 *
 * ── 2. WHETHER A CONVERTED TRIGGER STILL FILLS ITS COLUMN ───────────────────────────────────
 * A native `<select>` in a `.fabricate-field.manager-field` column took `width: 100%` from the
 * sheet. The `<button>` that replaces it takes no width from that rule at all, because the rule
 * is element-typed. Whether it nonetheless fills the column is a CASCADE question — it depends
 * on the picker root's display and on the column's `align-items` — and happy-dom computes no
 * cascade, so a mounted suite cannot answer it. Each converted site is therefore measured
 * against its own column, on its shortest and its longest option, in a real browser.
 *
 * ── 3. WHETHER THE PANEL IS WIDE ENOUGH FOR THE LIST IT OPENS ───────────────────────────────
 * The panel band resolves to ONE number — `clamp(max(triggerWidth, minWidth), minWidth,
 * maxWidth)` — written by `actions/anchoredPopover.js` as an inline style at run time, so there
 * is no declaration anywhere to read. A ticked row then spends part of that width on a tick
 * gutter, row padding and panel chrome before it draws a label at 12px. A panel sized from its
 * trigger can therefore truncate an option label the trigger itself renders whole. The
 * non-truncation clause below opens every converted panel and asserts no option label is
 * ellipsised, and its negative control proves the clause can see a panel that is too narrow.
 *
 * ── THE FIXTURE IS REAL CODE, AND ITS FACE IS DECLARED ──────────────────────────────────────
 * `tests/fixtures/manager-select/` is served by a Vite dev server with the real Svelte plugin,
 * so every component is imported from `src/` and compiled as the build compiles it, and
 * `styles/fabricate.css` is served RAW. The fixture declares `font-family: Arial, sans-serif`
 * and this suite asserts the declaration took effect, because every figure here is a text
 * measurement and the product's own face is Foundry's licensed Signika, which this repository
 * cannot ship.
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

    // LEG 2 — from open. If leg 1 did not open it, open it on the trigger itself so leg 2 is
    // asked from the state it is about rather than skipped.
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
    // THE SECOND SUBJECT acceptance 11 names: a site this change actually converted, rather than
    // a shape built to have the property. The world currency spend strategy is the demote-and-
    // point site in this phase whose caption is VISIBLE, so it is the one with a hit target to
    // press; the other two demote behind a `visually-hidden` caption, which has no box a pointer
    // can reach at all.
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
    //
    // PRE-REPAIR THIS ASSERTION FAILED, measured on this very fixture: leg 1 opened and leg 2
    // left the list OPEN. That red is what the repair answers, and it is recorded in this
    // change's handoff rather than left as a report.
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
 *
 * `values` are two option values the control is mounted on, shortest rendered label first: the
 * pair acceptance 12 compares. `column` says whether the trigger is expected to FILL its column —
 * the sites whose native `<select>` took `width: 100%` from `.fabricate-field.manager-field
 * select`, an element-typed rule that reaches no `<button>` — or to HUG its value behind a floor,
 * which is the one site whose row is `flex-wrap` rather than a column. `floor` is the figure that
 * site's own scoped rule declares, restated here so a failure says which number it is checking.
 *
 * THREE CONVERTED SITES ARE DELIBERATELY ABSENT and are named in this change's handoff rather
 * than left to be noticed: `WorldCurrencyTab`'s provider control is measured by the truncation
 * clause below but not by the width pair, because it renders only on the `actorInventory`
 * strategy and offers one roster; its add-sub-unit control renders only inside an EXPANDED
 * currency unit that already has assignable sub-units, two levels of state past anything this
 * fixture mounts; and `GatheringEconomyView`'s regeneration POLICY control changes the branch its
 * sibling renders in, so mounting it on its two values mounts two different trees.
 */
const CONVERTED_SITES = Object.freeze([
  Object.freeze({
    subject: 'prerequisites',
    name: 'the character prerequisite operator',
    hook: '[data-prerequisite-operator]',
    values: ['gte', 'neq'],
    column: true,
  }),
  Object.freeze({
    subject: 'currency',
    name: 'the world currency spend strategy',
    hook: '[data-world-currency-strategy-select]',
    values: ['macro', 'actorProperty'],
    column: true,
  }),
  Object.freeze({
    subject: 'import',
    name: 'the folder import category',
    hook: '[data-import-mapping-category]',
    values: ['', ''],
    column: false,
    floor: 140,
  }),
  Object.freeze({
    subject: 'economy',
    name: 'the gathering regeneration unit',
    hook: '[data-economy-regen-unit]',
    values: ['hours', 'minutes'],
    column: true,
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
 * The neutralised figure is the NEGATIVE CONTROL and it is what makes the shipped one refutable:
 * an inline width out-ranks the caller's scoped rule, so it is the same element with the
 * counterpart removed and nothing else changed.
 *
 * @param {string} subject
 * @param {string} hook
 * @param {string} value
 * @returns {Promise<{shipped: number, unfloored: number, face: string, column: number}>}
 */
async function measureTrigger(subject, hook, value) {
  const page = await openFixture(subject, value);
  try {
    return await page.evaluate((selector) => {
      const trigger = document.querySelector(selector);
      const shipped = trigger.getBoundingClientRect().width;
      const face = globalThis.getComputedStyle(trigger).fontFamily;
      const column = trigger.closest('.manager-field')?.getBoundingClientRect().width ?? 0;
      trigger.style.width = 'auto';
      trigger.style.minWidth = '0px';
      const unfloored = trigger.getBoundingClientRect().width;
      return {
        shipped: Number(shipped.toFixed(2)),
        unfloored: Number(unfloored.toFixed(2)),
        column: Number(column.toFixed(2)),
        face,
      };
    }, hook);
  } finally {
    await page.close();
  }
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
    it(`holds ${site.name} at one width across its option labels`, async () => {
      const [shortest, longest] = await Promise.all(
        site.values.map((value) => measureTrigger(site.subject, site.hook, value))
      );

      assert.ok(
        Math.abs(shortest.shipped - longest.shipped) < EPSILON,
        `${site.name} measured ${shortest.shipped}px on its shortest option and ` +
          `${longest.shipped}px on its longest, so its width counterpart is not absorbing the ` +
          'difference and the row re-flows every time the GM changes the value'
      );
      if (site.column) {
        assert.ok(
          Math.abs(shortest.shipped - shortest.column) < EPSILON,
          `${site.name} measured ${shortest.shipped}px inside a ${shortest.column}px field ` +
            'column. Its native `<select>` took `width: 100%` from `.fabricate-field.manager-' +
            'field select`, which is element-typed and reaches no `<button>`, so the caller ' +
            'states the width itself.'
        );
      } else {
        assert.ok(
          Math.abs(shortest.shipped - site.floor) < EPSILON,
          `${site.name} measured ${shortest.shipped}px against a declared floor of ${site.floor}px`
        );
      }
    });
  }

  it('shows a converted trigger DOES resize with its value once its width rule is removed', async () => {
    // NON-VACUITY for every clause above. Without it, a width counterpart deleted from a
    // component would leave the pair comparison passing on a control that happens to render two
    // labels of the same length, and the suite would read as green rather than as unperturbed.
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

describe('a converted manager panel is wide enough for the list it opens (issue 1510)', () => {
  const PANEL_SITES = [
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
    // THE NEGATIVE CONTROL, and it perturbs the PANEL rather than the assertion: the same page,
    // the same rows, an inline width the resolved band cannot out-rank. Without it the clause
    // above is indistinguishable from one whose query matched nothing — an empty offender list
    // reads identically either way, and `scrollWidth` equals `clientWidth` on an element that
    // was never laid out.
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
