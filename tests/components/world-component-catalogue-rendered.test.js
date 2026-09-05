/*
 * THE WORLD COMPONENT CATALOGUE, RENDERED IN A REAL BROWSER (issue 1371).
 *
 * Two things happy-dom cannot answer and this file therefore does: WHICH ELEMENT IS ON TOP at a
 * control's own centre (the pointer hit-tests the delta's acceptance criteria name), and WHAT THE
 * CASCADE ACTUALLY RESOLVES for a rule that has to beat an unlayered competitor (the toolbar's
 * two micro-type corrections). Both are read off the SHIPPED markup and the SHIPPED stylesheets.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────────────────
 * The issue's own acceptance criteria require a pointer hit-test on the catalogue row's identity
 * button, its `open-entry` pen, the bulk selection checkbox and the armed bulk delete, with the
 * stated reason that the row's trailing meta run shares a flex row with `.manager-action-group`
 * and the dock is a `position: sticky` band with negative inline margins that the list scrolls
 * under. UX review rounds 1 and 2 both found the set untested (`review-r9-ux.md` F-H): nothing in
 * `tests/components/world-component-catalogue-mounted.test.js` calls `elementFromPoint`, and
 * nothing can — happy-dom computes no layout at all, so `document.elementFromPoint` there answers
 * `null` for every point on the page and an assertion built on it would be vacuous rather than
 * false. DOM presence is not the question here. Which element is ON TOP at the control's own
 * centre is.
 *
 * ── AND WHY THE MARKUP IS THE PRODUCT'S ──────────────────────────────────────────────────
 * `tests/components/tool-rules-list-parity.test.js` hand-writes its fixture, which is the right
 * trade for a type-and-cascade contract and the wrong one here: a hand-written row goes on being
 * hit-testable after the real row stops emitting the element the test probes. So this follows
 * `tests/components/bulk-edit-dock-pinning.test.js` instead — MOUNT the shipped
 * `WorldComponentCataloguePage` through the shared harness, take the rendered tree's own
 * `innerHTML`, and ship that into Chromium inside the manager shell it actually renders in.
 * Deleting the checkbox, the pen or the dock from the product empties this gate's markup and the
 * `found` assertions fail on the spot.
 *
 * ── BOTH STYLESHEETS, FOR THE REASON THE DOCK GATE RECORDS ───────────────────────────────
 * `styles/fabricate.css` owns `.manager-body`'s column grid, `.manager-inspector`'s scrollport
 * and the route-scoped row rules; each component's own appearance lives in a Svelte-scoped block
 * that appears nowhere in that file. Injecting one without the other leaves half the geometry
 * unstyled, and an unstyled row hit-tests differently from a real one. The rendered markup
 * already carries the real `svelte-<hash>` classes, so the two halves match by construction —
 * `HASH_PARITY` below asserts that rather than assuming it.
 *
 * ── THE NEGATIVE CONTROL IS IN THE FILE, NOT IN A LOST SHELL SESSION ─────────────────────
 * A hit test that has never been seen to FAIL is indistinguishable from one that reports `true`
 * for everything. The second page load injects one extra rule that overlays each row and the dock
 * with a transparent `::after`, and the suite asserts that EVERY target then misses and that the
 * interceptor is named in the report. That is the whole reddening argument, run on every CI
 * execution rather than pasted into a handoff once.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { before, describe, it } from 'node:test';

import { chromium } from 'playwright';
import { compile } from 'svelte/compiler';

import {
  COMPONENT_SYSTEMS,
  componentScopeFor,
  createWorldComponentCatalogueHarness,
  drainMicrotasks,
} from '../helpers/componentScopeMountModules.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const fabricateCss = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');

const { harness, compiledModules } = createWorldComponentCatalogueHarness({
  repoRoot,
  tmpPrefix: 'fabricate-catalogue-pointer-',
});

// The manager host is deliberately wide: `styles/fabricate.css` collapses `.manager-body` to a
// single scrolling column at or below 1120px of container width, which would stack the list over
// the inspector and put the dock somewhere no GM sees it. This measures the configuration the
// screen is FOR, and `MIN_ROW_HEIGHT_PX` below is what stops a collapsed layout passing quietly.
const HOST_WIDTH_PX = 1280;
const HOST_HEIGHT_PX = 720;
// Anti-vacuity: a row laid out with no stylesheet is a few pixels tall and every point in it
// belongs to whatever painted last. A real row is the reference's 38px medallion plus padding.
const MIN_ROW_HEIGHT_PX = 40;
// Anti-vacuity for the collector: the tree's styled components. Measured at 20; a floor well
// under it still fails loudly if the collector silently stops finding blocks.
const MIN_SCOPED_BLOCKS = 12;

/**
 * Every scoped `<style>` block in the tree, in the order the harness compiles them.
 *
 * READ OFF THE HARNESS MANIFEST rather than off a second hand-written list, so a component added
 * to the screen cannot arrive styled in the browser and unstyled here. A module with no block at
 * all is skipped — `IconButton`, `ManagerButton`, `ManagerToolbar`, `ArmedDangerButton` and
 * `InspectorCard` all draw entirely from the global sheet — and the count is asserted so the
 * skip cannot quietly become "all of them".
 *
 * @returns {{css: string, hashes: string[], blocks: number}}
 */
