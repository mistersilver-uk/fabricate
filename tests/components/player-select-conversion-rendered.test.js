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
 * The THIRD subject is REPORT-ONLY and is the primitive's own shipped labelled form, `Select
 * label=`, which renders `<Field as="label">` AROUND the trigger. It is a surviving `<label>`
 * wrapper with live callers, and this change adopts none of them — so its leg 2 is measured and
 * recorded here for issue 1510's decision rather than acted on by this one.
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
import { createReadStream } from 'node:fs';
import { join, resolve } from 'node:path';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const repoRoot = resolve(import.meta.dirname, '../..');

/** Sub-pixel slack for a rect comparison. Widths here differ by whole pixels or not at all. */
const EPSILON = 0.5;

/**
 * Serve `styles/fabricate.css` RAW, outside Vite's CSS pipeline.
 *
 * The sheet is 20k+ lines with `url()` references; running it through PostCSS would rewrite them
 * for no benefit. The page wants the bytes.
 *
 * @returns {object} a Vite plugin.
 */
function rawStylesheetMount() {
  const prefix = '/@player-select-styles/';
  return {
    name: 'player-select-styles',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = request.url ?? '';
        if (!url.startsWith(prefix)) return next();
        if (url.slice(prefix.length).split('?')[0] !== 'fabricate.css') {
          response.statusCode = 404;
          response.end('not found');
          return;
        }
        response.setHeader('Content-Type', 'text/css; charset=utf-8');
        createReadStream(join(repoRoot, 'styles', 'fabricate.css')).pipe(response);
      });
    },
  };
}

let server;
let browser;
let origin = '';

before(async () => {
  server = await createServer({
    // `configFile: false` on purpose: the production `vite.config.js` installs the Foundry dev
    // proxy on `serve`, which this fixture neither needs nor should depend on.
    configFile: false,
    root: repoRoot,
    // NO FILE WATCHER: the root is the whole repository, chokidar costs a handle per file, and a
    // developer with harvested Foundry chrome or sibling lane worktrees exhausts the session
    // limit and dies with an `ENOSPC` naming a file the run never touches.
    server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
    logLevel: 'silent',
    plugins: [rawStylesheetMount(), svelte()],
  });
  await server.listen();
  origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  await server?.close();
});

/**
 * Open the fixture on one subject and hand back the page.
 *
 * @param {string} subject The `?subject=` value.
 * @param {string} [value] The option the control starts on.
 * @returns {Promise<import('playwright').Page>}
 */
async function openFixture(subject, value = '') {
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  const query = `subject=${subject}${value ? `&value=${encodeURIComponent(value)}` : ''}`;
  await page.goto(`${origin}/tests/fixtures/player-select/index.html?${query}`, {
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

    // THE NAME, measured in the same pass. The claim the demotion rule REPLACED was that a
    // `<label>` cannot name a `<button>` by containment. It can, and this is what says so.
    const accessibleName = await page.evaluate(() => {
      const trigger = document.querySelector('[data-fixture-select]');
      const labelledBy = trigger.getAttribute('aria-labelledby');
      if (labelledBy) return document.getElementById(labelledBy)?.textContent?.trim() ?? '';
      const wrapper = trigger.closest('label');
      return wrapper ? wrapper.textContent.trim() : '';
    });
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

  it('reports both legs for the primitive’s own shipped labelled form (report-only)', async () => {
    // REPORT-ONLY, and routed here from issue 1510. `Select label=` renders `<Field as="label">`
    // AROUND the trigger, so it is a surviving `<label>` wrapper with live callers — and this
    // change adopts none of them, which is why the outcome is recorded rather than acted on. The
    // assertion is that the form still OPENS, which is the property its callers depend on; the
    // closing leg is printed for the decision issue 1510 has to take.
    const field = await captionClickLegs('field', '.fabricate-select-caption');
    console.log(
      `ISSUE 1511 REPORT — Select label= (Field as="label"): leg 1 opens=${field.openedFromClosed}, ` +
        `leg 2 closes=${field.closedFromOpen}, accessible name="${field.accessibleName}"`
    );
    assert.equal(
      field.openedFromClosed,
      true,
      'the shipped labelled form still opens from a caption click, which is what its twelve ' +
        'callers depend on'
    );
  });
});

/**
 * The three floored sites, and what each one is floored against.
 *
 * `values` are the option values the control is mounted on, shortest label first. `floor` is the
 * figure the call site declares, restated here so the assertion says which number it is checking
 * rather than only that two measurements agree — a floor accidentally deleted and a floor
 * accidentally halved are different failures.
 */
const FLOORED_SITES = Object.freeze([
  { subject: 'filters', name: 'the inventory sort', floor: 90, values: ['type', 'quantity'] },
  { subject: 'journal', name: 'the journal sort', floor: 126, values: ['oldest', 'soonestReady'] },
  { subject: 'book', name: 'the book page size', floor: 60, values: ['', ''] },
]);

/**
 * Measure one subject's trigger as it ships and with its floor neutralised.
 *
 * @param {string} subject
 * @param {string} value
 * @returns {Promise<{shipped: number, unfloored: number, face: string}>}
 */
async function measureTrigger(subject, value) {
  const page = await openFixture(subject, value);
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
    const { face } = await measureTrigger('filters', 'name');
    assert.match(
      face,
      /Arial/i,
      'the fixture declares `Arial, sans-serif` and every figure in this file was measured ' +
        'against it. A different face means these widths cannot be reproduced, and the floors ' +
        'they justify were chosen against something else.'
    );
  });

  for (const { subject, name, floor, values } of FLOORED_SITES) {
    it(`floors ${name} at ${floor}px, and its shortest and longest values measure the same`, async () => {
      const [shortest, longest] = await Promise.all(values.map((value) => measureTrigger(subject, value)));

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
    });
  }

  it('shows the trigger DOES resize with its value once the floor is removed', async () => {
    // NON-VACUITY for all three clauses above. Two of the three floored sites are measured here
    // because the third — the page size — offers one value at a time in this fixture; the two
    // that can be mounted on two different values both have to move.
    const [shortest, longest] = await Promise.all([
      measureTrigger('filters', 'type'),
      measureTrigger('filters', 'quantity'),
    ]);
    assert.ok(
      longest.unfloored - shortest.unfloored > 1,
      `unfloored, the inventory sort measured ${shortest.unfloored}px and ${longest.unfloored}px ` +
        '— if those are equal, the control is not content-sized and the floor is proving nothing'
    );
  });

  it('refuses a floor on the participation selector, and the measurement says why', async () => {
    // ROW 5's STATED REFUSAL. Its options are a system NAME plus a data-driven affordance suffix,
    // both authored in a world, so there is no widest option to size against. The two figures
    // are what a floor would have had to choose between.
    const long = await measureTrigger('system', 'Alchemists Supplies v1.6');
    const short = await measureTrigger('system', 'Alchemy');

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
