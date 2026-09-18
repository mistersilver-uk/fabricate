/** The System Tool Rules LIST screen. */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { scopedComponentCss } from '../helpers/scoped-component-css.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const sheet = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');

/**
 * The components whose appearance lives in their own scoped `<style>` rather than in the
 * global sheet. Their compiled CSS is appended AFTER the layered sheet and their real
 * `svelte-<hash>` classes are stamped onto the fixture, which is the only way a measurement
 * here can be the measurement the product makes.
 */
const SCOPED_COMPONENTS = [
  'src/ui/svelte/components/Chip.svelte',
  'src/ui/svelte/apps/manager/IconFactRow.svelte',
  'src/ui/svelte/apps/manager/EmptyState.svelte',
  'src/ui/svelte/apps/manager/SegmentedControl.svelte',
  'src/ui/svelte/apps/manager/ToolsBrowserView.svelte',
  'src/ui/svelte/apps/manager/tools/ToolBrowserInspector.svelte',
].map((path) => scopedComponentCss(resolve(repoRoot, path)));

/**
 * Stamp every component's real scoping hash onto EVERY element in the fixture.
 * `withScopeHash` adds the hash to elements carrying a named CONTRACT CLASS, which is right
 * for a rule whose key compound is that class — and wrong for every descendant rule, because
 * Svelte compiles `.manager-icon-fact-row strong` to
 * `.manager-icon-fact-row.svelte-x strong:where(.svelte-x)`. `:where()` contributes no
 * specificity but still REQUIRES the match, and a fixture's bare `<strong>` has no class to
 * hang it on. Measured: the fact-row title read 12.16px, which is not that rule's 0.76rem at
 * all — it is the inspector card's own inherited size, arriving through a rule that had
 * silently stopped applying.
 *
 * @param {string} markup
 * @returns {string}
 */
const ALL_HASHES = SCOPED_COMPONENTS.map((component) => component.hashClass).join(' ');

function stamped(markup) {
  return markup.replace(/<([a-z][a-z0-9]*)((?:"[^"]*"|[^>"])*)>/gi, (whole, tag, attributes) => {
    if (/\sclass="/.test(attributes)) {
      return `<${tag}${attributes.replace(/class="([^"]*)"/, `class="$1 ${ALL_HASHES}"`)}>`;
    }
    return `<${tag} class="${ALL_HASHES}"${attributes}>`;
  });
}

/**
 * The document, layered as Foundry layers it.
 *
 * @param {string} body
 * @returns {string}
 */
function documentFor(body) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <style>@layer variables, modules;</style>
    <style id="layered-sheet">@layer modules { ${sheet} }</style>
    <style>${SCOPED_COMPONENTS.map((component) => component.css).join('\n')}</style>
    <style>
      :root { --font-primary: Arial, sans-serif; }
      body { margin: 0; }
      .application { font-size: 14px; }
      /* TRANSITIONS OFF, and this is load-bearing rather than tidy. The manager tool row
         carries a 120ms background transition, so a computed background read in the same
         tick as a hover returns the START value - which made the hover assertion below pass
         against the very defect it exists to report. Measuring the ENDPOINT is the only
         honest reading of a cascade question. */
      *, *::before, *::after { transition: none !important; animation: none !important; }
    </style>
  </head>
  <body class="game">
    <div class="application theme-dark">
      <section class="window-content">${stamped(body)}</section>
    </div>
  </body>
