/**
 * The module sheet and every component style against the published `Field` (issue 2601): the
 * selectors that name its root class, which of them a published field can match, where those sit
 * and what they draw, and the classes its file spells on the root. Two family rules name the field
 * itself, its column and a child `<span>` caption, the second unreachable in a published mount; the
 * rest that reach it are the chrome the sheet draws on a control the companion puts in its content
 * slot, which the Field group states.
 * Limit: the census shares `published-component-manifest.test.js`'s sheet-reach limits, and takes
 * on trust that no extension target sits under one of `FIELD.ancestors`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  classesOf,
  compoundsOf,
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
  gatedRoot,
  isStrip,
} from './helpers/publishedComponentGate.js';

/**
 * The published field's root: the classes its `size`, `face`, `type` and `invalid` write on it
 * (issue 2848), and the classes under which a rule redraws a field of Fabricate's own or the
 * control inside it.
 */
const FORM_CLASSES = Object.freeze({
  size: ['is-size-26', 'is-size-28', 'is-size-30', 'is-size-34'],
  face: ['is-face-serif', 'is-face-mono'],
  type: ['is-type-number'],
  invalid: ['is-invalid'],
});
const FIELD = Object.freeze({
  root: 'fabricate-field',
  writable: new Set(Object.values(FORM_CLASSES).flat()),
  ancestors: new Set([
    'manager-checks-rail',
    'fabricate-rule-row',
    'manager-character-modifier-row-bounds',
    'manager-vocabulary-form-fields',
    'manager-recipe-steps-editor',
    'manager-recipe-range-cell',
    'manager-drop-editor-card',
    'manager-character-modifier-row-card',
    'manager-economy-regen-grid',
    'manager-import-mapping-controls',
    'manager-currency-strategy',
    'manager-currency-subunit-builder',
  ]),
  drawsChildren: true,
});

const LIBRARY = 'styles/fabricate-manager-library.css';
const TEXT_LIKE_EXCLUSION =
  ":not(.fab-stepper-input, [data-recipe-option-formula]):not([type='radio'], [type='checkbox'], [type='search']):not([type='range'])";
const INSET_RING = `${LIBRARY}: .fabricate-field :is(input, textarea):where(:not([type='checkbox'], [type='radio'], [type='range'], [type='color'], [type='file'], [type='button'], [type='submit'], [type='reset'], [type='image'])):focus-visible`;

/**
 * The two family rules: the column, and the caption of a child `<span>`, named by selector but
 * unreachable in a published mount because the slot's wrapper is the root's only child.
 */
const FIELD_FAMILY_RULES = Object.freeze([
  `${LIBRARY}: .fabricate-field.fabricate-field`,
  `${LIBRARY}: .fabricate-field > span:where(:first-child)`,
]);

/** The seventeen rules that draw a text input, a textarea or a `<small>` the companion puts in the slot. */
const FIELD_SLOT_CHROME = Object.freeze([
  'styles/fabricate-manager-shell.css: .fabricate-field :is(input, textarea)',
  ...['text', 'url', 'email', 'tel', 'password'].map(
    (type) => `${LIBRARY}: .fabricate-field input[type="${type}"]`
  ),
  `${LIBRARY}: .fabricate-field input:not([type])`,
  `${LIBRARY}: .fabricate-field textarea`,
  `${LIBRARY}: .fabricate-field.fabricate-field input${TEXT_LIKE_EXCLUSION}`,
  `${LIBRARY}: .fabricate-field.fabricate-field input${TEXT_LIKE_EXCLUSION}`,
  `${LIBRARY}: .fabricate-field.fabricate-field textarea`,
  `${LIBRARY}: .fabricate-field :is(input, textarea):focus`,
  `${LIBRARY}: .fabricate-field input:focus-visible`,
  `${LIBRARY}: .fabricate-field textarea:focus-visible`,
  INSET_RING,
  'styles/fabricate-manager-recipe-editor.css: .fabricate-field.fabricate-field textarea',
  'styles/fabricate-manager-recipe-editor.css: .fabricate-field.fabricate-field small',
]);

/** The thirteen rules the four form keys' classes draw on a control in the slot (issue 2848). */
const NUMBER = ".fabricate-field.fabricate-field.is-type-number input[type='number']";
const FIELD_FORM_CHROME = Object.freeze([
  ...FORM_CLASSES.size.map(
    (rung) => `${LIBRARY}: .fabricate-field.fabricate-field.${rung} input${TEXT_LIKE_EXCLUSION}`
  ),
  ...FORM_CLASSES.face.flatMap((face) => [
    `${LIBRARY}: .fabricate-field.fabricate-field.${face} input${TEXT_LIKE_EXCLUSION}`,
    `${LIBRARY}: .fabricate-field.fabricate-field.${face} textarea`,
  ]),
  // The error state needs the control's own `aria-invalid` as well as the key.
  `${LIBRARY}: .fabricate-field.fabricate-field.is-invalid input${TEXT_LIKE_EXCLUSION}[aria-invalid='true']`,
  `${LIBRARY}: .fabricate-field.fabricate-field.is-invalid textarea[aria-invalid='true']`,
  ...['', '::-webkit-outer-spin-button', '::-webkit-inner-spin-button'].map(
    (part) => `${LIBRARY}: ${NUMBER}${part}`
  ),
]);

const writtenOf = (census) =>
  census.map(({ written }) => written.replaceAll(/\s+/g, ' ')).sort(byName);
const reachingOf = (census) => census.filter(({ safe }) => !safe);
const ringOf = (rows, written) =>
  rows.filter((row) => row.written === written).map(({ rule }) => declarationsOf(rule));

