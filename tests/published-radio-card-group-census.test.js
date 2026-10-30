/**
 * The module sheet and every component style against the published `RadioCardGroup` (issue 2601):
 * the 40 selectors that name its root class, which of them a published group can match, where
 * those sit and what they draw, the one rule that names a writable root class without the root,
 * the classes its file spells on the root and on a card, and the keyboard ring on its radio, which
 * the accent draws 2px wide and 2px clear and which clears 3:1 on the grounds a published group
 * sits on, the chosen card's included.
 * Limit: the census shares `published-component-manifest.test.js`'s sheet-reach limits, and takes on
 * trust that no extension target sits inside the fieldset, which draws no content slot.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { specificityOf } from '../scripts/lib/stylesheetSelectorCensus.js';

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
import {
  SHIPPED,
  byName,
  everyStylesheet,
  gatedRoot,
  selectorsNaming,
  writtenSelector,
} from './helpers/publishedComponentGate.js';

const SHEET = 'styles/fabricate-manager-library.css';

/**
 * The published group's root: the classes its default and `layout` write beside it, `Field`'s own
 * among them, no ancestor a Fabricate rule redraws it under, `disabled` drawn by the fieldset, and
 * the classes its file spells that no published key draws: the visible legend, the note `hint`
 * draws and the body `optionBody` draws.
 */
const GROUP = Object.freeze({
  root: 'fabricate-option-cards',
  writable: new Set([
    'is-wide',
    'manager-resolution-mode-card',
    'manager-radio-card-group',
    'is-stacked',
    'fabricate-field',
  ]),
  ancestors: new Set(),
  drawsChildren: true,
  disables: true,
  undrawn: new Set([
    'is-legend-visible',
    'manager-resolution-mode-note',
    'manager-resolution-option-body',
  ]),
});

/** The five selectors no published group matches: the visible legend, the note and the body. */
const UNREACHED = Object.freeze([
  `${SHEET}: .fabricate-option-cards.manager-resolution-mode-card.is-legend-visible .manager-resolution-mode-legend`,
  `${SHEET}: .fabricate-option-cards .manager-resolution-mode-note`,
  `${SHEET}: .fabricate-option-cards .manager-resolution-mode-note i`,
  `${SHEET}: .fabricate-option-cards .manager-resolution-option-body`,
  `${SHEET}: .fabricate-option-cards:not(.is-stacked) .manager-resolution-option:has(.manager-resolution-option-icon) > .manager-resolution-option-body`,
]);

/** The reflow, which only a host naming `fabricate-option-host` answers; when it reflows is private. */
const REFLOW = `${SHEET}: .fabricate-option-cards .manager-resolution-mode-options sits inside @container`;
/** The radio's checked dot, drawn by an inset box-shadow on its own `:checked` rule. */
const DOT = `${SHEET}: .fabricate-option-cards .manager-resolution-option input[type='radio']:checked declares box-shadow`;

const OWN_RING =
  ".fabricate-option-cards .manager-resolution-option input[type='radio']:focus-visible";
const MODULE_RINGS = Object.freeze([
  '.fabricate input:focus-visible',
  '.fabricate-field input:focus-visible',
]);

const writtenOf = (census) => census.map(({ written }) => written).sort(byName);
const reachingOf = (census) => census.filter(({ safe }) => !safe);
const census = () => shippedCensus(GROUP, 'RadioCardGroup');

