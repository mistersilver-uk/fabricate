/**
 * The SOURCE-level contract of the three scoped-entity list shells (issue 1380, epic 1357).
 *
 * Three questions a mounted render cannot answer, because each is about what the files DO NOT
 * contain:
 *
 *  - the declared prop set of each shell, pinned to a literal, so a lane that needs one more
 *    prop adds it here as well and a lane that quietly drops one is caught;
 *  - that no chrome is INLINED into a shell. Each contains exactly one frame element and exactly
 *    ZERO of each composed primitive, pinned by equality rather than by absence: a criterion that
 *    only counted the frame ships a shell carrying a second `<Pagination>` beside it green, and
 *    that is the 93-of-98 shape this whole PR exists to avoid;
 *  - that no `.svelte` in the repository SPREADS an identifier into a shell. Every shell prop is
 *    defaulted, so a spread turns a misspelled key into a silent default rather than an error.
 *
 * ── THE DETECTOR IS PROVED BEFORE IT IS APPLIED ───────────────────────────────────────────────
 * The real call-site set is EMPTY of spreads today, so a broken detector and a clean repository
 * are indistinguishable — a `() => false` would report exactly the same green. It is therefore a
 * pure exported function in `tests/helpers/scopedShellSpread.js`, exercised against inline
 * positive and negative fixtures first, and only then run over the tree.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { listSvelteComponents } from '../../scripts/lib/svelteComponentFiles.js';
import { detectShellSpreads, shellBindingsIn } from '../helpers/scopedShellSpread.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const SCOPED_DIR = 'src/ui/svelte/apps/manager/scoped';
const FRAME = `${SCOPED_DIR}/EntityListInspectorFrame.svelte`;
const CATALOGUE = `${SCOPED_DIR}/EntityCatalogueShell.svelte`;
const RULES = `${SCOPED_DIR}/EntityRulesListShell.svelte`;
const SHELLS = Object.freeze([FRAME, CATALOGUE, RULES]);

function sourceOf(path) {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

/**
 * The prop names a component's single `$props()` destructure declares.
 *
 * A `...rest` key is reported as the literal `...rest`, so a destructure that opened itself up to
 * arbitrary keys fails the set equality rather than passing under the name it collected them
 * into.
 *
 * @param {string} source
 * @returns {string[]} sorted
 */
function declaredProps(source) {
  const start = source.indexOf('let {');
  const end = source.indexOf('} = $props();', start);
  assert.ok(start !== -1 && end > start, 'no `let { … } = $props()` destructure found');
  const body = source.slice(start + 'let {'.length, end);
  const names = [];
  let depth = 0;
  let current = '';
  for (const character of body) {
    if ('([{`'.includes(character)) depth += 1;
    else if (')]}`'.includes(character)) depth = Math.max(0, depth - 1);
    if (character === ',' && depth === 0) {
      names.push(current);
      current = '';
    } else current += character;
  }
  names.push(current);
  return names
    .map((entry) => entry.replace(/\/\/[^\n]*/g, '').trim())
    .filter(Boolean)
    .map((entry) => (entry.startsWith('...') ? entry : entry.split(/[=:]/)[0].trim()))
    .filter(Boolean)
    .sort();
}

const CATALOGUE_PROPS = [
  'actions',
  'bulk',
  'emptyHint',
  'emptyTitle',
  'filters',
  'hookValue',
  'icon',
  'inspectorBody',
  'onOpenEntry',
  'onSelect',
  'rowMeta',
  'scope',
  'searchOf',
  'sectionNotes',
  'selectedId',
  'sorts',
  'subtitle',
  'systems',
  'title',
];

const RULES_PROPS = [
  'actions',
  'armedToken',
  'bulk',
  'emptyHint',
  'emptyTitle',
  'filters',
  'hookValue',
  'icon',
  'onOpenEditor',
  'onOpenWorldEntry',
  'onSelect',
  'rowMeta',
  'scope',
  'searchOf',
  'sectionNotes',
  'selectedId',
  'sorts',
  'subtitle',
  'systemId',
  'systemName',
  'systems',
  'title',
];

