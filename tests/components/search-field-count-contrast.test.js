/**
 * Issue 2849: the published `SearchField`'s trailing count inks `--fab-text-muted`, the
 * placeholder's ink, read off the sheet, and clears 4.5:1 on the shell's translucent
 * `--fab-surface-soft` over `--fab-bg-0`, `--fab-bg-1`, `--fab-surface` and `--fab-bg-2` in all
 * seven themes, and not over `--fab-bg-3`, as the SearchField group states. The shell's lit border,
 * the accent, clears 3:1 against the shell over those four grounds and against them beyond its edge,
 * and falls short over `--fab-bg-3` in two themes.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { collectStyleCorpus, rulesIn } from '../helpers/styleBlockScan.js';
import { declaredToken, shortfalls, themePalettes } from '../helpers/themePaletteContrast.js';

const SHEET = 'styles/fabricate.css';
const SHELL = '.fabricate-search.fabricate-search:not(.is-compact)';
const COUNT = `${SHELL} > .fabricate-search-count`;
const PLACEHOLDER = `${SHELL} input:not(:focus-visible)::placeholder`;

const rules = rulesIn(collectStyleCorpus()[SHEET]);
const themes = themePalettes(rules);
const ink = declaredToken(rules, COUNT, 'color', SHEET);
const shell = declaredToken(rules, SHELL, 'background', SHEET);

test('the count inks the placeholder’s muted ink on the soft shell', () => {
  assert.equal(ink, '--fab-text-muted');
  assert.equal(declaredToken(rules, PLACEHOLDER, 'color', SHEET), ink);
  assert.equal(shell, '--fab-surface-soft');
});

for (const ground of ['--fab-bg-0', '--fab-bg-1', '--fab-surface', '--fab-bg-2']) {
  test(`the count clears 4.5:1 on the shell over ${ground} in every theme`, () => {
    assert.deepEqual(shortfalls(themes, ink, [shell, ground]), []);
  });
}

test('the count falls short of 4.5:1 on the shell over --fab-bg-3 in some theme', () => {
  assert.notDeepEqual(shortfalls(themes, ink, [shell, '--fab-bg-3']), []);
  assert.notDeepEqual(
    shortfalls(themes, '--fab-text-subtle', [shell, '--fab-bg-2']),
    [],
    'the subtle ink falls short where muted clears, so muted is the floor'
  );
});

test('the lit border clears 3:1 on the shell and beyond its edge over the four grounds, and not over --fab-bg-3', () => {
  assert.equal(
    declaredToken(rules, `${SHELL}:focus-within`, 'border-color', SHEET),
    '--fab-accent'
  );
  for (const ground of ['--fab-bg-0', '--fab-bg-1', '--fab-surface', '--fab-bg-2']) {
    assert.deepEqual(shortfalls(themes, '--fab-accent', [shell, ground], 3), [], ground);
    assert.deepEqual(shortfalls(themes, '--fab-accent', [ground], 3), [], ground);
  }
  assert.equal(shortfalls(themes, '--fab-accent', [shell, '--fab-bg-3'], 3).length, 2);
});
