/**
 * Issue 2820: the six `RadioCardGroup` badge tones ink their text on the tone's soft ground over a
 * card's rest ground and over a chosen card's, each clearing 4.5:1 in all seven themes; the tokens
 * are read off the Chip and sheet rules. The tones the badge refuses (`neutral`, `subtle`, `muted`)
 * fall short on those grounds, which is why the set is closed.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { collectStyleCorpus, rulesIn } from '../helpers/styleBlockScan.js';
import { declaredToken, shortfalls, themePalettes } from '../helpers/themePaletteContrast.js';

const CHIP = 'src/ui/svelte/components/Chip.svelte';
const SHEET = 'styles/fabricate.css';
const corpus = collectStyleCorpus();
const themes = themePalettes(rulesIn(corpus['styles/fabricate.css']));

const chip = (tone, property) =>
  declaredToken(rulesIn(corpus[CHIP]), `.manager-chip.is-${tone}`, property, CHIP);
const card = (selector, property) =>
  declaredToken(rulesIn(corpus[SHEET]), selector, property, SHEET);

const CARD = '.fabricate-option-cards .manager-resolution-option';
const GROUNDS = Object.freeze({
  rest: [card(CARD, 'background')],
  chosen: [card(`${CARD}.is-active::before`, 'background'), card(CARD, 'background')],
});

for (const tone of ['positive', 'warning', 'info', 'danger', 'accent', 'secondary']) {
  for (const [state, ground] of Object.entries(GROUNDS)) {
    test(`a ${tone} badge clears 4.5:1 on a ${state} card`, () => {
      assert.deepEqual(
        shortfalls(themes, chip(tone, 'color'), [chip(tone, 'background'), ...ground]),
        []
      );
    });
  }
}

test('the card grounds are the page rung and the soft surface over it', () => {
  assert.deepEqual(GROUNDS.rest, ['--fab-bg-2']);
  assert.deepEqual(GROUNDS.chosen, ['--fab-surface-soft', '--fab-bg-2']);
});

test('the neutral tone, which the badge refuses, falls short on a chosen card', () => {
  const found = shortfalls(themes, chip('neutral', 'color'), [
    '--fab-overlay-light-06',
    ...GROUNDS.chosen,
  ]);
  assert.ok(found.length > 0, 'the closed set keeps what it must');
});
