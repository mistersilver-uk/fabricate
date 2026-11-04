/**
 * A `ListRow`'s tinted rows, `'positive'`, `'danger'` and `'accent'`, against the four grounds a
 * published row is mounted on, in all seven themes: each fill is translucent, so each ink is read
 * over the fill flattened onto each ground. The name and the row's ink clear 4.5:1 and the keyboard
 * ring 3:1; a muted name does not everywhere. A state word drawn as a published `Chip` in a tone
 * with no `emphasis`, or none, is read over the chip's fill over the row's: the neutral chip and a
 * danger chip on a positive row's `--fab-bg-2` fall short, and every other pairing clears 4.5:1.
 * An accent `Button` on the accent row clears 4.5:1 for its label, at rest and hovered, and 3:1
 * for its edge.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { collectStyleCorpus, rulesIn, splitSelectorList } from '../helpers/styleBlockScan.js';
import {
  propertiesOf,
  shortfalls,
  themePalettes,
  tokenReader,
} from '../helpers/themePaletteContrast.js';

const SHEET = 'styles/fabricate.css';
const CHIP = 'src/ui/svelte/components/Chip.svelte';
const corpus = collectStyleCorpus();
const themes = themePalettes(rulesIn(corpus['styles/fabricate.css']));
const token = tokenReader(corpus);

const GROUNDS = Object.freeze(['--fab-bg-0', '--fab-bg-1', '--fab-surface', '--fab-bg-2']);
const TONES = Object.freeze(['positive', 'danger', 'accent']);
/** The tones `Chip` publishes, and none, which draws the default chip. */
const CHIP_TONES = Object.freeze([
  '',
  'positive',
  'warning',
  'danger',
  'info',
  'neutral',
  'accent',
]);
const ACCENT_ACTION = '.fabricate-button.fabricate-button.is-accent-action:not(:disabled)';
const ACCENT_ACTION_HOVER =
  ".fabricate-button.fabricate-button.is-accent-action:not(:disabled, [aria-disabled='true']):hover";
const toneRule = (tone) => `.fabricate-list-row.is-${tone}`;
const fillOf = (tone) => token(SHEET, toneRule(tone), 'background');
/** A chip tone's ink and fill, the base chip's where the tone leaves one alone. */
const chipPaint = (tone) =>
  ['color', 'background'].map((property) => {
    const own = tone ? `.manager-chip.is-${tone}` : '.manager-chip';
    const declares = rulesIn(corpus[CHIP]).some(
      (rule) => splitSelectorList(rule.selector).includes(own) && propertiesOf(rule).has(property)
    );
    return token(CHIP, declares ? own : '.manager-chip', property);
  });

test('draws the accent row on the accent wash and edge, in the row ink the other tints take', () => {
  assert.deepEqual(
    ['background', 'border-color', 'color'].map((property) =>
      token(SHEET, toneRule('accent'), property)
    ),
    ['--fab-accent-soft', '--fab-accent-border', '--fab-text-secondary']
  );
  for (const tone of ['positive', 'danger']) {
    assert.equal(token(SHEET, toneRule(tone), 'color'), '--fab-text-secondary', tone);
  }
});

for (const tone of TONES) {
  test(`clears 4.5:1 for the name and the row’s ink, and 3:1 for the ring, on the ${tone} fill over each ground`, () => {
    const name = token(SHEET, '.fabricate-list-row .fabricate-list-row-name', 'color');
    const ink = token(SHEET, toneRule(tone), 'color');
    for (const ground of GROUNDS) {
      const stack = [fillOf(tone), ground];
      for (const drawn of [name, ink]) {
        assert.deepEqual(shortfalls(themes, drawn, stack), [], `${drawn} on ${ground}`);
      }
      assert.deepEqual(shortfalls(themes, '--fab-accent', stack, 3), [], `ring on ${ground}`);
    }
  });

  test(`falls short for a muted name on the ${tone} fill over --fab-bg-2`, () => {
    const muted = token(SHEET, '.fabricate-list-row.is-muted .fabricate-list-row-name', 'color');
    assert.notDeepEqual(shortfalls(themes, muted, [fillOf(tone), '--fab-bg-2']), []);
  });

  test(`reads each published chip tone on the ${tone} fill as the docs state`, () => {
    for (const chipTone of CHIP_TONES) {
      const [ink, fill] = chipPaint(chipTone);
      for (const ground of GROUNDS) {
        const short = shortfalls(themes, ink, [fill, fillOf(tone), ground]);
        const expectShort =
          chipTone === 'neutral' ||
          (chipTone === 'danger' && tone === 'positive' && ground === '--fab-bg-2');
        assert.equal(short.length > 0, expectShort, `${chipTone} chip on ${ground}: ${short}`);
      }
    }
  });
}

test('clears 4.5:1 for an accent Button’s label and 3:1 for its edge on the accent row, at rest and hovered', () => {
  const row = fillOf('accent');
  const ink = token(SHEET, ACCENT_ACTION, 'color');
  const edge = token(SHEET, ACCENT_ACTION, 'border-color');
  const hovered = token(SHEET, ACCENT_ACTION_HOVER, 'background');
  assert.deepEqual(
    [ink, edge, hovered],
    ['--fab-accent-text', '--fab-accent', '--fab-accent-soft']
  );
  for (const ground of GROUNDS) {
    assert.deepEqual(shortfalls(themes, ink, [row, ground]), [], `label on ${ground}`);
    assert.deepEqual(shortfalls(themes, edge, [row, ground], 3), [], `edge on ${ground}`);
    assert.deepEqual(shortfalls(themes, ink, [hovered, row, ground]), [], `hovered on ${ground}`);
  }
});