describe('the module sheet and every component style against the published Field', () => {
  // The 60: the two family rules, the seventeen slot-chrome rules and the thirteen form rules;
  // fifteen caller rules under a pinned ancestor, four of them in components; and thirteen on a
  // class no published key writes, ten of them in components.
  it('reaches a published field through its two family rules, seventeen slot-chrome rules and thirteen form rules, of 60 that name its root', () => {
    const census = shippedCensus(FIELD, 'Field');
    assert.deepEqual(
      writtenOf(reachingOf(census)),
      [...FIELD_FAMILY_RULES, ...FIELD_SLOT_CHROME, ...FIELD_FORM_CHROME].sort(byName)
    );
    assert.equal(census.length, 60, 'the census of every selector naming the root');
    const inPartials = census.filter(({ written }) => written.startsWith('styles/')).length;
    assert.equal(inPartials, 46, 'the partials were read');
    assert.deepEqual(
      staleAncestors(FIELD, census, publishedManagerClasses()),
      [],
      'each pinned ancestor keeps at least one selector off a published field'
    );
    assert.deepEqual(
      [Object.keys(entryNamed('Field').props), gatedRoot(entryNamed('Field'))],
      [['as', 'children', 'size', 'face', 'type', 'invalid'], 'fabricate'],
      'a published class, caption, label host or wider root reopens the census'
    );
  });

  it('draws a published field alike under any ancestor', () => {
    const reaching = reachingOf(shippedCensus(FIELD, 'Field'));
    assert.deepEqual(placementFaults(reaching, FIELD, []), []);
  });

  it('draws the inset 1px ring on a text-like input in the slot, the 2px ring on any other, and strips the host focus once', () => {
    const reaching = reachingOf(shippedCensus(FIELD, 'Field'));
    const ring = (width, offset) => [
      ['outline', `${width} solid var(--fab-accent)`],
      ['outline-offset', offset],
    ];
    assert.deepEqual(ringOf(reaching, INSET_RING), [ring('1px', '-1px')]);
    for (const written of [
      `${LIBRARY}: .fabricate-field input:focus-visible`,
      `${LIBRARY}: .fabricate-field textarea:focus-visible`,
    ]) {
      assert.deepEqual(ringOf(reaching, written), [ring('2px', '2px')], written);
    }
    const strips = reaching.filter(({ written }) => written.endsWith(':focus'));
    assert.equal(strips.length, 1, 'one strip');
    assert.ok(isStrip(strips[0].rule), 'it removes the host outline and glow');
    const ringed = new Set([
      ...strips,
      ...reaching.filter(({ written }) => written.endsWith(':focus-visible')),
    ]);
    const drawsARing = ([property]) =>
      property === 'all' || property === 'box-shadow' || property.startsWith('outline');
    assert.deepEqual(
      reaching
        .filter((row) => !ringed.has(row))
        .flatMap(({ written, rule }) =>
          declarationsOf(rule)
            .filter(drawsARing)
            .map(() => written)
        ),
      [],
      'no other reaching rule draws or strips a ring'
    );
  });

  it('holds the classes the census calls writable to the classes Field.svelte spells and a sheet rule names on the root', () => {
    const tokens = spelledStrings(entryNamed('Field').path, SHIPPED).flatMap((spelled) =>
      spelled.split(/\s+/)
    );
    const onRoot = new Set(
      shippedCensus(FIELD, 'Field').flatMap(({ complex }) =>
        compoundsOf(complex)
          .map((compound) => classesOf(compound))
          .filter((classes) => classes.includes(FIELD.root))
          .flat()
      )
    );
    assert.deepEqual(
      [...new Set(tokens)].filter((token) => onRoot.has(token)).sort(byName),
      [FIELD.root, ...FIELD.writable].sort(byName),
      'a class the file spells that a rule names on the root is writable'
    );
  });

  it('reads one data-* name in a reaching rule, on the control in the slot and never on the root', () => {
    const reaching = reachingOf(shippedCensus(FIELD, 'Field'));
    assert.deepEqual(dataHooksOf(reaching), ['data-recipe-option-formula']);
    const onRoot = reaching.filter(({ complex }) =>
      compoundsOf(complex)
        .filter((compound) => classesOf(compound).includes(FIELD.root))
        .some((compound) => compound.selectors.some((part) => part.type === 'AttributeSelector'))
    );
    assert.deepEqual(onRoot, [], 'so the field reserves no rest name');
  });
});

describe('the field census, synthetic', () => {
  const reachingIn = (css) =>
    writtenOf(reachingOf(syntheticCensus(FIELD, `${css} { gap: 0 }`, { spelled: new Set() })));

  for (const selector of [
    '.fabricate-manager .manager-checks-rail .fabricate-field input',
    '.fabricate-field.fabricate-field.is-wide',
    '.fabricate-field.span-2',
    '.fabricate-field .manager-unspelled',
  ]) {
    it(`admits ${selector}, which a published field cannot take`, () => {
      assert.deepEqual(reachingIn(selector), []);
    });
  }

  for (const selector of [
    '.fabricate-field',
    '.fabricate .fabricate-field input',
    '.fabricate-field[data-x]',
    '.fabricate-manager .manager-unpinned-row .fabricate-field',
    '.fabricate-field > span',
    '.fabricate-field.is-size-26 input',
    '.fabricate-field.is-invalid textarea',
  ]) {
    it(`refuses ${selector}, which nothing keeps off a published field`, () => {
      assert.deepEqual(reachingIn(selector), [`sheet.css: ${selector}`]);
    });
  }
});
