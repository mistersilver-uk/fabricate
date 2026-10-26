/**
 * The module sheet and every component style against the published `IconButton` (issue 2601): the
 * 35 selectors that name its root class, which of them a published icon button can match, where
 * those sit and what they draw, the bare `button` rules it also takes, the `data-*` names they
 * read, and the classes its file spells on the root.
 * Limit: the census shares `published-component-manifest.test.js`'s sheet-reach limits, reads no
 * rule that styles the glyph by the classes `icon` writes without naming the root, and takes on
 * trust that no extension target sits under one of `ICON_BUTTON.ancestors`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RESERVED_ON_A_CONTROL } from '../src/ui/publishedComponentProps.js';

import {
  BARE_BUTTON_ANCESTORS,
  BARE_BUTTON_RULES,
  MANAGER_BUTTON_FLOOR,
  bareButtonSelectors,
  classesOf,
  compoundsOf,
  dataHooksOf,
  entryNamed,
  placementFaults,
  publishedManagerClasses,
  ringFaults,
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

/**
 * The published icon button's root: the classes `role` and `size` write beside it, the classes
 * under which a Fabricate rule redraws an icon button in its own rows and pager, no extension
 * target sitting in one. `disabled` is published, so `:disabled` keeps no selector off it, and
 * `icon` writes the glyph's classes, so a classed child is held as drawn.
 */
const ICON_BUTTON = Object.freeze({
  root: 'fabricate-icon-button',
  writable: new Set(['is-primary', 'is-ghost', 'is-danger', 'is-size-24', 'is-size-26']),
  ancestors: new Set([
    'fabricate-pagination',
    'manager-vocabulary-row',
    'manager-drop-inspector-stack',
    'manager-realm-env-row',
    'manager-scoped-list-row',
    'manager-tool-replacement-tile',
  ]),
  drawsChildren: true,
  disables: true,
});

/** The twenty sheet rules that draw a published icon button, each with nothing above its root's compound. */
const ICON_BUTTON_FAMILY_RULES = Object.freeze([
  'styles/fabricate-manager-library.css: .fabricate-icon-button.fabricate-icon-button.is-ghost',
  'styles/fabricate-manager-library.css: .fabricate-icon-button.fabricate-icon-button.is-ghost:not(:disabled):hover',
  'styles/fabricate-manager-library.css: .fabricate-icon-button.fabricate-icon-button.is-ghost:focus-visible',
  'styles/fabricate-manager-library.css: .fabricate-icon-button.fabricate-icon-button.is-ghost.is-danger',
  'styles/fabricate-manager-library.css: .fabricate-icon-button.fabricate-icon-button.is-ghost.is-danger:not(:disabled):hover',
  'styles/fabricate-manager-library.css: .fabricate-icon-button.fabricate-icon-button.is-ghost.is-danger:focus-visible',
  'styles/fabricate-manager-rail-gathering.css: .fabricate-icon-button',
  'styles/fabricate-manager-rail-gathering.css: .fabricate-icon-button.fabricate-icon-button',
  'styles/fabricate-manager-rail-gathering.css: .fabricate-icon-button.fabricate-icon-button:disabled',
  'styles/fabricate-manager-rail-gathering.css: .fabricate-icon-button.fabricate-icon-button.is-primary:not(:disabled)',
  'styles/fabricate-manager-rail-gathering.css: .fabricate-icon-button.fabricate-icon-button.is-danger:not(:disabled)',
  'styles/fabricate-manager-rail-gathering.css: .fabricate-icon-button.fabricate-icon-button:not(:disabled):hover',
  'styles/fabricate-manager-rail-gathering.css: .fabricate-icon-button.fabricate-icon-button.is-primary:not(:disabled):hover',
  'styles/fabricate-manager-rail-gathering.css: .fabricate-icon-button.fabricate-icon-button.is-danger:not(:disabled):hover',
  'styles/fabricate-manager-rail-gathering.css: .fabricate-icon-button.fabricate-icon-button',
  'styles/fabricate-manager-rail-gathering.css: .fabricate-icon-button.fabricate-icon-button.is-size-24',
  'styles/fabricate-manager-rail-gathering.css: .fabricate-icon-button.fabricate-icon-button.is-size-26',
  'styles/fabricate-manager-rail-gathering.css: .fabricate-icon-button:focus',
  'styles/fabricate-manager-rail-gathering.css: .fabricate-icon-button:focus-visible',
  'styles/fabricate-manager-rail-gathering.css: .fabricate-icon-button.fabricate-icon-button i',
]);

/** The ghost roles' keyboard faces: each repaints the glyph and fill under `:focus-visible` and draws no ring. */
const GHOST_FOCUS_FACES = Object.freeze([
  'styles/fabricate-manager-library.css: .fabricate-icon-button.fabricate-icon-button.is-ghost:focus-visible',
  'styles/fabricate-manager-library.css: .fabricate-icon-button.fabricate-icon-button.is-ghost.is-danger:focus-visible',
]);

const writtenOf = (census) => census.map(({ written }) => written).sort(byName);
const reachingOf = (census) => census.filter(({ safe }) => !safe);
const census = () => shippedCensus(ICON_BUTTON, 'IconButton');

/** Every selector with a bare `button` compound, over every stylesheet, judged against the icon button. */
const shippedBareButtons = () =>
  everyStylesheet().flatMap(([file, css]) =>
    bareButtonSelectors(file, css, ICON_BUTTON, BARE_BUTTON_ANCESTORS)
  );

