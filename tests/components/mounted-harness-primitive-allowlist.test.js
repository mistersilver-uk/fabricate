/**
 * Guard for a hand-maintained mirror that fails SILENTLY.
 *
 * Every mounted-Svelte suite names the `.svelte` modules its temp tree compiles. A component
 * the mounted tree renders but the list omits does NOT fail the suite: its `before()` hook
 * throws, so `node --test` cancels every test in the file and reports `# cancelled N`, never
 * `# fail`. Watch the cancelled count and not just the failure count — this is the omission a
 * green-looking run hides. Neither form HANGS, so a run that merely looks slow is a different
 * problem:
 *
 * - A `createMountedComponentHarness` suite throws up front out of
 *   `validateMountedComponentDependencies`, naming the importer, the missing module and the
 *   list to add it to ("... add it to compiledModules"). That is the loud case, and it is why
 *   those suites are exempt from the vacuity ratchet below.
 * - A suite that still hand-rolls the compile/mount boilerplate has no such check, so it gets
 *   as far as importing the temp tree and dies with `ERR_MODULE_NOT_FOUND` on the compiled
 *   `<path>.svelte.js`. Same `# cancelled`, but the module is named only in the stack — which
 *   is what this guard exists to turn into a named, test-time failure.
 *
 * This is recorded HERE, once, because it is a property of the harnesses rather than of any
 * one entry. Issue 1428 restated it beside fifteen individual entries in the compile lists, in
 * prose that said the suite hangs; it does not, and fifteen byte-identical copies of a wrong
 * sentence are also precisely the near-identical block SonarCloud's duplication gate counts.
 *
 * Issue 785 made this sharp: `EmptyState` and `Callout` are the manager's shared no-state and
 * standing-statement primitives, so adding either to one more screen silently pulls it into
 * the static module graph of every suite that mounts a tree containing that screen. This test
 * walks the real static import closure of the components each suite names and asserts the
 * primitive is named too, so the omission fails at test time instead of vanishing into the
 * cancelled count.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');

const SHARED_PRIMITIVES = [
  'src/ui/svelte/apps/manager/EmptyState.svelte',
  'src/ui/svelte/apps/manager/Callout.svelte',
  // The manager's ONE selection control and ONE essence quantity card (issue 772), and the
  // shared editable-input stepper the card is built on. All three sit in two or more mounted
  // trees already: the Tool Studio's prerequisite row trails the checkbox while the
  // component browser's multi-select renders it a second way, and the card is rendered by
  // both the component editor and the browser's bulk-edit rail. They could not be listed here
  // before the `named` detection below was narrowed — a bare substring match produced false
  // positives that made every one of them unaddable.
  'src/ui/svelte/components/SelectionCheckbox.svelte',
  'src/ui/svelte/components/Stepper.svelte',
  'src/ui/svelte/apps/manager/components/EssenceQuantityCard.svelte',
  // The manager's ONE modal-dialog chrome (issue 877). Both import-flow modals render
  // through it, so adding it to a third screen would silently pull it into every suite
  // that mounts a tree containing that screen.
  'src/ui/svelte/apps/manager/ManagerModal.svelte',
  // The manager's ONE "how this surface works" explainer card and ONE icon fact row
  // (issue 881). Both are side-panel primitives, so the Tool Studio and the Tags &
  // Categories rail already pull them into two different mounted trees and the next
  // side panel will pull them into a third.
  'src/ui/svelte/apps/manager/ExplainerCard.svelte',
  'src/ui/svelte/apps/manager/IconFactRow.svelte',
  // The manager's ONE chip (issue 883). This is the sharpest case yet: chips are on
  // essentially every manager screen, so as the conversion proceeds this component enters
  // the static graph of almost every mounted tree, and each omission costs a HUNG suite.
  'src/ui/svelte/apps/manager/Chip.svelte',
  // The manager's ONE multi-select toolbar and ONE bulk-edit chrome (issue 1010), extracted
  // so the Component Studio and the Recipe Studio render the same controls. They live
  // directly under `apps/manager/` rather than `components/` because every module importing
  // one is under `src/ui/svelte/apps/manager/`, and because `BulkEditPanelShell` is coupled
  // to the area by SELECTOR — its scoped block carries `:global(.fabricate-manager
  // .manager-button…)` rules and a `fabricate-manager` container query. Their root classes
  // are `fab-bulk-*` and are not the reason. The reason once recorded here, that
  // the placement lets them reach an area-scoped `--fab-manager-*` property, has LAPSED,
  // since a scoped `<style>` may not reach one from any directory. What matters for THIS
  // list is untouched by that: each is already in two mounted trees — the browser view's
  // and the bulk panel's — and reaches a third through the manager root, so an omission
  // costs a HUNG suite, not a failing one.
  'src/ui/svelte/apps/manager/BulkSelectionToolbar.svelte',
  'src/ui/svelte/apps/manager/BulkEditPanelShell.svelte',
  'src/ui/svelte/apps/manager/BulkEditSection.svelte',
  'src/ui/svelte/apps/manager/BulkEditSelect.svelte',
  // THE right-inspector action button (issue 1036, maintainer round 2), extracted from the
  // Tool Studio's editor-header treatment and declared the point of arrival for every
  // studio's inspector actions. It is deliberately here BEFORE the sweep that converts the
  // recipe, component and Tool Studio inspectors: each conversion drops it into another
  // mounted tree, and this is the guard that turns the resulting omission into a failure
  // instead of a hung suite.
  'src/ui/svelte/apps/manager/InspectorActionButton.svelte',
  // The product's ONE horizontal fill bar, ONE threshold band strip and ONE row disclosure
  // (issue 1096). `FillBar` is the sharpest of the three: `ui-integration/spec.md` records
  // five hand-rolled copies of that shape as a live non-conformance, so every future
  // conversion drops it into another mounted tree — the gathering player suites already
  // pulled it in through `ChanceBar`'s rebuild, and four more sites are named debt.
  // `RowDisclosure` came OFF this list at issue 1096's maintainer parity round, because the
  // Checks right rail's two collapsible panels were removed and it was left with ZERO
  // consumers — which is precisely the state the reachability guard below exists to report,
  // so it came off the list rather than the guard being loosened for it. That note also said
  // it goes back ON the moment something renders it, and issue 1286 is that moment:
  // `ComplicationSummaryRow` is the "summary row with condition sentence, effect chip and
  // disclosure" the component's own docblock named as its intended second site, and it is
  // reachable from the manager root through `ComponentEditView`.
  'src/ui/svelte/components/RowDisclosure.svelte',
  'src/ui/svelte/components/FillBar.svelte',
  'src/ui/svelte/components/ThresholdBandStrip.svelte',
  // THE manager's labelled push-button (issue 1096). It is the sharpest entry on this list
  // after `Chip`: `manager-button` is a CSS convention repeated across more than sixty
  // components, so every step of the conversion sweep drops this primitive into another
  // mounted tree. Two screens use it today — the Modifiers card in `SystemEditView` and the
  // Tool Studio header, which is the authority the primitive reproduces — and they already
  // sit in four different mounted trees between them.
  'src/ui/svelte/components/ManagerButton.svelte',
  // THE manager's icon-only push-button (issue 1422), and the widest entry on this list by
  // reach: 36 components render it as this lands, against `ManagerButton`'s 50 but spread
  // across nearly every studio, browser, inspector and editor tab. `Pagination.svelte`
  // renders two of them, which is what carries it out of the manager entirely and into the
  // player-app suites — so a suite mounting a tree that merely PAGINATES pulls this leaf in
  // without naming any icon button at all, and an omission costs a HUNG suite rather than a
  // failing one.
  'src/ui/svelte/components/IconButton.svelte',
  // THE manager's editor tab strip (issue 1362), and on this list since issue 1429 gave it
  // the Rail Marker Family and converted the Checks section strip and the Knowledge tabs
  // onto it. Issue 1038 converted three more — the recipe, essence and tool editors — so
  // EIGHT wrapping strips call it, and each of those wrappers sits in a different mounted
  // tree. That is what makes it sharp: every further strip that stops hand-rolling its
  // markers drops it into another mounted tree, and each omission costs a HUNG suite rather
  // than a failing one.
  'src/ui/svelte/apps/manager/EditorTabs.svelte',
  // THE manager's on/off switch (issue 1040). Sharper again than `ManagerButton`: the switch
  // shipped as a hand-rolled element TREE at 37 sites in 26 components, and converting them
  // dropped this leaf into 25 mounted trees in one change — the browsers, every studio's
  // overview tab, the Checks rail, the scoped-entity rows and `ToggleCard`, which is itself
  // rendered by ten more. An omission in any harness that compiles one of those HANGS the
  // suite as `# cancelled` rather than failing it.
  'src/ui/svelte/components/StatusToggle.svelte',
  // THE manager's card shell (issue 1427), extracted from 80 hand-written
  // `class="manager-inspector-card"` sections. It is the widest entry on this list after `Chip`
  // by reach rather than by call count: 19 components render it and they are spread across the
  // Checks Studio, both environment inspectors, the essence inspector, the Tool Studio, the
  // books-and-scrolls inspector and the shared bulk-delete card — so almost every mounted
  // manager tree pulls it in, and the root's 32 deferred sites will pull it into the rest when
  // they convert.
  'src/ui/svelte/components/InspectorCard.svelte',
  // THE manager's labelled form field, the `.manager-field` column (issue 1428). Sharper again
  // than `ManagerButton`: `manager-field` was a CSS convention on 88 elements across 24
  // components, and 81 of them in 23 components became this primitive in one change. It is now
  // in the static graph of nearly every manager editor tree, so the next screen that grows a
  // field cancels its suite on an omission here rather than failing it.
  'src/ui/svelte/components/Field.svelte',
  // The scoped-entity list composition and the world-catalogue shell over it (issue 1380).
  // `EntityListInspectorFrame` is the sharpest entry since `Chip`: SIX screens across four
  // lanes of epic 1357 compose it, so every lane that lands drops it into another mounted
  // tree, and each omission costs a HUNG suite rather than a failing one.
  //
  // `EntityRulesListShell` is deliberately NOT here yet, and that is the guard below working
  // rather than an oversight: nothing renders it, so it is reachable from no declared
  // application root and adding it would red the reachability assertion. `RowDisclosure`
  // came off this list for exactly that reason at issue 1096's parity round, and the note
  // there records that it goes back on the moment something renders it. Same rule: the lane
  // whose screen composes the rules-list shell adds it in that change.
  'src/ui/svelte/apps/manager/scoped/EntityListInspectorFrame.svelte',
  'src/ui/svelte/apps/manager/scoped/EntityCatalogueShell.svelte',
  // THE manager's filter bar and its search field (issue 1039). The pair reaches every browse
  // screen in the manager — systems, recipes, components, essences, environments, gathering
  // tasks and events, realms, books-and-scrolls, access and both world scoped-entity lists —
  // and the field reaches four editors and two rosters on top of that, so between them they sit
  // in more mounted trees than any entry above except `Chip`.
  'src/ui/svelte/components/ManagerSearchField.svelte',
  'src/ui/svelte/components/ManagerToolbar.svelte',
  // THE editor validation surface (issue 1444), closed onto seven renderers across the Checks
  // Studio, the essence and Tool studios, the world essence entry page and both recipe
  // editors. It sits in more mounted trees than its four direct callers suggest, because the
  // scoped shell in between puts it in every tree that mounts an essence or a tool — and the
  // conversion that closed it dropped it into two more, each of which had to name it or hang.
  'src/ui/svelte/apps/manager/EditorValidationSurface.svelte',
  // THE manager's searchable picker (issue 1458), and the entry with the LONGEST tail: it
  // renders `Chip` and `EmptyState`, both already here, so an omission does not cancel one
  // suite's tests — it cancels them for the reason a reader will not look for, a missing
  // dependency of a dependency. 16 components call it as this lands and the conversion adds
  // three more (`GatheringEventEditView`, `GatheringTaskEditView`, `ModifierPillSelect`) plus
  // `RecipeItemContentsTab`, which is what carries it out of the editors this list already
  // covers and into the recipe-item, subject-modifier and gathering-stepper trees.
  //
  // `ModifierPillSelect` is the sharpest of those: it is a LEAF two rungs down — the recipe
  // Overview tab and the Checks card render it — so a suite that mounts either pulls this
  // picker in without naming a popover anywhere, which is exactly the shape this list exists
  // to turn into a named failure rather than a cancelled run.
  'src/ui/svelte/components/SearchablePopover.svelte',
  // THE shared overflow action menu (issue 1477). It is a LEAF TWO RUNGS DOWN, which is the shape
  // this list exists for: the environment editor's Tasks and Events tabs render it through
  // `environment/CompositionList`, and the component editor renders it through
  // `component/ComponentIdentityStrip`, so a suite that mounts either editor pulls this in without
  // naming a menu anywhere. It also renders `IconButton` as its trigger, which is already here —
  // so an omission cancels a suite for the reason a reader will not look for, a missing dependency
  // of a dependency. That is exactly how this conversion first reported: `# cancelled 7`, no
  // failures, on a suite whose tests never ran.
  'src/ui/svelte/components/ActionMenu.svelte',
];

// `import X from './Y.svelte'` — the only form the mount harnesses' temp tree resolves.
const SVELTE_IMPORT = /import\s+\w+\s+from\s+'([^']+\.svelte)'/g;

// The three forms a suite uses to DECLARE what its temp tree compiles.
const WRITE_COMPILED = /writeCompiledSvelte\(\s*([^)]*?)\s*\)/g;
const COMPILED_MODULES = /compiledModules\s*:\s*\[([\s\S]*?)\]/g;
// A template-literal compile inside a loop: writeCompiledSvelte(`prefix/${part}.svelte`).
const TEMPLATE_COMPILE = /^`([^`$]*)\$\{(\w+)\}([^`]*)`$/;
// The SAME compile loop with no template at all — `writeCompiledSvelte(component)` over a
// list of whole paths (`environment-composition-list-mounted`). Without this the argument is
// a bare identifier, `literalsIn` finds no quoted path in it, and the suite reads as
// compiling NOTHING — so every primitive its tree renders passes vacuously. That is not
// hypothetical: this guard reported clean while that suite hung on a missing `Stepper`.
const BARE_LOOP_COMPILE = /^(\w+)$/;
// Deliberately path-SHAPED rather than `'([^']+)'`. These lists are heavily commented and the
// comments contain apostrophes ("the manager's ONE chip"), which desynchronise naive quote
// pairing and make it read prose as module paths. Requiring no whitespace inside the quotes
// means a stray apostrophe pair can never match, because the text between two of them always
// spans words.
const QUOTED = /'([\w./@-]+)'/g;

/**
 * The set of component paths a suite actually COMPILES into its temp tree.
 *
 * This deliberately does NOT ask whether the suite merely mentions a path. A suite that
 * reads a component's source to assert on its text — `component-identity-strip-mounted`
 * does exactly this for `ComponentEditView.svelte` — mentions the path without compiling
 * anything, and treating that as a compile made the guard demand primitives the suite can
 * never render. The mirror image is just as wrong: `manager-mounted` registers the shared
 * leaves by BARE NAME through `sharedComponentNames` and interpolates them into a template,
 * so a path-only match saw those as uncompiled. Between them, those two false readings are
 * why `Stepper` was excluded from the allowlist and why the issue 772 primitives could not
 * be added at all.
 */
