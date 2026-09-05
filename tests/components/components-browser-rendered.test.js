/*
 * THE SYSTEM COMPONENT RULES LIST, RENDERED IN A REAL BROWSER (issue 1371 r16-list, maintainer
 * ruling M22; r18-list, maintainer ruling M28).
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────────────────
 * Both of the defects it measures are CASCADE facts — which declaration a box's edge actually
 * resolves to — and happy-dom computes no layout, so the only place either can be measured is a
 * browser laying out the shipped markup under the shipped stylesheets. This follows
 * `world-component-catalogue-rendered.test.js`: MOUNT the real `ComponentsBrowserView` through the
 * shared harness, ship its `innerHTML` into Chromium inside the manager shell it renders in, and
 * read the boxes.
 * M22: the maintainer's live test found the toolbar card's LAST row — `Select all · GROUP BY
 * CATEGORY · SORT BY · N of M catalogue entries` — sitting flush against the card's bottom border
 * while the gap above it was the toolbar's ordinary row gap. The rule that shipped it said in its
 * own comment that the second row "already carries its own bottom margin"; no rule anywhere gave it
 * one.
 * M28: rows reading `No description` drew their medallion shunted to the middle of the row while
 * rows with a description sat flush. The row's identity is a `<button>`, and Foundry's own chrome
 * centres a button's content — measured on the harvested 14.365 sheet: the identity resolved
 * `justify-content: center` under it and `normal` without it. The module sheet set the button to
 * `display: flex` without saying where its content sits, and the copy column beside the medallion
 * was `flex: 0 1 auto`, so on a short description the pair floated to the centre of whatever
 * width the row left them. The shell here lays a stand-in for that chrome rule BEFORE the module
 * sheet, exactly where Foundry's sits, so the assertion holds under the arrangement the maintainer
 * photographed; where the harvested chrome is on disk the same measurement runs under the real
 * sheet too.
 * ── THE NEGATIVE CONTROLS ARE IN THE FILE ────────────────────────────────────────────────
 * A geometry assertion that has never been seen to fail is indistinguishable from one that
 * measures nothing. Each ruling's second page load re-declares the rule the defect shipped under,
 * and the suite asserts the defect comes back — reproduced on every CI execution rather than
 * pasted once.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { resolveChromeCache } from '../../scripts/lib/foundryChromeCache.js';
import { createComponentsBrowserViewHarness } from '../helpers/componentScopeMountModules.js';
import { collectScopedCss, managerShellPage } from '../helpers/renderedManagerShell.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const fabricateCss = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');

const { harness, compiledModules } = createComponentsBrowserViewHarness({
  repoRoot,
  tmpPrefix: 'fabricate-components-rendered-',
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

/** The shipped zero, re-declared: the exact rule the maintainer's M22 screenshot was taken under. */
const FLUSH_CONTROL = `
  .fabricate-manager .manager-component-toolbar { padding-bottom: 0 !important; }
`;

/**
 * THE CHROME STAND-IN (M28). Foundry's sheet centres a button's content; this is that one fact at
 * element specificity, laid before the module sheet where Foundry's own sits. The module rule that
 * closes M28 has to beat it the way it beats the real one — by declaring the property at all.
 */
const FOUNDRY_BUTTON_CHROME = `
  button { display: inline-flex; align-items: center; justify-content: center; }
`;

/** The M28 fix re-declared away, so the identity floats again under the same chrome. */
const CENTRED_CONTROL = `
  .fabricate-manager .manager-components-list .manager-component-row button.manager-component-identity { justify-content: center !important; }
  .fabricate-manager .manager-components-list .manager-component-row .manager-component-identity .manager-system-copy { flex: 0 1 auto !important; }
`;

/** The harvested Foundry chrome, when a local harvest exists; `''` otherwise (CI runs no harvest). */
function harvestedChromeCss() {
  const cache = resolveChromeCache(repoRoot);
  const sheet = cache ? join(cache.dir, 'css', 'foundry2.css') : '';
  return sheet && existsSync(sheet) ? readFileSync(sheet, 'utf8') : '';
}

function page(productMarkup, scopedCss, { chrome = '', control = '' } = {}) {
  return managerShellPage({
    fabricateCss,
    view: 'components',
    productMarkup,
    scopedCss,
    chrome,
    control,
    hostWidth: HOST_WIDTH_PX,
    hostHeight: HOST_HEIGHT_PX,
  });
}

