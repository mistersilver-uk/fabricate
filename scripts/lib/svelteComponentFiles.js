/**
 * svelteComponentFiles.js
 *
 * One definition of "the repository's Svelte components": every `*.svelte` under a source root,
 * which is the same set the component gates cover (`src/**\/*.svelte` in `lint:svelte` and in
 * Prettier's `format`/`format:check` globs).
 *
 * Shared rather than re-walked because two independent consumers must agree on that set and are
 * meaningless if they disagree — `scripts/compare-svelte-render.mjs`, which compares what every
 * component renders against a base ref, and `tests/prettier-svelte-scope.test.js`, which asserts
 * that Prettier's ignore rules exclude none of them. A walker that quietly diverged would leave
 * one of them checking a subset while reporting a clean sweep.
 *
 * Pure and dependency-free (no autorun, no playwright, no I/O beyond `readdirSync`), so it is
 * safe to import from `node --test`.
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * Every `*.svelte` file beneath `sourceRoot`, as absolute paths in a stable sorted order.
 *
 * Sorted so that callers comparing two sides (or printing a report) get a deterministic
 * sequence rather than the platform's directory order.
 *
 * @param {string} sourceRoot absolute path to walk (typically `<repo>/src`)
 * @returns {string[]} absolute component paths
 */
export function listSvelteComponents(sourceRoot) {
  const found = [];
  for (const entry of readdirSync(sourceRoot, { withFileTypes: true })) {
    const fullPath = path.join(sourceRoot, entry.name);
    if (entry.isDirectory()) found.push(...listSvelteComponents(fullPath));
    else if (entry.name.endsWith('.svelte')) found.push(fullPath);
  }
  return found.sort();
}

/**
 * The same set as repository-relative POSIX paths, which is what `git show <ref>:<path>` needs
 * (git speaks forward slashes on every platform, `path.relative` does not).
 *
 * @param {string} repoRoot absolute repository root
 * @param {string[]} files absolute component paths
 * @returns {string[]} repository-relative paths with forward slashes
 */
export function toRepositoryPaths(repoRoot, files) {
  return files.map((file) => path.relative(repoRoot, file).split(path.sep).join('/'));
}
