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
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

import { listSvelteComponents } from '../../scripts/lib/svelteComponentFiles.js';
import {
  attributeValueOn,
  detectShellSpreads,
  shellBindingsIn,
} from '../helpers/scopedShellSpread.js';
// EXTRACTED for issue 1372, which needs the identical reader for the four essence screens. Two
// copies of a depth-tracking splitter is the duplication SonarCloud counts, and the question both
// suites ask is one question.
import { declaredPropNames as declaredProps } from '../helpers/sveltePropsDeclaration.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const SCOPED_DIR = 'src/ui/svelte/apps/manager/scoped';
const FRAME = `${SCOPED_DIR}/EntityListInspectorFrame.svelte`;
const CATALOGUE = `${SCOPED_DIR}/EntityCatalogueShell.svelte`;
const RULES = `${SCOPED_DIR}/EntityRulesListShell.svelte`;
const SHELLS = Object.freeze([FRAME, CATALOGUE, RULES]);
// The `SYSTEM RULES n / m` panel, extracted out of the catalogue's inspector snippet at issue
// 1372 so the system Essence Rules rail could have the same one rather than a second copy. It is
// not a SHELL — it composes no frame and owns no route — but it is where the system rows and
// their membership cluster now live, so the copy-from ban has to follow them.
const ROSTER = `${SCOPED_DIR}/SystemRulesRoster.svelte`;

