/**
 * `Medallion` draws its art rung's corner: 6 at 22, 7 at 26 and 30, and the shipped 9 at 38 and
 * off the ladder (design-system spec, "Geometry comes from the published ladders").
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

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

describe('Medallion (mounted) — the corner follows the art rung', () => {
  it('takes one corner class at 22, 26 and 30, and none at 38 or off the ladder', async () => {
    for (const [size, expected] of [
      [22, ['is-corner-6']],
      [26, ['is-corner-7']],
      [30, ['is-corner-7']],
      [38, []],
      [40, []],
    ]) {
      const root = await harness.mount({ size });
      assert.deepEqual(cornerClasses(root), expected, `a ${size}px tile`);
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
  });
});
