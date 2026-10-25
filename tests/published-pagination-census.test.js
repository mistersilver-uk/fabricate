/**
 * The module sheet and every component style against the published `Pagination` (issue 2646): the
 * 26 selectors that name its root class, which of them a published pager can match, where those
 * sit and what they draw, the four that name it only inside a host's `:has()`, the classes its file
 * spells on the root, and the keyboard ring the family draws on its arrows, 2px wide and 2px clear,
 * which clears 3:1 on the default bar's `--fab-bg-1` and on the grounds a compact pager sits on.
 * Limit: the census shares `published-component-manifest.test.js`'s sheet-reach limits, and takes on
 * trust that no extension target sits under one of `PAGER.ancestors` or inside a host `HAS_HOSTS`
 * names.
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
  publishedTokens,
  ringFaults,
  shippedCensus,
  spelledStrings,
  staleAncestors,
  syntheticCensus,
} from './helpers/publishedComponentCensus.js';
import { SHIPPED, byName, gatedRoot } from './helpers/publishedComponentGate.js';

const COMPONENT = 'src/ui/svelte/components/Pagination.svelte';
const SHEET = 'styles/fabricate-list-primitives.css';

/**
 * The published pager's root: the classes `density` writes on it and on its page label, the seven
 * hosts a Fabricate rule redraws it under, and the class its file spells that no published key
 * draws, the pane-section edge.
 */
const PAGER = Object.freeze({
  root: 'fabricate-pagination',
  writable: new Set(['is-compact', 'manager-pagination-hidden']),
  ancestors: new Set([
    'manager-travel-parties-pagination',
    'manager-tools-browser-pagination',
    'manager-task-component-browser-footer',
    'manager-task-required-tools-footer',
    'manager-tool-required-for',
    'manager-scoped-roster-card',
    'manager-scoped-list-column',
  ]),
  drawsChildren: true,
  disables: true,
  undrawn: new Set(['is-edge']),
});

/** The family's own 14 rules that reach a published pager, every one in its sheet. */
const FAMILY = Object.freeze([
  '.fabricate-pagination .manager-pagination-hidden',
  '.fabricate-pagination .manager-pagination-nav',
  '.fabricate-pagination .manager-pagination-page',
  '.fabricate-pagination .manager-pagination-size',
  '.fabricate-pagination .manager-pagination-summary',
  '.fabricate-pagination button:focus',
  '.fabricate-pagination button:focus-visible',
  '.fabricate-pagination.fabricate-pagination',
  '.fabricate-pagination.fabricate-pagination .fabricate-icon-button',
  '.fabricate-pagination.fabricate-pagination.is-compact',
  '.fabricate-pagination.fabricate-pagination.is-compact .fabricate-icon-button',
  '.fabricate-pagination.is-compact .manager-pagination-nav',
  '.fabricate-pagination.is-compact .manager-pagination-size',
  '.fabricate-pagination.is-compact .manager-pagination-summary',
]);

/**
 * The four selectors that name the root only inside a host's `:has()`, so each draws its host and
 * never the pager, by the host class each needs, which no published closure spells.
 */
const HAS_HOSTS = Object.freeze({
  'src/ui/svelte/apps/crafting/CraftingView.svelte: .crafting-view-column-left :global(.crafting-browser-pagination:has(> .fabricate-pagination))':
    'crafting-browser-pagination',
  'src/ui/svelte/apps/gathering/GatheringView.svelte: .gathering-view-column-left :global(.gathering-env-pagination:has(> .fabricate-pagination))':
    'gathering-env-pagination',
  'styles/fabricate-manager-rail-gathering.css: .fabricate-manager .manager-task-component-browser-footer:not(:has(.fabricate-pagination))':
    'manager-task-component-browser-footer',
  'styles/fabricate-manager-rail-gathering.css: .fabricate-manager .manager-task-required-tools-footer:not(:has(.fabricate-pagination))':
    'manager-task-required-tools-footer',
});

const OWN_RING = '.fabricate-pagination button:focus-visible';

const writtenOf = (census) => census.map(({ written }) => written).sort(byName);
const reachingOf = (census) => census.filter(({ safe }) => !safe);
const census = () => shippedCensus(PAGER, 'Pagination');
/** The reaching selectors that draw on the pager: all but the four `HAS_HOSTS` names. */
const drawingOf = (reaching) =>
  reaching.filter(({ written }) => !Object.hasOwn(HAS_HOSTS, written));

