/**
 * The module sheet and every component style against the published `ListRow` (issue 2784): the 44
 * selectors that name its root, which of them a published row can match, where those sit and what
 * they draw, the bare `button` rules its whole-row button also takes, and the focus mark that
 * button draws in place of the module ring: an accent ring 2px wide inset 2px on the overlay that
 * covers the row, which clears 3:1 on each ground the row itself paints.
 * Limit: the census shares `published-component-manifest.test.js`'s sheet-reach limits, reads no
 * rule that styles the row's art without naming its root, and takes the `children` wrapper, which
 * no published key draws, as undrawn; the other five slot wrappers are drawn (issues 2793 and 2843).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BARE_BUTTON_ANCESTORS,
  BARE_BUTTON_RULES,
  bareButtonSelectors,
  dataHooksOf,
  entryNamed,
  placementFaults,
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
  gatedRoot,
} from './helpers/publishedComponentGate.js';
import { collectStyleCorpus, rulesIn } from './helpers/styleBlockScan.js';
import { propertiesOf, shortfalls, themePalettes } from './helpers/themePaletteContrast.js';

const SHEET = 'styles/fabricate-list-primitives.css';

/**
 * The published row's root: the classes `tone`, `muted`, `onOpen`, the requested slots, `density`,
 * `layout`, `truncateName` and `detailAlign` (issue 2850) write beside it, no ancestor a Fabricate rule redraws a row under, and the slot wrappers its file
 * spells that no published key draws.
 */
const LIST_ROW = Object.freeze({
  root: 'fabricate-list-row',
  writable: new Set([
    'is-positive',
    'is-danger',
    'is-muted',
    'is-form',
    'is-default',
    'is-card',
    'is-truncated',
    'is-detail-end',
  ]),
  ancestors: new Set(),
  drawsChildren: true,
  undrawn: new Set(['fabricate-list-row-children']),
});

/** The 41 rules that draw a published row, every one in its sheet. */
const LIST_ROW_FAMILY = Object.freeze([
  '.fabricate-list-row',
  '.fabricate-list-row .fabricate-list-row-name',
  '.fabricate-list-row .fabricate-list-row-quantity',
  '.fabricate-list-row .fabricate-list-row-detail',
  '.fabricate-list-row.is-positive',
  '.fabricate-list-row.is-muted',
  '.fabricate-list-row.is-muted .fabricate-list-row-name',
  '.fabricate-list-row.is-form',
  '.fabricate-list-row > .fabricate-list-row-open',
  '.fabricate-list-row > .fabricate-list-row-open:enabled',
  '.fabricate-list-row > button.fabricate-list-row-open::after',
  '.fabricate-list-row > .fabricate-list-row-open > *',
  '.fabricate-list-row > .fabricate-list-row-open:focus-visible',
  '.fabricate-list-row > .fabricate-list-row-open:focus-visible::after',
  '.fabricate-list-row .fabricate-list-row-body',
  '.fabricate-list-row .fabricate-list-row-head',
  '.fabricate-list-row .fabricate-list-row-leading',
  '.fabricate-list-row .fabricate-list-row-badges',
  '.fabricate-list-row .fabricate-list-row-meta',
  '.fabricate-list-row .fabricate-list-row-trailing',
  '.fabricate-list-row > .fabricate-list-row-trailing',
  '.fabricate-list-row > .fabricate-list-row-aside',
  '.fabricate-list-row:not(.is-truncated) .fabricate-list-row-head > .fabricate-list-row-name',
  '.fabricate-list-row.is-danger',
  ".fabricate-list-row:has(> .fabricate-list-row-open[aria-pressed='true'])",
  ".fabricate-list-row.is-danger:has(> .fabricate-list-row-open[aria-pressed='true'])",
  ".fabricate-list-row:not(.is-danger):has(> .fabricate-list-row-open[aria-pressed='true'])",
  ".fabricate-list-row:not(.is-danger):has(> .fabricate-list-row-open:enabled:hover:not([aria-pressed='true']))",
  '.fabricate-list-row:has(> .fabricate-list-row-open:disabled)',
  // The density, layout and truncation rules (issue 2850).
  '.fabricate-list-row.is-default',
  '.fabricate-list-row.is-default > button.fabricate-list-row-open::after',
  '.fabricate-list-row.is-card',
  '.fabricate-list-row.is-card > .fabricate-list-row-open',
  '.fabricate-list-row.is-card > .fabricate-list-row-open > .fabricate-list-row-body',
  '.fabricate-list-row.is-card > button.fabricate-list-row-open::after',
  '.fabricate-list-row.is-truncated .fabricate-list-row-name',
  '.fabricate-list-row.is-truncated .fabricate-list-row-detail',
  '.fabricate-list-row.is-truncated .fabricate-list-row-detail',
  '.fabricate-list-row.is-truncated .fabricate-list-row-head > .fabricate-list-row-name',
  '.fabricate-list-row.is-truncated .fabricate-list-row-badges',
  '.fabricate-list-row.is-truncated.is-detail-end .fabricate-list-row-detail',
]);

