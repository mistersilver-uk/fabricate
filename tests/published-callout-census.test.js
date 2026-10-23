/**
 * The module sheet and every component style against the published `Callout` (issue 2601): two
 * selectors outside its own file name its root class, each under an ancestor no extension target
 * sits in, no rule outside it reads the tone attribute it writes, and none names one of its parts,
 * so a published note draws only its own rules under any ancestor.
 * Limit: the census shares `published-component-manifest.test.js`'s sheet-reach limits, and takes
 * on trust that no extension target sits under one of `CALLOUT.ancestors`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  entryNamed,
  ownFilesOf,
  publishedManagerClasses,
  shippedCensus,
  spelledStrings,
  staleAncestors,
  syntheticCensus,
} from './helpers/publishedComponentCensus.js';
import {
  SHIPPED,
  byName,
  declarationsOf,
  everyStylesheet,
  selectorsNaming,
  selectorsOnAttribute,
  writtenSelector,
} from './helpers/publishedComponentGate.js';

/**
 * The published note's root: the tone classes `tone` writes beside it, `is-accent` among them, and
 * the two classes under which a Fabricate rule lays a note out, no extension target sitting in one.
 */
const CALLOUT = Object.freeze({
  root: 'manager-callout',
  writable: new Set(['is-info', 'is-accent', 'is-warning', 'is-success', 'is-danger']),
  ancestors: new Set(['manager-component-entry-duplicate', 'manager-tool-requirements-card']),
  drawsChildren: true,
});

/** The two rules outside `Callout.svelte` that name its root, as written, with what each declares. */
const PLACED_RULES = Object.freeze([
  [
    'styles/fabricate-manager-tool-library-knowledge-components.css: .fabricate-manager .manager-component-entry-duplicate .manager-callout',
    [
      ['flex', '1'],
      ['min-width', '0'],
    ],
  ],
  [
    'src/ui/svelte/apps/manager/tools/ToolRequirementsTab.svelte: .manager-tool-requirements-card > :global(.manager-callout)',
    [['margin-bottom', 'var(--fab-space-3)']],
  ],
]);

/** A synthetic sheet's census, its closures spelling the note's title. */
const SPELLED = new Set(['manager-callout-title']);
const reachingIn = (css) =>
  syntheticCensus(CALLOUT, `${css} { gap: 0 }`, { spelled: SPELLED })
    .filter(({ safe }) => !safe)
    .map(({ written }) => written);

/** Every stylesheet but the note's own files. */
const othersSheets = () => {
  const own = ownFilesOf('Callout');
  return everyStylesheet().filter(([file]) => !own.has(file));
};

describe('the module sheet and every component style against the published Callout', () => {
  it("names the note's root in two selectors, each under a pinned ancestor", () => {
    const census = shippedCensus(CALLOUT, 'Callout');
    assert.deepEqual(
      census.map(({ written, rule }) => [written, declarationsOf(rule)]),
      PLACED_RULES.map(([written, declarations]) => [written, declarations])
    );
    assert.deepEqual(
      census.filter(({ safe }) => !safe).map(({ written }) => written),
      [],
      'neither reaches a published note'
    );
    assert.deepEqual(
      staleAncestors(CALLOUT, census, publishedManagerClasses()),
      [],
      'each pinned ancestor keeps a selector off a published note'
    );
    assert.deepEqual(
      [Object.keys(entryNamed('Callout').props), entryNamed('Callout').root],
      [['tone', 'title', 'text', 'icon', 'items', 'actions'], 'any'],
      'a published class or another root reopens the census'
    );
  });

  it('styles no element outside its own file by the tone attribute it writes', () => {
    assert.deepEqual(
      othersSheets().flatMap(([file, css]) => selectorsOnAttribute(file, css, 'data-callout-tone')),
      []
    );
  });

  it('names none of its parts outside its own file', () => {
    const parts = [
      ...new Set(
        spelledStrings(entryNamed('Callout').path, SHIPPED)
          .flatMap((spelled) => spelled.split(/\s+/))
          .filter((token) => token.startsWith(`${CALLOUT.root}-`))
      ),
    ].sort(byName);
    assert.deepEqual(parts, [
      'manager-callout-actions',
      'manager-callout-body',
      'manager-callout-item',
      'manager-callout-item-lead',
      'manager-callout-item-text',
      'manager-callout-items',
      'manager-callout-text',
      'manager-callout-title',
    ]);
    const named = othersSheets().flatMap(([file, css]) =>
      parts.flatMap((part) =>
        selectorsNaming(css, part).map((complex) => `${file}: ${writtenSelector(css, complex)}`)
      )
    );
    assert.deepEqual(named, []);
  });
});

describe('the callout census, synthetic', () => {
  for (const [claim, selector] of [
    ['a state class no published key writes', '.manager-callout.is-compact'],
    [
      'the duplicate entry above it',
      '.fabricate-manager .manager-component-entry-duplicate .manager-callout',
    ],
    ['the requirements card above it', '.manager-tool-requirements-card > .manager-callout'],
    ['a classed child no closure spells', '.manager-callout .manager-unspelled'],
  ]) {
    it(`admits a selector that needs ${claim}`, () => {
      assert.equal(
        syntheticCensus(CALLOUT, `${selector} { gap: 0 }`, { spelled: SPELLED }).length,
        1
      );
      assert.deepEqual(reachingIn(selector), []);
    });
  }

  for (const selector of [
    '.manager-callout',
    '.manager-callout.is-warning',
    '.manager-callout.is-accent',
    '.fabricate .manager-callout',
    '.manager-callout > i',
    '.manager-callout .manager-callout-title',
    '.manager-callout[data-callout-tone="info"]',
  ]) {
    it(`refuses ${selector}, which nothing keeps off a published note`, () => {
      assert.deepEqual(reachingIn(selector), [`sheet.css: ${selector}`]);
    });
  }
});