describe('the module sheet and every component style against the published Pagination', () => {
  it('reaches a published pager through 18 of the 26 selectors that name its root: the family’s 14 and four host rules', () => {
    const shipped = census();
    assert.equal(shipped.length, 26, 'the census of every selector naming the root');
    assert.equal(shipped.filter(({ safe }) => safe).length, 8, 'seven under a host, and the edge');
    const reaching = reachingOf(shipped);
    assert.deepEqual(
      writtenOf(reaching),
      [...FAMILY.map((selector) => `${SHEET}: ${selector}`), ...Object.keys(HAS_HOSTS)].sort(byName)
    );
    assert.deepEqual(
      staleAncestors(PAGER, shipped, publishedManagerClasses()),
      [],
      'no pinned ancestor'
    );
    const entry = entryNamed('Pagination');
    assert.deepEqual(
      [Object.keys(entry.props), gatedRoot(entry)],
      [
        [
          'totalCount',
          'pageSize',
          'pageIndex',
          'pageSizeOptions',
          'onPageChange',
          'onPageSizeChange',
          'persistent',
          'ariaLabel',
          'navLabel',
          'previousLabel',
          'nextLabel',
          'perPageLabel',
          'rangeTemplate',
          'pageTemplate',
          'density',
        ],
        'fabricate',
      ],
      'a published edge, page-size switch, class or wider root reopens the census'
    );
  });

  it('draws the host, never the pager, in each rule that names the root only inside :has()', () => {
    const tokens = publishedTokens();
    for (const [written, host] of Object.entries(HAS_HOSTS)) {
      const { complex } = census().find((row) => row.written === written);
      const subject = compoundsOf(complex).at(-1);
      assert.ok(classesOf(subject).includes(host), `${written} draws ${host}`);
      assert.ok(!classesOf(subject).includes(PAGER.root), `${written} does not draw the pager`);
      assert.ok(!tokens.has(host), `no published closure spells ${host}`);
    }
  });

  it('draws a published pager alike under any ancestor, its ring the arrows’ own pair alone', () => {
    const drawing = drawingOf(reachingOf(census()));
    assert.deepEqual(placementFaults(drawing, PAGER, []), []);
    assert.deepEqual(ringFaults(drawing, PAGER), [], 'the button:focus and :focus-visible pair');
    assert.deepEqual(dataHooksOf(drawing), [], 'no reaching rule reads a data-* hook');
  });

  it('holds the classes its file spells and a rule names on the root to the census', () => {
    const tokens = new Set(
      spelledStrings(COMPONENT, SHIPPED).flatMap((spelled) => spelled.split(/\s+/))
    );
    const onRoot = new Set(
      census().flatMap(({ complex }) =>
        compoundsOf(complex)
          .map((compound) => classesOf(compound))
          .filter((classes) => classes.includes(PAGER.root))
          .flat()
      )
    );
    assert.deepEqual([...tokens].filter((token) => onRoot.has(token)).sort(byName), [
      'fabricate-pagination',
      'is-compact',
      'is-edge',
    ]);
    for (const name of [...PAGER.writable, ...PAGER.undrawn]) {
      assert.ok(tokens.has(name), `${COMPONENT} spells ${name}`);
    }
  });
});

describe('the pagination census, synthetic', () => {
  const reachingIn = (css) => writtenOf(reachingOf(syntheticCensus(PAGER, css)));

  for (const [claim, selector] of [
    ['the pane-section edge', '.fabricate-pagination.is-edge'],
    ['a pinned host', '.manager-tools-browser-pagination .fabricate-pagination'],
  ]) {
    it(`admits a selector that needs ${claim}`, () => {
      assert.equal(syntheticCensus(PAGER, `${selector} { gap: 0 }`).length, 1);
      assert.deepEqual(reachingIn(`${selector} { gap: 0 }`), []);
    });
  }

  for (const selector of [
    '.fabricate-pagination',
    '.fabricate-pagination.is-compact',
    '.fabricate .fabricate-pagination',
    '.fabricate-pagination[data-x]',
  ]) {
    it(`refuses ${selector}, which nothing keeps off a published pager`, () => {
      assert.deepEqual(reachingIn(`${selector} { gap: 0 }`), [`sheet.css: ${selector}`]);
    });
  }
});

describe('the keyboard ring on the published Pagination’s arrows', () => {
  defineAccentRingContrast(OWN_RING);
});
