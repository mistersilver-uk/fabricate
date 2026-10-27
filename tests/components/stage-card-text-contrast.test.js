/**
 * Issue 2353 and decision D13 of issue 2257: `StageCard`'s and `StageNav`'s small text takes the
 * first of muted and secondary that clears 4.5:1 on each flattened ground it is drawn on, in all
 * seven themes.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { collectStyleCorpus, rulesIn } from '../helpers/styleBlockScan.js';
import { declaredToken, shortfalls, themePalettes } from '../helpers/themePaletteContrast.js';

const CARD = 'src/ui/svelte/components/StageCard.svelte';
const NAV = 'src/ui/svelte/components/StageNav.svelte';
const corpus = collectStyleCorpus();
const themes = themePalettes(rulesIn(corpus['styles/fabricate.css']));

const token = (file, selector, property) =>
  declaredToken(rulesIn(corpus[file]), selector, property, file);

/** The card's own ground, and the pane grounds an inactive (unpainted) card sits on. */
const cardGround = () => token(CARD, '.fab-stage-card', 'background');
const PANE_GROUNDS = ['--fab-bg-1', '--fab-surface'];

for (const [label, selector] of [
  ['note', '.fab-stage-card-note'],
  ['summary', '.fab-stage-card-summary'],
  ['fact label', '.fab-stage-card-fact'],
  ['fact value', '.fab-stage-card-fact-value'],
  ['inactive name', '.fab-stage-card.is-inactive .fab-stage-card-name'],
]) {
  test(`the stage card's ${label} inks muted and clears 4.5:1 on the card and the pane`, () => {
    const ink = token(CARD, selector, 'color');
    assert.equal(ink, '--fab-text-muted');
    for (const ground of [cardGround(), ...PANE_GROUNDS]) {
      assert.deepEqual(shortfalls(themes, ink, [ground]), [], ground);
    }
  });
}

test("the stage card's subtle ink would fall short on the card, which is why muted is the floor", () => {
  assert.notDeepEqual(shortfalls(themes, '--fab-text-subtle', [cardGround()]), []);
});

test("an inactive card's numeral inks secondary and clears 4.5:1 on its fill over the pane", () => {
  const selector = '.fab-stage-card.is-inactive .fab-stage-card-number';
  const ink = token(CARD, selector, 'color');
  const fill = token(CARD, selector, 'background');
  assert.equal(ink, '--fab-text-secondary');
  for (const ground of PANE_GROUNDS) {
    assert.deepEqual(shortfalls(themes, ink, [fill, ground]), [], ground);
  }
  assert.notDeepEqual(
    shortfalls(themes, '--fab-text-muted', [fill, '--fab-surface']),
    [],
    'muted falls short there'
  );
});

test("the stage nav's numerals and position line ink muted and clear 4.5:1 on each ground", () => {
  const position = token(NAV, '.fab-stage-nav-position', 'color');
  assert.equal(position, '--fab-text-muted');
  for (const ground of [cardGround(), ...PANE_GROUNDS]) {
    assert.deepEqual(shortfalls(themes, position, [ground]), [], ground);
  }
  assert.equal(token(NAV, '.fab-stage-nav-number', 'color'), position);
  const well = token(NAV, '.fab-stage-nav-number', 'background');
  assert.equal(well, '--fab-surface-soft');
  for (const ground of [cardGround(), ...PANE_GROUNDS]) {
    assert.deepEqual(shortfalls(themes, '--fab-text-muted', [well, ground]), [], ground);
  }
});
