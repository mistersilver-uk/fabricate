/*
 * THE TWO THINGS A MOUNTED SUITE CANNOT SEE ABOUT THE PLAYER SELECT CONVERSION (issue 1511).
 *
 * ── 1. WHY THE WRAPPER IS DEMOTED ───────────────────────────────────────────────────────────
 * The rule this change canonises is that a wrapping `<label>` becomes a `<span>` when the select
 * it contains converts. The reason is the CLICK, not the name: a `<label>` forwards a click on
 * its caption into the control it wraps; the control is now a `<button>` toggling a portaled
 * panel; and that panel's outside-click dismissal (`actions/dismissOnOutsideClick.js`) listens on
 * `mousedown`, IN THE CAPTURE PHASE, and only while the panel is open.
 *
 * So the defect is asymmetric, and the two legs measure different things:
 *
 *   LEG 1, from CLOSED — the caption's mousedown meets no dismisser (nothing is open) and the
 *     forwarded click reaches the trigger, so the `<label>` opens the panel. The demoted
 *     `<span>` forwards nothing and the press lands on an inert wrapper, so it does NOT. This
 *     leg proves the forwarding is real, and it measures the demotion's ACCEPTED COST: the
 *     caption stops being a hit target.
 *   LEG 2, from OPEN — the caption's own mousedown is caught by the capture-phase dismisser and
 *     CLOSES the panel; the forwarded click then reaches the trigger and RE-OPENS it. In a
 *     `<label>` the list can therefore never be closed by clicking its caption. In a `<span>`
 *     there is no forwarding, the mousedown closes it, and it stays closed. This is the leg the
 *     rule rests on, and it reproduces.
 *
 * A synthetic `element.click()` proves nothing here: it dispatches a `click` and no `mousedown`
 * at all, so the dismisser never runs and both shapes pass. The sequence below is the real one a
 * pointer produces — `mousedown`, `mouseup`, `click` — dispatched through Playwright's own mouse.
 *
 * The THIRD subject is the primitive's own labelled form, `Select label=`. It rendered
 * `<Field as="label">` AROUND the trigger when this suite landed — a surviving `<label>` wrapper
 * with twelve live callers, none of them this change's — so its leg 2 was measured and REPORTED
 * for issue 1510's decision. It failed. Issue 1510 took the maintainer's ruling and repaired the
 * form inside the primitive (`Field as="div"` with the caption pointed at), so the clause is an
 * assertion now rather than a report.
 *
 * ── 2. WHETHER A WIDTH FLOOR IS ACTUALLY A FLOOR ────────────────────────────────────────────
 * A `<select>` sizes itself to its widest option; the `<button>` that replaces it hugs the one it
 * is showing. Three of the six converted call sites answer that with a `min-width` in their own
 * scoped `<style>`, and the fourth REFUSES one and says why. None of that is visible to a mounted
 * suite: happy-dom computes no cascade, so a `min-width` in a compiled scoped block is not merely
 * hard to read there — it does not exist.
 *
 * Each floored site is therefore measured twice per option, once as it ships and once with the
 * floor neutralised inline. The neutralised pass is the NEGATIVE CONTROL and it is what makes the
 * positive one refutable: it must show the trigger's width MOVING with its value, which is the
 * defect the floor exists to remove. A floor deleted from the component makes the shipped pass
 * look like the control.
 *
 * ── 3. WHETHER THE OPEN LIST IS LEGIBLE, WHICH IS A DIFFERENT QUESTION ──────────────────────
 * The first shipping of this conversion answered only the closed control, and two of the six
 * sites opened lists reading `Quanti…` and `Soonest Rea…` with every clause in section 2 green.
 * The panel is its own box: `anchoredPopover` resolves its width from the TRIGGER inside the
 * caller's band, its labels are a fixed 12px where the `inline` trigger reads at 11.5px, and a
 * ticked row spends 52px on chrome before the label gets any — so a trigger floor sized to the
 * widest VALUE says nothing about the widest OPTION. Three of the six state a panel band for that
 * reason and the participation selector, which refuses a trigger floor, states the widest band of
 * the three.
 *
 * The clause at the foot of this file opens every subject's panel and asks each label whether it
 * is ellipsised, and its control re-resolves the panel on the RUNG's band — the geometry these
 * sites shipped — and requires a row to truncate again.
 *
 * ── THE FIXTURE IS REAL CODE, AND ITS FACE IS DECLARED ──────────────────────────────────────
 * `tests/fixtures/player-select/` is served by a Vite dev server with the real Svelte plugin, so
 * every component is imported from `src/` and compiled as the build compiles it, and
 * `styles/fabricate.css` is served RAW. The fixture declares `font-family: Arial, sans-serif` and
 * this suite asserts the declaration took effect, because every figure here is a text
 * measurement and the product's own face is Foundry's licensed Signika, which this repository
 * cannot ship. Each floor is set past BOTH faces; each call site records the two numbers.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createViteFixtureServer } from '../helpers/vite-fixture-server.js';

/** Sub-pixel slack for a rect comparison. Widths here differ by whole pixels or not at all. */
const EPSILON = 0.5;

