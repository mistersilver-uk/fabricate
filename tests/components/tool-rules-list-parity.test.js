/**
 * The System Tool Rules LIST screen, measured in a real browser against the design's own
 * declarations (issue 1373).
 *
 * ── WHY A BROWSER, AND WHY A SEPARATE FILE ───────────────────────────────────────────────
 * Every finding this file pins is a CASCADE question or a COMPUTED TYPE question, and neither
 * is answerable from source text. happy-dom does not compute a cascade at all, and the two
 * hazards that produced the defects here are precisely cascade hazards:
 *
 *   1. A `:hover` rule that OUT-SPECIFIES the selected-row rule repaints a chosen row on
 *      pointer-over. Nothing photographs it, no mounted test can see it, and the sheet reads
 *      as though both states are declared.
 *   2. `styles/fabricate.css` is imported at `layer(modules)` while a component's
 *      `css: 'injected'` block is UNLAYERED, so an unlayered declaration beats a layered one
 *      at ANY specificity. A route-scoped rule written in the global sheet against a shared
 *      primitive's own markup therefore compiles, lints, reads correctly and does nothing.
 *
 * So the fixture reproduces the real layering — `@layer modules { <the sheet> }` followed by
 * the components' unlayered scoped blocks, exactly as `tests/view-lab/cascade.css` mirrors
 * Foundry's own view — and stamps the real `svelte-<hash>` classes so specificity matches too.
 * A gate that got either half wrong would prove the wrong winner.
 *
 * ── WHY NOT IN `manager-layout.test.js` ──────────────────────────────────────────────────
 * That file is the repo's general computed-CSS harness and is over ten thousand lines shared
 * by every manager surface. These assertions are one screen's parity contract against one
 * artefact, they arrive as a block, and they are the block a future parity pass on this screen
 * has to re-read. Keeping them together also keeps their fixture together: one page builds the
 * whole toolbar, list and inspector, so a change that moves a row's height cannot pass here by
 * being measured in a fixture that no longer resembles the screen.
 *
 * ── THE VALUES ARE THE DESIGN'S, WITH ONE STATED SUBSTITUTION ────────────────────────────
 * Every figure below carries the `proto:NNNN` line of `tmp/GM Component Catalogue
 * (standalone).html`'s embedded markup it was read off (JSON.parse of line 390). The one
 * systematic departure is CONTROL HEIGHT: `openspec/specs/design-system/spec.md` retires 32,
 * 36 and 40 from the ladder, and `control-height-ladder.test.js` gates that. The design states
 * 32 for every toolbar control on this screen and 36 for the inspector's primary, so each is
 * taken to the nearest surviving rung — 30 and 34 — which preserves the design's own 4px
 * relationship between the two while staying on the published ladder.
 */
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
  'src/ui/svelte/apps/manager/Chip.svelte',
  'src/ui/svelte/apps/manager/IconFactRow.svelte',
  'src/ui/svelte/apps/manager/EmptyState.svelte',
  'src/ui/svelte/apps/manager/ToolsBrowserView.svelte',
  'src/ui/svelte/apps/manager/tools/ToolBrowserInspector.svelte',
].map((path) => scopedComponentCss(resolve(repoRoot, path)));

