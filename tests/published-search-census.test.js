/**
 * The module sheet and every component style against the published `SearchField` (issue 2453): the
 * selectors that name its root class, which of them a published field can match, and the classes
 * its file spells on the root. The `.fabricate-manager .manager-* .fabricate-search` rules sit
 * under a pinned ancestor, and the compact rules need the `is-compact` no published key writes.
 * Limit: the census shares `published-component-manifest.test.js`'s sheet-reach limits, and takes
 * on trust that no extension target sits under one of `SEARCH.ancestors` or a Manager `data-*` hook.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  classesOf,
  compoundsOf,
  entryNamed,
  publishedManagerClasses,
  shippedCensus,
  spelledStrings,
  staleAncestors,
  syntheticCensus,
} from './helpers/publishedComponentCensus.js';
import { SHIPPED, byName } from './helpers/publishedComponentGate.js';

/**
 * The published field's root: no published key writes a class on it, and the classes under which
 * a rule redraws a search field of Fabricate's own, the caption form's wrapper among them.
 */
const SEARCH = Object.freeze({
  root: 'fabricate-search',
  writable: new Set(),
  ancestors: new Set([
    'fabricate-search-field',
    'manager-access-roster',
    'manager-knowledge-roster',
    'manager-gathering-task-edit-view',
    'manager-task-required-tools-search',
    'manager-drop-inspector-stack',
    'manager-realm-env-column',
    'manager-tools-library-card',
    'manager-component-entry-systems-search',
    'manager-essence-filter-row',
  ]),
  drawsChildren: true,
});

/** The ten rules that draw a published field, the last inside the Manager's own container query. */
const SEARCH_FAMILY_RULES = Object.freeze([
  'styles/fabricate-manager-shell.css: .fabricate-search input',
  'styles/fabricate-list-primitives.css: .fabricate-search.fabricate-search',
  'styles/fabricate-list-primitives.css: .fabricate-search.fabricate-search:not(.is-compact)',
  'styles/fabricate-list-primitives.css: .fabricate-search.fabricate-search:not(.is-compact) > i',
  'styles/fabricate-list-primitives.css: .fabricate-search.fabricate-search:not(.is-compact) input',
  'styles/fabricate-list-primitives.css: .fabricate-search.fabricate-search:not(.is-compact) input:not(:focus-visible)::placeholder',
  'styles/fabricate-list-primitives.css: .fabricate-search.fabricate-search:not(.is-compact):focus-within',
  'styles/fabricate-list-primitives.css: .fabricate-search.fabricate-search:not(.is-compact) input:focus-visible',
  'styles/fabricate-list-primitives.css: .fabricate-search input:focus',
  'styles/fabricate-manager-responsive.css: .fabricate-search.fabricate-search',
]);

/** The one caller rule held off a published field by a `data-*` hook of the Manager's own, above it. */
const SEARCH_HOOK_RULES = Object.freeze([
  'src/ui/svelte/apps/manager/ToolsBrowserView.svelte: [data-manager-tools-search] :global(.fabricate-search)',
]);

/** The class `SearchField.svelte` writes on its root that no published key draws: `density`'s. */
const UNPUBLISHED_SEARCH_CLASSES = Object.freeze(['is-compact']);

const writtenOf = (census) =>
  census.map(({ written }) => written.replaceAll(/\s+/g, ' ')).sort(byName);

/** Whether the root's own compound needs `is-compact` through a `:where()` or `:is()` of it alone. */
function compactOnly(complex) {
  const compounds = compoundsOf(complex);
  const own = compounds.findLast((compound) => classesOf(compound).includes(SEARCH.root));
  return (own?.selectors ?? []).some(
    (part) =>
      part.type === 'PseudoClassSelector' &&
      ['where', 'is'].includes(part.name) &&
      part.args.children.every(
        ({ children }) =>
          children.length === 1 &&
          children[0].selectors.length === 1 &&
          children[0].selectors[0].type === 'ClassSelector' &&
          !SEARCH.writable.has(children[0].selectors[0].name)
      )
  );
}

const reachingOf = (census) => census.filter(({ safe, complex }) => !safe && !compactOnly(complex));

describe('the module sheet and every component style against the published SearchField', () => {
  // Of the selectors that name the root, the ten family rules and the hook rule reach a published
  // field; three compact rules need `is-compact` only through `:where()`; the rest sit on a class no
  // published key writes or under a pinned ancestor. The census size is not pinned: a sheet edit moves it.
  it('reaches a published field through its ten family rules and one hook rule, of those that name its root', () => {
    const census = shippedCensus(SEARCH, 'SearchField');
    assert.deepEqual(
      writtenOf(reachingOf(census)),
      [...SEARCH_FAMILY_RULES, ...SEARCH_HOOK_RULES].sort(byName)
    );
    const compact = census.filter(({ safe, complex }) => !safe && compactOnly(complex));
    assert.equal(compact.length, 3, 'held off only by the :where() the census does not read');
    assert.deepEqual(
      staleAncestors(SEARCH, census, publishedManagerClasses()),
      [],
      'each pinned ancestor keeps at least one selector off a published field'
    );
  });

  it('publishes no key that would reopen the census', () => {
    const entry = entryNamed('SearchField');
    assert.deepEqual(
      [Object.keys(entry.props), entry.root],
      [['value', 'placeholder', 'ariaLabel'], 'fabricate'],
      'a published density, label, class or wider root reopens the census'
    );
  });

  it('holds the classes the census calls writable to the classes SearchField.svelte spells and a sheet rule names on the root', () => {
    const tokens = spelledStrings(entryNamed('SearchField').path, SHIPPED).flatMap((spelled) =>
      spelled.split(/\s+/)
    );
    const onRoot = new Set(
      shippedCensus(SEARCH, 'SearchField').flatMap(({ complex }) =>
        compoundsOf(complex)
          .map((compound) => classesOf(compound))
          .filter((classes) => classes.includes(SEARCH.root))
          .flat()
      )
    );
    assert.deepEqual(
      [...new Set(tokens)].filter((token) => onRoot.has(token)).sort(byName),
      [SEARCH.root, ...SEARCH.writable, ...UNPUBLISHED_SEARCH_CLASSES].sort(byName),
      'a class the file spells that a rule names on the root is writable, or pinned unpublished'
    );
  });
});

describe('the search census, synthetic', () => {
  const reachingIn = (css) =>
    writtenOf(reachingOf(syntheticCensus(SEARCH, `${css} { gap: 0 }`, { spelled: new Set() })));

  for (const selector of [
    '.fabricate-manager .manager-access-roster .fabricate-search',
    '.fabricate-search.is-compact',
    '.fabricate-search:where(.is-compact) input',
    '.fabricate-search-field > .fabricate-search',
  ]) {
    it(`admits ${selector}, which a published field cannot take`, () => {
      assert.deepEqual(reachingIn(selector), []);
    });
  }

  for (const selector of [
    '.fabricate-search',
    '.fabricate .fabricate-search input',
    '.fabricate-manager .manager-unpinned-row .fabricate-search',
    '.fabricate-search:where(.is-compact, :hover) input',
    '.fabricate-search:not(.is-compact)',
  ]) {
    it(`refuses ${selector}, which nothing keeps off a published field`, () => {
      assert.deepEqual(reachingIn(selector), [`sheet.css: ${selector}`]);
    });
  }
});
