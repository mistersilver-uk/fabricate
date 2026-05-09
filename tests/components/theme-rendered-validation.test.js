import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { chromium } from 'playwright';
import { FABRICATE_THEME_IDS } from '../../src/ui/theme.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const css = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');
const screenshotDir = resolve(repoRoot, 'test-results');
const themeIds = Object.values(FABRICATE_THEME_IDS);
const newThemeIds = new Set([
  FABRICATE_THEME_IDS.IRONBLOOD_FORGE,
  FABRICATE_THEME_IDS.HEARTH_HERB,
  FABRICATE_THEME_IDS.STARGLASS_ARCANA,
  FABRICATE_THEME_IDS.FOUNDRY_NATIVE
]);
const surfaceMatrix = [
  { id: 'manager', widths: [900, 560], height: 560, fixture: managerFixture },
  { id: 'crafting', widths: [720, 520], height: 520, fixture: craftingFixture },
  { id: 'gathering', widths: [720, 520], height: 560, fixture: gatheringFixture },
  { id: 'recipe-editor', widths: [960, 620], height: 560, fixture: recipeEditorFixture }
];

function parseColor(value) {
  const match = value.match(/rgba?\(([^)]+)\)/);
  assert.ok(match, `expected computed rgb/rgba colour, got ${value}`);
  const [r, g, b, a = '1'] = match[1].split(',').map(part => Number.parseFloat(part.trim()));
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
        </style>
      </head>
      <body>
        <main class="preview-shell">${body}</main>
      </body>
    </html>`;
}

function managerRows() {
  return Array.from({ length: 8 }, (_, index) => `
    <article class="manager-v2-system-row" tabindex="0" data-boundary>
      <div class="manager-v2-system-identity">
        <span class="manager-v2-system-thumb is-empty">${index + 1}</span>
        <div>
          <strong>Very Long Workshop ${index + 1} Name For Localized Layout Validation</strong>
          <p>Recipe, component, essence, and environment management</p>
        </div>
      </div>
      <button type="button" class="manager-v2-status-toggle ${index % 2 ? 'is-off' : 'is-on'}" data-contrast-soft data-boundary>
        <span class="manager-v2-status-toggle-track" aria-hidden="true"><span class="manager-v2-status-toggle-knob"></span></span>
        <span class="manager-v2-status-toggle-label">${index % 2 ? 'Off' : 'On'}</span>
      </button>
      <button type="button" class="manager-v2-button" data-boundary>Open</button>
    </article>
  `).join('');
}

function managerFixture(theme, width, height) {
  return themePage(theme, width, height, `
    <section class="fabricate fabricate-manager-v2 surface-root" data-fabricate-theme="${theme}" data-manager-v2-view="systems" data-surface-backdrop>
      <header class="manager-v2-header" data-region data-boundary>
        <div class="manager-v2-heading">
          <h1 class="manager-v2-title preview-title" data-contrast-surface>Fabricate Theme Validation Surface With Long Localized Title</h1>
          <p class="manager-v2-subtitle preview-copy">Checks buttons, tags, toggles, text, focus rings, and fixed app-width layout.</p>
        </div>
        <div class="manager-v2-header-actions">
          <button id="focus-target" type="button" class="manager-v2-button is-primary" data-hit data-contrast-solid data-boundary>Create System</button>
        </div>
      </header>
      <div class="manager-v2-body">
        <nav class="manager-v2-rail" data-region data-boundary>
          <button type="button" class="manager-v2-nav-button is-active" data-boundary>
            <i aria-hidden="true">*</i>
            <span class="manager-v2-nav-label">Crafting Systems With Extra Words</span>
            <span class="manager-v2-nav-count">6</span>
          </button>
          <button type="button" class="manager-v2-nav-button" data-boundary>
            <i aria-hidden="true">*</i>
            <span class="manager-v2-nav-label">Recipes</span>
            <span class="manager-v2-nav-count">12</span>
          </button>
          <button type="button" class="manager-v2-nav-button" data-boundary>
            <i aria-hidden="true">*</i>
            <span class="manager-v2-nav-label">Components</span>
            <span class="manager-v2-nav-count">40</span>
          </button>
        </nav>
        <section class="manager-v2-main" data-region data-boundary>
          <div class="manager-v2-toolbar">
            <input class="manager-v2-search" value="Alchemy and harvesting" aria-label="Search">
            <span class="manager-v2-chip manager-v2-selected-tag-pill" data-contrast-soft data-boundary>Rare ingredient category <button type="button">x</button></span>
            <span class="manager-v2-chip is-warning" data-contrast-soft data-boundary>Warning</span>
          </div>
          <div class="manager-v2-systems-table">${managerRows()}</div>
        </section>
        <aside class="manager-v2-inspector" data-region data-boundary>
          <h2 data-contrast-surface>Palette</h2>
          <p class="manager-v2-empty-copy preview-copy">Shared theme tokens drive every mounted Fabricate surface.</p>
          <button type="button" class="manager-v2-button is-danger" data-hit data-contrast-solid data-boundary>Delete</button>
        </aside>
      </div>
    </section>`);
}

function craftingFixture(theme, width, height) {
  return themePage(theme, width, height, `
    <section class="fabricate crafting-app surface-root" data-fabricate-theme="${theme}" data-surface-backdrop>
      <div class="fabricate-actor-app">
        <div class="run-summary-section" data-region data-boundary>
          <h1 class="preview-title" data-contrast-surface>Player Crafting Workbench With A Long Localized Heading</h1>
          <p class="preview-copy">Visible recipe selection, ingredient tags, and craft actions.</p>
        </div>
        <div class="fabricate-filters" data-boundary>
          <button id="focus-target" type="button" class="fabricate-filter-btn active" data-hit data-contrast-soft data-boundary>Available Recipes</button>
          <button type="button" class="fabricate-filter-btn" data-hit data-boundary>Known To Actor</button>
          <select aria-label="Category"><option>Very Long Category Name</option></select>
        </div>
        <section class="fabricate-recipe-list" data-region data-boundary>
          <article class="fabricate-recipe-item" data-boundary>
            <div class="recipe-icon"><img alt="" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Crect width='64' height='64' fill='%239AB89C'/%3E%3C/svg%3E"></div>
            <div class="recipe-info">
              <h2 class="recipe-name" data-contrast-surface>Elixir of Extremely Verbose Crafting Confirmation</h2>
              <p class="recipe-description">A long recipe description stays readable and wraps inside the actor app container.</p>
              <div class="recipe-requirements">
                <span class="ingredient-badge satisfied" data-contrast-soft data-boundary>Fresh Herb Bundle</span>
                <span class="ingredient-badge unsatisfied" data-contrast-soft data-boundary>Rare Moonlit Catalyst</span>
              </div>
              <div class="recipe-result"><strong>Result:</strong> Fortified potion</div>
            </div>
            <div class="recipe-actions">
              <button type="button" class="craft-btn" data-hit data-contrast-solid data-boundary>Craft</button>
              <button type="button" class="details-btn" data-hit data-boundary>Details</button>
            </div>
          </article>
        </section>
      </div>
    </section>`);
}

function gatheringFixture(theme, width, height) {
  return themePage(theme, width, height, `
    <section class="fabricate gathering-app surface-root" data-fabricate-theme="${theme}" data-surface-backdrop>
      <div class="fabricate-gathering-app">
        <header class="gathering-v2-header" data-region data-boundary>
          <div class="gathering-v2-title">
            <i aria-hidden="true">*</i>
            <div><h2 data-contrast-surface>Gathering Expedition With Long Region Name</h2><p class="preview-copy">Choose an environment and task.</p></div>
          </div>
          <div class="gathering-v2-actor-card"><span>Actor</span><select aria-label="Actor"><option>Sir Longname The Careful</option></select></div>
          <div class="gathering-v2-stamina"><span>Stamina</span><meter min="0" max="10" value="7"></meter></div>
          <nav class="gathering-v2-tabs"><button id="focus-target" type="button" class="is-active" data-hit data-contrast-soft data-boundary>Active Gathering</button></nav>
        </header>
        <div class="gathering-v2-workspace">
          <section class="gathering-v2-environment-browser" data-region data-boundary>
            <div class="gathering-filter-bar"><input value="Ancient forest" aria-label="Search"><select aria-label="Risk"><option>All risk levels</option></select></div>
            <div class="gathering-v2-environment-list">
              <button type="button" class="gathering-v2-environment-row is-selected" data-boundary>
                <span class="gathering-environment-placeholder">F</span>
                <span class="gathering-v2-row-copy"><strong>Ancient Forest Edge With Long Localized Name</strong><span>3 tasks available</span></span>
                <span class="gathering-chip is-risk-safe" data-contrast-soft>Safe</span>
              </button>
            </div>
          </section>
          <section class="gathering-v2-task-panel" data-region data-boundary>
            <div class="gathering-v2-panel-heading"><h3 data-contrast-surface>Tasks</h3><span>Available now</span></div>
            <div class="gathering-task-list">
              <article class="gathering-task-row is-selected" data-boundary>
                <span class="gathering-task-icon">H</span>
                <span class="gathering-task-body"><strong>Harvest A Very Particular Bundle Of Herbs</strong><span class="gathering-task-economy">10 minutes, consumes stamina</span></span>
                <button type="button" class="gathering-task-select" data-hit data-contrast-solid>Go</button>
              </article>
            </div>
          </section>
          <aside class="gathering-v2-detail-panel" data-region data-boundary>
            <div class="gathering-v2-hero"><div class="gathering-v2-hero-placeholder">Image</div><div class="gathering-v2-hero-copy"><h3>Forest Edge</h3><p>Live readable overlay copy.</p></div></div>
            <button type="button" class="gathering-start-button" data-hit data-contrast-solid data-boundary>Start Gathering</button>
          </aside>
        </div>
      </div>
    </section>`);
}

function recipeEditorFixture(theme, width, height) {
  return themePage(theme, width, height, `
    <section class="fabricate fabricate-actor-app surface-root" data-fabricate-theme="${theme}" data-surface-backdrop>
      <form class="fabricate-recipe-editor" data-region data-boundary>
        <h1 class="preview-title" data-contrast-surface>Recipe Editor With Long Localized Validation Text</h1>
        <p class="preview-copy">Controls keep token contrast and focus treatment at editor widths.</p>
        <label data-boundary>Name <input id="focus-target" value="Extremely Detailed Potion Recipe" data-contrast-surface></label>
        <label data-boundary>Category <select><option>Alchemy Components With Long Name</option></select></label>
        <label data-boundary>Description <textarea rows="4" placeholder="Describe the recipe">A rich description remains readable across themes.</textarea></label>
        <label data-boundary><input type="checkbox" checked> Available to players</label>
        <div class="ingredient-list" data-boundary>
          <span class="ingredient-badge satisfied" data-contrast-soft>Herb bundle</span>
          <span class="ingredient-badge unsatisfied" data-contrast-soft>Moonlit catalyst</span>
          <span class="badge badge-advanced" data-contrast-soft>Progressive</span>
        </div>
        <button type="button" data-hit data-contrast-solid data-boundary>Save Recipe</button>
        <button type="button" class="btn-danger" data-hit data-boundary>Delete Draft</button>
      </form>
    </section>`);
}

function contrastSample(result, selector) {
  const sample = result.contrastSamples.find(entry => entry.selector === selector);
  assert.ok(sample, `expected contrast sample for ${selector}`);
  const backdrop = parseColor(sample.backdropBackgroundColor);
  const background = composite(parseColor(sample.backgroundColor), backdrop);
  return contrastRatio(parseColor(sample.color), background);
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
    const backdropBackgroundColor = getComputedStyle(backdrop).backgroundColor;
    const contrastSamples = ['[data-contrast-surface]', '[data-contrast-soft]', '[data-contrast-solid]'].map(selector => {
      const element = document.querySelector(selector);
      const style = getComputedStyle(element);
      return {
        selector,
        color: style.color,
        backgroundColor: style.backgroundColor,
        backdropBackgroundColor
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
          .fabricate-manager-v2 { width: 720px; height: 420px; }
        </style>
      </head>
      <body>
        <section id="mounted-surface" class="fabricate fabricate-manager-v2" data-fabricate-theme="fabricate" data-manager-v2-view="systems">
          <header class="manager-v2-header"><h1 class="manager-v2-title">Mounted Fabricate Surface</h1><button class="manager-v2-button is-primary">Action</button></header>
          <div class="manager-v2-body">
            <nav class="manager-v2-rail"><button class="manager-v2-nav-button is-active">Systems</button></nav>
            <main class="manager-v2-main"><div class="manager-v2-toolbar"><span class="manager-v2-chip manager-v2-selected-tag-pill">Live theme</span></div></main>
            <aside class="manager-v2-inspector"><p>Inspector stays mounted.</p></aside>
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
  mkdirSync(screenshotDir, { recursive: true });
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

          if (newThemeIds.has(theme) && width === surface.widths[0]) {
            await page.screenshot({ path: resolve(screenshotDir, `theme-${theme}-${surface.id}-${width}.png`), fullPage: true });
          }
        }
      }
    }
  } finally {
    await browser.close();
  }
});

test('updates an already-mounted Fabricate surface through the registered theme onChange behavior', { timeout: 30_000 }, async () => {
  mkdirSync(screenshotDir, { recursive: true });
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

    await page.screenshot({ path: resolve(screenshotDir, 'theme-live-update-mounted-surface.png'), fullPage: true });
  } finally {
    await browser.close();
    await server.close();
  }
});