function compiledPathsOf(suite) {
  // `const NAME = [ … ]` — the backing array for both `...NAME` spreads inside a
  // `compiledModules` list and `for (const x of NAME)` compile loops.
  //
  // A spread's backing array may be IMPORTED rather than declared here (issue 1095, BM9):
  // the checks tree's manifest is ONE exported constant under `tests/helpers/`, imported by
  // every checks suite so a new dependency is added in one place instead of N. Resolving
  // only same-file consts would read those suites as compiling NOTHING, and this guard
  // would red for the very shape it is meant to make safe.
  const arrays = new Map([
    ...importedArraysOf(suite),
    ...[...suite.matchAll(/const\s+(\w+)\s*=\s*\[([^\]]*)\]/g)].map(([, name, body]) => [
      name,
      body,
    ]),
  ]);
  const literalsIn = (body) => [...body.matchAll(QUOTED)].map(([, value]) => value);

  const declared = [];
  const regions = [
    ...[...suite.matchAll(WRITE_COMPILED)].map(([, argument]) => argument),
    ...[...suite.matchAll(COMPILED_MODULES)].map(([, body]) => body),
  ];

  // The list a `for (const <variable> of …)` compile loop iterates, inline or by const name.
  const loopMembers = (variable) => {
    const binding = new RegExp(
      `for\\s*\\(\\s*const\\s+${variable}\\s+of\\s+(\\[[^\\]]*\\]|\\w+)\\s*\\)`
    ).exec(suite);
    if (!binding) return null;
    return literalsIn(binding[1].startsWith('[') ? binding[1] : (arrays.get(binding[1]) ?? ''));
  };

  for (const region of regions) {
    const template = TEMPLATE_COMPILE.exec(region.trim());
    if (template) {
      // A compile loop. The iterated list is either inline — `for (const part of ['A','B'])`
      // — or a named const, and both forms are in use in the same suite.
      const [, prefix, variable, suffix] = template;
      const members = loopMembers(variable);
      if (!members) continue;
      for (const member of members) declared.push(`${prefix}${member}${suffix}`);
      continue;
    }

    const bare = BARE_LOOP_COMPILE.exec(region.trim());
    if (bare) {
      // The same loop with whole paths and no template around the variable.
      for (const member of loopMembers(bare[1]) ?? []) declared.push(member);
      continue;
    }

    for (const value of literalsIn(region)) declared.push(value);
    // `compiledModules: [...SHARED, 'one/more.svelte']` — hoisting a shared list into a const
    // is the repo's own idiom for naming a primitive once across two harnesses in one file.
    for (const [, spread] of region.matchAll(/\.\.\.(\w+)/g)) {
      for (const value of literalsIn(arrays.get(spread) ?? '')) declared.push(value);
    }
  }

  return declared;
}

