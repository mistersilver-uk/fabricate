/**
 * Issue 2837: a `StageBars` stage's `shares` paint `FillBar`'s sixteen tones over the bar's track,
 * and its `thin` track is `FillBar`'s thin one, `--fab-bg-3`. Each reading is pinned as the docs
 * state it: the shares against the default track over `--fab-bg-0`, `--fab-bg-1`, `--fab-surface`
 * and `--fab-bg-2`, the shares against the thin track, and the three state paints (success,
 * accent and neutral) against the thin track, in all seven palettes. The absolute floors and the
 * pinned lists stop a token losing contrast silently.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { SEMANTIC_TONES, TAG_TONES } from '../fixtures/published-components/fillBarTones.js';
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

const GROUNDS = Object.freeze([['--fab-bg-0'], ['--fab-bg-1'], ['--fab-surface'], ['--fab-bg-2']]);
const DEFAULT_TRACK = token('.fab-fill-bar', 'background');
const THIN_TRACK = token('.fab-fill-bar.is-thin', 'background');
const SHARES = Object.freeze(
  [...SEMANTIC_TONES, ...TAG_TONES].map((tone) => [
    tone,
    token(`.fab-fill-bar-share.is-${tone}`, 'background'),
  ])
);
/** The paints `StageBars` gives a stage that draws no shares: filled, current, and any other. */
const STATES = Object.freeze(
  ['success', 'accent', 'neutral'].map((tone) => [
    tone,
    token(`.fab-fill-bar-fill.is-${tone}`, 'background'),
  ])
);

/** Each of `fills` against `stack`'s ground as `theme | where | tone`, with its ratio. */
function readings(fills, where, stack) {
  assert.equal(themes.size, 7, 'the sheet declares seven palettes');
  return [...themes].flatMap(([theme, tokens]) => {
    const base = stackGround(tokens, stack);
    return fills.map(([tone, fill]) => ({
      line: `${theme} | ${where} | ${tone}`,
      ratio: contrast(tokens.get(fill), base),
    }));
  });
}

const onDefault = (fills) =>
  GROUNDS.flatMap((ground) => readings(fills, ground[0], [DEFAULT_TRACK, ...ground]));
const under = (list, floor = 3) =>
  list
    .filter(({ ratio }) => ratio < floor)
    .map(({ line, ratio }) => `${line} ${ratio.toFixed(2)}:1`)
    .sort((a, b) => a.localeCompare(b));

test('the tracks are the raised surface by default and --fab-bg-3 when thin, and a share paints each of the sixteen tones', () => {
  assert.equal(DEFAULT_TRACK, '--fab-surface-raised');
  assert.equal(THIN_TRACK, '--fab-bg-3');
  assert.equal(SHARES.length, 16);
  assert.deepEqual(
    STATES.map(([, fill]) => fill),
    ['--fab-success', '--fab-accent', '--fab-text-subtle']
  );
});

test('the shares against the default track: nine of 448 under 3:1, all on --fab-bg-2, the weakest success in foundry-native at 2.3:1', () => {
  const all = onDefault(SHARES);
  assert.equal(all.length, 448);
  assert.deepEqual(under(all), [
    'foundry-native | --fab-bg-2 | azure 2.83:1',
    'foundry-native | --fab-bg-2 | danger 2.76:1',
    'foundry-native | --fab-bg-2 | ember 2.86:1',
    'foundry-native | --fab-bg-2 | info 2.30:1',
    'foundry-native | --fab-bg-2 | slate 2.32:1',
    'foundry-native | --fab-bg-2 | success 2.26:1',
    'hearth-herb | --fab-bg-2 | neutral 2.97:1',
    'ironblood-forge | --fab-bg-2 | danger 2.93:1',
    'ironblood-forge | --fab-bg-2 | neutral 2.96:1',
  ]);
  assert.deepEqual(under(all, 2.2), [], 'none under 2.2:1');
});

test('the shares against the thin track: twenty of 112 under 3:1 and none under 1.8:1, as the thin FillBar’s', () => {
  const all = readings(SHARES, 'thin', [THIN_TRACK]);
  assert.equal(all.length, 112);
  assert.equal(under(all).length, 20);
  assert.deepEqual(under(all, 1.8), []);
  assert.deepEqual(under(all, 1.9), ['hearth-herb | thin | danger 1.85:1']);
});

test('the state paints against the thin track: the accent, success and neutral readings under 3:1, the weakest the neutral in hearth-herb at 2.1:1', () => {
  assert.deepEqual(under(readings(STATES, 'thin', [THIN_TRACK])), [
    'foundry-native | thin | success 2.69:1',
    'hearth-herb | thin | accent 2.51:1',
    'hearth-herb | thin | neutral 2.14:1',
    'ironblood-forge | thin | accent 2.85:1',
    'ironblood-forge | thin | neutral 2.34:1',
    'starglass-arcana | thin | neutral 2.59:1',
  ]);
});

test('the thin track against the four grounds: 1.0:1 to 2.9:1, and 1.0:1 only in foundry-native on --fab-bg-2', () => {
  const all = [...themes].flatMap(([theme, tokens]) =>
    GROUNDS.map(([ground]) => ({
      theme,
      ground,
      ratio: contrast(tokens.get(THIN_TRACK), tokens.get(ground)),
    }))
  );
  assert.equal(all.length, 28);
  const ratios = all.map(({ ratio }) => ratio);
  assert.equal(Math.min(...ratios).toFixed(1), '1.0');
  assert.equal(Math.max(...ratios).toFixed(1), '2.9');
  assert.deepEqual(
    all.filter(({ ratio }) => ratio < 1.01).map(({ theme, ground }) => `${theme} ${ground}`),
    ['foundry-native --fab-bg-2']
  );
});
