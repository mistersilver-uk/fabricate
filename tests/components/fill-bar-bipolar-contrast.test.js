/**
 * Issue 2821: the bipolar `FillBar` paints its positive half `--fab-success-text` and its negative
 * half `--fab-danger-text`, the pale text inks, and each reads at least 3:1 against the track it
 * sits on in all seven palettes: the thin track, and the default track on the grounds a published
 * component sits on.
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

const HALVES = Object.freeze([
  ['positive', token('.fab-fill-bar-fill.is-positive', 'background')],
  ['negative', token('.fab-fill-bar-fill.is-negative', 'background')],
]);
const GROUNDS = Object.freeze([
  ['--fab-bg-0'],
  ['--fab-bg-1'],
  ['--fab-surface'],
  ['--fab-bg-2'],
  ['--fab-surface-soft', '--fab-bg-2'],
]);
const TRACKS = Object.freeze([
  ['thin', token('.fab-fill-bar.is-thin', 'background'), [[]]],
  ['default', token('.fab-fill-bar', 'background'), GROUNDS],
]);

test('the bipolar halves paint the success and danger text inks', () => {
  assert.deepEqual(HALVES, [
    ['positive', '--fab-success-text'],
    ['negative', '--fab-danger-text'],
  ]);
});

test('each half reads at least 3:1 against its track, on any ground in any palette', () => {
  assert.equal(themes.size, 7, 'the sheet declares seven palettes');
  const under = [...themes].flatMap(([theme, tokens]) =>
    TRACKS.flatMap(([name, track, grounds]) =>
      grounds.flatMap((ground) => {
        const base = stackGround(tokens, [track, ...ground]);
        return HALVES.map(([half, fill]) => ({
          line: `${theme} | ${name} track | ${ground.join(' over ') || 'any ground'} | ${half}`,
          ratio: contrast(tokens.get(fill), base),
        })).filter(({ ratio }) => ratio < 3);
      })
    )
  );
  assert.deepEqual(
    under.map(({ line, ratio }) => `${line} ${ratio.toFixed(2)}:1`),
    []
  );
});