/**
 * Backing arrays a suite IMPORTS, keyed by the local name it spreads them under.
 *
 * Only relative specifiers under `tests/` are followed, and only exported `const NAME = [ … ]`
 * declarations are read: a helper that computed its list would be unreadable here, and this
 * guard would rather see nothing than guess.
 * @param {string} suite Source text of the suite.
 * @returns {Array<[string, string]>} `[localName, arrayBody]` pairs.
 */
function importedArraysOf(suite) {
  const pairs = [];
  for (const [, names, specifier] of suite.matchAll(/import\s*\{([^}]*)\}\s*from\s*'(\.[^']+)'/g)) {
    const resolved = resolve(repoRoot, 'tests/components', specifier);
    if (!existsSync(resolved)) continue;
    const source = readFileSync(resolved, 'utf8');
    const declared = new Map(
      [...source.matchAll(/export\s+const\s+(\w+)\s*=\s*Object\.freeze\(\[([^\]]*)\]/g)].map(
        ([, name, body]) => [name, body]
      )
    );
    for (const raw of names.split(',')) {
      const name = raw.trim().split(/\s+as\s+/).at(-1);
      if (declared.has(name)) pairs.push([name, declared.get(name)]);
    }
  }
  return pairs;
}

function repoPathsUnder(directory, extension) {
  return readdirSync(resolve(repoRoot, directory), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) =>
      relative(repoRoot, resolve(entry.parentPath, entry.name)).replaceAll('\\', '/')
    );
}