function collectScopedCss() {
  const parts = [];
  const hashes = [];
  for (const modulePath of compiledModules) {
    const filename = resolve(repoRoot, modulePath);
    const { css } = compile(readFileSync(filename, 'utf8'), { filename, css: 'external' });
    if (!css?.code) continue;
    parts.push(css.code);
    const hash = css.code.match(/\.(svelte-[a-z0-9]+)\b/)?.[1];
    if (hash) hashes.push(hash);
  }
  return { css: parts.join('\n'), hashes, blocks: parts.length };
}

/**
 * The catalogue's rendered markup inside the manager shell it ships in.
 *
 * The page's own root IS `main.manager-main`, so the wrappers here are only what sits above it:
 * the themed area root that carries the route attribute every `[data-manager-view=…]` rule in
 * the sheet reads, `.manager-body`'s column grid, and the rail that occupies the first track.
 * The inspector is INSIDE the page — `EntityListInspectorFrame` renders it as the second track of
 * its own layout — so nothing here supplies one.
 *
 * @param {string} productMarkup
 * @param {string} scopedCss
 * @param {string} control an extra rule set; `''` for the honest page.
 * @returns {string}
 */
function cataloguePage(productMarkup, scopedCss, control) {
  return `<!doctype html><html><head><meta charset="utf-8">
    <style>${fabricateCss}</style>
    <style>${scopedCss}</style>
    <style>
      :root { --font-primary: Arial, sans-serif; }
      html, body { margin: 0; padding: 0; }
      .probe-host { width: ${HOST_WIDTH_PX}px; height: ${HOST_HEIGHT_PX}px; }
    </style>
    <style>${control}</style></head>
    <body>
      <div class="probe-host">
        <div class="fabricate fabricate-manager" data-fabricate-theme="dark" data-manager-view="world-components">
          <div class="manager-body">
            <nav class="manager-rail"></nav>
            ${productMarkup}
          </div>
        </div>
      </div>
    </body></html>`;
}

/**
 * The rule set that reddens every assertion below.
 *
 * A transparent `::after` stretched over each row and over the dock is the exact shape of the
 * defect a hit test exists to catch: nothing moves, nothing changes colour, every element is
 * still in the DOM at its right size, and every control stops being clickable. `position:
 * relative` on the row is part of the control rather than of the product — the row does not
 * declare one — because an absolutely positioned overlay needs a containing block to stretch to.
 */
const OVERLAY_CONTROL = `
  .manager-scoped-list-row { position: relative; }
  .manager-scoped-list-row::after { content: ''; position: absolute; inset: 0; }
  .fab-bulk-edit-dock { position: relative; }
  .fab-bulk-edit-dock::after { content: ''; position: absolute; inset: 0; }
`;

/**
 * The four controls the delta names, each as the point a GM aims at and the control it must hit.
 *
 * `probe` and `target` differ for the checkbox ALONE, and that difference is the finding line 540
 * of the delta got backwards. `SelectionCheckbox` keeps the real `<input>` in the DOM at 1x1
 * `opacity: 0` and paints a sibling `<span class="fab-selection-check">`; the pointer aims at the
 * painted box and the control that receives it is the `<label>` wrapping both. Probing the input
 * would measure a one-pixel point no GM can aim at.
 */
