/*
 * THE FLATTENED LIST ROUTES' ROW STATES, ARBITRATED IN A REAL BROWSER (issue 1373).
 * ── THE GAP THIS CLOSES IS AN ASSERTION GAP, NOT A COVERAGE GAP ─────────────────────────────
 * `world-tool-catalogue-bulk` already photographs four ticked rows. What it cannot do is say
 * which of them is right: the capture driver clicks its last row and leaves the pointer on it, so
 * that frame has three rows wearing the bulk-selection fill and a fourth — the one under the
 * mouse — wearing the hover fill instead, and nothing anywhere says the fourth is wrong. A
 * reviewer reading the frame sees a list with a highlighted row in it, which is what a working
 * list also looks like.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

import { scopedComponentCss } from '../helpers/scoped-component-css.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const sheet = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');

const FRAME = 'src/ui/svelte/apps/manager/scoped/EntityListInspectorFrame.svelte';
const ESSENCE_ROW = 'src/ui/svelte/apps/manager/essences/EssenceRow.svelte';

/* THE THREE ROUTES, AS DATA RATHER THAN AS THREE COPIES OF THE SAME FILE. */
const ROUTES = [
  { view: 'world-tools', rowClass: 'manager-scoped-list-row', component: FRAME, subject: 'Tool' },
  {
    view: 'world-essences',
    rowClass: 'manager-scoped-list-row',
    component: FRAME,
    subject: 'world Essence',
  },
  {
    view: 'essences',
    rowClass: 'manager-essence-row',
    component: ESSENCE_ROW,
    subject: 'system Essence',
  },
  // ── THE FOURTH ROUTE (issue 1371) ────────────────────────────────────────────────────────
  // The world Component catalogue renders the SAME shared frame row as the two world routes
  // above it, so its block is the twin of theirs — and it was the one flattened list route that
  // had no such block at all until this lane appended one. It is added HERE rather than in a
  // copy of this file: a second copy is a SonarCloud duplication failure, and consolidating two
  // copies later makes the per-diff density worse rather than better.
  {
    view: 'world-components',
    rowClass: 'manager-scoped-list-row',
    component: FRAME,
    subject: 'Component',
  },
];

const components = new Map();
for (const { component } of ROUTES) {
  if (!components.has(component)) {
    components.set(component, scopedComponentCss(resolve(repoRoot, component)));
  }
}

/** One row, in whatever combination of the two independent state classes it is asked for. */
function row(route, probe, classes) {
  const { hashClass } = components.get(route.component);
  return (
    `<li class="${route.rowClass} ${classes} ${hashClass}" data-probe="${route.view}-${probe}">` +
    `<span class="manager-scoped-list-identity">${probe}</span></li>`
  );
}

function container(view, rows) {
  const routed = view ? ` data-manager-view="${view}"` : '';
  return (
    `<div class="fabricate fabricate-manager" data-fabricate-theme="dark"${routed}>` +
    `<div class="manager-scoped-list-rows"><ul class="manager-scoped-list">${rows.join('')}` +
    '</ul></div></div>'
  );
}

/* FOUR ROWS PER ROUTE, WHICH IS THE SMALLEST SET THAT SETTLES THE QUESTION. */
function markup(route) {
  return (
    container(route.view, [
      row(route, 'bulk-hovered', 'is-bulk-selected'),
      row(route, 'bulk-resting', 'is-bulk-selected'),
      row(route, 'inspected-hovered', 'is-selected'),
      row(route, 'plain-hovered', ''),
    ]) + container('', [row(route, 'bulk-baseline', 'is-bulk-selected')])
  );
}

const PAGE =
  '<!doctype html><html><head><meta charset="utf-8">' +
  `<style id="layered-sheet">@layer modules { ${sheet} }</style>` +
  `<style>${[...components.values()].map((entry) => entry.css).join('')}</style>` +
  '<style>:root { --font-primary: Arial, sans-serif; } html, body { margin: 0; padding: 0; }' +
  '.manager-scoped-list { list-style: none; margin: 0; padding: 0; width: 600px; }' +
  '.manager-scoped-list-row, .manager-essence-row { height: 40px; min-height: 0; }</style></head>' +
  `<body>${ROUTES.map(markup).join('')}</body></html>`;

let browser;

before(async () => {
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
});

