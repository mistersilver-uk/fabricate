import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { chromium } from 'playwright';
import { FABRICATE_THEME_IDS } from '../../src/ui/theme.js';
import { scopedComponentCss, withScopeHash } from '../helpers/scoped-component-css.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const css = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');
const themeIds = Object.values(FABRICATE_THEME_IDS);

// The bulk edit panels' muted copy is SVELTE-SCOPED, not in the global sheet — `grep -c
// fab-bulk-edit styles/fabricate.css` returns 0. Injecting only `styles/fabricate.css` and
// then adding a `.fab-bulk-edit-*` node to the fixture would match no rule at all: the node
// would inherit `--fab-mv2-text`, score the contrast of a colour this panel never renders,
// and pass no matter what the panel's own declarations said. So this gate reproduces what
// Svelte actually ships, exactly as the font-size gates do — the component's real compiled
// CSS appended AFTER the global sheet (matching `css: 'injected'` ordering in
// svelte.config.js) with the real `svelte-<hash>` class stamped onto the fixture node
// (matching specificity). Both halves are load-bearing; either alone proves nothing.
//
// ── WHAT THESE TWO SAMPLES DO AND DO NOT COVER ───────────────────────────────────────
// Issue 1015 moved EIGHT declarations across three components from `--fab-text-subtle` to
// `--fab-mv2-text-muted`. All eight land on the same token, so what actually varies between
// them is the COLUMN they render on, and that is what is sampled here: one probe per
// distinct backdrop, not one probe per declaration.
//  - `--fab-mv2-surface-1`, the inspector rail's own fill, where the shell's and
//    `BulkEditSection`'s copy renders — sampled through `.fab-bulk-edit-subhint`.
//  - `--fab-mv2-bg`, the Recipe Studio pick card's fill, a DIFFERENT colour inside the same
//    rail — sampled through `.fab-bulk-book-pick-meta`, nested two levels inside the card.
// NEITHER background is restated by this fixture. Both are resolved by walking the probe's
// own ancestors to the first opaque fill, so both come from the rule that actually ships —
// `.manager-inspector` in the global sheet, `.fab-bulk-book-pick` in the component's scoped
// CSS — and changing either moves the number here.
// What remains uncovered is per-DECLARATION drift: a single one of the eight reverting to
// `--fab-text-subtle` while its neighbours stay muted moves no number here. That is the
// deliberate limit of this gate, not an oversight — it is a rendered CONTRAST gate, and
// which token a given rule names is a source-level fact.
const BULK_EDIT_SECTION = scopedComponentCss(
  resolve(repoRoot, 'src/ui/svelte/apps/manager/BulkEditSection.svelte')
);
const RECIPE_BULK_EDIT_PANEL = scopedComponentCss(
  resolve(repoRoot, 'src/ui/svelte/apps/manager/recipes/RecipeBulkEditPanel.svelte')
);
// The player Crafting/Gathering apps and the standalone Recipe Editor were
// removed; the Crafting System Manager is the remaining themed surface. The new
// unified Fabricate shell is an empty placeholder whose focus/contrast styling
// is Svelte-scoped (not in fabricate.css), so it is intentionally not validated
// here yet — re-add it once the shell has real, token-driven content.
const surfaceMatrix = [
  { id: 'manager', widths: [900, 560], height: 560, fixture: managerFixture }
];

function parseColor(value) {
  const match = value.match(/rgba?\(([^)]+)\)/);
  assert.ok(match, `expected computed rgb/rgba colour, got ${value}`);
  // Numeric default, not the string it used to be. `composite` only ever multiplies by it,
  // so a string alpha was invisible there, but `effectiveBackground` COMPARES it — and an
  // `rgb()` triple's implicit alpha has to equal 1, not merely coerce to it.
  const [r, g, b, a = 1] = match[1].split(',').map(part => Number.parseFloat(part.trim()));
  return { r, g, b, a };
}

function composite(foreground, background) {
  const alpha = foreground.a ?? 1;
  return {
    r: foreground.r * alpha + background.r * (1 - alpha),
    g: foreground.g * alpha + background.g * (1 - alpha),
    b: foreground.b * alpha + background.b * (1 - alpha),
    a: 1
  };
}

