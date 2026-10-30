/**
 * Issue 2789: the ten tag names `FillBar` and `Meter` publish for a fill, a share or a segment paint
 * the `--fab-tag-*` token of the same name, and each reads against the bar's own track no weaker
 * than the weakest tone the bar already ships, in all seven palettes on the grounds a published
 * component sits on. The bar draws no label ink, so no pairing is claimed beyond the fill.
 * The relative baseline alone lets every tag drift down while the weakest shipped tone does, so an
 * absolute 2:1 floor and the pinned ratios of the nine readings under 3:1 stop a token silently
 * losing contrast while it still reads no weaker than that tone.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { SEMANTIC_TONES, TAG_TONES } from '../fixtures/published-components/fillBarTones.js';
import { collectStyleCorpus, rulesIn, splitSelectorList } from '../helpers/styleBlockScan.js';
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

/** The grounds a bar sits on: the page rungs, and a card (`--fab-surface-soft`) over `--fab-bg-2`. */
const GROUNDS = Object.freeze([
  ['--fab-bg-0'],
  ['--fab-bg-1'],
  ['--fab-surface'],
  ['--fab-bg-2'],
  ['--fab-surface-soft', '--fab-bg-2'],
]);
const SEMANTIC_FILLS = Object.freeze(
  SEMANTIC_TONES.map((tone) => token(`.fab-fill-bar-fill.is-${tone}`, 'background'))
);
const TRACK = token('.fab-fill-bar', 'background');

/** Each reading of `fill` against the track as `theme | ground | fill`, with its ratio. */
function readings(fills) {
  assert.equal(themes.size, 7, 'the sheet declares seven palettes');
  return [...themes].flatMap(([theme, tokens]) =>
    GROUNDS.flatMap((ground) => {
      const base = stackGround(tokens, [TRACK, ...ground]);
      return fills.map((fill) => ({
        line: `${theme} | ${ground.join(' over ')} | ${fill}`,
        ground: ground.join(' over '),
        theme,
        ratio: contrast(tokens.get(fill), base),
      }));
    })
  );
}

test('each tag name paints a fill and a share the token of the same name', () => {
  for (const tone of TAG_TONES) {
    for (const part of ['fill', 'share']) {
      assert.equal(token(`.fab-fill-bar-${part}.is-${tone}`, 'background'), `--fab-tag-${tone}`);
    }
  }
});

test('the rules paint exactly the semantic tones and the ten tag names, and no other tone', () => {
  const tones = rules
    .flatMap((rule) => splitSelectorList(rule.selector))
    .map((selector) => selector.match(/^\.fab-fill-bar-share\.is-([\w-]+)$/u)?.[1])
    .filter(Boolean);
  assert.deepEqual(new Set(tones), new Set([...SEMANTIC_TONES, ...TAG_TONES]));
});

test('every palette declares each tag token the bar paints', () => {
  for (const [theme, tokens] of themes) {
    for (const tone of TAG_TONES) {
      assert.match(tokens.get(`--fab-tag-${tone}`) ?? '', /^#[\da-f]{6}$/iu, `${theme} ${tone}`);
    }
  }
});

test('no tag fill reads weaker against the track than the weakest shipped tone, on any ground in any palette', () => {
  const floors = new Map();
  for (const { theme, ground, ratio } of readings(SEMANTIC_FILLS)) {
    const key = `${theme} | ${ground}`;
    floors.set(key, Math.min(floors.get(key) ?? Infinity, ratio));
  }
  const weaker = readings(TAG_TONES.map((tone) => `--fab-tag-${tone}`)).filter(
    ({ theme, ground, ratio }) => ratio < floors.get(`${theme} | ${ground}`)
  );
  assert.deepEqual(
    weaker.map(({ line, ratio }) => `${line} ${ratio.toFixed(2)}:1`),
    []
  );
});

test('every tag fill reads at least 2:1 against the track, on any ground in any palette', () => {
  const under = readings(TAG_TONES.map((tone) => `--fab-tag-${tone}`)).filter(
    ({ ratio }) => ratio < 2
  );
  assert.deepEqual(
    under.map(({ line, ratio }) => `${line} ${ratio.toFixed(2)}:1`),
    []
  );
});

test('the tag fills under 3:1 against the track are exactly the nine the docs list, at their ratios', () => {
  const under = readings(TAG_TONES.map((tone) => `--fab-tag-${tone}`))
    .filter(({ ratio }) => ratio < 3)
    .map(({ line, ratio }) => `${line} ${ratio.toFixed(1)}:1`)
    .sort((a, b) => a.localeCompare(b));
  assert.deepEqual(under, [
    'foundry-native | --fab-bg-2 | --fab-tag-azure 2.8:1',
    'foundry-native | --fab-bg-2 | --fab-tag-ember 2.9:1',
    'foundry-native | --fab-bg-2 | --fab-tag-slate 2.3:1',
    'foundry-native | --fab-surface-soft over --fab-bg-2 | --fab-tag-azure 2.6:1',
    'foundry-native | --fab-surface-soft over --fab-bg-2 | --fab-tag-ember 2.6:1',
    'foundry-native | --fab-surface-soft over --fab-bg-2 | --fab-tag-slate 2.1:1',
    'hearth-herb | --fab-surface-soft over --fab-bg-2 | --fab-tag-slate 2.8:1',
    'ironblood-forge | --fab-surface-soft over --fab-bg-2 | --fab-tag-ember 3.0:1',
    'ironblood-forge | --fab-surface-soft over --fab-bg-2 | --fab-tag-slate 2.7:1',
  ]);
});