describe('the module sheet and every component style against the published IconButton', () => {
  // The 35: the twenty family rules; eight on a class a Fabricate caller writes on the button, which
  // no published key writes; and seven under a pinned ancestor, one of them in a component.
  it('reaches a published icon button through its twenty family rules, of 35 that name its root', () => {
    const shipped = census();
    assert.deepEqual(writtenOf(reachingOf(shipped)), [...ICON_BUTTON_FAMILY_RULES].sort(byName));
    assert.equal(shipped.length, 35, 'the census of every selector naming the root');
    const inPartials = shipped.filter(({ written }) => written.startsWith('styles/')).length;
    assert.equal(inPartials, 31, 'the partials were read');
    assert.deepEqual(
      staleAncestors(ICON_BUTTON, shipped, publishedManagerClasses()),
      [],
      'each pinned ancestor keeps at least one selector off a published icon button'
    );
    assert.deepEqual(
      [Object.keys(entryNamed('IconButton').props), gatedRoot(entryNamed('IconButton'))],
      [['icon', 'ariaLabel', 'role', 'size', 'disabled', 'onclick', 'aria-expanded'], 'fabricate'],
      'a published tooltip, class, child or wider root reopens the census'
    );
  });

  it('draws a published icon button alike under any ancestor, with the module ring alone', () => {
    const reaching = reachingOf(census());
    assert.deepEqual(placementFaults(reaching, ICON_BUTTON, []), []);
    const faces = reaching.filter(({ written }) => GHOST_FOCUS_FACES.includes(written));
    assert.deepEqual(
      faces.map(({ written, rule }) => [
        written,
        declarationsOf(rule).map(([property]) => property),
      ]),
      GHOST_FOCUS_FACES.map((written) => [written, ['color', 'background']]),
      'the ghost faces repaint the glyph and fill and draw no ring'
    );
    const ringed = reaching.filter((row) => !faces.includes(row));
    assert.deepEqual(ringFaults(ringed, ICON_BUTTON), []);
  });

  it('holds the classes the census calls writable to the classes IconButton.svelte spells and a sheet rule names on the root', () => {
    const tokens = spelledStrings(entryNamed('IconButton').path, SHIPPED).flatMap((spelled) =>
      spelled.split(/\s+/)
    );
    const onRoot = new Set(
      census().flatMap(({ complex }) =>
        compoundsOf(complex)
          .map((compound) => classesOf(compound))
          .filter((classes) => classes.includes(ICON_BUTTON.root))
          .flat()
      )
    );
    assert.deepEqual(
      [...new Set(tokens)].filter((token) => onRoot.has(token)).sort(byName),
      [ICON_BUTTON.root, ...ICON_BUTTON.writable].sort(byName),
      'a class the file spells that a rule names on the root is writable'
    );
  });

  it('reaches a published icon button through the four bare button rules a published button takes, and no other', () => {
    const bare = shippedBareButtons();
    assert.deepEqual(writtenOf(reachingOf(bare)), [...BARE_BUTTON_RULES].sort(byName));
    const floorOf = (rows, written) =>
      rows.filter((row) => row.written === written).map(({ rule }) => declarationsOf(rule));
    assert.deepEqual(floorOf(bare, BARE_BUTTON_RULES.at(-1)), [[...MANAGER_BUTTON_FLOOR]]);
    const family = 'styles/fabricate-manager-rail-gathering.css: .fabricate-icon-button';
    assert.deepEqual(floorOf(census(), family), [[...MANAGER_BUTTON_FLOOR]]);
  });

  it('reserves every data-* name a rule that reaches a published icon button reads', () => {
    const hooks = dataHooksOf([...reachingOf(census()), ...reachingOf(shippedBareButtons())]);
    assert.deepEqual(hooks, ['data-validation-focused'], 'the hooks both censuses read');
    assert.deepEqual(
      hooks.filter((name) => !RESERVED_ON_A_CONTROL.test(name)),
      [],
      'a rest key of that name would take a rule of Fabricate’s, so M13 refuses it on a control'
    );
  });
});

describe('the icon button census, synthetic', () => {
  const reachingIn = (css) => writtenOf(reachingOf(syntheticCensus(ICON_BUTTON, css)));

  for (const [claim, selector] of [
    ['a class a Fabricate caller writes', '.fabricate-icon-button.manager-recipe-step-nav'],
    ['the pager above it', '.fabricate-pagination .fabricate-icon-button'],
    ['a row of the Manager’s above it', '.manager-scoped-list-row .fabricate-icon-button'],
    ['a classed child no closure spells', '.fabricate-icon-button .manager-unspelled'],
  ]) {
    it(`admits a selector that needs ${claim}`, () => {
      assert.equal(syntheticCensus(ICON_BUTTON, `${selector} { gap: 0 }`).length, 1);
      assert.deepEqual(reachingIn(`${selector} { gap: 0 }`), []);
    });
  }

  for (const selector of [
    '.fabricate-icon-button',
    '.fabricate-icon-button.is-ghost.is-danger',
    '.fabricate-icon-button.is-size-24',
    '.fabricate-icon-button:disabled',
    '.fabricate .fabricate-icon-button',
    '.fabricate-manager .fabricate-icon-button',
    '.fabricate-icon-button .fa-trash',
    '.fabricate-icon-button > i',
    '.fabricate-icon-button[data-x]',
  ]) {
    it(`refuses ${selector}, which nothing keeps off a published icon button`, () => {
      assert.deepEqual(reachingIn(`${selector} { gap: 0 }`), [`sheet.css: ${selector}`]);
    });
  }
});
