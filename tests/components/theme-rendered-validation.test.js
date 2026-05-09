import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const repoRoot = resolve(import.meta.dirname, '../..');
const css = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');
const screenshotDir = resolve(repoRoot, 'test-results');

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

function fixture(theme) {
  const rows = Array.from({ length: 10 }, (_, index) => `
    <article class="manager-v2-system-row" tabindex="0">
      <div class="manager-v2-system-identity">
        <span class="manager-v2-system-thumb is-empty">${index + 1}</span>
        <div><strong>Workshop ${index + 1}</strong><p>Recipe and component management</p></div>
      </div>
      <button type="button" class="manager-v2-status-toggle ${index % 2 ? 'is-off' : 'is-on'}">
        <span class="manager-v2-status-toggle-track" aria-hidden="true"><span class="manager-v2-status-toggle-knob"></span></span>
        <span class="manager-v2-status-toggle-label">${index % 2 ? 'Disabled' : 'Enabled'}</span>
      </button>
      <button type="button" class="manager-v2-button">Open</button>
    </article>
  `).join('');

  return `<!doctype html>
    <html data-fabricate-theme="${theme}">
      <head>
        <meta charset="utf-8">
        <style>
          ${css}
          body { margin: 0; background: var(--fab-bg-0); font-family: Arial, sans-serif; }
          .preview-shell { width: 900px; padding: 24px; }
          .fabricate-manager-v2 { width: 900px; height: 560px; }
        </style>
      </head>
      <body>
        <main class="preview-shell">
          <section class="fabricate-manager-v2" data-manager-v2-view="systems">
            <header class="manager-v2-header">
              <div class="manager-v2-heading"><h1>Fabricate</h1><p>Theme preview</p></div>
              <div class="manager-v2-header-actions"><button type="button" class="manager-v2-button is-primary">Create</button></div>
            </header>
            <div class="manager-v2-body">
              <nav class="manager-v2-rail">
                <button type="button" class="manager-v2-nav-button is-active">Systems</button>
                <button type="button" class="manager-v2-nav-button">Recipes</button>
                <button type="button" class="manager-v2-nav-button">Components</button>
              </nav>
              <section class="manager-v2-main">
                <div class="manager-v2-toolbar">
                  <input class="manager-v2-search" value="Alchemy" aria-label="Search">
                  <span class="manager-v2-chip manager-v2-selected-tag-pill">Rare <button type="button">x</button></span>
                  <span class="manager-v2-chip is-warning">Warning</span>
                </div>
                <div class="manager-v2-systems-table">${rows}</div>
              </section>
              <aside class="manager-v2-inspector">
                <h2>Palette</h2>
                <p class="manager-v2-empty-copy">Shared theme tokens drive every surface.</p>
                <button type="button" class="manager-v2-button is-danger">Delete</button>
              </aside>
            </div>
          </section>
          <section class="fabricate-admin" style="margin-top: 16px;">
            <button type="button" class="essence-create-submit">Create Essence</button>
          </section>
        </main>
      </body>
    </html>`;
}

test('renders Fabricate and Mythwright themes with visible, readable controls', async () => {
  mkdirSync(screenshotDir, { recursive: true });
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 720 }, deviceScaleFactor: 1 });

    for (const theme of ['fabricate', 'mythwright']) {
      await page.setContent(fixture(theme), { waitUntil: 'load' });
      await page.keyboard.press('Tab');

      const result = await page.evaluate(() => {
        const rectOf = selector => {
          const rect = document.querySelector(selector).getBoundingClientRect();
          return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
        };
        const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        const stylesFor = selector => {
          const element = document.querySelector(selector);
          const style = getComputedStyle(element);
          return {
            color: style.color,
            backgroundColor: style.backgroundColor,
            outlineStyle: style.outlineStyle,
            outlineWidth: style.outlineWidth,
            overflowY: style.overflowY,
            rect: rectOf(selector)
          };
        };
        const root = getComputedStyle(document.documentElement);
        const shell = stylesFor('.fabricate-manager-v2');
        const body = stylesFor('.manager-v2-body');
        const rail = rectOf('.manager-v2-rail');
        const main = rectOf('.manager-v2-main');
        const inspector = rectOf('.manager-v2-inspector');
        const primary = stylesFor('.manager-v2-button.is-primary');
        const submit = stylesFor('.essence-create-submit');
        const tag = stylesFor('.manager-v2-selected-tag-pill');
        const status = stylesFor('.manager-v2-status-toggle.is-on');

        return {
          theme: document.documentElement.dataset.fabricateTheme,
          bg0: root.getPropertyValue('--fab-bg-0').trim(),
          text: root.getPropertyValue('--fab-text').trim(),
          shell,
          body,
          rail,
          main,
          inspector,
          primary,
          submit,
          tag,
          status,
          activeClass: document.activeElement.className,
          overlaps: intersects(rail, main) || intersects(main, inspector) || intersects(rail, inspector)
        };
      });

      const shellBackground = parseColor(result.shell.backgroundColor);
      const primaryBackground = parseColor(result.primary.backgroundColor);
      const submitBackground = parseColor(result.submit.backgroundColor);
      const tagBackground = composite(parseColor(result.tag.backgroundColor), shellBackground);
      const statusBackground = composite(parseColor(result.status.backgroundColor), shellBackground);

      assert.equal(result.theme, theme);
      assert.ok(result.bg0 && result.text, `${theme} should expose root theme tokens`);
      assert.ok(result.primary.rect.width > 40 && result.primary.rect.height >= 30, `${theme} primary button should be visible`);
      assert.ok(result.submit.rect.width > 100 && result.submit.rect.height >= 36, `${theme} submit button should be visible`);
      assert.ok(result.tag.rect.width > 30 && result.status.rect.width >= 60, `${theme} tag/status chips should be visible`);
      assert.match(result.activeClass, /is-primary/, `${theme} keyboard tab should focus the primary action first`);
      assert.notEqual(result.primary.outlineStyle, 'none', `${theme} primary action should expose a focus ring`);
      assert.ok(['hidden', 'auto'].includes(result.body.overflowY), `${theme} manager body should own scroll containment`);
      assert.equal(result.overlaps, false, `${theme} rail/main/inspector regions should not overlap`);
      assert.ok(contrastRatio(parseColor(result.primary.color), primaryBackground) >= 4.5, `${theme} primary action contrast should pass WCAG AA`);
      assert.ok(contrastRatio(parseColor(result.submit.color), submitBackground) >= 4.5, `${theme} essence submit contrast should pass WCAG AA`);
      assert.ok(contrastRatio(parseColor(result.tag.color), tagBackground) >= 4.5, `${theme} tag chip contrast should pass WCAG AA`);
      assert.ok(contrastRatio(parseColor(result.status.color), statusBackground) >= 4.5, `${theme} status toggle contrast should pass WCAG AA`);

      await page.screenshot({ path: resolve(screenshotDir, `theme-${theme}.png`), fullPage: true });
    }
  } finally {
    await browser.close();
  }
});
