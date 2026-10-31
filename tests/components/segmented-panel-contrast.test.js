/**
 * Issue 2856 — the `SegmentedControl` `'panel'` surface paints `--fab-bg-0`, an opaque ground, so
 * every face over it reads the same on whichever of the four grounds the control sits: the idle
 * ink at rest and under the pointer, the selected ink on its fill under no tone and each published
 * tone and variant, and the keyboard ring on the track and on each ground it reaches past it, in all
 * seven palettes. The selected tile's edge over its fill, its fill and its ink against the idle ink
 * all fall short of 3:1 on the track, in the ranges the group states. Read off the rules.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { collectStyleCorpus, rulesIn, splitSelectorList } from '../helpers/styleBlockScan.js';
import {
  contrast,
  declaredToken,
  flatten,
  propertiesOf,
  shortfalls,
  stackGround,
  themePalettes,
} from '../helpers/themePaletteContrast.js';

const SEGMENTED = 'src/ui/svelte/components/SegmentedControl.svelte';
const corpus = collectStyleCorpus();
const themes = themePalettes(rulesIn(corpus['styles/fabricate.css']));
const rules = rulesIn(corpus[SEGMENTED]);
const token = (selector, property) => declaredToken(rules, selector, property, SEGMENTED);
const GROUNDS = Object.freeze(['--fab-bg-0', '--fab-bg-1', '--fab-surface', '--fab-bg-2']);
const PANEL = '.manager-segmented.is-panel:not(.is-pill, .is-tag)';
const track = () => token(PANEL, 'background');
/** The one `--fab-*` token inside a shorthand `property` that the rule listing `selector` declares. */
const shorthandToken = (selector, property) => {
  const values = rules
    .filter((rule) => splitSelectorList(rule.selector).includes(selector))
    .map((rule) => propertiesOf(rule).get(property))
    .filter(Boolean);
  assert.equal(values.length, 1, `${selector} declares ${property} once`);
  return /var\((--fab-[\w-]+)\)/u.exec(values[0])?.[1];
};

test('the panel track paints --fab-bg-0, an opaque ground the group names', () => {
  assert.equal(track(), '--fab-bg-0');
  assert.ok(GROUNDS.includes(track()));
  for (const [theme, tokens] of themes) {
    assert.match(tokens.get(track()), /^#[\da-f]{6}$/iu, `${theme} paints it opaque`);
  }
});

test('the idle segment inks muted at rest and secondary under the pointer, each 4.5:1 on the panel track', () => {
  assert.equal(token('.manager-segment', 'color'), '--fab-text-muted');
  const hover = token('.manager-segment:hover:not(.is-active):not(.is-disabled)', 'color');
  assert.equal(hover, '--fab-text-secondary');
  for (const ink of ['--fab-text-muted', hover]) {
    assert.deepEqual(shortfalls(themes, ink, [track()]), [], ink);
  }
  const softIdle = '.manager-segmented.is-accent-soft .manager-segment:not(.is-active)';
  assert.deepEqual(
    shortfalls(themes, token(softIdle, 'color'), [token(softIdle, 'background'), track()]),
    [],
    'the soft accent tone’s idle tile'
  );
});

test('the selected segment inks 4.5:1 on its fill over the panel track, under no tone and each published one', () => {
  const chosen = [
    '.manager-segment.is-active',
    '.manager-segmented.is-accent .manager-segment.is-active',
    '.manager-segmented.is-accent-soft .manager-segment.is-active',
    '.manager-segmented.is-info .manager-segment.is-active',
    '.manager-segment.is-active.is-info',
  ];
  for (const selector of chosen) {
    const [fill, ink] = [token(selector, 'background'), token(selector, 'color')];
    assert.deepEqual(shortfalls(themes, ink, [fill, track()]), [], selector);
  }
});

test('the keyboard ring clears 3:1 on the panel track and on each ground it reaches past it', () => {
  const ring = shorthandToken('.manager-segment:has(:focus-visible)', 'outline');
  assert.equal(ring, '--fab-accent');
  for (const ground of GROUNDS) {
    assert.deepEqual(shortfalls(themes, ring, [ground], 3), [], ground);
  }
  assert.deepEqual(shortfalls(themes, ring, ['--fab-surface-active', track()], 3), []);
});

/** The lowest and highest of `measure(tokens)` over the seven palettes, to two places. */
const range = (measure) => {
  const ratios = [...themes.values()].map((tokens) => measure(tokens));
  return [Math.min(...ratios), Math.max(...ratios)].map((ratio) => ratio.toFixed(2));
};

test('the selected tile’s edge, fill and ink sit under 3:1 on the panel track, in the ranges the group states', () => {
  const edge = shorthandToken('.manager-segment.is-active', 'border');
  const fill = token('.manager-segment.is-active', 'background');
  const ink = token('.manager-segment.is-active', 'color');
  assert.deepEqual(
    [edge, fill, ink],
    ['--fab-border-strong', '--fab-surface-active', '--fab-text']
  );
  const ground = (tokens) => tokens.get(track());
  const tile = (tokens) => stackGround(tokens, [fill, track()]);
  // The edge is painted over the tile's own fill, which runs under the border.
  const edgeOnTrack = (tokens) => contrast(flatten(tokens.get(edge), tile(tokens)), ground(tokens));
  const fillOnTrack = (tokens) => contrast(tokens.get(fill), ground(tokens));
  const inkOnIdle = (tokens) =>
    contrast(tokens.get(ink), flatten(tokens.get('--fab-text-muted'), ground(tokens)));
  assert.deepEqual(range(edgeOnTrack), ['2.09', '2.86']);
  assert.deepEqual(range(fillOnTrack), ['1.23', '1.38']);
  assert.deepEqual(range(inkOnIdle), ['1.89', '2.79']);
});
