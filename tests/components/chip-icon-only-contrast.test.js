/**
 * Issue 2858 — the published icon-only `Chip`'s glyph is a graphic a reader needs, so under each
 * published `tone` and none it clears 3:1 (WCAG 2.2 §1.4.11) against the chip's own fill over
 * `--fab-bg-0`, `--fab-bg-1`, `--fab-surface` and `--fab-bg-2` in all seven palettes, with no
 * emphasis or `dashed`, which shares that paint, and on the opaque `outlined` and `solid` grounds;
 * `bare` changes the edge alone. Two private tones, which the seam withholds, fall short and are
 * pinned so: `muted`, the disabled ink, and `subtle`. Read off the rules.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { collectStyleCorpus, rulesIn, splitSelectorList } from '../helpers/styleBlockScan.js';
import { propertiesOf, shortfalls, themePalettes } from '../helpers/themePaletteContrast.js';

const CHIP = 'src/ui/svelte/components/Chip.svelte';
const corpus = collectStyleCorpus();
const themes = themePalettes(rulesIn(corpus['styles/fabricate.css']));
const rules = rulesIn(corpus[CHIP]);
const GROUNDS = Object.freeze(['--fab-bg-0', '--fab-bg-1', '--fab-surface', '--fab-bg-2']);
/** The tones `Chip`'s published group names, and none. */
const PUBLISHED_TONES = Object.freeze([
  '',
  'positive',
  'warning',
  'danger',
  'info',
  'neutral',
  'accent',
]);

/** The one value the rules listing `selector` declare for `property`, or `undefined`. */
function declared(selector, property) {
  const values = rules
    .filter((rule) => splitSelectorList(rule.selector).includes(selector))
    .map((rule) => propertiesOf(rule).get(property))
    .filter(Boolean);
  assert.ok(values.length <= 1, `${selector} declares ${property} ${values.length} times`);
  return values[0];
}

const tokenOf = (value) => /^var\((--fab-[\w-]+)\)$/u.exec(value ?? '')?.[1];

/** A tone's glyph ink and fill, falling back to the base chip's for what the tone leaves alone. */
function paintOf(tone) {
  const selector = tone ? `.manager-chip.is-${tone}` : '.manager-chip';
  const ink = declared(selector, 'color') ?? declared('.manager-chip', 'color');
  const fill = declared(selector, 'background') ?? declared('.manager-chip', 'background');
  return { ink: tokenOf(ink), fill: fill === 'none' ? null : tokenOf(fill) };
}

const shortOf = (tone, ground) => {
  const { ink, fill } = paintOf(tone);
  return shortfalls(themes, ink, fill ? [fill, ground] : [ground], 3);
};

test('the dashed emphasis changes the edge’s style alone, so it draws the default paint', () => {
  const dashed = rules.filter((rule) =>
    splitSelectorList(rule.selector).includes('.manager-chip.is-dashed')
  );
  assert.equal(dashed.length, 1);
  assert.deepEqual([...propertiesOf(dashed[0])], [['border-style', 'dashed']]);
});

test('the icon-only square changes the geometry alone, so a tone paints its glyph as it paints a label', () => {
  const square = rules.filter((rule) =>
    splitSelectorList(rule.selector).includes('.manager-chip.is-icon-only')
  );
  assert.equal(square.length, 1);
  const painting = [...propertiesOf(square[0]).keys()].filter((name) =>
    /^(color|background|border)/u.test(name)
  );
  assert.deepEqual(painting, []);
});

for (const tone of PUBLISHED_TONES) {
  test(`the ${tone || 'default'} glyph clears 3:1 on its fill over each of the four grounds in all seven palettes`, () => {
    const { ink, fill } = paintOf(tone);
    assert.ok(ink, `${tone || 'default'} inks one token`);
    assert.ok(fill, `${tone || 'default'} fills one token`);
    for (const ground of GROUNDS) {
      assert.deepEqual(shortOf(tone, ground), [], ground);
    }
  });
}

/** The `solid` rule that paints each published tone, the bare `is-solid` one for none and `neutral`. */
const SOLID = Object.freeze({
  '': '.manager-chip.is-solid',
  neutral: '.manager-chip.is-solid',
  positive: '.manager-chip.is-solid:is(.is-active, .is-positive)',
  warning: '.manager-chip.is-solid:is(.is-disabled, .is-warning)',
  info: '.manager-chip.is-solid.is-info',
  danger: '.manager-chip.is-solid:is(.is-danger, .is-negative)',
  accent: '.manager-chip.is-solid.is-accent',
});

test('every published glyph clears 3:1 on the outlined plate and on its solid ground in all seven palettes', () => {
  const plate = tokenOf(declared('.manager-chip.is-outlined', 'background'));
  assert.equal(plate, '--fab-bg-1');
  for (const tone of PUBLISHED_TONES) {
    assert.deepEqual(shortfalls(themes, paintOf(tone).ink, [plate], 3), [], `outlined ${tone}`);
    const ink = tokenOf(declared(SOLID[tone], 'color'));
    const ground = tokenOf(declared(SOLID[tone], 'background'));
    assert.ok(ink && ground, `solid ${tone} paints one ink on one ground`);
    assert.deepEqual(shortfalls(themes, ink, [ground], 3), [], `solid ${tone}`);
  }
});

test('the private muted and subtle tones fall short, so neither is a published status glyph', () => {
  assert.deepEqual(
    GROUNDS.map((ground) => shortOf('muted', ground).length),
    [6, 6, 6, 6]
  );
  assert.deepEqual(
    GROUNDS.map((ground) => shortOf('subtle', ground).length),
    [0, 0, 0, 2]
  );
});
