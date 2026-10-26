/**
 * The module sheet and every component style against the published `EditorTabs` (issue 2601): the
 * 18 selectors that name its root class, which of them a published strip can match, where those
 * sit and what they draw, the bare `button` rules its tabs also take, and the classes its file
 * spells on the root and on a tab.
 * Limit: the census shares `published-component-manifest.test.js`'s sheet-reach limits, reads no
 * rule that styles the glyph by the classes `icon` writes without naming the root, and takes on
 * trust that no extension target sits under one of `STRIP.ancestors` or inside the tablist, which
 * draws no content slot.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

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
 * The published strip's root: the container class its default writes beside it, no ancestor a
 * Fabricate rule redraws it under, and the classes its file spells that no published key draws,
 * the marks, the padlock and the descriptions, which props it does not publish draw.
 */
const STRIP = Object.freeze({
  root: 'fabricate-tabs',
  writable: new Set(['manager-editor-tabs']),
  ancestors: new Set(),
  drawsChildren: true,
  disables: false,
  undrawn: new Set([
    'manager-editor-tab-count',
    'manager-editor-tab-dot',
    'manager-editor-tab-badge',
    'manager-editor-tab-lock',
    'fabricate-tabs-tooltip',
  ]),
});

/** A published tab: its default class and the state class `activeTab` writes. */
const TAB = Object.freeze({ writable: new Set(['manager-editor-tab-button', 'is-active']) });

/** The seven sheet rules that draw a published strip, each with nothing above its root's compound. */
const STRIP_FAMILY_RULES = Object.freeze([
  'styles/fabricate-manager-shell.css: .fabricate-tabs button',
  'styles/fabricate-manager-tool-editor-environments.css: .fabricate-tabs.manager-editor-tabs',
  'styles/fabricate-manager-tool-editor-environments.css: .fabricate-tabs .manager-editor-tab-button',
  'styles/fabricate-manager-tool-editor-environments.css: .fabricate-tabs .manager-editor-tab-button:hover',
  'styles/fabricate-manager-tool-editor-environments.css: .fabricate-tabs .manager-editor-tab-button.is-active',
  'styles/fabricate-manager-tool-editor-environments.css: .fabricate-tabs button:focus',
  'styles/fabricate-manager-tool-editor-environments.css: .fabricate-tabs button:focus-visible',
]);

const writtenOf = (census) => census.map(({ written }) => written).sort(byName);
const reachingOf = (census) => census.filter(({ safe }) => !safe);
const census = () => shippedCensus(STRIP, 'EditorTabs');

/** The bare-button ancestors but the strip's own root, which a published tab sits under. */
const TAB_ANCESTORS = new Set([...BARE_BUTTON_ANCESTORS].filter((name) => name !== STRIP.root));

/** Every selector with a bare `button` compound, over every stylesheet, judged against a published tab. */
const shippedBareButtons = () =>
  everyStylesheet().flatMap(([file, css]) => bareButtonSelectors(file, css, TAB, TAB_ANCESTORS));

