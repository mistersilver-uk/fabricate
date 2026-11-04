/**
 * `Medallion`'s `text` and `ink: accent` as the component draws them (ui-extension-points spec,
 * "Medallion"): which values draw, that anything else draws the tile as unset, what the text
 * replaces and which ink it takes, and the accent ink on the glyph.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { underSheet } from '../helpers/publishedComponentModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const PRIMITIVE = 'src/ui/svelte/components/Medallion.svelte';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-medallion-text-',
  rawModules: [],
  compiledModules: [PRIMITIVE],
  componentPath: PRIMITIVE,
});

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

const TOKENS = `:root {
  --fab-text: rgb(1, 1, 1);
  --fab-accent: rgb(2, 2, 2);
  --fab-accent-text: rgb(16, 17, 18);
  --fab-accent-soft: rgb(13, 14, 15);
  --fab-success-text: rgb(30, 31, 32);
  --fab-info-text: rgb(40, 41, 42);
  --fab-tag-rose: rgb(22, 23, 24);
  --fab-font-mono: monospace;
}`;

async function tileOf(props) {
  harness.remount();
  const root = await harness.mount({ size: 30, ...props });
  return root.querySelector('.fab-medallion');
}

const ownClasses = (tile) => [...tile.classList].filter((name) => !name.startsWith('svelte-'));
const colourOf = (node) => getComputedStyle(node).color;

describe('Medallion (mounted) — text', () => {
  const DRAWN = [
    ['1', '1'],
    ['12', '12'],
    ['A', 'A'],
    ['99+', '99+'],
    ['★', '★'],
    ['\u{1F600}', '\u{1F600}'],
    ['\u{1F600}\u{1F600}\u{1F600}', '\u{1F600}\u{1F600}\u{1F600}'],
    ['\u{6F22}', '\u{6F22}'],
    [7, '7'],
    [0, '0'],
    [-1, '-1'],
    [0.5, '0.5'],
    [42, '42'],
  ];
  for (const [value, drawn] of DRAWN) {
    it(`draws ${JSON.stringify(value)} as ${JSON.stringify(drawn)}, hidden from assistive technology`, async () => {
      const tile = await tileOf({ text: value });
      const text = tile.querySelector('.fab-medallion-text');
      assert.equal(text.textContent, drawn);
      assert.equal(text.getAttribute('aria-hidden'), 'true');
      assert.equal(tile.getAttribute('data-medallion'), 'text');
      assert.deepEqual(
        [...tile.children].map((child) => child.tagName),
        ['SPAN'],
        'the numeral replaces the glyph and the image'
      );
    });
  }

  const OUTSIDE = [
    '',
    ' ',
    '1234',
    '1 2',
    '\u{1F600}\u{1F600}\u{1F600}\u{1F600}',
    '\u{200B}',
    '\u{2060}',
    '\u{00AD}',
    '\u{0085}',
    '\u{2800}',
    '\u{3164}',
    '\u{115F}',
    '\u{180E}',
    '\u{0301}',
    'a\u{0301}\u{0301}\u{0301}',
    '\u{1F3F3}\u{FE0F}\u{200D}\u{1F308}',
    '1\u{200B}',
    ' 1',
    '1\n',
    ' 1',
    1234,
    -100,
    1e21,
    NaN,
    Infinity,
    null,
    undefined,
    true,
    false,
    ['1'],
    { toString: () => '1' },
    () => '1',
  ];
  it('draws a value outside the accepted set exactly as unset, without throwing', async () => {
    const unset = await tileOf({});
    const rendered = unset.outerHTML;
    assert.deepEqual(unset.getAttributeNames(), ['class', 'data-medallion', 'style']);
    assert.equal(unset.getAttribute('data-medallion'), 'glyph');
    for (const value of OUTSIDE) {
      const tile = await tileOf({ text: value });
      assert.equal(
        tile.outerHTML,
        rendered,
        String(typeof value === 'function' ? 'fn' : (JSON.stringify(value) ?? value))
      );
    }
  });

  it('draws an out-of-set text as the art where there is art, and as the glyph where there is none', async () => {
    const withArt = await tileOf({ art: 'icons/x.webp', alt: '', text: '1234' });
    assert.equal(withArt.getAttribute('data-medallion'), 'image');
    assert.ok(withArt.querySelector('img.fab-medallion-img'));
    assert.equal(withArt.querySelector('.fab-medallion-text'), null);
  });

  it('outranks both the art and the glyph, and draws no image or icon beside the text', async () => {
    const tile = await tileOf({ art: 'icons/x.webp', alt: 'Sword', icon: 'fas fa-gem', text: '3' });
    assert.equal(tile.getAttribute('data-medallion'), 'text');
    assert.equal(tile.querySelector('img'), null);
    assert.equal(tile.querySelector('i'), null);
    assert.equal(tile.textContent, '3');
  });

  it('keeps the tile’s classes, its size and its corner', async () => {
    const tile = await tileOf({
      text: '3',
      size: 22,
      glyph: 10,
      tone: 'info',
      variant: 'glyph-chip',
    });
    assert.deepEqual(ownClasses(tile), [
      'fab-medallion',
      'is-glyph-chip',
      'is-corner-6',
      'is-tone-info',
    ]);
    assert.equal(tile.style.width, '22px');
    assert.equal(tile.style.getPropertyValue('--fab-medallion-glyph'), '10px');
  });

  it('draws the text in --fab-text on the untoned tile, whatever the tint and the ink', async () => {
    await underSheet(TOKENS, async () => {
      for (const props of [
        {},
        { tint: 'rose' },
        { ink: 'success' },
        { ink: 'accent', tint: 'rose' },
      ]) {
        const tile = await tileOf({ text: '3', ...props });
        assert.equal(
          colourOf(tile.querySelector('.fab-medallion-text')),
          'rgb(1, 1, 1)',
          JSON.stringify(props)
        );
      }
    });
  });

  it('draws the text in a tone’s -text, and an ink does not reach it', async () => {
    await underSheet(TOKENS, async () => {
      const toned = await tileOf({ text: '3', tone: 'info' });
      assert.equal(colourOf(toned.querySelector('.fab-medallion-text')), 'rgb(40, 41, 42)');
      const inked = await tileOf({ text: '3', tone: 'info', ink: 'success' });
      assert.equal(colourOf(inked.querySelector('.fab-medallion-text')), 'rgb(40, 41, 42)');
    });
  });

  it('sets the text in the mono face at the rung’s glyph size, at weight 500', async () => {
    await underSheet(TOKENS, async () => {
      const text = (await tileOf({ text: '3', glyph: 11 })).querySelector('.fab-medallion-text');
      assert.equal(getComputedStyle(text).fontWeight, '500');
      assert.equal(getComputedStyle(text).fontFamily, 'monospace');
    });
  });
});

describe('Medallion (mounted) — ink accent', () => {
  it('inks the glyph alone in --fab-accent-text, on the unchanged slate ground', async () => {
    await underSheet(TOKENS, async () => {
      const tile = await tileOf({ ink: 'accent' });
      assert.deepEqual(ownClasses(tile), ['fab-medallion', 'is-corner-7', 'is-ink-accent']);
      assert.equal(colourOf(tile.querySelector('i')), 'rgb(16, 17, 18)');
    });
  });

  it('outranks a tint and a tone on the glyph, and the tone keeps its ground', async () => {
    await underSheet(TOKENS, async () => {
      const tile = await tileOf({ ink: 'accent', tint: 'rose', tone: 'success' });
      assert.equal(colourOf(tile.querySelector('i')), 'rgb(16, 17, 18)');
      const other = await tileOf({ ink: 'success', tone: 'accent' });
      assert.equal(colourOf(other.querySelector('i')), 'rgb(30, 31, 32)');
      assert.equal(getComputedStyle(other).backgroundColor, 'rgb(13, 14, 15)');
    });
  });

  it('draws an unlisted spelling exactly as unset', async () => {
    const unset = (await tileOf({})).outerHTML;
    for (const ink of ['Accent', ' accent', 'accent-text', 'primary']) {
      assert.equal((await tileOf({ ink })).outerHTML, unset, ink);
    }
  });
});
