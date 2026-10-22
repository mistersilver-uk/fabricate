/**
 * Issue 2601: the published `Field`'s keyboard ring on a text-like input or a textarea in its
 * content slot is the accent, 1px wide and inset 1px over the control's edge, and clears 3:1 in
 * all seven themes against the control's own `--fab-bg-1` fill and against `--fab-bg-0`,
 * `--fab-bg-1`, `--fab-surface` and `--fab-bg-2` beyond its edge, and not against `--fab-bg-3`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { collectStyleCorpus, rulesIn, splitSelectorList } from '../helpers/styleBlockScan.js';
import {
  declaredToken,
  propertiesOf,
  shortfalls,
  themePalettes,
} from '../helpers/themePaletteContrast.js';

const SHEET = 'styles/fabricate.css';
const INSET_RING =
  ".fabricate-field :is(input, textarea):where(:not([type='checkbox'], [type='radio'], [type='range'], [type='color'], [type='file'], [type='button'], [type='submit'], [type='reset'], [type='image'])):focus-visible";
const TEXT_LIKE_CHROME = '.fabricate-field.fabricate-field textarea';

const rules = rulesIn(collectStyleCorpus()[SHEET]);
const themes = themePalettes(rules);
const ringRules = rules.filter((rule) => splitSelectorList(rule.selector).includes(INSET_RING));

test('the inset ring is the accent, 1px wide over the control’s edge', () => {
  assert.equal(ringRules.length, 1, 'one rule draws it');
  const drawn = propertiesOf(ringRules[0]);
  assert.equal(drawn.get('outline'), '1px solid var(--fab-accent)');
  assert.equal(drawn.get('outline-offset'), '-1px');
});

test('the control the ring is drawn over fills with --fab-bg-1', () => {
  assert.equal(declaredToken(rules, TEXT_LIKE_CHROME, 'background', SHEET), '--fab-bg-1');
});

for (const ground of ['--fab-bg-0', '--fab-bg-1', '--fab-surface', '--fab-bg-2']) {
  test(`the inset ring clears 3:1 on ${ground} in every theme`, () => {
    assert.deepEqual(shortfalls(themes, '--fab-accent', [ground], 3), []);
  });
}

test('the inset ring falls short of 3:1 on --fab-bg-3 in some theme, as the group states', () => {
  assert.ok(shortfalls(themes, '--fab-accent', ['--fab-bg-3'], 3).length > 0);
});
