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
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test, { after, before } from 'node:test';

import { chromium } from 'playwright';

import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
import { walkNodes } from '../helpers/moduleAst.js';
import { componentAstOf } from '../helpers/parsedSource.js';
import { attributeValue } from '../helpers/svelteStructureContract.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const foundryCss = readFileSync(resolve(repoRoot, 'tests/fixtures/foundry-core-min.css'), 'utf8');
const fabricateCss = readStylesheet();

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
        <button type="button" class="fabricate-icon-button" aria-label="Delete modifier">
          <i class="fa-solid fa-trash" aria-hidden="true"></i>
        </button>
      </div>
    </li>`;
}

const FIXTURE = `
<div class="application theme-dark">
  <section class="window-content">
    <div class="fabricate fabricate-manager" data-fabricate-theme="dark" data-manager-view="systems">
      <section class="fabricate-card" data-world-modifiers style="width: 720px">
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
        <label class="fabricate-field" data-case="label">
          <span>Label</span>
          <input type="text" data-world-modifier-field="label" value="Medicine" />
        </label>
        <div class="fabricate-field" data-case="plain">
          <span>Expression</span>
          <input type="text" data-world-modifier-field="expression" value="@abilities.med.mod" />
        </div>
        <label class="fabricate-field manager-prerequisite-path" data-case="capped">
          <span class="visually-hidden">Property path</span>
          <div class="manager-prerequisite-path-input">
            <span class="manager-prerequisite-at" aria-hidden="true">@</span>
            <input type="text" data-prerequisite-path value="abilities.int.mod" />
          </div>
        </label>
      </div>
    </div>
  </section>
</div>`;

const EXPRESSION_FIELD = 'src/ui/svelte/apps/manager/RollDataExpressionInput.svelte';
const PREREQUISITES_CARD = 'src/ui/svelte/apps/manager/system/CharacterPrerequisitesCard.svelte';
const ELEMENT_TYPES = Object.freeze(['RegularElement', 'SvelteElement', 'Component']);
const classTokens = (node) =>
  node.type === 'RegularElement'
    ? (attributeValue(node, 'class') ?? '').split(/\s+/u).filter(Boolean)
    : [];

test('the un-capped expression field renders as an ordinary field, with no affix seam', async () => {
  // The fixture is anchored to the two templates it mirrors, by their parsed markup.
  const { fragment } = componentAstOf(EXPRESSION_FIELD);
  const roots = fragment.nodes.filter(
    (node) => ELEMENT_TYPES.includes(node.type) || node.type === 'IfBlock'
  );
  assert.deepEqual(
    roots.map((node) => (node.type === 'IfBlock' ? '{#if}' : node.name)),
    ['input', '{#if}'],
    "the template's root elements are the input, then one `{#if}`, and nothing wraps the input"
  );
  const [, branch] = roots;
  assert.deepEqual(
    [branch.consequent, branch.alternate].flatMap((arm) =>
      (arm?.nodes ?? [])
        .filter((node) => ELEMENT_TYPES.includes(node.type))
        .map((node) => [node.name, ...classTokens(node)])
    ),
    [['div', 'fab-expr-input-row']],
    'the `{#if}` holds the one row of tokens, which stands after the input and never beside it'
  );
  assert.equal(
    [...walkNodes(fragment)].filter((node) => node.type === 'IfBlock').length,
    1,
    'and it is the single `{#if}`: the field has no second form to branch into'
  );
  const wrapper = [...walkNodes(componentAstOf(PREREQUISITES_CARD).fragment)].find((node) =>
    classTokens(node).includes('manager-prerequisite-path-input')
  );
  assert.deepEqual(
    (wrapper?.fragment.nodes ?? [])
      .filter((node) => ELEMENT_TYPES.includes(node.type))
      .map((node) => [node.name, ...classTokens(node)]),
    [['span', 'manager-prerequisite-at'], ['input']],
    'the prerequisites card still draws the affix wrapper the capped case is measured in'
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

    // The non-vacuity half: the capped shape is the prerequisites card's property path.
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
