/**
 * Issue 2329 and decision D13 of issue 2257: the run surfaces' small text takes the first of muted
 * and secondary that clears 4.5:1 on each flattened ground it is drawn on, in all seven themes.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { collectStyleCorpus, rulesIn, splitSelectorList } from '../helpers/styleBlockScan.js';
import {
  PANE_GROUNDS,
  propertiesOf,
  shortfalls,
  themePalettes,
  tokenReader,
} from '../helpers/themePaletteContrast.js';

const SHEET = 'styles/fabricate.css';
const LADDER = 'src/ui/svelte/components/OutcomeLadder.svelte';
const SCALE = 'src/ui/svelte/components/YieldScale.svelte';
const corpus = collectStyleCorpus();
const themes = themePalettes(rulesIn(corpus[SHEET]));

const token = tokenReader(corpus);

test("a dense row's quantity inherits muted and clears 4.5:1 on the row and on the card ground", () => {
  const ink = token(SHEET, '.fabricate-list-row', 'color');
  assert.equal(ink, '--fab-text-muted');
  const row = token(SHEET, '.fabricate-list-row', 'background');
  const card = token(SHEET, '.fabricate-list-row.is-card', 'background');
  for (const ground of [row, card]) assert.deepEqual(shortfalls(themes, ink, [ground]), []);
  assert.notDeepEqual(shortfalls(themes, '--fab-text-subtle', [row]), [], 'subtle falls short');
});

test("a cleared row's quantity inks secondary, because muted falls short on its success wash", () => {
  const wash = token(SHEET, '.fabricate-list-row.is-positive', 'background');
  const row = token(SHEET, '.fabricate-list-row', 'background');
  const ink = token(SHEET, '.fabricate-list-row.is-positive', 'color');
  assert.equal(ink, '--fab-text-secondary');
  assert.deepEqual(shortfalls(themes, ink, [wash, row]), []);
  assert.notDeepEqual(shortfalls(themes, '--fab-text-muted', [wash, row]), [], 'muted falls short');
});

for (const [label, file, selector] of [
  ['the ladder’s empty-tier text', LADDER, '.fab-outcome-empty'],
  ['the ladder’s hint', LADDER, '.fab-outcome-hint'],
  ['the scale’s cut note', SCALE, '.fab-yield-cut-note'],
  ['the scale’s hint', SCALE, '.fab-yield-hint'],
]) {
  test(`${label} inks muted and clears 4.5:1 on each ground a pane sits on`, () => {
    const ink = token(file, selector, 'color');
    assert.equal(ink, '--fab-text-muted');
    for (const ground of PANE_GROUNDS) assert.deepEqual(shortfalls(themes, ink, [ground]), []);
  });
}

test("the ladder's empty-tier text clears 4.5:1 on the tier it is drawn on", () => {
  const tier = token(LADDER, '.fab-outcome-tier', 'background');
  const ink = token(LADDER, '.fab-outcome-empty', 'color');
  assert.deepEqual(shortfalls(themes, ink, [tier]), []);
  assert.notDeepEqual(shortfalls(themes, '--fab-text-subtle', [tier]), [], 'subtle falls short');
});

const OPEN = '> .fabricate-list-row-open';
const STATES = Object.freeze({
  selected: `.fabricate-list-row:not(.is-danger):has(${OPEN}[aria-pressed='true'])`,
  hover: `.fabricate-list-row:not(.is-danger):has(${OPEN}:enabled:hover:not([aria-pressed='true'], [aria-disabled='true']))`,
  danger: '.fabricate-list-row.is-danger',
});

test('a selected, hovered or danger row inks secondary and clears 4.5:1 on its wash over each ground', () => {
  for (const selector of Object.values(STATES)) {
    assert.equal(token(SHEET, selector, 'color'), '--fab-text-secondary', selector);
  }
  for (const [state, selector] of Object.entries(STATES)) {
    const wash = token(SHEET, selector, 'background');
    for (const ground of PANE_GROUNDS) {
      assert.deepEqual(
        shortfalls(themes, '--fab-text-secondary', [wash, ground]),
        [],
        `${state} ${ground}`
      );
    }
    assert.notDeepEqual(
      shortfalls(themes, '--fab-text-muted', [wash, '--fab-bg-2']),
      [],
      `muted falls short on the ${state} wash`
    );
  }
});

test('no rule recolours a row’s quantity or detail, so both inherit the row’s ink', () => {
  const recoloured = Object.entries(corpus).flatMap(([file, css]) =>
    rulesIn(css).flatMap((rule) =>
      propertiesOf(rule).has('color')
        ? splitSelectorList(rule.selector)
            .filter((selector) =>
              /\.fabricate-list-row-(?:quantity|detail)(?![\w-])/u.test(
                selector.split(/\s+/u).at(-1)
              )
            )
            .map((selector) => `${file}: ${selector}`)
        : []
    )
  );
  assert.deepEqual(recoloured, []);
});

test('a muted row’s name inks muted and clears 4.5:1 on the row and on the card ground', () => {
  const ink = token(SHEET, '.fabricate-list-row.is-muted .fabricate-list-row-name', 'color');
  assert.equal(ink, '--fab-text-muted');
  for (const selector of ['.fabricate-list-row', '.fabricate-list-row.is-card']) {
    const ground = token(SHEET, selector, 'background');
    assert.deepEqual(shortfalls(themes, ink, [ground]), [], ground);
  }
});

test('the data table count shares the row quantity ink and clears 4.5:1 on the table ground', () => {
  const ink = token(SHEET, '.fabricate-data-table .fabricate-data-table-count', 'color');
  assert.equal(ink, '--fab-text-muted');
  const ground = token(SHEET, '.fabricate-data-table', 'background');
  assert.deepEqual(shortfalls(themes, ink, [ground]), []);
});