describe('the module sheet and every component style against the published EditorTabs', () => {
  // The 18: the seven family rules; four on the environment vocabulary a Fabricate caller passes,
  // which no published key writes; and seven on a mark, the padlock or a description.
  it('reaches a published strip through its seven family rules, of 18 that name its root', () => {
    const shipped = census();
    assert.deepEqual(writtenOf(reachingOf(shipped)), [...STRIP_FAMILY_RULES].sort(byName));
    assert.equal(shipped.length, 18, 'the census of every selector naming the root');
    assert.deepEqual(
      staleAncestors(STRIP, shipped, publishedManagerClasses()),
      [],
      'no pinned ancestor'
    );
    assert.deepEqual(
      [Object.keys(entryNamed('EditorTabs').props), gatedRoot(entryNamed('EditorTabs'))],
      [['tabs', 'activeTab', 'onSelect', 'ariaLabel', 'idStem', 'activePanelOnly'], 'fabricate'],
      'a published mark, padlock, description, class or wider root reopens the census'
    );
  });

  it('draws a published strip alike under any ancestor, with the module ring alone on its tabs', () => {
    const reaching = reachingOf(census());
    assert.deepEqual(placementFaults(reaching, STRIP, []), []);
    assert.deepEqual(ringFaults(reaching, STRIP), []);
    assert.deepEqual(dataHooksOf(reaching), [], 'no reaching rule reads a data-* hook');
  });

  it('holds the classes the census calls writable to the classes EditorTabs.svelte spells and a sheet rule names on the root or a tab', () => {
    const tokens = new Set(
      spelledStrings(entryNamed('EditorTabs').path, SHIPPED).flatMap((spelled) =>
        spelled.split(/\s+/)
      )
    );
    const named = (root) =>
      new Set(
        census().flatMap(({ complex }) =>
          compoundsOf(complex)
            .map((compound) => classesOf(compound))
            .filter((classes) => root(classes))
            .flat()
        )
      );
    const onRoot = named((classes) => classes.includes(STRIP.root));
    assert.deepEqual(
      [...tokens].filter((token) => onRoot.has(token)).sort(byName),
      [STRIP.root, ...STRIP.writable].sort(byName),
      'a class the file spells that a rule names on the root is writable'
    );
    const onTab = named((classes) => classes.includes('manager-editor-tab-button'));
    assert.deepEqual(
      [...tokens].filter((token) => onTab.has(token)).sort(byName),
      [...TAB.writable].sort(byName),
      'a class the file spells that a rule names on a tab is the default or the selected state'
    );
  });

  it('reaches a published tab through the four bare button rules a published button takes and the strip’s three, and no other', () => {
    const bare = shippedBareButtons();
    const own = STRIP_FAMILY_RULES.filter((written) => / button(:|$)/u.test(written));
    assert.deepEqual(writtenOf(reachingOf(bare)), [...BARE_BUTTON_RULES, ...own].sort(byName));
    assert.deepEqual(
      dataHooksOf(reachingOf(bare)),
      ['data-validation-focused'],
      'a hook no published key writes, and rest lands on the tablist, never on a tab'
    );
    const floorOf = (rows, written) =>
      rows.filter((row) => row.written === written).map(({ rule }) => declarationsOf(rule));
    assert.deepEqual(floorOf(bare, BARE_BUTTON_RULES.at(-1)), [[...MANAGER_BUTTON_FLOOR]]);
    const floor = 'styles/fabricate-manager-shell.css: .fabricate-tabs button';
    assert.deepEqual(
      floorOf(census(), floor),
      [[...MANAGER_BUTTON_FLOOR]],
      'the Manager’s bare button rule adds nothing the strip’s own floor does not, so both windows draw alike'
    );
  });
});

describe('the editor tabs census, synthetic', () => {
  const reachingIn = (css) => writtenOf(reachingOf(syntheticCensus(STRIP, css)));

  for (const [claim, selector] of [
    ['a container class no published key writes', '.fabricate-tabs.manager-environment-tabs'],
    ['a mark below a tab', '.fabricate-tabs .manager-editor-tab-count'],
    ['the padlock below a tab', '.fabricate-tabs .manager-editor-tab-lock'],
    ['a description beside the strip', '.fabricate-tabs ~ .fabricate-tabs-tooltip'],
    ['a classed child no closure spells', '.fabricate-tabs .manager-unspelled'],
  ]) {
    it(`admits a selector that needs ${claim}`, () => {
      assert.equal(syntheticCensus(STRIP, `${selector} { gap: 0 }`).length, 1);
      assert.deepEqual(reachingIn(`${selector} { gap: 0 }`), []);
    });
  }

  for (const selector of [
    '.fabricate-tabs',
    '.fabricate-tabs.manager-editor-tabs',
    '.fabricate .fabricate-tabs',
    '.fabricate-tabs button',
    '.fabricate-tabs > button > i',
    '.fabricate-tabs[data-x]',
  ]) {
    it(`refuses ${selector}, which nothing keeps off a published strip`, () => {
      assert.deepEqual(reachingIn(`${selector} { gap: 0 }`), [`sheet.css: ${selector}`]);
    });
  }
});
