/** Issue 2357 D2 and D3: the formatted Stepper's null endpoint reads muted on the outcome row, and widens to its label. */
import assert from 'node:assert/strict';
import test from 'node:test';

import { collectStyleCorpus, rulesIn, splitSelectorList } from '../helpers/styleBlockScan.js';
import {
  declaredToken,
  propertiesOf,
  shortfalls,
  themePalettes,
} from '../helpers/themePaletteContrast.js';

const STEPPER = 'src/ui/svelte/components/Stepper.svelte';
const SHEET = 'styles/fabricate.css';
const corpus = collectStyleCorpus();
const stepper = rulesIn(corpus[STEPPER]);
const sheet = rulesIn(corpus[SHEET]);
const themes = themePalettes(sheet);

const rulesFor = (rules, selector) =>
  rules.filter((rule) => splitSelectorList(rule.selector).includes(selector));

test('the endpoint label reads muted at rest and clears 4.5:1 on the outcome row in every theme', () => {
  const ink = declaredToken(
    stepper,
    '.fab-stepper-input[data-stepper-endpoint]:not(:focus-visible)',
    'color',
    STEPPER
  );
  assert.equal(ink, '--fab-text-muted');
  const stack = [
    declaredToken(stepper, '.fab-stepper', 'background', STEPPER),
    declaredToken(
      sheet,
      '.fabricate-manager .manager-checks-tier-list > .manager-checks-tier-row',
      'background',
      SHEET
    ),
  ];
  const slot = rulesFor(sheet, '.fabricate-manager .manager-checks-tier-stepper');
  assert.ok(slot.length > 0, 'the outcome row’s stepper slot rule is gone');
  for (const rule of slot) {
    const declared = propertiesOf(rule);
    assert.ok(!declared.has('background') && !declared.has('background-color'), 'slot ground');
  }
  const input = rulesFor(stepper, '.fab-stepper-input').map((rule) => propertiesOf(rule));
  assert.deepEqual(
    input.map((declared) => declared.get('background')),
    ['transparent'],
    'the input paints no ground of its own'
  );
  assert.deepEqual(shortfalls(themes, ink, stack), []);
  assert.notDeepEqual(
    shortfalls(themes, '--fab-text-subtle', stack),
    [],
    'the drawing’s subtle ink falls short, so muted is the floor'
  );
});

test('only the horizontal unfilled endpoint widens, to its label and never under 64px', () => {
  const widths = stepper.filter(
    (rule) => rule.selector.includes('[data-stepper-endpoint]') && propertiesOf(rule).has('width')
  );
  assert.equal(widths.length, 1, 'one endpoint width rule');
  assert.deepEqual(splitSelectorList(widths[0].selector), [
    '.fab-stepper:not(.is-vertical):not(.is-fill) .fab-stepper-input[data-stepper-endpoint]',
  ]);
  assert.equal(
    propertiesOf(widths[0]).get('width'),
    'max(64px, calc(var(--fab-stepper-endpoint-ch) * 1ch + 2 * var(--fab-space-2xs)))'
  );
});
