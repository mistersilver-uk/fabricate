/*
 * Resolution-mode config-card layout gate.
 *
 * happy-dom cannot compute the CSS cascade, so a mounted test can never prove the
 * RENDERED box model. This gate renders the real `is-config-cards` ResolutionModeCard
 * markup in Chromium under the same faithful Foundry V13 core stand-in the font-size
 * gate uses (tests/fixtures/foundry-core-min.css) plus the real styles/fabricate.css,
 * and pins the geometry that a regression once broke.
 *
 * The regression it guards (crafting settings, Recipe resolution): the radio is an
 * `appearance: none` flex item, and when the winning (config-card) rule omits an
 * explicit size the radio resolves its width to `auto` and FILLS the flex line
 * (~643px in a 669px card). That starves `.manager-resolution-option-body` to 0px,
 * so every description wraps one word per line and the option name clips ("Simple" →
 * "Si"). Every unit test and the screenshot gate passed while it shipped — only the
 * rendered box model shows it, which is why this gate measures px in a real browser.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const repoRoot = resolve(import.meta.dirname, '../..');
const foundryCss = readFileSync(resolve(repoRoot, 'tests/fixtures/foundry-core-min.css'), 'utf8');
const fabricateCss = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');

// The exact DOM ResolutionModeCard.svelte emits for variant="config-card": a
// <fieldset class="… is-config-cards"> whose options each wrap a real radio, an icon
// tile, and a body (name + description). Two options, one long description, so a
// collapsed body would visibly wrap per-word. Wrapped in the .fabricate-manager
// container (the container-query context) inside the Foundry app shell (14px base).
function option(active, name, desc, icon) {
  return `
    <label class="manager-resolution-option ${active ? 'is-active' : ''}">
      <input type="radio" name="rmode" value="${name}" ${active ? 'checked' : ''} />
      <span class="manager-resolution-option-icon" aria-hidden="true"><i class="${icon}"></i></span>
      <span class="manager-resolution-option-body">
        <span class="manager-resolution-option-name">${name}</span>
        <span class="manager-resolution-option-desc">${desc}</span>
      </span>
    </label>`;
}

const FIXTURE = `
<div class="application theme-dark">
  <section class="window-content">
    <div class="fabricate fabricate-manager" data-fabricate-theme="dark" data-manager-view="crafting-settings">
      <div style="grid-column: 1 / -1;">
        <fieldset class="manager-field is-wide manager-resolution-mode-card is-config-cards">
          <legend class="manager-resolution-mode-legend">Recipe resolution</legend>
          <div class="manager-resolution-mode-options">
            ${option(false, 'Simple', 'One ingredient set and one result group, with an optional pass/fail check.', 'fa-solid fa-wand-magic-sparkles')}
            ${option(true, 'Routed by ingredients', 'Multiple ingredient sets and result groups; the chosen ingredient set selects which result group is produced. The crafting check is optional.', 'fa-solid fa-layer-group')}
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
