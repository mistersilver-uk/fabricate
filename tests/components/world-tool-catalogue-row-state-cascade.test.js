/*
 * THE WORLD TOOLS CATALOGUE'S ROW STATES, ARBITRATED IN A REAL BROWSER (issue 1373).
 *
 * ── THE GAP THIS CLOSES IS AN ASSERTION GAP, NOT A COVERAGE GAP ─────────────────────────────
 * `world-tool-catalogue-bulk` already photographs four ticked rows. What it cannot do is say
 * which of them is right: the capture driver clicks its last row and leaves the pointer on it, so
 * that frame has three rows wearing the bulk-selection fill and a fourth — the one under the
 * mouse — wearing the hover fill instead, and nothing anywhere says the fourth is wrong. A
 * reviewer reading the frame sees a list with a highlighted row in it, which is what a working
 * list also looks like.
 *
 * The arbitration is a pure specificity question and the sheet reads as though both states are
 * declared: `[data-manager-view='world-tools'] .manager-scoped-list-row:hover` is (0,4,0) and
 * `.fabricate-manager .manager-scoped-list-row.is-bulk-selected` is (0,3,0), so hover wins and a
 * row a GM has just ticked loses its marking for as long as the pointer stays on it. The system
 * half of exactly this rule was repaired one round earlier with `:not(.is-selected)`, and its
 * comment recorded the world half as "deliberately untouched" because the world `.is-selected`
 * paints the same value the hover does — true for `.is-selected`, and false for
 * `.is-bulk-selected`, which paints `--fab-surface-active`.
 *
 * ── WHY A BROWSER, AND WHY NOT A MOUNTED TEST ───────────────────────────────────────────────
 * happy-dom computes no cascade at all, so a mounted suite can state that the row carries
 * `is-bulk-selected` and never which declaration wins. And no frame can photograph a hover: the
 * View Lab has five step verbs and none of them is one, so the state the capture accidentally
 * produces is a state the registry has no way to assert about. `tool-rules-list-parity.test.js`
 * is the same argument for the system list one route away.
 *
 * ── THE LAYERING IS THE PRODUCT'S, AND THE FIRST TEST BELOW PROVES IT ───────────────────────
 * `module.json` registers `styles/fabricate.css` with no explicit `layer`, and Foundry imports an
 * unlayered module stylesheet at `layer(modules)`; a Svelte `css: 'injected'` block lands
 * UNLAYERED and beats it at any specificity. `tests/view-lab/cascade.css` is the reference that
 * states it. Loading the two flat would let a global rule this fixture measures as winning be
 * inert in the product, which is the failure mode a sibling lane already shipped once.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

import { scopedComponentCss } from '../helpers/scoped-component-css.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const FRAME = 'src/ui/svelte/apps/manager/scoped/EntityListInspectorFrame.svelte';
const sheet = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');
/*
 * The frame's own block, loaded UNLAYERED exactly as the runtime injects it.
 *
 * It declares no row background today, so every assertion below is decided by the global sheet.
 * It is loaded anyway, and that is the point: if it ever grows one, this fixture arbitrates the
 * pair the way production does rather than reporting the sheet's answer over a rule that has
 * stopped applying.
 */
const frameCss = scopedComponentCss(resolve(repoRoot, FRAME)).css;

/** One row, in whatever combination of the two independent state classes it is asked for. */
function row(probe, classes) {
  return (
    `<li class="manager-scoped-list-row ${classes}" data-probe="${probe}">` +
    `<span class="manager-scoped-list-identity">${probe}</span></li>`
  );
}

/*
 * FOUR ROWS, WHICH IS THE SMALLEST SET THAT SETTLES THE QUESTION.
 *
 * The pointer can only be on one of them, so each state needs a twin the pointer is NOT on — a
 * single hovered row would report a colour with nothing to compare it against, and the obvious
 * wrong repair (deleting the hover rule) would pass. `plain` is what proves hover still paints
 * anything at all.
 */
const ROUTE_ROWS =
  '<ul class="manager-scoped-list">' +
  row('bulk-hovered', 'is-bulk-selected') +
  row('bulk-resting', 'is-bulk-selected') +
  row('inspected-hovered', 'is-selected') +
  row('plain-hovered', '') +
  '</ul>';

/*
 * THE SAME ROW, OUTSIDE THE ROUTE, AND IT IS THE ORACLE RATHER THAN A FIFTH CASE.
 *
 * `.fabricate-manager .manager-scoped-list-row.is-bulk-selected` is the SHARED statement of what
 * a ticked row looks like, and every other scoped catalogue renders under it untouched. So the
 * question the world Tools route raises is not "what colour should this be" — which would want a
 * literal, and a literal is a second copy of a token — it is "does this route still say what the
 * shared rule says". Comparing the two containers asks exactly that, and it keeps answering it
 * through a theme change, a token rename or a ladder move.
 */
const BASELINE_ROWS = `<ul class="manager-scoped-list">${row('bulk-baseline', 'is-bulk-selected')}</ul>`;

const PAGE =
  '<!doctype html><html><head><meta charset="utf-8">' +
  `<style id="layered-sheet">@layer modules { ${sheet} }</style>` +
  `<style>${frameCss}</style>` +
  '<style>:root { --font-primary: Arial, sans-serif; } html, body { margin: 0; padding: 0; }' +
  '.manager-scoped-list { list-style: none; margin: 0; padding: 0; width: 600px; }' +
  '.manager-scoped-list-row { height: 40px; }</style></head>' +
  '<body><div class="fabricate fabricate-manager" data-fabricate-theme="dark" ' +
  `data-manager-view="world-tools"><div class="manager-scoped-list-rows">${ROUTE_ROWS}` +
  '</div></div>' +
  '<div class="fabricate fabricate-manager" data-fabricate-theme="dark">' +
  `<div class="manager-scoped-list-rows">${BASELINE_ROWS}</div></div>` +
  '</body></html>';

