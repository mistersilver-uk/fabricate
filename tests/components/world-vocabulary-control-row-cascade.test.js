/* THE `wvocab` CONTROL ROW AND ITS COLLAPSE, ARBITRATED IN A REAL BROWSER (issue 1392). */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { chromium } from 'playwright';

import { scopedComponentCss } from '../helpers/scoped-component-css.js';
import { resolveChromeCache } from '../../scripts/lib/foundryChromeCache.js';
import { buildLabContent } from '../view-lab/world/labContent.js';
import { VIEW_LAB_CASES } from '../../scripts/lib/viewLabCases.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const PAGE_PATH = 'src/ui/svelte/apps/manager/scoped/WorldVocabularyPage.svelte';

/**
 * The harvested core sheet, through the SHIPPED resolver rather than a relative path.
 * The ANCESTOR WALK is for the worktree case specifically. A lane worktree shares ONE harvest
 * with the clone it was created from rather than duplicating a ~90MB tree into every lane, so the
 * cache sits at the clone root while `repoRoot` is the lane. Walking up asks the shipped resolver
 * the same question at each ancestor instead of guessing a depth.
 */
function findChromeCache(startRoot) {
  let current = startRoot;
  for (let depth = 0; depth < 6; depth += 1) {
    const cache = resolveChromeCache(current);
    if (cache) return cache;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

const chrome = findChromeCache(repoRoot);
const CORE_SHEET = chrome ? join(chrome.dir, 'css', 'foundry2.css') : null;

const sheet = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');
const page = scopedComponentCss(resolve(repoRoot, PAGE_PATH));

/* CORE'S OWN SHEET, OR NOTHING. */
const CORE_AVAILABLE = Boolean(CORE_SHEET) && existsSync(CORE_SHEET);
const skip = CORE_AVAILABLE
  ? false
  : 'no harvested Foundry chrome under this repository or its parents; run `npm run view-lab:chrome` to arm this gate';

const KINDS = ['recipeCategories', 'componentCategories', 'componentTags'];

/** The capture case's OWN declared frame, read from the registry rather than restated. */
const CAPTURE_CASE = VIEW_LAB_CASES.find((entry) => entry.id === 'world-vocabulary');

/** What the manager draws ABOVE `.manager-body` in the real app. */
const MEASURED_CHROME = 168;
const CHROME_MARGIN = 24;
const CHROME_ALLOWANCE = MEASURED_CHROME + CHROME_MARGIN;

/** The ROW COUNTS the View Lab fixture actually seeds, per kind — DERIVED from that fixture. */
const LAB_VOCABULARY = buildLabContent().worldVocabulary;
const FIXTURE_ROWS = Object.fromEntries(
  KINDS.map((kind) => [kind, (LAB_VOCABULARY[kind] ?? []).length])
);

/** One panel, with EVERYTHING the primitive draws inside it. */
function panel(kind) {
  const cards = Array.from(
    { length: FIXTURE_ROWS[kind] },
    (_, index) =>
      `<div class="manager-vocabulary-card" data-row="${kind}-${index}">` +
      '<div class="manager-vocabulary-row">' +
      '<span class="manager-vocabulary-icon is-decorative"><i class="fas fa-hashtag"></i></span>' +
      `<div class="manager-vocabulary-main"><strong>Entry ${index}</strong></div>` +
      '<span class="manager-chip">3 references</span>' +
      '<button class="fabricate-icon-button manager-icon-button"><i class="fas fa-trash"></i></button>' +
      '</div></div>'
  ).join('');
  return (
    `<section class="wvocab-panel ${page.hashClass}" data-wvocab-panel="${kind}">` +
    `<header class="wvocab-head ${page.hashClass}">` +
    `<span class="wvocab-head-icon ${page.hashClass}"><i class="fas fa-tags"></i></span>` +
    `<div class="wvocab-head-text ${page.hashClass}">` +
    '<h3 class="manager-checks-card-title">Component categories</h3>' +
    '<p class="manager-subtitle">One per component, offered by every crafting system.</p>' +
    '</div></header>' +
    '<section class="fabricate-filter-bar manager-toolbar manager-scoped-list-toolbar" aria-label="Sort">' +
    `<span class="wvocab-sort-label ${page.hashClass}" id="sort-${kind}">Sort by</span>` +
    `<select data-wvocab-sort="${kind}" aria-labelledby="sort-${kind}">` +
    '<option>Name</option><option>References</option></select>' +
    `<button type="button" class="wvocab-direction ${page.hashClass}" data-wvocab-direction="asc">` +
    '<i class="fas fa-arrow-down-a-z"></i><span>Asc</span></button>' +
    '</section>' +
    '<section class="manager-vocabulary-panel">' +
    // EMPTY, because the page passes `hint={NO_PANEL_HINT}`.
    '<p class="manager-vocabulary-desc manager-muted"></p>' +
    '<form class="manager-vocabulary-form"><div class="manager-vocabulary-form-fields">' +
    '<label class="fabricate-field manager-field"><span class="manager-field-label">Name</span>' +
        // `fab-manager-button` is the primitive's OWN class.
    '<input type="text"></label>' +
    '<button class="fabricate-button manager-button fab-manager-button">Add</button></div></form>' +
    '<div class="manager-vocabulary-search-row">' +
    '<label class="fabricate-search manager-search"><input type="text"></label>' +
    '<span class="manager-chip">3 entries</span></div>' +
    `<div class="manager-vocabulary-list">${cards}</div></section></section>`
  );
}

function document_(managerWidth) {
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    `<style id="core-sheet">${readFileSync(CORE_SHEET, 'utf8')}</style>` +
    `<style id="module-sheet">@layer modules { ${sheet} }</style>` +
    `<style id="page-scoped">${page.css}</style>` +
    '<style>html, body { margin: 0; padding: 0; }' +
    `#manager { width: ${managerWidth}px; height: ${CAPTURE_CASE.position.height}px; }</style></head><body>` +
    '<div class="fabricate fabricate-manager" id="manager" data-fabricate-theme="dark" ' +
    'data-manager-view="world-vocabulary">' +
    // THE CHROME BAND, AT ITS MEASURED HEIGHT. The real manager draws its header and a second
    // `auto` grid row above `.manager-body`; both are stubbed as one box here, at the height the
    // lab measures, so the body this fixture lays out has the same room the product gives it.
    `<div class="manager-header" style="height: ${MEASURED_CHROME}px"></div>` +
    '<div class="manager-body"><div class="manager-rail"></div>' +
    '<main class="manager-main" data-scoped-page="world-vocabulary" aria-label="Tags &amp; Categories">' +
    `<div class="wvocab ${page.hashClass}" data-scoped-vocabulary="world-vocabulary">` +
    `<p class="wvocab-status ${page.hashClass}"></p>` +
    `<div class="wvocab-grid ${page.hashClass}">${panel('recipeCategories')}${panel('componentCategories')}</div>` +
    `${panel('componentTags')}` +
    '</div></main></div></div></body></html>'
  );
}

let browser;

before(async () => {
  if (skip) return;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
});

async function open(managerWidth) {
  const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await tab.setContent(document_(managerWidth));
  return { tab, close: () => tab.close() };
}

test('the fixture layers core, the module sheet and the page the way the product does', { skip }, async () => {
  const { tab, close } = await open(1280);
  try {
    const layering = await tab.evaluate(() => {
      const core = globalThis.document.querySelector('#core-sheet').sheet;
      const owned = globalThis.document.querySelector('#module-sheet').sheet;
      const first = owned.cssRules[0];
      return {
        coreDeclaresOrder: core.cssRules[0]?.constructor?.name ?? 'none',
        moduleKind: first?.constructor?.name ?? 'none',
        moduleRules: first?.cssRules?.length ?? 0,
        // Core's own `select { width: 100% }` must be PRESENT.
        coreSelectWidth: [...core.cssRules].length,
      };
    });
    assert.equal(layering.coreDeclaresOrder, 'CSSLayerStatementRule', 'core declares its layer order');
    assert.equal(layering.moduleKind, 'CSSLayerBlockRule', 'the module sheet is in the module layer');
    assert.ok(layering.moduleRules > 2000, `the module layer holds ${layering.moduleRules} rules`);
    // AND THE DERIVED ROW COUNTS ARE REAL. A lab fixture that lost its vocabulary would give
    // every panel zero rows, and the fold assertion would measure a screen with no content in it.
    for (const kind of KINDS) {
      assert.ok(FIXTURE_ROWS[kind] > 0, `the lab fixture seeds no ${kind}, so the fold is untested`);
    }
    assert.ok(layering.coreSelectWidth > 10, 'core’s sheet parsed');

    // THE ANTI-VACUITY ANCHOR FOR THE WHOLE FILE. If the page's scoped CSS did not reach the
    // fixture, every width assertion below would be measuring an unstyled box and would pass on
    // a tree with none of these rules in it.
    const panelFill = await tab.evaluate(
      () =>
        globalThis.getComputedStyle(
          globalThis.document.querySelector('[data-wvocab-panel="componentCategories"]')
        ).backgroundColor
    );
    assert.notEqual(panelFill, 'rgba(0, 0, 0, 0)', 'the panel wears its card, so the page CSS is live');
  } finally {
    await close();
  }
});

test('every sort select is a control rather than a full-width bar, on a COLD open', { skip }, async () => {
  const { tab, close } = await open(1280);
  try {
    const widths = await tab.evaluate((kinds) =>
      kinds.map((kind) => ({
        kind,
        width: globalThis.document
          .querySelector(`[data-wvocab-sort="${kind}"]`)
          .getBoundingClientRect().width,
      })), KINDS
    );
    for (const { kind, width } of widths) {
      assert.ok(
        width < 200,
        `${kind}'s sort select is ${Math.round(width)}px. Core sizes a bare <select> to 100% of ` +
          'its flex line and the module sheet declares no width, so without this page’s own ' +
          'repair the control fills the row and wraps it onto three lines'
      );
    }
  } finally {
    await close();
  }
});

test('the sort select keeps its whole shipped skin after the toolbar rules narrow', { skip }, async () => {
  // ── THE NUMERIC HALF OF A DOES-NOT-MOVE CLAIM (issue 1504) ─────────────────────────────
  // Issue 1504 converts the scoped-catalogue toolbar's lane filter and sort key to shared
  // `<Select>`s, which strands the two sheet rules that painted a `.manager-scoped-list-toolbar
  // select`. They are NARROWED onto this route rather than deleted, because THIS page still
  // renders a native `<select data-wvocab-sort>` and takes its entire skin from them — its own
  // scoped block repairs width only.
  const { tab, close } = await open(1280);
  try {
    const measured = await tab.evaluate((kinds) => {
      const selects = kinds.map((kind) => {
        const element = globalThis.document.querySelector(`[data-wvocab-sort="${kind}"]`);
        const style = globalThis.getComputedStyle(element);
        return {
          kind,
          height: element.getBoundingClientRect().height,
          radius: style.borderTopLeftRadius,
          background: style.backgroundColor,
          fontSize: style.fontSize,
        };
      });
      // The token is read from a probe inserted BESIDE the select rather than at the body.
      const host = globalThis.document.querySelector(`[data-wvocab-sort="${kinds[0]}"]`)
        .parentElement;
      const probe = globalThis.document.createElement('div');
      probe.style.background = 'var(--fab-bg-0)';
      host.append(probe);
      const expectedFill = globalThis.getComputedStyle(probe).backgroundColor;
      probe.remove();
      return { expectedFill, selects };
    }, KINDS);

    for (const select of measured.selects) {
      assert.ok(
        Math.abs(select.height - 34) <= 1,
        `${select.kind}'s sort select is ${select.height.toFixed(1)}px tall against the ` +
          'documented 34px control line — the narrowed geometry rule is what supplies it, and ' +
          'core gives a bare select its own height'
      );
      assert.equal(
        select.radius,
        '9px',
        `${select.kind}: the row's 9px corner, from the same narrowed rule`
      );
      // AND THE FILL IS THIS PAGE'S OWN, WHICH IS WORTH MEASURING FOR THE OPPOSITE REASON.
      assert.equal(
        select.background,
        measured.expectedFill,
        `${select.kind}: the page's own --fab-bg-0 override, one rung below its panel, rather ` +
          'than the --fab-bg-1 the narrowed sheet rule declares beneath it'
      );
      assert.equal(
        select.fontSize,
        '11.52px',
        `${select.kind}: the manager control-font scale, from the narrowed TYPE rule — which is ` +
          'the half that must keep a .fabricate-manager compound in every member of its list'
      );
    }
  } finally {
    await close();
  }
});

test('every control row stays one line high, flattened rather than a lit band', { skip }, async () => {
  const { tab, close } = await open(1280);
  try {
    const heights = await tab.evaluate(() =>
      [...globalThis.document.querySelectorAll('.manager-scoped-list-toolbar')].map(
        (bar) => bar.getBoundingClientRect().height
      )
    );
    assert.equal(heights.length, 3, 'one control row per panel');
    for (const height of heights) {
      assert.ok(
        height < 60,
        `a control row is ${Math.round(height)}px tall. One line of 34px controls with no bar ` +
          'padding is about 34; anything near 100 is the row wrapped onto three lines'
      );
    }
  } finally {
    await close();
  }
});

test('the EMPTY status region takes no height at all', { skip }, async () => {
  // ── WHY THIS NEEDS THE BROWSER AND THE CORE SHEET ──────────────────────────────────────
  // The live region is rendered at MOUNT and filled later, because a region inserted together
  // with its content is not reliably announced. That only costs nothing if the empty element is
  // genuinely zero-height — and Foundry core declares `p:empty { min-height: 1rem }`, which a
  // `height: 0` does not beat: `min-height` clamps the USED height upwards whatever `height`
  // says. Measured before the repair, this box was 16px tall, so the page carried a dead strip
  // above its first panel and the reclaim it was credited with never landed.
  const { tab, close } = await open(CAPTURE_CASE.position.width);
  try {
    const measured = await tab.evaluate(() => {
      const region = globalThis.document.querySelector('.wvocab-status');
      return {
        found: Boolean(region),
        empty: region ? region.textContent.trim() === '' : false,
        height: region ? region.getBoundingClientRect().height : -1,
      };
    });
    // NON-VACUITY: a selector that stopped matching would report height 0 and pass.
    assert.ok(measured.found, 'the status region renders at mount, before it has anything to say');
    assert.ok(measured.empty, 'and it is the EMPTY state this clause is about');
    assert.equal(
      measured.height,
      0,
      `the empty live region is ${measured.height}px tall. Core's \`p:empty { min-height: 1rem }\` ` +
        'clamps the used height above a `height: 0`, so the region has to opt out of the ' +
        'min-height as well — otherwise it is a dead strip above the first panel'
    );
  } finally {
    await close();
  }
});

test('the category grid collapses to ONE track below the manager’s 1120px rung', { skip }, async () => {
  const wide = await open(1280);
  try {
    const tracks = await wide.tab.evaluate(
      () =>
        globalThis.getComputedStyle(globalThis.document.querySelector('.wvocab-grid'))
          .gridTemplateColumns
    );
    // The positive control: at 1280 it is genuinely TWO tracks.
    assert.equal(tracks.split(' ').length, 2, `expected two tracks above the rung, got "${tracks}"`);
  } finally {
    await wide.close();
  }

  const narrow = await open(998);
  try {
    const measured = await narrow.tab.evaluate(() => {
      const main = globalThis.document.querySelector('.manager-main');
      return {
        tracks: globalThis.getComputedStyle(globalThis.document.querySelector('.wvocab-grid'))
          .gridTemplateColumns,
        overflow: main.scrollWidth - main.clientWidth,
      };
    });
    assert.equal(
      measured.tracks.split(' ').length,
      1,
      `expected one track below the rung, got "${measured.tracks}"`
    );
    // AND THE OVERFLOW IS THE REASON THE COLLAPSE EXISTS. `.manager-main` keeps
    // `overflow-x: hidden` on this route, so a column narrower than the primitive's 340px row
    // track CLIPS rather than scrolling — and what it clips first is each row's trailing delete
    // control. A hidden box is still a scroll container, so this reads the real overflow.
    assert.equal(
      measured.overflow,
      0,
      `the released body overflows by ${measured.overflow}px, which it CLIPS rather than scrolls`
    );
  } finally {
    await narrow.close();
  }
});

test('all three panels’ first rows fit inside the frame the capture case declares', { skip }, async () => {
  assert.ok(CAPTURE_CASE, 'the registry still carries a `world-vocabulary` case');
  const { tab, close } = await open(CAPTURE_CASE.position.width);
  try {
    const bottoms = await tab.evaluate((kinds) => {
      const body = globalThis.document.querySelector('.manager-body').getBoundingClientRect().top;
      return kinds.map((kind) => {
        const panel = globalThis.document.querySelector(`[data-wvocab-panel="${kind}"]`);
        const first = panel.querySelector(`[data-row="${kind}-0"]`);
        return { kind, bottom: first.getBoundingClientRect().bottom - body };
      });
    }, KINDS);

    // NON-VACUITY: the three panels must be at DIFFERENT depths.
    assert.equal(
      new Set(bottoms.map((entry) => Math.round(entry.bottom))).size,
      2,
      `expected the 2-up grid and the band beneath it, got ${JSON.stringify(bottoms)}`
    );

    const budget = CAPTURE_CASE.position.height - CHROME_ALLOWANCE;
    for (const { kind, bottom } of bottoms) {
      assert.ok(
        bottom <= budget,
        `${kind}'s first row ends ${Math.round(bottom)}px into the body, past the ` +
          `${budget}px this case's ${CAPTURE_CASE.position.height}px frame leaves for it. The ` +
          'published frame would cut through the row the fixture exists to show.'
      );
    }
  } finally {
    await close();
  }
});