function luminance({ r, g, b }) {
  const channel = value => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(foreground, background) {
  const fg = luminance(foreground);
  const bg = luminance(background);
  return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
}

function themePage(theme, width, height, body) {
  return `<!doctype html>
    <html data-fabricate-theme="${theme}">
      <head>
        <meta charset="utf-8">
        <style>
          ${css}
          ${BULK_EDIT_SECTION.css}
          ${RECIPE_BULK_EDIT_PANEL.css}
          :root { --font-primary: Arial, sans-serif; }
          body {
            margin: 0;
            background: var(--fab-bg-0);
            color: var(--fab-text);
            font-family: Arial, sans-serif;
          }
          .preview-shell {
            width: ${width}px;
            height: ${height}px;
            padding: 16px;
            overflow: hidden;
          }
          .surface-root {
            width: ${width}px;
            height: ${height}px;
            max-width: ${width}px;
            max-height: ${height}px;
          }
          .preview-title {
            margin: 0;
            font-size: 18px;
            line-height: 1.2;
          }
          .preview-copy {
            margin: 0;
            color: var(--fab-text-muted);
            line-height: 1.35;
          }
          /* NO preview helper stands in for a bulk panel's background. There used to be one
             (.preview-bulk-surface, --fab-mv2-surface-1) because contrastSample jumped
             straight from a sample's own fill to [data-surface-backdrop], so a probe with no
             fill of its own was scored against the manager root's column rather than the
             rail's. inspectRenderedSurface now walks ancestors to the first opaque fill, so
             the sub-hint picks up .manager-inspector's real global-sheet fill and the pick
             card picks up its own shipped rule. Measured identical across all seven themes
             at both widths, with the helper gone: the fixture literal is redundant, and a
             literal that has to be kept in step by hand is the thing this gate exists to
             avoid. (No backticks in here — this whole block is a JS template literal.) */
        </style>
      </head>
      <body>
        <main class="preview-shell">${body}</main>
      </body>
    </html>`;
}

function managerRows() {
  return Array.from({ length: 8 }, (_, index) => `
    <article class="manager-system-row" tabindex="0" data-boundary>
      <div class="manager-system-identity">
        <span class="manager-system-thumb is-empty">${index + 1}</span>
        <div>
          <strong>Very Long Workshop ${index + 1} Name For Localized Layout Validation</strong>
          <p>Recipe, component, essence, and environment management</p>
        </div>
      </div>
      <button type="button" class="manager-status-toggle ${index % 2 ? 'is-off' : 'is-on'}" data-contrast-soft data-boundary>
        <span class="manager-status-toggle-track" aria-hidden="true"><span class="manager-status-toggle-knob"></span></span>
        <span class="manager-status-toggle-label">${index % 2 ? 'Off' : 'On'}</span>
      </button>
      <button type="button" class="manager-button fab-manager-button" data-boundary>Open</button>
    </article>
  `).join('');
}

/*
 * The bulk edit panel's STANDING SENTENCE, rendered on the inspector's own fill — which is
 * `.manager-inspector`'s shipped `--fab-mv2-surface-1` rule in the global sheet, resolved by
 * the ancestor walk rather than restated by the fixture.
 *
 * It carries its OWN `data-contrast-*` hook rather than reusing one: `contrastSample` reads
 * the FIRST node matching a selector (see the note on the armed danger button above), and
 * every existing hook already resolves to a node earlier in this fixture. It deliberately
 * carries NO `data-region` — regions are pairwise-intersected below, and a probe nested
 * inside the inspector region would report as an overlap with its own parent.
 *
 * The `svelte-<hash>` class is stamped by the component's own compiler output, so renaming
 * the scoped class in `BulkEditSection.svelte` unstamps this node rather than leaving it
 * quietly measuring an inherited colour.
 */
function bulkEditSubhint() {
  return withScopeHash(
    '<p class="fab-bulk-edit-subhint" data-contrast-bulk-muted>Applying essences overwrites the essence values on every selected component.</p>',
    'fab-bulk-edit-subhint',
    BULK_EDIT_SECTION.hashClass
  );
}

/*
 * The Recipe Studio pick card's muted meta line — the SECOND column the issue 1015 recolour
 * has to clear. It sits in the same rail as the sub-hint above but on `--fab-mv2-bg`, and
 * six of the seven themes failed AA on it before the recolour, so a gate that sampled only
 * the rail's own fill would have called that pass.
 *
 * The whole card is reproduced rather than just its meta line, because the background under
 * test is `.fab-bulk-book-pick`'s OWN declaration and the meta line declares none. That is
 * only true because `inspectRenderedSurface` WALKS ANCESTORS to the first opaque fill: while
 * it jumped straight to `[data-surface-backdrop]`, the transparent meta line composited to
 * the backdrop unchanged and the card was skipped entirely, so recolouring
 * `.fab-bulk-book-pick` to its own text colour rendered the card unreadable and moved this
 * ratio by nothing. It read right only because `--fab-mv2-bg` happens to compute to the same
 * value as the manager root in all seven themes — a coincidence, unasserted, and the ratio
 * of a card this gate was not actually looking at.
 *
 * Every class here is stamped in one `stampAll` pass off the component's own compiler
 * output, so renaming any of them unstamps the node rather than leaving it measuring an
 * inherited colour on an unstyled box.
 */
function bulkBookPickCard() {
  const markup = `
    <div class="fab-bulk-book-pick">
      <div class="fab-bulk-book-pick-head">
        <span class="fab-bulk-book-pick-art" aria-hidden="true"><i class="fas fa-book"></i></span>
        <span class="fab-bulk-book-pick-copy">
          <strong class="fab-bulk-book-pick-name">Alchemical Primer</strong>
          <span class="fab-bulk-book-pick-meta" data-contrast-bulk-bg-muted>Journal entry - 6 pages</span>
        </span>
      </div>
    </div>`;
  return [
    'fab-bulk-book-pick',
    'fab-bulk-book-pick-head',
    'fab-bulk-book-pick-art',
    'fab-bulk-book-pick-copy',
    'fab-bulk-book-pick-name',
    'fab-bulk-book-pick-meta'
  ].reduce(
    (fixture, className) => withScopeHash(fixture, className, RECIPE_BULK_EDIT_PANEL.hashClass),
    markup
  );
}

function managerFixture(theme, width, height) {
  return themePage(theme, width, height, `
    <section class="fabricate fabricate-manager surface-root" data-fabricate-theme="${theme}" data-manager-view="systems" data-surface-backdrop>
      <header class="manager-header" data-region data-boundary>
        <div class="manager-heading">
          <h1 class="manager-title preview-title" data-contrast-surface>Fabricate Theme Validation Surface With Long Localized Title</h1>
          <p class="manager-subtitle preview-copy">Checks buttons, tags, toggles, text, focus rings, and fixed app-width layout.</p>
        </div>
        <div class="manager-header-actions">
          <button id="focus-target" type="button" class="manager-button fab-manager-button is-primary" data-hit data-contrast-solid data-boundary>Create System</button>
        </div>
      </header>
      <div class="manager-body">
        <nav class="manager-rail" data-region data-boundary>
          <button type="button" class="manager-nav-button is-active" data-boundary>
            <i aria-hidden="true">*</i>
            <span class="manager-nav-label">Crafting Systems With Extra Words</span>
            <span class="manager-nav-count">6</span>
          </button>
          <button type="button" class="manager-nav-button" data-boundary>
            <i aria-hidden="true">*</i>
            <span class="manager-nav-label">Recipes</span>
            <span class="manager-nav-count">12</span>
          </button>
          <button type="button" class="manager-nav-button" data-boundary>
            <i aria-hidden="true">*</i>
            <span class="manager-nav-label">Components</span>
            <span class="manager-nav-count">40</span>
          </button>
        </nav>
        <section class="manager-main" data-region data-boundary>
          <div class="manager-toolbar">
            <input class="manager-search" value="Alchemy and harvesting" aria-label="Search">
            <span class="manager-chip manager-selected-tag-pill" data-contrast-soft data-boundary>Rare ingredient category <button type="button">x</button></span>
            <span class="manager-chip is-warning" data-contrast-soft data-boundary>Warning</span>
          </div>
          <div class="manager-systems-table">${managerRows()}</div>
        </section>
        <aside class="manager-inspector" data-region data-boundary>
          <h2 data-contrast-surface>Palette</h2>
          <p class="manager-empty-copy preview-copy">Shared theme tokens drive every mounted Fabricate surface.</p>
          <button type="button" class="manager-button fab-manager-button is-danger" data-hit data-contrast-solid data-boundary>Delete</button>
          <!-- The armed half of the inline two-step row confirmation (issue 785). It is
               the product's first SOLID fab-danger surface, so it carries its OWN
               contrast probe: contrastSample reads the FIRST node matching a
               selector, and data-contrast-solid already resolves to the primary
               action up in the header, so reusing that hook would never sample this
               node. The fab-on-accent token fails 4.5:1 against fab-danger in
               foundry-native and is marginal in ironblood-forge, which is why
               fab-on-danger exists at all. -->
          <button type="button" class="manager-button is-danger is-armed" data-armed="true" data-contrast-solid-armed data-boundary>Confirm?</button>
          ${bulkEditSubhint()}
          ${bulkBookPickCard()}
        </aside>
      </div>
    </section>`);
}

/*
 * Flattens the stack of fills `backgroundLayersUnder` collected into the single colour the
 * eye receives behind a probe: outermost first, each inner layer composited onto what is
 * already there.
 *
 * The opacity assertion is the walk's anti-vacuity guard. `backgroundLayersUnder` stops at
 * `[data-surface-backdrop]` whether or not it found an opaque fill, so a probe moved outside
 * the surface — or a backdrop that stopped declaring one — would otherwise be scored against
 * a translucent base and quietly report the ratio of a colour nothing paints.
 */
function effectiveBackground(sample, selector) {
  const layers = sample.backgroundLayers.map(parseColor);
  assert.ok(layers.length > 0, `${selector} resolved no background layers at all`);
  assert.equal(
    layers.at(-1).a,
    1,
    `${selector} found no opaque fill between itself and [data-surface-backdrop] (${sample.backgroundLayers.join(' over ')}) — the ratio would be scored against a see-through base`
  );
  return layers.reduceRight((below, layer) => composite(layer, below));
}

function contrastSample(result, selector) {
  const sample = result.contrastSamples.find(entry => entry.selector === selector);
  assert.ok(sample, `expected contrast sample for ${selector}`);
  const background = effectiveBackground(sample, selector);
  // The FOREGROUND is composited over that background too, not just the ancestor fills over
  // each other. `luminance` destructures `{ r, g, b }` and drops alpha, so a translucent text
  // colour used to be scored as though it were fully opaque — which reads as a PASS for a
  // colour the eye never receives. That is not hypothetical here: several themes express
  // their muted and subtle text as the SAME rgb triple at DIFFERENT alpha, so without this
  // the two tokens are indistinguishable to this gate and swapping one for the other would
  // move no number at all.
  return contrastRatio(composite(parseColor(sample.color), background), background);
}

function assertRenderedResult(result, theme, surfaceId, width) {
  assert.equal(result.theme, theme);
  assert.equal(result.rootTheme, theme);
  assert.equal(result.appTheme, theme);
  assert.ok(result.rootTokens.bg0 && result.rootTokens.text && result.rootTokens.accent, `${theme}/${surfaceId}/${width} should expose root theme tokens`);
  assert.equal(result.horizontalOverflow, false, `${theme}/${surfaceId}/${width} should not horizontally overflow its app container`);
  assert.deepEqual(result.outOfBounds, [], `${theme}/${surfaceId}/${width} checked elements should remain inside the surface bounds`);
  assert.deepEqual(result.overlaps, [], `${theme}/${surfaceId}/${width} layout regions should not overlap`);
  assert.deepEqual(result.badHitTargets, [], `${theme}/${surfaceId}/${width} hit targets should receive pointer events at their center`);
  assert.ok(result.focus.hasRing, `${theme}/${surfaceId}/${width} focused control should expose a visible focus treatment`);
  assert.ok(contrastSample(result, '[data-contrast-surface]') >= 4.5, `${theme}/${surfaceId}/${width} primary surface text contrast should pass WCAG AA`);
  assert.ok(contrastSample(result, '[data-contrast-soft]') >= 4.5, `${theme}/${surfaceId}/${width} chip/status text contrast should pass WCAG AA`);
  assert.ok(contrastSample(result, '[data-contrast-solid]') >= 4.5, `${theme}/${surfaceId}/${width} solid action contrast should pass WCAG AA`);
  assert.ok(contrastSample(result, '[data-contrast-solid-armed]') >= 4.5, `${theme}/${surfaceId}/${width} armed danger action contrast should pass WCAG AA`);
  // The bulk edit panels' muted copy (issue 1015), one probe per COLUMN it renders on.
  assertScopedSamplePassesAA(result, '[data-contrast-bulk-muted]', `${theme}/${surfaceId}/${width} bulk edit muted copy on the rail fill`);
  assertScopedSamplePassesAA(result, '[data-contrast-bulk-bg-muted]', `${theme}/${surfaceId}/${width} bulk edit book pick meta on the card fill`);
}

/*
 * A Svelte-SCOPED sample: its rule must be the one that actually won, or the ratio is the
 * ratio of the panel's PRIMARY text and says nothing about the muted scale being asserted.
 *
 * `contrastSamples.find` is looked up here rather than dereferenced inline because a drifted
 * selector list would otherwise throw a TypeError instead of naming the missing probe —
 * `contrastSample` already states that with `assert.ok`, and this check has to state it too.
 */
function assertScopedSamplePassesAA(result, selector, label) {
  const sample = result.contrastSamples.find(entry => entry.selector === selector);
  assert.ok(sample, `expected contrast sample for ${selector} (${label})`);
  assert.notEqual(
    sample.color,
    sample.inheritedColor,
    `${label} computed the inherited --fab-mv2-text (${sample.color}) — its scoped rule did not apply, so the ratio would prove nothing`
  );
  assert.ok(contrastSample(result, selector) >= 4.5, `${label} contrast should pass WCAG AA`);
}

async function inspectRenderedSurface(page) {
  await page.keyboard.press('Tab');

  return page.evaluate(() => {
    const root = document.querySelector('.surface-root');
    const rootRect = root.getBoundingClientRect();
    const rectOf = element => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const regions = Array.from(document.querySelectorAll('[data-region]')).map(element => ({ element, rect: rectOf(element) }));
    const visibleRegions = regions.filter(({ rect }) => rect.width > 0 && rect.height > 0);
    const outOfBounds = Array.from(document.querySelectorAll('[data-boundary]'))
      .filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && (rect.left < rootRect.left - 1 || rect.right > rootRect.right + 1);
      })
      .map(element => element.className || element.tagName);
    const overlaps = [];

    for (let outerIndex = 0; outerIndex < visibleRegions.length; outerIndex += 1) {
      for (let innerIndex = outerIndex + 1; innerIndex < visibleRegions.length; innerIndex += 1) {
        if (intersects(visibleRegions[outerIndex].rect, visibleRegions[innerIndex].rect)) {
          overlaps.push(`${visibleRegions[outerIndex].element.className} overlaps ${visibleRegions[innerIndex].element.className}`);
        }
      }
    }

    const backdrop = document.querySelector('[data-surface-backdrop]');
    // Every fill actually stacked under a probe, innermost first, walking OUT to the first
    // fully opaque one. This used to jump straight from the probe's own `background-color`
    // to the backdrop's, which made a probe with no fill of its own score against a column
    // it does not render on — and, worse, made the fill of every intermediate CARD invisible
    // to the gate: `.fab-bulk-book-pick-meta` declares no background, so the pick card's
    // `--fab-mv2-bg` could be changed to the same colour as its own text, rendering the card
    // unreadable, without moving the ratio by 0.001. The walk is what makes each nested
    // probe's real card fill load-bearing.
    //
    // `[data-surface-backdrop]` is the last node considered: past it we would be scoring the
    // fixture page rather than the surface under test. `effectiveBackground` asserts the
    // final layer is opaque, so a walk that runs out of surface fails rather than silently
    // scoring against a translucent base.
    const isOpaque = color => {
      const channels = String(color).match(/[\d.]+/g) || [];
      return channels.length <= 3 || Number(channels[3]) === 1;
    };
    const backgroundLayersUnder = element => {
      const layers = [];
      for (let node = element; node; node = node.parentElement) {
        const color = getComputedStyle(node).backgroundColor;
        layers.push(color);
        if (isOpaque(color) || node === backdrop) break;
      }
      return layers;
    };
    const contrastSamples = ['[data-contrast-surface]', '[data-contrast-soft]', '[data-contrast-solid]', '[data-contrast-solid-armed]', '[data-contrast-bulk-muted]', '[data-contrast-bulk-bg-muted]'].map(selector => {
      const element = document.querySelector(selector);
      const style = getComputedStyle(element);
      return {
        selector,
        color: style.color,
        backgroundLayers: backgroundLayersUnder(element),
        // What the node would read as with no rule of its own — the inherited `--fab-mv2-text`
        // from `.fabricate-manager`. A probe whose scoped rule silently stopped applying
        // computes exactly this, so comparing against it is what keeps the sample honest.
        inheritedColor: getComputedStyle(element.parentElement).color
      };
    });
    const badHitTargets = Array.from(document.querySelectorAll('[data-hit]'))
      .filter(element => {
        const rect = element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        if (
          rect.width === 0 ||
          rect.height === 0 ||
          centerX < rootRect.left ||
          centerX > rootRect.right ||
          centerY < rootRect.top ||
          centerY > rootRect.bottom
        ) {
          return false;
        }
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return !hit || !element.contains(hit);
      })
      .map(element => element.textContent.trim());
    const focusedStyle = getComputedStyle(document.activeElement);

    return {
      theme: document.documentElement.dataset.fabricateTheme,
      rootTheme: document.documentElement.getAttribute('data-fabricate-theme'),
      appTheme: root.getAttribute('data-fabricate-theme'),
      rootTokens: {
        bg0: getComputedStyle(document.documentElement).getPropertyValue('--fab-bg-0').trim(),
        text: getComputedStyle(document.documentElement).getPropertyValue('--fab-text').trim(),
        accent: getComputedStyle(document.documentElement).getPropertyValue('--fab-accent').trim()
      },
      horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
      outOfBounds,
      overlaps,
      badHitTargets,
      contrastSamples,
      focus: {
        activeId: document.activeElement.id,
        outlineStyle: focusedStyle.outlineStyle,
        outlineWidth: focusedStyle.outlineWidth,
        boxShadow: focusedStyle.boxShadow,
        hasRing: (
          (focusedStyle.outlineStyle !== 'none' && focusedStyle.outlineWidth !== '0px') ||
          focusedStyle.boxShadow !== 'none'
        )
      }
    };
  });
}

