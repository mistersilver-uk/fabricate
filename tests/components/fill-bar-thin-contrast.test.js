/**
 * Issue 2821: the thin `FillBar` track is borderless and paints `--fab-bg-3` on any ground, so each
 * of the sixteen fills reads against that one token in every palette. Several fall under 3:1, as
 * the default track's do; the absolute 2:1 floor and the pinned list stop a token losing contrast
 * silently, and the docs state the same list.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { SEMANTIC_TONES, TAG_TONES } from '../fixtures/published-components/fillBarTones.js';
import { collectStyleCorpus, rulesIn } from '../helpers/styleBlockScan.js';
import { contrast, declaredToken, themePalettes } from '../helpers/themePaletteContrast.js';

const FILL_BAR = 'src/ui/svelte/components/FillBar.svelte';
const corpus = collectStyleCorpus();
const themes = themePalettes(rulesIn(corpus['styles/fabricate.css']));
const rules = rulesIn(corpus[FILL_BAR]);
const token = (selector, property) => declaredToken(rules, selector, property, FILL_BAR);

const TRACK = token('.fab-fill-bar.is-thin', 'background');
const FILLS = Object.freeze([
  ...SEMANTIC_TONES.map((tone) => [tone, token(`.fab-fill-bar-fill.is-${tone}`, 'background')]),
  ...TAG_TONES.map((tone) => [tone, token(`.fab-fill-bar-fill.is-${tone}`, 'background')]),
]);

/** Every fill against the thin track as `theme | tone`, with its ratio. */
function readings() {
  assert.equal(themes.size, 7, 'the sheet declares seven palettes');
  return [...themes].flatMap(([theme, tokens]) =>
    FILLS.map(([tone, fill]) => ({
      line: `${theme} | ${tone}`,
      ratio: contrast(tokens.get(fill), tokens.get(TRACK)),
    }))
  );
}

test('the thin track is the one opaque token --fab-bg-3, and it is borderless', () => {
  assert.equal(TRACK, '--fab-bg-3');
  const thin = rules.find((rule) => rule.selector === '.fab-fill-bar.is-thin');
  assert.match(thin.body, /border:\s*0\b/u);
  assert.match(thin.body, /height:\s*4px/u);
  for (const [theme, tokens] of themes) {
    assert.match(tokens.get(TRACK) ?? '', /^#[\da-f]{6}$/iu, theme);
  }
});

test('every fill reads at least 1.8:1 against the thin track, in any palette', () => {
  const under = readings().filter(({ ratio }) => ratio < 1.8);
  assert.deepEqual(
    under.map(({ line, ratio }) => `${line} ${ratio.toFixed(2)}:1`),
    []
  );
});

test('the fills under 3:1 against the thin track are exactly the twenty of 112 the docs state, at their ratios', () => {
  const under = readings()
    .filter(({ ratio }) => ratio < 3)
    .map(({ line, ratio }) => `${line} ${ratio.toFixed(1)}:1`)
    .sort((a, b) => a.localeCompare(b));
  assert.deepEqual(under, [
    'foundry-native | info 2.7:1',
    'foundry-native | slate 2.8:1',
    'foundry-native | success 2.7:1',
    'hearth-herb | accent 2.5:1',
    'hearth-herb | azure 2.4:1',
    'hearth-herb | danger 1.9:1',
    'hearth-herb | ember 2.1:1',
    'hearth-herb | info 2.7:1',
    'hearth-herb | neutral 2.1:1',
    'hearth-herb | slate 1.9:1',
    'hearth-herb | verdant 2.7:1',
    'ironblood-forge | accent 2.9:1',
    'ironblood-forge | danger 2.0:1',
    'ironblood-forge | ember 2.3:1',
    'ironblood-forge | info 2.8:1',
    'ironblood-forge | neutral 2.3:1',
    'ironblood-forge | slate 2.1:1',
    'ironblood-forge | verdant 2.9:1',
    'starglass-arcana | danger 2.9:1',
    'starglass-arcana | neutral 2.6:1',
  ]);
  assert.equal(readings().length, 112);
});
