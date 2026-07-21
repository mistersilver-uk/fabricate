/*
 * Foundry compat-layer conformance gate (issue 823, Design F).
 *
 * The View Lab and the two font-size gates single-source
 * `tests/fixtures/foundry-core-min.css`. That file is now a LAYOUT-FIDELITY
 * SUPERSET (box-sizing/`.application` layout/default control chrome added inside
 * the existing `@layer` structure). This fail-closed gate guards that the added
 * layout rules did not silently shift the load-bearing font-size anchors and that
 * the `@layer` structure — not load order — still reproduces Foundry's cascade:
 *
 *  (a) the `@layer reset, variables, elements, blocks, applications;` declaration
 *      exists and core rules live INSIDE those layers;
 *  (b) anchors compute to pinned values: html = 16px, `.application` =
 *      14px / 0.875rem, form controls resolve `font: inherit`;
 *  (c) the 14px bleed baseline (a bare `<input>`) holds.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const repoRoot = resolve(import.meta.dirname, '../..');
const compatCss = readFileSync(resolve(repoRoot, 'tests/fixtures/foundry-core-min.css'), 'utf8');
const fabricateCss = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');

test('the compat file declares @layer with core rules inside it (structure, not load order)', () => {
  // The declaration line orders the layers (precedence), so unlayered fabricate.css wins.
  assert.match(compatCss, /@layer\s+reset\s*,\s*variables\s*,\s*elements\s*,\s*blocks\s*,\s*applications\s*;/);
  // The `.application` base font-size lives INSIDE `@layer applications { … }`.
  const applicationsLayer = compatCss.match(/@layer\s+applications\s*\{([\s\S]*?)\n\}/);
  assert.ok(applicationsLayer, 'an @layer applications { … } block exists');
  assert.match(applicationsLayer[1], /\.application\s*\{[\s\S]*font-size:\s*var\(--font-size-14\)/);
  // The control `font: inherit` reset lives inside `@layer reset { … }`.
  assert.match(compatCss, /@layer\s+reset\s*\{[\s\S]*font:\s*inherit/);
});

function page() {
  return `<!doctype html><html><head><meta charset="utf-8">
    <style>${compatCss}</style><style>${fabricateCss}</style>
    <style>:root{--font-primary:Arial,sans-serif}</style></head>
    <body class="game">
      <div class="application theme-dark">
        <section class="window-content">
          <div class="fabricate">
            <input type="text" data-c="bare-input" value="x">
            <button data-c="bare-button">B</button>
            <select data-c="bare-select"><option>o</option></select>
          </div>
        </section>
      </div>
    </body></html>`;
}

test('compat anchors compute to the pinned Foundry values (fail-closed)', async () => {
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({ viewport: { width: 1000, height: 700 } });
    await p.setContent(page(), { waitUntil: 'load' });

    const rootPx = await p.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    assert.equal(rootPx, 16, 'html root is the 16px rem anchor');

    const appPx = await p.evaluate(() =>
      parseFloat(getComputedStyle(document.querySelector('.application')).fontSize),
    );
    assert.ok(Math.abs(appPx - 14) < 0.05, `.application computes to 14px (0.875rem), got ${appPx}`);

    // Controls resolve `font: inherit`, so a bare control inside .application inherits
    // the 14px app base — the bleed baseline. This is the whole "Foundry default bleed"
    // contract the compat file exists to reproduce.
    const controls = await p.evaluate(() => {
      const px = (sel) => parseFloat(getComputedStyle(document.querySelector(sel)).fontSize);
      return {
        input: px('[data-c="bare-input"]'),
        button: px('[data-c="bare-button"]'),
        select: px('[data-c="bare-select"]'),
      };
    });
    assert.ok(Math.abs(controls.input - 14) < 0.05, `bare <input> inherits 14px, got ${controls.input}`);
    assert.ok(Math.abs(controls.button - 14) < 0.05, `bare <button> inherits 14px, got ${controls.button}`);
    assert.ok(Math.abs(controls.select - 14) < 0.05, `bare <select> inherits 14px, got ${controls.select}`);
  } finally {
    await browser.close();
  }
});
