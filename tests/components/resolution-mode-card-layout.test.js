/* Resolution-mode config-card layout gate. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const repoRoot = resolve(import.meta.dirname, '../..');
const foundryCss = readFileSync(resolve(repoRoot, 'tests/fixtures/foundry-core-min.css'), 'utf8');
const fabricateCss = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');

// The exact DOM RadioCardGroup.svelte emits with `configCards`.
const FIXTURE = `
<div class="application theme-dark">
  <section class="window-content">
    <div class="fabricate fabricate-manager" data-fabricate-theme="dark" data-manager-view="crafting-settings">
      <div style="grid-column: 1 / -1;">
        <fieldset class="fabricate-field manager-field fabricate-option-cards is-wide manager-resolution-mode-card manager-radio-card-group is-config-cards">
          <legend class="manager-resolution-mode-legend">Recipe resolution</legend>
          <div class="manager-resolution-mode-options">
            <label class="manager-resolution-option">
              <input type="radio" name="rmode" value="Simple" />
              <span class="manager-resolution-option-icon" aria-hidden="true"><i class="fa-solid fa-wand-magic-sparkles"></i></span>
              <span class="manager-resolution-option-body">
                <span class="manager-resolution-option-name">Simple</span>
                <span class="manager-resolution-option-desc">One ingredient set and one result group, with an optional pass/fail check.</span>
              </span>
            </label>
            <label class="manager-resolution-option is-active">
              <input type="radio" name="rmode" value="Routed by ingredients" checked />
              <span class="manager-resolution-option-icon" aria-hidden="true"><i class="fa-solid fa-layer-group"></i></span>
              <span class="manager-resolution-option-body">
                <span class="manager-resolution-option-name">Routed by ingredients</span>
                <span class="manager-resolution-option-desc">Multiple ingredient sets and result groups; the chosen ingredient set selects which result group is produced. The crafting check is optional.</span>
              </span>
            </label>
          </div>
        </fieldset>
      </div>
    </div>
  </section>
</div>`;

test('config-card resolution radios stay a 16px dot and never starve the option body', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    await page.setContent(
      `<!doctype html><html><head><style>${foundryCss}\n${fabricateCss}</style></head><body>${FIXTURE}</body></html>`,
      { waitUntil: 'networkidle' }
    );
    const geo = await page.evaluate(() => {
      const rects = (sel) =>
        [...document.querySelectorAll(sel)].map((el) => {
          const r = el.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height) };
        });
      const radioStyle = [...document.querySelectorAll('.manager-resolution-option input[type=radio]')].map((el) => {
        const cs = getComputedStyle(el);
        return { borderRadius: cs.borderRadius, appearance: cs.appearance };
      });
      return {
        radios: rects('.manager-resolution-option input[type=radio]'),
        radioStyle,
        bodies: rects('.manager-resolution-option-body'),
        descs: rects('.manager-resolution-option-desc'),
      };
    });
    await page.close();

    // Both cards, checked and unchecked. The bug hit the unchecked one too, so assert all.
    for (const [i, radio] of geo.radios.entries()) {
      // A dot, not a bar. 24px allows the 16px box + 1.5px border either side; 643px was the bug.
      assert.ok(
        radio.w <= 24,
        `radio[${i}] should stay a ~16px dot, was ${radio.w}px (it filled the flex line and starved the body)`
      );
    }
    for (const [i, style] of geo.radioStyle.entries()) {
      // Round, not square. The generic .manager-field text-field treatment squared the dot to
      // a 6px-radius box; the custom radio must keep its circle (border-radius: 50%) and its
      // stripped native chrome (appearance: none). Guards the square-radio regression directly.
      assert.equal(
        style.borderRadius,
        '50%',
        `radio[${i}] should be a circle (border-radius: 50%), was ${style.borderRadius} (the field treatment squared it)`
      );
      assert.equal(style.appearance, 'none', `radio[${i}] should keep appearance: none, was ${style.appearance}`);
    }
    for (const [i, body] of geo.bodies.entries()) {
      // A collapsed body measured 0px. A healthy body fills most of a ~669px card column.
      assert.ok(
        body.w > 300,
        `option body[${i}] should fill the card column, was ${body.w}px (a starved body wraps the description one word per line)`
      );
    }
    for (const [i, desc] of geo.descs.entries()) {
      // One-word-per-line made the description ~345px tall. Wrapped normally it is a few lines.
      assert.ok(
        desc.h < 120,
        `description[${i}] should wrap normally, was ${desc.h}px tall (per-word wrapping is the collapse signature)`
      );
    }
  } finally {
    await browser.close();
  }
});
