/*
 * THE SYSTEM COMPONENT RULES LIST'S TOOLBAR, RENDERED IN A REAL BROWSER (issue 1371 r16-list,
 * maintainer ruling M22).
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────────────────
 * The maintainer's live test found the toolbar card's LAST row — `Select all · GROUP BY CATEGORY ·
 * SORT BY · N of M catalogue entries` — sitting flush against the card's bottom border while the
 * gap above it was the toolbar's ordinary row gap. The rule that shipped it said in its own comment
 * that the second row "already carries its own bottom margin"; no rule anywhere gave it one. That
 * is a CASCADE fact — which declaration a box's bottom edge actually resolves to — and happy-dom
 * computes no layout, so the only place it can be measured is a browser laying out the shipped
 * markup under the shipped stylesheets. This follows `world-component-catalogue-rendered.test.js`:
 * MOUNT the real `ComponentsBrowserView` through the shared harness, ship its `innerHTML` into
 * Chromium inside the manager shell it renders in, and read the boxes.
 *
 * ── THE NEGATIVE CONTROL IS IN THE FILE ──────────────────────────────────────────────────
 * A geometry assertion that has never been seen to fail is indistinguishable from one that
 * measures nothing. The second page load re-declares the band's bottom padding as the zero that
 * shipped, and the suite asserts the last row then touches the border again — the exact defect
 * the maintainer photographed, reproduced on every CI execution rather than pasted once.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { before, describe, it } from 'node:test';

import { chromium } from 'playwright';
import { compile } from 'svelte/compiler';

import { createComponentsBrowserViewHarness } from '../helpers/componentScopeMountModules.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const fabricateCss = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');

const { harness, compiledModules } = createComponentsBrowserViewHarness({
  repoRoot,
  tmpPrefix: 'fabricate-components-toolbar-rendered-',
});

// Wide enough that `.manager-body` keeps its columns: the sheet stacks the list over the
// inspector at or below 1120px of container width, and a stacked toolbar is not the one the
// maintainer measured.
const HOST_WIDTH_PX = 1280;
const HOST_HEIGHT_PX = 720;
// Anti-vacuity: an unstyled toolbar is a few pixels tall. The reference's band holds a 38px
// control row and a second row under it.
const MIN_TOOLBAR_HEIGHT_PX = 70;
// Anti-vacuity for the scoped-CSS collector; the view's tree compiles to well over this.
const MIN_SCOPED_BLOCKS = 6;

/** The shipped zero, re-declared: the exact rule the maintainer's screenshot was taken under. */
const FLUSH_CONTROL = `
  .fabricate-manager .manager-component-toolbar { padding-bottom: 0 !important; }
`;

/**
 * Every scoped `<style>` block in the tree, read off the harness manifest so a component added to
 * the screen cannot arrive styled in the browser and unstyled here.
 *
 * @returns {{css: string, blocks: number}}
 */
function collectScopedCss() {
  const parts = [];
  for (const modulePath of compiledModules) {
    const filename = resolve(repoRoot, modulePath);
    const { css } = compile(readFileSync(filename, 'utf8'), { filename, css: 'external' });
    if (css?.code) parts.push(css.code);
  }
  return { css: parts.join('\n'), blocks: parts.length };
}

/**
 * The view's rendered markup inside the manager shell it ships in: the themed area root carrying
 * the route attribute the `[data-manager-view="components"]` rules read, the body grid, and the
 * rail that occupies its first track.
 *
 * @param {string} productMarkup
 * @param {string} scopedCss
 * @param {string} control an extra rule set; `''` for the honest page.
 * @returns {string}
 */