let browser;

before(async () => {
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
});

async function open() {
  const page = await browser.newPage({ viewport: { width: 900, height: 400 } });
  await page.setContent(PAGE);
  return { page, close: () => page.close() };
}

const fillOf = (probe) =>
  globalThis.getComputedStyle(globalThis.document.querySelector(`[data-probe="${probe}"]`))
    .backgroundColor;

test('the fixture layers the sheet the way Foundry does, or it proves nothing', async () => {
  const { page, close } = await open();
  try {
    const layering = await page.evaluate(() => {
      const owned = globalThis.document.querySelector('#layered-sheet').sheet;
      const first = owned.cssRules[0];
      return {
        topLevel: owned.cssRules.length,
        kind: first?.constructor?.name ?? 'none',
        inner: first?.cssRules?.length ?? 0,
      };
    });
    assert.equal(layering.topLevel, 1, 'the sheet is wrapped in exactly one at-rule');
    assert.equal(layering.kind, 'CSSLayerBlockRule', 'and that at-rule is the module layer');
    assert.ok(
      layering.inner > 2000,
      `the layer must hold the whole sheet, found ${layering.inner} rules`
    );
  } finally {
    await close();
  }
});

test('a bulk-selected world Tool row is marked at all, which the route had stopped saying', async () => {
  const { page, close } = await open();
  try {
    const routed = await page.evaluate(fillOf, 'bulk-resting');
    const baseline = await page.evaluate(fillOf, 'bulk-baseline');

    // THE FIRST HALF, AND IT IS A SEPARATE DEFECT FROM THE HOVER ONE. The route strips every
    // row's resting fill — `[data-manager-view='world-tools'] .manager-scoped-list-row {
    // background: transparent }` — at (0,3,0), which is the SAME weight as the shared
    // `.fabricate-manager .manager-scoped-list-row.is-bulk-selected` and stands LATER in the
    // file. So a ticked row on this one screen paints nothing, and the tick in its checkbox is
    // the only thing distinguishing it from an untouched row.
    //
    // `.is-selected` WAS RESTATED FOR THE ROUTE and `.is-bulk-selected` was not, which is why
    // this reads as an oversight rather than a decision: the fix is the missing twin of a rule
    // that is already there, five lines away.
    assert.equal(
      routed,
      baseline,
      'the world-tools route must restate the bulk-selected fill, as it already restates ' +
        '.is-selected — otherwise a ticked row on this screen paints nothing at all'
    );
  } finally {
    await close();
  }
});

test('hovering a bulk-selected world Tool row does not strip its selection marking', async () => {
  const { page, close } = await open();
  try {
    await page.hover('[data-probe="bulk-hovered"]');
    const hovered = await page.evaluate(fillOf, 'bulk-hovered');
    const resting = await page.evaluate(fillOf, 'bulk-resting');
    const baseline = await page.evaluate(fillOf, 'bulk-baseline');

    // THE SECOND HALF, AND THE ONE A FRAME ALREADY CONTAINS AND CANNOT SPEAK ABOUT. A ticked row
    // and the pointer are two independent facts, and a GM sweeping the pointer down a list they
    // have just ticked must not watch the marking follow the mouse off each row in turn.
    assert.equal(
      hovered,
      resting,
      'a bulk-selected row keeps its selection fill under the pointer'
    );

    // AND IT IS THE BULK FILL RATHER THAN NOTHING. Without this the assertion above is satisfied
    // by a repair that removed the bulk rule as well as the hover one, which would make every
    // ticked row indistinguishable from an untouched one — a worse version of the same defect,
    // and the state the route is in today.
    assert.equal(hovered, baseline, 'and it is the shared bulk fill it keeps');
  } finally {
    await close();
  }
});

test('hover still paints an ordinary world Tool row, so deleting the rule is not a fix', async () => {
  const { page, close } = await open();
  try {
    const before = await page.evaluate(fillOf, 'plain-hovered');
    await page.hover('[data-probe="plain-hovered"]');
    const after = await page.evaluate(fillOf, 'plain-hovered');

    // THE NON-VACUITY CLAUSE FOR THE WHOLE FILE. The route strips the resting fill from every row
    // — the 1px border is what makes a row a row on this screen — so hover is the ONLY thing that
    // gives an unticked row a surface, and a repair that dropped the hover rule to win the
    // argument above would leave the list with no pointer feedback at all and still pass.
    assert.notEqual(before, after, 'an unticked row takes a fill under the pointer');
  } finally {
    await close();
  }
});

test('hovering the inspected world Tool row does not strip its own marking either', async () => {
  const { page, close } = await open();
  try {
    const resting = await page.evaluate(fillOf, 'inspected-hovered');
    await page.hover('[data-probe="inspected-hovered"]');
    const hovered = await page.evaluate(fillOf, 'inspected-hovered');

    // THE SIBLING HALF, asserted even though the sheet's own comment records it as a zero-pixel
    // arbitration today: the route's `.is-selected` and its `:hover` happen to paint the same
    // value, so nothing MOVES when hover wins. That is a coincidence of two literals rather than
    // a decision, and it is exactly the kind of coincidence a later theme or ladder change ends
    // silently. Pinning it here means the day the two values diverge is the day this fails,
    // rather than the day a GM notices.
    assert.equal(hovered, resting, 'the inspected row keeps its accent fill under the pointer');
  } finally {
    await close();
  }
});