async function open() {
  const page = await browser.newPage({ viewport: { width: 900, height: 1400 } });
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

/* THE NON-VACUITY CLAUSE FOR THE PARAMETERISATION ITSELF (issue 1371). */
test('every parameterised route DECLARES its own row rules, or it measures nothing', () => {
  const declarations = [...sheet.matchAll(/([^{}]+)\{[^{}]*\}/g)].map((match) => match[1]);
  assert.ok(declarations.length > 2000, 'the selector scan found nothing; it is broken');
  for (const route of ROUTES) {
    const owned = declarations.filter(
      (selector) =>
        selector.includes(`[data-manager-view='${route.view}']`) &&
        selector.includes(route.rowClass)
    );
    assert.ok(
      owned.length >= 4,
      `${route.view} declares ${owned.length} of its own row selectors; with none of them the ` +
        'four assertions below are decided entirely by the shared ladder and this route is ' +
        'measured only in appearance'
    );
  }
});

for (const route of ROUTES) {
  const probe = (name) => `${route.view}-${name}`;

  test(`a bulk-selected ${route.subject} row is marked at all on ${route.view}`, async () => {
    const { page, close } = await open();
    try {
      const routed = await page.evaluate(fillOf, probe('bulk-resting'));
      const baseline = await page.evaluate(fillOf, probe('bulk-baseline'));

      // THE FIRST HALF, AND IT IS A SEPARATE DEFECT FROM THE HOVER ONE. The route strips every
      // row's resting fill at (0,3,0), which is the SAME weight as the shared `.is-bulk-selected`
      // rule and stands LATER in the file. So a ticked row on this screen paints nothing, and the
      // tick in its checkbox is the only thing distinguishing it from an untouched row.
      assert.equal(
        routed,
        baseline,
        `the ${route.view} route must restate the bulk-selected fill, as it already restates ` +
          '.is-selected — otherwise a ticked row on this screen paints nothing at all'
      );
    } finally {
      await close();
    }
  });

  test(`hovering a bulk-selected ${route.subject} row keeps its marking on ${route.view}`, async () => {
    const { page, close } = await open();
    try {
      await page.hover(`[data-probe="${probe('bulk-hovered')}"]`);
      const hovered = await page.evaluate(fillOf, probe('bulk-hovered'));
      const resting = await page.evaluate(fillOf, probe('bulk-resting'));
      const baseline = await page.evaluate(fillOf, probe('bulk-baseline'));

      // THE SECOND HALF, AND THE ONE A FRAME ALREADY CONTAINS AND CANNOT SPEAK ABOUT. A ticked
      // row and the pointer are two independent facts, and a GM sweeping the pointer down a list
      // they have just ticked must not watch the marking follow the mouse off each row in turn.
      assert.equal(
        hovered,
        resting,
        'a bulk-selected row keeps its selection fill under the pointer'
      );

      // AND IT IS THE BULK FILL RATHER THAN NOTHING. Without this the assertion above is
      // satisfied by a repair that removed the bulk rule as well as the hover one, which would
      // make every ticked row indistinguishable from an untouched one — a worse version of the
      // same defect, and the state all three routes were in.
      assert.equal(hovered, baseline, 'and it is the shared bulk fill it keeps');
    } finally {
      await close();
    }
  });

  test(`hover still paints an ordinary ${route.subject} row on ${route.view}`, async () => {
    const { page, close } = await open();
    try {
      const resting = await page.evaluate(fillOf, probe('plain-hovered'));
      await page.hover(`[data-probe="${probe('plain-hovered')}"]`);
      const hovered = await page.evaluate(fillOf, probe('plain-hovered'));

      // THE NON-VACUITY CLAUSE FOR THE WHOLE FILE. Each route strips the resting fill from every
      // row — the 1px border is what makes a row a row on these screens — so hover is the ONLY
      // thing that gives an unticked row a surface, and a repair that dropped the hover rule to
      // win the argument above would leave the list with no pointer feedback at all and pass.
      assert.notEqual(resting, hovered, 'an unticked row takes a fill under the pointer');
    } finally {
      await close();
    }
  });

  test(`hovering the inspected ${route.subject} row keeps its marking on ${route.view}`, async () => {
    const { page, close } = await open();
    try {
      const resting = await page.evaluate(fillOf, probe('inspected-hovered'));
      await page.hover(`[data-probe="${probe('inspected-hovered')}"]`);
      const hovered = await page.evaluate(fillOf, probe('inspected-hovered'));

      // THE SIBLING HALF, asserted even though the sheet's own comment records it as a zero-pixel
      // arbitration today: each route's `.is-selected` and its `:hover` happen to paint the same
      // value, so nothing MOVES when hover wins. That is a coincidence of two literals rather
      // than a decision, and it is exactly the kind of coincidence a later theme or ladder change
      // ends silently. Pinning it here means the day the two values diverge is the day this
      // fails, rather than the day a GM notices.
      assert.equal(hovered, resting, 'the inspected row keeps its accent fill under the pointer');
    } finally {
      await close();
    }
  });
}
