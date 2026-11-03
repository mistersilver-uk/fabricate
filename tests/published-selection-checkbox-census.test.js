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
 * one Fabricate card a rule lays a wrapper out under. No published key draws the bare form, which
 * draws no wrapper; the decorative form draws none either, and `BOX` holds its root.
 */
const CHECKBOX = Object.freeze({
  root: 'fab-selection-checkbox',
  writable: new Set(['is-disabled', 'has-label']),
  ancestors: new Set(['fab-library-card']),
  drawsChildren: true,
  disables: true,
  undrawn: new Set(),
});

/**
 * The published decorative box (issue 2881), the box alone at the root: the classes `density`,
 * `checked`, `indeterminate` and `tone` write beside it, and the two Fabricate hosts whose rules
 * name it, each beside its input, which a decorative box never draws.
 */
const BOX = Object.freeze({
  root: 'fab-selection-check',
  writable: new Set(['is-sm', 'is-md', 'is-lg', 'is-checked', 'is-indeterminate', 'is-success']),
  ancestors: new Set(['manager-import-mapping-match', 'fab-bulk-selection-all']),
  drawsChildren: false,
  disables: false,
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
          'decorative',
          'tone',
        ],
        'fabricate',
      ],
      'a published wrapper or class reopens the census'
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

describe('the module sheet and every component style against the published decorative box', () => {
  it('names the box in two selectors, each under a Fabricate host, and reaches it through none', () => {
    const shipped = shippedCensus(BOX, 'SelectionCheckbox');
    assert.deepEqual(writtenOf(shipped), [
      'src/ui/svelte/apps/manager/BulkSelectionToolbar.svelte: .fab-bulk-selection-all :global(.fab-selection-input:focus-visible + .fab-selection-check)',
      'src/ui/svelte/apps/manager/ImportFolderMappingModal.svelte: .manager-import-mapping-match :global(.fab-selection-input:focus-visible + .fab-selection-check)',
    ]);
    assert.deepEqual(reachingOf(shipped), []);
  });

  it('spells every class it writes on the box', () => {
    const tokens = new Set(
      spelledStrings(COMPONENT, SHIPPED).flatMap((spelled) => spelled.split(/\s+/))
    );
    for (const name of BOX.writable) assert.ok(tokens.has(name), `${COMPONENT} spells ${name}`);
  });

  for (const selector of ['.fab-selection-check', '.fabricate .fab-selection-check.is-success']) {
    it(`refuses ${selector}, which nothing keeps off a published decorative box`, () => {
      const css = `${selector} { gap: 0 }`;
      assert.deepEqual(writtenOf(reachingOf(syntheticCensus(BOX, css))), [
        `sheet.css: ${selector}`,
      ]);
    });
  }
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
