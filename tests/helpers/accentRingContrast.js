/**
 * The clauses a published control's keyboard ring is held to under a `fabricate` root (issue
 * 2601): the module ring and the control's own rule each draw the accent 2px wide and 2px clear,
 * and the accent clears 3:1 in all seven themes on the four grounds a control's group names and
 * on each of `stacks`, a translucent ground top first as `shortfalls` reads one, and falls short on
 * `--fab-bg-3` in two. Read off the sheet: a frame shows one theme only.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { collectStyleCorpus, rulesIn, splitSelectorList } from './styleBlockScan.js';
import { propertiesOf, shortfalls, themePalettes } from './themePaletteContrast.js';

const SHEET = 'styles/fabricate.css';
const MODULE_RING = '.fabricate button:focus-visible';
const RING_GROUNDS = Object.freeze(['--fab-bg-0', '--fab-bg-1', '--fab-surface', '--fab-bg-2']);
/** The ratio a keyboard ring clears against its ground, the floor of both contrast clauses. */
const RING_CONTRAST = 3;

/**
 * Defines the ring clauses for a control whose own `:focus-visible` rule is `ownRing`, under the
 * module rings `moduleRings` name, `.fabricate button:focus-visible` unless stated.
 */
export function defineAccentRingContrast(
  ownRing,
  { moduleRings = [MODULE_RING], stacks = [] } = {}
) {
  const rules = rulesIn(collectStyleCorpus()[SHEET]);
  const themes = themePalettes(rules);
  const listing = (selector) =>
    rules.filter((rule) => splitSelectorList(rule.selector).includes(selector));
  const ringShortfalls = (stack) => shortfalls(themes, '--fab-accent', stack, RING_CONTRAST);

  const rings = [...moduleRings, ownRing];
  for (const selector of rings) {
    test(`${selector} draws the accent 2px wide and 2px clear`, () => {
      const drawn = listing(selector);
      assert.equal(drawn.length, 1, 'one rule draws it');
      const ring = propertiesOf(drawn[0]);
      assert.equal(ring.get('outline'), '2px solid var(--fab-accent)');
      assert.equal(ring.get('outline-offset'), '2px');
    });
  }

  test(`${ownRing} is a rule of its own beside the module ring`, () => {
    assert.equal(new Set(rings.flatMap(listing)).size, rings.length);
  });

  for (const stack of [...RING_GROUNDS.map((ground) => [ground]), ...stacks]) {
    test(`the ring clears 3:1 on ${stack.join(' over ')} in every theme`, () => {
      assert.deepEqual(ringShortfalls(stack), []);
    });
  }

  test('the ring falls short of 3:1 on --fab-bg-3 in two themes, so the group names four grounds', () => {
    assert.equal(ringShortfalls(['--fab-bg-3']).length, 2);
  });
}