/** The rule that strips the module ring from the row's button, and the one that rings its overlay. */
const STRIP = `${SHEET}: .fabricate-list-row > .fabricate-list-row-open:focus-visible`;
const RING = `${SHEET}: .fabricate-list-row > .fabricate-list-row-open:focus-visible::after`;
/** The grounds a published row paints beneath its ring, a card's `--fab-bg-2` among them, each over the row's own opaque fill, top first. */
const ROW_GROUNDS = Object.freeze([
  ['--fab-bg-1'],
  ['--fab-bg-2'],
  ['--fab-surface-active', '--fab-bg-1'],
  ['--fab-surface-raised', '--fab-bg-1'],
  ['--fab-success-soft', '--fab-bg-1'],
  ['--fab-danger-soft', '--fab-bg-1'],
]);

const writtenOf = (census) => census.map(({ written }) => written).sort(byName);
const reachingOf = (census) => census.filter(({ safe }) => !safe);
const census = () => shippedCensus(LIST_ROW, 'ListRow');
const inSheet = (selectors) => selectors.map((selector) => `${SHEET}: ${selector}`).sort(byName);
/** Whether a declaration draws or strips a ring. */
const ringProperty = ([property]) =>
  property === 'all' || property === 'box-shadow' || property.startsWith('outline');

