/**
 * Issue 2863: a centred `FillBar`'s in-band fill paints the `neutral` tone's ink,
 * `--fab-text-subtle`, which is weaker than the success and danger text inks the bar draws beyond
 * the band. Each reading is pinned as the docs state it, against the thin track and against the
 * default track over `--fab-bg-0`, `--fab-bg-1`, `--fab-surface` and `--fab-bg-2`, in all seven
 * palettes, beside the signed inks' 3:1 floor, so a token losing contrast fails here.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { collectStyleCorpus, rulesIn } from '../helpers/styleBlockScan.js';
import {
  contrast,
  declaredToken,
  stackGround,
  themePalettes,
} from '../helpers/themePaletteContrast.js';

const FILL_BAR = 'src/ui/svelte/components/FillBar.svelte';
const corpus = collectStyleCorpus();
const themes = themePalettes(rulesIn(corpus['styles/fabricate.css']));
const rules = rulesIn(corpus[FILL_BAR]);
const token = (selector, property) => declaredToken(rules, selector, property, FILL_BAR);

const NEUTRAL = token('.fab-fill-bar-fill.is-within-band', 'background');
const SIGNED = Object.freeze([
  token('.fab-fill-bar-fill.is-positive', 'background'),
  token('.fab-fill-bar-fill.is-negative', 'background'),
]);
const TRACKS = Object.freeze([
  ['thin', [token('.fab-fill-bar.is-thin', 'background')]],
  ...['--fab-bg-0', '--fab-bg-1', '--fab-surface', '--fab-bg-2'].map((ground) => [
    `default on ${ground}`,
    [token('.fab-fill-bar', 'background'), ground],
  ]),
]);

/** `ink` against each track in each palette as `theme | track`, with its ratio. */
function readings(ink) {
  assert.equal(themes.size, 7, 'the sheet declares seven palettes');
  return [...themes].flatMap(([theme, tokens]) =>
    TRACKS.map(([track, stack]) => ({
      line: `${theme} | ${track}`,
      ratio: contrast(tokens.get(ink), stackGround(tokens, stack)),
    }))
  );
}

const under = (list, floor) =>
  list
    .filter(({ ratio }) => ratio < floor)
    .map(({ line, ratio }) => `${line} ${ratio.toFixed(2)}:1`)
    .sort((a, b) => a.localeCompare(b));

test('the in-band fill paints the neutral tone’s ink, and the signed fills the text inks', () => {
  assert.equal(NEUTRAL, '--fab-text-subtle');
  assert.equal(token('.fab-fill-bar-fill.is-neutral', 'background'), NEUTRAL);
  assert.deepEqual(SIGNED, ['--fab-success-text', '--fab-danger-text']);
});

test('the neutral ink: five of 35 readings under 3:1, the weakest in hearth-herb on the thin track at 2.1:1', () => {
  const all = readings(NEUTRAL);
  assert.equal(all.length, 35);
  assert.deepEqual(under(all, 3), [
    'hearth-herb | default on --fab-bg-2 2.97:1',
    'hearth-herb | thin 2.14:1',
    'ironblood-forge | default on --fab-bg-2 2.96:1',
    'ironblood-forge | thin 2.34:1',
    'starglass-arcana | thin 2.59:1',
  ]);
  assert.deepEqual(under(all, 2.1), [], 'none under 2.1:1');
});

test('the signed inks beyond the band read at least 3:1 on the same tracks, so only the neutral ink is weaker', () => {
  for (const ink of SIGNED) assert.deepEqual(under(readings(ink), 3), [], ink);
});
