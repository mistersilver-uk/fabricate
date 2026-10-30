/**
 * Issue 2813: an `Avatar` glyph inherits the tile's `--fab-text` ink with no colour of its own, and
 * that ink clears 4.5:1 on the tile's `--fab-bg-3` ground in all seven themes, so the glyph reads
 * at least as well as the initials it replaces at every portrait rung.
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

const AVATAR = 'src/ui/svelte/components/Avatar.svelte';
const corpus = collectStyleCorpus();
const themes = themePalettes(rulesIn(corpus['styles/fabricate.css']));
const rules = rulesIn(corpus[AVATAR]);
const token = (selector, property) => declaredToken(rules, selector, property, AVATAR);

test('the tile inks --fab-text on --fab-bg-3 and the glyph declares no colour of its own', () => {
  assert.deepEqual(
    [token('.fab-avatar', 'color'), token('.fab-avatar', 'background')],
    ['--fab-text', '--fab-bg-3']
  );
  const glyphRules = rules.filter((rule) =>
    splitSelectorList(rule.selector).includes('.fab-avatar > i')
  );
  assert.equal(glyphRules.length, 1, 'the glyph has one rule');
  assert.equal(propertiesOf(glyphRules[0]).has('color'), false, 'it inherits the tile ink');
});

test('the tile ink clears 4.5:1 on its ground in all seven themes', () => {
  assert.deepEqual(shortfalls(themes, '--fab-text', ['--fab-bg-3']), []);
});
