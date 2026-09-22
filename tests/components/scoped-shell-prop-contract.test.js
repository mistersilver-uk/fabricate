/** The SOURCE-level contract of the three scoped-entity list shells (issue 1380, epic 1357). */
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
// The `SYSTEM RULES n / m` panel.
const ROSTER = `${SCOPED_DIR}/SystemRulesRoster.svelte`;

function sourceOf(path) {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

// The seven added by issue 1372 are all INSPECTOR COPY or LIST COPY.
const CATALOGUE_PROPS = [
  'actions',
  // THE FIRST-ROW AUTO-SELECTION (issue 1371 r13-cat, maintainer ruling M14). OPT-IN and OFF by
  // default: with it unset the frame opens on a resting inspector exactly as it always did, so
  // the essence catalogue is byte-identical; the world Component and Tools catalogues turn it
  // on. It is the shell's because a page composes the shell and never the frame.
  'autoSelectFirst',
  'bulk',
  // THE FLUSH LIST COLUMN (issue 1371 r16-cat, maintainer ruling M21). OPT-IN and OFF by default:
  'flushColumn',
  // THE BULK DOCK TO THE INSPECTOR'S EDGES (issue 1371 r16-cat, maintainer ruling M24). OPT-IN and
  // OFF by default: with it unset the inspector column pads itself and the bulk panel's scroller
  // clips the shell's dock at that inset, exactly as it always did; the world Component catalogue
  // turns it on, the column hands its inset to the bulk scroller, and the shell's `space-4` bleed
  // reaches the column's edges. Catalogue-only for the reason `flushColumn` is.
  'flushBulkDock',
  // The list's lifted view-state (issue 1438).
  'browserState',
  // ── THE THREE ISSUE 1373 FEEDBACK-ROUND SEAMS ───────────────────────────────────────────────
  // `columnLead` puts a scope-wide card ABOVE the toolbar and INSIDE the list column, which is
  // the only placement that leaves the inspector running the whole route's height: the world Tool
  // catalogue drew its breakage card as a sibling of this shell, so the band spanned the
  // inspector's track too and the panel started a card's height below the app header bar.
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
  'inspectorBody',
  'inspectorBodyPlacement',
  'inspectorCaption',
  'inspectorFoot',
  'inspectorKicker',
  // THE LIST'S OWN TWO SEAMS (issue 1373's parity round).
  'listLead',
  'membershipFilter',
  'nameEntry',
  'onOpenEntry',
  'onOpenSystemRules',
  'onSelect',
  'openEntryLabel',
  // ── THE FOUR ISSUE 1371 r8-cat PARITY SWITCHES ─────────────────────────────────────────────
  // Every one is OPT-IN and defaults to what the essence and tool catalogues already render.
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
  'sectionIcons',
  'sectionNotes',
  'sectionTitles',
  // THE SELECTION BAND'S POPULATION (issue 1371 r9-cat, gap-list row 37). `'results'` is the
  // shipped band — a tri-state master box plus `Select all {n} results` — and `'shown'` is the
  // reference's, which draws no box and offers one text action over the rendered rows.
  'selectAllScope',
  'searchPlaceholder',
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
    // Stated as a DIFFERENCE rather than as two independent lists.
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
      // M14's opt-in is catalogue-only for the reason the rest are: the rules-list shell has no
      // inspector to populate, and its own first-row rule is `ComponentsBrowserView`'s.
      'autoSelectFirst',
      // The seven inspector/list copy props issue 1372 added, plus the two the split always had.
      'columnLead',
      'countUnit',
      // The five parity switches (issue 1373) are catalogue-only for the same reason.
      'describeEntry',
      'extraCards',
      // M21's opt-in is catalogue-only for the reason M14's is: the rules-list shell's column is
      // `ComponentsBrowserView`'s own `.manager-main`, which already runs edge to edge.
      'flushBulkDock',
      'flushColumn',
      // AND THE TWO PARITY OPT-OUTS (issue 1371).
      'inspectorBody',
      'inspectorBodyPlacement',
      'inspectorCaption',
      'inspectorFoot',
      'inspectorKicker',
      // AND THE TWO LIST SEAMS issue 1373's parity round added.
      'listLead',
      'membershipFilter',
      'nameEntry',
      'onOpenEntry',
      'onOpenSystemRules',
      'openEntryLabel',
      // AND THE FOUR issue 1371 r8-cat SWITCHES.
      'openEntryLabelled',
      'restingHint',
      'restingTitle',
      // AND THE ZERO-MEMBER ROSTER SENTENCE (issue 1371).
      'rosterEmptyNote',
      // AND THE FOUR issue 1371 r9-cat PRIMITIVE SEAMS.
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
      // Catalogue-only for the reason `splitToolbar` is: the rules-list shell's selection band is
      // the shipped one and no reference asks it to move.
      'selectAllScope',
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
    // The catalogue composes the panel rather than inlining it.
    const shell = sourceOf(CATALOGUE);
    assert.ok(
      shell.includes('<SystemRulesRoster'),
      'the catalogue composes the panel; without this the zero count above means it was deleted'
    );
    const source = sourceOf(ROSTER);
    const pager = source.indexOf('<Pagination');
    assert.ok(pager > 0, 'the roster renders the pager');
    // The PROP evidence: it walks a fixed five-row window with no page-size selector.
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
  const CALL = /copyMembership\s*\??\.?\s*\(/g;

  /**
   * `source` with every comment removed.
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
    // …and the affordance itself is suppressed.
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
    // The one that matters: the BASE card rule must state no fill at all.
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
    // Round 4's exact spelling, as a negative: a `background`.
    const shared = [
      ...source.matchAll(
        /:global\(\.manager-search\.manager-scoped-roster-search(?![\w-])[^)]*\)\s*\{([^}]*)\}/g
      ),
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
 * Three opt-ins the world Component catalogue turns on live on components a PAGE never composes:
 * `SystemRulesRoster`'s two surface props are reached only through the shell's own inspector
 * snippet, and the frame's row medallion and lead-row rung are reached only through the shell's
 * own frame tag. So the shell declaring the prop and the shell FORWARDING it are two different
 * facts, and a declared-but-unforwarded prop is the exact failure that reads as green: the page
 * passes it, nothing throws, and the screen renders the default it always did.
 */
describe('the catalogue shell FORWARDS what it declares', () => {
  const shell = () => sourceOf(CATALOGUE);

  it('hands the roster its two surface props, renamed at the boundary', () => {
    const source = shell();
    // Renamed on the way in — `rosterRecessed` / `rosterSearchWell`.
    assert.match(source, /\n\s*rosterRecessed = false,/, 'declared, and OFF by default');
    assert.match(source, /\n\s*rosterSearchWell = false,/, 'declared, and OFF by default');
    assert.match(
      source,
      /recessed=\{rosterRecessed\}/,
      'and the roster tag is handed the value rather than a literal'
    );
    assert.match(source, /searchWell=\{rosterSearchWell\}/, 'likewise for the search well');
  });

  it('hands the frame the first-row auto-selection, OFF by default (M14)', () => {
    const source = shell();
    assert.match(source, /\n\s*autoSelectFirst = false,/, 'declared, and OFF by default');
    assert.match(source, /\{autoSelectFirst\}/, 'and forwarded to the frame');
    const frame = sourceOf(FRAME);
    assert.match(
      frame,
      /\n\s*autoSelectFirst = false,/,
      'the frame declares it OFF by default too'
    );
    // The effect is guarded on the prop FIRST.
    assert.match(
      frame,
      /\$effect\(\(\) => \{\s*\n\s*if \(!autoSelectFirst \|\| selectedId !== ''\) return;/,
      'the frame`s effect returns before reading a row unless the prop is on and nothing is chosen'
    );
    assert.ok(
      !/autoSelectFirst[\s\S]{0,600}?inspectorElement\?\.focus/.test(frame),
      'and the auto-selection does not call the inspector focus a row CLICK calls'
    );
  });

  it('hands the frame the flush list column, OFF by default (M21)', () => {
    const source = shell();
    assert.match(source, /\n\s*flushColumn = false,/, 'declared, and OFF by default');
    assert.match(source, /\{flushColumn\}/, 'and forwarded to the frame');
    const frame = sourceOf(FRAME);
    assert.match(frame, /\n\s*flushColumn = false,/, 'the frame declares it OFF by default too');
    // The class is emitted from the prop and nothing else.
    assert.match(
      frame,
      /class="manager-scoped-list-column"\s+class:is-flush=\{flushColumn\}/,
      'the frame`s column wears `is-flush` when and only when the prop is on'
    );
    assert.match(
      frame,
      /\.manager-scoped-list-column\.is-flush \{\s*padding: 0;\s*\}/,
      'and the flush column drops the pane inset and nothing else'
    );
  });

  it('hands the frame the flush bulk dock, OFF by default (M24)', () => {
    const source = shell();
    assert.match(source, /\n\s*flushBulkDock = false,/, 'declared, and OFF by default');
    assert.match(source, /\{flushBulkDock\}/, 'and forwarded to the frame');
    const frame = sourceOf(FRAME);
    assert.match(frame, /\n\s*flushBulkDock = false,/, 'the frame declares it OFF by default too');
    // The class rides the BULK branch's scroller.
    assert.match(
      frame,
      /\{#if bulk && selection\.count > 0\}[\s\S]{0,900}?<div class="manager-scoped-list-inspector-scroll" class:is-flush-bulk=\{flushBulkDock\}>/,
      'the bulk scroller wears `is-flush-bulk` from the prop and nothing else'
    );
    assert.match(
      frame,
      /\.manager-scoped-list-inspector:has\(> \.manager-scoped-list-inspector-scroll\.is-flush-bulk\) \{\s*padding: 0;\s*\}/,
      'the column hands its inset away while that scroller is its child…'
    );
    assert.match(
      frame,
      /\.manager-scoped-list-inspector-scroll\.is-flush-bulk \{\s*padding: var\(--fab-space-4\);\s*\}/,
      '…to the bulk scroller, so the panel content stays where it was and the dock can bleed past it'
    );
  });

  it('hands the frame the row medallion and the lead-row rung', () => {
    const source = shell();
    assert.match(source, /\n\s*toolbarLeadSize = '',/, 'declared, and the shipped rung by default');
    assert.match(source, /\n\s*rowMedallion = null,/, 'declared, and the shipped tile by default');
    // Shorthand `{name}`, which is how every other pass-through on this tag is written.
    assert.match(source, /\{toolbarLeadSize\}/, 'and forwarded to the frame');
    assert.match(source, /\{rowMedallion\}/, 'and forwarded to the frame');
  });

  it('and hands the frame the selection band’s population', () => {
    const source = shell();
    assert.match(
      source,
      /\n\s*selectAllScope = 'results',/,
      'declared, and the SHIPPED band by default, so the essence and tool catalogues keep their ' +
        'master box'
    );
    assert.match(source, /\{selectAllScope\}/, 'and forwarded to the frame');
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
    // `proto:582`-`585` draws the membership select.
    assert.match(
      source,
      /const onLeadRow = \(filter\?\.toolbarRow \?\? 'lead'\) === 'lead';/,
      'the helper decides on the descriptor’s ROW'
    );
    // The sort control is written by the frame itself, outside the lane-filter snippet.
    const hook = source.indexOf("'data-scoped-list-sort'");
    assert.ok(hook > 0, 'NON-VACUITY: the sort control is still written by this frame');
    const sortSelect = source.slice(source.lastIndexOf('<Select', hook), hook);
    assert.match(sortSelect, /value=\{sortKey\}/, 'and the slice is that element');
    assert.ok(!/is-size-38/.test(sortSelect), 'and it carries no 38px token');
    assert.ok(!/\bclass=/.test(sortSelect), 'and it takes no call-site class at all');
  });
});

/** THE IMPORT-FREE LEAF, PINNED (issue 1371 r9-cat). */
describe('componentScoped.js stays the import-free leaf its consumers assume', () => {
  const LEAF = `${SCOPED_DIR}/componentScoped.js`;
  // The ONE import this leaf may hold. Since #1663 it is an ALIASING SHIM over
  // `src/utils/categoryNormalization.js` rather than an import-free module of its own, so a
  // manifest that carries this file must carry BOTH; neither has any further import, so the pair
  // closes the graph.
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
    // Read off the IMPORT LIST rather than off the raw text.
    assert.ok(
      !importedPaths().some((path) => path.endsWith('browserPagination.js')),
      'the leaf imports no pagination module — the regression this pin exists for'
    );
    const panel = sourceOf(`${SCOPED_DIR}/ComponentCatalogueBulkPanel.svelte`);
    assert.match(
      panel,
      /import \{ paginateRows \} from '\.\.\/\.\.\/\.\.\/\.\.\/model\/browserPagination\.js';/,
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
 * EACH REMOVE SENTENCE STATES WHAT ITS OWN REMOVAL DOES (issue 1371, r9-cat then r10).
 * `Scoped.Component.RemoveConsequence` carries the cascade and is read by the component entry
 * card and by `MembershipActions`' component branch; the shared `Scoped.Membership.…` carries
 * the overrides-only sentence for essences and tools. `MembershipActions` selects between them
 * from its DESCRIPTOR — the same rule that already decides whether it renders an enabled switch
 * — so a caller cannot hand an essence row the component's sentence.
 */
describe('each remove sentence discloses what that removal actually does', () => {
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

  it('and the COMPONENT per-system row says the same thing in the singular', () => {
    const note = scoped.Component.RemoveConsequence;
    assert.ok(typeof note === 'string' && note.length > 0, 'NON-VACUITY: the key resolves');
    for (const clause of CASCADE) assert.match(note, clause);
    assert.match(note, /\{entity\}/, 'and it still interpolates both of its own tokens');
    assert.match(note, /\{system\}/);
  });

  it('neither component sentence still stops at the overrides, which is the finding', () => {
    // The exact spelling both carried, as a negative.
    for (const note of [scoped.Component.BulkRemoveNote, scoped.Component.RemoveConsequence]) {
      assert.doesNotMatch(note, /Its overrides go with it/);
      assert.doesNotMatch(note, /loses its rules in each chosen system/);
    }
  });

  it('and the SHARED key promises no recipe repair, because two of its three types do none', () => {
    const note = scoped.Membership.RemoveConsequence;
    assert.ok(typeof note === 'string' && note.length > 0, 'NON-VACUITY: the key resolves');
    assert.match(note, /\{entity\}/, 'it still interpolates both of its own tokens');
    assert.match(note, /\{system\}/);
    assert.match(note, /Its overrides go with it/, 'it states what an essence removal DOES do');
    assert.equal(
      /recipe/.test(note),
      false,
      'this key is rendered for essences and tools, whose stores repair no recipe at all'
    );
  });

  it('and each consumer reads the key for the scope it renders', () => {
    // The component entry card is component-only.
    const card = sourceOf(`${SCOPED_DIR}/WorldComponentEntrySystemsCard.svelte`);
    assert.match(card, /FABRICATE\.Admin\.Manager\.Scoped\.Component\.RemoveConsequence/);
    assert.equal(
      /FABRICATE\.Admin\.Manager\.Scoped\.Membership\.RemoveConsequence/.test(card),
      false,
      'the component card must not fall back to the shared essence/tool sentence'
    );

    // The shared cluster reads BOTH, because it renders all three types and chooses between
    // them from the descriptor. A copy of it that named only one key would give some scope the
    // other scope's sentence, which is the defect in either direction.
    const shared = sourceOf(`${SCOPED_DIR}/MembershipActions.svelte`);
    for (const key of [
      /FABRICATE\.Admin\.Manager\.Scoped\.Component\.RemoveConsequence/,
      /FABRICATE\.Admin\.Manager\.Scoped\.Membership\.RemoveConsequence/,
    ]) {
      assert.match(shared, key);
    }
  });
});

/** THE SHARED VALIDATION TAB'S ENTRY FACE, AS OPT-IN PROPS (issue 1371 r11-entry, UX F-D). */
describe('the shared validation tab states its entry face as an opt-in prop', () => {
  const TAB = `${SCOPED_DIR}/ScopedValidationTab.svelte`;
  const ENTRY = `${SCOPED_DIR}/WorldComponentEntryPage.svelte`;
  const OTHER_CALLERS = Object.freeze([
    `${SCOPED_DIR}/WorldEssenceEntryPage.svelte`,
    `${SCOPED_DIR}/WorldToolEntryPage.svelte`,
    'src/ui/svelte/apps/manager/essences/EssenceValidationTab.svelte',
    'src/ui/svelte/apps/manager/tools/ToolValidationTab.svelte',
  ]);

  it('declares `verdictSummary` and defaults it OFF', () => {
    const source = sourceOf(TAB);
    assert.ok(
      declaredProps(source).includes('verdictSummary'),
      'the tab declares the opt-in as a real prop rather than reading a caller class'
    );
    assert.match(
      source,
      /\n\s*verdictSummary = false,/,
      'and it defaults to false, so four other screens are unchanged by a finding raised against one'
    );
  });

  it('passes the caller’s own summary through untouched while it is off', () => {
    const source = sourceOf(TAB);
    assert.match(
      source,
      /const shownSummary = \$derived\(verdictSummary \? verdictOf\(counts\) : summary\);/,
      'the derivation is GATED on the prop; an ungated one repaints every consumer'
    );
    assert.match(
      source,
      /summary=\{shownSummary\}/,
      'and the surface is handed that gated value rather than a second one'
    );
  });

  it('derives all three verdicts from the counts, worst first', () => {
    // `proto:4577-4578`, the reference's own three-way chain. Pinned as the KEY SET rather than
    // as the sentences: the English lives in `lang/en.json` and the fallbacks, and a key that
    // stopped being read is what makes a translated string silently unreachable.
    const source = sourceOf(TAB);
    for (const key of [
      'VerdictBlocking',
      'VerdictBlockingOne',
      'VerdictBlockingSub',
      'VerdictWarning',
      'VerdictWarningSub',
      'VerdictWarningSubOne',
      'VerdictPass',
      'VerdictPassSub',
    ]) {
      assert.match(
        source,
        new RegExp(String.raw`FABRICATE\.Admin\.Manager\.Scoped\.Validation\.${key}\b`),
        `the tab reads \`${key}\``
      );
    }
    assert.ok(
      source.indexOf('blocking > 0') < source.indexOf('warnings > 0'),
      'blocking is answered before warnings, so a record with both is headed by the worse one'
    );
  });

  it('the entry opts in, and passes NO title, intro or summary of its own', () => {
    const source = sourceOf(ENTRY);
    const call = source.slice(
      source.indexOf('<ScopedValidationTab'),
      source.indexOf('/>', source.indexOf('<ScopedValidationTab'))
    );
    assert.ok(call.length > 0, 'NON-VACUITY: the entry really renders the shared tab');
    assert.match(call, /\bverdictSummary\b/);
    for (const absent of ['title=', 'intro=', 'summary=']) {
      assert.equal(
        call.includes(absent),
        false,
        `\`${absent}\` is suppressed by omission (proto:957-960 draws no head block): ${call}`
      );
    }
    assert.match(
      call,
      /blockLabel=/,
      'and it still names its own block word, which is the one badge that differs by entity type'
    );
  });

  it('and the four other call sites take the shipped defaults', () => {
    // Scanned over the WHOLE file rather than over a sliced call.
    for (const path of OTHER_CALLERS) {
      const source = sourceOf(path);
      assert.ok(
        source.includes('<ScopedValidationTab'),
        `NON-VACUITY: ${path} renders the shared tab`
      );
      assert.equal(
        /verdict/i.test(source),
        false,
        `${path} must not opt into the entry's hero, and must not spell it any other way`
      );
    }
  });

  it('the three row badges are the reference’s tone table in the shipped English', () => {
    // `proto:4573-4575` gives `Blocking` / `Warning` / `Pass`. The block word is the only one a
    // call site chooses; the other two come from the SHARED validation vocabulary — the recipe
    // editor's namespace until issue 1517 moved it to `Admin.Manager.Validation`, which is where
    // every validation surface now reads its tile and pill words from — and this pins that all
    // three agree rather than leaving the run reading `Blocking / WARNING / PASS`.
    const lang = JSON.parse(readFileSync(resolve(repoRoot, 'lang/en.json'), 'utf8'));
    const shared = lang.FABRICATE.Admin.Manager.Validation;
    const component = lang.FABRICATE.Admin.Manager.Scoped.Component;
    assert.equal(component.ValidationStatusBlock, 'Blocking');
    assert.equal(shared.StatusWarn, 'Warning');
    assert.equal(shared.StatusPass, 'Pass');
  });

  it('the entry’s superseded hero keys are GONE, not merely unread', () => {
    // `lang-keys-no-orphans` would catch a key nothing reads, but only once nothing reads it.
    const lang = JSON.parse(readFileSync(resolve(repoRoot, 'lang/en.json'), 'utf8'));
    const component = lang.FABRICATE.Admin.Manager.Scoped.Component;
    for (const key of [
      'ValidationTitle',
      'ValidationIntro',
      'ValidationSummaryTitle',
      'ValidationSummarySub',
    ]) {
      assert.equal(
        Object.hasOwn(component, key),
        false,
        `\`Scoped.Component.${key}\` described the subject where the reference states the verdict`
      );
    }
  });
});

describe('the entry’s pointer proofs survive in the capture registry', () => {
  const caseFileDirectory = 'scripts/lib/view-lab-cases';
  const registry = () =>
    readdirSync(resolve(repoRoot, caseFileDirectory))
      .filter((name) => name.endsWith('.js'))
      .sort()
      .map((name) => sourceOf(`${caseFileDirectory}/${name}`))
      .join('\n');

  it('carries a centre-hit on the world tag chip, which the page still emits', () => {
    // `moss`, not `fuel` (issue 1371 r15-entry): the run offers the vocabulary's tags alone.
    assert.match(registry(), /expectCenterHit: '\[data-scoped-entry-tag="moss"\]'/);
    assert.match(
      sourceOf(`${SCOPED_DIR}/WorldComponentEntryPage.svelte`),
      /data-scoped-entry-tag=\{tag\}/,
      'and the chip carries the attribute that selector addresses'
    );
  });

  it('carries a centre-hit on the member row’s exit icon, whose token the card still mints', () => {
    assert.match(registry(), /data-arm-token="scoped-membership-remove:sm-coal\|lab-smithing"/);
    assert.match(
      sourceOf(`${SCOPED_DIR}/WorldComponentEntrySystemsCard.svelte`),
      /`scoped-membership-remove:\$\{entryId\}\|\$\{row\?\.systemId \?\? ''\}`/,
      'the card still mints that token shape, so the registry selector can resolve'
    );
  });

  it('and a real pointer CLICK on the armed delete, which is stronger than a hit-test', () => {
    assert.match(registry(), /expectClick: '\[data-arm-token="world-component-delete:sm-coal"\]'/);
    assert.match(
      sourceOf(`${SCOPED_DIR}/WorldComponentEntryPage.svelte`),
      /world-component-delete:/,
      'and the page still mints that token'
    );
  });
});

/** THE ENTRY HEADER'S IDENTITY CHIP IS BORDERLESS (issue 1371 r11-entry, UX F-B). */
describe('the world Component entry header wires the borderless medallion', () => {
  const ROOT = 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte';

  /**
   * One `<Medallion …/>` call, sliced from the branch that carries a route hook.
   *
   * @param {string} source the shell's own text.
   * @param {string} hook the branch's `data-*` heading attribute.
   * @returns {string}
   */
  function medallionUnder(source, hook) {
    const branch = source.indexOf(hook);
    assert.ok(branch !== -1, `NON-VACUITY: the shell still draws a \`${hook}\` heading`);
    const open = source.indexOf('<Medallion', branch);
    assert.ok(open !== -1, `and that heading still renders a Medallion`);
    return source.slice(open, source.indexOf('/>', open));
  }

  it('passes `variant="glyph-chip"` on the entry heading, keeping its own size and glyph', () => {
    const call = medallionUnder(sourceOf(ROOT), 'data-world-component-entry-heading');
    assert.match(call, /variant="glyph-chip"/, `the header chip asks for the borderless face`);
    assert.match(
      call,
      /size=\{42\}/,
      'and keeps `proto:5375`’s 42px, which the variant does not own'
    );
    assert.match(call, /glyph=\{22\}/);
    assert.match(
      call,
      /art=\{worldComponentEntryImage\}/,
      'and still draws the linked art, through the prop the design system publishes — issue 1506 ' +
        'renamed `src` to `art` at all 27 render sites and left `src` a deprecated alias, and a ' +
        'pin left on the alias would have gone on passing for the one release it survives'
    );
  });

  it('and the three SIBLING headings do not, so the opt-in is a real per-site decision', () => {
    // The positive control. `Medallion`'s variant is `''` by default and three other heading
    // branches in the same shell render it; a variant that had become implicit, or a lane that
    // wired it by editing the primitive instead of the call site, passes the clause above and
    // fails here.
    const source = sourceOf(ROOT);
    for (const hook of [
      'data-world-essence-entry-heading',
      'data-essence-edit-heading',
      'data-world-tool-entry-heading',
    ]) {
      assert.equal(
        /variant=/.test(medallionUnder(source, hook)),
        false,
        `\`${hook}\` takes the shipped tile, and this change must not have moved it`
      );
    }
  });
});

/**
 * The `saving` leg only disables Save, so a world entry editor reading a sibling entity's flag
 * renders identically in every state a mounted census can reach (issue 1720).
 */
describe('each world entry header action pair binds its own entity’s save legs', () => {
  const LADDER = 'src/ui/svelte/apps/manager/ManagerHeaderActions.svelte';
  const ENTITIES = Object.freeze([
    ['essence', 'Essence'],
    ['tool', 'Tool'],
    ['component', 'Component'],
  ]);

  /**
   * The one `<ScopedEntryHeaderActions …/>` the named entry route's branch renders. The anchor is
   * the branch tag rather than the route token, which the visibility gate above also spells.
   */
  function actionPairFor(ladder, route) {
    const branch = ladder.indexOf(`if currentView === '${route}'}`);
    assert.ok(branch !== -1, `NON-VACUITY: the ladder still branches on \`${route}\``);
    const open = ladder.indexOf('<ScopedEntryHeaderActions', branch);
    assert.ok(open !== -1, `and \`${route}\` still renders the shared action pair`);
    return ladder.slice(open, ladder.indexOf('/>', open));
  }

  it('gives each route its own dirty and saving flags, never a sibling entity’s', () => {
    const ladder = sourceOf(LADDER);
    const wrong = [];
    for (const [entity, Entity] of ENTITIES) {
      const pair = actionPairFor(ladder, `world-${entity}-entry`);
      const dirty = /saveDisabled=\{!(\w+)\}/.exec(pair);
      const saving = /saving=\{(\w+)\}/.exec(pair);
      assert.ok(dirty && saving, `the ${entity} pair still binds both save legs`);
      if (dirty[1] !== `world${Entity}EntryDirty`) wrong.push(`${entity} gates Save on ${dirty[1]}`);
      if (saving[1] !== `world${Entity}EntrySaving`) wrong.push(`${entity} spins on ${saving[1]}`);
    }
    assert.deepEqual(wrong, [], 'a world entry editor reads another entity’s save state');
  });
});

/**
 * `{ selector, body }` for every rule in a stylesheet text.
 *
 * @param {string} css
 * @returns {Array<{selector: string, body: string}>}
 */
function sheetRulesOf(css) {
  const stripped = css.replaceAll(/\/\*[\s\S]*?\*\//g, '');
  return [...stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: match[1].replaceAll(/\s+/g, ' ').trim(),
    body: match[2].replaceAll(/\s+/g, ' ').trim(),
  }));
}

/**
 * THE `Systems using this component` ROWS SHARE ONE SURFACE (issue 1371 r13-entry, maintainer
 * ruling M15).
 */
describe('the entry’s per-system rows sit on one surface, with every name in full ink', () => {
  const CSS_PATH = 'styles/fabricate.css';

  const ROW = '.fabricate-manager .manager-component-entry-system';
  const NAME = '.fabricate-manager .manager-component-entry-system-name';

  it('declares the row’s own transparent surface and its hairline, so nothing outside the module can band it', () => {
    const rule = sheetRulesOf(readFileSync(resolve(repoRoot, CSS_PATH), 'utf8')).find(
      (candidate) => candidate.selector === ROW
    );
    assert.ok(Boolean(rule), 'NON-VACUITY: the row rule is still in the sheet');
    assert.match(rule.body, /background: transparent;/, 'the row states its surface explicitly');
    assert.match(rule.body, /border-bottom: 1px solid var\(--fab-border\);/, 'and its separator');
  });

  it('paints NO wash and re-inks NO name on the without-rules rows', () => {
    // THE MUTATION THIS KILLS: restoring `.is-outsider { background: var(--fab-surface-soft) }`
    // or `.is-outsider .manager-component-entry-system-name { color: var(--fab-text-muted) }`.
    const outsiderRules = sheetRulesOf(readFileSync(resolve(repoRoot, CSS_PATH), 'utf8')).filter(
      (rule) =>
        rule.selector.includes('manager-component-entry-system') &&
        rule.selector.includes('.is-outsider')
    );
    for (const rule of outsiderRules) {
      assert.ok(
        !/(^|[\s;])background(-color)?:/.test(rule.body),
        `\`${rule.selector}\` paints a wash on the without-rules row: ${rule.body}`
      );
      assert.ok(
        !/(^|[\s;])color:/.test(rule.body),
        `\`${rule.selector}\` re-inks the without-rules row: ${rule.body}`
      );
    }
  });

  it('and the system name is full ink on every row (`proto:932`)', () => {
    const rule = sheetRulesOf(readFileSync(resolve(repoRoot, CSS_PATH), 'utf8')).find(
      (candidate) => candidate.selector === NAME
    );
    assert.ok(Boolean(rule), 'NON-VACUITY: the name rule is still in the sheet');
    assert.match(rule.body, /color: var\(--fab-text\);/);
  });
});

/**
 * THE ENTRY'S `How players see it` TILE DRAWS THE ART THE WAY THE PLAYER'S INVENTORY TILE DOES
 * (issue 1371 r13-entry, maintainer ruling M16).
 */
describe('the entry’s inventory tile mirrors the player inventory card’s art treatment', () => {
  const CSS_PATH = 'styles/fabricate.css';
  const CARD_PATH = 'src/ui/svelte/apps/inventory/InventoryItemCard.svelte';

  /** The declarations of ONE rule, as `property -> value`. */
  function declarationsOf(rules, selector) {
    const rule = rules.find((candidate) => candidate.selector === selector);
    assert.ok(Boolean(rule), `NON-VACUITY: \`${selector}\` is still declared`);
    return Object.fromEntries(
      rule.body
        .split(';')
        .map((declaration) => declaration.trim())
        .filter(Boolean)
        .map((declaration) => declaration.split(':').map((part) => part.trim()))
    );
  }

  function styleBlockOf(svelteSource) {
    const open = svelteSource.indexOf('<style>');
    const close = svelteSource.indexOf('</style>');
    assert.ok(open !== -1 && close > open, 'NON-VACUITY: the card still carries a scoped block');
    return svelteSource.slice(open + '<style>'.length, close);
  }

  const sheet = () => sheetRulesOf(readFileSync(resolve(repoRoot, CSS_PATH), 'utf8'));
  const card = () => sheetRulesOf(styleBlockOf(readFileSync(resolve(repoRoot, CARD_PATH), 'utf8')));

  it('fills the tile with the art exactly as `.inventory-card-art img` does', () => {
    const authority = declarationsOf(card(), '.inventory-card-art img');
    const mirror = declarationsOf(
      sheet(),
      '.fabricate-manager .manager-component-entry-preview-tile > img'
    );
    for (const property of ['display', 'width', 'height', 'object-fit']) {
      assert.equal(
        mirror[property],
        authority[property],
        `\`${property}\` on the entry tile’s art must be the player tile’s (\`${authority[property]}\`)`
      );
    }
    assert.equal(authority['object-fit'], 'cover', 'and the authority is the FILLING treatment');
  });

  it('and the box is a square like `.inventory-card-thumb`, not a fixed 110px band', () => {
    const authority = declarationsOf(card(), '.inventory-card-thumb');
    const mirror = declarationsOf(
      sheet(),
      '.fabricate-manager .manager-component-entry-preview-tile'
    );
    assert.equal(mirror['aspect-ratio'], authority['aspect-ratio']);
    assert.equal(mirror.height, undefined, 'a fixed height would fight the square the art fills');
    assert.equal(mirror.overflow, 'hidden', 'and the corners clip the art, as the thumb’s do');
  });
});