</html>`;
}

/**
 * One list row, at whichever state the caller names.
 *
 * @param {string} probe the probe prefix for this row's elements
 * @param {string} extraClass the row's own state classes
 * @param {string} name the Tool's name
 * @param {boolean} [enabled] whether the row's switch is drawn on
 * @returns {string} the row markup
 */
function row(probe, extraClass, name, enabled = false) {
  return `<article class="manager-tools-row ${extraClass}" data-manager-tool-id="${probe}" data-probe="${probe}">
    <button type="button" class="manager-tools-select-target">
      <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="">
      <span class="manager-tools-library-copy">
        <strong>${name}</strong>
        <small>A tool.</small>
        <span class="manager-tools-library-chips">
          <span class="manager-chip is-neutral is-list manager-tools-breakage-chip" data-probe="${probe}-chip">8% break</span>
          <span class="manager-tools-row-inherit">Inherits world defaults</span>
        </span>
      </span>
    </button>
    <div class="manager-tools-library-actions">
      <span class="manager-tools-row-recipes" data-probe="${probe}-recipes"><strong>1</strong><small>Recipes</small></span>
      <button type="button" class="fabricate-toggle manager-status-toggle manager-tools-enabled-toggle ${enabled ? 'is-on' : 'is-off'}" aria-pressed="${enabled}" aria-label="Enable Tool" data-probe="${probe}-switch"><span class="manager-status-toggle-track" aria-hidden="true" data-probe="${probe}-switch-track"><span class="manager-status-toggle-knob" data-probe="${probe}-switch-knob"></span></span></button>
      <button type="button" class="manager-tools-edit-rules" data-probe="${probe}-edit"><span>Edit rules</span><i class="fas fa-arrow-up-right-from-square"></i></button>
    </div>
  </article>`;
}

const LIST_SCREEN = `
<div class="fabricate fabricate-manager" data-fabricate-theme="dark" data-manager-view="tools">
  <div class="manager-body">
    <!-- THE RAIL IS LOAD-BEARING IN THE FIXTURE, not decoration. The manager body on this route
         is a three-track grid - 210px, then the pane, then 340px - so a two-child body puts the pane
         in the 210px rail track and the inspector in the pane's — every width below is then a
         width no product surface has, and a chip measured there wraps to two lines. -->
    <nav class="manager-rail"></nav>
    <main class="manager-main manager-tools-main" data-tool-library data-probe="pane">
      <div class="manager-tools-main-content" data-probe="toolbar-stack">
        <section class="fabricate-card manager-inspector-card manager-tools-authority-card" data-manager-tools-authority="" data-probe="authority-card">
          <div class="manager-tools-authority-heading">
            <span><i class="fas fa-sliders"></i></span>
            <div class="manager-tools-authority-title">
              <strong data-probe="authority-heading">Breakage mode</strong>
              <span class="manager-chip is-info">World default</span>
            </div>
          </div>
          <div class="manager-tools-authority-segments" role="radiogroup" data-probe="segment-track">
            <label data-probe="segment-resting"><input type="radio" name="a"><span class="manager-tools-authority-option" data-probe="segment-label">World default</span></label>
            <label class="is-selected" data-probe="segment-selected"><input type="radio" name="a" checked><span class="manager-tools-authority-option">Tool-specific</span></label>
            <label><input type="radio" name="a"><span class="manager-tools-authority-option">Check-driven</span></label>
          </div>
        </section>
        <section class="manager-tools-library-card" data-manager-tools-search>
          <section class="fabricate-filter-bar manager-toolbar" aria-label="Which Tools this list shows" data-probe="filter-bar">
            <label class="fabricate-search manager-search"><i class="fas fa-search"></i><input type="search" data-probe="search" placeholder="Search tools"></label>
            <div class="manager-segmented is-compact is-accent" role="radiogroup" data-tool-membership-filter="true">
              <label class="manager-segment is-active" data-tool-membership-option="in"><input type="radio" class="manager-segment-input" name="b" checked><span class="manager-segment-label">In this system</span><span class="manager-segment-count">3</span></label>
              <label class="manager-segment" data-tool-membership-option="all"><input type="radio" class="manager-segment-input" name="b"><span class="manager-segment-label">All world tools</span><span class="manager-segment-count">11</span></label>
            </div>
          </section>
        </section>
        <div class="manager-tools-sort-row" data-manager-tools-sort>
          <span class="manager-tools-sort-label" data-probe="sort-label">Sort by</span>
          <select class="manager-tools-sort-select" data-probe="sort-select"><option>Name</option></select>
          <button type="button" class="manager-tools-sort-direction" data-probe="sort-direction"><i class="fas fa-arrow-down-a-z"></i><span>Asc</span></button>
          <span class="manager-tools-result-summary" data-probe="result-count">3 shown</span>
        </div>
        <section class="manager-tools-library-card" data-manager-tools-browser>
          <div class="manager-tools-library-scroll">
            <div class="manager-tools-library-list" role="list">
              ${row('selected-still', 'is-selected', "Smith's Hammer", true)}
              ${row('selected-hovered', 'is-selected', "Smith's Anvil")}
              ${row('resting', '', 'Bellows')}
              ${row('resting-hovered', '', 'Tongs')}
              ${row('unadopted-selected', 'is-selected is-unadopted', 'Aegis Crucible')}
              ${row('unadopted-resting', 'is-unadopted', 'Star Loom')}
            </div>
          </div>
        </section>
      </div>
    </main>
    <aside class="manager-inspector" data-probe="aside">
      <section class="fabricate-card manager-inspector-card manager-tool-browser-inspector" data-tool-browser-inspector="">
        <p class="manager-kicker manager-tool-inspector-kicker" data-probe="kicker">Selected tool</p>
        <div class="manager-tool-inspector-hero">
          <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="">
          <div><h2>Smith's Hammer</h2><span class="manager-chip is-positive">Enabled here</span></div>
        </div>
        <p class="manager-muted">A hammer.</p>
        <p class="manager-kicker manager-tool-inspector-section-kicker" data-probe="section-kicker">Effective rules here</p>
        <div class="manager-tool-inspector-rules">
          <div class="manager-icon-fact-row is-tiled is-rule" data-tool-inspector-rule="breakage" data-probe="rule-row">
            <i class="fas fa-hourglass-half"></i>
            <span><strong data-probe="rule-title">8% break</strong><small data-probe="rule-subtitle">Tracked per copy</small></span>
          </div>
        </div>
        <p class="manager-kicker manager-tool-inspector-section-kicker">Inheritance</p>
        <div class="manager-tool-inspector-inheritance" data-tool-inspector-inheritance>
          <div class="manager-tool-inspector-inherit-row" data-probe="inherit-row" data-tool-inspector-inherit="breakage">
            <span data-probe="inherit-label">Breakage</span>
            <span class="manager-chip is-info" data-probe="inherit-pill">Inherited</span>
          </div>
        </div>
        <div class="manager-tool-inspector-routes">
          <button type="button" class="fabricate-button manager-button fab-manager-button" data-tool-inspector-edit-world="t1" data-probe="edit-world"><i class="fas fa-globe" data-probe="edit-world-glyph"></i><span>Edit the world Tool</span></button>
        </div>
        <div class="manager-tool-inspector-foot" data-probe="foot">
          <button type="button" class="fabricate-button manager-button fab-manager-button is-primary" data-tool-inspector-edit="t1" data-probe="primary">Edit rules in Smithing</button>
        </div>
      </section>
    </aside>
  </div>
