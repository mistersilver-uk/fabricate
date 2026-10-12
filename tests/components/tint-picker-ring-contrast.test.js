/** Issues 2257 D3 and 2416: the tint palette's selected ring and keyboard cursor, declared and measured. */
import assert from 'node:assert/strict';
import test from 'node:test';

import { MANAGER_COLOR_TOKEN_KEYS } from '../../src/ui/svelte/util/managerColorTokens.js';
import { byCodePoint } from '../helpers/codePointOrder.js';
import { collectStyleCorpus, rulesIn, splitSelectorList } from '../helpers/styleBlockScan.js';
import {
  contrast,
  declaredToken,
  flatten,
  propertiesOf,
  themePalettes,
} from '../helpers/themePaletteContrast.js';

const SHEET = 'styles/fabricate.css';
const PICKER = 'src/ui/svelte/components/TintPicker.svelte';
const corpus = collectStyleCorpus();
const sheet = rulesIn(corpus[SHEET]);
const themes = themePalettes(sheet);

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

const CURSOR = '.fabricate-color-picker-popover .manager-color-preset:focus-visible';
const PICKER_CURSOR =
  ".fabricate-picker-popover.manager-travel-popover .manager-travel-option[data-active-option='true']";

/** The `outline` and `outline-offset` the sheet declares on `selector`. */
const outlineOf = (selector) =>
  ['outline', 'outline-offset'].map((property) => declared(SHEET, selector, property));

test("the swatch's keyboard cursor declares the picker cursor's outline (issue 2416)", () => {
  assert.deepEqual(outlineOf(CURSOR), outlineOf(PICKER_CURSOR));
});

/** A translucent stack's opaque ground in one palette, its tokens top first. */
const groundOf = (tokens, [top, ...below]) =>
  below.length > 0 ? flatten(tokens.get(top), groundOf(tokens, below)) : tokens.get(top);

/** The cursor's ink on `stack` in each palette: the palettes under 3:1, and every ratio in words. */
function cursorOn(stack) {
  const ink = declared(SHEET, CURSOR, 'outline').match(/^2px solid var\((--fab-[\w-]+)\)$/u)?.[1];
  assert.ok(ink, 'the cursor is not a 2px outline in one palette token');
  assert.equal(themes.size, 7, `the sheet declares ${themes.size} palettes, not seven`);
  const ratios = [...themes].map(([theme, tokens]) => [
    theme,
    contrast(tokens.get(ink), groundOf(tokens, stack)),
  ]);
  return {
    short: ratios
      .filter(([, ratio]) => ratio < 3)
      .map(([theme]) => theme)
      .sort(byCodePoint),
    lowest: Math.min(...ratios.map(([, ratio]) => ratio)).toFixed(2),
    figures: ratios.map(([theme, ratio]) => `${theme} ${ratio.toFixed(2)}`).join(', '),
  };
}

test('the cursor is under 3:1 on the popover ground in two palettes, debt owned by issue 2368', (t) => {
  const ground = declaredToken(
    sheet,
    '.fabricate-color-picker-popover.manager-color-picker-popover',
    'background',
    SHEET
  );
  const { short, lowest, figures } = cursorOn([ground]);
  t.diagnostic(`lowest cursor ratio on ${ground} ${lowest}:1 (${figures})`);
  assert.deepEqual(
    short,
    ['hearth-herb', 'ironblood-forge'],
    'the palettes where the cursor is under WCAG 1.4.11 on the popover moved; issue 2368 owns ' +
      'that ground, so restate the library hint and this list together'
  );
});

test("the cursor clears 3:1 on the inline strip's card ground in every palette", (t) => {
  const stack = ['.fabricate-manager .manager-edit-card', '.fabricate-manager'].map((selector) =>
    declaredToken(sheet, selector, 'background', SHEET)
  );
  const { short, lowest, figures } = cursorOn(stack);
  t.diagnostic(`lowest cursor ratio on ${stack.join(' over ')} ${lowest}:1 (${figures})`);
  assert.deepEqual(short, [], 'the inline cursor would be under WCAG 1.4.11 on its card');
});
