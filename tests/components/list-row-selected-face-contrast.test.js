/**
 * Issue 2851 — the selected face a read-only `ListRow` draws, against the four grounds a published
 * row is mounted on, in all seven themes: its fill is the translucent active wash, so each ink is
 * read over that wash flattened onto each ground. The name and the row's ink clear 4.5:1; a muted
 * name and the accent edge do not everywhere, which is why the row's text must carry the meaning.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { collectStyleCorpus, rulesIn } from '../helpers/styleBlockScan.js';
import { shortfalls, themePalettes, tokenReader } from '../helpers/themePaletteContrast.js';

const SHEET = 'styles/fabricate.css';
const corpus = collectStyleCorpus();
const themes = themePalettes(rulesIn(corpus[SHEET]));
const token = tokenReader(corpus);

const GROUNDS = Object.freeze(['--fab-bg-0', '--fab-bg-1', '--fab-surface', '--fab-bg-2']);
const FACE = '.fabricate-list-row.is-selected-face:not(.is-danger)';
const PRESSED =
  ".fabricate-list-row:not(.is-danger):has(> .fabricate-list-row-open[aria-pressed='true'])";

test('draws the read-only face in the pressed face’s wash, edge and ink', () => {
  for (const property of ['background', 'color']) {
    assert.equal(token(SHEET, FACE, property), token(SHEET, PRESSED, property), property);
  }
  assert.equal(
    token(SHEET, '.fabricate-list-row.is-selected-face', 'border-color'),
    '--fab-accent-border'
  );
  assert.equal(token(SHEET, FACE, 'background'), '--fab-surface-active');
});

test('clears 4.5:1 for the name and the row’s ink on the wash over each ground', () => {
  const wash = token(SHEET, FACE, 'background');
  const ink = token(SHEET, FACE, 'color');
  const name = token(SHEET, '.fabricate-list-row .fabricate-list-row-name', 'color');
  assert.deepEqual([name, ink], ['--fab-text', '--fab-text-secondary']);
  for (const ground of GROUNDS) {
    for (const drawn of [name, ink]) {
      assert.deepEqual(shortfalls(themes, drawn, [wash, ground]), [], `${drawn} on ${ground}`);
    }
  }
});

test('falls short for a muted name off --fab-bg-0, and for the edge as a 3:1 mark', () => {
  const wash = token(SHEET, FACE, 'background');
  const muted = token(SHEET, '.fabricate-list-row.is-muted .fabricate-list-row-name', 'color');
  assert.deepEqual(shortfalls(themes, muted, [wash, '--fab-bg-0']), []);
  for (const ground of GROUNDS.slice(1)) {
    assert.notDeepEqual(shortfalls(themes, muted, [wash, ground]), [], `muted on ${ground}`);
  }
  for (const ground of GROUNDS) {
    assert.notDeepEqual(
      shortfalls(themes, '--fab-accent-border', [ground], 3),
      [],
      `the edge against ${ground} is no 3:1 state mark`
    );
  }
});