function sourceOf(path) {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

// The seven added by issue 1372 are all INSPECTOR COPY or LIST COPY.
//
// `countUnit`, `inspectorKicker` and `searchPlaceholder` are the noun this screen counts and
// searches, which only a lane knows; `sectionTitles`, `sectionIcons` and `extraCards` are the
// world-default cards' copy, which the prototype titles after the VALUE each default resolves to
// rather than after the section; `inspectorFoot` is the panel's one pinned primary action.
//
// None of them is a second entity-shape switch: every one is pre-localized copy or a snippet, and
// the shell still tests no `scope.entityType`.
const CATALOGUE_PROPS = [
  'actions',
  'bulk',
  // The list's lifted view-state (issue 1438), passed through to the frame. It is on BOTH
  // shells, so the difference clause below is unchanged: one composition, configured per scope.
  'browserState',
  // ── THE THREE ISSUE 1373 FEEDBACK-ROUND SEAMS ───────────────────────────────────────────────
  // `columnLead` puts a scope-wide card ABOVE the toolbar and INSIDE the list column, which is
  // the only placement that leaves the inspector running the whole route's height: the world Tool
  // catalogue drew its breakage card as a sibling of this shell, so the band spanned the
  // inspector's track too and the panel started a card's height below the app header bar.
  // `restingTitle` and `restingHint` replace a generic `Nothing selected` over the page SUBTITLE
  // — the sentence the header already prints — with the lane's own verb.
  //
  // All three default to what shipped, so the component and essence catalogues are untouched.
  'columnLead',
  'countUnit',
  // ── THE FIVE ROW-AND-INSPECTOR PARITY SWITCHES ISSUE 1373 ADDED ─────────────────────────────
  // Every one is OPT-IN and defaults to what the component and essence catalogues already
  // rendered, which is the property that let the tool catalogue reach the design without moving
  // either of them: `describeEntry` (the linked source's description, as the second rung of a
  // row's), `openEntryLabel` (the design's bordered `Edit tool` in place of a bare pen),
  // `rowSecondLine` (chips under the name instead of a description), `rowTrailing` (the row's
  // interactive trailing content, which `rowSecondLine: 'meta'` cannot hold because it renders
  // inside a `<button>`) and `systemRowAction` (navigate-only inspector system rows).
  'describeEntry',
  'emptyHint',
  'emptyTitle',
  'extraCards',
  'filters',
  'hookValue',
  'icon',
  // TWO MORE FROM ISSUE 1371's PARITY ROUND, both catalogue-only opt-outs from what shipped:
  // `showWorldDefaults` withholds the `World defaults` card stack for a lane whose reference
  // inspector has no such card, and `inspectorBodyPlacement` puts the lane's own blocks ABOVE
  // the shell's two regions for a lane whose reference draws them there.
  'inspectorBody',
  'inspectorBodyPlacement',
  'inspectorCaption',
  'inspectorFoot',
  'inspectorKicker',
  // THE LIST'S OWN TWO SEAMS (issue 1373's parity round), both opt-in and both defaulting to
  // exactly what the component and essence catalogues render: `listLead` puts a lane's
  // create-from-drop zone at the HEAD OF THE LIST, where the design draws it, instead of in a
  // band above the toolbar; `nameEntry` gives a lane a rung under the entity's own `name`, which
  // the Tool catalogue needs because a Tool's display label is optional and a blank falls back to
  // the linked Item.
  'listLead',
  'membershipFilter',
  'nameEntry',
  'onOpenEntry',
  'onOpenSystemRules',
  'onSelect',
  'openEntryLabel',
  // ── THE FOUR ISSUE 1371 r8-cat PARITY SWITCHES ─────────────────────────────────────────────
  // Every one is OPT-IN and defaults to what the essence and tool catalogues already render.
  // `openEntryLabelled` splits "what is this action called" from "is it drawn with its name on
  // it", which shipped as one question — so a lane could not title a 28px pen `Open catalogue
  // entry` without also getting a 104px labelled control. `rowNameTrailing` puts a lane's inert
  // pills on the NAME LINE, where the reference's row draws its source pill and its exception
  // flag. `rowSourceBadge` withholds the frame's own presence badge for a lane that draws a
  // richer source answer itself, so one row never carries two answers to one question.
  // `splitToolbar` draws the reference's TWO toolbar rows, leaving the filter row — the row the
  // selection band joins — where it is.
  'openEntryLabelled',
  'restingHint',
  'restingTitle',
  // The zero-member roster's sentence (issue 1371). Threaded through to `SystemRulesRoster` and
  // EMPTY by default, so the essence and tool catalogues render the roster they always did; only
  // a lane whose rows can legitimately belong to no system at all names one.
  'rosterEmptyNote',
  // ── THE FOUR ISSUE 1371 r9-cat PRIMITIVE SEAMS ─────────────────────────────────────────────
  // Every one is OPT-IN and defaults to what the essence and tool catalogues already render, and
  // every one exists because a page composes THIS shell and never the component underneath it.
  // `rosterRecessed` and `rosterSearchWell` are `SystemRulesRoster`'s two surface props, reached
  // through the inspector snippet this file owns; `rowMedallion` is the `{variant, size, glyph}`
  // descriptor for the row's leading tile; `toolbarLeadSize` is the control rung the LEAD toolbar
  // row takes, which is the reference's 38 against the filter row's retired 32.
  'rosterRecessed',
  'rosterSearchWell',
  'rowMedallion',
  'rowMeta',
  'rowNameTrailing',
  'rowSecondLine',
  'rowSourceBadge',
  'rowTrailing',
  'scope',
  'searchOf',
  'searchPlaceholder',
  'sectionIcons',
  'sectionNotes',
  'sectionTitles',
  'selectAllLabel',
  'showWorldDefaults',
  'selectedId',
  'sorts',
  'splitToolbar',
  'subtitle',
  'systemRowAction',
  'systems',
  'title',
  'toolbarLeadSize',
];

const RULES_PROPS = [
  'actions',
  'armedToken',
  'bulk',
  'browserState',
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
    assert.deepEqual([...rules].filter((name) => !catalogue.has(name)).sort(), [
      'armedToken',
      'onOpenEditor',
      'onOpenWorldEntry',
      'systemId',
      'systemName',
    ]);
    assert.deepEqual([...catalogue].filter((name) => !rules.has(name)).sort(), [
      // The seven inspector/list copy props issue 1372 added, plus the two the split always had.
      // They are catalogue-only because the rules-list shell supplies NO `inspectorBody` and so
      // renders no inspector at all: there is nothing on that screen for a kicker, a card title or
      // a pinned foot action to appear in.
      // The three feedback-round seams are catalogue-only for the same reason as the rest: two of
      // them are the INSPECTOR's copy and the rules-list shell renders no inspector, and
      // `columnLead` places a card in a column that shell's own page owns.
      'columnLead',
      'countUnit',
      // The five parity switches (issue 1373) are catalogue-only for the same reason: four of
      // them describe a ROW the rules-list shell draws differently, and `systemRowAction` names
      // an inspector system row that shell has no inspector to draw.
      'describeEntry',
      'extraCards',
      // AND THE TWO PARITY OPT-OUTS (issue 1371), catalogue-only for the same reason as the
      // rest: both are about the INSPECTOR, and the rules-list shell renders none.
      'inspectorBody',
      'inspectorBodyPlacement',
      'inspectorCaption',
      'inspectorFoot',
      'inspectorKicker',
      // AND THE TWO LIST SEAMS issue 1373's parity round added, catalogue-only for the same
      // reason: `listLead` opens a LIST the rules-list shell draws differently, and `nameEntry`
      // answers a display label the world catalogue alone has to resolve a blank for.
      'listLead',
      'membershipFilter',
      'nameEntry',
      'onOpenEntry',
      'onOpenSystemRules',
      'openEntryLabel',
      // AND THE FOUR issue 1371 r8-cat SWITCHES, catalogue-only for the reason the rest are: three
      // describe a ROW the rules-list shell draws differently, and `splitToolbar` splits a toolbar
      // whose second row is the world catalogue's membership filter.
      'openEntryLabelled',
      'restingHint',
      'restingTitle',
      // AND THE ZERO-MEMBER ROSTER SENTENCE (issue 1371), catalogue-only for the same reason as
      // `systemRowAction` above: it is the INSPECTOR's roster that would otherwise draw one dead
      // link per system in the world, and the rules-list shell has no inspector to draw it in.
      'rosterEmptyNote',
      // AND THE FOUR issue 1371 r9-cat PRIMITIVE SEAMS, catalogue-only for the reason the rest
      // are: `rosterRecessed` and `rosterSearchWell` paint the INSPECTOR's roster card, which the
      // rules-list shell has no inspector to draw; `rowMedallion` describes a ROW that shell
      // draws differently; and `toolbarLeadSize` sizes the LEAD row of the two-row toolbar only
      // the world catalogue splits.
      'rosterRecessed',
      'rosterSearchWell',
      'rowMedallion',
      'rowNameTrailing',
      'rowSecondLine',
      'rowSourceBadge',
      'rowTrailing',
      'searchPlaceholder',
      'sectionIcons',
      'sectionTitles',
      'selectAllLabel',
      'showWorldDefaults',
      'splitToolbar',
      'systemRowAction',
      'toolbarLeadSize',
    ]);
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

  // ONE SANCTIONED EXCEPTION, AND IT IS BOUNDED BY POSITION AND BY PROPS.
  //
  // The rule this suite enforces is that a shell must not re-render the frame's LIST chrome: a
  // second list pager beside the frame's is the duplication the split exists to prevent.
  //
  // The catalogue inspector's system list is a DIFFERENT COLLECTION with its own pager, and the
  // prototype draws one (`essences.png`): a search field over the systems that hold this entity,
  // five rows, and `Showing 1-5 of 13` with page arrows. It is not reachable from the frame, which
  // knows nothing about `entry.systems`, so a shell-rendered `Pagination` is the only way to have
  // it at all, and hand-rolling a pager rather than composing the primitive is the worse of the
  // two failures this file guards against.
  //
  // So the exception is CHECKED rather than waived: it must sit inside the inspector snippet, and
  // it must carry the two props that make it the inspector's rather than the list's.
  //
  // AT ISSUE 1372 THE EXCEPTION MOVED RATHER THAN BEING SPENT. `SystemRulesRoster` is that panel
  // as a component, so BOTH shells are back to zero composed chrome, and the pager is asserted on
  // the roster instead — see the two `it`s below, which together say the same thing the position
  // and prop checks used to say about the inlined copy.
  const INSPECTOR_PAGER = { [CATALOGUE]: 0, [RULES]: 0 };

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
          element === '<Pagination' ? INSPECTOR_PAGER[shell] : 0,
          `${element} is the frame's to render; a second one beside the frame is the duplication ` +
            'this split exists to prevent, and a frame-count-only assertion ships it green'
        );
      }
    });
  }

  it('the system-list pager lives on the ROSTER, and it is the inspector pager', () => {
    // The catalogue composes the panel rather than inlining it, so the shell is back to zero
    // composed chrome and the pager's own identity is asserted where it now is.
    const shell = sourceOf(CATALOGUE);
    assert.ok(
      shell.includes('<SystemRulesRoster'),
      'the catalogue composes the panel; without this the zero count above means it was deleted'
    );
    const source = sourceOf(ROSTER);
    const pager = source.indexOf('<Pagination');
    assert.ok(pager > 0, 'the roster renders the pager');
    // The PROP evidence: it walks a fixed five-row window with no page-size selector, where the
    // frame's list pager takes the browse-screen default. A pager that grew a size selector here
    // would be the list pager copied, which is what the count check alone cannot see.
    const call = source.slice(pager, source.indexOf('/>', pager));
    assert.match(call, /showPageSize=\{false\}/, 'the inspector pager offers no page size');
    assert.match(
      call,
      /pageSize=\{SYSTEM_PAGE_SIZE\}/,
      'and walks the system window, not the list'
    );
    assert.doesNotMatch(call, /onPageSizeChange/, 'so it has no size handler to wire either');
  });

  it('and BOTH essence rails reach that one panel', () => {
    // B1 (issue 1372): the reference draws `SYSTEM RULES n / m` on the world catalogue's
    // inspector AND on the system Essence Rules inspector. The second had none at all, and
    // adding it by copying the snippet is the duplication this whole file exists to prevent.
    const inspector = readFileSync(
      resolve(repoRoot, 'src/ui/svelte/apps/manager/essences/EssenceBrowserInspector.svelte'),
      'utf8'
    );
    assert.ok(inspector.includes('<SystemRulesRoster'), 'the system rules rail composes it too');
    assert.equal(
      sourceOf(ROSTER).split('<Pagination').length - 1,
      1,
      'and there is exactly ONE pager between the two of them'
    );
  });

  it('and the FRAME renders each of them, so the zero counts above are a measurement', () => {
    const frame = sourceOf(FRAME);
    for (const element of [
      '<BulkSelectionToolbar',
      '<Pagination',
      '<EmptyState',
      '<SelectionCheckbox',
    ]) {
      assert.ok(
        frame.includes(element),
        `${element} appears nowhere in the frame either, so the shells' zero counts say nothing`
      );
    }
  });
});

