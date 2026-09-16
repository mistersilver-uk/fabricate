/**
 * Shared test helper for loading Svelte 5 runes `.svelte.js` store modules under
 * `node:test`. Svelte runes cannot run un-compiled, so each module is compiled
 * with `compileModule` into a temp tree (whose `node_modules` is a junction back
 * to the repo's) and imported from there. Plain `.js` dependency modules a store
 * imports are copied verbatim into the same temp tree so their relative imports
 * resolve.
 *
 * This boilerplate is identical across store suites; importing it here (rather
 * than re-inlining the compile/symlink/rewrite scaffolding per test file) keeps
 * the SonarCloud new-code duplication gate green.
 */
import {
  readFileSync,
  writeFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileModule } from 'svelte/compiler';
import { rewriteClientImports } from './rewriteClientImports.js';

const repoRoot = resolve(import.meta.dirname, '../..');

// Mirrors the mounted harness's own scanner (`svelte-component-harness.js`): static
// `import`/`export ... from` specifiers only, which is all the temp tree has to resolve.
// A dynamic import is deliberately out of scope — none of the modules loaded here uses one,
// and a regex cannot resolve a computed specifier anyway.
const STATIC_IMPORT_PATTERN =
  /(?:^|[;\n])\s*(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;

/**
 * Resolve one relative specifier against the repo, trying the extensions Node and Vite
 * both accept. Returns a repo-relative path, or null when nothing resolves.
 */
function resolveLocalModule(importerPath, specifier) {
  const absolute = resolve(repoRoot, dirname(importerPath), specifier);
  const candidates = [
    absolute,
    `${absolute}.js`,
    `${absolute}.svelte.js`,
    `${absolute}.svelte`,
    join(absolute, 'index.js'),
  ];
  const match = candidates.find((candidate) => existsSync(candidate));
  return match ? relative(repoRoot, match).replaceAll('\\', '/') : null;
}


/**
 * Create a temp compiler for a single test suite.
 *
 * @param {string} [prefix] mkdtemp prefix for the temp root.
 * @returns {{ tempRoot: string, compile: Function, copyPlain: Function, load: Function,
 *   loadWithClosure: Function, cleanup: Function }}
 */
export function createSvelteModuleCompiler(prefix = 'fabricate-svelte-') {
  const tempRoot = mkdtempSync(join(tmpdir(), prefix));
  symlinkSync(resolve(repoRoot, 'node_modules'), join(tempRoot, 'node_modules'), 'junction');

  /** Compile a runes `.svelte.js` module into the temp tree; returns its path. */
  function compile(sourcePath) {
    const source = readFileSync(resolve(repoRoot, sourcePath), 'utf8');
    const compiled = compileModule(source, { filename: sourcePath, generate: 'client', dev: true });
    const destination = join(tempRoot, `${sourcePath}.js`);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, rewriteClientImports(compiled.js.code));
    return destination;
  }

  /** Copy a plain `.js` dependency verbatim so a compiled module's import resolves. */
  function copyPlain(sourcePath) {
    const destination = join(tempRoot, sourcePath);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(resolve(repoRoot, sourcePath), destination);
    return destination;
  }

  /** Compile + dynamically import a runes module, returning its namespace. */
  async function load(sourcePath) {
    const destination = compile(sourcePath);
    return import(pathToFileURL(destination));
  }

  /**
   * Copy every plain `.js` module the entry transitively imports, then compile and import
   * it — the same thing {@link load} does, minus the hand-maintained copy list.
   *
   * ## Why this exists
   *
   * `load` needs its caller to have already copied each of the entry's dependencies, and a
   * dependency the store imports but the suite did not copy does not FAIL the suite: the
   * temp-tree import throws inside `before`, every test is reported `cancelled`, and the
   * summary still says `fail 0`. So the cost of an omission is a silent gap, and the list
   * has to be re-audited by hand every time anyone adds an import to a store — which is
   * exactly the drift that has already bitten this repo's mounted-harness lists.
   *
   * Walking the real import graph removes the list, and with it the class of defect. A
   * suite that deliberately wants a NARROWER tree (to mock a leaf, say) still uses
   * `copyPlain` + `load` and keeps its explicit list; this is the default, not the only way.
   *
   * ## What it deliberately refuses
   *
   * Only the ENTRY may be a runes module. `compile` writes to `<path>.js`, so a nested
   * `.svelte.js` would need its importer's specifier rewritten to match, and a `.svelte`
   * component needs the mounted harness rather than this one. Both throw here rather than
   * being copied as if they were plain modules, because the failure mode otherwise is once
   * again a hang rather than a message.
   *
   * @param {string} entryPath repo-relative path to a `.svelte.js` runes module.
   * @returns {Promise<object>} the module namespace.
   */
  async function loadWithClosure(entryPath) {
    const seen = new Set([entryPath]);
    const pending = [entryPath];
    while (pending.length > 0) {
      const importerPath = pending.pop();
      const source = readFileSync(resolve(repoRoot, importerPath), 'utf8');
      for (const match of source.matchAll(STATIC_IMPORT_PATTERN)) {
        const specifier = match[1];
        if (!specifier.startsWith('.')) continue;
        const importedPath = resolveLocalModule(importerPath, specifier);
        if (!importedPath) {
          throw new Error(
            `${importerPath} imports ${specifier}, which resolves to no local module`
          );
        }
        if (seen.has(importedPath)) continue;
        if (importedPath.endsWith('.svelte') || importedPath.endsWith('.svelte.js')) {
          throw new Error(
            `${importerPath} imports ${importedPath}; loadWithClosure copies plain modules only, ` +
              'so compile that one explicitly or use the mounted component harness'
          );
        }
        seen.add(importedPath);
        copyPlain(importedPath);
        pending.push(importedPath);
      }
    }
    return load(entryPath);
  }

  function cleanup() {
    rmSync(tempRoot, { recursive: true, force: true });
  }

  return { tempRoot, compile, copyPlain, load, loadWithClosure, cleanup };
}
