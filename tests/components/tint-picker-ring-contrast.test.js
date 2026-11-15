/**
 * Issues 2257 D3, 2416, 2459 and 2901: the tint palette's selected ring and keyboard cursor,
 * declared and measured, on `TintSwatches`' radios and on the popover's square tiles.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { MANAGER_COLOR_TOKEN_KEYS } from '../../src/ui/svelte/util/managerColorTokens.js';
import { byCodePoint } from '../helpers/codePointOrder.js';
import { readDesignLibrary } from '../helpers/designLibrary.js';
import { collectStyleCorpus, rulesIn, splitSelectorList } from '../helpers/styleBlockScan.js';
import {
  contrast,
  declaredToken,
  propertiesOf,
  shortfalls,
  stackGround,
  themePalettes,
} from '../helpers/themePaletteContrast.js';

const SHEET = 'styles/fabricate.css';
const SWATCHES = 'src/ui/svelte/components/TintSwatches.svelte';
const corpus = collectStyleCorpus();
const sheet = rulesIn(corpus[SHEET]);
const themes = themePalettes(sheet);

const SWATCH_RING = '.fabricate-tint-swatch.is-selected .fabricate-tint-swatch-fill';
const TILE_RING =
  ".fabricate-color-picker-popover.fabricate-picker-popover .manager-travel-option[aria-selected='true'] .manager-color-swatch";
const NONE_RING = '.fabricate-tint-swatch.is-none.is-selected .fabricate-tint-swatch-fill';
const NONE_FILL = '.fabricate-tint-swatch.is-none .fabricate-tint-swatch-fill';

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
function ringInk(selector, file = SWATCHES) {
  const ink = declared(file, selector, 'box-shadow').match(
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

/** The two inks of the strip's selected swatch: its inset dark ring and its outer text-ink ring. */
function twoToneInks() {
  const layers = declared(SWATCHES, SWATCH_RING, 'box-shadow')
    .split(/,\s*/u)
    .map((layer) => layer.match(/^(inset )?0 0 0 2px var\((--fab-[\w-]+)\)$/u));
  assert.equal(layers.length, 2, `${SWATCH_RING} is not a two-layer 2px ring`);
  assert.ok(layers.every(Boolean), `${SWATCH_RING} draws a layer that is not a 2px ring`);
  assert.deepEqual(
    layers.map((layer) => Boolean(layer[1])),
    [true, false],
    'the dark ring is inset and the outer one is not'
  );
  return { inner: layers[0][2], outer: layers[1][2] };
}

/** Each inline caller's ground under the strip, as a palette stack per theme. */
function stripGrounds() {
  return Object.values(INLINE_GROUNDS).map((selectors) =>
    selectors.map((ground) => {
      const [selector, property] = Array.isArray(ground) ? ground : [ground, 'background'];
      return declaredToken(sheet, selector, property, SHEET);
    })
  );
}

test('a colour swatch rings in two tones, and one clears 3:1 on every tint and ground in every theme', (t) => {
  const { inner, outer } = twoToneInks();
  assert.deepEqual([inner, outer], ['--fab-biome-icon-foreground', '--fab-text']);
  const fills = MANAGER_COLOR_TOKEN_KEYS.map((token) => `--fab-tag-${token}`);
  assert.equal(fills.length, 10);
  assert.equal(themes.size, 7, `the sheet declares ${themes.size} palettes, not seven`);
  const short = [];
  let lowest = Infinity;
  for (const [theme, tokens] of themes) {
    for (const stack of stripGrounds()) {
      const ground = stackGround(tokens, stack);
      const outside = contrast(tokens.get(outer), ground);
      for (const fill of fills) {
        const best = Math.max(contrast(tokens.get(inner), tokens.get(fill)), outside);
        lowest = Math.min(lowest, best);
        if (best < 3)
          short.push(`${theme}: ${fill} on ${stack.join(' over ')} ${best.toFixed(2)}:1`);
      }
    }
  }
  t.diagnostic(`lowest better-of-two swatch ring ratio ${lowest.toFixed(2)}:1`);
  assert.deepEqual(short, [], 'a selected swatch would be under WCAG 1.4.11');
  // The dark ring alone is still the popover tile's, which has no outer ring.
  assert.equal(
    ringInk(TILE_RING, SHEET),
    inner,
    "the popover's selected tile rings in the same ink"
  );
});

test('the No-colour cell rings in the text ink at 3:1 on its own fill in every theme', (t) => {
  const ink = ringInk(NONE_RING);
  assert.equal(ink, '--fab-text');
  const fill = declared(SWATCHES, NONE_FILL, 'background').match(/^var\((--fab-[\w-]+)\)$/u)?.[1];
  assert.equal(fill, '--fab-bg-3', 'the No-colour cell is filled from one palette token');
  const { lowest, short } = measure(ink, [fill]);
  t.diagnostic(`lowest No-colour ring ratio ${lowest.toFixed(2)}:1`);
  assert.deepEqual(short, [], 'a selected No-colour cell would be under WCAG 1.4.11');
});

test('the No-colour glyph inks secondary and clears 3:1 on its own fill in every theme (issue 2368)', () => {
  const own = rulesIn(corpus[SWATCHES]);
  const ink = declaredToken(own, NONE_FILL, 'color', SWATCHES);
  assert.equal(ink, '--fab-text-secondary');
  const fill = declaredToken(own, NONE_FILL, 'background', SWATCHES);
  assert.deepEqual(shortfalls(themes, ink, [fill], 3), []);
  assert.notDeepEqual(shortfalls(themes, '--fab-text-muted', [fill], 3), [], 'muted falls short');
});

