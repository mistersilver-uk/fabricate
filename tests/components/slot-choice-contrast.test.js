/**
 * Issue 2257 D16 and task 10b: each slot pip's ink on its solid fill, and a short candidate's
 * danger reading on its own ground and on the chosen face, clear 4.5:1 in all seven themes.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { collectStyleCorpus, rulesIn } from '../helpers/styleBlockScan.js';
import {
  declaredToken,
  shortfalls as inkShortfalls,
  themePalettes,
} from '../helpers/themePaletteContrast.js';

const TILE = 'src/ui/svelte/components/SlotTile.svelte';
const LIST = 'src/ui/svelte/components/ChoiceOptionList.svelte';
const corpus = collectStyleCorpus();
const themes = themePalettes(rulesIn(corpus['styles/fabricate.css']));

const declared = (file, selector, property) =>
  declaredToken(rulesIn(corpus[file]), selector, property);
const shortfalls = (ink, stack) => inkShortfalls(themes, ink, stack);

test('each slot pip is inked per D16 and clears 4.5:1 on its solid fill', () => {
  for (const [selector, ink] of [
    ['.fab-slot-pip', '--fab-on-success'],
    ['.is-short .fab-slot-pip', '--fab-on-danger'],
    ['.is-partial .fab-slot-pip', '--fab-bg-0'],
    ['.fab-slot-pip.is-candidate', '--fab-bg-0'],
  ]) {
    assert.equal(declared(TILE, selector, 'color'), ink, `${selector} ink`);
    assert.deepEqual(shortfalls(ink, [declared(TILE, selector, 'background')]), [], selector);
  }
  // Why the met and short pips keep their on-colours (maintainer, 2026-10-10).
  assert.notDeepEqual(shortfalls('--fab-bg-0', ['--fab-success']), []);
  assert.notDeepEqual(shortfalls('--fab-bg-0', ['--fab-danger']), []);
});

test("a short candidate's reading clears 4.5:1 on its own ground and once chosen", () => {
  const ink = declared(LIST, '.fab-choice-option.is-short .fab-choice-option-reading', 'color');
  assert.equal(ink, '--fab-danger-text');
  const ground = declared(LIST, '.fab-choice-option', 'background');
  assert.deepEqual(shortfalls(ink, [ground]), []);
  const chosen = declared(LIST, '.fab-choice-option.is-selected', 'background');
  assert.deepEqual(shortfalls(ink, [chosen, ground]), []);
});
