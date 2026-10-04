/*
 * `.manager-muted.is-danger`, ARBITRATED IN A REAL BROWSER (issue 2097).
 * ── WHY MEASURE RATHER THAN REASON ──────────────────────────────────────────────────────────
 * `WorldToolEntryPage.svelte`'s formula-validation line and `ToolBrowserInspector.svelte`'s
 * validation line both carry `class="manager-muted is-danger"`, and nothing in
 * `styles/fabricate.css` used to target that combination — both rendered in the ordinary muted
 * ink. The fix adds `.fabricate-manager .manager-muted.is-danger { color: var(--fab-danger-text); }`,
 * but TWO OTHER rules share the element on one of the two screens:
 *   - `.fabricate-manager .manager-muted` (the base rule the new one must outrank), and
 *   - `.fabricate-manager .manager-tool-browser-inspector > .manager-muted` (a THIRD selector, at
 *     the SAME specificity as the fix, that wins the properties it states on the Tool inspector
 *     screen alone).
 * Reading the specificities is how the previous, vacuous test happened: it asserted the two class
 * names were present, which was already true before the fix and proves nothing about which colour
 * wins. This file instead puts the REAL stylesheet and the REAL DOM shape of both screens in front
 * of a real Chromium and reads `getComputedStyle(...).color` back.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, test } from 'node:test';

import { chromium } from 'playwright';

const repoRoot = resolve(import.meta.dirname, '../..');
const cssPath = resolve(repoRoot, 'styles/fabricate.css');
const sheet = readFileSync(cssPath, 'utf8');

// THE RULE THIS FILE PINS, matched literally so the "before" fixture can drop exactly it and
// nothing else — not a hand-copied re-typing of the rule that could silently drift from the real
// one, and not a broad regex that could eat a neighbour.
const DANGER_RULE_PATTERN = /\.fabricate-manager \.manager-muted\.is-danger \{[^}]*\}\s*/;

test('the fixture actually states the rule under test, or it measures nothing', () => {
  assert.match(
    sheet,
    DANGER_RULE_PATTERN,
    'styles/fabricate.css must declare `.fabricate-manager .manager-muted.is-danger`'
  );
});

const sheetWithoutDangerRule = sheet.replace(DANGER_RULE_PATTERN, '');

/*
 * THE TWO SCREENS' REAL DOM SHAPE, restated from their `.svelte` sources rather than invented:
 * - `WorldToolEntryPage.svelte`'s formula error `<p>` sits directly under the
 *   `[data-manager-view="world-tool-entry"] .fabricate-manager` root with no intervening class
 *   the sheet keys on.
 * - `ToolBrowserInspector.svelte`'s validation `<p>` is a DIRECT CHILD of the `InspectorCard`
 *   `<section class="fabricate-card manager-tool-browser-inspector">`,
 *   which is the shape the `>` combinator rule at issue targets.
 */
function page(activeSheet) {
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    `<style id="sheet">@layer modules { ${activeSheet} }</style>` +
    '<style>html, body { margin: 0; padding: 0; }</style></head><body>' +
    '<div class="fabricate fabricate-manager" data-fabricate-theme="dark" data-manager-view="world-tool-entry">' +
    '<p class="manager-muted" data-probe="world-tool-entry-resting">Resting muted copy.</p>' +
    '<p class="manager-muted is-danger" data-probe="world-tool-entry-formula-error">' +
    '<i class="fas fa-circle-exclamation" aria-hidden="true"></i>' +
    'This expression parses but cannot be rolled, so every attempt that consults it fails.</p>' +
    '</div>' +
    '<div class="fabricate fabricate-manager" data-fabricate-theme="dark" data-manager-view="tools">' +
    '<section class="fabricate-card manager-tool-browser-inspector">' +
    '<p class="manager-muted" data-tool-inspector-description data-probe="tools-description">' +
    'No description has been added.</p>' +
    '<p class="manager-muted is-danger" data-probe="tools-tool-inspector-validation">' +
    '<i class="fas fa-circle-exclamation" aria-hidden="true"></i>1 issue</p>' +
    '</section></div>' +
    // A REFERENCE ELEMENT, so the assertions below compare against the theme's OWN resolved
    // tokens rather than a hard-coded hex the theme could silently repaint out from under this
    // test — the same reason the design-system ratchets read tokens rather than literals.
    '<p data-probe="reference-danger" style="color: var(--fab-danger-text)"></p>' +
    '<p data-probe="reference-muted" style="color: var(--fab-text-muted)"></p>' +
    '</body></html>'
  );
}

let browser;

before(async () => {
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
});

async function open(activeSheet) {
  const browserPage = await browser.newPage();
  await browserPage.setContent(page(activeSheet));
  return browserPage;
}

const colorOf = (probe) =>
  globalThis.getComputedStyle(
    globalThis.document.querySelector(`[data-probe="${probe}"]`)
  ).color;

test('the two reference tokens actually differ, or the fixture proves nothing', async () => {
  const browserPage = await open(sheet);
  try {
    const danger = await browserPage.evaluate(colorOf, 'reference-danger');
    const muted = await browserPage.evaluate(colorOf, 'reference-muted');
    assert.notEqual(danger, muted, '--fab-danger-text and --fab-text-muted must resolve apart');
  } finally {
    await browserPage.close();
  }
});

for (const probe of ['world-tool-entry-formula-error', 'tools-tool-inspector-validation']) {
  test(`${probe} renders in the muted ink before the fix, proving the gap was real`, async () => {
    const browserPage = await open(sheetWithoutDangerRule);
    try {
      const observed = await browserPage.evaluate(colorOf, probe);
      const muted = await browserPage.evaluate(colorOf, 'reference-muted');
      assert.equal(
        observed,
        muted,
        `${probe} must fall back to the ordinary muted ink once the fix rule is removed`
      );
    } finally {
      await browserPage.close();
    }
  });

  test(`${probe} renders in the danger ink after the fix`, async () => {
    const browserPage = await open(sheet);
    try {
      const observed = await browserPage.evaluate(colorOf, probe);
      const danger = await browserPage.evaluate(colorOf, 'reference-danger');
      assert.equal(observed, danger, `${probe} must render in var(--fab-danger-text)`);
    } finally {
      await browserPage.close();
    }
  });
}