/**
 * Stamp every component's real scoping hash onto EVERY element in the fixture.
 *
 * Without a hash the scoped rules match nothing and every measurement below reads the global
 * sheet alone — which is the state these primitives were extracted OUT of, so the gate would
 * report the geometry the screen had two releases ago and call it green.
 *
 * IT IS A BLANKET STAMP, and that is the correction that made this file report the truth.
 * `withScopeHash` adds the hash to elements carrying a named CONTRACT CLASS, which is right
 * for a rule whose key compound is that class — and wrong for every descendant rule, because
 * Svelte compiles `.manager-icon-fact-row strong` to
 * `.manager-icon-fact-row.svelte-x strong:where(.svelte-x)`. `:where()` contributes no
 * specificity but still REQUIRES the match, and a fixture's bare `<strong>` has no class to
 * hang it on. Measured: the fact-row title read 12.16px, which is not that rule's 0.76rem at
 * all — it is the inspector card's own inherited size, arriving through a rule that had
 * silently stopped applying.
 *
 * A foreign component's hash on an element is inert: no selector in any of these blocks keys
 * on a hash alone, so every rule still needs its own contract class and its own ancestors to
 * match. What the blanket stamp removes is the fixture's ability to withhold a match that the
 * product would make.
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
 * `@layer modules { … }` around the sheet is not decoration: an unlayered component block
 * beats a layered sheet rule at any specificity, and half the findings this file pins are
 * about which of the two owns a declaration. Flattening the layer here would let a global
 * rule "win" in the gate and lose in the product.
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

/** One list row, at whichever state the caller names. */
function row(probe, extraClass, name) {
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
        <section class="manager-inspector-card manager-tools-authority-card" data-manager-tools-authority="" data-probe="authority-card">
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
          <label class="manager-search"><i class="fas fa-search"></i><input type="search" data-probe="search" placeholder="Search tools"></label>
          <div class="manager-tools-membership-filter" role="radiogroup" data-tool-membership-filter="in">
            <label class="is-selected"><input type="radio" name="b" checked><span>In this system (3)</span></label>
            <label><input type="radio" name="b"><span>All world tools (11)</span></label>
          </div>
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
              ${row('selected-still', 'is-selected', "Smith's Hammer")}
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
      <section class="manager-inspector-card manager-tool-browser-inspector" data-tool-browser-inspector="">
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
          <button type="button" class="manager-button fab-manager-button" data-tool-inspector-edit-world="t1" data-probe="edit-world"><i class="fas fa-globe" data-probe="edit-world-glyph"></i><span>Edit the world Tool</span></button>
        </div>
        <div class="manager-tool-inspector-foot" data-probe="foot">
          <button type="button" class="manager-button fab-manager-button is-primary" data-tool-inspector-edit="t1" data-probe="primary">Edit rules in Smithing</button>
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
          fontWeight: style.fontWeight,
          letterSpacing: style.letterSpacing,
          color: style.color,
          background: style.backgroundColor,
          borderTopWidth: style.borderTopWidth,
          borderTopColor: style.borderTopColor,
          borderRadius: style.borderTopLeftRadius,
          position: style.position,
          justifyContent: style.justifyContent,
          gap: style.columnGap,
          rowGap: style.rowGap,
          padding: `${style.paddingTop} ${style.paddingRight} ${style.paddingBottom} ${style.paddingLeft}`,
          minWidth: style.minWidth,
          width: Math.round(box.width),
          height: Math.round(box.height),
        },
      ];
    })
  );

/**
 * Resolve design tokens to the colours Chromium computes for them, so an assertion names the
 * TOKEN rather than freezing one theme's literal into a test — seven themes redefine these
 * ramps, and `theme-colour-contract.test.js` exists because a frozen literal is six wrong
 * colours.
 *
 * A `color` probe rather than `background-color`, because an unset background computes to
 * `rgba(0, 0, 0, 0)` and would silently compare equal to a rule that never applied.
 */
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
 * THE HEIGHT IS EXPLICIT AND THE LIST FIXTURE'S IS NOT, deliberately. In the product the body
 * grid takes its row height from the manager shell, which this file does not build; without a
 * bound the aside simply grows and its scroll height equals its client height, so a sticky band
 * is never asked the question this fixture exists to ask. Measured on the first attempt: the
 * aside came out 763px tall inside a 720px viewport, never scrolled, and the band's offset
 * defect still reproduced - but from its natural flow position rather than its stuck one, which
 * is a different question with the same answer and no way to tell them apart.
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
      ? `<button type="button" class="manager-button fab-manager-button is-primary" data-tool-inspector-edit="t1" data-probe="cta-member">Edit rules in Smithing</button>`
      : `<button type="button" class="manager-button fab-manager-button is-primary" data-tool-inspector-add="t1" data-probe="cta-absent">Add Mining Pick to Smithing</button>`;
  return `
<div class="fabricate fabricate-manager" data-fabricate-theme="dark" data-manager-view="tools">
  <div class="manager-body" style="display: grid; grid-template-columns: 210px minmax(0, 1fr) 340px; height: 600px">
    <nav class="manager-rail"></nav>
    <main class="manager-main manager-tools-main"></main>
    <aside class="manager-inspector" style="min-height: 0" data-probe="aside">
      <section class="manager-inspector-card manager-tool-browser-inspector" data-tool-browser-inspector="">
        <p class="manager-kicker manager-tool-inspector-kicker">Selected tool</p>
        <div class="manager-tool-inspector-inheritance">${rows}</div>
        <div class="manager-tool-inspector-routes">
          <button type="button" class="manager-button fab-manager-button" data-tool-inspector-edit-world="t1"><span>Edit the world Tool</span></button>
        </div>
        <div class="manager-tool-inspector-foot" data-probe="foot">${foot}</div>
      </section>
    </aside>
  </div>
</div>`;
}