function readRepoFile(repoPath) {
  return readFileSync(resolve(repoRoot, repoPath), 'utf8');
}

const componentPaths = repoPathsUnder('src', '.svelte');

const componentImports = new Map(
  componentPaths.map((componentPath) => [
    componentPath,
    [...readRepoFile(componentPath).matchAll(SVELTE_IMPORT)].map(([, specifier]) =>
      posix.normalize(posix.join(posix.dirname(componentPath), specifier))
    ),
  ])
);

function closureOf(componentPath, seen = new Set()) {
  for (const dependency of componentImports.get(componentPath) || []) {
    if (seen.has(dependency)) continue;
    seen.add(dependency);
    closureOf(dependency, seen);
  }
  return seen;
}

const closures = new Map(componentPaths.map((path) => [path, closureOf(path)]));

test('every hand-rolled mount harness names the shared primitives its tree renders', () => {
  const suitePaths = repoPathsUnder('tests', '.test.js');
  const gaps = [];

  for (const suitePath of suitePaths) {
    const suite = readRepoFile(suitePath);
    // A suite that compiles nothing cannot hang on a missing component.
    if (!suite.includes('writeCompiledSvelte') && !suite.includes('compiledModules')) continue;

    const compiled = new Set(compiledPathsOf(suite));
    const named = componentPaths.filter((path) => compiled.has(path));
    const required = new Set(
      SHARED_PRIMITIVES.filter(
        (primitive) =>
          !named.includes(primitive) &&
          named.some((path) => closures.get(path).has(primitive))
      )
    );

    for (const primitive of required) {
      gaps.push(`${suitePath} mounts a tree that renders ${primitive} but never compiles it`);
    }
  }

  assert.deepEqual(
    gaps,
    [],
    `a missing entry HANGS the suite (# cancelled), it does not fail it:\n- ${gaps.join('\n- ')}`
  );
});

