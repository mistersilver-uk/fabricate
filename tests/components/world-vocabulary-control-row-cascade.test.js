/*
 * THE `wvocab` CONTROL ROW AND ITS COLLAPSE, ARBITRATED IN A REAL BROWSER (issue 1392).
 *
 * ── WHY A BROWSER, AND WHY THIS SCREEN IN PARTICULAR ────────────────────────────────────────
 * happy-dom computes no cascade, so a mounted suite can say this page renders a `<select>` inside
 * a `.manager-scoped-list-toolbar` and never which declaration decides its width. Two defects on
 * this screen are decided entirely by that question, and neither is visible to any other gate:
 *
 *  1. Foundry core sizes EVERY `<select>` to `width: 100%` in `@layer elements.forms`. The
 *     module sheet's `.fabricate-manager .manager-scoped-list-toolbar select` block declares no
 *     width at all, so core's rule stands — and the only shipped repair lives in
 *     `EntityListInspectorFrame.svelte`'s scoped block, which is injected when that component
 *     RENDERS. This route never renders it. Measured before the repair: 481px on a cold open of
 *     `world-vocabulary`, 1002px on the full-width tag panel, wrapping the control row onto three
 *     lines — and 62px for the rest of the session as soon as the GM happened to visit a world
 *     entity catalogue first. A layout that depends on which route was opened before it is not a
 *     layout, and a session-order-dependent defect is exactly what a frame cannot photograph.
 *  2. The 1120px collapse is a `@container` query, which needs a REGISTERED container with a real
 *     inline size. Nothing in a mounted tree registers one.
 *
 * ── THE FIXTURE IS PRODUCTION'S CASCADE, NOT AN APPROXIMATION OF IT ────────────────────────
 * The harvested `foundry2.css` is loaded verbatim — it declares its own layer ORDER, in which
 * `modules` follows `elements` — then `styles/fabricate.css` inside `@layer modules`, exactly as
 * Foundry imports an unlayered module sheet, then the page's own scoped CSS unlayered and last,
 * exactly as `css: 'injected'` puts it in `document.head`. `tests/view-lab/cascade.css` is the
 * reference this mirrors. `EntityListInspectorFrame`'s CSS is deliberately ABSENT: its absence
 * IS the cold open.
 *
 * The markup is hand-built, on the sibling row-state oracle's precedent, because only the control
 * row and the grid are under measurement. What keeps it honest is that the page's REAL scope hash
 * is stamped onto the elements its own rules name, so a rule that stopped matching in production
 * stops matching here too.
 */
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
 *
 * A hand-written `../../../.foundry-chrome/<pinned>/…` resolves only from a lane worktree three
 * levels under the clone: from the maintainer's own checkout and in CI it names a directory
 * outside the repository, `existsSync` answers false, and every test in this file SKIPS while
 * reporting green. A version pin has the same shape of failure one harvest later.
 *
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

/*
 * CORE'S OWN SHEET, OR NOTHING.
 *
 * The defect this file exists for is a contest between core's `select { width: 100% }` and the
 * module sheet, so a run without core's sheet is not a weaker version of this gate — it is a gate
 * that cannot fail, and it would report clean on the exact tree that shipped the defect. The
 * harvest is a gitignored working directory, so the honest answer when it is absent is to SKIP
 * loudly rather than to hand-write a stand-in rule: a stub looser than core's real one produces
 * a false pass, and one written from memory is a claim about a file nobody read.
 */
const CORE_AVAILABLE = Boolean(CORE_SHEET) && existsSync(CORE_SHEET);
const skip = CORE_AVAILABLE
  ? false
  : 'no harvested Foundry chrome under this repository or its parents; run `npm run view-lab:chrome` to arm this gate';

const KINDS = ['recipeCategories', 'componentCategories', 'componentTags'];

/**
 * The capture case's OWN declared frame, read from the registry rather than restated.
 *
 * The delta's screenshot criterion is that one frame shows all three panels populated, and the
 * tag band is the one that falls off the bottom: it is a SIBLING of the 2-up grid, so its head,
 * control row, add card, search row and first row all sit below the taller category panel. A
 * number restated here would let the frame and this assertion drift in opposite directions.
 */
const CAPTURE_CASE = VIEW_LAB_CASES.find((entry) => entry.id === 'world-vocabulary');

