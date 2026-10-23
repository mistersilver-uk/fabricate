/**
 * `Medallion`'s `tone: accent` and `ink: neutral`: what each paints, the precedence of `ink` over
 * `tone` over `tint` on the glyph, and a value outside the accepted set drawing byte-identical to
 * unset (ui-extension-points spec, "Medallion").
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { underSheet } from '../helpers/publishedComponentModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const PRIMITIVE = 'src/ui/svelte/components/Medallion.svelte';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-medallion-tone-ink-',
  rawModules: [],
  compiledModules: [PRIMITIVE],
  componentPath: PRIMITIVE,
});

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

const TOKENS = `*, *::before, *::after { box-sizing: border-box; }
:root {
  --fab-accent: rgb(1, 1, 1);
  --fab-border: rgb(2, 2, 2);
  --fab-bg-3: rgb(3, 3, 3);
  --fab-accent-border: rgb(10, 11, 12);
  --fab-accent-soft: rgb(13, 14, 15);
  --fab-accent-text: rgb(16, 17, 18);
  --fab-text-secondary: rgb(19, 20, 21);
  --fab-tag-rose: rgb(22, 23, 24);
}`;
const ACCENT_TEXT = 'rgb(16, 17, 18)';
const SECONDARY = 'rgb(19, 20, 21)';

async function tileOf(props) {
  harness.remount();
  const root = await harness.mount({ size: 30, ...props });
  return root.querySelector('.fab-medallion');
}

const glyphColour = (tile) => getComputedStyle(tile.querySelector('i')).color;
const ownClasses = (tile) => [...tile.classList].filter((name) => !name.startsWith('svelte-'));

describe('Medallion (mounted) — tone accent and ink neutral', () => {
  it('draws a value outside the accepted set exactly as unset', async () => {
    const unset = await tileOf({});
    const rendered = unset.outerHTML;
    assert.deepEqual(ownClasses(unset), ['fab-medallion', 'is-corner-7']);
    for (const props of [{ tone: '' }, { ink: '' }, { tone: 'bogus' }, { ink: 'bogus' }]) {
      const tile = await tileOf(props);
      assert.equal(tile.outerHTML, rendered, JSON.stringify(props));
    }
  });

  it('paints tone accent on the edge, ground and glyph of a bordered tile', async () => {
    await underSheet(TOKENS, async () => {
      const tile = await tileOf({ tone: 'accent' });
      assert.deepEqual(ownClasses(tile), ['fab-medallion', 'is-corner-7', 'is-tone-accent']);
      const face = getComputedStyle(tile);
      assert.equal(face.borderTopWidth, '1px');
      assert.equal(face.borderTopColor, 'rgb(10, 11, 12)');
      assert.equal(face.backgroundColor, 'rgb(13, 14, 15)');
      assert.equal(glyphColour(tile), ACCENT_TEXT);
    });
  });

  it('draws no accent edge on the glyph chip, which owns the absent border', async () => {
    await underSheet(TOKENS, async () => {
      const tile = await tileOf({ tone: 'accent', variant: 'glyph-chip' });
      assert.equal(getComputedStyle(tile).borderTopWidth, '0px');
      assert.equal(getComputedStyle(tile).backgroundColor, 'rgb(13, 14, 15)');
    });
  });

  it('inks the glyph alone in --fab-text-secondary for ink neutral', async () => {
    await underSheet(TOKENS, async () => {
      const tile = await tileOf({ ink: 'neutral' });
      assert.deepEqual(ownClasses(tile), ['fab-medallion', 'is-corner-7', 'is-ink-neutral']);
      assert.equal(getComputedStyle(tile).borderTopColor, 'rgb(2, 2, 2)');
      assert.equal(getComputedStyle(tile).backgroundColor, 'rgb(3, 3, 3)');
      assert.equal(glyphColour(tile), SECONDARY);
    });
  });

  const PRECEDENCE = [
    ['ink outranks tone on the glyph', { tone: 'accent', ink: 'neutral' }, SECONDARY],
    ['tone outranks tint', { tint: 'rose', tone: 'accent' }, ACCENT_TEXT],
    ['ink outranks tint', { tint: 'rose', ink: 'neutral' }, SECONDARY],
  ];
  for (const [claim, props, colour] of PRECEDENCE) {
    it(claim, async () => {
      await underSheet(TOKENS, async () => {
        assert.equal(glyphColour(await tileOf(props)), colour);
      });
    });
  }
});