const TARGETS = [
  {
    label: 'row identity button',
    probe: '[data-scoped-list-row="resin"] [data-scoped-list-inspect]',
    target: '[data-scoped-list-row="resin"] [data-scoped-list-inspect]',
  },
  {
    label: 'row open-entry pen',
    probe: '[data-scoped-list-row="resin"] [data-scoped-list-action="open-entry"]',
    target: '[data-scoped-list-row="resin"] [data-scoped-list-action="open-entry"]',
  },
  {
    label: 'leading selection checkbox',
    probe: '[data-scoped-list-row="resin"] .fab-selection-check',
    target: '[data-scoped-list-row="resin"] .fab-selection-checkbox',
  },
  {
    label: 'armed bulk delete',
    probe: '[data-world-component-bulk-danger] [data-armed="true"]',
    target: '[data-world-component-bulk-danger] [data-armed="true"]',
  },
];

/**
 * Hit-test every target at its own centre, wholly inside the page.
 *
 * `closest` rather than identity, because the topmost element at a control's centre is normally
 * one of its own children — the pen's `<i>`, the identity button's name `<span>`, the danger
 * button's label. What a pointer hit-test asks is whether the point belongs to the control, not
 * whether the control has no children.
 *
 * @param {Array<{label: string, probe: string, target: string}>} targets
 * @returns {Array<object>}
 */
function measurePointerTargets(targets) {
  return targets.map(({ label, probe, target }) => {
    const element = document.querySelector(probe);
    if (!element) return { label, probe, target, found: false };
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return {
      label,
      probe,
      target,
      found: true,
      width: Math.round(box.width),
      height: Math.round(box.height),
      matched: Boolean(hit?.closest?.(target)),
      hitTag: hit?.tagName ?? 'none',
      hitClass: String(hit?.getAttribute?.('class') ?? ''),
    };
  });
}

/**
 * The toolbar's two micro-type roles, as the cascade actually resolves them.
 *
 * READ IN THE BROWSER, because both values are decided by a LAYER contest rather than by
 * specificity alone: `styles/fabricate.css` is imported at `layer(modules)` and the frame's own
 * `css: 'injected'` block is unlayered, so the route correction has to live in the unlayered
 * block to win at all. Nothing in the source text says which rule won; only a computed style does.
 */
function measureToolbarType() {
  const read = (selector) => {
    const element = document.querySelector(selector);
    if (!element) return { found: false, selector };
    const style = getComputedStyle(element);
    return {
      found: true,
      selector,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      letterSpacing: style.letterSpacing,
      color: style.color,
    };
  };
  return {
    membershipLabel: read('[data-scoped-list-filter-label="membership"]'),
    sortLabel: read('.manager-scoped-list-sort-label'),
    direction: read('[data-scoped-list-direction]'),
    // The ink the reference gives the direction toggle, resolved from the theme rather than
    // written here as a literal — the token is the design system's answer and a colour value is
    // not. Read through a PROBE rather than off the custom property, because a custom property
    // answers its authored form while `color` answers the computed one, and comparing the two
    // string forms would fail on notation alone.
    secondaryInk: readTokenAsColor('--fab-text-secondary'),
  };

  /**
   * One theme token, in the same computed notation `getComputedStyle().color` answers in.
   *
   * @param {string} token
   * @returns {string}
   */
  function readTokenAsColor(token) {
    const root = document.querySelector('.fabricate-manager');
    const probe = document.createElement('span');
    probe.style.color = `var(${token})`;
    root.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  }
}

/** The row's leading edge order, which is the other half of the delta's own criterion. */
function measureRowOrder() {
  const row = document.querySelector('[data-scoped-list-row="resin"]');
  const box = row.getBoundingClientRect();
  const checkbox = row.querySelector('.fab-selection-checkbox').getBoundingClientRect();
  const medallion = row.querySelector('.fab-medallion').getBoundingClientRect();
  const pen = row.querySelector('[data-scoped-list-action="open-entry"]').getBoundingClientRect();
  return {
    rowHeight: box.height,
    rowLeft: box.left,
    rowRight: box.right,
    checkboxLeft: checkbox.left,
    medallionLeft: medallion.left,
    penLeft: pen.left,
  };
}