function card(id, name, description) {
  return {
    id,
    name,
    description,
    img: 'icons/svg/item-bag.svg',
    essences: [],
    salvageSummary: { resultGroupCount: 0 },
  };
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

/**
 * Where each row's medallion sits against the row's leading edge, as laid out.
 *
 * `leadInset` is the fact a GM sees: the distance from the selection box's trailing edge to the
 * medallion's leading edge, which the reference draws as ONE row gap on every row whatever its
 * description says. `identityInset` separates the two ways it can go wrong — the button itself
 * moving, or the button staying put and its content floating inside it.
 */
function measureRows() {
  return [...document.querySelectorAll('.manager-component-row')].map((row) => {
    const box = row.firstElementChild.getBoundingClientRect();
    const identity = row.querySelector('.manager-component-identity');
    const medallion = identity.querySelector('.fab-medallion').getBoundingClientRect();
    return {
      id: row.dataset.componentId,
      description: row.querySelector('.manager-system-description').textContent.trim(),
      gap: parseFloat(getComputedStyle(row).columnGap),
      identityInset: identity.getBoundingClientRect().left - box.right,
      leadInset: medallion.left - box.right,
      justifyContent: getComputedStyle(identity).justifyContent,
    };
  });
}

describe('the rules list toolbar’s rendered geometry (issue 1371 r16-list, M22)', () => {
  const rendered = { markup: '', scoped: null };
  let honest = null;
  let flush = null;

  before(async () => {
    rendered.scoped = collectScopedCss({ repoRoot, compiledModules });
    await harness.setup();
    try {
      const target = await harness.mount({
        itemCards: [card('c1', 'Iron Ore', 'A lump of ore.'), card('c2', 'Copper Ore', 'A lump of ore.')],
      });
      rendered.markup = target.innerHTML;
    } finally {
      harness.teardown();
    }

    const browser = await chromium.launch();
    try {
      const tab = await browser.newPage({ viewport: { width: HOST_WIDTH_PX, height: HOST_HEIGHT_PX } });
      await tab.setContent(page(rendered.markup, rendered.scoped.css), { waitUntil: 'load' });
      honest = await tab.evaluate(measureToolbar);
      await tab.setContent(page(rendered.markup, rendered.scoped.css, { control: FLUSH_CONTROL }), { waitUntil: 'load' });
      flush = await tab.evaluate(measureToolbar);
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

describe('every row’s medallion sits at the leading edge after the box (issue 1371 r18-list, M28)', () => {
  const rendered = { markup: '', scoped: null };
  const chrome = harvestedChromeCss();
  let honest = null;
  let underFoundry = null;
  let centred = null;

  before(async () => {
    rendered.scoped = collectScopedCss({ repoRoot, compiledModules });
    await harness.setup();
    try {
      // ONE ROW WITH NO DESCRIPTION AND ONE WITH A LONG ONE, because the defect only showed on the
      // first: a long description filled the copy column and hid where the content would float.
      const target = await harness.mount({
        itemCards: [
          card('bare', 'Bitterbark', ''),
          card('described', 'Iron Ore', 'A lump of ore dug from the deep seams of the northern mines, heavy and cold to the touch.'),
        ],
      });
      rendered.markup = target.innerHTML;
    } finally {
      harness.teardown();
    }

    const browser = await chromium.launch();
    try {
      const tab = await browser.newPage({ viewport: { width: HOST_WIDTH_PX, height: HOST_HEIGHT_PX } });
      await tab.setContent(page(rendered.markup, rendered.scoped.css, { chrome: FOUNDRY_BUTTON_CHROME }), { waitUntil: 'load' });
      honest = await tab.evaluate(measureRows);
      await tab.setContent(page(rendered.markup, rendered.scoped.css, { chrome: FOUNDRY_BUTTON_CHROME, control: CENTRED_CONTROL }), { waitUntil: 'load' });
      centred = await tab.evaluate(measureRows);
      if (chrome) {
        await tab.setContent(page(rendered.markup, rendered.scoped.css, { chrome }), { waitUntil: 'load' });
        underFoundry = await tab.evaluate(measureRows);
      }
    } finally {
      await browser.close();
    }
  });

  /** The claim, stated once for every arrangement it is made under. */
  function assertFlush(rows, label) {
    assert.equal(rows.length, 2, `${label}: both rows rendered`);
    assert.equal(rows[0].description, 'No description', `${label}: the bare row really reads the fallback`);
    for (const row of rows) {
      assert.ok(
        Math.abs(row.identityInset - row.gap) < 0.5,
        `${label}: row "${row.id}"'s identity starts ${row.identityInset}px after the box, not the row gap (${row.gap}px)`
      );
      assert.ok(
        Math.abs(row.leadInset - row.gap) < 0.5,
        `${label}: row "${row.id}"'s medallion sits ${row.leadInset}px after the box, not the row gap (${row.gap}px) — its content floated inside the identity`
      );
    }
  }

  it('renders the bare row and the described row, and the chrome stand-in really centres a button', () => {
    assert.ok(rendered.markup.length > 0, 'the view rendered nothing at all');
    assert.equal(honest.length, 2);
    // Non-vacuity for the stand-in: the identity's `justify-content` is being ARBITRATED, so a
    // module rule that stopped declaring it would resolve to the chrome's `center` here. The
    // property is read off the shipped row rather than assumed.
    assert.equal(
      centred[0].justifyContent,
      'center',
      'the control did not centre the identity, so the negative half below proves nothing'
    );
  });

  it('draws the medallion one row gap after the box on BOTH rows under a chrome that centres buttons (M28)', () => {
    assertFlush(honest, 'chrome stand-in');
  });

  it('and under the harvested Foundry sheet itself, where a local harvest exists', { skip: !chrome && 'no local Foundry chrome harvest (.foundry-chrome)' }, () => {
    assertFlush(underFoundry, `foundry chrome ${resolveChromeCache(repoRoot)?.version}`);
  });

  it('CONTROL: with the fix re-declared away, the bare row’s medallion floats into the row again', () => {
    // The defect the maintainer photographed: the bare row's content mid-row, the described row's
    // nearer the edge but still adrift, under the same chrome. A measurement that could not see
    // this would pass the arrangement above for nothing.
    const bare = centred.find((row) => row.id === 'bare');
    assert.ok(
      bare.leadInset > bare.gap + 40,
      `under the control the bare row's medallion still sits ${bare.leadInset}px after the box — the measurement cannot see the shunt`
    );
  });
});