</div>`;

let sharedBrowser;

before(async () => {
  sharedBrowser = await chromium.launch();
});

after(async () => {
  await sharedBrowser.close();
});

/**
 * Render the inspector column at a bounded height and hand back a reader over it.
 *
 * @param {number} sections how many inheritance rows to draw
 * @param {string} footState `member` or `absent`
 * @returns {Promise<{page: import('playwright').Page, close: () => Promise<void>}>}
 */
async function renderColumn(sections, footState) {
  const context = await sharedBrowser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.setContent(documentFor(inspectorColumn(sections, footState)));
  return { page, close: () => context.close() };
}

/**
 * Render the screen once and hand back a reader over it.
 *
 * @returns {Promise<{page: import('playwright').Page, close: () => Promise<void>}>}
 */
async function renderListScreen() {
  const context = await sharedBrowser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.setContent(documentFor(LIST_SCREEN));
  return { page, close: () => context.close() };
}

/** Every probe's computed answer, in one round trip. */
const READ_PROBES = () =>
  Object.fromEntries(
    [...document.querySelectorAll('[data-probe]')].map((element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return [
        element.dataset.probe,
        {
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
          fontWeight: style.fontWeight,
          letterSpacing: style.letterSpacing,
          color: style.color,
          background: style.backgroundColor,
          borderTopWidth: style.borderTopWidth,
          borderTopColor: style.borderTopColor,
          borderRadius: style.borderTopLeftRadius,
          position: style.position,
          display: style.display,
          justifyContent: style.justifyContent,
          gap: style.columnGap,
          rowGap: style.rowGap,
          padding: `${style.paddingTop} ${style.paddingRight} ${style.paddingBottom} ${style.paddingLeft}`,
          minWidth: style.minWidth,
          width: Math.round(box.width),
          height: Math.round(box.height),
          fractionalHeight: box.height,
        },
      ];
    })
  );

/** Resolve design tokens to the colours Chromium computes for them. */
const READ_TOKENS = (names) =>
  Object.fromEntries(
    names.map((token) => {
      const probe = document.createElement('div');
      probe.style.color = `var(${token})`;
      document.querySelector('.fabricate-manager').append(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return [token, value];
    })
  );

/**
 * The inspector column alone, at a bounded height so it genuinely scrolls.
 *
 * @param {number} sections how many inheritance rows to draw
 * @param {string} footState `member` or `absent`
 * @returns {string} the fixture markup
 */
function inspectorColumn(sections, footState) {
  const rows = Array.from(
    { length: sections },
    (unused, index) =>
      `<div class="manager-tool-inspector-inherit-row" data-probe="inherit-${index}">` +
      `<span>Section ${index}</span><span class="manager-chip is-info">Inherited</span></div>`
  ).join('');
  const foot =
    footState === 'member'
      ? `<button type="button" class="fabricate-button manager-button fab-manager-button is-primary" data-tool-inspector-edit="t1" data-probe="cta-member">Edit rules in Smithing</button>`
      : `<button type="button" class="fabricate-button manager-button fab-manager-button is-primary" data-tool-inspector-add="t1" data-probe="cta-absent">Add Mining Pick to Smithing</button>`;
  return `
<div class="fabricate fabricate-manager" data-fabricate-theme="dark" data-manager-view="tools">
  <div class="manager-body" style="display: grid; grid-template-columns: 210px minmax(0, 1fr) 340px; height: 600px">
    <nav class="manager-rail"></nav>
    <main class="manager-main manager-tools-main"></main>
    <aside class="manager-inspector" style="min-height: 0" data-probe="aside">
      <section class="fabricate-card manager-inspector-card manager-tool-browser-inspector" data-tool-browser-inspector="">
        <p class="manager-kicker manager-tool-inspector-kicker">Selected tool</p>
        <div class="manager-tool-inspector-inheritance">${rows}</div>
        <div class="manager-tool-inspector-routes">
          <button type="button" class="fabricate-button manager-button fab-manager-button" data-tool-inspector-edit-world="t1"><span>Edit the world Tool</span></button>
        </div>
        <div class="manager-tool-inspector-foot" data-probe="foot">${foot}</div>
      </section>
    </aside>
  </div>
