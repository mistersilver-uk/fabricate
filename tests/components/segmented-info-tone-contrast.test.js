/**
 * Issue 2774: the `SegmentedControl` info tone's chosen segment inks `--fab-on-info` on the solid
 * `--fab-info` fill, and an info option inside an accent track inks `--fab-info-text` on its soft
 * tint over the track, each clearing 4.5:1 in all seven themes; the tokens are read off the rules.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { collectStyleCorpus, rulesIn } from '../helpers/styleBlockScan.js';
import { declaredToken, shortfalls, themePalettes } from '../helpers/themePaletteContrast.js';

const SEGMENTED = 'src/ui/svelte/components/SegmentedControl.svelte';
const corpus = collectStyleCorpus();
const themes = themePalettes(rulesIn(corpus['styles/fabricate.css']));
const rules = rulesIn(corpus[SEGMENTED]);
const token = (selector, property) => declaredToken(rules, selector, property, SEGMENTED);
const GROUNDS = ['--fab-bg-0', '--fab-bg-1', '--fab-surface', '--fab-bg-2'];

test('the info tone inks its chosen segment on the solid info fill', () => {
  const chosen = '.manager-segmented.is-info .manager-segment.is-active';
  const [fill, ink] = [token(chosen, 'background'), token(chosen, 'color')];
  assert.deepEqual([fill, ink], ['--fab-info', '--fab-on-info']);
  assert.equal(
    token(chosen, 'border-color'),
    fill,
    'the edge is the fill, so the tile has no seam'
  );
  assert.deepEqual(shortfalls(themes, ink, [fill]), []);
});

test('the info tone inks its idle segment muted, clearing 4.5:1 on the default well over --fab-bg-1, --fab-surface and --fab-bg-2', () => {
  const idle = '.manager-segmented.is-info .manager-segment:not(.is-active)';
  assert.equal(token(idle, 'color'), '--fab-text-muted');
  const well = token('.manager-segmented', 'background');
  for (const ground of GROUNDS.slice(1)) {
    assert.deepEqual(shortfalls(themes, '--fab-text-muted', [well, ground]), [], ground);
  }
});

test('an info option inside an accent track inks its text on the soft tint over the default and compact wells and a bare pill track', () => {
  const tracks = {
    default: [token('.manager-segmented', 'background')],
    compact: [token('.manager-segmented.is-compact', 'background')],
    pill: [],
  };
  for (const tone of ['accent', 'accent-soft']) {
    const chosen = `.manager-segmented.is-${tone} .manager-segment.is-active.is-info`;
    const [fill, ink] = [token(chosen, 'background'), token(chosen, 'color')];
    assert.deepEqual([fill, ink], ['--fab-info-soft', '--fab-info-text']);
    for (const [rung, well] of Object.entries(tracks)) {
      for (const ground of GROUNDS) {
        assert.deepEqual(
          shortfalls(themes, ink, [fill, ...well, ground]),
          [],
          `${tone} ${rung} on ${ground}`
        );
      }
    }
  }
});

test('the solid info fill clears 3:1 against its track except in foundry-native over bg-2 (exception)', () => {
  const well = token('.manager-segmented', 'background');
  const found = GROUNDS.flatMap((ground) =>
    shortfalls(themes, '--fab-info', [well, ground], 3).map((line) => `${ground}: ${line}`)
  );
  assert.equal(found.length, 1, found.join('\n'));
  assert.match(found[0], /^--fab-bg-2: foundry-native: .* 2\.48:1$/u);
});
