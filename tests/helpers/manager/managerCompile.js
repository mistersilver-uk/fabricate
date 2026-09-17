/**
 * The manager root's compiled temp tree, DERIVED from the root's own static import closure
 * (issue 1669). The list was 161 hand-written `writeCompiledSvelte(...)` calls, and a hand list
 * cannot go stale loudly here: a component the tree renders and the list omits does not fail the
 * mounted suite, it HANGS it, and `node --test` reports the blocked tests as `# cancelled`.
 *
 * `tests/helpers/` is outside the `npm test` glob; `tests/helpers-manager.test.js` proves this
 * module from inside it.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';

import { repoRoot, stripComments } from '../sourceScan.js';
import { rewriteClientImports } from '../svelte-component-harness.js';

/** The component every manager mount suite renders. */
export const MANAGER_ROOT = 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte';

/**
 * A RELATIVE specifier in `from '…'`, `import '…'` or `import('…')`. A bare specifier is the
 * package graph and resolves through the temp tree's `node_modules` symlink instead.
 *
 * The specifier may hold no whitespace and comments are blanked before matching, because prose in
 * this tree spells import-shaped sentences: unguarded, one of them resolved to a five-line path.
 */
const RELATIVE_SPECIFIER = /(?:\bfrom|\bimport)\s*\(?\s*['"](\.[^'"\s]+)['"]/g;

/**
 * Non-vacuity floor, shared by the derivation and the closure check below. The real graph is
 * ~390 modules; a walk that collapses to a handful compiles a tree that hangs rather than fails.
 */
export const CLOSURE_FLOOR = 50;

/**
 * Every module the mounted root's STATIC graph reaches, split by what the temp tree does with it.
 *
 * The static graph and not the rendered one is what decides, because a compiled `.svelte.js`
 * imports its children unconditionally: an `{#if}` that never runs still needs its child on disk.
 *
 * @param {string} [rootPath] The mounted root, repo-relative.
 * @returns {{ components: string[], modules: string[] }} Sorted repo-relative paths.
 */
export function deriveManagerModuleClosure(rootPath = MANAGER_ROOT) {
  const components = [];
  const modules = [];
  const seen = new Set();
  const queue = [rootPath];
  while (queue.length > 0) {
    const current = queue.pop();
    if (seen.has(current)) continue;
    seen.add(current);
    const absolute = resolve(repoRoot, current);
    if (!existsSync(absolute)) {
      throw new Error(
        `${current} is reached from ${rootPath} but is not on disk, so the derived compile ` +
          'list cannot be trusted'
      );
    }
    (current.endsWith('.svelte') ? components : modules).push(current);
    const source = stripComments(readFileSync(absolute, 'utf8'));
    for (const [, specifier] of source.matchAll(RELATIVE_SPECIFIER)) {
      const child = relative(repoRoot, resolve(dirname(absolute), specifier)).replaceAll('\\', '/');
      if (child.endsWith('.js') || child.endsWith('.svelte')) queue.push(child);
    }
  }
  if (seen.size < CLOSURE_FLOOR) {
    throw new Error(
      `the manager closure walk reached only ${seen.size} modules from ${rootPath}; the walk is ` +
        'broken, so the tree it would compile cannot be trusted'
    );
  }
  return { components: components.sort(), modules: modules.sort() };
}

/** Compile one component into the temp tree, recording that it was written. */
function writeCompiled(tempRoot, compiledSveltePaths, sourcePath) {
  const source = readFileSync(resolve(repoRoot, sourcePath), 'utf8');
  const compiled = compile(source, {
    filename: sourcePath,
    generate: 'client',
    dev: true,
    css: 'injected',
  });
  const destination = join(tempRoot, `${sourcePath}.js`);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, rewriteClientImports(compiled.js.code));
  compiledSveltePaths.add(sourcePath.replaceAll('\\', '/'));
}

/** Copy one plain module verbatim; the compiled components resolve their imports against these. */
function copyRawModule(tempRoot, sourcePath) {
  const destination = join(tempRoot, sourcePath);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, readFileSync(resolve(repoRoot, sourcePath), 'utf8'));
}

/**
 * Compile the whole derived closure into `tempRoot`.
 *
 * @param {string} tempRoot A directory already carrying a `node_modules` symlink.
 * @param {string} [rootPath] The mounted root, repo-relative.
 * @returns {Set<string>} Every component written, for `assertCompiledSvelteClosure`.
 */
export function compileManagerTree(tempRoot, rootPath = MANAGER_ROOT) {
  const { components, modules } = deriveManagerModuleClosure(rootPath);
  const compiledSveltePaths = new Set();
  for (const component of components) writeCompiled(tempRoot, compiledSveltePaths, component);
  for (const module of modules) copyRawModule(tempRoot, module);
  return compiledSveltePaths;
}

/** The default export of one component already compiled into `tempRoot`. */
export async function importCompiledComponent(tempRoot, sourcePath) {
  const module = await import(pathToFileURL(join(tempRoot, `${sourcePath}.js`)));
  return module.default;
}

/**
 * THE CLOSURE CHECK, kept after the derivation replaced the hand list (issue 1362, issue 1669).
 *
 * It re-walks the root's `.svelte` graph with its OWN narrow matcher against the set the compile
 * actually WROTE, so it is an independent reading rather than a restatement of the derivation:
 * a seed the walk never reaches, a regex that stops matching, or a write that silently fails all
 * surface here. Left undetected each of them hangs the suite — `node --test` reports the blocked
 * tests as `# cancelled`, never `# fail`.
 *
 * @param {Set<string>} compiledSveltePaths Every component `compileManagerTree` wrote.
 * @param {string} [rootPath] The mounted root, repo-relative.
 * @throws {Error} naming every reached-but-uncompiled component and who imports it.
 */
export function assertCompiledSvelteClosure(compiledSveltePaths, rootPath = MANAGER_ROOT) {
  const seen = new Set();
  const queue = [rootPath];
  const missing = [];
  while (queue.length > 0) {
    const current = queue.pop();
    if (seen.has(current)) continue;
    seen.add(current);
    const absolute = resolve(repoRoot, current);
    if (!existsSync(absolute)) continue;
    const source = readFileSync(absolute, 'utf8');
    for (const match of source.matchAll(/from\s+['"](\.[^'"]+\.svelte)['"]/g)) {
      const child = relative(repoRoot, resolve(dirname(absolute), match[1])).replaceAll('\\', '/');
      if (!compiledSveltePaths.has(child)) missing.push(`${child}  (imported by ${current})`);
      queue.push(child);
    }
  }
  // NON-VACUITY. A walk that silently found nothing would make the assertion below pass over an
  // empty graph, which is the failure this whole function exists to convert into a loud one.
  if (seen.size < CLOSURE_FLOOR) {
    throw new Error(
      `the compiled-closure walk reached only ${seen.size} components from ${rootPath}; the walk ` +
        'is broken, so it cannot be trusted to find an omission'
    );
  }
  if (missing.length > 0) {
    throw new Error(
      "these components are in the mounted root's STATIC module graph but were never compiled " +
        'into the temp tree, so the derivation and the graph disagree. Left alone they do not ' +
        'fail — they HANG, and `node --test` reports every blocked test as `# cancelled`:\n  ' +
        missing.join('\n  ')
    );
  }
}