</div>`;
}

/** Scroll the inspector to its end and report where the pinned band actually lands. */
const READ_PINNED_BAND = () => {
  const aside = document.querySelector('[data-probe="aside"]');
  const foot = document.querySelector('[data-probe="foot"]');
  aside.scrollTop = aside.scrollHeight;
  const asideBox = aside.getBoundingClientRect();
  const footBox = foot.getBoundingClientRect();
  const topmostAt = (above) => {
    const element = document.elementFromPoint(
      asideBox.left + asideBox.width / 2,
      asideBox.bottom - above
    );
    if (!element) return 'none';
    return element.closest('[data-probe="foot"]') ? 'foot' : element.className.split(' ')[0];
  };
  return {
    scrolls: aside.scrollHeight > aside.clientHeight,
    gapBelowBand: Math.round(asideBox.bottom - footBox.bottom),
    bandTopFromAsideTop: Math.round(footBox.top - asideBox.top),
    asideHeight: Math.round(asideBox.height),
    hits: [2, 8, 14].map((above) => topmostAt(above)),
  };
};

test('the Tools browser writes ONE search field, and it is inside the search card', () => {
  // THE FIXTURE ABOVE IS A COPY, AND THIS IS THE DRIFT GUARD BESIDE IT. `LIST_SCREEN` writes
  // two `.manager-tools-library-card` sections and one `.manager-search` by hand, so it goes on
  // measuring the same three rules however the real view is edited. This clause reads the SOURCE.
  const viewPath = 'src/ui/svelte/apps/manager/ToolsBrowserView.svelte';
  const source = readFileSync(resolve(repoRoot, viewPath), 'utf8');
  const styleAt = source.indexOf('<style>');
  const markup = source.slice(0, styleAt === -1 ? source.length : styleAt);

  const fields = [...markup.matchAll(/<ManagerSearchField(?![\w-])/gu)];
  assert.equal(
    fields.length,
    1,
    `ToolsBrowserView renders ${fields.length} \`<ManagerSearchField>\`, not one. Every extra ` +
      'one under a `.manager-tools-library-card` takes the three rewritten Tools-browser rules, ' +
      'which the retired `[data-manager-tools-search]` form would not have reached. Re-decide ' +
      'the rewrite — do not widen it by adding a field.'
  );

  const cards = [...markup.matchAll(/<section class="manager-tools-library-card"([^>]*)>/gu)];
  assert.deepEqual(
    cards.map((match) => match[1].trim()),
    ['data-manager-tools-search', 'data-manager-tools-browser'],
    'the class`s carriers in this view must be exactly the search card and the browser card, in ' +
      'that order. A third carrier is a third container the rewritten rules now reach.'
  );

  const cardAt = cards[0].index;
  const cardEnds = markup.indexOf('</section>', cardAt);
  assert.ok(
    cardEnds > cardAt,
    'the search card`s `</section>` was not found, so the span below is not a span'
  );
  assert.ok(
    fields[0].index > cardAt && fields[0].index < cardEnds,
    'the one `<ManagerSearchField>` must sit INSIDE the `data-manager-tools-search` card. ' +
      'Outside it the attribute form and the class form stop selecting the same field, which is ' +
      'the premise the rewrite was measured on.'
  );
});

