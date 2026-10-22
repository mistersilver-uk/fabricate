/**
 * The clauses a published control's keyboard ring is held to under a `fabricate` root (issue
 * 2601): the module ring and the control's own rule each draw the accent 2px wide and 2px clear,
 * and the accent clears 3:1 in all seven themes on the four grounds a control's group names and
 * falls short on `--fab-bg-3` in two. Read off the sheet: a frame shows one theme only.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { collectStyleCorpus, rulesIn, splitSelectorList } from './styleBlockScan.js';
import { propertiesOf, shortfalls, themePalettes } from './themePaletteContrast.js';

const SHEET = 'styles/fabricate.css';
const MODULE_RING = '.fabricate button:focus-visible';
const RING_GROUNDS = Object.freeze(['--fab-bg-0', '--fab-bg-1', '--fab-surface', '--fab-bg-2']);

/** Defines the ring clauses for a control whose own `:focus-visible` rule is `ownRing`. */
export function defineAccentRingContrast(ownRing) {
  const rules = rulesIn(collectStyleCorpus()[SHEET]);
  const themes = themePalettes(rules);
  const listing = (selector) =>
    rules.filter((rule) => splitSelectorList(rule.selector).includes(selector));

  for (const selector of [MODULE_RING, ownRing]) {
    test(`${selector} draws the accent 2px wide and 2px clear`, () => {
      const drawn = listing(selector);
      assert.equal(drawn.length, 1, 'one rule draws it');
      const ring = propertiesOf(drawn[0]);
      assert.equal(ring.get('outline'), '2px solid var(--fab-accent)');
      assert.equal(ring.get('outline-offset'), '2px');
    });
  }

  for (const ground of RING_GROUNDS) {
    test(`the ring clears 3:1 on ${ground} in every theme`, () => {
      assert.deepEqual(shortfalls(themes, '--fab-accent', [ground], 3), []);
    });
  }

  test('the ring falls short of 3:1 on --fab-bg-3 in two themes, so the group names four grounds', () => {
    assert.equal(shortfalls(themes, '--fab-accent', ['--fab-bg-3'], 3).length, 2);
  });
}
