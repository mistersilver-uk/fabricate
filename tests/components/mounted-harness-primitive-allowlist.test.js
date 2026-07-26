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
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');

const SHARED_PRIMITIVES = [
  'src/ui/svelte/apps/manager/EmptyState.svelte',
  'src/ui/svelte/apps/manager/Callout.svelte',
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
];

// `import X from './Y.svelte'` — the only form the mount harnesses' temp tree resolves.
const SVELTE_IMPORT = /import\s+\w+\s+from\s+'([^']+\.svelte)'/g;

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

    const named = componentPaths.filter((path) => suite.includes(`'${path}'`));
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