const CURSOR = '.fabricate-tint-swatch:focus-visible';
const HOVER = '.fabricate-tint-swatch:hover::after';
const PICKER_CURSOR =
  ".fabricate-picker-popover.manager-travel-popover .manager-travel-option[data-active-option='true']";
const TILE_HOVER =
  ".fabricate-picker-popover .manager-travel-popover-options[data-picker-tiles='square'] .manager-travel-option:hover:not([data-active-option='true'])";

/** The `outline` and `outline-offset` `file` declares on `selector`. */
const outlineOf = (selector, file = SHEET) =>
  ['outline', 'outline-offset'].map((property) => declared(file, selector, property));

test("the inline strip's keyboard cursor declares the picker cursor's outline (issue 2416)", () => {
  assert.deepEqual(outlineOf(CURSOR, SWATCHES), outlineOf(PICKER_CURSOR));
});

/** The inline `outline` and `outline-offset` of each outlined cell the library's shipped popover draws. */
function drawnOutlines() {
  const { document } = new Window();
  document.write(readDesignLibrary());
  const unit = [...document.querySelectorAll('.unit')].find(
    (candidate) => candidate.querySelector('.cap')?.textContent === 'popover — shipped'
  );
  assert.ok(unit, 'the library draws no shipped popover unit');
  return [...unit.querySelectorAll(':scope div[style]')]
    .map((cell) => propertiesOf({ body: cell.getAttribute('style') }))
    .filter((style) => style.has('outline'))
    .map((style) => [style.get('outline'), style.get('outline-offset')]);
}

test("the library draws the shipped popover's cursor and hover as the sheet declares them", () => {
  // The shipped popover is the picker's grid form (issue 2459): its tiles take the picker's cursor
  // and the square tile's hover, which the inline strip's hover rule restates.
  assert.deepEqual(drawnOutlines(), [outlineOf(PICKER_CURSOR), outlineOf(TILE_HOVER)]);
  // The strip draws the same ring as a border, 2px wide and 1px clear of its 1px edge, placed from
  // the padding box inside that edge.
  const [outline, offset] = outlineOf(TILE_HOVER);
  const edge = 1;
  assert.deepEqual(
    ['border', 'inset'].map((property) => declared(SWATCHES, HOVER, property)),
    [outline, `-${edge + Number.parseFloat(offset) + Number.parseFloat(outline)}px`],
    'the strip hover'
  );
});

/** The cursor's ink on `stack` in each palette: the palettes under 3:1, and every ratio in words. */
function cursorOn(stack, cursor = CURSOR, file = SWATCHES) {
  const ink = declared(file, cursor, 'outline').match(/^2px solid var\((--fab-[\w-]+)\)$/u)?.[1];
  assert.ok(ink, 'the cursor is not a 2px outline in one palette token');
  assert.equal(themes.size, 7, `the sheet declares ${themes.size} palettes, not seven`);
  const ratios = [...themes].map(([theme, tokens]) => [
    theme,
    contrast(tokens.get(ink), stackGround(tokens, stack)),
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

// The popover's cursor sits on a square tile's soft ground over the panel's bg-0, beside the bg-0
// gap between tiles (issue 2459); the bg-3 box it used to sit on is gone.
const PANEL_GROUND = '.fabricate-picker-popover.manager-travel-popover';
const TILE_GROUND =
  ".fabricate-color-picker-popover.fabricate-picker-popover .manager-travel-popover-options[data-picker-tiles='square'] .manager-travel-option[aria-selected='true']";

test('the popover cursor clears 3:1 on the tile ground and on the panel ground, in every palette', (t) => {
  const panel = declaredToken(sheet, PANEL_GROUND, 'background', SHEET);
  const tile = declaredToken(sheet, TILE_GROUND, 'background', SHEET);
  assert.deepEqual([tile, panel], ['--fab-surface-soft', '--fab-bg-0']);
  for (const stack of [[tile, panel], [panel]]) {
    const { short, lowest, figures } = cursorOn(stack, PICKER_CURSOR, SHEET);
    t.diagnostic(`lowest cursor ratio on ${stack.join(' over ')} ${lowest}:1 (${figures})`);
    assert.deepEqual(short, [], `the popover cursor would be under WCAG 1.4.11 on ${stack}`);
  }
});

/**
 * Each inline caller's ground, as the sheet selectors that paint it, top first; a `[selector,
 * property]` pair reads a fill token the selector declares rather than its `background`.
 */
const INLINE_GROUNDS = {
  EssenceIdentityTab: ['.fabricate-manager .manager-edit-card', '.fabricate-manager .manager-main'],
  EssenceBulkEditPanel: [
    [
      ".fabricate-manager[data-manager-view='essences'] .manager-inspector",
      '--fab-manager-inspector-bg',
    ],
  ],
  WorldEssenceEntryPage: [
    ".fabricate-manager[data-manager-view='world-essence-entry'] .manager-main",
  ],
};

for (const [caller, selectors] of Object.entries(INLINE_GROUNDS)) {
  test(`the cursor clears 3:1 on the inline strip's ground in ${caller}, in every palette`, (t) => {
    const stack = selectors.map((ground) => {
      const [selector, property] = Array.isArray(ground) ? ground : [ground, 'background'];
      return declaredToken(sheet, selector, property, SHEET);
    });
    const { short, lowest, figures } = cursorOn(stack);
    t.diagnostic(`lowest cursor ratio on ${stack.join(' over ')} ${lowest}:1 (${figures})`);
    assert.deepEqual(short, [], `the inline cursor would be under WCAG 1.4.11 in ${caller}`);
  });
}
