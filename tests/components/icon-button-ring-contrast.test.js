/**
 * Issue 2601: the published `IconButton`'s keyboard ring is the accent, 2px wide and 2px clear of
 * the button, from the module ring every Fabricate window draws and from the button's own rule
 * alike, and it clears 3:1 in all seven themes against `--fab-bg-0`, `--fab-bg-1`, `--fab-surface`
 * and `--fab-bg-2`, the grounds its group names, and falls short against `--fab-bg-3` in two.
 * Read off the sheet: a frame shows one theme only.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { collectStyleCorpus, rulesIn, splitSelectorList } from '../helpers/styleBlockScan.js';
import { propertiesOf, shortfalls, themePalettes } from '../helpers/themePaletteContrast.js';

const SHEET = 'styles/fabricate.css';
const MODULE_RING = '.fabricate button:focus-visible';
const OWN_RING = '.fabricate-icon-button:focus-visible';

const rules = rulesIn(collectStyleCorpus()[SHEET]);
const themes = themePalettes(rules);
const listing = (selector) =>
  rules.filter((rule) => splitSelectorList(rule.selector).includes(selector));

for (const selector of [MODULE_RING, OWN_RING]) {
  test(`${selector} draws the accent 2px wide and 2px clear`, () => {
    const drawn = listing(selector);
    assert.equal(drawn.length, 1, 'one rule draws it');
    const ring = propertiesOf(drawn[0]);
    assert.equal(ring.get('outline'), '2px solid var(--fab-accent)');
    assert.equal(ring.get('outline-offset'), '2px');
  });
}

for (const ground of ['--fab-bg-0', '--fab-bg-1', '--fab-surface', '--fab-bg-2']) {
  test(`the ring clears 3:1 on ${ground} in every theme`, () => {
    assert.deepEqual(shortfalls(themes, '--fab-accent', [ground], 3), []);
  });
}

test('the ring falls short of 3:1 on --fab-bg-3 in two themes, so the group names four grounds', () => {
  assert.equal(shortfalls(themes, '--fab-accent', ['--fab-bg-3'], 3).length, 2);
});
