/**
 * Issue 2852: the published `Button`'s `info` role and pressed face, read off the module sheet in
 * all seven palettes on the four grounds its group names. The info label inks `--fab-info-text` on
 * `--fab-info-soft` and the pressed label `--fab-on-accent` on the solid `--fab-accent`, each clearing
 * 4.5:1 at rest and under the pointer; the pressed edge clears 3:1 on the ground, so the state
 * shows without the fill's colour, and the info edge does not in six palettes, so its label marks
 * the control; and neither face draws a ring of its own, so the keyboard ring is the group's accent.
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
const corpus = collectStyleCorpus();
const rules = rulesIn(corpus[SHEET]);
const themes = themePalettes(rules);
/** The rules the default display draws; the forced-colours block is the reader's palette. */
const screen = rules.filter((rule) => !/forced-colors/u.test(rule.context ?? ''));
const token = (selector, property) => declaredToken(screen, selector, property, SHEET);
const GROUNDS = ['--fab-bg-0', '--fab-bg-1', '--fab-surface', '--fab-bg-2'];
const HOVER = ":not(:disabled, [aria-disabled='true']):hover";

const INFO = '.fabricate-button.fabricate-button.is-info-action';
const PRESSED = '.fabricate-button.fabricate-button.fabricate-button.fabricate-button.is-pressed';
const FACES = Object.freeze([
  [`${INFO}:not(:disabled)`, ['--fab-info-text', '--fab-info-soft', '--fab-info-border']],
  [`${INFO}${HOVER}`, ['--fab-info-text', '--fab-info-soft', '--fab-info']],
  [`${PRESSED}:not(:disabled)`, ['--fab-on-accent', '--fab-accent', '--fab-accent']],
  [`${PRESSED}${HOVER}`, ['--fab-on-accent', '--fab-accent-hover', '--fab-accent-hover']],
]);

for (const [selector, tokens] of FACES) {
  test(`${selector} inks its label clear of 4.5:1 on its fill over each of the four grounds`, () => {
    const [ink, fill, edge] = ['color', 'background', 'border-color'].map((property) =>
      token(selector, property)
    );
    assert.deepEqual([ink, fill, edge], tokens);
    for (const ground of GROUNDS) {
      assert.deepEqual(shortfalls(themes, ink, [fill, ground]), [], ground);
    }
  });
}

test('the pressed tile clears 3:1 on each of the four grounds at rest and under the pointer', () => {
  for (const edge of ['--fab-accent', '--fab-accent-hover']) {
    for (const ground of GROUNDS) {
      assert.deepEqual(shortfalls(themes, edge, [ground], 3), [], `${edge} on ${ground}`);
    }
  }
});

test('the info edge falls short of 3:1 on each ground in six palettes, so the label marks the control', () => {
  for (const ground of GROUNDS) {
    assert.equal(shortfalls(themes, '--fab-info-border', [ground], 3).length, 6, ground);
  }
});

test('neither face draws a ring of its own, so the button keeps the accent ring 2px clear', () => {
  const faces = screen.filter((rule) =>
    splitSelectorList(rule.selector).some((part) =>
      /^\.fabricate-button\..*\.is-(?:info-action|pressed)\b/u.test(part)
    )
  );
  assert.deepEqual(
    faces.map((rule) => [...propertiesOf(rule).keys()]),
    [
      ['border-color', 'color', 'background'],
      ['border-color', 'color', 'background'],
      ['border-color', 'color', 'background'],
      ['border-color', 'color', 'background'],
      ['border-color', 'color', 'background'],
    ],
    'the info faces at rest and under the pointer, and the pressed faces at rest, under the pointer and disabled'
  );
});
