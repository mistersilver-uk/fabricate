/** Shared test helper for loading Svelte 5 runes `.svelte.js` store modules under `node:test`. */
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
   * Copy every plain `.js` module the entry transitively imports and compile every `.svelte.js`
   * one, then compile and import the entry — the same thing {@link load} does, minus the
   * hand-maintained copy list.
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
        if (importedPath.endsWith('.svelte')) {
          throw new Error(
            `${importerPath} imports the component ${importedPath}; loadWithClosure handles ` +
              'modules only, so use the mounted component harness'
          );
        }
        seen.add(importedPath);
        // A rune module is compiled rather than copied, and still walked: its own plain imports
        // have to be copied in too (issue 1673).
        if (importedPath.endsWith('.svelte.js')) compile(importedPath);
        else copyPlain(importedPath);
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
