/**
 * The world Component screens' SOURCE contract (issue 1371, epic 1357).
 *
 * ## What is settled here rather than on a mounted tree
 *
 * Three kinds of fact, and each is unobservable from a rendered DOM:
 *
 *  - the GATEWAY CORRECTION's evidence. `### GM World Scoped Entity Routes` requirement 7 makes a
 *    closure void for a seam its enumeration does not name and admits a correction that supplies
 *    one — but requires the claim to be EVIDENCED on the reopening change's own diff. Nothing
 *    renders that evidence, so it is an import-surface, published-surface and route-enumeration
 *    assertion, modelled on the requirement-7 evidence PR 1400 shipped for the essence lane.
 *  - the PROP CONTRACT. A screen that declares a prop its call site does not pass makes the
 *    lookup fall THROUGH to the shell's spread, and every reader of that prop becomes a live
 *    subscriber to a bundle that is a new object on every world-scope publish. That is a
 *    performance fact with no rendered symptom at all.
 *  - the REACHABILITY BANNER's staleness, which is prose and which no gate read until this file.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');

const MANAGER = 'src/ui/svelte/apps/manager';
const SCOPED = `${MANAGER}/scoped`;

const rootSource = read(`${MANAGER}/CraftingSystemManagerRoot.svelte`);
const adminStore = read('src/ui/svelte/stores/adminStore.js');
const cataloguePage = read(`${SCOPED}/WorldComponentCataloguePage.svelte`);
const entryPage = read(`${SCOPED}/WorldComponentEntryPage.svelte`);
const browserView = read(`${MANAGER}/ComponentsBrowserView.svelte`);
const editView = read(`${MANAGER}/ComponentEditView.svelte`);

/** Strip block and line comments, so a mention in prose cannot satisfy a source assertion. */
function withoutComments(source) {
  return source
    .replaceAll(/<!--[\s\S]*?-->/g, '')
    .replaceAll(/\/\*[\s\S]*?\*\//g, '')
    .replaceAll(/^\s*\/\/.*$/gm, '');
}

describe('requirement 7 correction — the reopened gateways grew seams, not screens', () => {
  // AC-18. The distinction between a correction and a violation is not decidable from a diff's
  // file names, which is why the requirement asks for evidence rather than for a file list.

  /** Every module specifier the gateway imports, in source order. */
  function gatewayImportSpecifiers() {
    // COMMENTS STRIPPED FIRST, as every other scan in this file does. A `from '…component…'`
    // written inside a comment would red the equality below for a prose reason — the vacuous
    // shape in reverse, where the scan sees something the module does not import.
    return [...withoutComments(rootSource).matchAll(/from '([^']+)'/g)].map((match) => match[1]);
  }

  it('IMPORT SURFACE: the component-family dependency set is exactly this list', () => {
    const specifiers = gatewayImportSpecifiers();
    // NON-VACUITY FIRST. An empty match set would make the equality below assert nothing at all,
    // which is the failure mode a source scan has and a rendered assertion does not.
    assert.ok(specifiers.length > 50, 'the gateway import scan found no imports at all');
    assert.deepEqual(
      specifiers.filter((specifier) => /component/i.test(specifier)).sort(),
      [
        '../../../../utils/componentBrowserModel.js',
        '../../../../utils/componentBulkEditModel.js',
        '../../../../utils/componentCategories.js',
        '../../components/ChanceSlider.svelte',
        '../../components/ManagerButton.svelte',
        '../../components/Medallion.svelte',
        '../../util/componentEditor.js',
        './ComponentEditView.svelte',
        './ComponentsBrowserView.svelte',
        './component/ComponentEditorHeader.svelte',
        './components/ComponentBrowserInspector.svelte',
        './components/ComponentBulkEditPanel.svelte',
        './scoped/WorldComponentCataloguePage.svelte',
        './scoped/WorldComponentEntryPage.svelte',
      ],
      'a correction that had to import a new SCREEN COMPONENT would be building here rather ' +
        'than carrying a seam; the two page imports predate this change and are the placeholders'
    );
  });

  it('and no component specifier is a NAMESPACE import', () => {
    // A namespace import turns one line into a permanent door: every future addition to the
    // module becomes reachable from the gateway with no diff here at all.
    assert.ok(
      !/import \* as \w+ from '[^']*component/i.test(rootSource),
      'the gateway imports named bindings, so the next thing it wants is a visible edit'
    );
  });

  it('PUBLISHED SURFACE: the store legs are unchanged and every family stays wrapped', () => {
    assert.match(
      adminStore,
      /component: \{\s*\.\.\.worldScopeFamilies\.component,\s*addToSystem: joinComponentToSystem,\s*removeFromSystem: partComponentFromSystem,\s*\},/,
      'the component family is composed under its EXISTING membership keys'
    );
    assert.match(
      adminStore,
      /const worldScope = Object\.fromEntries\(\s*Object\.entries\(\{[\s\S]*?\}\)\.map\(\(\[entityType, family\]\) => \[entityType, _republishingFamily\(family\)\]\)\s*\);/,
      'and every family is still published through the republishing wrapper'
    );
  });

  it('and the usage argument gains a component leg beside its two siblings', () => {
    assert.match(
      adminStore,
      /usage: \{\s*component: _worldComponentUsage\(recipeCache\),\s*essence: _worldEssenceUsage\(\),\s*tool: _worldToolUsage\(recipeCache\),\s*\}/,
      'the projection already consumed this argument; two of three legs were wired and the ' +
        'third answered 0 recipes for every world component in the world'
    );
    // AND THE TWO LEGS THAT WALK THE RECIPES SHARE ONE READ. The per-refresh recipe fetch is a
    // bounded budget the store's own suite asserts, and a second consumer reading the cohort
    // again scales that budget by the crafting-system count — which is a cost with no rendered
    // symptom at all, so nothing but the budget assertion and this line would report it.
    assert.match(
      adminStore,
      /const recipeCache = new Map\(\);/,
      'the cohort cache is minted per projection call, never as a module-level memo'
    );
  });

  /**
   * EVERY route token the gateway enumerated on `origin/main`, pinned as a literal list.
   *
   * Read off the parent commit rather than off the file under test, which is the difference
   * between a pin and a tautology: a scan compared against itself agrees with any tree.
   */
  const ROUTE_TOKENS = Object.freeze([
    'access',
    'books-scrolls',
    'component-edit',
    'components',
    'crafting-settings',
    'environment-edit',
    'environments',
    'essence-edit',
    'essences',
    'gathering-event-edit',
    'gathering-task-edit',
    'knowledge',
    'recipe-edit',
    'recipe-item-edit',
    'recipes',
    'system-edit',
    'systems',
    'tags',
    'tool-edit',
    'tools',
    'world',
    'world-component-entry',
    'world-components',
    'world-currency',
    'world-downtime',
    'world-essence-entry',
    'world-essences',
    'world-modifiers',
    'world-prerequisites',
    'world-tool-entry',
    'world-tools',
    'world-travel',
    'world-vocabulary',
  ]);

  it('ROUTE ENUMERATION: the gateway mints no route', () => {
    // The four component routes already existed. A sixth seam that minted one would show up
    // here, which is what distinguishes carrying a seam from building a screen.
    const tokens = [...rootSource.matchAll(/currentView === '([a-z-]+)'/g)].map(
      (match) => match[1]
    );
    assert.ok(tokens.length > 20, 'the route-token scan found nothing; it is broken');
    for (const token of [
      'world-components',
      'world-component-entry',
      'components',
      'component-edit',
    ]) {
      assert.ok(tokens.includes(token), `${token} is enumerated`);
    }
    // THE WHOLE SET, NOT THE COMPONENT SUBSET. A subset comparison passes a sixth seam that mints
    // a route for some OTHER family, which is exactly the thing requirement 7's enumeration is a
    // claim about: the correction may carry a seam, and may not mint a route anywhere.
    const shipped = [...new Set(tokens)].sort();
    assert.deepEqual(
      shipped.filter((token) => token.includes('component')),
      ['component-edit', 'components', 'world-component-entry', 'world-components'],
      'the four component routes already existed'
    );
    assert.equal(
      shipped.length,
      ROUTE_TOKENS.length,
      `the gateway enumerates ${ROUTE_TOKENS.length} route tokens; it now enumerates ` +
        `${shipped.length}. A seam may carry a value into an existing route and may not mint one.`
    );
    assert.deepEqual(shipped, [...ROUTE_TOKENS].sort());
  });
});

