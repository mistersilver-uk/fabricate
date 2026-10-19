/**
 * The module sheet and every component style against the published `StatusToggle` (issue 2452):
 * the selectors that name its root class, which of them a published switch can match, where those
 * sit and what they draw, the bare `button` rules it also takes, the `data-*` names they read, the
 * classes its file spells on the root, and every selector that names its track or knob.
 * Limit: the census shares `published-component-manifest.test.js`'s sheet-reach limits, and takes
 * on trust that no extension target sits under one of `TOGGLE.ancestors`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RESERVED_ON_A_CONTROL } from '../src/ui/publishedComponentProps.js';

import { templateOf } from './helpers/apiConvention.js';
import {
  BARE_BUTTON_ANCESTORS,
  BARE_BUTTON_RULES,
  MANAGER_BUTTON_FLOOR,
  TOGGLE,
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
  selectorsNaming,
  writtenSelector,
} from './helpers/publishedComponentGate.js';

/** The disabled checkbox host's selector, which the census fails closed on because it reads no class inside `:has()`. */
const DISABLED_CHECKBOX_HOST =
  '.fabricate-toggle.fabricate-toggle:has(> .manager-tool-setting-toggle-input:disabled)';

/** The selectors the forced-colours block restates, which name the same compounds as the rules they repaint (issue 2492). */
const FORCED_COLOURS_RULES = Object.freeze([
  'styles/fabricate-manager-library.css: .fabricate-toggle .manager-status-toggle-track',
  'styles/fabricate-manager-library.css: .fabricate-toggle .manager-status-toggle-knob',
  'styles/fabricate-manager-library.css: .fabricate-toggle.fabricate-toggle',
  'styles/fabricate-manager-library.css: .fabricate-toggle.fabricate-toggle.is-off',
  'styles/fabricate-manager-library.css: .fabricate-toggle.fabricate-toggle.is-on',
  `styles/fabricate-manager-library.css: ${DISABLED_CHECKBOX_HOST}`,
  'styles/fabricate-manager-library.css: .fabricate-toggle.fabricate-toggle.is-on:has(> .manager-tool-setting-toggle-input:disabled)',
]);

/** The nineteen sheet rules that draw a published switch, each with nothing above its root's compound. */
const TOGGLE_FAMILY_RULES = Object.freeze([
  'styles/fabricate-manager-library.css: .fabricate-toggle',
  'styles/fabricate-manager-library.css: .fabricate-toggle.fabricate-toggle',
  'styles/fabricate-manager-library.css: .fabricate-toggle.fabricate-toggle.is-on',
  'styles/fabricate-manager-library.css: .fabricate-toggle.fabricate-toggle.is-off',
  'styles/fabricate-manager-library.css: .fabricate-toggle.fabricate-toggle.is-on:not(:disabled, .is-disabled, .is-locked, :has(> .manager-tool-setting-toggle-input:disabled)):hover .manager-status-toggle-track',
  'styles/fabricate-manager-library.css: .fabricate-toggle.fabricate-toggle.is-off:not(:disabled, .is-disabled, .is-locked, :has(> .manager-tool-setting-toggle-input:disabled)):hover .manager-status-toggle-track',
  'styles/fabricate-manager-library.css: .fabricate-toggle.fabricate-toggle:focus',
  'styles/fabricate-manager-library.css: .fabricate-toggle.fabricate-toggle:focus-visible',
  'styles/fabricate-manager-library.css: .fabricate-toggle .manager-status-toggle-track',
  'styles/fabricate-manager-library.css: .fabricate-toggle .manager-status-toggle-knob',
  'styles/fabricate-manager-library.css: .fabricate-toggle.fabricate-toggle.is-on .manager-status-toggle-knob',
  `styles/fabricate-manager-library.css: ${DISABLED_CHECKBOX_HOST}`,
  ...FORCED_COLOURS_RULES,
]);

/** The classes `StatusToggle.svelte` writes on its root that no published key draws: the indicator's and the checkbox's. */
const UNPUBLISHED_TOGGLE_CLASSES = Object.freeze(['is-locked', 'manager-tool-setting-toggle']);

/** The switch's two drawn parts, which only a selector through its root or a pinned ancestor may name. */
const TOGGLE_PARTS = Object.freeze(['manager-status-toggle-track', 'manager-status-toggle-knob']);

const writtenOf = (census) => census.map(({ written }) => written).sort(byName);
const reachingOf = (census) => census.filter(({ safe }) => !safe);

