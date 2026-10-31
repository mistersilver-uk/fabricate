/**
 * Issue 2841: the published `IconPicker`'s `tint`, read off the module sheet in all seven palettes
 * on the four grounds its group names. The tinted trigger glyph inks `--fab-icon-picker-tint`, the
 * `--fab-tag-*` colour the key names, on the glyph's own tile over the trigger's fill; every one of
 * tint key, one per `--fab-tag-*` token the palettes declare, clears the 3:1 non-text floor there but `mauve` and `slate` on
 * `--fab-bg-2` in `foundry-native`, pinned ratio for ratio, and the untinted accent glyph clears it.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { collectStyleCorpus, rulesIn, splitSelectorList } from '../helpers/styleBlockScan.js';
import {
  declaredToken,
  propertiesOf,
  shortfalls,
  tagTintKeys,
  themePalettes,
} from '../helpers/themePaletteContrast.js';

const SHEET = 'styles/fabricate.css';
const rules = rulesIn(collectStyleCorpus()[SHEET]);
const themes = themePalettes(rules);
const token = (selector, property) => declaredToken(rules, selector, property, SHEET);
const GROUNDS = ['--fab-bg-0', '--fab-bg-1', '--fab-surface', '--fab-bg-2'];
const PREVIEW = '.fabricate-icon-picker .essence-icon-picker-preview';
const TINTED = `${PREVIEW}.is-tinted`;
const TRIGGER = '.fabricate-icon-picker .essence-icon-picker-trigger';
const TINTS = tagTintKeys(themes);
assert.equal(TINTS.length, 13, 'the published tint set names thirteen keys');

/** The glyph's ground: its tile over the trigger's fill over `ground`, top first. */
const tileOver = (ground) => [token(PREVIEW, 'background'), token(TRIGGER, 'background'), ground];

test('the tinted glyph inks the custom property the component sets, over the untinted accent', () => {
  assert.equal(token(PREVIEW, 'color'), '--fab-accent');
  const tinted = rules.filter((rule) => splitSelectorList(rule.selector).includes(TINTED));
  assert.deepEqual(
    tinted.map((rule) => [...propertiesOf(rule)]),
    [[['color', 'var(--fab-icon-picker-tint, var(--fab-accent))']]]
  );
  assert.deepEqual(tileOver('--fab-bg-1'), [
    '--fab-overlay-dark-16',
    '--fab-overlay-light-06',
    '--fab-bg-1',
  ]);
});

test('every tint key clears 3:1 on the glyph’s tile over the four grounds but mauve and slate on --fab-bg-2 in foundry-native', () => {
  const short = TINTS.flatMap((tint) =>
    GROUNDS.flatMap((ground) => shortfalls(themes, `--fab-tag-${tint}`, tileOver(ground), 3))
  );
  assert.deepEqual(short, [
    'foundry-native: --fab-tag-mauve on --fab-overlay-dark-16 over --fab-overlay-light-06 over --fab-bg-2 2.55:1',
    'foundry-native: --fab-tag-slate on --fab-overlay-dark-16 over --fab-overlay-light-06 over --fab-bg-2 2.57:1',
  ]);
});

test('the untinted accent glyph clears 3:1 on the glyph’s tile over the four grounds', () => {
  for (const ground of GROUNDS) {
    assert.deepEqual(shortfalls(themes, '--fab-accent', tileOver(ground), 3), [], ground);
  }
});