describe('the module sheet and every component style against the published ListRow', () => {
  it('reaches a published row through 41 of the 44 selectors that name its root', () => {
    const shipped = census();
    assert.equal(shipped.length, 44, 'the census of every selector naming the root');
    assert.deepEqual(writtenOf(reachingOf(shipped)), inSheet(LIST_ROW_FAMILY));
    assert.deepEqual(
      staleAncestors(LIST_ROW, shipped, publishedManagerClasses()),
      [],
      'no pinned ancestor is stale'
    );
    const entry = entryNamed('ListRow');
    assert.deepEqual(
      [Object.keys(entry.props), gatedRoot(entry), entry.rest],
      [
        [
          'name',
          'detail',
          'quantity',
          'art',
          'icon',
          'tint',
          'tone',
          'muted',
          'selected',
          'disabled',
          'onOpen',
          'aside',
          'leading',
          'badges',
          'meta',
          'trailing',
          'markSize',
          'density',
          'layout',
          'truncateName',
          'detailAlign',
        ],
        'fabricate',
        true,
      ],
      'a published inset, bodyBasis, children, openProps, class or wider root reopens the census'
    );
  });

  it('draws a published row alike under any ancestor, reads no hook, and rings its button only on the overlay', () => {
    const reaching = reachingOf(census());
    assert.deepEqual(placementFaults(reaching, LIST_ROW, []), []);
    assert.deepEqual(dataHooksOf(reaching), [], 'no reaching rule reads a data-* hook');
    const rings = reaching.flatMap(({ written, rule }) => {
      const drawn = declarationsOf(rule).filter((declaration) => ringProperty(declaration));
      return drawn.length > 0 ? [[written, Object.fromEntries(drawn)]] : [];
    });
    assert.deepEqual(
      rings.sort(([a], [b]) => byName(a, b)),
      [
        [`${SHEET}: .fabricate-list-row > .fabricate-list-row-open`, { 'box-shadow': 'none' }],
        [STRIP, { outline: 'none' }],
        [RING, { outline: '2px solid var(--fab-accent)', 'outline-offset': '-2px' }],
        [
          `${SHEET}: .fabricate-list-row.is-danger:has(> .fabricate-list-row-open[aria-pressed='true'])`,
          { 'box-shadow': 'inset 0 0 0 1px var(--fab-accent-border)' },
        ],
      ].sort(([a], [b]) => byName(a, b)),
      'the button reset, the strip, the overlay ring and the selected danger row’s edge'
    );
  });

  it('holds the classes its file spells beside the root to the census', () => {
    const tokens = new Set(
      spelledStrings(entryNamed('ListRow').path, SHIPPED).flatMap((spelled) => spelled.split(/\s+/))
    );
    for (const name of [LIST_ROW.root, ...LIST_ROW.writable, ...LIST_ROW.undrawn]) {
      assert.ok(tokens.has(name), `ListRow.svelte spells ${name}`);
    }
  });

  it('takes the four module rules a bare button takes on its button, and its own overlay rules', () => {
    const button = { writable: new Set(['fabricate-list-row-open']) };
    const bare = everyStylesheet().flatMap(([file, css]) =>
      bareButtonSelectors(file, css, button, BARE_BUTTON_ANCESTORS)
    );
    assert.deepEqual(
      writtenOf(reachingOf(bare)),
      [
        ...BARE_BUTTON_RULES,
        `${SHEET}: .fabricate-list-row > button.fabricate-list-row-open::after`,
        `${SHEET}: .fabricate-list-row.is-default > button.fabricate-list-row-open::after`,
        `${SHEET}: .fabricate-list-row.is-card > button.fabricate-list-row-open::after`,
      ].sort(byName)
    );
  });
});

describe('the list row census, synthetic', () => {
  const reachingIn = (css) => writtenOf(reachingOf(syntheticCensus(LIST_ROW, css)));

  for (const selector of [
    '.fabricate-list-row.is-row-inset',
    '.fabricate-list-row.is-body-fill .fabricate-list-row-body',
    '.fabricate-list-row .fabricate-list-row-children',
  ]) {
    it(`admits ${selector}, which a published row cannot take`, () => {
      assert.deepEqual(reachingIn(`${selector} { gap: 0 }`), []);
    });
  }

  for (const selector of [
    '.fabricate-list-row',
    '.fabricate .fabricate-list-row',
    '.fabricate-list-row.is-danger .fabricate-list-row-name',
    '.fabricate-list-row[data-x]',
    '.fabricate-list-row .fabricate-list-row-aside',
    '.fabricate-list-row .fabricate-list-row-badges',
    '.fabricate-list-row.is-card',
    '.fabricate-list-row.is-truncated .fabricate-list-row-name',
  ]) {
    it(`refuses ${selector}, which nothing keeps off a published row`, () => {
      assert.deepEqual(reachingIn(`${selector} { gap: 0 }`), [`sheet.css: ${selector}`]);
    });
  }
});

describe('the focus mark on the published ListRow’s button', () => {
  const rules = rulesIn(collectStyleCorpus()['styles/fabricate.css']);
  const themes = themePalettes(rules);

  for (const stack of ROW_GROUNDS) {
    it(`clears 3:1 on ${stack.join(' over ')} in every theme`, () => {
      assert.deepEqual(shortfalls(themes, '--fab-accent', stack, 3), []);
    });
  }

  it('is drawn by one rule of the module sheet, its overlay covering the row', () => {
    const ring = rules.filter(
      (rule) =>
        rule.selector === '.fabricate-list-row > .fabricate-list-row-open:focus-visible::after'
    );
    assert.equal(ring.length, 1, 'one rule draws it');
    assert.equal(propertiesOf(ring[0]).get('outline-offset'), '-2px');
  });
});