describe('the catalogue’s rendered pointer targets and toolbar micro-type', () => {
  const rendered = { markup: '', armed: false, scoped: null };
  let honest = null;
  let overlaid = null;
  let rowOrder = null;
  let toolbarType = null;

  before(async () => {
    rendered.scoped = collectScopedCss();

    await harness.setup();
    try {
      const target = await harness.mount({
        scope: componentScopeFor(),
        systems: COMPONENT_SYSTEMS,
        // `resin` is the one record NO system holds, so the bulk delete plan frees it and the
        // dock's danger leg arms for real rather than branching to `Cannot delete`.
        actions: { deleteEntity: async () => true },
        worldItems: [{ uuid: 'Item.resin-source', name: 'Wildwood Resin', description: 'Tapped.' }],
      });
      target.querySelector('[data-scoped-list-select="resin"]').click();
      await drainMicrotasks();
      const danger = target.querySelector(':scope [data-world-component-bulk-danger] button');
      danger.click();
      await drainMicrotasks();
      rendered.armed = danger.getAttribute('data-armed') === 'true';
      rendered.markup = target.innerHTML;
    } finally {
      harness.teardown();
    }

    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({
        viewport: { width: HOST_WIDTH_PX, height: HOST_HEIGHT_PX },
      });
      await page.setContent(cataloguePage(rendered.markup, rendered.scoped.css, ''), {
        waitUntil: 'load',
      });
      honest = await page.evaluate(measurePointerTargets, TARGETS);
      rowOrder = await page.evaluate(measureRowOrder);
      toolbarType = await page.evaluate(measureToolbarType);
      await page.setContent(
        cataloguePage(rendered.markup, rendered.scoped.css, OVERLAY_CONTROL),
        { waitUntil: 'load' }
      );
      overlaid = await page.evaluate(measurePointerTargets, TARGETS);
    } finally {
      await browser.close();
    }
  });

  it('ships the four controls, armed, in the rendered product markup', () => {
    assert.ok(
      rendered.markup.length > 0,
      'the page rendered nothing at all — every measurement below would be about an empty tree'
    );
    assert.ok(
      rendered.armed,
      'the bulk delete did not reach its ARMED state, so the target measured below is the idle ' +
        'button and the armed one is unmeasured'
    );
    assert.ok(
      rendered.scoped.blocks >= MIN_SCOPED_BLOCKS,
      `only ${rendered.scoped.blocks} scoped style blocks were collected from the harness ` +
        `manifest (expected at least ${MIN_SCOPED_BLOCKS}) — the components would lay out ` +
        'unstyled and every hit test below would be measuring a different screen'
    );
    // HASH PARITY. The injected CSS is compiled from the source tree and the markup from the
    // harness's temp copy; if those two ever produced different scoping hashes, every scoped
    // rule would match nothing and the page would silently lay out on the global sheet alone.
    const used = rendered.scoped.hashes.filter((hash) => rendered.markup.includes(hash));
    assert.ok(
      used.length >= MIN_SCOPED_BLOCKS / 2,
      `only ${used.length} of ${rendered.scoped.hashes.length} scoping hashes appear in the ` +
        'rendered markup — the injected blocks and the markup were compiled to different hashes'
    );
  });

  it('lays the row out at its real height, so the points below are real points', () => {
    assert.ok(
      rowOrder.rowHeight >= MIN_ROW_HEIGHT_PX,
      `the row is ${rowOrder.rowHeight}px tall (expected at least ${MIN_ROW_HEIGHT_PX}px) — the ` +
        'stylesheets did not reach it, and an unstyled row hit-tests nothing the product does'
    );
    assert.ok(
      rowOrder.rowRight - rowOrder.rowLeft > 400,
      'and the list column is a real width rather than a collapsed one'
    );
  });

  it('puts the selection box at the row’s LEADING edge, before the medallion', () => {
    // The delta's own criterion still says the box sits at the row's TRAILING edge. `proto:604`
    // puts `<span style="{{ r.box }}">` first, before the chip, and so does the shipped row —
    // so the criterion is what is wrong, and this is the measurement that says so.
    assert.ok(
      rowOrder.checkboxLeft < rowOrder.medallionLeft,
      `the selection box (${rowOrder.checkboxLeft}) is not left of the medallion ` +
        `(${rowOrder.medallionLeft}) — the reference draws it as the row's FIRST child`
    );
    assert.ok(
      rowOrder.penLeft > rowOrder.medallionLeft,
      'and the open-entry pen is at the trailing edge, which is where the box used to be'
    );
  });

  for (const { label } of TARGETS) {
    it(`delivers the pointer to the ${label}`, () => {
      const hit = honest.find((entry) => entry.label === label);
      assert.ok(hit.found, `${label} (${hit.probe}) is absent from the rendered product markup`);
      assert.ok(
        hit.width > 0 && hit.height > 0,
        `${label} rendered at ${hit.width}x${hit.height} — a zero box has no centre to aim at`
      );
      assert.ok(
        hit.matched,
        `${label} (${hit.width}x${hit.height}) missed ${hit.target}; ` +
          `hit ${hit.hitTag} ${hit.hitClass}`
      );
    });
  }

  it('draws `SORT BY` exactly as it draws `MEMBERSHIP`, which is what the reference does', () => {
    // UX round-2 finding F-K. `proto:582` and `proto:585` are the same declaration, and the
    // subject drew 8.5px/700/.09em beside 9.28px/600/.08em — two micro-labels, one row, two
    // treatments. Asserted AGAINST THE SIBLING rather than against three literals, because what
    // the reference states is that the two are identical.
    assert.ok(toolbarType.membershipLabel.found, 'the membership micro-label renders');
    assert.ok(toolbarType.sortLabel.found, 'and so does the sort one');
    assert.deepEqual(
      {
        fontSize: toolbarType.sortLabel.fontSize,
        fontWeight: toolbarType.sortLabel.fontWeight,
        letterSpacing: toolbarType.sortLabel.letterSpacing,
      },
      {
        fontSize: toolbarType.membershipLabel.fontSize,
        fontWeight: toolbarType.membershipLabel.fontWeight,
        letterSpacing: toolbarType.membershipLabel.letterSpacing,
      },
      'the two micro-labels on one toolbar row resolve to ONE treatment'
    );
    // NON-VACUITY: two labels that both resolved to nothing would satisfy the equality above.
    assert.equal(toolbarType.sortLabel.fontWeight, '700');
    assert.match(toolbarType.sortLabel.fontSize, /^8\.\d+px$/);
  });

  it('inks the direction toggle at the reference’s weight and secondary ink', () => {
    // `proto:587` is `font:600 11px var(--sans);color:var(--text2)`; the toggle shipped at the
    // manager's `--fab-recipe-control-font` (11.52px) at the inherited 400, in the primary ink.
    assert.ok(toolbarType.direction.found, 'the direction toggle renders');
    assert.equal(toolbarType.direction.fontWeight, '600');
    assert.equal(toolbarType.direction.fontSize, '11px');
    assert.equal(
      toolbarType.direction.color,
      toolbarType.secondaryInk,
      'and takes the secondary ink the reference gives it — compared against the TOKEN the ' +
        'theme resolves, so a theme change moves both sides together'
    );
  });

  it('and reports a MISS on every one of them under a transparent overlay', () => {
    // The control. Without it, `matched: true` for four selectors is equally consistent with a
    // hit test that works and one that answers `true` for anything.
    const missed = overlaid.filter((entry) => entry.found && !entry.matched);
    assert.equal(
      missed.length,
      TARGETS.length,
      'an overlay stretched over the row and the dock must intercept ALL FOUR targets; it ' +
        `intercepted ${missed.length}: ${JSON.stringify(overlaid, null, 2)}`
    );
    for (const entry of missed) {
      assert.ok(
        entry.hitTag !== 'none',
        `${entry.label} hit nothing at all under the overlay, which is a layout failure rather ` +
          'than an interception'
      );
    }
  });
});
