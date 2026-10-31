/**
 * Issue 2841: the published `Button`'s `accent` and `urgent` roles, read off the module sheet in all
 * seven palettes on the four grounds its group names. The outlined accent label inks
 * `--fab-accent-text` on no fill at rest and on `--fab-accent-soft` under the pointer, and the urgent
 * label `--fab-on-accent` on the solid `--fab-accent`, each clearing 4.5:1; the accent edge and the
 * urgent tile, both `--fab-accent`, clear 3:1 on the four grounds; the accent label also clears on
 * every tone's tinted fill at rest and under the pointer; and neither face draws a ring of its own.
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
const rules = rulesIn(collectStyleCorpus()[SHEET]);
const themes = themePalettes(rules);
/** The rules the default display draws; the forced-colours block is the reader's palette. */
const screen = rules.filter((rule) => !/forced-colors/u.test(rule.context ?? ''));
const token = (selector, property) => declaredToken(screen, selector, property, SHEET);
const GROUNDS = ['--fab-bg-0', '--fab-bg-1', '--fab-surface', '--fab-bg-2'];
const HOVER = ":not(:disabled, [aria-disabled='true']):hover";
const ACCENT = '.fabricate-button.fabricate-button.is-accent-action';
const URGENT = '.fabricate-button.fabricate-button.is-urgent-action';

/** Each face's label, fill and edge; `transparent` draws the ground beneath it. */
const FACES = Object.freeze([
  [`${ACCENT}:not(:disabled)`, ['--fab-accent-text', 'transparent', '--fab-accent']],
  [`${ACCENT}${HOVER}`, ['--fab-accent-text', '--fab-accent-soft', '--fab-accent']],
  [`${URGENT}:not(:disabled)`, ['--fab-on-accent', '--fab-accent', '--fab-accent']],
  [`${URGENT}${HOVER}`, ['--fab-on-accent', '--fab-accent-hover', '--fab-accent-hover']],
]);

/** A face's fill as a stack over `ground`, top first. */
const stackOver = (fill, ground) => (fill === 'transparent' ? [ground] : [fill, ground]);

/** One face rule's label, fill and edge, its fill read as written when it is not one token. */
function faceOf(selector) {
  const rule = screen.find((entry) => splitSelectorList(entry.selector).includes(selector));
  assert.ok(rule, `${SHEET} draws no ${selector}`);
  const background = propertiesOf(rule).get('background');
  const fill = background === 'transparent' ? background : token(selector, 'background');
  return [token(selector, 'color'), fill, token(selector, 'border-color')];
}

for (const [selector, tokens] of FACES) {
  test(`${selector} inks its label clear of 4.5:1 on its fill over each of the four grounds`, () => {
    const [ink, fill] = faceOf(selector);
    assert.deepEqual(faceOf(selector), tokens);
    for (const ground of GROUNDS) {
      assert.deepEqual(shortfalls(themes, ink, stackOver(fill, ground)), [], ground);
    }
  });
}

test('the accent edge and the urgent tile clear 3:1 on each of the four grounds at rest and under the pointer', () => {
  for (const edge of ['--fab-accent', '--fab-accent-hover']) {
    for (const ground of GROUNDS) {
      assert.deepEqual(shortfalls(themes, edge, [ground], 3), [], `${edge} on ${ground}`);
    }
  }
});

test('the accent label clears 4.5:1 on every tone’s tinted fill at rest and under the pointer, and falls short on --fab-bg-3 in hearth-herb alone', () => {
  for (const tone of ['warning', 'success', 'info', 'danger', 'accent']) {
    for (const ground of GROUNDS) {
      const stack = [`--fab-${tone}-soft`, ground];
      for (const [face, layers] of [
        ['rest', stack],
        ['hover', ['--fab-accent-soft', ...stack]],
      ]) {
        const short = shortfalls(themes, '--fab-accent-text', layers);
        assert.deepEqual(short, [], `${face} on ${tone} over ${ground}`);
      }
    }
  }
  const short = shortfalls(themes, '--fab-accent-text', ['--fab-bg-3']);
  assert.deepEqual(
    short.map((line) => line.split(':', 1)[0]),
    ['hearth-herb']
  );
});

test('neither face draws a ring of its own, so the button keeps the accent ring 2px clear', () => {
  const faces = screen.filter((rule) =>
    splitSelectorList(rule.selector).some((part) =>
      /^\.fabricate-button\..*\.is-(?:accent|urgent)-action\b/u.test(part)
    )
  );
  assert.deepEqual(
    faces.map((rule) => [...propertiesOf(rule).keys()]),
    [
      ['border-color', 'color', 'background'],
      ['border-color', 'color', 'background'],
      ['border-color', 'color', 'background'],
      ['border-color', 'color', 'background'],
    ],
    'the accent and urgent faces at rest and under the pointer'
  );
});