describe('the shells declare the pinned prop sets', () => {
  it('finds a non-empty destructure in each shell first', () => {
    // NON-VACUITY. A parse that found nothing would satisfy neither equality below by accident —
    // it would throw — but it would also throw on a rename, so the count is stated separately to
    // say what "found" means.
    for (const path of SHELLS) {
      assert.ok(declaredProps(sourceOf(path)).length > 5, `${path} declares almost no props`);
    }
  });

  it('EntityCatalogueShell declares exactly its pinned set', () => {
    assert.deepEqual(declaredProps(sourceOf(CATALOGUE)), [...CATALOGUE_PROPS].sort());
  });

  it('EntityRulesListShell declares exactly its pinned set', () => {
    assert.deepEqual(declaredProps(sourceOf(RULES)), [...RULES_PROPS].sort());
  });

  it('differs from the catalogue by exactly the four system-scope props and the two it drops', () => {
    // Stated as a DIFFERENCE rather than as two independent lists, because the reason the two
    // sets are nearly identical is the point: one composition, configured per scope.
    const catalogue = new Set(CATALOGUE_PROPS);
    const rules = new Set(RULES_PROPS);
    assert.deepEqual(
      [...rules].filter((name) => !catalogue.has(name)).sort(),
      ['armedToken', 'onOpenEditor', 'onOpenWorldEntry', 'systemId', 'systemName']
    );
    assert.deepEqual(
      [...catalogue].filter((name) => !rules.has(name)).sort(),
      ['inspectorBody', 'onOpenEntry']
    );
  });
});

describe('no chrome is inlined into a shell', () => {
  const COMPOSED = [
    '<BulkSelectionToolbar',
    '<Pagination',
    '<BulkEditPanelShell',
    '<EmptyState',
    '<SelectionCheckbox',
  ];

  for (const shell of [CATALOGUE, RULES]) {
    it(`${shell.split('/').pop()} renders exactly one frame and none of the composed chrome`, () => {
      const source = sourceOf(shell);
      // POSITIVE FIRST: an empty or renamed file satisfies every `=== 0` below.
      assert.ok(source.length > 0, 'the shell source is empty');
      assert.ok(source.split('\n').length > 40, 'the shell is too short to be the real file');
      assert.equal(
        source.split('<EntityListInspectorFrame').length - 1,
        1,
        'a shell composes the frame exactly once and never inlines it'
      );
      for (const element of COMPOSED) {
        assert.equal(
          source.split(element).length - 1,
          0,
          `${element} is the frame's to render; a second one beside the frame is the duplication ` +
            'this split exists to prevent, and a frame-count-only assertion ships it green'
        );
      }
    });
  }

  it('and the FRAME renders each of them, so the zero counts above are a measurement', () => {
    const frame = sourceOf(FRAME);
    for (const element of ['<BulkSelectionToolbar', '<Pagination', '<EmptyState', '<SelectionCheckbox']) {
      assert.ok(
        frame.includes(element),
        `${element} appears nowhere in the frame either, so the shells' zero counts say nothing`
      );
    }
  });
});