describe('the module sheet and every component style against the published RadioCardGroup', () => {
  it('reaches a published group through 35 of the 40 selectors that name its root', () => {
    const shipped = census();
    assert.equal(shipped.length, 40, 'the census of every selector naming the root');
    assert.deepEqual(writtenOf(shipped.filter(({ safe }) => safe)), [...UNREACHED].sort(byName));
    assert.equal(reachingOf(shipped).length, 35);
    assert.deepEqual(
      staleAncestors(GROUP, shipped, publishedManagerClasses()),
      [],
      'no pinned ancestor'
    );
    const entry = entryNamed('RadioCardGroup');
    assert.deepEqual(
      [Object.keys(entry.props), gatedRoot(entry)],
      [
        [
          'options',
          'value',
          'onChange',
          'legend',
          'layout',
          'columns',
          'disabled',
          'disabledOptions',
        ],
        'fabricate',
      ],
      'a published hint, body, visible legend, class or wider root reopens the census'
    );
  });

  it('draws a published group alike under any ancestor but the reflow, with the radio’s own ring and dot alone', () => {
    const reaching = reachingOf(census());
    assert.deepEqual(placementFaults(reaching, GROUP, []), [REFLOW]);
    assert.deepEqual(ringFaults(reaching, GROUP), [DOT]);
    assert.deepEqual(dataHooksOf(reaching), [], 'no reaching rule reads a data-* hook');
  });

  it('records the one rule that names a writable root class without the root as one no published mount meets', () => {
    const naming = everyStylesheet().flatMap(([file, css]) =>
      selectorsNaming(css, 'manager-resolution-mode-card')
        .filter((complex) =>
          compoundsOf(complex).every((compound) => !classesOf(compound).includes(GROUP.root))
        )
        .map((complex) => ({ written: `${file}: ${writtenSelector(css, complex)}`, complex }))
    );
    assert.equal(naming.length, 1, 'the checks card’s margin rule alone');
    const [{ complex }] = naming;
    const classes = compoundsOf(complex).flatMap((compound) => classesOf(compound));
    assert.deepEqual(classes, [
      'fabricate-manager',
      'manager-checks-card',
      'manager-resolution-mode-card',
      'manager-checks-difficulty-fields',
    ]);
    const tokens = publishedTokens();
    assert.ok(
      !tokens.has('manager-checks-card') && !tokens.has('manager-checks-difficulty-fields'),
      'it needs a card above the group and a sibling after it that no published closure spells'
    );
  });

  it('holds the classes its file spells and a rule names on the root, and on a card, to the census', () => {
    const tokens = new Set(
      spelledStrings(entryNamed('RadioCardGroup').path, SHIPPED).flatMap((spelled) =>
        spelled.split(/\s+/)
      )
    );
    const named = (on) =>
      new Set(
        census().flatMap(({ complex }) =>
          compoundsOf(complex)
            .map((compound) => classesOf(compound))
            .filter((classes) => classes.includes(on))
            .flat()
        )
      );
    const onRoot = [...tokens].filter((token) => named(GROUP.root).has(token)).sort(byName);
    assert.deepEqual(onRoot, [
      'fabricate-option-cards',
      'is-legend-visible',
      'is-stacked',
      'manager-resolution-mode-card',
    ]);
    assert.ok(
      onRoot.every(
        (name) => name === GROUP.root || GROUP.writable.has(name) || GROUP.undrawn.has(name)
      ),
      'each is the root, writable or undrawn'
    );
    const onCard = [...tokens]
      .filter((token) => named('manager-resolution-option').has(token))
      .sort(byName);
    assert.deepEqual(
      onCard,
      ['is-active', 'is-disabled', 'manager-resolution-option'],
      'a card’s default, its chosen state and its disabled state'
    );
  });

  it('lets the radio’s own ring win over each module ring that reaches it', () => {
    const own = specificityOf(OWN_RING);
    assert.deepEqual(own, [0, 4, 1]);
    for (const ring of MODULE_RINGS) {
      const [ids, classes, types] = specificityOf(ring);
      assert.ok(ids === 0 && classes < own[1] && types <= own[2], ring);
    }
  });
});

describe('the option cards census, synthetic', () => {
  const reachingIn = (css) => writtenOf(reachingOf(syntheticCensus(GROUP, css)));

  for (const [claim, selector] of [
    ['the visible legend', '.fabricate-option-cards.is-legend-visible legend'],
    ['the note', '.fabricate-option-cards .manager-resolution-mode-note'],
    ['an option body', '.fabricate-option-cards .manager-resolution-option-body'],
    ['a classed child no closure spells', '.fabricate-option-cards .manager-unspelled'],
  ]) {
    it(`admits a selector that needs ${claim}`, () => {
      assert.equal(syntheticCensus(GROUP, `${selector} { gap: 0 }`).length, 1);
      assert.deepEqual(reachingIn(`${selector} { gap: 0 }`), []);
    });
  }

  for (const selector of [
    '.fabricate-option-cards',
    '.fabricate-option-cards.is-stacked',
    '.fabricate-option-cards.fabricate-field',
    '.fabricate .fabricate-option-cards',
    '.fabricate-option-cards:disabled',
    '.fabricate-option-cards input',
    '.fabricate-option-cards[data-x]',
  ]) {
    it(`refuses ${selector}, which nothing keeps off a published group`, () => {
      assert.deepEqual(reachingIn(`${selector} { gap: 0 }`), [`sheet.css: ${selector}`]);
    });
  }
});

describe('the keyboard ring on the published RadioCardGroup’s radio', () => {
  defineAccentRingContrast(OWN_RING, {
    moduleRings: MODULE_RINGS,
    stacks: [['--fab-surface-soft', '--fab-bg-2']],
  });
});
