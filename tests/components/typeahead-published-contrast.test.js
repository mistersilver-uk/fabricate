/**
 * Issue 2860: the published `Typeahead`'s inks, read off the sheet, over its own grounds in all
 * seven themes. The list paints its own opaque `--fab-bg-2`, so whatever it floats over, a row's
 * label, the data form's detail and its no-match note clear 4.5:1 on it, under the hover fill and
 * on the current row's fill, and the cursor's ring and the tick clear 3:1; the detail takes the secondary ink
 * and the note the muted one because the muted and the subtle inks fall short there. The field's
 * error face, the danger fill, keeps the value's ink and the placeholder's secondary ink at 4.5:1,
 * the lit border at 3:1, and its message's danger-text ink at 4.5:1, over the four grounds.
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
const LIST = '.fabricate-typeahead-list.fabricate-typeahead-list';
const ROW = '.fabricate-typeahead-option.fabricate-typeahead-option';
const HOVER = `${ROW}:hover`;
const CURSOR = `${ROW}[aria-selected='true']`;
const DETAIL = '.fabricate-typeahead-option-detail';
const TICK = '.fabricate-typeahead-option-tick';
const NOTE = '.fabricate-typeahead-list.is-data-form .fabricate-typeahead-note';
const ERROR_FILL =
  '.fabricate-search.fabricate-search.fabricate-typeahead.is-invalid:not(.is-compact)';
const PLACEHOLDER = `${ERROR_FILL} input:not(:focus-visible)::placeholder`;
const MESSAGE = '.fabricate-typeahead-error';
const LIT = '.fabricate-search.fabricate-search:not(.is-compact):focus-within';
const GROUNDS = Object.freeze(['--fab-bg-0', '--fab-bg-1', '--fab-surface', '--fab-bg-2']);

const rules = rulesIn(collectStyleCorpus()[SHEET]);
const themes = themePalettes(rules);
const token = (selector, property) => declaredToken(rules, selector, property, SHEET);
const panel = token(LIST, 'background');
const hover = token(HOVER, 'background');
const CURRENT = `${ROW}.fabricate-typeahead-option-rich.is-current`;
const current = token(CURRENT, 'background');
// The list's own ground, a row under the pointer, and the current row's fill (issue 2860).
const PANEL_STACKS = Object.freeze([[panel], [hover, panel], [current, panel]]);

test('the list paints its own opaque ground in every theme, so the page beneath it never shows', () => {
  assert.equal(panel, '--fab-bg-2');
  assert.equal(current, '--fab-surface-active', 'the current row takes the select’s chosen fill');
  for (const [theme, tokens] of themes) {
    assert.match(tokens.get(panel), /^#[\da-f]{6}$/iu, `${theme}: an opaque ${panel}`);
  }
});

test('a row’s label, the detail and the no-match note clear 4.5:1 on the list and under the hover fill', () => {
  assert.equal(token(ROW, 'color'), '--fab-text');
  assert.equal(token(DETAIL, 'color'), '--fab-text-secondary');
  assert.equal(token(NOTE, 'color'), '--fab-text-muted');
  for (const stack of PANEL_STACKS) {
    assert.deepEqual(shortfalls(themes, '--fab-text', stack), [], stack.join(' over '));
    assert.deepEqual(shortfalls(themes, '--fab-text-secondary', stack), [], stack.join(' over '));
  }
  assert.deepEqual(
    shortfalls(themes, '--fab-text-muted', [panel]),
    [],
    'the note, which no row fill reaches'
  );
});

test('the muted ink falls short under the hover fill and the subtle ink on the list, which is why neither inks a row’s detail or the note', () => {
  assert.notDeepEqual(shortfalls(themes, '--fab-text-muted', [hover, panel]), []);
  assert.notDeepEqual(shortfalls(themes, '--fab-text-subtle', [panel]), []);
});

test('the cursor’s ring and the current row’s tick clear 3:1 on the list and under the hover fill', () => {
  const ring = rules.find((rule) => splitSelectorList(rule.selector).includes(CURSOR));
  assert.equal(propertiesOf(ring).get('outline'), '2px solid var(--fab-accent)');
  assert.equal(token(TICK, 'color'), '--fab-accent');
  for (const stack of PANEL_STACKS) {
    assert.deepEqual(shortfalls(themes, '--fab-accent', stack, 3), [], stack.join(' over '));
  }
});

for (const ground of GROUNDS) {
  test(`the error face keeps the value, the placeholder, the lit border and the message legible over ${ground}`, () => {
    const fill = token(ERROR_FILL, 'background');
    assert.equal(fill, '--fab-danger-soft');
    assert.equal(token(PLACEHOLDER, 'color'), '--fab-text-secondary');
    assert.equal(token(LIT, 'border-color'), '--fab-accent');
    assert.equal(token(MESSAGE, 'color'), '--fab-danger-text');
    assert.deepEqual(shortfalls(themes, '--fab-text', [fill, ground]), []);
    assert.deepEqual(shortfalls(themes, '--fab-text-secondary', [fill, ground]), []);
    assert.deepEqual(shortfalls(themes, '--fab-accent', [fill, ground], 3), []);
    assert.deepEqual(shortfalls(themes, '--fab-danger-text', [ground]), []);
  });
}

test('the muted placeholder ink falls short on the error fill over --fab-bg-2, which is why the error face takes the secondary ink', () => {
  assert.notDeepEqual(
    shortfalls(themes, '--fab-text-muted', ['--fab-danger-soft', '--fab-bg-2']),
    []
  );
});
