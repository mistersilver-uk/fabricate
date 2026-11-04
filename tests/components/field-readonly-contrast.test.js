/**
 * Issue 2938: the published `Field`'s read-only face is a dashed edge on no fill, read off the
 * sheet. The control keeps its `--fab-text` ink and `--fab-border` edge, so its ink clears 4.5:1
 * and its keyboard ring 3:1 on the four grounds the Field group names in all seven themes, and
 * its edge falls short of 3:1 on each, so the dash and the fill are no contrast-bearing signal:
 * the `readonly` state the control announces carries it.
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
const TEXT_LIKE =
  ":not(.fab-stepper-input, [data-recipe-option-formula]):not([type='radio'], [type='checkbox'], [type='search']):not([type='range'])";
const READ_ONLY = [
  `.fabricate-field.fabricate-field.is-readonly input${TEXT_LIKE}[readonly]`,
  '.fabricate-field.fabricate-field.is-readonly textarea[readonly]',
];
const CHROME = '.fabricate-field.fabricate-field textarea';
const GROUNDS = Object.freeze(['--fab-bg-0', '--fab-bg-1', '--fab-surface', '--fab-bg-2']);

const rules = rulesIn(collectStyleCorpus()[SHEET]);
const themes = themePalettes(rules);
const ruleFor = (selector) =>
  rules.filter((rule) => splitSelectorList(rule.selector).includes(selector));

test('the read-only face is one rule on the input and the textarea, a dashed edge on no fill', () => {
  const rule = ruleFor(READ_ONLY[0]);
  assert.equal(rule.length, 1);
  assert.deepEqual(splitSelectorList(rule[0].selector), READ_ONLY);
  const drawn = propertiesOf(rule[0]);
  assert.equal(drawn.get('border-style'), 'dashed');
  assert.equal(drawn.get('background'), 'transparent');
  assert.deepEqual([...drawn.keys()], ['border-style', 'background']);
});

test('the control keeps the chrome’s own ink and edge colour under it', () => {
  assert.equal(declaredToken(rules, CHROME, 'color', SHEET), '--fab-text');
  const [chrome] = ruleFor(CHROME);
  assert.equal(propertiesOf(chrome).get('border'), '1px solid var(--fab-border)');
});

for (const ground of GROUNDS) {
  test(`the ink clears 4.5:1 and the ring 3:1 on the unfilled control over ${ground} in every theme`, () => {
    assert.deepEqual(shortfalls(themes, '--fab-text', [ground]), []);
    assert.deepEqual(shortfalls(themes, '--fab-accent', [ground], 3), []);
  });
}

test('the edge falls short of 3:1 on each of those grounds in every theme, so it is not the only signal', () => {
  for (const ground of GROUNDS) {
    assert.equal(shortfalls(themes, '--fab-border', [ground], 3).length, 7, ground);
  }
});
