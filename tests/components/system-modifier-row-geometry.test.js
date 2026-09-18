/*
 * The System settings modifier row's RENDERED GEOMETRY.
 * THE DEFECT. A freshly added modifier drew its chevron, glyph and label in the MIDDLE of its
 * row while every authored entry above it sat left. The row is a `<button>`
 * (`.manager-modifier-summary`), Foundry's core `button` rule declares
 * `display: flex; justify-content: center`, and `styles/fabricate.css` restated `display`
 * without ever restating `justify-content` — so the row has been centring its children since
 * it was written. It was invisible because `.manager-modifier-expression` is the row's one
 * elastic child (`flex: 1 1 auto`): while an expression is present it absorbs every pixel of
 * free space and a centring container has nothing to distribute. A NEW entry has an empty
 * expression, the `→ path` span is not rendered at all, nothing grows, and the row centres.
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
    <li class="manager-modifier-item" data-world-modifier="${label}">
      <div class="manager-modifier-header">
        <button type="button" class="manager-modifier-summary" data-toggle-modifier>
          <i class="fa-solid fa-chevron-right manager-modifier-chevron" aria-hidden="true"></i>
          <span class="manager-modifier-icon"><i class="fa-solid fa-user" aria-hidden="true"></i></span>
          <span class="manager-modifier-label">${label}</span>
          ${path}
        </button>
        <button type="button" class="fabricate-icon-button manager-icon-button" aria-label="Delete modifier">
          <i class="fa-solid fa-trash" aria-hidden="true"></i>
        </button>
      </div>
    </li>`;
}

const FIXTURE = `
<div class="application theme-dark">
  <section class="window-content">
    <div class="fabricate fabricate-manager" data-fabricate-theme="dark" data-manager-view="systems">
      <section class="fabricate-card manager-inspector-card" data-world-modifiers style="width: 720px">
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

/* ── 2. THE EXPRESSION FIELD, AFTER ITS `@` CAP WAS REMOVED ────────────────────────────── */
const FIELD_FIXTURE = `
<div class="application theme-dark">
  <section class="window-content">
    <div class="fabricate fabricate-manager" data-fabricate-theme="dark" data-manager-view="systems">
      <div class="manager-modifier-body" style="width: 520px">
        <label class="fabricate-field manager-field" data-case="label">
          <span>Label</span>
          <input type="text" data-world-modifier-field="label" value="Medicine" />
        </label>
        <label class="fabricate-field manager-field" data-case="plain">
          <span>Expression</span>
          <input type="text" data-world-modifier-field="expression" value="@abilities.med.mod" />
        </label>
        <label class="manager-tool-bonus-field" data-case="capped">
          <span>Bonus expression</span>
          <div class="manager-prerequisite-path-input manager-roll-data-expression-input">
            <span class="manager-prerequisite-at" aria-hidden="true">@</span>
            <input type="text" data-roll-data-expression="tool-bonus" value="prof" />
          </div>
        </label>
      </div>
    </div>
  </section>
</div>`;

test('the un-capped expression field renders as an ordinary field, with no affix seam', async () => {
  // THE FIXTURE IS ANCHORED TO THE COMPONENT.
  const component = readFileSync(
    resolve(repoRoot, 'src/ui/svelte/apps/manager/RollDataExpressionInput.svelte'),
    'utf8'
  );
  const markup = component.slice(component.indexOf('{#snippet field()}'));
  const branch = markup.indexOf('{:else}');
  assert.ok(branch > -1, 'the component still branches on `sigil`');
  assert.ok(
    markup.slice(0, branch).includes('manager-prerequisite-path-input'),
    'the SIGIL branch still renders the affix wrapper, which is what the un-capped branch is ' +
      'measured AGAINST below'
  );
  // THE TOOL STUDIO NO LONGER DEPENDS ON IT.
  assert.ok(
    !markup.slice(branch).includes('manager-prerequisite-path-input'),
    'and the un-capped branch renders a BARE input: the wrapper is the prerequisite field’s ' +
      'affix layout, and a field with no affix that keeps it draws the seam this test is about'
  );
  // Scoped to the MARKUP, not the whole file.
  assert.ok(
    !markup.includes('is-formula'),
    'and the dead `is-formula` hook is gone from the markup: a class the sheet has no rule for ' +
      'reads as a fix and is not one'
  );

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    await page.setContent(
      `<style>${foundryCss}</style><style>${FOUNDRY_BUTTON_RULE}</style>` +
        `<style>${fabricateCss}</style><style>html,body{margin:0}</style>${FIELD_FIXTURE}`
    );
    const fields = await page.evaluate(() =>
      Object.fromEntries(
        [...document.querySelectorAll('[data-case]')].map((cell) => {
          const input = cell.querySelector('input');
          return [
            cell.dataset.case,
            {
              // The measured claim is the INSET.
              inset: input.getBoundingClientRect().left - cell.getBoundingClientRect().left,
              affixed: Boolean(input.closest('.manager-prerequisite-path-input')),
              ownBorder: getComputedStyle(input).borderLeftWidth,
            },
          ];
        })
      )
    );

    assert.equal(
      fields.plain.affixed,
      false,
      'the un-capped expression field is not inside the prerequisite affix wrapper at all — ' +
        'the class carries a layout for a cap this field does not have'
    );
    assert.ok(
      Math.abs(fields.plain.inset - fields.label.inset) <= 0.5,
      'and its left edge is flush with the plain Label field above it: ' +
        `Label ${fields.label.inset.toFixed(1)}px, Expression ${fields.plain.inset.toFixed(1)}px ` +
        'from their cells. A gap here is the affix wrapper’s `padding-left` plus the gutter it ' +
        'reserves for a cap — the seam this field shipped with'
    );
    assert.equal(
      fields.plain.ownBorder,
      fields.label.ownBorder,
      'and it draws its own edge, as an ordinary field does, rather than letting a wrapper ' +
        'draw one around it'
    );

    // THE NON-VACUITY HALF. The capped shape is the Tool Studio's, unchanged by this work.
    assert.ok(
      Math.abs(fields.capped.inset - fields.label.inset) > 0.5,
      'the capped shape still insets its input behind a cap ' +
        `(${fields.capped.inset.toFixed(1)}px against ${fields.label.inset.toFixed(1)}px), so ` +
        'this measurement can tell the two treatments apart'
    );
  } finally {
    await context.close();
  }
});
