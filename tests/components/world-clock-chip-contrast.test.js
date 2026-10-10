/**
 * Issue 2257 D22: the world clock's glyph, label and value clear 4.5:1 on the ground the Journal
 * draws the chip on — the info chip over the clock topbar over the app shell — in all seven themes.
 * `GROUND` is named by hand from `FabricateAppRoot.svelte`'s nesting, so a new layer between the
 * chip and the shell needs a matching edit here; `declaredToken` fails unless each layer's selector
 * declares exactly one background, and that a palette token.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { collectStyleCorpus, rulesIn } from '../helpers/styleBlockScan.js';
import { declaredToken, shortfalls, themePalettes } from '../helpers/themePaletteContrast.js';

const CLOCK = 'src/ui/svelte/components/WorldClockChip.svelte';
const CHIP = 'src/ui/svelte/components/Chip.svelte';
const APP_ROOT = 'src/ui/svelte/apps/FabricateAppRoot.svelte';
const corpus = collectStyleCorpus();
const themes = themePalettes(rulesIn(corpus['styles/fabricate.css']));

const token = (file, selector, property) =>
  declaredToken(rulesIn(corpus[file]), selector, property, file);

const GROUND = [
  token(CHIP, '.manager-chip.is-info', 'background'),
  token(APP_ROOT, '.fabricate-app-topbar.has-journal-clock', 'background'),
  token(APP_ROOT, '.fabricate-app-shell', 'background'),
];

for (const [part, selector] of [
  ['label', '.fab-world-clock-label'],
  ['value', '.fab-world-clock-value'],
  ['glyph', '.fab-world-clock-line > i'],
]) {
  test(`the world clock's ${part} clears 4.5:1 on the info chip over the clock topbar`, () => {
    assert.deepEqual(shortfalls(themes, token(CLOCK, selector, 'color'), GROUND), []);
  });
}
