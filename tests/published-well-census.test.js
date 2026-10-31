/**
 * The module sheet and every component style against the published `Well` (issue 2601): five
 * selectors name its root class, the well's own rule that fills it `--fab-bg-2` inside Fabricate's
 * modal, which the Well group states, and its four toned-label inks (issue 2854), so beyond those a
 * published well draws the same in every Fabricate window.
 * Limit: the census shares `published-component-manifest.test.js`'s sheet-reach limits.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { entryNamed, shippedCensus, syntheticCensus } from './helpers/publishedComponentCensus.js';
import { declarationsOf, gatedRoot } from './helpers/publishedComponentGate.js';

/** The published well's root: `tone` writes its four tone classes on it, and no ancestor is pinned. */
const WELL = Object.freeze({
  root: 'fab-well',
  writable: new Set(['is-tone-warning', 'is-tone-success', 'is-tone-accent', 'is-tone-info']),
  ancestors: new Set(),
  drawsChildren: true,
});

const reachingIn = (css) =>
  syntheticCensus(WELL, `${css} { gap: 0 }`, { spelled: new Set() })
    .filter(({ safe }) => !safe)
    .map(({ written }) => written);

describe('the module sheet and every component style against the published Well', () => {
  it("names the well's root in five selectors, its own modal fill and its toned label's ink", () => {
    const census = shippedCensus(WELL, 'Well');
    const tones = ['warning', 'success', 'accent', 'info'];
    assert.deepEqual(
      census.map(({ written }) => written),
      [
        'src/ui/svelte/components/Well.svelte: :global(.fabricate-modal) .fab-well',
        ...tones.map(
          (tone) =>
            `src/ui/svelte/components/Well.svelte: .fab-well.fab-well.is-tone-${tone} > .fab-well-label > :global(.fab-kicker)`
        ),
      ]
    );
    assert.deepEqual(declarationsOf(census[0].rule), [['background', 'var(--fab-bg-2)']]);
    for (const { rule } of census.slice(1)) {
      assert.deepEqual(declarationsOf(rule), [['color', 'var(--fab-text-secondary)']]);
    }
    assert.deepEqual(
      [Object.keys(entryNamed('Well').props), gatedRoot(entryNamed('Well'))],
      [['label', 'children', 'tone'], 'fabricate'],
      'a published class or a wider root reopens the census'
    );
  });

  for (const selector of ['.fabricate .fab-well', '.fab-well > p', '.fab-well[data-x]']) {
    it(`refuses ${selector}, which nothing keeps off a published well`, () => {
      assert.deepEqual(reachingIn(selector), [`sheet.css: ${selector}`]);
    });
  }
});
