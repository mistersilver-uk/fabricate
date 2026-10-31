/**
 * Issue 2836 — the published `SelectionCheckbox`'s paint, read off its own rules, over
 * `--fab-bg-0`, `--fab-bg-1`, `--fab-surface` and `--fab-bg-2` in all seven palettes: the
 * unticked box's edge clears 3:1 (WCAG 2.2 §1.4.11) against the ground the compact box draws on
 * and against the `--fab-bg-0` fill the default and comfortable boxes enclose; a ticked or mixed
 * box's accent edge clears 3:1 against the ground; the tick clears 3:1 on the accent fill at every
 * density and the dash on the soft fill over each ground; the label clears 4.5:1, and the disabled
 * label, which §1.4.3 exempts, still does; the hover edge is never weaker than the resting one; and
 * on `--fab-bg-3`, which is not a supported ground, the edge and the label fall short.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { collectStyleCorpus, rulesIn, splitSelectorList } from '../helpers/styleBlockScan.js';
import {
  contrast,
  propertiesOf,
  shortfalls,
  themePalettes,
} from '../helpers/themePaletteContrast.js';

const COMPONENT = 'src/ui/svelte/components/SelectionCheckbox.svelte';
const corpus = collectStyleCorpus();
const sheetRules = rulesIn(corpus['styles/fabricate.css']);
const themes = themePalettes(sheetRules);
const rules = rulesIn(corpus[COMPONENT]).filter((rule) => !rule.context);
const GROUNDS = Object.freeze(['--fab-bg-0', '--fab-bg-1', '--fab-surface', '--fab-bg-2']);

/** The one `--fab-*` token the rule listing `selector` names in `property`, past a width and style. */
function tokenOf(selector, property) {
  const values = rules
    .filter((rule) => splitSelectorList(rule.selector).includes(selector))
    .map((rule) => propertiesOf(rule).get(property))
    .filter(Boolean);
  assert.equal(values.length, 1, `${selector} declares ${property} ${values.length} times`);
  const name = /var\((--fab-[\w-]+)\)$/u.exec(values[0])?.[1];
  assert.ok(name, `${selector} ${property} ends in one palette token: ${values[0]}`);
  return name;
}

/** The palette token the module root aliases `--fab-control-outline` to. */
function outlineToken() {
  const aliases = sheetRules
    .map((rule) => propertiesOf(rule).get('--fab-control-outline'))
    .filter(Boolean);
  assert.deepEqual(aliases, ['var(--fab-text-subtle)']);
  return '--fab-text-subtle';
}

const shortOver = (ink, stackOf, floor = 3) =>
  GROUNDS.flatMap((ground) => shortfalls(themes, ink, stackOf(ground), floor));

test('the unticked edge clears 3:1 against each ground and against the fill the larger boxes enclose', () => {
  assert.equal(tokenOf('.fab-selection-check', 'border'), '--fab-control-outline');
  const edge = outlineToken();
  assert.deepEqual(
    shortOver(edge, (ground) => [ground]),
    [],
    'the compact box draws on its ground'
  );
  for (const size of ['.fab-selection-check.is-md', '.fab-selection-check.is-lg']) {
    const fill = tokenOf(size, 'background');
    assert.equal(fill, '--fab-bg-0');
    assert.deepEqual(shortfalls(themes, edge, [fill], 3), [], `${size} on its own fill`);
  }
});

test('a ticked and a mixed box edge in the accent, which clears 3:1 against each ground', () => {
  for (const state of [
    '.fab-selection-check.is-checked',
    '.fab-selection-check.is-indeterminate',
  ]) {
    const edge = tokenOf(state, 'border-color');
    assert.equal(edge, '--fab-accent');
    assert.deepEqual(
      shortOver(edge, (ground) => [ground]),
      [],
      state
    );
  }
});

test('the tick clears 3:1 on the accent fill at every density, and the dash on the soft fill over each ground', () => {
  const fill = tokenOf('.fab-selection-check.is-checked', 'background');
  for (const ink of [
    tokenOf('.fab-selection-check.is-checked', 'color'),
    tokenOf('.fab-selection-check.is-sm.is-checked', 'color'),
  ]) {
    assert.deepEqual(shortfalls(themes, ink, [fill], 3), [], `${ink} on ${fill}`);
  }
  const soft = tokenOf('.fab-selection-check.is-indeterminate', 'background');
  const dash = tokenOf('.fab-selection-check.is-indeterminate', 'color');
  assert.deepEqual(
    shortOver(dash, (ground) => [soft, ground]),
    []
  );
});

test('the label clears 4.5:1 on each ground, and the disabled label still does', () => {
  for (const selector of [
    '.fab-selection-label',
    '.fab-selection-checkbox.is-disabled .fab-selection-label',
  ]) {
    const ink = tokenOf(selector, 'color');
    assert.deepEqual(
      shortOver(ink, (ground) => [ground], 4.5),
      [],
      selector
    );
  }
});

test('the disabled label is a quieter ink than the label', () => {
  assert.notEqual(
    tokenOf('.fab-selection-checkbox.is-disabled .fab-selection-label', 'color'),
    tokenOf('.fab-selection-label', 'color')
  );
});

test('the hover edge clears 3:1 on each ground and never falls below the resting edge', () => {
  const hover = tokenOf(
    '.fab-selection-checkbox:not(.is-disabled):hover .fab-selection-check:not(.is-checked, .is-indeterminate)',
    'border-color'
  );
  const rest = outlineToken();
  assert.deepEqual(
    shortOver(hover, (ground) => [ground]),
    []
  );
  for (const [theme, tokens] of themes) {
    for (const ground of GROUNDS) {
      const ratio = (ink) => contrast(tokens.get(ink), tokens.get(ground));
      assert.ok(ratio(hover) >= ratio(rest), `${theme} on ${ground}`);
    }
  }
});

test('on --fab-bg-3, which the group does not support, the edge falls short in three palettes and the label in two', () => {
  assert.equal(shortfalls(themes, outlineToken(), ['--fab-bg-3'], 3).length, 3);
  assert.equal(
    shortfalls(themes, tokenOf('.fab-selection-label', 'color'), ['--fab-bg-3']).length,
    2
  );
});