test('every inspected suite resolves at least one real component, so none passes vacuously', () => {
  // The RATCHET on the guard above, and it is the missing half rather than a nicety. A suite
  // whose declaration form `compiledPathsOf` cannot read contributes an EMPTY set: `named` is
  // then empty, `required` is empty, and the suite reports clean while hanging on a missing
  // component. That is not hypothetical — it is exactly how the `BARE_LOOP_COMPILE` defect
  // survived, and disabling that branch today still leaves the suite above green.
  //
  // So: a suite that compiles something must resolve at least one path that is a real tracked
  // `.svelte` file. Suites built on `createMountedComponentHarness` are exempt because its own
  // `validateMountedComponentDependencies` throws in `before()` naming the missing module, which
  // is a loud failure rather than a silent gap.
  const unreadable = [];
  for (const suitePath of repoPathsUnder('tests', '.test.js')) {
    const suite = readRepoFile(suitePath);
    if (!suite.includes('writeCompiledSvelte') && !suite.includes('compiledModules')) continue;
    if (suite.includes('createMountedComponentHarness')) continue;
    // The scoped-screen factories (`tests/helpers/componentScopeMountModules.js`) hand a suite
    // its `compiledModules` as a RETURN VALUE, not as a literal it declares, and they carry
    // their own closure exactly as `createMountedComponentHarness` does — so a suite that only
    // reads that manifest back (issue 1371's rendered catalogue suite walks it for scoped
    // `<style>` blocks) names no path this parser can read, and is not vacuous for it.
    if (suite.includes('componentScopeMountModules.js')) continue;

    const compiled = new Set(compiledPathsOf(suite));
    if (!componentPaths.some((path) => compiled.has(path))) unreadable.push(suitePath);
  }

  assert.deepEqual(
    unreadable,
    [],
    'these suites compile components the parser cannot read, so the guard above holds over an '
      + 'empty set for them and reports clean whatever they render:\n- '
      + unreadable.join('\n- ')
  );
});