/** Every selector of `sheets` that names a part of `parts` with neither `shape.root` nor a pinned ancestor above it. */
function partFaults(sheets, parts, shape) {
  return sheets.flatMap(([file, css]) =>
    parts.flatMap((part) =>
      selectorsNaming(css, part).flatMap((complex) => {
        const compounds = compoundsOf(complex);
        const at = compounds.findLastIndex((compound) => classesOf(compound).includes(part));
        const above =
          at === -1 ? [] : compounds.slice(0, at).flatMap((compound) => classesOf(compound));
        const held = above.includes(shape.root) || above.some((name) => shape.ancestors.has(name));
        return held ? [] : [`${file}: ${writtenSelector(css, complex)}`];
      })
    )
  );
}

/** Every selector with a bare `button` compound, over every stylesheet, judged against the switch. */
const shippedBareButtons = () =>
  everyStylesheet().flatMap(([file, css]) =>
    bareButtonSelectors(file, css, TOGGLE, BARE_BUTTON_ANCESTORS)
  );

describe('the module sheet and every component style against the published StatusToggle', () => {
  // The 46: the nineteen family rules; ten on a root state or host class no published key writes;
  // seven on a child no published switch draws, its reading or the checkbox's input; and ten caller
  // rules under a pinned ancestor or a caller's own class, four of them in components.
  it('reaches a published switch through its nineteen family rules, of 46 that name its root', () => {
    const census = shippedCensus(TOGGLE, 'StatusToggle');
    assert.deepEqual(writtenOf(reachingOf(census)), [...TOGGLE_FAMILY_RULES].sort(byName));
    assert.equal(census.length, 46, 'the census of every selector naming the root');
    const inPartials = census.filter(({ written }) => written.startsWith('styles/')).length;
    assert.equal(inPartials, 42, 'the partials were read');
    assert.deepEqual(
      staleAncestors(TOGGLE, census, publishedManagerClasses()),
      [],
      'each pinned ancestor keeps at least one selector off a published switch'
    );
    assert.deepEqual(
      [Object.keys(entryNamed('StatusToggle').props), entryNamed('StatusToggle').root],
      [['on', 'ariaLabel', 'onclick', 'aria-labelledby', 'aria-describedby'], 'fabricate'],
      'a published host, label, disabled state, class or wider root reopens the census'
    );
  });

  it('keeps five selectors off a published switch only by the classes no published key draws', () => {
    const drawnAll = { ...TOGGLE, undrawn: new Set() };
    const census = shippedCensus(drawnAll, 'StatusToggle');
    assert.deepEqual(
      writtenOf(reachingOf(census)).filter((written) => !TOGGLE_FAMILY_RULES.includes(written)),
      [
        'styles/fabricate-manager-library.css: .fabricate-toggle .manager-status-toggle-label',
        'styles/fabricate-manager-library.css: .fabricate-toggle.fabricate-toggle:has(> .manager-tool-setting-toggle-input:disabled) .manager-status-toggle-label',
        'styles/fabricate-manager-tool-editor-environments.css: .fabricate-toggle .manager-tool-setting-toggle-input',
        'styles/fabricate-manager-tool-editor-environments.css: .fabricate-toggle .manager-tool-setting-toggle-input:disabled',
        'styles/fabricate-manager-tool-editor-environments.css: .fabricate-toggle .manager-tool-setting-toggle-input:focus',
      ]
    );
  });

  it('draws a published switch alike under any ancestor, with the module ring and the strip of its shadow', () => {
    const reaching = reachingOf(shippedCensus(TOGGLE, 'StatusToggle'));
    assert.deepEqual(placementFaults(reaching, TOGGLE, []), []);
    assert.deepEqual(ringFaults(reaching, TOGGLE), []);
  });

  it('holds the classes the census calls writable to the classes StatusToggle.svelte spells and a sheet rule names on the root', () => {
    const tokens = spelledStrings(entryNamed('StatusToggle').path, SHIPPED).flatMap((spelled) =>
      spelled.split(/\s+/)
    );
    const onRoot = new Set(
      shippedCensus(TOGGLE, 'StatusToggle').flatMap(({ complex }) =>
        compoundsOf(complex)
          .map((compound) => classesOf(compound))
          .filter((classes) => classes.includes(TOGGLE.root))
          .flat()
      )
    );
    assert.deepEqual(
      [...new Set(tokens)].filter((token) => onRoot.has(token)).sort(byName),
      [TOGGLE.root, ...TOGGLE.writable, ...UNPUBLISHED_TOGGLE_CLASSES].sort(byName),
      'a class the file spells that a rule names on the root is writable, or pinned unpublished'
    );
  });

  it('reaches a published switch through the four bare button rules a published button takes, and no other', () => {
    const census = shippedBareButtons();
    assert.deepEqual(writtenOf(reachingOf(census)), [...BARE_BUTTON_RULES].sort(byName));
    const floorOf = (rows, written) =>
      rows.filter((row) => row.written === written).map(({ rule }) => declarationsOf(rule));
    assert.deepEqual(floorOf(census, BARE_BUTTON_RULES.at(-1)), [[...MANAGER_BUTTON_FLOOR]]);
    const family = TOGGLE_FAMILY_RULES[0];
    assert.deepEqual(floorOf(shippedCensus(TOGGLE, 'StatusToggle'), family), [
      [...MANAGER_BUTTON_FLOOR],
    ]);
  });

  it('reserves every data-* name a rule that reaches a published switch reads', () => {
    const hooks = dataHooksOf([
      ...reachingOf(shippedCensus(TOGGLE, 'StatusToggle')),
      ...reachingOf(shippedBareButtons()),
    ]);
    assert.deepEqual(hooks, ['data-validation-focused'], 'the hooks both censuses read');
    assert.deepEqual(
      hooks.filter((name) => !RESERVED_ON_A_CONTROL.test(name)),
      [],
      'a rest key of that name would take a rule of Fabricate’s, so M13 refuses it on a control'
    );
  });

  // Seven: the track, the knob, the on knob, the two hover faces and the forced-colours pair.
  it('names its track and knob only through its root, in the seven family rules that do', () => {
    const named = everyStylesheet().flatMap(([file, css]) =>
      TOGGLE_PARTS.flatMap((part) =>
        selectorsNaming(css, part).map((complex) => `${file}: ${writtenSelector(css, complex)}`)
      )
    );
    assert.equal(named.length, 7, 'the parts were read');
    assert.ok(named.every((written) => TOGGLE_FAMILY_RULES.includes(written)));
    assert.deepEqual(partFaults(everyStylesheet(), TOGGLE_PARTS, TOGGLE), []);
  });
});