async function startStaticServer() {
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const filePath = resolve(repoRoot, `.${url.pathname}`);

    if (!filePath.startsWith(repoRoot) || !url.pathname.startsWith('/src/')) {
      response.writeHead(404).end('Not found');
      return;
    }

    const contentType = extname(filePath) === '.js' ? 'text/javascript' : 'text/plain';
    response.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': `${contentType}; charset=utf-8`
    });
    response.end(readFileSync(filePath, 'utf8'));
  });

  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  const { port } = server.address();

  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise(resolveClose => server.close(resolveClose))
  };
}

function liveUpdateFixture(origin) {
  return `<!doctype html>
    <html data-fabricate-theme="fabricate">
      <head>
        <meta charset="utf-8">
        <style>
          ${css}
          :root { --font-primary: Arial, sans-serif; }
          body { margin: 0; background: var(--fab-bg-0); font-family: Arial, sans-serif; }
          .fabricate-manager { width: 720px; height: 420px; }
        </style>
      </head>
      <body>
        <section id="mounted-surface" class="fabricate fabricate-manager" data-fabricate-theme="fabricate" data-manager-view="systems">
          <header class="manager-header"><h1 class="manager-title">Mounted Fabricate Surface</h1><button class="manager-button fab-manager-button is-primary">Action</button></header>
          <div class="manager-body">
            <nav class="manager-rail"><button class="manager-nav-button is-active">Systems</button></nav>
            <main class="manager-main"><div class="manager-toolbar"><span class="manager-chip manager-selected-tag-pill">Live theme</span></div></main>
            <aside class="manager-inspector"><p>Inspector stays mounted.</p></aside>
          </div>
        </section>
        <script type="module">
          import { applyFabricateTheme } from '${origin}/src/ui/theme.js';
          window.fabricateRoot = document.querySelector('#mounted-surface');
          window.themeSettingDefinition = { onChange: applyFabricateTheme };
        </script>
      </body>
    </html>`;
}

