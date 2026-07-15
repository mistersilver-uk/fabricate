/*
 * Recipe Studio font-size gate (issue 643).
 *
 * happy-dom cannot compute the CSS cascade, so a mounted test can never prove the
 * RENDERED font-size. This gate renders the real recipe-studio classes in Chromium
 * under a minimal-but-faithful stand-in for Foundry V13 core CSS (tests/fixtures/
 * foundry-core-min.css — the @layer reset + 14px app base) plus the real
 * styles/fabricate.css, and asserts the computed px against the prototype's scale.
 *
 * It also proves the cascade context: a bare <input> inherits the 14px Foundry app
 * base (bleed baseline), and `.manager-nav-label` must NOT be 14 — it once bled to
 * Foundry's default and is now pinned to the design.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const repoRoot = resolve(import.meta.dirname, '../..');
const foundryCss = readFileSync(resolve(repoRoot, 'tests/fixtures/foundry-core-min.css'), 'utf8');
const fabricateCss = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');

// One representative element per role, using the exact recipe-studio classes, wrapped
// in the Foundry app shell so `.application`'s 14px base + the @layer reset apply.
const FIXTURE = `
  <div class="application theme-dark">
    <section class="window-content">
      <div class="fabricate fabricate-manager" data-fabricate-theme="dark" data-manager-view="recipe-edit">
        <div class="manager-recipe-edit-heading-copy">
          <h1 class="manager-title" data-m="title">Craft Acid-Bite Arrows</h1>
          <p class="manager-subtitle" data-m="subtitle">Ammunition · Routed by check · DC 10</p>
        </div>
        <div class="manager-header-actions">
          <button class="manager-button is-ghost" data-m="header-button"><span>Back</span></button>
        </div>
        <div class="manager-editor-tabs">
          <button class="manager-editor-tab-button is-active" data-m="tab-label"><span>Ingredients</span>
            <span class="manager-chip is-neutral manager-editor-tab-badge" data-m="tab-badge">4</span>
          </button>
        </div>
        <div class="manager-nav-button">
          <span class="manager-nav-label" data-m="nav-label">Recipes</span>
          <span class="manager-nav-count" data-m="nav-count">105</span>
        </div>
        <div class="manager-recipe-ingredient-set-add">
          <button class="manager-button is-dashed" data-m="dashed-add"><span>Add tag requirement</span></button>
        </div>
        <p class="manager-muted" data-m="muted">The components, tags and essences this recipe consumes.</p>
        <input type="text" data-m="bleed-baseline" value="bare">
      </div>
    </section>
  </div>`;

function page() {
  return `<!doctype html><html><head><meta charset="utf-8">
    <style>${foundryCss}</style><style>${fabricateCss}</style>
    <style>:root{--font-primary:Arial,sans-serif}</style></head>
    <body class="game">${FIXTURE}</body></html>`;
}

// px at the 16px root: rem * 16.
const EXPECTED = {
  title: 20, // 1.25rem  (recipe editor title)
  subtitle: 11.52, // 0.72rem
  'header-button': 11.52, // 0.72rem
  'tab-label': 12.48, // 0.78rem
  'tab-badge': 8.96, // 0.56rem
  'nav-label': 12.48, // 0.78rem — bleed fix (was inheriting 14)
  'nav-count': 10, // 0.625rem
  'dashed-add': 11.2, // 0.7rem
  muted: 10.24, // 0.64rem — recipe-view-scoped
  'bleed-baseline': 14, // Foundry app base (bare control)
};

test('recipe studio font-sizes match the prototype scale under real Foundry core CSS', async () => {
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    await p.setContent(page(), { waitUntil: 'load' });

    const rootPx = await p.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    assert.equal(rootPx, 16, 'html root font-size is the 16px rem anchor');

    const measured = await p.evaluate(() => {
      const out = {};
      document.querySelectorAll('[data-m]').forEach((el) => {
        out[el.getAttribute('data-m')] = parseFloat(getComputedStyle(el).fontSize);
      });
      return out;
    });

    for (const [key, expected] of Object.entries(EXPECTED)) {
      assert.ok(
        Math.abs(measured[key] - expected) < 0.1,
        `${key}: computed ${measured[key]}px should be ~${expected}px`
      );
    }

    // The bleed contract: the bare control proves Foundry's 14px base is in play, and
    // the nav label must NOT sit at that base — it is now design-pinned, not bleeding.
    assert.equal(measured['bleed-baseline'], 14, 'bare <input> inherits the Foundry 14px app base');
    assert.notEqual(measured['nav-label'], 14, 'nav label must not bleed to the Foundry base');
  } finally {
    await browser.close();
  }
});
