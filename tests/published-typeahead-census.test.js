/**
 * The module sheet and every component style against the published `Typeahead` (issue 2860): the
 * selectors that name its four roots, the field's `fabricate-typeahead`, the column the data form
 * draws it in, the list and its rows, which of them a published typeahead can match, and that each
 * draws alike under any ancestor. Its field is the published `SearchField`'s shell, whose own
 * census is `published-search-census.test.js`.
 * Limit: the census shares `published-component-manifest.test.js`'s sheet-reach limits.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  entryNamed,
  placementFaults,
  shippedCensus,
  syntheticCensus,
} from './helpers/publishedComponentCensus.js';
import { byName } from './helpers/publishedComponentGate.js';

const LIST_SHEET = 'styles/fabricate-list-primitives.css';

/** Each root, the classes the published keys write beside it, and the rules that reach it. */
const ROOTS = Object.freeze({
  field: {
    shape: {
      root: 'fabricate-typeahead',
      writable: new Set([
        'fabricate-search',
        'is-invalid',
        'is-density-toolbar',
        'is-density-inline',
      ]),
      ancestors: new Set(),
      drawsChildren: true,
    },
    reaching: [
      '.fabricate-search.fabricate-search.fabricate-typeahead.is-invalid:not(.is-compact)',
      '.fabricate-search.fabricate-search.fabricate-typeahead.is-invalid:not(.is-compact, :focus-within)',
      '.fabricate-search.fabricate-search.fabricate-typeahead.is-invalid:not(.is-compact) input:not(:focus-visible)::placeholder',
    ],
  },
  control: {
    shape: {
      root: 'fabricate-typeahead-control',
      writable: new Set(),
      ancestors: new Set(),
      drawsChildren: true,
    },
    reaching: ['.fabricate-typeahead-control'],
  },
  list: {
    shape: {
      root: 'fabricate-typeahead-list',
      writable: new Set(['is-data-form']),
      ancestors: new Set(),
      drawsChildren: true,
    },
    reaching: [
      '.fabricate-typeahead-list.fabricate-typeahead-list',
      '.fabricate-typeahead-list.is-data-form .fabricate-typeahead-note',
    ],
  },
  option: {
    shape: {
      root: 'fabricate-typeahead-option',
      writable: new Set(['fabricate-typeahead-option-rich', 'has-icon', 'is-current']),
      ancestors: new Set(),
      drawsChildren: true,
    },
    reaching: [
      '.fabricate-typeahead-option.fabricate-typeahead-option',
      '.fabricate-typeahead-option.fabricate-typeahead-option:hover',
      '.fabricate-typeahead-option.fabricate-typeahead-option:focus-visible',
      ".fabricate-typeahead-option.fabricate-typeahead-option[aria-selected='true']",
      '.fabricate-typeahead-option.fabricate-typeahead-option.fabricate-typeahead-option-rich',
      '.fabricate-typeahead-option.fabricate-typeahead-option.fabricate-typeahead-option-rich.has-icon',
      '.fabricate-typeahead-option.fabricate-typeahead-option.fabricate-typeahead-option-rich.is-current',
      ".fabricate-typeahead-option.fabricate-typeahead-option.fabricate-typeahead-option-rich[aria-selected='true']",
    ],
  },
});

const writtenOf = (census) =>
  census.map(({ written }) => written.replaceAll(/\s+/g, ' ')).sort(byName);
const reachingOf = (census) => census.filter(({ safe }) => !safe);

describe('the module sheet and every component style against the published Typeahead', () => {
  for (const [name, { shape, reaching }] of Object.entries(ROOTS)) {
    it(`reaches a published typeahead's ${name} through the list sheet's own rules alone`, () => {
      const census = reachingOf(shippedCensus(shape, 'Typeahead'));
      assert.deepEqual(
        writtenOf(census),
        reaching.map((selector) => `${LIST_SHEET}: ${selector}`).sort(byName)
      );
      assert.deepEqual(placementFaults(census, shape, []), [], 'drawn alike under any ancestor');
    });
  }

  it('keeps the Manager’s own suggestion rule off a published row by the class no published key writes', () => {
    const safe = shippedCensus(ROOTS.option.shape, 'Typeahead').filter((entry) => entry.safe);
    assert.deepEqual(writtenOf(safe), [
      'styles/fabricate-manager-checks-modifiers.css: .fabricate-manager .fabricate-typeahead-option.manager-character-modifier-add-suggestion',
    ]);
  });

  it('publishes no key that would reopen the census', () => {
    const entry = entryNamed('Typeahead');
    assert.deepEqual(
      [Object.keys(entry.props), entry.root, entry.rest],
      [
        [
          'options',
          'query',
          'value',
          'onChange',
          'ariaLabel',
          'placeholder',
          'emptyLabel',
          'allowFree',
          'onFreeText',
          'density',
          'error',
          'countLabel',
        ],
        'any',
        false,
      ],
      'a published class, list or option hook, or rest key reopens the census'
    );
  });
});

describe('the typeahead census, synthetic', () => {
  const reachingIn = (shape, css) =>
    writtenOf(reachingOf(syntheticCensus(shape, `${css} { gap: 0 }`, { spelled: new Set() })));

  for (const [shape, selector] of [
    [ROOTS.option.shape, '.fabricate-typeahead-option.manager-tag-suggestion'],
    [ROOTS.list.shape, '.fabricate-typeahead-list.manager-character-modifier-add-suggestions'],
    [ROOTS.field.shape, '.fabricate-typeahead.is-compact'],
  ]) {
    it(`admits ${selector}, which a published typeahead cannot take`, () => {
      assert.deepEqual(reachingIn(shape, selector), []);
    });
  }

  for (const [shape, selector] of [
    [ROOTS.option.shape, '.fabricate-typeahead-option'],
    [ROOTS.option.shape, '.fabricate-typeahead-option.has-icon'],
    [ROOTS.list.shape, '.fabricate-manager .fabricate-typeahead-list'],
    [ROOTS.field.shape, '.fabricate-typeahead.is-invalid'],
  ]) {
    it(`refuses ${selector}, which nothing keeps off a published typeahead`, () => {
      assert.deepEqual(reachingIn(shape, selector), [`sheet.css: ${selector}`]);
    });
  }
});
