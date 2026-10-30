/**
 * Issue 2815: every `Kicker` size rung inks the one tone the default rung does, never its own, so
 * the muted and accent inks clear 4.5:1 in all seven themes on each ground a kicker sits on, at 8,
 * 8.5 and 9px alike; a rung that declared a `color` would be an ink nothing here measures.
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

const KICKER = 'src/ui/svelte/components/Kicker.svelte';
const corpus = collectStyleCorpus();
const themes = themePalettes(rulesIn(corpus['styles/fabricate.css']));
const rules = rulesIn(corpus[KICKER]);

const GROUNDS = ['--fab-bg-0', '--fab-bg-1', '--fab-bg-2', '--fab-surface'];
const RUNGS = Object.freeze({
  '.fab-kicker': ['8.5px', '0.11em'],
  '.fab-kicker.is-size-8': ['8px', '0.11em'],
  '.fab-kicker.is-size-9': ['9px', '0.12em'],
});

const rule = (selector) =>
  rules.find((entry) => splitSelectorList(entry.selector).includes(selector));

/** The properties that can move a label's ink or its legibility, whatever a rung's size. */
const INK_PROPERTIES = Object.freeze([
  'color',
  'opacity',
  'filter',
  'mix-blend-mode',
  'background',
  'background-color',
  'background-image',
  'background-clip',
  '-webkit-background-clip',
  '-webkit-text-fill-color',
  '-webkit-text-stroke',
  'text-shadow',
  'visibility',
]);

test('each rung states its size and the tracking it draws', () => {
  for (const [selector, [size, tracking]] of Object.entries(RUNGS)) {
    const properties = propertiesOf(rule(selector));
    assert.equal(properties.get('font-size'), size, `${selector} size`);
    assert.equal(properties.get('letter-spacing'), tracking, `${selector} tracking`);
  }
});

test('no rule that names a size rung declares anything that moves the ink', () => {
  const sized = rules.filter((entry) => entry.selector.includes('is-size-'));
  assert.ok(sized.length >= 2, `the scan found ${sized.length} size rules`);
  for (const entry of sized) {
    const declared = [...propertiesOf(entry).keys()].filter((name) =>
      INK_PROPERTIES.includes(name)
    );
    assert.deepEqual(declared, [], `${entry.selector} restates the ink`);
  }
});

for (const [name, selector] of [
  ['muted', '.fab-kicker'],
  ['accent', '.fab-kicker.is-accent'],
]) {
  const ink = declaredToken(rules, selector, 'color', KICKER);
  for (const ground of GROUNDS) {
    test(`the ${name} ink clears 4.5:1 on ${ground} in every theme`, () => {
      assert.deepEqual(shortfalls(themes, ink, [ground]), []);
    });
  }
}

test('the default ink is the muted tone, not the subtle one the premium companion draws', () => {
  assert.equal(declaredToken(rules, '.fab-kicker', 'color', KICKER), '--fab-text-muted');
  assert.notDeepEqual(shortfalls(themes, '--fab-text-subtle', ['--fab-bg-1']), []);
});
