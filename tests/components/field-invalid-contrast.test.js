/**
 * Issue 2848: the published `Field`'s error state draws a `--fab-danger-border` edge on the
 * translucent `--fab-danger-soft` fill, read off the sheet, and the control's `--fab-text` ink and
 * its accent keyboard ring clear 4.5:1 and 3:1 on that fill over the four grounds the Field group
 * names in all seven themes. The edge falls short of 3:1 in every theme, so the companion's message
 * carries the error, inked `--fab-danger-text`, which clears 4.5:1 there where `--fab-danger` does not.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { collectStyleCorpus, rulesIn } from '../helpers/styleBlockScan.js';
import { declaredToken, shortfalls, themePalettes } from '../helpers/themePaletteContrast.js';

const SHEET = 'styles/fabricate.css';
const ERROR = ".fabricate-field.fabricate-field.is-invalid textarea[aria-invalid='true']";
const CHROME = '.fabricate-field.fabricate-field textarea';
const GROUNDS = Object.freeze(['--fab-bg-0', '--fab-bg-1', '--fab-surface', '--fab-bg-2']);

const rules = rulesIn(collectStyleCorpus()[SHEET]);
const themes = themePalettes(rules);
const fill = declaredToken(rules, ERROR, 'background', SHEET);

test('the error state draws the danger edge on the danger fill, over the chrome’s own ink', () => {
  assert.equal(declaredToken(rules, ERROR, 'border-color', SHEET), '--fab-danger-border');
  assert.equal(fill, '--fab-danger-soft');
  assert.equal(declaredToken(rules, CHROME, 'color', SHEET), '--fab-text');
});

for (const ground of GROUNDS) {
  test(`the ink clears 4.5:1 and the ring 3:1 on the error fill over ${ground} in every theme`, () => {
    assert.deepEqual(shortfalls(themes, '--fab-text', [fill, ground]), []);
    assert.deepEqual(shortfalls(themes, '--fab-accent', [fill, ground], 3), []);
  });
}

test('the danger edge falls short of 3:1 on each of those grounds in every theme, so it is not the only signal', () => {
  for (const ground of GROUNDS) {
    assert.equal(shortfalls(themes, '--fab-danger-border', [ground], 3).length, 7, ground);
  }
});

test('the message’s --fab-danger-text clears 4.5:1 on each of those grounds in every theme, and --fab-danger does not', () => {
  for (const ground of GROUNDS) {
    assert.deepEqual(shortfalls(themes, '--fab-danger-text', [ground]), [], ground);
  }
  assert.notDeepEqual(
    GROUNDS.flatMap((ground) => shortfalls(themes, '--fab-danger', [ground])),
    [],
    'the plain danger ink falls short somewhere, so the docs name the text ink'
  );
});
