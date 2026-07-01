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
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileModule } from 'svelte/compiler';

const repoRoot = resolve(import.meta.dirname, '../..');

function rewriteClientImports(code) {
  return code.replace(/from 'svelte';/g, "from 'svelte/internal/client';");
}

/**
 * Create a temp compiler for a single test suite.
 *
 * @param {string} [prefix] mkdtemp prefix for the temp root.
 * @returns {{ tempRoot: string, compile: Function, copyPlain: Function, load: Function, cleanup: Function }}
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

  function cleanup() {
    rmSync(tempRoot, { recursive: true, force: true });
  }

  return { tempRoot, compile, copyPlain, load, cleanup };
}
