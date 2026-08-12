/*
 * The System settings modifier row's SUMMARY alignment, rendered.
 *
 * THE DEFECT. A freshly added modifier drew its chevron, glyph and label in the MIDDLE of its
 * row while every authored entry above it sat left. The row is a `<button>`
 * (`.manager-modifier-summary`), Foundry's core `button` rule declares
 * `display: flex; justify-content: center`, and `styles/fabricate.css` restated `display`
 * without ever restating `justify-content` — so the row has been centring its children since
 * it was written. It was invisible because `.manager-modifier-expression` is the row's one
 * elastic child (`flex: 1 1 auto`): while an expression is present it absorbs every pixel of
 * free space and a centring container has nothing to distribute. A NEW entry has an empty
 * expression, the `→ path` span is not rendered at all, nothing grows, and the row centres.
 *
 * WHY THIS IS A RENDERED GATE. happy-dom computes no cascade, so no mounted test can see it;
 * and no source-text assertion can either, because the defect is the ABSENCE of a declaration
 * whose default comes from a stylesheet that is not in the repository. The two states have to
 * be laid out by a real engine, under core's own button rule. Without that rule this gate is
 * VACUOUS: the initial `justify-content` is `normal`, which lays out as `flex-start`, so both
 * states line up whether or not the fix is present.
 *
 * WHY THE HOST RULE IS STUBBED HERE AND NOT IN THE SHARED STAND-IN.
 * `tests/fixtures/foundry-core-min.css` is the repository's Foundry stand-in and it does NOT
 * carry core's bare `button` rule, which is a real gap in it — that file's own header argues
 * that omitting a load-bearing GEOMETRY rule makes a gate "measure a page the product never
 * draws", and this defect is exactly that. Adding the rule there was tried and reds
 * `tests/components/alchemy-known-recipe-layout.test.js`, whose fixture renders a `<button>`
 * recipe row that stops overflowing once core's `display: flex` reaches it. That is a finding
 * about THAT gate rather than about this one, so the shared fixture is left alone and the rule
 * is stubbed locally, verbatim, with its provenance stated. Routing the shared-fixture gap is
 * a separate piece of work.
 *
 * WHAT IT ASSERTS. The label sits at the SAME offset from its row's left edge with and without
 * an expression. Stated as a relationship between the two states rather than as an absolute
 * pixel, because the absolute depends on the chevron and glyph widths — which are allowed to
 * change — while "a row with less content still starts in the same place" is the rule.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const repoRoot = resolve(import.meta.dirname, '../..');
const foundryCss = readFileSync(resolve(repoRoot, 'tests/fixtures/foundry-core-min.css'), 'utf8');
const fabricateCss = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');

/*
 * Core's bare `button` rule, copied from a harvested Foundry 14.365 `css/foundry2.css`
 * (`@layer elements.forms`). Only the three LAYOUT declarations, which are the ones this gate
 * turns on; the rest of core's rule is paint and type.
 *
 * `height: var(--button-size); min-height: var(--button-size)` (`2em`) is deliberately NOT
 * reproduced, and the omission is stated rather than silent: that fixed height is a separate
 * trap — it crops a `<button>` used as a card — and modelling it here would make this gate
 * about two things at once. It stays unmodelled anywhere in this repository.
 *
 * A stub LOOSER than the real host produces false passes, so this is deliberately not "a
 * centring rule of my own": it is the selector, the layer position and the declarations core
 * actually ships. Unlayered `fabricate.css` beats it exactly as it does in Foundry.
 */
const FOUNDRY_BUTTON_RULE = `
@layer reset, variables, elements, blocks, applications;
@layer elements {
  button {
    display: flex;
    justify-content: center;
    align-items: center;
  }
}`;

let browser;

before(async () => {
  browser = await chromium.launch();
});

after(async () => {
  await browser.close();
});

/**
 * The exact markup `SystemEditView.svelte` emits for one collapsed modifier row.
 *
 * `expression` empty models a FRESHLY ADDED entry, which is the state the defect needs: the
 * component renders the `→ path` span behind `{#if modifierExpression}`, so an empty
 * expression removes the element rather than emptying it.
 *
 * @param {string} label Entry label.
 * @param {string} expression Display expression, or '' for a new entry.
 * @returns {string} One `<li>` of the modifier list.
 */
function modifierRow(label, expression) {
  const path = expression
    ? `<span class="manager-modifier-expression" data-modifier-expression>
         <i class="fa-solid fa-arrow-right-long" aria-hidden="true"></i>
         ${expression}
       </span>`
    : '';
  return `
    <li class="manager-modifier-item" data-system-modifier="${label}">
      <div class="manager-modifier-header">
        <button type="button" class="manager-modifier-summary" data-toggle-modifier>
          <i class="fa-solid fa-chevron-right manager-modifier-chevron" aria-hidden="true"></i>
          <span class="manager-modifier-icon"><i class="fa-solid fa-user" aria-hidden="true"></i></span>
          <span class="manager-modifier-label">${label}</span>
          ${path}
        </button>
        <button type="button" class="manager-icon-button" aria-label="Delete modifier">
          <i class="fa-solid fa-trash" aria-hidden="true"></i>
        </button>
      </div>
    </li>`;
}

const FIXTURE = `
<div class="application theme-dark">
  <section class="window-content">
    <div class="fabricate fabricate-manager" data-fabricate-theme="dark" data-manager-view="systems">
      <section class="manager-inspector-card" data-system-modifiers style="width: 720px">
        <ul class="manager-character-modifier-list">
          ${modifierRow('Survival', '@skills.sur.mod')}
          ${modifierRow('Modifier', '')}
        </ul>
      </section>
    </div>
  </section>
</div>`;

test('a modifier row with NO expression keeps its glyph and label left-aligned', async () => {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    await page.setContent(
      `<style>${foundryCss}</style><style>${FOUNDRY_BUTTON_RULE}</style>` +
        `<style>${fabricateCss}</style><style>html,body{margin:0}</style>${FIXTURE}`
    );
    const offsets = await page.evaluate(() =>
      [...document.querySelectorAll('.manager-modifier-summary')].map((summary) => ({
        entry: summary.querySelector('.manager-modifier-label').textContent.trim(),
        hasExpression: Boolean(summary.querySelector('[data-modifier-expression]')),
        glyph:
          summary.querySelector('.manager-modifier-icon').getBoundingClientRect().left -
          summary.getBoundingClientRect().left,
        label:
          summary.querySelector('.manager-modifier-label').getBoundingClientRect().left -
          summary.getBoundingClientRect().left,
      }))
    );

    const authored = offsets.find((row) => row.hasExpression);
    const fresh = offsets.find((row) => !row.hasExpression);
    // The two states are BOTH present, or the comparison below compares one row with itself.
    assert.ok(authored && fresh, 'the fixture renders one authored entry and one fresh one');

    for (const part of ['glyph', 'label']) {
      assert.ok(
        Math.abs(fresh[part] - authored[part]) <= 0.5,
        `a fresh entry's ${part} starts where an authored entry's does: ` +
          `authored ${authored[part].toFixed(1)}px, fresh ${fresh[part].toFixed(1)}px from the ` +
          'row edge. A gap here is Foundry’s core `button { justify-content: center }` reaching ' +
          'a row that stopped having an elastic child to absorb its free space'
      );
    }
  } finally {
    await context.close();
  }
});