describe('the two world component pages declare only what their call site passes', () => {
  // AC-4, and it is ONE DIRECTION ONLY. The reverse does not hold and must not be asserted: the
  // component bundle spreads four keys and a screen legitimately declares three of them. The
  // hazard is declared-but-unpassed, never passed-but-undeclared.

  /** Every identifier a component's `$props()` destructure declares. */
  function declaredProps(source) {
    const block = source.match(/let \{([\s\S]*?)\} = \$props\(\);/);
    assert.ok(block, 'the component declares a $props() destructure');
    return [...withoutComments(block[1]).matchAll(/^\s*([A-Za-z][A-Za-z0-9_$]*)\s*(?:=|,|$)/gm)]
      .map((match) => match[1])
      .filter(Boolean);
  }

  /** Every prop name the root passes to one component's mount, spread keys included. */
  function passedProps(componentName) {
    const mount = rootSource.match(new RegExp(`<${componentName}\\b([\\s\\S]*?)/>`));
    assert.ok(mount, `${componentName} is mounted by the gateway`);
    // BOTH ATTRIBUTE FORMS. `{name}` shorthand passes a prop exactly as `name={…}` does, and a
    // scan that read only the long form reports every shorthand-passed prop as unpassed — which
    // is a true statement about the regex and a false one about the call site.
    const attributes = [
      ...[...mount[1].matchAll(/(?:^|\s)(?:bind:)?([A-Za-z][A-Za-z0-9_$]*)=/g)].map(
        (match) => match[1]
      ),
      ...[...mount[1].matchAll(/(?:^|\s)\{([A-Za-z][A-Za-z0-9_$]*)\}/g)].map((match) => match[1]),
    ];
    // THE KEY SET IS RESOLVED, NOT RESTATED. Four of these arrive by spread, and a test that
    // listed them by hand would go on passing after the bundle changed shape.
    const spread = /\{\.\.\.componentScopeProps\}/.test(mount[1])
      ? [
          ...rootSource
            .match(/const componentScopeProps = \$derived\(\{([\s\S]*?)\}\);/)[1]
            .matchAll(/^\s*([A-Za-z][A-Za-z0-9_$]*):/gm),
        ].map((match) => match[1])
      : [];
    return new Set([...attributes, ...spread]);
  }

  /**
   * The one PRE-EXISTING declared-but-unpassed prop, named rather than tolerated by a loosened
   * assertion.
   *
   * `random` is the component editor's injected id mint — declared so the complications section
   * never reaches for a global source of randomness, and left unpassed since it shipped, so its
   * default `undefined` is what that section actually receives. It predates this change and is
   * NOT this lane's to move: the fix is one line at the call site, and doing it here would be a
   * behaviour change in a file this change reopens only for a named seam.
   *
   * A PAIR rather than a bare name, so the exemption cannot silently cover a second screen.
   */
  const KNOWN_UNPASSED = new Set(['ComponentEditView|random']);

  for (const [componentName, source] of [
    ['WorldComponentCataloguePage', cataloguePage],
    ['WorldComponentEntryPage', entryPage],
    ['ComponentsBrowserView', browserView],
    ['ComponentEditView', editView],
  ]) {
    it(`${componentName} declares nothing its mount omits`, () => {
      const declared = declaredProps(source);
      const passed = passedProps(componentName);
      assert.ok(declared.length > 3, `the ${componentName} prop scan found nothing; it is broken`);
      assert.ok(passed.size > 3, `the ${componentName} call-site scan found nothing; it is broken`);
      const undeclaredAtSite = declared.filter(
        (name) => !passed.has(name) && !KNOWN_UNPASSED.has(`${componentName}|${name}`)
      );
      assert.deepEqual(
        undeclaredAtSite,
        [],
        `${componentName} declares ${undeclaredAtSite.join(', ')}, which its call site does not ` +
          'pass — so every reader of it becomes a live subscriber to the whole scope bundle'
      );
    });
  }

  it('and the exemption is LIVE, so it cannot outlive the thing it excuses', () => {
    // An exemption naming a prop that is now passed, or one no screen declares, is a permission
    // that has stopped describing anything and would silently grant the next author a pass.
    for (const key of KNOWN_UNPASSED) {
      const [componentName, name] = key.split('|');
      const source = { ComponentEditView: editView }[componentName];
      assert.ok(Boolean(source), `${key} names a screen this test reads`);
      assert.ok(
        declaredProps(source).includes(name),
        `${key} exempts a prop ${componentName} no longer declares`
      );
      assert.ok(
        !passedProps(componentName).has(name),
        `${key} exempts a prop the call site now passes, so the exemption is stale`
      );
    }
  });
});

