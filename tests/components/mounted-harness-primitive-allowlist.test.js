/**
 * Guard for a hand-maintained mirror that fails SILENTLY.
 *
 * Every mounted-Svelte suite names the `.svelte` modules its temp tree compiles. A component
 * the mounted tree renders but the list omits does NOT fail the suite — it HANGS it, and
 * `node --test` reports the blocked tests as `# cancelled N`, never `# fail`. Suites built on
 * `createMountedComponentHarness` are covered by its own dependency-closure validator, but
 * several older suites still hand-roll the compile/mount boilerplate and have no such check.
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
  // trees already: `ChecklistCardRow` renders the checkbox for the Tool Studio while the
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
  // directly under `apps/manager/` rather than `components/` because their scoped CSS reads
  // `--fab-mv2-*`, which is declared on `.fabricate-manager` and undefined outside it. Each
  // is already in two mounted trees — the browser view's and the bulk panel's — and reaches
  // a third through the manager root, so an omission costs a HUNG suite, not a failing one.
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

test('the shared primitives are reachable from the manager root, so the guard has teeth', () => {
  // If this ever stops holding, the guard above is vacuous and the walk needs revisiting.
  const rootClosure = closures.get('src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte');
  assert.ok(rootClosure, 'the manager root is a tracked component');
  for (const primitive of SHARED_PRIMITIVES) {
    assert.ok(
      rootClosure.has(primitive),
      `${primitive} should be reachable from the manager root's static graph`
    );
  }
});
