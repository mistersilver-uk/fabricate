/** The module sheet's seven theme palettes, and WCAG contrast read over them (issues 2047, 2257). */
import assert from 'node:assert/strict';

import { declarationsIn, splitSelectorList } from './styleBlockScan.js';

/** One rule's declarations, keyed by property. */
export const propertiesOf = (rule) =>
  new Map(declarationsIn('', rule.body).map(({ property, value }) => [property, value]));

/** Each palette's custom properties, keyed by theme id, from its `.fabricate[...]` root. */
export function themePalettes(sheetRules) {
  const found = new Map();
  for (const rule of sheetRules) {
    for (const selector of splitSelectorList(rule.selector)) {
      const theme = selector.match(/^\.fabricate\[data-fabricate-theme="([\w-]+)"\]$/u)?.[1];
      if (theme) found.set(theme, propertiesOf(rule));
    }
  }
  return found;
}

/** `[r, g, b, a]` from a `#RRGGBB` or a space-separated `rgb(r g b / a%)` palette value. */
function channels(value) {
  const hex = value.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/iu);
  if (hex) return [...hex.slice(1).map((pair) => Number.parseInt(pair, 16)), 1];
  const rgb = value.match(/^rgb\(([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+)%)?\)$/u);
  assert.ok(rgb, `a palette value this guard cannot read: ${value}`);
  return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] ? Number(rgb[4]) / 100 : 1];
}

/** `top` composited over `ground`, as an opaque `rgb()`; `ground` must itself be opaque. */
function over(top, ground) {
  const [r, g, b, alpha] = channels(top);
  const base = channels(ground);
  assert.equal(base[3], 1, `a ground must be opaque, so flatten its stack first: ${ground}`);
  return [r, g, b].map((value, index) => value * alpha + base[index] * (1 - alpha));
}

/** The opaque ground `top` paints over the opaque `base`, for a stack of translucent grounds. */
export function flatten(top, base) {
  return `rgb(${over(top, base).join(' ')})`;
}

/** WCAG contrast of `ink` composited over the opaque `ground`. */
export function contrast(ink, ground) {
  const base = channels(ground);
  const shown = over(ink, ground);
  const lum = (rgb) =>
    rgb
      .map((value) => value / 255)
      .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
      .reduce((sum, c, index) => sum + c * [0.2126, 0.7152, 0.0722][index], 0);
  const [high, low] = [lum(shown), lum(base.slice(0, 3))].sort((a, b) => b - a);
  return (high + 0.05) / (low + 0.05);
}
