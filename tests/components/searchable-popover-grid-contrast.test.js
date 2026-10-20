/**
 * Issue 2459: the search popover's key-hint row reads in every palette. The hint ink and the
 * footer action's accent are read from the rules that declare them, then measured at 4.5:1 on the
 * panel's `--fab-bg-0`, and the action again on the ghost's own hover ground over it.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { collectStyleCorpus, rulesIn } from '../helpers/styleBlockScan.js';
import { declaredToken, shortfalls, themePalettes } from '../helpers/themePaletteContrast.js';

const SHEET = 'styles/fabricate.css';
const sheet = rulesIn(collectStyleCorpus()[SHEET]);
const themes = themePalettes(sheet);
const token = (selector, property) => declaredToken(sheet, selector, property, SHEET);

const PANEL = '.fabricate-picker-popover.manager-travel-popover';
const HINT = '.fabricate-picker-popover .fabricate-picker-key-hints-text';
const ACTION =
  '.fabricate-picker-popover .fabricate-picker-key-hints .fabricate-picker-footer-action.is-ghost.is-size-28:not(:disabled)';
const GHOST_HOVER =
  ".fabricate-button.fabricate-button.fab-manager-button.is-ghost:not(:disabled, [aria-disabled='true']):hover";

test('the key hints are muted ink that clears 4.5:1 on the panel in every palette', () => {
  const ground = token(PANEL, 'background');
  assert.equal(ground, '--fab-bg-0');
  const ink = token(HINT, 'color');
  assert.equal(ink, '--fab-text-muted', 'the hints share the muted ink in either form');
  assert.deepEqual(shortfalls(themes, ink, [ground]), []);
});

test('the footer action is accent ink that clears 4.5:1 at rest and on its hover ground', () => {
  const rest = token(ACTION, 'color');
  assert.equal(rest, '--fab-accent');
  assert.equal(token(`${ACTION}:hover`, 'color'), rest, 'the hover keeps the accent ink');
  assert.deepEqual(shortfalls(themes, rest, ['--fab-bg-0']), []);
  const hoverGround = token(GHOST_HOVER, 'background');
  assert.equal(hoverGround, '--fab-surface-raised');
  assert.deepEqual(shortfalls(themes, rest, [hoverGround, '--fab-bg-0']), []);
});
