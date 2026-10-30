/**
 * The module sheet and every component style against the published `ToggleCard` (issue 2775): the
 * selectors that name its root class, which of them a published card can match, and where those
 * sit; the status-card parts it spells, which only a selector through its root or a pinned
 * ancestor may name; and the tone classes no published key writes.
 * Limit: the census shares `published-component-manifest.test.js`'s sheet-reach limits, and takes
 * on trust that no extension target sits under one of `TOGGLE_CARD.ancestors`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { templateOf } from './helpers/apiConvention.js';
import {
  TOGGLE_CARD,
  classesOf,
  compoundsOf,
  entryNamed,
  partFaults,
  placementFaults,
  publishedManagerClasses,
  shippedCensus,
  syntheticCensus,
} from './helpers/publishedComponentCensus.js';
import {
  byName,
  everyStylesheet,
  selectorsNaming,
  writtenSelector,
} from './helpers/publishedComponentGate.js';

/** The sheet rules that draw a published card, each with nothing above its root's compound. */
const CARD_FAMILY_RULES = Object.freeze([
  'styles/fabricate-manager-library.css: .fabricate-toggle-card .manager-recipe-status-copy',
  'styles/fabricate-manager-library.css: .fabricate-toggle-card .manager-recipe-status-icon',
  'styles/fabricate-manager-library.css: .fabricate-toggle-card .manager-recipe-status-sub',
  'styles/fabricate-manager-library.css: .fabricate-toggle-card .manager-recipe-status-title',
  'styles/fabricate-manager-library.css: .fabricate-toggle-card.manager-recipe-status-card',
]);

/** The card's drawn parts, which only a selector through its root or a pinned ancestor may name. */
const CARD_PARTS = Object.freeze([
  'manager-recipe-status-icon',
  'manager-recipe-status-copy',
  'manager-recipe-status-title',
  'manager-recipe-status-sub',
]);

/** The class a card's root element also bears, which a caller's rule names with or without the root. */
const CARD_CLASS = 'manager-recipe-status-card';

/** Every selector of `sheets` naming the card class with no `TOGGLE_CARD.root` or pinned ancestor in it. */
const cardFaults = (sheets) =>
  sheets.flatMap(([file, css]) =>
    selectorsNaming(css, CARD_CLASS)
      .filter((complex) => {
        const named = compoundsOf(complex).flatMap((compound) => classesOf(compound));
        return (
          !named.includes(TOGGLE_CARD.root) &&
          named.every((name) => !TOGGLE_CARD.ancestors.has(name))
        );
      })
      .map((complex) => `${file}: ${writtenSelector(css, complex)}`)
  );

const writtenOf = (census) => census.map(({ written }) => written).sort(byName);
const reachingOf = (census) => census.filter(({ safe }) => !safe);

describe('the module sheet and every component style against the published ToggleCard', () => {
  it('reaches a published card through its five family rules, of ten that name its root', () => {
    const census = shippedCensus(TOGGLE_CARD, 'ToggleCard');
    assert.equal(census.length, 10, 'the census of every selector naming the root');
    assert.deepEqual(writtenOf(reachingOf(census)), [...CARD_FAMILY_RULES].sort(byName));
    assert.deepEqual(
      [Object.keys(entryNamed('ToggleCard').props), entryNamed('ToggleCard').root],
      [['title', 'sub', 'icon', 'on', 'semantics', 'onToggle'], 'any'],
      'a published variant, hook name or wider root reopens the census'
    );
  });

  it('keeps the tone rules off a published card only by the tone classes no published key writes', () => {
    const toned = shippedCensus(TOGGLE_CARD, 'ToggleCard').filter(({ safe }) => safe);
    assert.equal(toned.length, 5);
    const writesTones = {
      ...TOGGLE_CARD,
      writable: new Set([...TOGGLE_CARD.writable, 'is-enabled', 'is-locked', 'is-info']),
    };
    assert.equal(
      reachingOf(shippedCensus(writesTones, 'ToggleCard')).length,
      CARD_FAMILY_RULES.length + toned.length
    );
  });

  it('draws a published card alike under any ancestor', () => {
    const reaching = reachingOf(shippedCensus(TOGGLE_CARD, 'ToggleCard'));
    assert.deepEqual(placementFaults(reaching, TOGGLE_CARD, []), []);
  });

  it('names its parts only through its root or a pinned ancestor, and keeps each ancestor earning its place', () => {
    const sheets = everyStylesheet();
    assert.deepEqual(partFaults(sheets, CARD_PARTS, TOGGLE_CARD), []);
    assert.deepEqual(cardFaults(sheets), [], 'and the card class itself');
    const naming = sheets.flatMap(([, css]) =>
      [...CARD_PARTS, CARD_CLASS].flatMap((part) =>
        selectorsNaming(css, part).map((complex) => writtenSelector(css, complex))
      )
    );
    for (const ancestor of TOGGLE_CARD.ancestors) {
      assert.ok(
        naming.some((written) => written.includes(ancestor)),
        `${ancestor} still sits above a status-card part`
      );
    }
    assert.ok(publishedManagerClasses().has('manager-recipe-status-card'), 'the closure was read');
  });
});

describe('the toggle card census, synthetic', () => {
  const SPELLED = new Set(CARD_PARTS);
  const reachingIn = (css) =>
    syntheticCensus(TOGGLE_CARD, `${css} { gap: 0 }`, { spelled: SPELLED })
      .filter(({ safe }) => !safe)
      .map(({ written }) => written);

  for (const [claim, selector] of [
    ['a tone class no published key writes', '.fabricate-toggle-card.is-info'],
    ['a pinned ancestor', '.fabricate-manager .manager-checks-flag-list .fabricate-toggle-card'],
    ['a classed child no closure spells', '.fabricate-toggle-card .manager-unspelled'],
  ]) {
    it(`admits a selector that needs ${claim}`, () => {
      assert.deepEqual(reachingIn(selector), []);
    });
  }

  for (const selector of [
    '.fabricate-toggle-card',
    '.fabricate-toggle-card.is-on',
    '.fabricate-manager .fabricate-toggle-card',
    '.fabricate-toggle-card .manager-recipe-status-title',
    '.fabricate-toggle-card > div',
  ]) {
    it(`refuses ${selector}, which nothing keeps off a published card`, () => {
      assert.deepEqual(reachingIn(selector), [`sheet.css: ${selector}`]);
    });
  }

  const partsIn = (css) =>
    partFaults(
      [['sheet.css', templateOf('sheet.css', `<style>${css}</style>`).ast.css]],
      CARD_PARTS,
      TOGGLE_CARD
    );

  it('admits a part named through the root or a pinned ancestor', () => {
    assert.deepEqual(partsIn('.fabricate-toggle-card .manager-recipe-status-sub { gap: 0 }'), []);
    assert.deepEqual(
      partsIn('.manager-checks-flag-list .manager-recipe-status-card { gap: 0 }'),
      []
    );
  });

  it('names the card class reached without the root or a pinned ancestor', () => {
    const { css } = templateOf(
      'sheet.css',
      '<style>.fabricate .manager-recipe-status-card { gap: 0 }</style>'
    ).ast;
    assert.deepEqual(cardFaults([['sheet.css', css]]), [
      'sheet.css: .fabricate .manager-recipe-status-card',
    ]);
  });

  it('names a part reached without the root or a pinned ancestor', () => {
    assert.deepEqual(partsIn('.fabricate .manager-recipe-status-title { gap: 0 }'), [
      'sheet.css: .fabricate .manager-recipe-status-title',
    ]);
  });
});
