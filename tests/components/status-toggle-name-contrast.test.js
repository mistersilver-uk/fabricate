/**
 * Issues 2902 and 2795 — the published `StatusToggle`'s label, read off its own rule, against the
 * four grounds a published switch is mounted on, in all seven palettes: it is the body ink in both
 * states, never the off state's muted reading ink, and clears the 4.5:1 text floor on each ground.
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
const NAME = '.fabricate-toggle .manager-status-toggle-name';

test('draws the label in the body ink, not the off reading’s muted one', () => {
  assert.equal(token(SHEET, NAME, 'color'), '--fab-text');
  assert.equal(
    token(SHEET, '.fabricate-toggle.fabricate-toggle.is-off', 'color'),
    '--fab-text-muted'
  );
});

test('clears 4.5:1 for the label on each of the four grounds in all seven palettes', () => {
  const ink = token(SHEET, NAME, 'color');
  assert.deepEqual(
    GROUNDS.flatMap((ground) => shortfalls(themes, ink, [ground])),
    []
  );
});