test('renders all Fabricate themes across representative surfaces with readable, unclipped controls', { timeout: 60_000 }, async () => {
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage({ viewport: { width: 1120, height: 760 }, deviceScaleFactor: 1 });

    for (const theme of themeIds) {
      for (const surface of surfaceMatrix) {
        for (const width of surface.widths) {
          await page.setViewportSize({ width: width + 48, height: surface.height + 48 });
          await page.setContent(surface.fixture(theme, width, surface.height), { waitUntil: 'load' });

          const result = await inspectRenderedSurface(page);
          assertRenderedResult(result, theme, surface.id, width);
        }
      }
    }
  } finally {
    await browser.close();
  }
});

test('updates an already-mounted Fabricate surface through the registered theme onChange behavior', { timeout: 30_000 }, async () => {
  const server = await startStaticServer();
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage({ viewport: { width: 820, height: 520 }, deviceScaleFactor: 1 });
    await page.setContent(liveUpdateFixture(server.origin), { waitUntil: 'load' });
    await page.waitForFunction(() => window.themeSettingDefinition?.onChange);

    const before = await page.evaluate(() => {
      const root = document.querySelector('#mounted-surface');
      return {
        theme: document.documentElement.getAttribute('data-fabricate-theme'),
        appTheme: root.getAttribute('data-fabricate-theme'),
        background: getComputedStyle(root).backgroundColor,
        accent: getComputedStyle(root).getPropertyValue('--fab-accent').trim(),
        sameNode: window.fabricateRoot === root
      };
    });

    await page.evaluate(themeId => window.themeSettingDefinition.onChange(themeId), FABRICATE_THEME_IDS.STARGLASS_ARCANA);

    const after = await page.evaluate(() => {
      const root = document.querySelector('#mounted-surface');
      return {
        theme: document.documentElement.getAttribute('data-fabricate-theme'),
        appTheme: root.getAttribute('data-fabricate-theme'),
        background: getComputedStyle(root).backgroundColor,
        accent: getComputedStyle(root).getPropertyValue('--fab-accent').trim(),
        sameNode: window.fabricateRoot === root,
        rootCount: document.querySelectorAll('#mounted-surface').length
      };
    });

    assert.equal(before.theme, FABRICATE_THEME_IDS.FABRICATE);
    assert.equal(before.appTheme, FABRICATE_THEME_IDS.FABRICATE);
    assert.equal(before.sameNode, true);
    assert.equal(after.theme, FABRICATE_THEME_IDS.STARGLASS_ARCANA);
    assert.equal(after.appTheme, FABRICATE_THEME_IDS.STARGLASS_ARCANA);
    assert.equal(after.sameNode, true);
    assert.equal(after.rootCount, 1);
    assert.notEqual(after.background, before.background, 'mounted surface background should visibly update');
    assert.notEqual(after.accent, before.accent, 'mounted surface theme tokens should update live');
  } finally {
    await browser.close();
    await server.close();
  }
});