// The declared APPLICATION ROOTS a shared primitive may live under.
//
// It was one root — the manager's — and `ui-integration/spec.md` §Shared product UI
// primitives recorded that as a live non-conformance in as many words: the rule's subject
// is "every product surface, the GM manager and the player crafting, alchemy, gathering,
// inventory and Journal surfaces alike", while the allowlist that encodes "this is a shared
// primitive" was structurally manager-scoped. `FillBar` is the first entry the rule always
// admitted and the guard could not: it lives under `ChanceBar`, in the player gathering app,
// and nothing in the manager renders it. Widening to a declared root SET is the fix that
// spec names, and it is a widening rather than a weakening — a primitive must still be
// reachable from a real application root, just not from that one.
const APPLICATION_ROOTS = [
  'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte',
  'src/ui/svelte/apps/gathering/GatheringView.svelte',
];

test('the shared primitives are reachable from a declared application root, so the guard has teeth', () => {
  // If this ever stops holding, the guard above is vacuous and the walk needs revisiting.
  const rootClosures = APPLICATION_ROOTS.map((root) => {
    const closure = closures.get(root);
    assert.ok(closure, `${root} is a tracked component`);
    return closure;
  });
  for (const primitive of SHARED_PRIMITIVES) {
    assert.ok(
      rootClosures.some((closure) => closure.has(primitive)),
      `${primitive} should be reachable from at least one declared application root`
    );
  }
});