test('the Tools browser renders its search and its filter through the shared bar', () => {
  // THE OTHER HALF OF THE CLAUSE ABOVE, and the reason it is source text rather than geometry.
  const viewPath = 'src/ui/svelte/apps/manager/ToolsBrowserView.svelte';
  const source = readFileSync(resolve(repoRoot, viewPath), 'utf8');
  const styleAt = source.indexOf('<style>');
  const markup = source.slice(0, styleAt === -1 ? source.length : styleAt);

  const bars = [...markup.matchAll(/<ManagerToolbar(?![\w-])/gu)];
  assert.equal(bars.length, 1, `ToolsBrowserView renders ${bars.length} filter bars, not one`);

  const cardOpens = '<section class="manager-tools-library-card" data-manager-tools-search>';
  const cardAt = markup.indexOf(cardOpens);
  const cardEnds = markup.indexOf('</section>', cardAt);
  assert.ok(
    cardAt >= 0 && cardEnds > cardAt,
    'the search card was not found, so the span below is not a span'
  );
  assert.ok(
    bars[0].index > cardAt && bars[0].index < cardEnds,
    'the filter bar sits INSIDE the `data-manager-tools-search` card, not in place of it. The ' +
      'card carries `manager-tools-library-card`, which is the class the three search ' +
      'overrides in `styles/fabricate.css` reach the field through.'
  );

  const barEnds = markup.indexOf('</ManagerToolbar>', bars[0].index);
  assert.ok(barEnds > bars[0].index, 'the filter bar closing tag was not found');
  const inBar = (needle) => {
    const at = markup.indexOf(needle, bars[0].index);
    return at > bars[0].index && at < barEnds;
  };
  assert.ok(
    inBar('<ManagerSearchField'),
    'the search field renders inside the filter bar: a browse screen`s search and its filters ' +
      'ARE that band, and a control left outside it is a second bar the recipe does not have'
  );
  assert.ok(
    inBar('dataAttr="data-tool-membership-filter"'),
    'the membership filter renders inside the filter bar for the same reason - it narrows the ' +
      'list below, which is what a filter is. It is addressed by the `<SegmentedControl>` prop ' +
      'that stamps its hook rather than by the retired `manager-tools-membership-filter` class: ' +
      'issue 1515 replaced this view`s hand-rolled radiogroup with the shared primitive, and a ' +
      'class assertion left behind would have gone on passing against the deleted markup`s name'
  );

  // THE SEGMENTED CONTROL IS NOT IN THE BAR.
  const segmentsAt = markup.indexOf('class="manager-tools-authority-segments"');
  assert.ok(segmentsAt >= 0, 'the authority segments were not found, so this proves nothing');
  assert.ok(
    segmentsAt < bars[0].index || segmentsAt > barEnds,
    'the breakage-source segments are a SETTING and stay in their own card; only the search ' +
      'and the membership filter are filters'
  );
});

test('the row enable switch is the shared control rather than a copy of it', async () => {
  // WHY THIS IS MEASURED AND NOT READ. Issue 1515 deleted five `styles/fabricate.css` rules
  // that painted this switch under `.manager-tools-enabled-toggle`, four of them selecting
  // `> span:first-child` and `> span:first-child > span` - which are exactly the track and the
  // knob `StatusToggle` renders, at (0,2,1) and (0,2,2) against the family's (0,2,0). Left in
  // place they would have gone on winning over the primitive's own paint on this one screen,
  // and every source-level gate in the repository would have stayed green: the class is still
  // written, the rules still parse, and the switch still looks like a switch.
  const { page, close } = await renderListScreen();
  try {
    const measured = await page.evaluate(READ_PROBES);
    const tokens = await page.evaluate(READ_TOKENS, [
      '--fab-accent',
      '--fab-surface-raised',
      '--fab-on-accent',
      '--fab-text-subtle',
    ]);

    // The family sizes the button to its content - a 34px track - rather than pinning it to
    // the 36px box the retired copy declared.
    assert.equal(measured['resting-switch'].width, 34, 'the switch is the family box');
    assert.equal(measured['resting-switch'].height, 24, 'and the family rung');

    // `.fabricate-toggle .manager-status-toggle-track` is an `inline-flex`.
    for (const probe of ['resting-switch-track', 'selected-still-switch-track']) {
      assert.equal(measured[probe].display, 'flex', `${probe} is the primitive track box`);
      assert.equal(measured[probe].width, 34, `${probe} is 34px wide`);
      assert.equal(measured[probe].height, 20, `${probe} is 20px tall`);
    }
    for (const probe of ['resting-switch-knob', 'selected-still-switch-knob']) {
      assert.equal(measured[probe].width, 14, `${probe} is the family 14px knob`);
      assert.equal(measured[probe].height, 14, `${probe} is the family 14px knob`);
    }

    // BOTH POSITIONS COME FROM THE FAMILY'S `--fab-toggle-*` CUSTOM PROPERTIES.
    assert.equal(
      measured['selected-still-switch-track'].background,
      tokens['--fab-accent'],
      'the ON track is the accent, through the family track custom property'
    );
    assert.equal(
      measured['selected-still-switch-knob'].background,
      tokens['--fab-on-accent'],
      'and the ON knob is the on-accent ink'
    );
    assert.equal(
      measured['resting-switch-track'].background,
      tokens['--fab-surface-raised'],
      'the OFF track is the raised neutral, not a second copy of it'
    );
    assert.equal(
      measured['resting-switch-knob'].background,
      tokens['--fab-text-subtle'],
      'and the OFF knob is the subtle ink'
    );
  } finally {
    await close();
  }
});

