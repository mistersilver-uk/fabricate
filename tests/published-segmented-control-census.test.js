/**
 * The module sheet and every component style against the published `SegmentedControl` (issue
 * 2644): the four selectors that name its root class, each under an ancestor no extension target
 * sits in, the classes its file spells on the root and on a segment, and the keyboard ring its own
 * scoped rule draws on the segment, 2px wide and 2px clear, which clears 3:1 on the grounds a
 * published control sits on, the track's and the selected segment's fill included.
 * Limit: the census shares `published-component-manifest.test.js`'s sheet-reach limits, and takes on
 * trust that no extension target sits under one of `TRACK.ancestors` or inside the radiogroup.
 * Limit: the classes no published key writes are unreached only while a companion passes no
 * private option member or `density`; one that passes `variant`, `count` or `badge` still draws it.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { defineAccentRingContrast } from './helpers/accentRingContrast.js';
import {
  classesOf,
  compoundsOf,
  dataHooksOf,
  entryNamed,
  placementFaults,
  publishedManagerClasses,
  shippedCensus,
  spelledStrings,
  staleAncestors,
  syntheticCensus,
} from './helpers/publishedComponentCensus.js';
import { SHIPPED, byName, declarationsOf, gatedRoot } from './helpers/publishedComponentGate.js';

const COMPONENT = 'src/ui/svelte/components/SegmentedControl.svelte';

/**
 * The published track's root: the classes `fill` and `density` write beside it, the four row
 * classes a Fabricate rule redraws it under, and the classes its file spells that no published
 * key draws: the tally, the badge, the other densities, the tones, the pill and the icon-only run.
 */
const TRACK = Object.freeze({
  root: 'manager-segmented',
  writable: new Set(['is-fill', 'is-inline']),
  ancestors: new Set([
    'manager-checks-tier-row',
    'manager-recipe-ingredient-option-row',
    'fab-run-action-completion',
    'fab-complication-card-heading',
  ]),
  drawsChildren: true,
  disables: false,
  undrawn: new Set([
    'manager-segment-count',
    'is-badge',
    'is-compact',
    'is-field',
    'is-tag',
    'is-accent',
    'is-accent-soft',
    'is-pill',
    'is-icon-only',
  ]),
});

/** A published segment: its default class and the state classes `value` and `disabled` write. */
const SEGMENT = Object.freeze({
  writable: new Set(['manager-segment', 'is-active', 'is-disabled']),
});

/** The four selectors that name the root, each kept off a published control by its ancestor. */
const ROW_RULES = Object.freeze([
  'styles/fabricate-manager-checks-modifiers.css: .fabricate-manager .manager-checks-tier-row .manager-segmented',
  'styles/fabricate-manager-recipe-editor.css: .fabricate-manager .manager-recipe-ingredient-option-row > .manager-segmented',
  'src/ui/svelte/apps/manager/component/ComponentComplicationsSection.svelte: .fab-complication-card-heading > :global(.manager-segmented)',
  'src/ui/svelte/components/RunActionBar.svelte: .fab-run-action-completion :global(.manager-segmented)',
]);

const OWN_RING = '.manager-segment:has(:focus-visible)';
/** The four grounds the group names, under the track's fill and the selected segment's over it. */
const GROUNDS = Object.freeze(['--fab-bg-0', '--fab-bg-1', '--fab-surface', '--fab-bg-2']);

const writtenOf = (census) => census.map(({ written }) => written).sort(byName);
const reachingOf = (census) => census.filter(({ safe }) => !safe);
const census = () => shippedCensus(TRACK, 'SegmentedControl');

describe('the module sheet and every component style against the published SegmentedControl', () => {
  it('names its root in four selectors, each under one of the four row ancestors, and reaches it through none', () => {
    const shipped = census();
    assert.equal(shipped.length, 4, 'the census of every selector naming the root');
    assert.deepEqual(writtenOf(shipped), [...ROW_RULES].sort(byName));
    assert.deepEqual(reachingOf(shipped), []);
    assert.equal(TRACK.ancestors.size, 4);
    assert.deepEqual(
      staleAncestors(TRACK, shipped, publishedManagerClasses()),
      [],
      'no pinned ancestor'
    );
    const entry = entryNamed('SegmentedControl');
    assert.deepEqual(
      [Object.keys(entry.props), gatedRoot(entry)],
      [['options', 'value', 'onChange', 'ariaLabel', 'fill', 'density'], 'fabricate'],
      'a published tone, shape, icon-only run, density rung, class or wider root reopens the census'
    );
  });

  it('draws a published control alike under any ancestor, and no reaching rule draws or strips a ring', () => {
    const reaching = reachingOf(census());
    assert.deepEqual(placementFaults(reaching, TRACK, []), []);
    const ringing = reaching.flatMap(({ written, rule }) =>
      declarationsOf(rule)
        .filter(([property]) => property === 'all' || /^(outline|box-shadow)/u.test(property))
        .map(([property]) => `${written} declares ${property}`)
    );
    assert.deepEqual(ringing, [], 'the ring is the segment’s own scoped rule');
    assert.deepEqual(dataHooksOf(reaching), [], 'no reaching rule reads a data-* hook');
  });

  it('holds the classes its file spells and a rule names on the root to the census, and a segment’s to its default and states', () => {
    const tokens = new Set(
      spelledStrings(COMPONENT, SHIPPED).flatMap((spelled) => spelled.split(/\s+/))
    );
    const onRoot = new Set(
      census().flatMap(({ complex }) =>
        compoundsOf(complex)
          .map((compound) => classesOf(compound))
          .filter((classes) => classes.includes(TRACK.root))
          .flat()
      )
    );
    assert.deepEqual(
      [...tokens].filter((token) => onRoot.has(token)),
      [TRACK.root]
    );
    for (const name of [...TRACK.writable, ...TRACK.undrawn, ...SEGMENT.writable]) {
      assert.ok(tokens.has(name), `${COMPONENT} spells ${name}`);
    }
  });
});

describe('the segmented control census, synthetic', () => {
  const reachingIn = (css) => writtenOf(reachingOf(syntheticCensus(TRACK, css)));

  for (const [claim, selector] of [
    ['the tag tone', '.manager-segmented.is-tag .manager-segment'],
    ['the compact density', '.manager-segmented.is-compact'],
    ['a tally', '.manager-segmented .manager-segment-count'],
    ['a row ancestor', '.manager-checks-tier-row .manager-segmented'],
  ]) {
    it(`admits a selector that needs ${claim}`, () => {
      assert.equal(syntheticCensus(TRACK, `${selector} { gap: 0 }`).length, 1);
      assert.deepEqual(reachingIn(`${selector} { gap: 0 }`), []);
    });
  }

  for (const selector of [
    '.manager-segmented',
    '.manager-segmented.is-fill',
    '.manager-segmented.is-inline',
    '.fabricate .manager-segmented',
    '.manager-segmented input',
    '.manager-segmented[data-x]',
  ]) {
    it(`refuses ${selector}, which nothing keeps off a published control`, () => {
      assert.deepEqual(reachingIn(`${selector} { gap: 0 }`), [`sheet.css: ${selector}`]);
    });
  }
});

describe('the keyboard ring on the published SegmentedControl’s segment', () => {
  defineAccentRingContrast(OWN_RING, {
    ownSheet: COMPONENT,
    moduleRings: ['.fabricate input:focus-visible'],
    stacks: GROUNDS.flatMap((ground) => [
      ['--fab-surface-soft', ground],
      ['--fab-surface-active', ground],
      ['--fab-surface-active', '--fab-surface-soft', ground],
    ]),
  });
});
