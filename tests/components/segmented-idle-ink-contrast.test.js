/**
 * Issues 2685 and 2368: an unselected `SegmentedControl` segment inks `--fab-text-muted` on every
 * rung and tone, and clears 4.5:1 in all seven themes on the ground its track paints, or on the
 * grounds a bare tag track sits on.
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

const IDLE = (rung) => `.manager-segmented.is-${rung} .manager-segment:not(.is-active)`;

for (const rung of ['compact', 'field', 'inline']) {
  test(`the ${rung} rung's idle segment inks muted and clears 4.5:1 on its track`, () => {
    const ink = token(IDLE(rung), 'color');
    assert.equal(ink, '--fab-text-muted');
    const track = token(`.manager-segmented.is-${rung}`, 'background');
    assert.deepEqual(shortfalls(themes, ink, [track]), []);
    assert.notDeepEqual(
      shortfalls(themes, '--fab-text-subtle', [track]),
      [],
      'subtle falls short there, so muted is the floor'
    );
  });
}

test('the tag tone inks muted and clears 4.5:1 on each ground its bare track sits on', () => {
  const ink = token(IDLE('tag'), 'color');
  assert.equal(ink, '--fab-text-muted');
  for (const ground of ['--fab-bg-1', '--fab-bg-2', '--fab-surface']) {
    assert.deepEqual(shortfalls(themes, ink, [ground]), [], ground);
  }
});

test('the default rung inks muted and clears 4.5:1 on its soft well over each ground', () => {
  const ink = token('.manager-segment', 'color');
  assert.equal(ink, '--fab-text-muted');
  const well = token('.manager-segmented', 'background');
  for (const ground of ['--fab-bg-1', '--fab-bg-2', '--fab-surface']) {
    assert.deepEqual(shortfalls(themes, ink, [well, ground]), [], ground);
  }
});