/**
 * Scroll the inspector to its end and report where the pinned band actually lands.
 *
 * IT READS THE PAINTED EDGE AND A HIT TEST, not the sticky constraint. A band whose margin box
 * is pinned correctly can still paint short of the column's bottom edge - which is exactly the
 * defect this measures - so geometry alone would not settle it, and `elementFromPoint` a few
 * pixels above the aside's own bottom names whatever is really on top there.
 */
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

test('the fixture layers the sheet the way Foundry does, or it proves nothing', async () => {
  // THE NON-VACUITY CHECK FOR THIS WHOLE FILE. Every measurement below rests on one claim:
  // `styles/fabricate.css` is a module sheet with no explicit layer, so Foundry imports it at
  // layer `modules`, while a component's `css: 'injected'` block lands UNLAYERED and therefore
  // beats it at any specificity. `tests/view-lab/cascade.css` is the reference that states it.
  //
  // Flatten that layer in the fixture and nothing here fails: the component CSS is appended
  // after the sheet, so it usually still wins on source order, and the file goes on reporting
  // green while having stopped modelling the product. Worse, it would then report a global
  // rule as WINNING against a primitive's scoped block, which is exactly the silent failure
  // this arrangement exists to catch - a sibling lane shipped one such rule, measured it green
  // in a flat harness, and it did nothing in the View Lab.
  //
  // So the layer is asserted structurally: the sheet's own style element must hold exactly one
  // top-level rule, that rule must be a layer block, and it must contain the whole sheet.
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
      () =>
        getComputedStyle(document.querySelector('[data-probe="selected-hovered"]')).backgroundColor
    );
    const stillSelected = await page.evaluate(
      () =>
        getComputedStyle(document.querySelector('[data-probe="selected-still"]')).backgroundColor
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
  //
  // It predates the widening, and was unreachable while the cohort's zero point hid every
  // ghost row — so it is a pre-existing defect that repair newly surfaces.
  //
  // THE FIX IS THE COMPONENT NOT DECLARING `background` AT ALL, so the sheet arbitrates both
  // states in one layer. A more specific unlayered override is how this file accumulated the
  // other four, and this case is written so that one would still fail: it asserts the resting
  // unadopted row is the same fill as the resting ADOPTED row, which a hand-written
  // `.is-unadopted.is-selected` rule would have to restate a second time to satisfy.
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

    // THE EDGE WAS NEVER THE BROKEN HALF, and asserting it is what names the asymmetry that
    // made this hard to see: the accent border arrived on a row with no fill at all.
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

    // AND IT STILL READS AS NOT-ADOPTED, which is the whole reason the rule existed. `opacity`
    // carries that on its own, so the fill can be ceded to the sheet without the row losing the
    // one thing it was saying.
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

    // `proto:2512` — the search field states its own type. It declared none, so it inherited
    // Foundry's 14px `.application` base, which is the trap `styles/fabricate.css:6149` names
    // for the Component Studio and repairs only for that route.
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

    // `proto:2536` — the recipes column RESERVES its width, so a `1` and a `12` do not give
    // two column widths and the buttons down the list line up.
    assert.equal(measured['selected-still-recipes'].minWidth, '50px', 'proto:2536 min-width');

    // `proto:4872` — the row pill. `Chip.svelte` owns chip geometry, so this is a density
    // variant on the primitive rather than a caller override; see its docblock.
    assert.equal(measured['selected-still-chip'].fontSize, '9px', 'proto:4872 chip size');
    assert.equal(measured['selected-still-chip'].fontWeight, '600', 'proto:4872 chip weight');
    assert.ok(
      measured['selected-still-chip'].height <= 16,
      `proto:4872 draws a ~15px pill, measured ${JSON.stringify(measured['selected-still-chip'])}`
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

    // `proto:2578` / `proto:4897` — the primary lives in a pinned band with a top rule, and
    // it is the design's 36px control taken to the ladder's 34.
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
  // S1. `proto:2578` puts the footer OUTSIDE the scroller as a `flex: 0 0 auto` track, so the
  // design's band owns the column's bottom edge outright. Ours is sticky inside the scroller - a
  // deliberate departure, because the aside is a single scrolling element and turning it into a
  // two-track column would re-home its overflow, its inset and the no-selection empty state that
  // shares it. A departure is only honest if the rendered result is the same.
  //
  // IT WAS NOT. The band carries a negative bottom margin so its border box can reach past the
  // aside's own inset, and a sticky element is pinned by its MARGIN box rather than its border
  // box - so a negative bottom margin displaces the pinned edge upward by its own magnitude and
  // the painted edge lands that far short. It does not cancel itself. Measured in this fixture:
  // 16px of scrolled inheritance row rendering below the band, inside the aside.
  //
  // The remedy is the matching sticky inset, which moves the constraint edge down by the same
  // amount. Dropping the negative margin and keeping the inset is NOT equivalent, and the
  // short-panel case below is what rejects it: with no negative margin the band cannot reach
  // past its containing block's content edge at all, so a short panel goes straight back to
  // leaving a strip of aside beneath it. Both were measured; only this pair is flush in both.
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
  // The other half of `proto:2578`, and the half a sticky offset can get wrong in the opposite
  // direction. The design's footer is a flex track, so a short panel simply leaves empty column
  // between the last card and the band - `tmp/proto/tool-rules.png` shows a tall gap above the
  // non-member CTA. `margin-top: auto` is what reproduces that here, and it has to keep doing so
  // once the sticky inset is negative: an offset that pushed the band clear of its containing
  // block would float it, and a panel with nothing to scroll is where that would show.
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
  // S2. `proto:4897` gives the footer's two states different weights: a member gets a SOLID fill
  // with reversed text, and a Tool this system has no rules for gets a soft tint carrying the
  // same hue as its foreground. Ours painted both as the identical solid slab, so the one control
  // that changes meaning between the two panels stopped saying so.
  //
  // THE GREEN RULING IS SATISFIED BY THIS RATHER THAN STRAINED BY IT. The maintainer ruled that
  // our primaries hold the success tone where the design uses its accent; the design's NON-member
  // treatment is already green, and its whole success family is byte-identical to ours - same
  // hue, same 16% soft, same 56% border. So the member's solid green stays as the recorded
  // deviation and the non-member takes the design's own value, and nothing moves toward the
  // accent in either state.
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

    // The split itself, asserted as a DIFFERENCE and not only as two absolute values: two rules
    // can each be right about their own state and still be written so that one never applies.
    assert.notEqual(absent.background, member.background, 'the two states differ in fill');
    assert.notEqual(absent.color, member.color, 'and in foreground');
    // And the member keeps the ruling's solid green, so this is not a repaint of both.
    assert.equal(member.background, tokens['--fab-success'], 'the member CTA stays a solid slab');
  } finally {
    await close();
  }
});
