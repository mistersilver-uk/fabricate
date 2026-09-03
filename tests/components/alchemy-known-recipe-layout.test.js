/*
 * Alchemy "Known recipes" card layout gate (issue 675).
 *
 * The maintainer reported a revealed recipe named "Blade Venom" rendering as its
 * right-hand tail ("nom") with left-clipped essence ids in the Alchemy tab's Known
 * column. happy-dom cannot compute the CSS cascade or overflow, so this gate renders
 * the REAL scoped `<style>` blocks from AlchemyView.svelte (the 3-column grid, whose
 * `.alchemy-view-column { min-width: 0 }` is the constraint that matters) and
 * KnownRecipesColumn.svelte (the card) in Chromium under a faithful stand-in for
 * Foundry V13 core CSS, then measures the rendered name/sig overflow.
 *
 * It proves two things:
 *  1. Bug 2 ("nom") was a SYMPTOM of Bug 1: the name ALWAYS renders fully — even when
 *     the signature is the long, unresolved raw-essence-id string that Bug 1 produced.
 *     Only the sig overflows, and it clips from the RIGHT (ellipsis), never the name.
 *     Once the essence ingredients resolve to "Toxic x2 . Water x1" nothing overflows
 *     the column at all.
 *  2. A genuinely long name clips from the RIGHT with an ellipsis (scrollWidth >
 *     clientWidth, left edge pinned), so a name is never shown as only its tail.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const repoRoot = resolve(import.meta.dirname, '../..');
const foundryCss = readFileSync(resolve(repoRoot, 'tests/fixtures/foundry-core-min.css'), 'utf8');
const fabricateCss = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');

/** Extract a component's scoped `<style>` block VERBATIM (not a hand-copy). */
function styleOf(rel) {
  const src = readFileSync(resolve(repoRoot, rel), 'utf8');
  return src.slice(src.indexOf('<style>') + 7, src.indexOf('</style>'));
}
const viewCss = styleOf('src/ui/svelte/apps/alchemy/AlchemyView.svelte');
const cardCss = styleOf('src/ui/svelte/apps/alchemy/KnownRecipesColumn.svelte');

// The Bug-1 string (raw essence ids) vs the resolved string the fix produces.
const LONG_SIG =
  'c6b220a6-8111-47ea-a4d7-7af2264e7fef ×1 · a1310622-8fc8-48a9-8bc0-d19c0857af02 ×1';
const SHORT_SIG = 'Toxic ×2 · Water ×1';

function card(name, sig) {
  return `
  <li>
    <button type="button" class="alchemy-recipe" data-alchemy-recipe="r">
      <span class="alchemy-recipe-top">
        <span class="alchemy-recipe-icon"><i class="fas fa-flask"></i></span>
        <span class="alchemy-recipe-meta">
          <span class="alchemy-recipe-name" data-probe-name>${name}</span>
          <span class="alchemy-recipe-sig" data-probe-sig>${sig}</span>
        </span>
      </span>
    </button>
  </li>`;
}

// The REAL AlchemyView grid nesting: container -> grid -> .alchemy-view-column -> card.
function page(name, sig, winWidth) {
  return `<!doctype html><html><head><meta charset="utf-8">
    <style>${foundryCss}</style><style>${fabricateCss}</style>
    <style>${viewCss}</style><style>${cardCss}</style>
    <style>:root{--font-primary:Arial,sans-serif}.win{width:${winWidth}px;height:600px}</style></head>
    <body class="game"><div class="application theme-dark"><section class="window-content">
      <div class="fabricate" data-fabricate-theme="dark"><div class="win">
        <div class="alchemy-view-container"><div class="alchemy-view-grid" data-alchemy-state="workbench">
          <div class="alchemy-view-column alchemy-view-known"><div class="alchemy-known">
            <ul class="alchemy-known-list">${card(name, sig)}</ul>
          </div></div>
          <section class="alchemy-view-column alchemy-view-bench"></section>
          <section class="alchemy-view-column alchemy-view-inventory"></section>
        </div></div>
      </div></div>
    </section></div></body></html>`;
}

async function measure(p, name, sig, winWidth = 1024) {
  await p.setContent(page(name, sig, winWidth), { waitUntil: 'load' });
  return p.evaluate(() => {
    const el = (sel) => document.querySelector(sel);
    const rect = (node) => {
      const b = node.getBoundingClientRect();
      return { left: Math.round(b.left), scrollW: node.scrollWidth, clientW: node.clientWidth };
    };
    const list = el('.alchemy-known-list');
    return {
      name: rect(el('[data-probe-name]')),
      sig: rect(el('[data-probe-sig]')),
      list: { scrollW: list.scrollWidth, clientW: list.clientWidth },
    };
  });
}

test('the recipe name renders fully even when the signature is a long raw-essence-id string', async () => {
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({ viewport: { width: 1400, height: 900 } });

    // Bug-1 state: the sig is the long raw-id string. The NAME must still render fully
    // (this is the Bug-2 finding: the grid's `min-width: 0` protects the name column,
    // so "Blade Venom" was never actually clipped to "nom" by the real CSS).
    const long = await measure(p, 'Blade Venom', LONG_SIG);
    assert.equal(
      long.name.scrollW,
      long.name.clientW,
      'the name renders fully (not clipped) even beside a long unresolved sig'
    );
    assert.ok(
      long.sig.scrollW > long.sig.clientW,
      'the long raw-id sig is the only thing that overflows, and it clips (ellipsis)'
    );

    // Bug-1 fixed: the resolved sig fits, so NOTHING overflows the column.
    const short = await measure(p, 'Blade Venom', SHORT_SIG);
    assert.equal(short.name.scrollW, short.name.clientW, 'the name renders fully with the resolved sig');
    assert.equal(short.sig.scrollW, short.sig.clientW, 'the resolved sig fits without clipping');
    assert.equal(
      short.list.scrollW,
      short.list.clientW,
      'with the resolved sig the list has no horizontal overflow at all'
    );
  } finally {
    await browser.close();
  }
});

test('a genuinely long recipe name clips from the RIGHT with an ellipsis, never its tail', async () => {
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const before = await measure(p, 'Blade Venom', SHORT_SIG);
    const long = await measure(p, 'Supercalifragilistic Elixir of Everlasting Vitality', SHORT_SIG);
    // A long name overflows its box (scrollWidth > clientWidth) but stays left-anchored,
    // so text-overflow: ellipsis trims the RIGHT. The left edge never shifts (which is
    // what would reveal only a right-hand tail like "nom").
    assert.ok(long.name.scrollW > long.name.clientW, 'a long name overflows and is clipped');
    assert.equal(long.name.left, before.name.left, 'the name stays left-anchored (clips right, not left)');
    assert.equal(long.name.clientW, before.name.clientW, 'the name column width is stable regardless of name length');
  } finally {
    await browser.close();
  }
});
