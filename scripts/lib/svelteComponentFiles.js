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
 * Order two paths by code point, ascending.
 *
 * Explicit rather than `sort()`'s default, which is not "sort strings" but "stringify, then order
 * by code point" — the same result here, reached by an implicit conversion that hides the
 * ordering rule from the reader (and that SonarCloud flags as a bug, `javascript:S2871`, because
 * the default silently mis-sorts anything that is not already a string).
 *
 * `localeCompare` is deliberately NOT used: it is locale-dependent and case-insensitive-ish, so
 * `ExplainerCard.svelte` and `explainerCard.svelte` could order differently between machines. The
 * whole point of sorting here is a sequence two runs agree on, and code-point order is the one
 * that never moves. This mirrors `src/utils/alchemySignatureKey.js`, which sorts the same way for
 * the same reason.
 *
 * @param {string} left
 * @param {string} right
 * @returns {number} negative, zero or positive per the `Array#sort` contract
 */
function byCodePoint(left, right) {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

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
  return found.sort(byCodePoint);
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
