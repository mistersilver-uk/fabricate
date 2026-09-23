/* THE TWO THINGS A MOUNTED SUITE CANNOT SEE ABOUT THE PLAYER SELECT CONVERSION (issue 1511). */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createViteFixtureServer } from '../helpers/vite-fixture-server.js';

/** Sub-pixel slack for a rect comparison. Widths here differ by whole pixels or not at all. */
const EPSILON = 0.5;

/** How far above its own measurement a floor is allowed to sit. */
const FLOOR_HEADROOM = 1.5;

const fixtureServer = createViteFixtureServer({ styleMountPrefix: '/@player-select-styles/' });

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
  const page = await fixtureServer.newPage({ viewport: { width: 1100, height: 800 } });
  const query = `subject=${subject}${value ? `&value=${encodeURIComponent(value)}` : ''}`;
  await page.goto(fixtureServer.url(`/tests/fixtures/player-select/index.html?${query}`), {
    waitUntil: 'load',
  });
  await page.waitForFunction(() => globalThis.__playerSelectFixtureReady === true);
  return page;
}

/**
 * A real pointer press on one element: mousedown, mouseup, then the click they produce.
 *
 * @param {import('playwright').Page} page
 * @param {string} selector
 * @returns {Promise<void>}
 */
async function pressPointerOn(page, selector) {
  const box = await page.locator(selector).boundingBox();
  assert.ok(box, `${selector} has no box to press on`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
  );
}

/** Whether the portaled panel is on the page right now. */
async function panelIsOpen(page) {
  return page.evaluate(() => Boolean(document.querySelector('.fabricate-select-popover')));
}

/**
 * The trigger's accessible name, as Chromium computes it.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<string>} the computed name, or `''` when the node is unnamed.
 */
async function triggerAccessibleName(page) {
  const snapshot = await page.locator('[data-fixture-select]').ariaSnapshot();
  const [node = ''] = String(snapshot).split('\n');
  assert.match(
    node,
    /^-\s*combobox\b/u,
    `the fixture trigger is exposed as \`${node}\` rather than as a combobox, so the name read ` +
      'below is not the control’s'
  );
  return node.match(/^-\s*combobox\s+"([^"]*)"/u)?.[1] ?? '';
}

/**
 * Both legs of the caption-click proof for one wrapper shape.
 *
 * @param {string} subject
 * @param {string} captionSelector
 * @returns {Promise<{openedFromClosed: boolean, closedFromOpen: boolean, accessibleName: string}>}
 */
async function captionClickLegs(subject, captionSelector) {
  const page = await openFixture(subject);
  try {
    assert.equal(await panelIsOpen(page), false, `${subject} starts closed`);

    // LEG 1 — from closed.
    await pressPointerOn(page, captionSelector);
    const openedFromClosed = await panelIsOpen(page);

    // LEG 2 — from open. If leg 1 did not open it.
    if (!openedFromClosed) await pressPointerOn(page, '[data-fixture-select]');
    assert.equal(await panelIsOpen(page), true, `${subject} is open before leg 2`);
    await pressPointerOn(page, captionSelector);
    const closedFromOpen = !(await panelIsOpen(page));

    // THE NAME, READ FROM THE ACCESSIBILITY TREE ITSELF. The claim the demotion rule REPLACED
    // was that a `<label>` cannot name a `<button>` by containment. It can, and this is what says
    // so — but only if the reading is the browser's own. An earlier version of this clause walked
    // `aria-labelledby` by hand and fell back to the wrapping `<label>`'s `textContent`, which
    // computes a name for the WRAPPER shape whether or not the accessibility tree agrees the
    // wrapper names anything: the trigger's own text is inside that `textContent` too, so the
    // assertion below would have matched on markup the browser exposed as unnamed. Chromium's
    // snapshot is the authority for a claim about naming, so it is the thing asked.
    const accessibleName = await triggerAccessibleName(page);
    return { openedFromClosed, closedFromOpen, accessibleName };
  } finally {
    await page.close();
  }
}