describe('the catalogue composes the shell and inlines nothing', () => {
  // AC-3. A page that hand-rolled the frame's filter, pager or bulk bar would render the same
  // pixels and be a third copy of a composition three lanes share.
  it('renders exactly one EntityCatalogueShell and none of the frame internals', () => {
    const body = withoutComments(cataloguePage);
    assert.equal(
      [...body.matchAll(/<EntityCatalogueShell\b/g)].length,
      1,
      'exactly one shell composition'
    );
    for (const inlined of [
      '<BulkSelectionToolbar',
      '<Pagination',
      '<EmptyState',
      '<SelectionCheckbox',
    ]) {
      assert.equal(
        [...body.matchAll(new RegExp(inlined, 'g'))].length,
        0,
        `${inlined} belongs to the frame; a page rendering one has inlined the list`
      );
    }
  });

  it('and the zero counts above are a MEASUREMENT, not an absence', () => {
    // The control: the same scan over the FRAME finds every one of them, so a scan that had
    // silently stopped matching would fail here rather than reporting four zeroes.
    const frame = withoutComments(read(`${SCOPED}/EntityListInspectorFrame.svelte`));
    for (const inlined of ['<BulkSelectionToolbar', '<Pagination', '<EmptyState']) {
      assert.ok(
        frame.includes(inlined),
        `the frame renders ${inlined}; a scan that found none of them everywhere is broken`
      );
    }
  });
});

