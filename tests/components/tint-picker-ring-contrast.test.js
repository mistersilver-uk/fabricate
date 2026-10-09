/** Issue 2257 D3: the tint palette's selected ring clears 3:1 on every fill it is drawn on. */
import assert from 'node:assert/strict';
import test from 'node:test';

import { MANAGER_COLOR_TOKEN_KEYS } from '../../src/ui/svelte/util/managerColorTokens.js';
import { collectStyleCorpus, rulesIn, splitSelectorList } from '../helpers/styleBlockScan.js';
import { contrast, propertiesOf, themePalettes } from '../helpers/themePaletteContrast.js';

const SHEET = 'styles/fabricate.css';
const PICKER = 'src/ui/svelte/components/TintPicker.svelte';
const corpus = collectStyleCorpus();
const themes = themePalettes(rulesIn(corpus[SHEET]));

const SWATCH_RING =
  '.fabricate-color-picker-popover .manager-color-preset.is-selected .manager-color-swatch';
const NONE_RING =
  '.fabricate-color-picker-popover .manager-color-preset-none.is-selected .manager-color-swatch';

/** The one declaration of `property` on the rule in `file` whose selector list holds `selector`. */
function declared(file, selector, property) {
  const values = rulesIn(corpus[file])
    .filter((rule) => splitSelectorList(rule.selector).includes(selector))
    .map((rule) => propertiesOf(rule).get(property))
    .filter(Boolean);
  assert.equal(
    values.length,
    1,
    `${file} declares ${property} on ${selector} ${values.length} times`
  );
  return values[0];
}

/** The token a selected cell's ring is inked in: a 2px inset ring, never an outline. */
function ringInk(selector) {
  const ink = declared(SHEET, selector, 'box-shadow').match(
    /^inset 0 0 0 2px var\((--fab-[\w-]+)\)$/u
  );
  assert.ok(ink, `${selector} draws no 2px inset ring`);
  return ink[1];
}

/** Each theme's lowest ratio of `ink` over the named fills, and every pair under 3:1. */
function measure(ink, fills) {
  assert.equal(themes.size, 7, `the sheet declares ${themes.size} palettes, not seven`);
  const lowest = [];
  const short = [];
  for (const [theme, tokens] of themes) {
    const ratios = fills.map((fill) => [fill, contrast(tokens.get(ink), tokens.get(fill))]);
    lowest.push(Math.min(...ratios.map(([, ratio]) => ratio)));
    for (const [fill, ratio] of ratios) {
      if (ratio < 3) short.push(`${theme}: ${ink} on ${fill} ${ratio.toFixed(2)}:1`);
    }
  }
  return { lowest: Math.min(...lowest), short };
}

test('a colour swatch rings in the dark ink at 3:1 on all eight swatches in every theme', (t) => {
  const ink = ringInk(SWATCH_RING);
  assert.equal(ink, '--fab-biome-icon-foreground');
  const fills = MANAGER_COLOR_TOKEN_KEYS.map((token) => `--fab-tag-${token}`);
  assert.equal(fills.length, 8);
  const { lowest, short } = measure(ink, fills);
  t.diagnostic(`lowest swatch ring ratio ${lowest.toFixed(2)}:1`);
  assert.deepEqual(short, [], 'a selected swatch would be under WCAG 1.4.11');
});

test('the No-colour cell rings in the text ink at 3:1 on its own fill in every theme', (t) => {
  const ink = ringInk(NONE_RING);
  assert.equal(ink, '--fab-text');
  const fill = declared(PICKER, '.manager-color-swatch-none', 'background').match(
    /^var\((--fab-[\w-]+)\)$/u
  )?.[1];
  assert.equal(fill, '--fab-bg-3', 'the No-colour cell is filled from one palette token');
  const { lowest, short } = measure(ink, [fill]);
  t.diagnostic(`lowest No-colour ring ratio ${lowest.toFixed(2)}:1`);
  assert.deepEqual(short, [], 'a selected No-colour cell would be under WCAG 1.4.11');
});