describe('a caption click cannot close a list it is wrapped in a <label> with (issue 1511)', () => {
  it('forwards a caption press into the trigger from CLOSED only while the wrapper is a label', async () => {
    // MEASURED, AND IT CORRECTS THE EXPECTATION THIS SUITE WAS PLANNED WITH. The plan predicted
    // leg 1 would pass in BOTH shapes and that only leg 2 would discriminate. It does not: the
    // demoted `<span>` forwards nothing, so a caption press lands on an inert wrapper and the
    // panel stays shut. That is not a surprise so much as the ACCEPTED COST of the demotion
    // stated as a measurement — the caption stops being a hit target at all six converted sites
    // — and it is worth an assertion of its own precisely because it is a deliberate loss rather
    // than a defect. Leg 2 below is still the discriminating one, because it is the leg where
    // the surviving `<label>` behaves in a way NO wrapper should.
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
        'ACCEPTED COST, measured: before the conversion a click on "Sort" opened the operating ' +
        'system’s popup and after it the caption does nothing. It is accepted because the ' +
        'alternative is the double toggle leg 2 measures.'
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

  it('names the trigger by containment in the label shape, which the retired claim denied', async () => {
    // THE CORRECTION, measured rather than argued. Three shipped sentences said a `<label>` does
    // not name a `<button>` by containment; the primitive's OWN labelled form relies on exactly
    // that containment and ships. The conclusion those sentences drew is kept — the caption is
    // pointed at with `aria-labelledby` — but for the true reason, which is that no `id`-bearing
    // labelable element exists for a `for` to address.
    const surviving = await captionClickLegs('label', '.fixture-caption');
    assert.match(surviving.accessibleName, /Sort/, 'the wrapped trigger IS named by its caption');
  });

  it('closes from open on the primitive’s own labelled form, which issue 1510 repaired', async () => {
    // THIS CLAUSE WAS REPORT-ONLY WHEN IT LANDED.
    const field = await captionClickLegs('field', '.fabricate-select-caption');
    assert.equal(
      field.closedFromOpen,
      true,
      'the repaired labelled form closes when its own caption is pressed. Before issue 1510 it ' +
        'did not: the caption’s mousedown dismissed the panel and the `<label>` forwarded a ' +
        'click that re-opened it, at all twelve `Select label=` call sites.'
    );
    assert.equal(
      field.openedFromClosed,
      false,
      'and its caption is no longer a hit target, which is the same accepted cost the caller-side ' +
        'demotion pays — paid inside the primitive this time'
    );
  });
});

/** The three floored sites, and what each one is floored against. */
const FLOORED_SITES = Object.freeze([
  {
    subject: 'filters',
    name: 'the inventory sort',
    floor: 77,
    shortest: { value: 'type' },
    longest: { value: 'quantity' },
  },
  {
    subject: 'journal',
    name: 'the journal sort',
    floor: 113,
    shortest: { value: 'oldest' },
    longest: { value: 'soonestReady' },
  },
  {
    subject: 'book',
    name: 'the book page size',
    floor: 47,
    shortest: {},
    longest: { choose: '12' },
  },
]);

/**
 * Open one subject in one state.
 *
 * @param {string} subject
 * @param {{value?: string, choose?: string}} state `value` mounts on an option; `choose` drives
 * @returns {Promise<import('playwright').Page>}
 */
async function openInState(subject, { value = '', choose = null } = {}) {
  const page = await openFixture(subject, value);
  if (choose === null) return page;
  await page.click('.fabricate-select-trigger');
  await page.waitForSelector('.fabricate-select-popover');
  await page.click(`[data-popover-option="${choose}"]`);
  await page.waitForFunction(() => !document.querySelector('.fabricate-select-popover'));
  return page;
}

/**
 * Measure one subject's trigger as it ships and with its floor neutralised.
 *
 * @param {string} subject
 * @param {{value?: string, choose?: string}} state
 * @returns {Promise<{shipped: number, unfloored: number, face: string}>}
 */
async function measureTrigger(subject, state) {
  const page = await openInState(subject, state);
  try {
    return await page.evaluate(() => {
      const trigger = document.querySelector('.fabricate-select-trigger');
      const shipped = trigger.getBoundingClientRect().width;
      const face = globalThis.getComputedStyle(trigger).fontFamily;
      // THE NEGATIVE CONTROL. An inline `min-width` out-ranks the caller's scoped rule.
      trigger.style.minWidth = '0px';
      const unfloored = trigger.getBoundingClientRect().width;
      return { shipped: Number(shipped.toFixed(2)), unfloored: Number(unfloored.toFixed(2)), face };
    });
  } finally {
    await page.close();
  }
}

describe('a converted trigger stops resizing with its value where a floor says so (issue 1511)', () => {
  it('renders in the face the fixture declares, so every width below is reproducible', async () => {
    const { face } = await measureTrigger('filters', { value: 'name' });
    assert.match(
      face,
      /Arial/i,
      'the fixture declares `Arial, sans-serif` and every figure in this file was measured ' +
        'against it. A different face means these widths cannot be reproduced, and the floors ' +
        'they justify were chosen against something else.'
    );
  });

  for (const { subject, name, floor, shortest: shortestState, longest: longestState } of FLOORED_SITES) {
    it(`floors ${name} at ${floor}px, and its shortest and longest values measure the same`, async () => {
      const [shortest, longest] = await Promise.all([
        measureTrigger(subject, shortestState),
        measureTrigger(subject, longestState),
      ]);

      assert.ok(
        Math.abs(shortest.shipped - longest.shipped) < EPSILON,
        `${name} measured ${shortest.shipped}px on its shortest value and ${longest.shipped}px ` +
          'on its longest, so the floor is not absorbing the difference'
      );
      assert.ok(
        Math.abs(shortest.shipped - floor) < EPSILON,
        `${name} measured ${shortest.shipped}px against a declared floor of ${floor}px`
      );
      assert.ok(
        longest.unfloored <= floor + EPSILON,
        `${name}'s widest label measures ${longest.unfloored}px unfloored, which is past its ` +
          `${floor}px floor — so the floor is too small for the label set it was chosen for`
      );
      // AND NOT MUCH ABOVE IT EITHER. Every one of these floors is declared as its own
      // measurement taken at the next whole pixel; a floor that drifts above the control it
      // floors renders nothing wrong and stops being that sentence, which is exactly what all
      // three of them had done by the time review round 1 measured them.
      assert.ok(
        floor - longest.unfloored < FLOOR_HEADROOM,
        `${name}'s floor is ${floor}px and its widest value measures ${longest.unfloored}px, ` +
          `a gap of ${(floor - longest.unfloored).toFixed(2)}px. The call site declares the ` +
          'floor as that measurement at the next whole pixel, so either the figure or the ' +
          'sentence is wrong.'
      );
    });
  }

  it('shows the trigger DOES resize with its value once the floor is removed', async () => {
    // NON-VACUITY for the clauses above.
    const spreads = await Promise.all(
      [
        { subject: 'filters', name: 'the inventory sort', shortest: 'type', longest: 'quantity' },
        {
          subject: 'journal',
          name: 'the journal sort',
          shortest: 'oldest',
          longest: 'soonestReady',
        },
      ].map(async (site) => ({
        ...site,
        shortestWidth: (await measureTrigger(site.subject, { value: site.shortest })).unfloored,
        longestWidth: (await measureTrigger(site.subject, { value: site.longest })).unfloored,
      }))
    );

    for (const site of spreads) {
      assert.ok(
        site.longestWidth - site.shortestWidth > 1,
        `unfloored, ${site.name} measured ${site.shortestWidth}px on ${site.shortest} and ` +
          `${site.longestWidth}px on ${site.longest} — if those are equal, the control is not ` +
          'content-sized and the floor is proving nothing'
      );
    }
  });

  it('refuses a floor on the participation selector, and the measurement says why', async () => {
    // ROW 5's STATED REFUSAL, AND ITS SCOPE. Its options are a system NAME plus a data-driven
    // affordance suffix, both authored in a world, so there is no widest option to size the
    // TRIGGER against. The two figures are what a floor would have had to choose between.
    const long = await measureTrigger('system', { value: 'Alchemists Supplies v1.6' });
    const short = await measureTrigger('system', { value: 'Alchemy' });

    assert.ok(
      Math.abs(long.shipped - long.unfloored) < EPSILON,
      'the participation selector declares no floor, so its shipped width IS its content width'
    );
    assert.ok(
      long.shipped - short.shipped > 100,
      `the two participations measure ${short.shipped}px and ${long.shipped}px, which is the ` +
        'spread a floor here would have had to swallow — sized for the long one, a one-word ' +
        'system name would sit in a box several times its own width'
    );
  });
});

/**
 * The four converted subjects this fixture can mount, and the row each one's panel is sized for.
 */
const PANEL_SITES = Object.freeze([
  {
    subject: 'filters',
    name: 'the inventory sort',
    value: 'type',
    widest: 'Quantity',
    banded: true,
  },
  {
    subject: 'journal',
    name: 'the journal sort',
    value: 'oldest',
    widest: 'Soonest Ready',
    banded: true,
  },
  {
    subject: 'system',
    name: 'the participation selector',
    value: 'Alchemy',
    widest: 'Alchemists Supplies v1.6 — Salvageable, Tool',
    banded: true,
  },
  { subject: 'book', name: 'the book page size', value: '', widest: '12', banded: false },
]);

/**
 * Every option row's label geometry in the OPEN panel.
 *
 * @param {import('playwright').Page} page A page whose panel is already open.
 * @returns {Promise<{label: string, scrollWidth: number, clientWidth: number}[]>}
 */
function readPanelLabels(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('.fabricate-select-popover [role="option"]')].map((row) => {
      const label = row.querySelector('.fabricate-select-label');
      return {
        label: label.textContent,
        scrollWidth: label.scrollWidth,
        clientWidth: label.clientWidth,
      };
    })
  );
}