describe('the deep link names a route that resolves, and the gateway wires it', () => {
  // AC-16. The issue body named `world-component-edit`, which appears nowhere in the route table:
  // `scopedEntryRoute()` would answer `null`, the breadcrumb would lose its middle crumb, the
  // navigation would land on nothing — and NO shipped test would say so.
  it('both system screens name world-component-entry', () => {
    for (const [name, source] of [
      ['ComponentsBrowserView', browserView],
      ['ComponentEditView', editView],
    ]) {
      assert.match(
        withoutComments(source),
        /const WORLD_ENTRY_ROUTE = 'world-component-entry';/,
        `${name} names the shipped route token`
      );
      assert.ok(
        !withoutComments(source).includes('world-component-edit'),
        `${name} does not name the issue body's token, which resolves to nothing`
      );
    }
  });

  it('and that token is a route the shell actually enumerates', () => {
    const routes = read(`${SCOPED}/scopedEntryRoutes.js`);
    assert.match(routes, /world-component-entry/, 'the entry route table carries the token');
  });

  it('the gateway WIRES the exit on both mounts, rather than leaving it defaulted', () => {
    // A navigation prop left unwired is silently inert: every callback on these views is wired
    // explicitly at the root rather than riding the bundle spread, and the shipped navigation
    // callback beside this one defaults to a NO-OP in the props block. A mounted test would pass
    // against that default while the link was dead in production.
    assert.equal(
      [...rootSource.matchAll(/onOpenWorldEntry=\{\(route, entityId\) =>/g)].length,
      2,
      'both the rules list and the rules editor have their exit wired'
    );
  });
});

describe('no new scoped file trips either naming gate', () => {
  // AC-2. The catalogue's bulk panel is a `scoped/` sibling, so both gates reach it.
  it('the World-prefixed file count is unchanged', () => {
    const worldFiles = readdirSync(resolve(repoRoot, SCOPED)).filter(
      (entry) => entry.startsWith('World') && entry.endsWith('.svelte')
    );
    assert.equal(
      worldFiles.length,
      7,
      'a new child named World… would make the placeholder-page count eight'
    );
  });

  it('and the new children carry NEITHER route-hook attribute name', () => {
    // The route→page map is built by matching those attribute NAMES literally against every file
    // in this directory, COMMENTS INCLUDED, so a child mentioning one claims a route a page owns.
    const panel = read(`${SCOPED}/ComponentCatalogueBulkPanel.svelte`);
    for (const hook of ['data-scoped-page', 'data-scoped-placeholder']) {
      assert.ok(
        !panel.includes(hook),
        `the bulk panel must not name ${hook} anywhere, comments included`
      );
    }
  });
});

describe('the reachability banner names exactly the entity types still unreachable', () => {
  // AC-24, and it is the mechanism epic 1357 assigned to this lane. The paragraph was stale for
  // TOOLS for a whole release: prose is not a gate, and nothing detected it.
  //
  // THE PREDICATE IS THE IMPORT STATEMENT, NOT THE IDENTIFIER. Two essence pages name
  // `ScopedPlaceholderPage` in PROSE, so a name-matching derivation reports both as delegating
  // and reds for the wrong reason.
  const SPEC = 'openspec/specs/data-models/spec.md';

  /** Which world scoped-entity page files still delegate to the shared placeholder body. */
  function delegatingPages() {
    return readdirSync(resolve(repoRoot, SCOPED))
      .filter((entry) => entry.startsWith('World') && entry.endsWith('.svelte'))
      .filter((entry) => /^\s*import ScopedPlaceholderPage from/m.test(read(`${SCOPED}/${entry}`)));
  }

  it('the WALK resolves the whole world page set, so an empty answer is not a broken scan', () => {
    // THE SCAN IS ASSERTED AS WELL AS THE ANSWER. After this lane the unreachable set is EMPTY,
    // so the biconditional degenerates to `[] === []` — which is what a total failure of the walk
    // also produces.
    const pages = readdirSync(resolve(repoRoot, SCOPED)).filter(
      (entry) => entry.startsWith('World') && entry.endsWith('.svelte')
    );
    assert.ok(pages.length >= 7, `the walk resolved ${pages.length} world scoped pages`);
  });

  it('and the only page still delegating is the World Vocabulary, which is not a scoped entity', () => {
    // Excluded BY NAME rather than by inference: `### GM World Vocabulary Route` states that the
    // World Vocabulary is not a scoped-entity corpus, so it is outside the set this banner is
    // about however its body is built.
    assert.deepEqual(delegatingPages(), ['WorldVocabularyPage.svelte']);
  });

  it('the banner PARAGRAPH is matched by a named anchor rather than by a bare regex over prose', () => {
    const spec = read(SPEC);
    const anchor = '**REACHABILITY, DERIVED RATHER THAN ASSERTED.**';
    assert.ok(
      spec.includes(anchor),
      `the banner paragraph is addressed by "${anchor}"; a rewrite that dropped it would make ` +
        'every assertion below vacuous, which is why the anchor is asserted before it is used'
    );
    const paragraph = spec.slice(spec.indexOf(anchor), spec.indexOf(anchor) + 1200);

    // THE DERIVED SET IS EMPTY, and the banner says so.
    const unreachable = delegatingPages()
      .filter((entry) => entry !== 'WorldVocabularyPage.svelte')
      .map((entry) => entry.replace(/^World|Page\.svelte$/g, '').toLowerCase());
    assert.deepEqual(unreachable, [], 'the derived unreachable set');
    assert.match(
      paragraph,
      /is EMPTY/,
      'and the banner states an empty set rather than naming a type'
    );
    assert.match(
      paragraph,
      /world-vocabulary/,
      'naming the one route that still delegates and why it is outside the set'
    );
  });

  it('the banner still states that a reachable WRITER is not a consumed corpus', () => {
    // The other half of what this paragraph is for. A banner that said only "everything is
    // reachable" would leave a reader concluding a world tag list reaches a craft, and it does
    // not: the additive merge is resolver-only.
    const spec = read(SPEC);
    assert.match(spec, /A REACHABLE WRITER DOES NOT MAKE THE CORPUS CONSUMED/);
  });
});

describe('DOMAIN.md no longer claims nothing writes the world identity snapshot', () => {
  // AC-25. Without the positive half below, DELETING the whole row would pass.
  const domain = read('DOMAIN.md');
  const row = domain.split('\n').find((line) => line.startsWith('| **World Identity Snapshot**'));

  it('the row still exists and still names its detector', () => {
    assert.ok(Boolean(row), 'the World Identity Snapshot row is still in the glossary');
    assert.match(row, /reportWorldIdentityDrift/, 'and still names the detector that reports it');
  });

  it('and it no longer says nothing writes it', () => {
    assert.ok(
      !row.includes('NOTHING WRITES THEREAFTER'),
      'the world Component entry editor writes the snapshot, so the claim is false'
    );
    assert.match(row, /IT HAS A WRITER/, 'and the row says which direction changed');
  });
});