function rulesListPage(productMarkup, scopedCss, control) {
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
        <div class="fabricate fabricate-manager" data-fabricate-theme="dark" data-manager-view="components">
          <div class="manager-body">
            <nav class="manager-rail"></nav>
            ${productMarkup}
          </div>
        </div>
      </div>
    </body></html>`;
}

/**
 * The band, its two rows and the space between and under them, as laid out.
 *
 * `paddingBottom` is read as the computed value so the assertion can say which declaration won,
 * and `spaceBelowLastRow` is the geometric fact a GM sees: the distance from the last row's
 * border-box bottom to the band's own border-box bottom, border included.
 */
function measureToolbar() {
  const toolbar = document.querySelector('[data-component-toolbar]');
  const rows = [...toolbar.querySelectorAll('.manager-component-filter-row')];
  const first = rows[0]?.getBoundingClientRect();
  const last = rows.at(-1)?.getBoundingClientRect();
  const band = toolbar.getBoundingClientRect();
  const style = getComputedStyle(toolbar);
  const probe = document.createElement('span');
  probe.style.padding = 'var(--fab-space-3)';
  toolbar.append(probe);
  const space3 = getComputedStyle(probe).paddingTop;
  probe.remove();
  return {
    rowCount: rows.length,
    bandHeight: band.height,
    paddingBottom: style.paddingBottom,
    borderBottom: parseFloat(style.borderBottomWidth) || 0,
    space3,
    spaceBelowLastRow: last ? band.bottom - last.bottom : null,
    spaceBetweenRows: first && last && rows.length > 1 ? last.top - first.bottom : null,
  };
}

describe('the rules list toolbar’s rendered geometry (issue 1371 r16-list, M22)', () => {
  const rendered = { markup: '', scoped: null };
  let honest = null;
  let flush = null;

  before(async () => {
    rendered.scoped = collectScopedCss();
    await harness.setup();
    try {
      const target = await harness.mount({
        itemCards: [
          { id: 'c1', name: 'Iron Ore', description: 'A lump of ore.', img: 'icons/svg/item-bag.svg', essences: [], salvageSummary: { resultGroupCount: 0 } },
          { id: 'c2', name: 'Copper Ore', description: 'A lump of ore.', img: 'icons/svg/item-bag.svg', essences: [], salvageSummary: { resultGroupCount: 0 } },
        ],
      });
      rendered.markup = target.innerHTML;
    } finally {
      harness.teardown();
    }

    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: HOST_WIDTH_PX, height: HOST_HEIGHT_PX } });
      await page.setContent(rulesListPage(rendered.markup, rendered.scoped.css, ''), { waitUntil: 'load' });
      honest = await page.evaluate(measureToolbar);
      await page.setContent(rulesListPage(rendered.markup, rendered.scoped.css, FLUSH_CONTROL), { waitUntil: 'load' });
      flush = await page.evaluate(measureToolbar);
    } finally {
      await browser.close();
    }
  });

  it('lays the toolbar out at its real height with both rows, so the measurement is of the product', () => {
    assert.ok(rendered.markup.length > 0, 'the view rendered nothing at all');
    assert.ok(
      rendered.scoped.blocks >= MIN_SCOPED_BLOCKS,
      `only ${rendered.scoped.blocks} scoped style blocks were collected (expected at least ${MIN_SCOPED_BLOCKS})`
    );
    assert.equal(honest.rowCount, 2, 'the reference draws TWO toolbar rows (gap-list row 103, C3)');
    assert.ok(
      honest.bandHeight >= MIN_TOOLBAR_HEIGHT_PX,
      `the band is ${honest.bandHeight}px tall — the stylesheets did not reach it`
    );
  });

  it('gives the LAST row the same breathing room below it as the rows have between them (M22)', () => {
    // The maintainer's photograph: the second row touching the band's bottom border. The space
    // under it must be the band's own `--fab-space-3` — the catalogue toolbar's value, and the
    // reference's 11px snapped to the 4px scale — and never less than the gap above the row.
    assert.equal(
      honest.paddingBottom,
      honest.space3,
      `the band's bottom padding resolved to ${honest.paddingBottom}, not the spacing scale's --fab-space-3 (${honest.space3})`
    );
    const expected = parseFloat(honest.space3) + honest.borderBottom;
    assert.ok(
      Math.abs(honest.spaceBelowLastRow - expected) < 0.5,
      `the last row sits ${honest.spaceBelowLastRow}px above the band's bottom edge, expected ${expected}px`
    );
    assert.ok(
      honest.spaceBelowLastRow >= honest.spaceBetweenRows,
      `the space below the last row (${honest.spaceBelowLastRow}px) is less than the gap between the rows (${honest.spaceBetweenRows}px)`
    );
  });

  it('CONTROL: with the shipped zero re-declared, the last row touches the border again', () => {
    // Proves the assertion above can fail: the same markup under the rule the defect shipped
    // with must reproduce the defect the maintainer photographed.
    assert.equal(flush.paddingBottom, '0px', 'the control did not override the padding, so it proves nothing');
    assert.ok(
      flush.spaceBelowLastRow <= flush.borderBottom + 0.5,
      `under the control the last row still sits ${flush.spaceBelowLastRow}px above the edge — the measurement cannot see the defect`
    );
  });
});