/**
 * Open one subject's panel and read it.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<{label: string, scrollWidth: number, clientWidth: number}[]>}
 */
async function openPanelAndReadLabels(page) {
  await page.click('.fabricate-select-trigger');
  await page.waitForSelector('.fabricate-select-popover');
  return readPanelLabels(page);
}

/**
 * Put the OPEN panel back on the width it would have had with no caller band, and prove it moved.
 * The rung's band is read out of the sheet's own per-rung fallback rule rather than restated
 * here, so this control cannot quietly stop agreeing with the primitive;
 * `tests/components/select-popover-width.test.js` pins that rule against `SIZES` in
 * `Select.svelte`.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<{before: number, after: number, band: {min: number, max: number}}|null>}
 */
function neutraliseCallerBand(page) {
  return page.evaluate(() => {
    const RUNG_RULE = '.fabricate-picker-popover.fabricate-select-popover-inline';
    let band = null;
    for (const sheet of document.styleSheets) {
      let rules;
      try {
        rules = [...sheet.cssRules];
      } catch {
        continue;
      }
      for (const rule of rules) {
        if (rule.selectorText !== RUNG_RULE) continue;
        band = { min: parseFloat(rule.style.minWidth), max: parseFloat(rule.style.maxWidth) };
      }
    }
    if (!band || !Number.isFinite(band.min) || !Number.isFinite(band.max)) return null;

    const panel = document.querySelector('.fabricate-select-popover');
    const trigger = document.querySelector('.fabricate-select-trigger');
    const before = panel.getBoundingClientRect().width;
    const width = Math.min(Math.max(trigger.getBoundingClientRect().width, band.min), band.max);
    panel.style.width = `${width}px`;
    panel.style.minWidth = `${width}px`;
    panel.style.maxWidth = `${width}px`;
    return {
      band,
      before: Number(before.toFixed(2)),
      after: Number(panel.getBoundingClientRect().width.toFixed(2)),
    };
  });
}