/**
 * How far above its own measurement a floor is allowed to sit.
 *
 * Every floor here is declared as "the measurement, taken at the next whole pixel above the wider
 * of the two faces", so the gap between a floor and what it floors is under one pixel by
 * construction. The clause that pins it is two-sided for a reason: the one-sided form passed for
 * a whole review round while all three floors stood 11.50px - one rung font-size - above the
 * control they were derived from, because a floor that is too GENEROUS breaks no rendering, it
 * only stops being the sentence its comment claims. 1.5 is the whole pixel plus the sub-pixel
 * slack above.
 */
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
 * Through Playwright's own mouse rather than `locator.click()` so the three events are separable
 * in the failure message, and so the sequence is unmistakably the one a user's pointer generates
 * rather than a synthesized activation that skips `mousedown` entirely.
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
 * `locator.ariaSnapshot()` renders the node as the accessibility tree exposes it — `- combobox
 * "Sort": Newest` — so the name here is the one Playwright's accessible-name computation
 * produces from the DOM, not one this file worked out. The trigger is a `combobox`:
 * `SearchablePopover` gives the search-suppressed shape `role="combobox"` on the button itself,
 * and the role is asserted rather than assumed so a role change cannot present as an empty name.
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

    // LEG 2 — from open. If leg 1 did not open it, open it on the trigger itself so leg 2 is
    // asked from the state it is about rather than skipped.
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
    // THIS CLAUSE WAS REPORT-ONLY WHEN IT LANDED, and it is an assertion now. Issue 1511 measured
    // `Select label=` as it then shipped — `<Field as="label">` around the trigger, a surviving
    // `<label>` wrapper with twelve live callers — and reported leg 2 FAILING there, which was
    // this suite's whole reason for carrying a third subject. On that report the maintainer ruled
    // the repair into issue 1510 rather than into a caller sweep: the host is `Field as="div"`
    // now, the caption span carries the id the trigger's `aria-labelledby` already pointed at,
    // and no caller changed. So the leg that was printed for a decision is the decision's
    // regression guard.
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

/**
 * The three floored sites, and what each one is floored against.
 *
 * `shortest` and `longest` are STATES rather than values, because the three sites do not all
 * reach their widest label the same way. Two mount on it: `?value=` picks the option the control
 * starts on. The page size cannot — the fixture builds its own option list from a book and the
 * value is component state — so its longest state is reached by DRIVING the control, opening the
 * panel and choosing `12`. It was declared as `values: ['', '']` before review round 1, which
 * mounted the same state twice and made the invariance clause below unable to fail at that site
 * for any floor whatsoever.
 *
 * `floor` is the figure the call site declares, restated here so the assertion says which number
 * it is checking rather than only that two measurements agree — a floor accidentally deleted and
 * a floor accidentally halved are different failures.
 */
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
 *   the control to one through its own panel, for a site whose value is component state.
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
      // THE NEGATIVE CONTROL. An inline `min-width` out-ranks the caller's scoped rule, so this
      // is the same element with the floor removed and nothing else changed.
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
    // NON-VACUITY for the clauses above, at BOTH sites whose invariance is measured across two
    // MOUNTED values. It claimed to cover two and measured the inventory sort twice until review
    // round 1; the journal is the second one, and it is the site with the widest spread of the
    // three. The page size is not here because its two states are reached by driving the control
    // rather than by mounting it, and its own clause above drives it.
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
    //
    // The refusal stops at the trigger. The PANEL takes a floor and a ceiling of its own, because
    // a closed control showing one value and an open list showing every value are different
    // questions — the list has to be legible whatever the trigger happens to be showing. That
    // half is measured by the truncation clauses below, and the first shipping of this conversion
    // read the refusal as covering both.
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
 *
 * `value` is the state the panel is opened FROM, chosen as the one where the caller's band is
 * doing the most work: the trigger the panel resolves from is at its NARROWEST there, so a band
 * that is absent or too small shows up at its worst. `banded` says whether the call site states a
 * `minWidth`/`maxWidth` of its own — the page size does not, and the reason is a measurement
 * rather than an omission: its list is UNTICKED, which costs 32px of row chrome rather than a
 * ticked row's 52, and its widest label is `12`.
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
 * `scrollWidth` against `clientWidth` is the only reading that answers "is this label
 * ellipsised": `.fabricate-select-label` declares `overflow: hidden` and `text-overflow:
 * ellipsis`, so a label too wide for its box renders an ellipsis and reports the two differently.
 * Nothing else in the tree shows it — the rect is the BOX, and the box is the right size by
 * construction whatever it is holding.
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
 *
 * This is the negative control for the clause above, and it has to reach the panel rather than
 * the component: the band is a pair of PROPS, so there is no rule to out-rank and no attribute to
 * clear. `anchoredPopover` resolves `clamp(max(triggerWidth, minWidth), minWidth, maxWidth)` and
 * writes the answer as a width and as both of its bounds, so re-running that formula with the
 * RUNG's band and re-writing the three declarations reproduces exactly the geometry these call
 * sites shipped before the band was added.
 *
 * The rung's band is read out of the sheet's own per-rung fallback rule rather than restated
 * here, so this control cannot quietly stop agreeing with the primitive;
 * `tests/components/select-popover-width.test.js` pins that rule against `SIZES` in
 * `Select.svelte`.
 *
 * It returns what it did, and the caller asserts the panel actually narrowed. A control that
 * silently matched nothing would leave the positive clause looking proved.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<{before: number, after: number, band: {min: number, max: number}}|null>}
 */
function neutraliseCallerBand(page) {
  return page.evaluate(() => {
    const RUNG_RULE = '.fabricate-picker-popover.fabricate-select-popover-inline';
    let band = null;
    for (const sheet of document.styleSheets) {
      let rules = [];
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
