/*
 * The system inspectors' pinned foot (issue 2498), on the four real inspectors mounted live through
 * Vite (`tests/fixtures/inspector-foot/`) in the manager's rail at 1280x820. For each, overflowing
 * and short: the foot carries the record verbs, sits flush on the rail's bottom edge at its full
 * inner width at the top and the end of the scroll range, takes at most a quarter of the rail, a
 * focused control stops above it, and focusing its own verb does not scroll the rail.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { assertDockAtColumnFoot, readInspectorFoot } from '../helpers/inspectorDockGeometry.js';
import { createViteFixtureServer } from '../helpers/vite-fixture-server.js';

const fixture = createViteFixtureServer({ styleMountPrefix: '/@inspector-foot-styles/' });

// The rail the View Lab measured at 1280x820 (`bulk-edit-dock-pinning.test.js`).
const RAIL_PX = 634;
const EPSILON_PX = 1;
// Anti-vacuity: a rail that does not overflow says nothing about a sticky box.
const MIN_OVERFLOW_PX = 48;
const MAX_FOOT_SHARE = 0.25;
const PROBE = {
  aside: '[data-probe-inspector]',
  foot: '.fab-inspector-panel-foot',
  scroller: null,
};

/** Each inspector's record verbs, in foot order. */
const INSPECTORS = Object.freeze({
  recipes: ['duplicate', 'edit', 'delete'].map((verb) => `[data-recipe-action="${verb}"]`),
  essences: ['edit', 'delete'].map((verb) => `[data-essence-action="${verb}"]`),
  components: ['[data-component-edit-system-rules]'],
  tools: ['[data-tool-inspector-edit]'],
});

async function openInspector(inspector, size) {
  const page = await fixture.newPage({ viewport: { width: 1280, height: 820 } });
  await page.goto(
    fixture.url(`/tests/fixtures/inspector-foot/index.html?inspector=${inspector}&size=${size}`)
  );
  await page.waitForSelector('html[data-inspector-foot-ready="true"] [data-probe-inspector] > *');
  await settle(page);
  return page;
}

/** A ResizeObserver and a scroll event deliver before the next paint, and Svelte writes after. */
function settle(page) {
  return page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
  );
}

/** The foot's geometry at one scroll offset (`null` leaves it), read after a frame has painted. */
async function sampleAt(page, scrollTo) {
  await page.evaluate(readInspectorFoot, { ...PROBE, scrollTo });
  await settle(page);
  return page.evaluate(readInspectorFoot, { ...PROBE, scrollTo: null });
}

/** The verbs the foot holds, by selector, and whether any of them sits outside it. */
function readVerbs(verbs) {
  const foot = document.querySelector('[data-probe-inspector] .fab-inspector-panel-foot');
  return verbs.map((selector) => {
    const node = document.querySelector(`[data-probe-inspector] ${selector}`);
    return { selector, rendered: Boolean(node), inFoot: Boolean(foot?.contains(node)) };
  });
}

/** Focus every content control from the top in tab order, then the last one from scroll top. */
function focusWalk() {
  const aside = document.querySelector('[data-probe-inspector]');
  const foot = aside.querySelector('.fab-inspector-panel-foot');
  const controls = [...aside.querySelectorAll('button, a[href], input, select, textarea')].filter(
    (node) => !foot.contains(node) && node.getBoundingClientRect().height > 0
  );
  const under = (control) => {
    const bottom = control.getBoundingClientRect().bottom;
    const footTop = foot.getBoundingClientRect().top;
    return bottom > footTop + 1
      ? `${control.outerHTML.slice(0, 80)} ends ${bottom}, foot ${footTop}`
      : '';
  };
  aside.scrollTop = 0;
  let scrolls = 0;
  const obscured = [];
  for (const control of controls) {
    const before = aside.scrollTop;
    control.focus();
    if (aside.scrollTop !== before) scrolls += 1;
    if (under(control)) obscured.push(under(control));
  }
  document.activeElement.blur();
  aside.scrollTop = 0;
  const last = controls.at(-1);
  last?.focus();
  return { count: controls.length, scrolls, obscured, last: last ? under(last) : 'no control' };
}

/**
 * Scroll the last content control to end at the foot's mid-height, so it is inside the scrollport
 * but half under the foot, then focus it; reads its bottom against the foot's top both times.
 */
function focusStraddling() {
  const aside = document.querySelector('[data-probe-inspector]');
  const foot = aside.querySelector('.fab-inspector-panel-foot');
  const control = [...aside.querySelectorAll('button, a[href], input, select, textarea')].findLast(
    (node) => !foot.contains(node) && node.getBoundingClientRect().height > 0
  );
  const read = () => ({
    bottom: control.getBoundingClientRect().bottom,
    footTop: foot.getBoundingClientRect().top,
  });
  aside.scrollTop = 0;
  const footBox = foot.getBoundingClientRect();
  aside.scrollTop = control.getBoundingClientRect().bottom - (footBox.top + footBox.height / 2);
  const before = read();
  control.focus();
  return { before, after: read(), scrollTop: aside.scrollTop };
}

