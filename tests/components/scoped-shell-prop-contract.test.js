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
import {
  attributeValueOn,
  detectShellSpreads,
  shellBindingsIn,
} from '../helpers/scopedShellSpread.js';

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
    assert.deepEqual([...rules].filter((name) => !catalogue.has(name)).sort(), [
      'armedToken',
      'onOpenEditor',
      'onOpenWorldEntry',
      'systemId',
      'systemName',
    ]);
    assert.deepEqual([...catalogue].filter((name) => !rules.has(name)).sort(), [
      'inspectorBody',
      'onOpenEntry',
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

  it('no shell calls it at all today, and any future call carries three arguments', () => {
    for (const path of SHELLS) {
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
    assert.match(
      sourceOf(CATALOGUE),
      /copyable\(\)\s*\{\s*return false;/,
      'the catalogue must suppress copy-from while it has no source chooser'
    );
  });
});