describe('the two file-naming gates neither shell may trip', () => {
  it('no new scoped component starts with `World` unless it is a declared entry child', () => {
    // `manager-contract.test.js` filters this directory on that prefix and asserts exactly seven
    // placeholder PAGES; an eighth `World…` file makes that count wrong unless both gates agree
    // it is a child. The world Component entry's rebuild (issue 1371, parity round 4) added
    // three, each a card or the rail rather than a route, and this list is the second half of
    // that agreement — the first is `SCOPED_ENTRY_CHILDREN` in the contract suite.
    const CHILDREN = [
      'WorldComponentEntryPreviewRail.svelte',
      'WorldComponentEntrySourceCard.svelte',
      'WorldComponentEntrySystemsCard.svelte',
    ];
    const worldFiles = readdirSync(resolve(repoRoot, SCOPED_DIR)).filter(
      (name) => name.startsWith('World') && name.endsWith('.svelte')
    );
    assert.deepEqual(
      worldFiles.filter((name) => !CHILDREN.includes(name)).length,
      7,
      'the seven placeholder pages, and nothing else'
    );
    for (const child of CHILDREN) {
      assert.ok(worldFiles.includes(child), `${child} is one of the declared children`);
    }
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
    const found = detectShellSpreads(`${IMPORT}\n<EntityCatalogueShell {...props} />`, SHELLS);
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
    assert.deepEqual(detectShellSpreads(`${ALIASED}\n<CatalogueRow {...props} />`, SHELLS), []);
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

describe('the pagination footer is fed the CLAMPED index', () => {
  // ── WHY THIS IS A SOURCE PIN AND NOT A MOUNTED ASSERTION ────────────────────────────────
  // The frame renders `Pagination` from `paginateRows`' returned index AND writes that index
  // back to its own state. The write-back is correct and it is also what makes the defect
  // invisible at rest: within one flush the frame's `pageIndex` and the returned one agree, so
  // a settled DOM cannot tell them apart. Measured — handing `Pagination` the raw `pageIndex`
  // left all 33 mounted cases green. The behaviour the CLAMP itself protects is measured in
  // the mounted suite, by shrinking the corpus under a GM sitting on a later page; this pins
  // the one thing that suite structurally cannot see.
  const FIXTURE_CLAMPED = `<Pagination
  persistent={true}
  totalCount={page.totalCount}
  pageIndex={page.pageIndex}
  onPageChange={(next) => go(next)}
/>`;
  const FIXTURE_RAW = `<Pagination
  persistent={true}
  onPageChange={(next) => go(next)}
  {pageIndex}
/>`;

  it('reads the clamped value off a fixture that has one', () => {
    assert.equal(attributeValueOn(FIXTURE_CLAMPED, 'Pagination', 'pageIndex'), 'page.pageIndex');
  });

  it('reads the SHORTHAND raw value off a fixture that has that instead', () => {
    // `{pageIndex}` is the shorthand for `pageIndex={pageIndex}` and is exactly the mutation;
    // a probe that only understood the named form would report `null` for it and pass.
    assert.equal(attributeValueOn(FIXTURE_RAW, 'Pagination', 'pageIndex'), '');
  });

  it('answers null when the component or the attribute is absent', () => {
    assert.equal(
      attributeValueOn('<Pagination persistent={true} />', 'Pagination', 'pageIndex'),
      null
    );
    assert.equal(attributeValueOn(FIXTURE_CLAMPED, 'Medallion', 'pageIndex'), null);
  });

  it('and the FRAME feeds it the returned index', () => {
    assert.equal(
      attributeValueOn(sourceOf(FRAME), 'Pagination', 'pageIndex'),
      'page.pageIndex',
      '`Pagination` computes its displayed range from the index its OWNER hands it, so a frame ' +
        'that clamped for slicing and passed its own raw state states a range the list does not ' +
        'show for the frame before the write-back lands'
    );
  });
});

describe('the host-sheet block is ADDITIVE and edits no existing rule', () => {
  // ── WHY THIS IS ASSERTED AT ALL ─────────────────────────────────────────────────────────
  // `ui-integration/spec.md` `### GM World Scoped Entity Routes` requirement 7 closes
  // `styles/fabricate.css` to the scoped-entity lanes, and voids that closure only for a seam
  // the enumeration does not name — with the reopening change's own unchanged-render evidence.
  // The frames are that evidence for what a GM sees; this is the mechanical half, and it is the
  // one a reviewer can check from the diff alone.
  const CSS_PATH = 'styles/fabricate.css';
  const STEM = 'manager-scoped-list';

  /** Every rule in the sheet, as `{ selector, index }`, comments stripped. */
  function rulesOf(css) {
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
    return [...stripped.matchAll(/([^{}]+)\{[^{}]*\}/g)].map((match) => ({
      selector: match[1].replace(/\s+/g, ' ').trim(),
      index: match.index,
    }));
  }

  it('finds the scoped-list rules at all, so the clauses below are not vacuous', () => {
    const rules = rulesOf(readFileSync(resolve(repoRoot, CSS_PATH), 'utf8'));
    assert.ok(rules.length > 500, `the rule parse found only ${rules.length} rules`);
    assert.ok(
      rules.filter((rule) => rule.selector.includes(STEM)).length >= 8,
      'the new block was not found, so "it edits no existing rule" is a sentence about nothing'
    );
  });

  it('never APPENDS a scoped-list class to the SHIPPED multi-select row group', () => {
    // THE MUTATION THIS KILLS: joining `manager-scoped-list-filter-row` onto the `.is-selection`
    // group instead of authoring a new rule.
    //
    // NARROWED TO THAT GROUP DELIBERATELY. The first version banned joining ANY selector list
    // another surface was already in, which is a permanent rule for every future lane and much
    // broader than the reasoning behind it. It is also broader than the harm: CSS specificity is
    // per selector in a comma list, so appending a fourth name to that group would not change
    // what the three studios render — the constraint is requirement 7's "edits no existing rule"
    // EVIDENCE clause, which a restated rule satisfies and a join does not.
    const css = readFileSync(resolve(repoRoot, CSS_PATH), 'utf8');
    const joined = rulesOf(css).filter(
      (rule) => rule.selector.includes('.is-selection') && rule.selector.includes(STEM)
    );
    for (const rule of joined) {
      const others = rule.selector
        .split(',')
        .map((selector) => selector.trim())
        .filter((selector) => !selector.includes(STEM));
      assert.deepEqual(
        others,
        [],
        `the scoped-list selection row joins ${others.join(' / ')}; author its own rule instead`
      );
    }
  });

  it('leaves the shipped multi-select row group naming exactly its three studios', () => {
    const css = readFileSync(resolve(repoRoot, CSS_PATH), 'utf8');
    const group = rulesOf(css).find(
      (rule) => rule.selector.includes('.is-selection') && rule.selector.includes('recipe')
    );
    assert.ok(Boolean(group), 'the shipped `.is-selection` group is gone, not merely unedited');
    assert.deepEqual(
      group.selector.split(',').map((selector) => selector.trim()),
      [
        '.fabricate-manager .manager-recipe-filter-row.is-selection',
        '.fabricate-manager .manager-component-filter-row.is-selection',
        '.fabricate-manager .manager-essence-filter-row.is-selection',
      ],
      'a fourth name here changes what the Recipe, Component and Essence Studios render'
    );
  });
});

describe('the armed token crosses the shell boundary as a binding', () => {
  // ── WHY THIS HALF IS STRUCTURAL ─────────────────────────────────────────────────────────
  // The frame's disarm is proved BEHAVIOURALLY in the mounted suite, on the catalogue, where
  // the arming control is on screen: arm a Remove, search, and the control is disarmed. The
  // rules-list shell renders no arming control at all — the cluster belongs beside the entry,
  // which for a system-scope route is the shared aside outside this shell — so the thing that
  // matters there is that the OWNER's token reaches the frame and comes back. That is a
  // binding, and a binding's write-back is not observable from a mounted target.
  //
  // Dropping the `bind:` prefix is silent: the frame still clears its own copy, the owner's
  // stays armed, and a Remove staged in the aside survives a search that re-projected the row
  // it was staged against.
  it('the frame declares it bindable and clears it', () => {
    const frame = sourceOf(FRAME);
    assert.match(frame, /armedToken = \$bindable\(''\)/);
    assert.match(frame, /if \(armedToken\) armedToken = '';/);
  });

  it('both shells BIND it through rather than passing a value', () => {
    for (const shell of [CATALOGUE, RULES]) {
      const source = sourceOf(shell);
      assert.match(source, /bind:armedToken/, `${shell} passes the token without binding it`);
      assert.equal(
        /[^:]\barmedToken=\{/.test(source),
        false,
        `${shell} passes armedToken by value somewhere, which cannot carry the write-back`
      );
    }
  });

  it('the RULES shell exposes it to its owner, and the catalogue keeps it internal', () => {
    // The asymmetry is deliberate: a rules list shares its owner's single-armed-token invariant
    // with the shared aside beside it, and a catalogue draws the only inspector on its route.
    assert.match(sourceOf(RULES), /armedToken = \$bindable\(''\)/);
    assert.equal(
      /armedToken = \$bindable\(/.test(sourceOf(CATALOGUE)),
      false,
      'nothing outside the catalogue arms anything on its route'
    );
    assert.match(sourceOf(CATALOGUE), /let armedToken = \$state\(''\)/);
  });
});

describe('no scoped shell may call copyMembership without its destination list', () => {
  // ── WHY A SOURCE BAN AND NOT ONLY A MOUNTED ASSERTION ─────────────────────────────────────
  // `copyMembership(entityId, fromSystemId, toSystemIds)` refuses BEFORE it writes when the
  // third argument is missing — `targets.length === 0` returns false — and reports nothing. So
  // a two-argument call is a button that silently does nothing on every click forever, and no
  // mounted assertion over a shell that renders no such button can see one re-appear.
  //
  // The mounted suite asserts the affordance is absent. This asserts the CALL cannot come back
  // in a form that could not work, which is the half a lane adding the source picker will edit.
  // ── WHAT THIS BAN DOES NOT REACH, RECORDED SO THE NEXT LANE KNOWS ITS EDGES ──────────────
  // Four bounds, all judged low because the mounted suppression assertion is the second half of
  // this pair and because every one of them requires writing the call in a shape nothing in this
  // directory uses:
  //
  //  1. `SHELLS` is a hand-maintained three-file list rather than a walk of `scoped/`, and that
  //     directory already holds TWELVE unscanned `.svelte` siblings — among them
  //     `MembershipActions.svelte`, which is the natural home for the copy-from control this
  //     ban is about. The reach is smaller than "the shells" reads;
  //  2. computed and aliased access — `actions['copyMembership'](a, b)`, or
  //     `const copy = actions.copyMembership` and then `copy(a, b)` — does not match;
  //  3. `withoutComments` strips from `//` to end of line unconditionally, so a URL inside a
  //     string literal sharing a line with a call would hide that call;
  //  4. an argument that is itself a string or template literal containing a top-level comma
  //     inflates the count, so a two-argument call could read as three. These arguments are ids
  //     and expressions in every shipped form.
  const CALL = /copyMembership\s*\??\.?\s*\(/g;

  /**
   * `source` with every comment removed.
   *
   * MEASURED NECESSARY, not defensive. The first version of this scanned the raw text and found
   * the THREE-argument example inside the catalogue's own docblock — `copyMembership(entityId,
   * fromSystemId, toSystemIds)` — before the two-argument call injected below it, and passed.
   * A gate that reads a file's prose as if it were its code is the vacuous-matcher shape.
   *
   * @param {string} source
   * @returns {string}
   */
  function withoutComments(source) {
    return source
      .replaceAll(/<!--[\s\S]*?-->/g, '')
      .replaceAll(/\/\*[\s\S]*?\*\//g, '')
      .replaceAll(/\/\/[^\r\n]*/g, '');
  }

  /**
   * The argument list of EVERY `copyMembership(` call in `source`, each split at top level.
   *
   * Every call rather than the first: a shell with a correct call and a silent one beside it is
   * exactly the state a lane adding the source picker could reach.
   *
   * @param {string} source
   * @returns {string[][]} one argument list per call; empty when there is none
   */
  function copyMembershipCalls(source) {
    const code = withoutComments(source);
    const calls = [];
    CALL.lastIndex = 0;
    let match = CALL.exec(code);
    while (match) {
      const args = argsFrom(code, match.index + match[0].length - 1);
      if (args) calls.push(args);
      match = CALL.exec(code);
    }
    return calls;
  }

  /**
   * Split one parenthesised argument list starting at `open`.
   *
   * @param {string} source
   * @param {number} open index of the `(`
   * @returns {string[]|null}
   */
  function argsFrom(source, open) {
    let depth = 0;
    let current = '';
    const args = [];
    for (let cursor = open; cursor < source.length; cursor += 1) {
      const character = source[cursor];
      if ('([{'.includes(character)) depth += 1;
      else if (')]}'.includes(character)) {
        depth -= 1;
        if (depth === 0) {
          args.push(current);
          return args.map((entry) => entry.trim()).filter((entry) => entry !== '');
        }
      }
      if (character === ',' && depth === 1) {
        args.push(current);
        current = '';
      } else if (!(depth === 1 && current === '' && character === '(')) current += character;
    }
    return null;
  }

  it('reads a THREE-argument call off a fixture that has one', () => {
    const fixture = `onCopyFrom={() => actions?.copyMembership?.(entry.id, source, [row.systemId])}`;
    assert.deepEqual(copyMembershipCalls(fixture), [['entry.id', 'source', '[row.systemId]']]);
  });

  it('reads a TWO-argument call off a fixture that has one, which is the defect shape', () => {
    const fixture = `onCopyFrom={() => actions?.copyMembership?.(entry.id, row.systemId)}`;
    assert.deepEqual(copyMembershipCalls(fixture), [['entry.id', 'row.systemId']]);
  });

  it('IGNORES a call written in prose, which is what a raw scan reads first', () => {
    // The catalogue's own docblock spells the signature out. A scanner that saw it would report
    // a well-formed three-argument call and pass over a silent one on the next line.
    const prose = [
      '/**',
      ' * `copyMembership(entityId, fromSystemId, toSystemIds)` needs a SOURCE.',
      ' */',
      '<!-- copyMembership(a, b, c) -->',
      '// copyMembership(a, b, c)',
      'const x = 1;',
    ].join('\n');
    assert.deepEqual(copyMembershipCalls(prose), []);
    assert.deepEqual(
      copyMembershipCalls(`${prose}
actions.copyMembership(entry.id, row.systemId);`),
      [['entry.id', 'row.systemId']],
      'and the real call below the prose is still found'
    );
  });

  it('finds EVERY call, not just the first', () => {
    const both = ['actions.copyMembership(a, b, [c]);', 'actions.copyMembership(d, e);'].join('\n');
    assert.equal(copyMembershipCalls(both).length, 2);
  });

  /**
   * EVERY `.svelte` under `apps/manager/`, recursively - which is what this ban now scans.
   *
   * -- THE THREE-FILE LIST WAS THE FIRST OF THIS SCAN'S OWN RECORDED BOUNDS (issue 1371) ----
   * `SHELLS` is hand-maintained, and `scoped/` alone already held twelve unscanned siblings -
   * among them `MembershipActions.svelte`, which is the natural home for the very control this
   * ban is about. Widening it also brings in the ONE real three-argument call site in the
   * repository, which is what makes the scan a measurement rather than an empty set: with the
   * narrow list it examined four files and found zero calls, so raising the expected argument
   * count to a value NO call could satisfy would still have passed.
   *
   * @returns {string[]} repo-relative paths.
   */
  function everyManagerComponent() {
    const managerDir = 'src/ui/svelte/apps/manager';
    const walk = (relative) =>
      readdirSync(resolve(repoRoot, relative), { withFileTypes: true }).flatMap((entry) => {
        const child = `${relative}/${entry.name}`;
        if (entry.isDirectory()) return walk(child);
        return entry.name.endsWith('.svelte') ? [child] : [];
      });
    return walk(managerDir);
  }

  it('THE SCAN IS NOT VACUOUS: it reaches beyond the shells and finds a real call', () => {
    const scanned = everyManagerComponent();
    assert.ok(
      scanned.length > SHELLS.length + 1,
      `the widened walk resolved ${scanned.length} manager components, against the ` +
        `${SHELLS.length + 1} the narrow list named`
    );
    // AND IT FINDS THE ONE REAL CALL SITE. `EssenceEditView`'s copy card is the only shipped
    // three-argument `copyMembership` call in the repository, and it lives outside `scoped/`
    // entirely - so a scan that missed it is a scan that could not fail.
    const withCalls = scanned.filter((path) => copyMembershipCalls(sourceOf(path)).length > 0);
    assert.deepEqual(
      withCalls,
      ['src/ui/svelte/apps/manager/EssenceEditView.svelte'],
      'exactly one manager component calls copyMembership today, and the scan reaches it'
    );
  });

  it('no manager component calls it with fewer than three arguments', () => {
    for (const path of everyManagerComponent()) {
      for (const args of copyMembershipCalls(sourceOf(path))) {
        assert.equal(
          args.length,
          3,
          `${path} calls copyMembership with ${args.length} argument(s): ${args.join(' | ')}. ` +
            'The write path needs (entityId, fromSystemId, toSystemIds) and refuses before it ' +
            'writes without the third, reporting nothing.'
        );
      }
    }
    // …and the affordance itself is suppressed, which is what the mounted suite measures. Stated
    // here too so the two halves cannot drift: a lane that renders the button must also wire the
    // call, and a lane that wires the call must render the button.
    // The suppression moved WITH the rows it governs: the panel that renders `MembershipActions`
    // is `SystemRulesRoster`, and it states the refusal as a literal rather than as a function
    // whose body a future lane could widen without noticing.
    assert.match(
      sourceOf(ROSTER),
      /copyable=\{false\}/,
      'the roster must suppress copy-from while no screen has a source chooser'
    );
    assert.ok(
      sourceOf(ROSTER).includes('<MembershipActions'),
      'NON-VACUITY: it is the panel that renders the cluster copy-from would live in'
    );
  });
});

/**
 * THE ROSTER'S TWO SURFACE DECISIONS ARE OPT-IN (issue 1371, parity round 5, reviewer finding 7).
 *
 * `SystemRulesRoster` is composed by six screens — the three world catalogues and the three system
 * rules rails. Round 4 landed a parity finding raised against the world COMPONENT catalogue as two
 * UNCONDITIONAL declarations in this file's scoped block: the card's `--fab-bg-0` recess and a
 * lifted `--fab-bg-1` well behind its search input. Both therefore repainted the merged world
 * Essence catalogue and the world Tool catalogue too, which are two other lanes' approved screens.
 *
 * The standing rule is that a shared primitive which has to behave differently at a second site
 * takes a PROP, and this file already has three of them (`rosterEmptyNote`, and the shells'
 * `showWorldDefaults` / `inspectorBodyPlacement`). So the two become `recessed` and `searchWell`,
 * defaulting to the surface those screens rendered BEFORE this work.
 *
 * WHAT THESE ASSERTIONS ARE FOR, given a mounted render proves the classes appear and disappear:
 * they pin the DEFAULT and the SELECTOR. A prop that defaulted to `true` would satisfy every
 * class-emission assertion while repainting all six screens, and a rule still written against
 * `.manager-scoped-roster-search` — the class every caller passes — would satisfy the prop
 * assertions while doing exactly what round 4 did.
 */
describe('the system-rules roster states its surfaces as opt-in props', () => {
  const SURFACE_PROPS = ['recessed', 'searchWell'];

  it('declares both, and defaults both to OFF', () => {
    const source = sourceOf(ROSTER);
    const declared = declaredProps(source);
    for (const prop of SURFACE_PROPS) {
      assert.ok(declared.includes(prop), `the roster declares \`${prop}\``);
      assert.match(
        source,
        new RegExp(String.raw`\n\s*${prop} = false,`),
        `and \`${prop}\` defaults to false, so five other screens are unchanged by a finding raised against one`
      );
    }
  });

  it('gates the recess on its own class rather than on the card', () => {
    const source = sourceOf(ROSTER);
    assert.match(
      source,
      /class:is-recessed=\{recessed\}/,
      'the card takes a state class from the prop'
    );
    assert.match(
      source,
      /\.manager-scoped-roster-card\.is-recessed \{\s*background: var\(--fab-bg-0\);/,
      'and the recess is stated on that class'
    );
    // The one that matters: the BASE card rule must state no fill at all, or the opt-in is
    // decoration over a repaint that already happened.
    const base = source.slice(
      source.indexOf('.manager-scoped-roster-card {'),
      source.indexOf('}', source.indexOf('.manager-scoped-roster-card {'))
    );
    assert.ok(
      !/background:/.test(base),
      'an unrecessed card states no fill and takes the pane’s, which is what it did before this work'
    );
  });

  it('gates the search well on a SECOND class, not on the one every caller passes', () => {
    const source = sourceOf(ROSTER);
    assert.match(
      source,
      /manager-scoped-roster-search manager-scoped-roster-search-well/,
      'the well is a second class appended beside the shared one'
    );
    assert.match(
      source,
      /:global\(\.manager-search\.manager-scoped-roster-search-well input\)/,
      'and the surface rule is selected on it'
    );
    // Round 4's exact spelling, as a negative: a `background`, `border` or `border-radius` written
    // against the SHARED class is the finding, whatever else this file also declares. The sizing
    // rules that legitimately use it state a height and nothing else.
    const shared = [
      ...source.matchAll(
        /:global\(\.manager-search\.manager-scoped-roster-search(?![\w-])[^)]*\)\s*\{([^}]*)\}/g
      )
    ].map(([, body]) => body);
    assert.ok(shared.length >= 2, 'NON-VACUITY: the shared class still has rules of its own');
    for (const body of shared) {
      assert.ok(
        !/(?:^|;|\n)\s*(?:background|border|border-radius)\s*:/.test(body),
        `a rule on the shared class states a surface, which reaches all six screens: ${body.trim()}`
      );
    }
  });
});

/**
 * THE SEAM BETWEEN THE SHELL AND THE PRIMITIVES BELOW IT (issue 1371 r9-cat).
 *
 * Three opt-ins the world Component catalogue turns on live on components a PAGE never composes:
 * `SystemRulesRoster`'s two surface props are reached only through the shell's own inspector
 * snippet, and the frame's row medallion and lead-row rung are reached only through the shell's
 * own frame tag. So the shell declaring the prop and the shell FORWARDING it are two different
 * facts, and a declared-but-unforwarded prop is the exact failure that reads as green: the page
 * passes it, nothing throws, and the screen renders the default it always did.
 *
 * `declaredProps` above pins the first fact. This pins the second, and it pins the DEFAULTS with
 * it — a `recessed`/`searchWell` pair defaulting to `true` would forward correctly and repaint
 * five other screens.
 */
describe('the catalogue shell FORWARDS what it declares', () => {
  const shell = () => sourceOf(CATALOGUE);

  it('hands the roster its two surface props, renamed at the boundary', () => {
    const source = shell();
    // Renamed on the way in — `rosterRecessed` / `rosterSearchWell` — because a shell prop named
    // `recessed` says nothing about WHAT is recessed on a component that also owns a list, a
    // toolbar and an inspector. The roster's own names stay its own.
    assert.match(source, /\n\s*rosterRecessed = false,/, 'declared, and OFF by default');
    assert.match(source, /\n\s*rosterSearchWell = false,/, 'declared, and OFF by default');
    assert.match(
      source,
      /recessed=\{rosterRecessed\}/,
      'and the roster tag is handed the value rather than a literal'
    );
    assert.match(source, /searchWell=\{rosterSearchWell\}/, 'likewise for the search well');
  });

  it('hands the frame the row medallion and the lead-row rung', () => {
    const source = shell();
    assert.match(source, /\n\s*toolbarLeadSize = '',/, 'declared, and the shipped rung by default');
    assert.match(source, /\n\s*rowMedallion = null,/, 'declared, and the shipped tile by default');
    // Shorthand `{name}`, which is how every other pass-through on this tag is written.
    assert.match(source, /\{toolbarLeadSize\}/, 'and forwarded to the frame');
    assert.match(source, /\{rowMedallion\}/, 'and forwarded to the frame');
  });

  it('and the FRAME spends them on the two elements they name', () => {
    const source = sourceOf(FRAME);
    assert.match(
      source,
      /<ManagerSearchField\b[\s\S]{0,200}?size=\{toolbarLeadSize\}/,
      'the search field takes the rung as its own `size` prop'
    );
    assert.match(
      source,
      /class=\{leadSelectSizeClass\(filter\)\}/,
      'a lane-filter select takes the rung as a class, because the manager has no select component'
    );
    assert.match(
      source,
      /variant=\{rowMedallionSpec\.variant\}[\s\S]{0,120}?size=\{rowMedallionSpec\.size\}[\s\S]{0,120}?glyph=\{rowMedallionSpec\.glyph\}/,
      'and the ROW medallion takes all three of the descriptor’s arguments'
    );
  });

  it('the select rung is UNDEFINED when unset, never an empty class attribute', () => {
    const source = sourceOf(FRAME);
    // The whole reason `leadSelectSizeClass` is a function and not a `class:` directive. A
    // directive writes the attribute whatever the value is, so every other catalogue's three
    // selects would go from no `class` at all to `class=""` — a real DOM change on five screens
    // shipped as an opt-in that "defaults to off".
    assert.match(
      source,
      /return toolbarLeadSize === '38' && onLeadRow \? 'is-size-38' : undefined;/,
      'the unset branch answers undefined, which Svelte drops'
    );
    assert.ok(
      !/class:is-size-38=/.test(source),
      'and no `class:` directive writes the token, which would emit class="" when off'
    );
  });

  it('the rung reaches the LEAD row only, so the retired 32px row keeps the ladder’s 34', () => {
    const source = sourceOf(FRAME);
    // `proto:582`-`585` draws the membership select, the sort select and the direction toggle at
    // 32 — a RETIRED rung — so D-C puts them on 34 and this prop must not reach them. The guard
    // is the row test inside the helper: without it, one prop would take all five controls.
    assert.match(
      source,
      /const onLeadRow = \(filter\?\.toolbarRow \?\? 'lead'\) === 'lead';/,
      'the helper decides on the descriptor’s ROW'
    );
    // The sort select is written by the frame itself, outside the lane-filter snippet, and it
    // must not acquire the token: `proto:583` draws it on the filter row. Sliced from the tag
    // that OPENS it — searching backwards from its own hook — so the assertion reads the element
    // and not the whole file.
    const hook = source.indexOf('data-scoped-list-sort\n');
    assert.ok(hook > 0, 'NON-VACUITY: the sort select is still written by this frame');
    const sortSelect = source.slice(source.lastIndexOf('<select', hook), hook);
    assert.match(sortSelect, /value=\{sortKey\}/, 'and the slice is that element');
    assert.ok(!/is-size-38/.test(sortSelect), 'and it carries no 38px token');
  });
});

/**
 * THE IMPORT-FREE LEAF, PINNED (issue 1371 r9-cat).
 *
 * `componentScoped.js` is imported by `ComponentEditView.svelte`, and every mounted suite that
 * renders that view copies the manager's compiled module graph into a hand-rolled tree file by
 * file. A module this leaf imports is a module EVERY such manifest must carry, and an omission
 * there is reported as `# cancelled`, never as `# fail` — a hang with no message, four suites
 * away from the edit that caused it.
 *
 * That is not a hypothesis. This module briefly imported `utils/browserPagination.js` for one
 * bulk-panel helper and cancelled 105 tests across four suites. The allowlist below is therefore
 * a hand-maintained mirror of a closure no single suite can see, and this test is what stops it
 * rotting: every entry must resolve to a real tracked file, and nothing outside it may be
 * imported.
 */
describe('componentScoped.js stays the import-free leaf its consumers assume', () => {
  const LEAF = `${SCOPED_DIR}/componentScoped.js`;
  // The ONE import this leaf may hold. It is itself import-free, and it is already in every
  // manifest that carries this file.
  const ALLOWED = ['src/utils/componentCategories.js'];

  function importedPaths() {
    const source = sourceOf(LEAF);
    const dir = resolve(repoRoot, SCOPED_DIR);
    return [...source.matchAll(/^import\s[^'"]*from\s*'([^']+)';/gm)].map(([, specifier]) =>
      relative(repoRoot, resolve(dir, specifier)).split(sep).join('/')
    );
  }

  it('resolves every allowlisted entry to a real file, so the list cannot rot into prose', () => {
    for (const path of ALLOWED) {
      assert.ok(
        existsSync(resolve(repoRoot, path)),
        `the allowlist names a file that exists: ${path}`
      );
    }
  });

  it('imports NOTHING outside the allowlist', () => {
    const imported = importedPaths();
    assert.ok(imported.length > 0, 'NON-VACUITY: the reader finds this file’s imports at all');
    const strays = imported.filter((path) => !ALLOWED.includes(path));
    assert.deepEqual(
      strays,
      [],
      'a new import here has to be added to every mounted manifest that renders ComponentEditView, ' +
        'and an omission is reported as `# cancelled` rather than `# fail`. Put the dependency ' +
        'beside its caller instead — `componentBulkPickerPage` lives in ' +
        'ComponentCatalogueBulkPanel.svelte for exactly this reason.'
    );
  });

  it('and the paginated bulk helper is where the move put it', () => {
    // Read off the IMPORT LIST rather than off the raw text: the leaf's own header records the
    // regression by name, and a substring scan would read that explanation as the defect.
    assert.ok(
      !importedPaths().some((path) => path.endsWith('browserPagination.js')),
      'the leaf imports no pagination module — the regression this pin exists for'
    );
    const panel = sourceOf(`${SCOPED_DIR}/ComponentCatalogueBulkPanel.svelte`);
    assert.match(
      panel,
      /import \{ paginateRows \} from '\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/utils\/browserPagination\.js';/,
      'the catalogue bulk panel holds it instead, inside the catalogue harness’s own closure'
    );
    assert.match(
      panel,
      /function componentBulkPickerPage\(/,
      'and the helper moved with the import rather than the import being duplicated'
    );
  });
});

/**
 * BOTH REMOVE SENTENCES DISCLOSE THE RECIPE CASCADE (issue 1371 r9-cat, lane STORE's disclosure).
 *
 * Removing a component from a system is not a membership edit. `adminStore`'s
 * `_dropInSystemComponent` runs the in-system delete through `deleteComponents`, which repairs
 * every reference, DISABLES the recipes left without a usable ingredient set or result, cleans up
 * salvage and reconciles alchemy. Both sentences named only the overrides and then reassured the
 * GM that the world record was untouched — the safe half of the truth, told without the
 * consequential half, on the two controls that fire that cascade.
 *
 * PINNED AS COPY RATHER THAN AS A RENDER, because the two live on different screens (the bulk
 * panel's `Remove from` note and the entry's per-system row) and neither suite can see the other.
 * What can rot is the sentence, and it rots identically in both places.
 *
 * NOTE FOR WHOEVER READS THIS NEXT: `Scoped.Membership.RemoveConsequence` has TWO consumers, not
 * one — `WorldComponentEntrySystemsCard.svelte` and the shared `MembershipActions.svelte`, which
 * the ESSENCE screens render as well. The cascade is real for components and is NOT reproduced by
 * the essence path (`_dropInSystemEssence` filters `essenceDefinitions` and writes, with no
 * reference repair and no recipe disable), so the shared key now says something of essences that
 * their own store does not do. Making it accurate needs either a scope-specific key on the entry
 * card or a scope-aware note prop on `MembershipActions`; neither file is this lane's, and the
 * collision is recorded here rather than resolved silently.
 */
describe('the two remove sentences disclose what removal actually does', () => {
  const lang = JSON.parse(readFileSync(resolve(repoRoot, 'lang/en.json'), 'utf8'));
  const scoped = lang.FABRICATE.Admin.Manager.Scoped;

  const CASCADE = [
    /rewrites every recipe/,
    /disables any recipe left without a usable ingredient set or result/,
  ];

  it('the bulk panel’s `Remove from` note names the rewrite and the disable', () => {
    const note = scoped.Component.BulkRemoveNote;
    assert.ok(typeof note === 'string' && note.length > 0, 'NON-VACUITY: the key resolves');
    for (const clause of CASCADE) assert.match(note, clause);
    assert.match(note, /The world record is untouched, and no other system changes\./);
  });

  it('and the per-system row says the same thing in the singular', () => {
    const note = scoped.Membership.RemoveConsequence;
    assert.ok(typeof note === 'string' && note.length > 0, 'NON-VACUITY: the key resolves');
    for (const clause of CASCADE) assert.match(note, clause);
    assert.match(note, /\{entity\}/, 'and it still interpolates both of its own tokens');
    assert.match(note, /\{system\}/);
  });

  it('neither one still stops at the overrides, which is the finding', () => {
    // The exact spelling both carried, as a negative: a sentence that names only what is NOT
    // written is the one this pin exists to keep out.
    for (const note of [scoped.Component.BulkRemoveNote, scoped.Membership.RemoveConsequence]) {
      assert.doesNotMatch(note, /Its overrides go with it/);
      assert.doesNotMatch(note, /loses its rules in each chosen system/);
    }
  });

  it('and the shared key’s SECOND consumer is still there, so the note above is not stale', () => {
    // The whole point of the recorded collision: if this ever stops matching, the essence
    // overclaim is gone and the note in this block's header should go with it.
    const shared = sourceOf(`${SCOPED_DIR}/MembershipActions.svelte`);
    assert.match(
      shared,
      /FABRICATE\.Admin\.Manager\.Scoped\.Membership\.RemoveConsequence/,
      'MembershipActions still reads the shared key, so essence rows still read this sentence'
    );
  });
});
