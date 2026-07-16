/*
 * Component Studio font-size gate (issue 676) — the sibling of
 * `recipe-studio-font-size.test.js`.
 *
 * happy-dom cannot compute the CSS cascade, so a mounted test can never prove the
 * RENDERED font-size. This gate renders the real Component Studio classes in Chromium
 * under a minimal-but-faithful stand-in for Foundry V13 core CSS (tests/fixtures/
 * foundry-core-min.css — the @layer reset + 14px app base) plus the real
 * styles/fabricate.css, and asserts the computed px per role.
 *
 * It also proves the cascade context: a bare <input> inherits the 14px Foundry app
 * base (the bleed baseline). A studio role landing on 14 is the signature of a rule
 * that stopped applying and let Foundry's default through.
 *
 * ── THE PHASE 0 RESOLVED SCALE ───────────────────────────────────────────────────
 * The brief's §2 type scale contains RANGES ("eyebrow labels 700 9–9.5px",
 * "filter/sort selects 500 11.5–12px", "micro-labels 700 7.5–8.5px") and then resolves
 * them with "read it off the prototype". A gate needs ONE number per role, and if the
 * implementer picks, the guess acquires the authority of a committed test forever.
 *
 * So the ranges were resolved ONCE, by extracting the prototype's own declarations
 * (`tmp/GM Component Studio.html`). Its resolved per-role scale is:
 *
 *   browser page title (h2)        600 22px   serif
 *   browser page subtitle          400 12.5px sans
 *   breadcrumb                     600 11px   sans
 *   rail eyebrow ("GM MANAGEMENT") 700 9px    sans, letter-spacing .14em
 *   toolbar micro-label            700 8.5px  sans, letter-spacing .08em
 *   filter / sort select           500 11.5px sans
 *   search input                   400 12.5px sans
 *   row name                       600 13.5px serif
 *   row description                400 11px   sans
 *   row badge / chip               600 9px    sans
 *   panel title (h3)               600 14px   serif
 *   panel sub (p)                  400 10px   sans
 *   editor title (h2)              600 20px   serif
 *   primary button                 700 12.5px sans
 *
 * That is the DESIGN INTENT. What this gate pins is what Fabricate RENDERS, because
 * the studio is built from Fabricate's existing shared manager classes (`.manager-title`,
 * `.manager-chip`, `.manager-system-name`, …) whose rem-based sizes are already
 * established and shared with six other editors. Decision 1 accepts small drift from
 * the prototype for exactly this reason: re-authoring those shared sizes to hit the
 * prototype's px exactly would silently re-type every other manager surface.
 *
 * The EXPECTED map below is therefore measured from the real cascade and cross-checked
 * against the scale above; each entry notes the prototype target it corresponds to.
 * Change a size on purpose -> update this map on purpose.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const repoRoot = resolve(import.meta.dirname, '../..');
const foundryCss = readFileSync(resolve(repoRoot, 'tests/fixtures/foundry-core-min.css'), 'utf8');
const fabricateCss = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');

// One representative element per role, using the exact Component Studio classes,
// wrapped in the Foundry app shell so `.application`'s 14px base + the @layer reset
// apply. Both routes are represented: the browser list and the editor column.
const FIXTURE = `
  <div class="application theme-dark">
    <section class="window-content">
      <div class="fabricate fabricate-manager" data-fabricate-theme="dark" data-manager-view="components">
        <section class="manager-section-header">
          <div class="manager-heading">
            <p class="manager-kicker" data-m="kicker">Alchemy</p>
            <h2 class="manager-title" data-m="title">Component directory</h2>
            <p class="manager-subtitle" data-m="subtitle">Crafting metadata on borrowed Foundry items.</p>
          </div>
        </section>
        <section class="manager-toolbar">
          <div class="manager-toolbar-primary">
            <label class="manager-search">
              <input type="search" data-m="search" value="iron">
            </label>
            <label class="manager-filter">
              <span data-m="filter-label">Category</span>
              <select data-m="filter-select"><option>All categories</option></select>
            </label>
            <button class="manager-button manager-component-group-toggle" data-m="toolbar-button"><span>Group by category</span></button>
          </div>
        </section>
        <div class="manager-components-list">
          <div class="manager-component-row">
            <button class="manager-component-identity">
              <span class="manager-component-chip"><img alt="" src=""></span>
              <span class="manager-system-copy">
                <span class="manager-system-name" data-m="row-name">Iron Ore</span>
                <span class="manager-system-description" data-m="row-description">Unrefined metal.</span>
              </span>
            </button>
            <span class="manager-component-row-meta">
              <span class="manager-chip manager-component-category-badge" data-m="row-badge">Reagent</span>
              <span class="manager-chip is-info manager-component-difficulty-badge" data-m="row-difficulty"><span>Progressive difficulty 2</span></span>
            </span>
          </div>
        </div>
      </div>

      <div class="fabricate fabricate-manager" data-fabricate-theme="dark" data-manager-view="component-edit">
        <form class="manager-component-edit-view">
          <section class="manager-task-core-card manager-component-identity-strip">
            <div class="manager-task-card-heading">
              <div>
                <h3 data-m="panel-title">Identity</h3>
                <p class="manager-muted" data-m="panel-sub">This component is backed by a Foundry item.</p>
              </div>
            </div>
            <div class="manager-component-identity-fields">
              <div class="manager-field manager-component-readonly-field">
                <span class="manager-component-readonly-label" data-m="readonly-label"><span>Name</span></span>
                <p class="manager-component-readonly-value" data-m="readonly-value">Iron Ore</p>
              </div>
            </div>
          </section>
          <section class="manager-task-core-card">
            <label class="manager-field">
              <span data-m="field-label">Component category</span>
              <select class="manager-input" data-m="field-select"><option>General</option></select>
            </label>
          </section>
          <input type="text" data-m="bleed-baseline" value="bare">
        </form>
      </div>
    </section>
  </div>`;

function page() {
  return `<!doctype html><html><head><meta charset="utf-8">
    <style>${foundryCss}</style><style>${fabricateCss}</style>
    <style>:root{--font-primary:Arial,sans-serif}</style></head>
    <body class="game">${FIXTURE}</body></html>`;
}

// px at the 16px root: rem * 16. Each entry names the Phase 0 prototype target it
// corresponds to, so drift from the design is visible rather than merely tolerated.
const EXPECTED = {
  kicker: 11.52, // 0.72rem — prototype eyebrow 9px @ .14em
  title: 22, // prototype browser h2 22px serif — an exact match
  subtitle: 11.52, // 0.72rem — prototype page subtitle 12.5px sans
  // 0.72rem via the Component-Studio bleed fix. Was 14 (Foundry's app base):
  // `.manager-search input` has no base size, and only `.manager-recipe-toolbar`
  // scoped its own.
  search: 11.52, // prototype search input 12.5px sans
  'filter-label': 12.48, // 0.78rem — prototype toolbar micro-label 8.5px @ .08em
  'filter-select': 12.48, // 0.78rem — prototype filter/sort select 11.5px sans
  'toolbar-button': 11.52, // 0.72rem — bleed fix; prototype control text 12.5px sans
  'row-name': 12.16, // 0.76rem serif — bleed fix; prototype row name 13.5px serif
  'row-description': 12.48, // 0.78rem — prototype row description 11px sans
  'row-badge': 12, // 0.75rem — prototype row badge/chip 9px sans
  'row-difficulty': 12, // same chip family
  'panel-title': 16, // 1rem — prototype panel h3 14px serif
  'panel-sub': 12.48, // 0.78rem — prototype panel sub 10px sans
  'readonly-label': 13.12, // 0.82rem — locked-field label
  'readonly-value': 14.4, // 0.9rem — locked-field value
  'field-label': 13.12, // 0.82rem — field label
  'field-select': 13.12, // 0.82rem — field control
  // The cascade context. A bare control inherits Foundry's 14px app base; any role
  // above landing on 14 means its rule stopped applying and Foundry bled through.
  'bleed-baseline': 14,
};

test('component studio font-sizes are pinned under real Foundry core CSS', async () => {
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    await p.setContent(page(), { waitUntil: 'load' });

    const rootPx = await p.evaluate(() =>
      parseFloat(getComputedStyle(document.documentElement).fontSize)
    );
    assert.equal(rootPx, 16, 'html root font-size is the 16px rem anchor');

    const measured = await p.evaluate(() => {
      const out = {};
      document.querySelectorAll('[data-m]').forEach((el) => {
        out[el.getAttribute('data-m')] = parseFloat(getComputedStyle(el).fontSize);
      });
      return out;
    });

    for (const [role, expected] of Object.entries(EXPECTED)) {
      assert.equal(
        measured[role],
        expected,
        `${role} should compute to ${expected}px (measured ${measured[role]}px)`
      );
    }

    // Every studio role except the deliberate baseline must be free of the bleed.
    for (const [role, px] of Object.entries(measured)) {
      if (role === 'bleed-baseline') continue;
      assert.notEqual(px, 14, `${role} is at the Foundry 14px app base — its rule stopped applying`);
    }
  } finally {
    await browser.close();
  }
});
