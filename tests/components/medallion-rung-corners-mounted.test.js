/**
 * `Medallion` draws its art rung's corner: 6 at 22 and 24, 7 at 26 to 32, the shipped 9 at 34 to 38
 * and off the ladder, and 11 at 44 (design-system spec, "Geometry comes from the published
 * ladders"), with the glyph size each rung is documented to take.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { bandCorner } from '../../scripts/lib/radiusLadder.js';
import { styleCorpusOf } from '../helpers/designSystemRatchet.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const PRIMITIVE = 'src/ui/svelte/components/Medallion.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-medallion-corners-',
  rawModules: [],
  compiledModules: [PRIMITIVE],
  componentPath: PRIMITIVE,
});

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

const cornerClasses = (root) =>
  [...root.querySelector('.fab-medallion').classList].filter((name) =>
    name.startsWith('is-corner-')
  );

/** Each art rung with the corner class it takes and the glyph size the ladder documents for it. */
const RUNGS = [
  [22, ['is-corner-6'], 10],
  [24, ['is-corner-6'], 10],
  [26, ['is-corner-7'], 11],
  [28, ['is-corner-7'], 11],
  [30, ['is-corner-7'], 12],
  [32, ['is-corner-7'], 13],
  [34, [], 14],
  [36, [], 14],
  [38, [], 15],
  [44, ['is-corner-11'], 18],
];

describe('Medallion (mounted) — the corner follows the art rung', () => {
  it('takes one corner class per rung, none at 9, and none off the ladder', async () => {
    for (const [size, expected] of [...RUNGS.map(([s, c]) => [s, c]), [40, []]]) {
      const root = await harness.mount({ size });
      assert.deepEqual(cornerClasses(root), expected, `a ${size}px tile`);
      harness.remount();
    }
  });

  it('draws every rung at its box, its band corner and its documented glyph size', async () => {
    for (const [size, classes, glyph] of RUNGS) {
      const root = await harness.mount({ size, glyph });
      const tile = root.querySelector('.fab-medallion');
      const style = tile.getAttribute('style').replaceAll(/\s+/g, '');
      assert.ok(style.includes(`width:${size}px;height:${size}px`), `${size} sets its box`);
      assert.ok(style.includes(`--fab-medallion-glyph:${glyph}px`), `${size} sets glyph ${glyph}`);
      const corner = classes.length > 0 ? Number(classes[0].replace('is-corner-', '')) : 9;
      assert.equal(corner, bandCorner(size), `${size} takes the radius ladder's band corner`);
      harness.remount();
    }
  });

  it('paints each corner class at its rung, and the bare tile at 9', () => {
    // ratchet-exempt(source-pin): a mount computes no scoped style; this reads the declared corners
    const source = readFileSync(resolve(repoRoot, PRIMITIVE), 'utf8');
    const corpus = styleCorpusOf((file) => (file === PRIMITIVE ? source : undefined), [PRIMITIVE]);
    const radiusOf = (selector) =>
      corpus.declarations
        .filter((d) => d.selector === selector && d.property === 'border-radius')
        .map((d) => d.value);
    assert.deepEqual(radiusOf('.fab-medallion'), ['9px']);
    assert.deepEqual(radiusOf('.fab-medallion.is-corner-6'), ['6px']);
    assert.deepEqual(radiusOf('.fab-medallion.is-corner-7'), ['7px']);
    assert.deepEqual(radiusOf('.fab-medallion.is-corner-11'), ['11px']);
  });
});