/** Focus the foot's first verb with the rail at scroll top. */
function focusFootVerb() {
  const aside = document.querySelector('[data-probe-inspector]');
  aside.scrollTop = 0;
  aside.querySelector(':scope .fab-inspector-panel-foot :is(button, a[href])').focus();
  return aside.scrollTop;
}

describe('the system inspectors pin their record verbs to the rail foot (issue 2498)', () => {
  before(() => fixture.start());
  after(() => fixture.stop());

  for (const [inspector, verbs] of Object.entries(INSPECTORS)) {
    describe(inspector, () => {
      it('renders every record verb inside the foot', async () => {
        const page = await openInspector(inspector, 'long');
        try {
          for (const verb of await page.evaluate(readVerbs, verbs)) {
            assert.ok(verb.rendered, `${verb.selector} renders`);
            assert.ok(verb.inFoot, `${verb.selector} sits in the inspector's foot`);
          }
        } finally {
          await page.close();
        }
      });

      it('holds the foot flush on an overflowing rail at the top and end of the scroll range', async () => {
        const page = await openInspector(inspector, 'long');
        try {
          const top = await sampleAt(page, 0);
          const end = await sampleAt(page, 'max');
          assert.ok(
            Math.abs(top.column.height - RAIL_PX) <= EPSILON_PX,
            `NON-VACUITY: rail ${top.column.height}px`
          );
          assert.ok(
            top.overflow >= MIN_OVERFLOW_PX,
            `NON-VACUITY: the rail overflows by ${top.overflow}px`
          );
          assert.ok(end.scrollTop > top.scrollTop, 'NON-VACUITY: the two samples are two offsets');
          for (const sample of [top, end]) {
            assertDockAtColumnFoot(sample, { box: 'foot', fits: false });
          }
          const share = (top.foot.bottom - top.foot.top) / top.column.height;
          assert.ok(
            share <= MAX_FOOT_SHARE,
            `the foot takes ${Math.round(share * 100)}% of the rail`
          );
        } finally {
          await page.close();
        }
      });

      it('seats the foot on the rail foot of a short panel', async () => {
        const page = await openInspector(inspector, 'short');
        try {
          const sample = await sampleAt(page, 0);
          assert.equal(sample.overflow, 0, 'NON-VACUITY: the short panel fits its rail');
          assertDockAtColumnFoot(sample, { box: 'foot' });
          const share = (sample.foot.bottom - sample.foot.top) / sample.column.height;
          assert.ok(
            share <= MAX_FOOT_SHARE,
            `the foot takes ${Math.round(share * 100)}% of the rail`
          );
        } finally {
          await page.close();
        }
      });

      it('stops a focus scroll above the foot (WCAG 2.4.11)', async () => {
        const page = await openInspector(inspector, 'long');
        try {
          const walk = await page.evaluate(focusWalk);
          assert.ok(walk.count > 0 && walk.scrolls > 0, `NON-VACUITY: ${JSON.stringify(walk)}`);
          assert.deepEqual(walk.obscured, [], 'no focused control sits under the foot');
          assert.equal(walk.last, '', 'the last control, focused from scroll top, clears the foot');
        } finally {
          await page.close();
        }
      });

      it('scrolls a control half under the foot clear of it on focus (WCAG 2.4.11)', async () => {
        const page = await openInspector(inspector, 'long');
        try {
          const { before, after } = await page.evaluate(focusStraddling);
          assert.ok(
            before.bottom > before.footTop + EPSILON_PX,
            `NON-VACUITY: the control starts under the foot (${JSON.stringify(before)})`
          );
          assert.ok(
            after.bottom <= after.footTop + EPSILON_PX,
            `the focused control ends at ${after.bottom}px, over the foot's top ${after.footTop}px`
          );
        } finally {
          await page.close();
        }
      });

      it("leaves the rail at scroll top when the foot's own verb takes focus", async () => {
        const page = await openInspector(inspector, 'long');
        try {
          assert.equal(await page.evaluate(focusFootVerb), 0, 'the rail did not scroll');
          const sample = await sampleAt(page, null);
          assert.ok(sample.overflow >= MIN_OVERFLOW_PX, 'NON-VACUITY: the rail overflows');
          assertDockAtColumnFoot(sample, { box: 'foot', fits: false });
        } finally {
          await page.close();
        }
      });
    });
  }
});
