/**
 * The module sheet and every component style against the published `Well` (issue 2601): one
 * selector names its root class, the well's own rule that fills it `--fab-bg-2` inside Fabricate's
 * modal, which the Well group states, so beyond that fill a published well draws the same in every
 * Fabricate window.
 * Limit: the census shares `published-component-manifest.test.js`'s sheet-reach limits.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { entryNamed, shippedCensus, syntheticCensus } from './helpers/publishedComponentCensus.js';
import { declarationsOf } from './helpers/publishedComponentGate.js';

/** The published well's root: no published key writes a class on it, and no ancestor is pinned. */
const WELL = Object.freeze({
  root: 'fab-well',
  writable: new Set(),
  ancestors: new Set(),
  drawsChildren: true,
});

const reachingIn = (css) =>
  syntheticCensus(WELL, `${css} { gap: 0 }`, { spelled: new Set() })
    .filter(({ safe }) => !safe)
    .map(({ written }) => written);

describe('the module sheet and every component style against the published Well', () => {
  it("names the well's root in one selector, its own modal fill", () => {
    const census = shippedCensus(WELL, 'Well');
    assert.deepEqual(
      census.map(({ written }) => written),
      ['src/ui/svelte/components/Well.svelte: :global(.fabricate-modal) .fab-well']
    );
    assert.deepEqual(declarationsOf(census[0].rule), [['background', 'var(--fab-bg-2)']]);
    assert.deepEqual(
      [Object.keys(entryNamed('Well').props), entryNamed('Well').root],
      [['label', 'children'], 'fabricate'],
      'a published class or a wider root reopens the census'
    );
  });

  for (const selector of ['.fabricate .fab-well', '.fab-well > p', '.fab-well[data-x]']) {
    it(`refuses ${selector}, which nothing keeps off a published well`, () => {
      assert.deepEqual(reachingIn(selector), [`sheet.css: ${selector}`]);
    });
  }
});