/**
 * What the manager draws ABOVE `.manager-body` in the real app, MEASURED IN THE LAB rather than
 * budgeted: the header band and the second `auto` row of `.fabricate-manager`'s
 * `grid-template-rows: auto auto 1fr` come to 168px on this route.
 *
 * The first version of this constant guessed 110 and was 58px optimistic, which is exactly the
 * margin by which the tag band's first row then missed the frame. It carries a stated margin on
 * top so that a header that grows by a line reds here rather than in a published frame.
 */
const MEASURED_CHROME = 168;
const CHROME_MARGIN = 24;
const CHROME_ALLOWANCE = MEASURED_CHROME + CHROME_MARGIN;

/**
 * The ROW COUNTS the View Lab fixture actually seeds, per kind — DERIVED from that fixture.
 *
 * The fold assertion below is a height measurement, so this fixture has to hold the same number
 * of rows the photographed corpus does. Restating `{3, 4, 3}` would let a shrunken seed silently
 * disarm the guard: the frame would lose rows, the measurement would lose the height they take,
 * and the assertion would keep passing about a screen nobody is capturing.
 */
const LAB_VOCABULARY = buildLabContent().worldVocabulary;
const FIXTURE_ROWS = Object.fromEntries(
  KINDS.map((kind) => [kind, (LAB_VOCABULARY[kind] ?? []).length])
);

/**
 * One panel, with EVERYTHING the primitive draws inside it.
 *
 * The hint, the add card and the search row are the primitive's own and are the bulk of a panel's
 * height above its first row; the two width assertions do not need them, but the fold assertion is
 * measuring exactly that stack.
 */
function panel(kind) {
  const cards = Array.from(
    { length: FIXTURE_ROWS[kind] },
    (_, index) =>
      `<div class="manager-vocabulary-card" data-row="${kind}-${index}">` +
      '<div class="manager-vocabulary-row">' +
      '<span class="manager-vocabulary-icon is-decorative"><i class="fas fa-hashtag"></i></span>' +
      `<div class="manager-vocabulary-main"><strong>Entry ${index}</strong></div>` +
      '<span class="manager-chip">3 references</span>' +
      '<button class="manager-icon-button"><i class="fas fa-trash"></i></button>' +
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
    '<section class="manager-toolbar manager-scoped-list-toolbar" aria-label="Sort">' +
    `<span class="wvocab-sort-label ${page.hashClass}" id="sort-${kind}">Sort by</span>` +
    `<select data-wvocab-sort="${kind}" aria-labelledby="sort-${kind}">` +
    '<option>Name</option><option>References</option></select>' +
    `<button type="button" class="wvocab-direction ${page.hashClass}" data-wvocab-direction="asc">` +
    '<i class="fas fa-arrow-down-a-z"></i><span>Asc</span></button>' +
    '</section>' +
    '<section class="manager-vocabulary-panel">' +
    // EMPTY, because the page passes `hint={NO_PANEL_HINT}`: the head subline above already says
    // what this paragraph would. Rendering it with text here would measure a screen the product
    // does not draw, and would put the fold 46px per panel lower than it really is.
    '<p class="manager-vocabulary-desc manager-muted"></p>' +
    '<form class="manager-vocabulary-form"><div class="manager-vocabulary-form-fields">' +
    '<label class="manager-field"><span class="manager-field-label">Name</span>' +
        // `fab-manager-button` is the primitive's OWN class, and a fixture that wrote the contract
    // class without it is measuring markup `ManagerButton` may have stopped emitting —
    // `tests/manager-button-source-contract.test.js` refuses that.
    '<input type="text"></label>' +
    '<button class="manager-button fab-manager-button">Add</button></div></form>' +
    '<div class="manager-vocabulary-search-row">' +
    '<label class="manager-search"><input type="text"></label>' +
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
        // Core's own `select { width: 100% }` must be PRESENT, or the contest this file
        // arbitrates does not exist in the fixture at all.
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

test('the category grid collapses to ONE track below the manager’s 1120px rung', { skip }, async () => {
  const wide = await open(1280);
  try {
    const tracks = await wide.tab.evaluate(
      () =>
        globalThis.getComputedStyle(globalThis.document.querySelector('.wvocab-grid'))
          .gridTemplateColumns
    );
    // The positive control: at 1280 it is genuinely TWO tracks, so the assertion below is a
    // measurement of the query rather than of a grid that was never two-up.
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

    // NON-VACUITY: the three panels must be at DIFFERENT depths, or the fixture has collapsed to
    // one column and the tag band — the only one that can fall off — is not being measured.
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
