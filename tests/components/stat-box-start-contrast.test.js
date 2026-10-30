/**
 * Issue 2819: the label-first `StatBox` and its note ink only tokens the default form already
 * uses, and each clears its floor in all seven themes on every ground the box can sit on: its own
 * `--fab-bg-1` fill, and the translucent danger fill over each page ground a companion draws on.
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

const STAT_BOX = 'src/ui/svelte/components/StatBox.svelte';
const corpus = collectStyleCorpus();
const themes = themePalettes(rulesIn(corpus['styles/fabricate.css']));
const rules = rulesIn(corpus[STAT_BOX]);

const PAGE_GROUNDS = ['--fab-bg-0', '--fab-bg-1', '--fab-bg-2', '--fab-surface'];

const fillOf = (selector) => declaredToken(rules, selector, 'background', STAT_BOX);

/** The box's grounds as stacks, top first: the default fill, then the danger fill over each page ground. */
const GROUNDS = Object.freeze([
  { name: 'the default fill', stack: [fillOf('.fab-stat-box')], tone: 'default' },
  ...PAGE_GROUNDS.map((ground) => ({
    name: `the danger fill over ${ground}`,
    stack: [fillOf('.fab-stat-box.is-danger'), ground],
    tone: 'danger',
  })),
]);

const NOTE = Object.freeze({
  default: '.fab-stat-box-note',
  danger: '.fab-stat-box.is-danger .fab-stat-box-note',
});

const FIGURE = Object.freeze({
  default: '.fab-stat-box-value',
  info: '.fab-stat-box.is-info .fab-stat-box-value',
  danger: '.fab-stat-box.is-danger .fab-stat-box-value',
});

const rule = (selector) =>
  rules.find((entry) => splitSelectorList(entry.selector).includes(selector));

test('the box states the two fills this census measures', () => {
  assert.equal(fillOf('.fab-stat-box'), '--fab-bg-1');
  assert.equal(fillOf('.fab-stat-box.is-danger'), '--fab-danger-soft');
});

test('the note inks muted, and the danger ink in the danger tone', () => {
  assert.equal(declaredToken(rules, NOTE.default, 'color', STAT_BOX), '--fab-text-muted');
  assert.equal(declaredToken(rules, NOTE.danger, 'color', STAT_BOX), '--fab-danger-text');
});

for (const { name, stack, tone } of GROUNDS) {
  test(`the note clears 4.5:1 on ${name} in every theme`, () => {
    const ink = declaredToken(rules, NOTE[tone], 'color', STAT_BOX);
    assert.deepEqual(shortfalls(themes, ink, stack), []);
  });

  test(`the ${tone} figure clears 4.5:1 on ${name} in every theme, at both layouts`, () => {
    const ink = declaredToken(rules, FIGURE[tone], 'color', STAT_BOX);
    assert.deepEqual(shortfalls(themes, ink, stack), []);
  });
}

test('the info figure clears 4.5:1 on the default fill in every theme, at both layouts', () => {
  const ink = declaredToken(rules, FIGURE.info, 'color', STAT_BOX);
  assert.deepEqual(shortfalls(themes, ink, [fillOf('.fab-stat-box')]), []);
});

test('the start layout restates no ink, so the figure keeps the tone it is measured at', () => {
  const start = rules.filter((entry) => entry.selector.includes('.is-start'));
  assert.ok(start.length >= 4, `the scan found ${start.length} start rules`);
  for (const entry of start) {
    const declared = [...propertiesOf(entry).keys()].filter((property) =>
      [
        'color',
        'opacity',
        'filter',
        'background',
        'background-color',
        'mix-blend-mode',
        'text-shadow',
        'visibility',
      ].includes(property)
    );
    assert.deepEqual(declared, [], `${entry.selector} restates the ink`);
  }
  assert.equal(rule('.fab-stat-box.is-start .fab-stat-box-value') !== undefined, true);
});