describe('the two file-naming gates neither shell may trip', () => {
  it('no new scoped component starts with `World`', () => {
    // `manager-contract.test.js` filters this directory on that prefix and asserts exactly seven
    // placeholder pages; an eighth `World…` file makes that count wrong.
    const worldFiles = readdirSync(resolve(repoRoot, SCOPED_DIR)).filter(
      (name) => name.startsWith('World') && name.endsWith('.svelte')
    );
    assert.equal(worldFiles.length, 7, 'the seven placeholder pages, and nothing else');
  });

  it('no shell carries a literal route hook attribute', () => {
    // `manager-scoped-prop-contract.test.js` builds its route→page map from these two attribute
    // NAMES, matched literally, and asserts no route is owned twice. A shell wearing one would
    // claim a route a page already owns.
    for (const path of SHELLS) {
      const source = sourceOf(path);
      assert.equal(/pageId="/.test(source), false, `${path} declares a literal pageId`);
      assert.equal(
        /data-scoped-page="/.test(source),
        false,
        `${path} declares a literal data-scoped-page`
      );
    }
    // …and the hook they DO carry is a bound value, so the regex above cannot match it.
    assert.match(sourceOf(CATALOGUE), /data-scoped-list=\{hookValue\}/);
    assert.match(sourceOf(RULES), /data-scoped-rules-list=\{hookValue\}/);
  });
});

describe('the spread detector, proved against fixtures before it is applied', () => {
  const IMPORT = `import EntityCatalogueShell from './EntityCatalogueShell.svelte';`;
  const ALIASED = `import Catalogue from '../scoped/EntityCatalogueShell.svelte';`;

  it('DETECTS a spread at a directly-named call site', () => {
    const found = detectShellSpreads(
      `${IMPORT}\n<EntityCatalogueShell {...props} />`,
      SHELLS
    );
    assert.equal(found.length, 1);
    assert.equal(found[0].binding, 'EntityCatalogueShell');
  });

  it('DETECTS a spread through an ALIASED import, which a literal tag match would miss', () => {
    const found = detectShellSpreads(`${ALIASED}\n<Catalogue {...props} />`, SHELLS);
    assert.equal(found.length, 1, 'binding resolution is what makes the ban survive a rename');
    assert.equal(found[0].binding, 'Catalogue');
  });

  it('does NOT detect a named-prop call site', () => {
    assert.deepEqual(
      detectShellSpreads(`${IMPORT}\n<EntityCatalogueShell scope={scope} />`, SHELLS),
      []
    );
  });

  it('reaches past an arrow function in an earlier attribute', () => {
    // A naive `<Binding[^>]*` scan stops at the `>` inside `=>` and reports no spread on a tag
    // that has one. Every real call site carries at least one handler.
    const call = `${IMPORT}\n<EntityCatalogueShell\n  onSelect={(id) => go(id)}\n  {...rest}\n/>`;
    assert.equal(detectShellSpreads(call, SHELLS).length, 1);
  });

  it('does not confuse a longer tag name for the binding', () => {
    assert.deepEqual(
      detectShellSpreads(`${ALIASED}\n<CatalogueRow {...props} />`, SHELLS),
      []
    );
  });

  it('resolves a binding only for an import of one of the three shells', () => {
    assert.deepEqual(shellBindingsIn(`${IMPORT}`, SHELLS), ['EntityCatalogueShell']);
    assert.deepEqual(
      shellBindingsIn(`import Chip from '../Chip.svelte';`, SHELLS),
      [],
      'an unrelated import must not arm the ban'
    );
  });

  it('finds NO spread anywhere in the repository, over a NON-EMPTY call-site set', () => {
    const components = listSvelteComponents(resolve(repoRoot, 'src'));
    const callSites = [];
    const offenders = [];
    for (const absolute of components) {
      const source = readFileSync(absolute, 'utf8');
      const relative = absolute.replaceAll('\\', '/').split('/src/')[1];
      if (shellBindingsIn(source, SHELLS).length > 0) callSites.push(`src/${relative}`);
      for (const hit of detectShellSpreads(source, SHELLS)) {
        offenders.push(`src/${relative}: <${hit.binding} … {…spread}`);
      }
    }
    // The call-site set is what makes the `=== 0` a measurement. Today it is the two shells,
    // which both compose the frame by name.
    assert.ok(
      callSites.length >= 2,
      `only ${callSites.length} file(s) reference a shell, so the ban below is applied to almost ` +
        'nothing and would stay green with the detector removed'
    );
    assert.equal(offenders.length, 0, offenders.join('\n'));
  });
});