describe('the toggle census, synthetic', () => {
  const SPELLED = new Set(['manager-status-toggle-track', 'manager-status-toggle-label']);
  const census = (css, shape = TOGGLE) => syntheticCensus(shape, css, { spelled: SPELLED });
  const reachingIn = (css) => writtenOf(reachingOf(census(css)));
  const MANAGER = '.fabricate-manager';

  for (const [claim, selector] of [
    ['the indicator’s class, which no published key writes', '.fabricate-toggle.is-locked'],
    ['the checkbox host’s class', '.fabricate-toggle.manager-tool-setting-toggle'],
    ['the :disabled state, which no published key writes', '.fabricate-toggle:disabled'],
    ['a pinned ancestor', `${MANAGER} .manager-recipe-filter-row .fabricate-toggle`],
    ['the reading no published key draws', '.fabricate-toggle .manager-status-toggle-label'],
    ['a classed child no closure spells', '.fabricate-toggle .manager-unspelled'],
  ]) {
    it(`admits a selector that needs ${claim}`, () => {
      assert.equal(census(`${selector} { gap: 0 }`).length, 1);
      assert.deepEqual(reachingIn(`${selector} { gap: 0 }`), []);
    });
  }

  for (const selector of [
    '.fabricate-toggle',
    '.fabricate-toggle.is-on',
    `${MANAGER} .fabricate-toggle.is-off`,
    '.fabricate-toggle .manager-status-toggle-track',
    '.fabricate-toggle[data-x]',
    '.fabricate-toggle > span',
    '.manager-tools-authority-heading .fabricate-toggle',
  ]) {
    it(`refuses ${selector}, which nothing keeps off a published switch`, () => {
      assert.deepEqual(reachingIn(`${selector} { gap: 0 }`), [`sheet.css: ${selector}`]);
    });
  }

  it('reaches through the reading once the shape no longer calls it undrawn', () => {
    const drawn = { ...TOGGLE, undrawn: new Set() };
    const css = '.fabricate-toggle .manager-status-toggle-label { gap: 0 }';
    assert.deepEqual(writtenOf(reachingOf(census(css, drawn))), [
      'sheet.css: .fabricate-toggle .manager-status-toggle-label',
    ]);
  });

  const partsIn = (css) =>
    partFaults(
      [['sheet.css', templateOf('sheet.css', `<style>${css}</style>`).ast.css]],
      TOGGLE_PARTS,
      TOGGLE
    );

  it('admits a part named through the root or a pinned ancestor', () => {
    assert.deepEqual(partsIn('.fabricate-toggle .manager-status-toggle-knob { gap: 0 }'), []);
    assert.deepEqual(
      partsIn('.manager-task-core-status .manager-status-toggle-track { gap: 0 }'),
      []
    );
  });

  for (const selector of [
    '.fabricate .manager-status-toggle-knob',
    '.manager-status-toggle-track',
    '.a:has(.manager-status-toggle-knob)',
    '.manager-status-toggle-knob .fabricate-toggle',
  ]) {
    it(`names ${selector}, which reaches a part without the root`, () => {
      assert.deepEqual(partsIn(`${selector} { gap: 0 }`), [`sheet.css: ${selector}`]);
    });
  }
});