describe('an open option list draws every one of its labels in full (issue 1511)', () => {
  // WHY THIS EXISTS, and it is the finding review round 1 opened with. The conversion floored
  // three TRIGGERS at their widest value and shipped. The panel is a different box: its labels
  // are a fixed 12px where the `inline` trigger reads at 11.5px, and a ticked row spends 52px on
  // chrome — panel border, panel padding, row border, row padding, tick gutter, row gap — before
  // the label gets any. Two of the six sites opened lists reading `Quanti…` and `Soonest Rea…`
  // while every clause above was green, because every figure this suite measured was the CLOSED
  // control's.
  for (const { subject, name, value } of PANEL_SITES) {
    it(`draws every option of ${name} without ellipsising it`, async () => {
      const page = await openFixture(subject, value);
      try {
        const rows = await openPanelAndReadLabels(page);
        assert.ok(rows.length > 0, `${name} opened a panel with no option rows in it`);
        for (const row of rows) {
          assert.ok(
            row.scrollWidth <= row.clientWidth + EPSILON,
            `${name} ellipsises the option "${row.label}": the label needs ${row.scrollWidth}px ` +
              `and its box is ${row.clientWidth}px. A row the reader cannot read is the choice ` +
              'the control exists to offer. The knob is the caller’s own panel `minWidth`, not ' +
              'its trigger floor — a different box at a different type size.'
          );
        }
      } finally {
        await page.close();
      }
    });
  }

  for (const { subject, name, value, widest } of PANEL_SITES.filter((site) => site.banded)) {
    it(`ellipsises ${name} again once its stated panel band is taken away`, async () => {
      const page = await openFixture(subject, value);
      try {
        await openPanelAndReadLabels(page);
        const control = await neutraliseCallerBand(page);
        assert.ok(
          control,
          'the sheet no longer carries a `.fabricate-picker-popover.fabricate-select-popover-' +
            'inline` rule with both bounds, so this control read no rung band and perturbed ' +
            'nothing'
        );
        assert.ok(
          control.before - control.after > EPSILON,
          `${name}'s panel measured ${control.before}px and the rung's own band ` +
            `[${control.band.min}, ${control.band.max}] resolves to ${control.after}px, so this ` +
            'control changed nothing and the clause above is not refuted by it'
        );

        const rows = await readPanelLabels(page);
        const truncated = rows.filter((row) => row.scrollWidth > row.clientWidth + EPSILON);
        assert.ok(
          truncated.length > 0,
          `with its band neutralised, ${name} still draws every option in full at ` +
            `${control.after}px — so the band this site declares is buying nothing and the ` +
            `clause above would pass without it. The row it was sized for is "${widest}".`
        );
      } finally {
        await page.close();
      }
    });
  }
});