test('the fixture layers the sheet the way Foundry does, or it proves nothing', async () => {
  // THE NON-VACUITY CHECK FOR THIS WHOLE FILE. Every measurement below rests on one claim:
  const { page, close } = await renderListScreen();
  try {
    const layering = await page.evaluate(() => {
      const owned = document.querySelector('#layered-sheet').sheet;
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

test('hovering an already-selected Tool row does not repaint it', async () => {
  const { page, close } = await renderListScreen();
  try {
    await page.hover('[data-probe="selected-hovered"]');
    const hoveredSelected = await page.evaluate(
      () => getComputedStyle(document.querySelector('[data-probe="selected-hovered"]')).backgroundColor
    );
    const stillSelected = await page.evaluate(
      () => getComputedStyle(document.querySelector('[data-probe="selected-still"]')).backgroundColor
    );

    // THE DEFECT. `[data-manager-view='tools'] .manager-tools-row:hover` is (0,4,0) and the
    // selected-row rule is (0,3,1), so hover won and a chosen row lost its accent fill the
    // moment the pointer crossed it. Nothing photographs a hover, so this is the only place
    // it can be reported.
    assert.equal(
      hoveredSelected,
      stillSelected,
      'a selected row keeps its selected fill under the pointer'
    );

    // NON-VACUITY, and it is the half that matters. Deleting the hover rule outright would
    // satisfy the assertion above and silently remove the list's only pointer feedback, so
    // the hover has to still be doing something to an UNSELECTED row.
    await page.hover('[data-probe="resting-hovered"]');
    const [hoveredResting, resting] = await page.evaluate(() => [
      getComputedStyle(document.querySelector('[data-probe="resting-hovered"]')).backgroundColor,
      getComputedStyle(document.querySelector('[data-probe="resting"]')).backgroundColor,
    ]);
    assert.notEqual(
      hoveredResting,
      resting,
      'an unselected row still answers the pointer, so the fix is not a deletion'
    );
  } finally {
    await close();
  }
});

test('a chosen row is filled whether or not this system has adopted it', async () => {
  // THE FIFTH OCCURRENCE OF THIS FILE'S OWN LAYER TRAP (issue 1373). `styles/fabricate.css`
  // is imported at `layer(modules)` and a component's `css: 'injected'` block is UNLAYERED, so
  // an unlayered declaration beats a layered one at ANY specificity. `ToolsBrowserView`'s own
  // block declared `.manager-tools-row.is-unadopted { background: transparent }`, which
  // discarded the sheet's layered `article.is-selected { background: var(--fab-surface-active) }`
  // — and did NOT discard `border-color`, which `.is-unadopted` never declares. A selected
  // unadopted row therefore drew an accent EDGE with no FILL: degraded selection feedback on
  // exactly the row whose selection is the point of the widened cohort.
  const { page, close } = await renderListScreen();
  try {
    const measured = await page.evaluate(READ_PROBES);
    const tokens = await page.evaluate(READ_TOKENS, [
      '--fab-surface-active',
      '--fab-accent-border',
    ]);

    // ALL FOUR COMBINATIONS, so deleting the rule cannot pass for a fix.
    assert.equal(
      measured['selected-still'].background,
      tokens['--fab-surface-active'],
      'the baseline: an adopted chosen row wears the active surface'
    );
    assert.equal(
      measured['unadopted-selected'].background,
      tokens['--fab-surface-active'],
      'THE DEFECT — a chosen row this system has not adopted must wear the same fill. The ' +
        'component declared an UNLAYERED transparent background, which discards the layered ' +
        'selected-row rule in the sheet at any specificity'
    );
    assert.equal(
      measured['unadopted-resting'].background,
      measured['resting'].background,
      'and a RESTING unadopted row is the same fill as a resting adopted one, so the repair ' +
        'is the component ceding the declaration rather than a second override beside it'
    );

    // THE EDGE WAS NEVER THE BROKEN HALF.
    assert.equal(measured['selected-still'].borderTopColor, tokens['--fab-accent-border']);
    assert.equal(measured['unadopted-selected'].borderTopColor, tokens['--fab-accent-border']);
    assert.equal(
      measured['unadopted-resting'].borderTopColor,
      measured['resting'].borderTopColor,
      'a resting row keeps the default edge whether or not it is adopted'
    );

    // AND THE POINTER DOES NOT UNDO IT EITHER. The sheet's hover rule already excludes
    // `.is-selected`, so ceding the fill repairs the hovered state in the same edit — measured
    // rather than argued, because that exclusion is one selector away from being lost.
    await page.hover('[data-probe="unadopted-selected"]');
    assert.equal(
      await page.evaluate(
        () =>
          getComputedStyle(document.querySelector('[data-probe="unadopted-selected"]'))
            .backgroundColor
      ),
      tokens['--fab-surface-active'],
      'a chosen unadopted row keeps its fill under the pointer'
    );

    // AND IT STILL READS AS NOT-ADOPTED.
    const dimmed = await page.evaluate(() =>
      ['unadopted-selected', 'unadopted-resting', 'resting'].map(
        (probe) => getComputedStyle(document.querySelector(`[data-probe="${probe}"]`)).opacity
      )
    );
    assert.deepEqual(
      dimmed,
      ['0.72', '0.72', '1'],
      'both unadopted rows stay visibly unadopted and an adopted row is untouched'
    );
  } finally {
    await close();
  }
});

test('the Tool Rules toolbar renders the design’s own type and geometry', async () => {
  const { page, close } = await renderListScreen();
  try {
    const measured = await page.evaluate(READ_PROBES);

    // `proto:2512` — the search field states its own type. It declared none.
    assert.equal(measured.search.fontSize, '11.5px', 'the search field states the design size');
    assert.equal(measured.search.fontWeight, '500', 'and the design weight');
    // `proto:2510` height 32 → the ladder's nearest surviving rung.
    assert.equal(measured.search.height, 30, 'the search box sits on the control-height ladder');
    assert.equal(measured.search.borderRadius, '8px', 'proto:2510 radius');

    // `proto:2519` — `Sort by` is the kicker treatment in the SUBTLE ink, not the muted one.
    assert.equal(measured['sort-label'].fontSize, '8.5px', 'proto:2519 size');
    assert.equal(measured['sort-label'].fontWeight, '700', 'proto:2519 weight');

    // `proto:2520` / `proto:2521` — both controls are the same height as the search field and
    // read in the SECONDARY ink, one rung down from the muted they had.
    for (const probe of ['sort-select', 'sort-direction']) {
      assert.equal(measured[probe].height, 30, `${probe} sits on the same rung`);
      assert.equal(measured[probe].fontSize, '11.5px', `${probe} reads at the design size`);
    }

    // `proto:2502` — the card's own heading is 12px, not the 0.72rem it inherited.
    assert.equal(measured['authority-heading'].fontSize, '12px', 'proto:2502 heading size');

    // `proto:4864` — a segment is a 32px control (→ rung 30) with a 1px edge in BOTH states,
    // so selecting one does not move the strip by two pixels.
    assert.equal(measured['segment-resting'].height, 30, 'proto:4864 segment height');
    assert.equal(measured['segment-selected'].height, 30, 'a selected segment is the same height');
    assert.equal(measured['segment-resting'].borderTopWidth, '1px', 'proto:4864 transparent edge');
    assert.equal(measured['segment-selected'].borderTopWidth, '1px', 'proto:4864 selected edge');
    assert.equal(measured['segment-label'].fontSize, '10.5px', 'proto:4864 label size');

    // `proto:2536` — the recipes column RESERVES its width.
    assert.equal(measured['selected-still-recipes'].minWidth, '50px', 'proto:2536 min-width');

    // `proto:4872` — the row pill. `Chip.svelte` owns chip geometry.
    assert.equal(measured['selected-still-chip'].fontSize, '9px', 'proto:4872 chip size');
    assert.equal(measured['selected-still-chip'].fontWeight, '600', 'proto:4872 chip weight');
    assert.equal(measured['selected-still-chip'].lineHeight, '14.4px', 'the canonical list line-height is 1.6');
    assert.ok(
      Math.abs(measured['selected-still-chip'].fractionalHeight - 18.4) < 0.1,
      `the canonical list specimen uses 9px × 1.6 + padding + border, measured ${JSON.stringify(measured['selected-still-chip'])}`
    );
  } finally {
    await close();
  }
});

test('the Tool Rules inspector sits one rung above its pane and states the design’s type', async () => {
  const { page, close } = await renderListScreen();
  try {
    const measured = await page.evaluate(READ_PROBES);
    const tokens = await page.evaluate(READ_TOKENS, [
      '--fab-bg-0',
      '--fab-bg-1',
      '--fab-text-subtle',
    ]);
    const resolved = {
      bg0: tokens['--fab-bg-0'],
      bg1: tokens['--fab-bg-1'],
      subtle: tokens['--fab-text-subtle'],
    };

    // `proto:2548` — the aside is `--bg2` over a `--bg1` pane. On our ramp that is
    // `--fab-bg-1` over `--fab-bg-0`; the sheet had painted both the same value, so the
    // column had no edge but its hairline.
    assert.equal(measured.pane.background, resolved.bg0, 'the pane is the base rung');
    assert.equal(measured.aside.background, resolved.bg1, 'the aside is one rung above it');

    // `proto:2550` / `:2556` / `:2566` — every kicker in this panel.
    for (const probe of ['kicker', 'section-kicker']) {
      assert.equal(measured[probe].fontSize, '8.5px', `${probe} is the design size`);
      assert.equal(measured[probe].fontWeight, '700', `${probe} is the design weight`);
      assert.equal(measured[probe].color, resolved.subtle, `${probe} is the subtle ink`);
      assert.notEqual(measured[probe].letterSpacing, 'normal', `${probe} is tracked`);
    }

    // `proto:2559-2562` — the rules inset RECESSES below the aside now that the aside has
    // moved up a rung. It had been painted lighter than its own container.
    assert.equal(measured['rule-row'].background, resolved.bg0, 'proto:2559 inset fill');
    assert.equal(measured['rule-row'].borderRadius, '10px', 'proto:2559 radius');
    assert.equal(measured['rule-title'].fontSize, '11.5px', 'proto:2561 title size');
    assert.equal(measured['rule-title'].fontWeight, '600', 'proto:2561 title weight');
    assert.equal(measured['rule-subtitle'].fontSize, '9.5px', 'proto:2561 subtitle size');
    assert.equal(measured['rule-subtitle'].color, resolved.subtle, 'proto:2561 subtitle ink');

    // `proto:2569-2571` — the inheritance row LEFT-PACKS its pill beside the label. It was
    // `space-between`, which threw the pill to the far edge of the column.
    assert.notEqual(
      measured['inherit-row'].justifyContent,
      'space-between',
      'proto:2569 packs the pill against the label'
    );
    assert.equal(measured['inherit-row'].background, resolved.bg0, 'proto:2569 fill');
    assert.equal(measured['inherit-label'].fontSize, '11.5px', 'proto:2570 label size');

    // `proto:2576` — the world-Tool route is a bordered secondary at the toolbar rung.
    assert.equal(measured['edit-world'].height, 30, 'proto:2576 height, on the ladder');
    assert.equal(measured['edit-world'].borderRadius, '8px', 'proto:2576 radius');
    assert.equal(measured['edit-world'].fontSize, '10.5px', 'proto:2576 label size');
    assert.equal(measured['edit-world-glyph'].fontSize, '9px', 'proto:2576 glyph size');

    // `proto:2578` / `proto:4897` — the primary lives in a pinned band with a top rule.
    assert.equal(measured.foot.position, 'sticky', 'proto:2578 pins the band');
    assert.equal(measured.foot.borderTopWidth, '1px', 'proto:2578 border-top');
    assert.equal(measured.primary.height, 34, 'proto:4897 height, on the ladder');
    assert.equal(measured.primary.borderRadius, '9px', 'proto:4897 radius');
    assert.equal(measured.primary.fontSize, '12px', 'proto:4897 label size');
  } finally {
    await close();
  }
});

test('the pinned inspector band paints flush with the bottom of its column', async () => {
  // S1. `proto:2578` puts the footer OUTSIDE the scroller as a `flex: 0 0 auto` track.
  const { page, close } = await renderColumn(14, 'member');
  try {
    const band = await page.evaluate(READ_PINNED_BAND);

    assert.ok(band.scrolls, 'the fixture must actually overflow, or it asks nothing');
    assert.equal(band.gapBelowBand, 0, 'the band paints flush with the column bottom');
    assert.deepEqual(
      band.hits,
      ['foot', 'foot', 'foot'],
      'nothing renders beneath the band; a hit test at the column bottom finds only the band'
    );
  } finally {
    await close();
  }
});

test('a short inspector leaves the space above the band, not below it', async () => {
  // The other half of `proto:2578`.
  const { page, close } = await renderColumn(1, 'absent');
  try {
    const band = await page.evaluate(READ_PINNED_BAND);

    assert.equal(band.scrolls, false, 'a one-row panel must not overflow, or this proves nothing');
    assert.equal(band.gapBelowBand, 0, 'the band still owns the column bottom');
    assert.ok(
      band.bandTopFromAsideTop > band.asideHeight / 2,
      `the band sits in the lower half of an empty column, not mid-column at ${band.bandTopFromAsideTop}px`
    );
  } finally {
    await close();
  }
});

test('the inspector CTA keeps the reference emphasis split between its two states', async () => {
  // S2. `proto:4897` gives the footer's two states different weights.
  const solid = await renderColumn(1, 'member');
  let member;
  try {
    member = await solid.page.evaluate(() => {
      const style = getComputedStyle(document.querySelector('[data-probe="cta-member"]'));
      return { color: style.color, background: style.backgroundColor };
    });
  } finally {
    await solid.close();
  }

  const { page, close } = await renderColumn(1, 'absent');
  try {
    const measured = await page.evaluate(READ_PROBES);
    const tokens = await page.evaluate(READ_TOKENS, [
      '--fab-success',
      '--fab-success-soft',
      '--fab-success-border',
    ]);
    const absent = measured['cta-absent'];

    assert.equal(absent.color, tokens['--fab-success'], 'proto:4897 non-member ink');
    assert.equal(absent.background, tokens['--fab-success-soft'], 'proto:4897 non-member fill');
    assert.equal(
      absent.borderTopColor,
      tokens['--fab-success-border'],
      'proto:4897 non-member edge'
    );

    // The split itself, asserted as a DIFFERENCE and not only as two absolute values.
    assert.notEqual(absent.background, member.background, 'the two states differ in fill');
    assert.notEqual(absent.color, member.color, 'and in foreground');
    // And the member keeps the ruling's solid green, so this is not a repaint of both.
    assert.equal(member.background, tokens['--fab-success'], 'the member CTA stays a solid slab');
  } finally {
    await close();
  }
});
