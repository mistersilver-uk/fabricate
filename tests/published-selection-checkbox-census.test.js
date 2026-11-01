/**
 * The module sheet and every component style against the published `SelectionCheckbox` (issue
 * 2836): the selectors that name its root class, each under an ancestor no extension target sits
 * in, the classes its file spells on the root, and the keyboard ring its own scoped rule draws on
 * the box, 2px wide and 2px clear, which clears 3:1 on the four grounds a published box sits on.
 * Limit: the census shares `published-component-manifest.test.js`'s sheet-reach limits, and takes on
 * trust that no extension target sits under one of `CHECKBOX.ancestors`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { defineAccentRingContrast } from './helpers/accentRingContrast.js';
import {
  classesOf,
  compoundsOf,
  entryNamed,
  placementFaults,
  shippedCensus,
  spelledStrings,
  syntheticCensus,
} from './helpers/publishedComponentCensus.js';
import { SHIPPED, byName, gatedRoot } from './helpers/publishedComponentGate.js';

const COMPONENT = 'src/ui/svelte/components/SelectionCheckbox.svelte';

/**
 * The published box's label wrapper: the classes `disabled` and `label` write beside it, and the
 * one Fabricate card a rule lays a wrapper out under. No published key draws the decorative or
 * bare form, which draw no wrapper.
 */
const CHECKBOX = Object.freeze({
  root: 'fab-selection-checkbox',
  writable: new Set(['is-disabled', 'has-label']),
  ancestors: new Set(['fab-library-card']),
  drawsChildren: true,
  disables: true,
  undrawn: new Set(),
});

/** The one selector that names the root, kept off a published box by its card ancestor. */
const CARD_RULES = Object.freeze([
  'src/ui/svelte/apps/manager/library/LibraryCard.svelte: .fab-library-card :global(.fab-selection-checkbox)',
]);

const OWN_RING =
  '.fab-selection-checkbox:has(.fab-selection-input:focus-visible) .fab-selection-check';

const writtenOf = (census) => census.map(({ written }) => written).sort(byName);
const reachingOf = (census) => census.filter(({ safe }) => !safe);
const census = () => shippedCensus(CHECKBOX, 'SelectionCheckbox');

describe('the module sheet and every component style against the published SelectionCheckbox', () => {
  it('names its root in one selector, under a library card, and reaches it through none', () => {
    const shipped = census();
    assert.deepEqual(writtenOf(shipped), [...CARD_RULES]);
    assert.deepEqual(reachingOf(shipped), []);
    const entry = entryNamed('SelectionCheckbox');
    assert.deepEqual(
      [Object.keys(entry.props), gatedRoot(entry)],
      [
        [
          'checked',
          'indeterminate',
          'disabled',
          'density',
          'label',
          'ariaLabel',
          'onChange',
          'aria-describedby',
        ],
        'fabricate',
      ],
      'a published wrapper, decorative form or class reopens the census'
    );
  });

  it('draws a published box alike under any ancestor', () => {
    assert.deepEqual(placementFaults(reachingOf(census()), CHECKBOX, []), []);
  });

  it('holds the classes its file spells and a rule names on the root to the census', () => {
    const tokens = new Set(
      spelledStrings(COMPONENT, SHIPPED).flatMap((spelled) => spelled.split(/\s+/))
    );
    const onRoot = new Set(
      census().flatMap(({ complex }) =>
        compoundsOf(complex)
          .map((compound) => classesOf(compound))
          .filter((classes) => classes.includes(CHECKBOX.root))
          .flat()
      )
    );
    assert.deepEqual(
      [...tokens].filter((token) => onRoot.has(token)),
      [CHECKBOX.root]
    );
    for (const name of CHECKBOX.writable)
      assert.ok(tokens.has(name), `${COMPONENT} spells ${name}`);
  });
});

describe('the selection checkbox census, synthetic', () => {
  const reachingIn = (css) => writtenOf(reachingOf(syntheticCensus(CHECKBOX, css)));

  it('admits a selector that needs the library card ancestor', () => {
    const css = '.fab-library-card .fab-selection-checkbox { gap: 0 }';
    assert.equal(syntheticCensus(CHECKBOX, css).length, 1);
    assert.deepEqual(reachingIn(css), []);
  });

  for (const selector of [
    '.fab-selection-checkbox',
    '.fab-selection-checkbox.has-label',
    '.fab-selection-checkbox.is-disabled',
    '.fabricate .fab-selection-checkbox',
    '.fab-selection-checkbox input',
  ]) {
    it(`refuses ${selector}, which nothing keeps off a published box`, () => {
      assert.deepEqual(reachingIn(`${selector} { gap: 0 }`), [`sheet.css: ${selector}`]);
    });
  }
});

describe('the keyboard ring on the published SelectionCheckbox’s box', () => {
  defineAccentRingContrast(OWN_RING, {
    ownSheet: COMPONENT,
    moduleRings: ['.fabricate input:focus-visible'],
  });
});
