/**
 * Issue 2619: the component entry row actions' armed control hovers onto the solid `--fab-danger`
 * fill, so its hover ink is `--fab-on-danger` and clears 4.5:1 there in all seven themes.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { collectStyleCorpus, rulesIn } from '../helpers/styleBlockScan.js';
import { declaredToken, shortfalls, themePalettes } from '../helpers/themePaletteContrast.js';

const SHEET = 'styles/fabricate.css';
const ARMED_HOVER =
  '.fabricate-manager .manager-component-entry-row-actions .fabricate-button.is-danger.is-armed:not(:disabled):hover';
const corpus = collectStyleCorpus();
const themes = themePalettes(rulesIn(corpus['styles/fabricate.css']));
const token = (selector, property) =>
  declaredToken(rulesIn(corpus[SHEET]), selector, property, SHEET);

test('the armed row action hovers in --fab-on-danger, which clears 4.5:1 on the danger fill', () => {
  const ink = token(ARMED_HOVER, 'color');
  assert.equal(ink, '--fab-on-danger');
  assert.deepEqual(shortfalls(themes, ink, ['--fab-danger']), []);
});
