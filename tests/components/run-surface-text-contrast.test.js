/**
 * Issue 2329 and decision D13 of issue 2257: the run surfaces' small text takes the first of muted
 * and secondary that clears 4.5:1 on each flattened ground it is drawn on, in all seven themes.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { collectStyleCorpus, rulesIn } from '../helpers/styleBlockScan.js';
import { declaredToken, shortfalls, themePalettes } from '../helpers/themePaletteContrast.js';

const SHEET = 'styles/fabricate.css';
const LADDER = 'src/ui/svelte/components/OutcomeLadder.svelte';
const SCALE = 'src/ui/svelte/components/YieldScale.svelte';
const corpus = collectStyleCorpus();
const themes = themePalettes(rulesIn(corpus[SHEET]));

const token = (file, selector, property) =>
  declaredToken(rulesIn(corpus[file]), selector, property, file);
const PANE_GROUNDS = ['--fab-bg-1', '--fab-bg-2', '--fab-surface'];

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
