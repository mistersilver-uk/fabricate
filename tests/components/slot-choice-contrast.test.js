/**
 * Issue 2257 D16 and task 10b: each slot pip's ink on its solid fill, and a short candidate's
 * danger reading on its own ground and on the chosen face, clear 4.5:1 in all seven themes.
 * Issue 2366: an open tile's empty ring clears the 3:1 non-text floor on the tile in all seven.
 * Issue 2345: the second ring a keyed pressed tile draws is the accent and clears 3:1 on the grounds a tile sits on.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { collectStyleCorpus, rulesIn } from '../helpers/styleBlockScan.js';
import {
  declaredToken,
  propertiesOf,
  shortfalls as inkShortfalls,
  themePalettes,
} from '../helpers/themePaletteContrast.js';

const TILE = 'src/ui/svelte/components/SlotTile.svelte';
const LIST = 'src/ui/svelte/components/ChoiceOptionList.svelte';
const corpus = collectStyleCorpus();
const themes = themePalettes(rulesIn(corpus['styles/fabricate.css']));

const declared = (file, selector, property) =>
  declaredToken(rulesIn(corpus[file]), selector, property, file);
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

test("an open tile's empty ring is inked --fab-accent-text and clears 3:1 on the tile", () => {
  const ink = declared(TILE, '.fab-slot-tile.is-unpicked', '--fab-medallion-tint');
  assert.equal(ink, '--fab-accent-text');
  const ground = [declared(TILE, '.fab-slot-tile', 'background')];
  assert.deepEqual(inkShortfalls(themes, ink, ground, 3), []);
  // Why the ring does not take the met glyph's ink.
  assert.notDeepEqual(inkShortfalls(themes, '--fab-accent', ground, 3), []);
});

test('a keyed pressed tile draws a second 2px accent ring that clears 3:1 on the pane grounds', () => {
  const ring = rulesIn(corpus[TILE]).filter(
    (rule) => rule.selector === '.fab-slot-tile.is-selected:focus-visible::after'
  );
  assert.equal(ring.length, 1, 'one rule draws the second ring');
  assert.equal(propertiesOf(ring[0]).get('border'), '2px solid var(--fab-accent)');
  for (const ground of ['--fab-bg-0', '--fab-bg-1', '--fab-surface', '--fab-bg-2']) {
    assert.deepEqual(inkShortfalls(themes, '--fab-accent', [ground], 3), [], ground);
  }
});
