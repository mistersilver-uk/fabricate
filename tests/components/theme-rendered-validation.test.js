import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { chromium } from 'playwright';
import { FABRICATE_THEME_IDS } from '../../src/ui/theme.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const css = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');
const themeIds = Object.values(FABRICATE_THEME_IDS);
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
      <button type="button" class="manager-button" data-boundary>Open</button>
    </article>
  `).join('');
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
          <button id="focus-target" type="button" class="manager-button is-primary" data-hit data-contrast-solid data-boundary>Create System</button>
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
          <button type="button" class="manager-button is-danger" data-hit data-contrast-solid data-boundary>Delete</button>
        </aside>
      </div>
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
          .fabricate-manager { width: 720px; height: 420px; }
        </style>
      </head>
      <body>
        <section id="mounted-surface" class="fabricate fabricate-manager" data-fabricate-theme="fabricate" data-manager-view="systems">
          <header class="manager-header"><h1 class="manager-title">Mounted Fabricate Surface</h1><button class="manager-button is-primary">Action</button></header>
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
