/**
 * One definition of "the repository's Svelte components": every `*.svelte` under a source root,
 * which is the same set the component gates cover (`src/**\/*.svelte` in `lint:svelte` and in
 * Prettier's `format`/`format:check` globs).
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';

/** Order two paths by code point, ascending. */
function byCodePoint(left, right) {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

/** Every `*.svelte` file beneath `sourceRoot`, as absolute paths in a stable sorted order. */
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
 * The same set as repository-relative POSIX paths, which is what `git show <ref>:<path>` needs (git
 * speaks forward slashes on every platform, `path.relative` does not).
 */
export function toRepositoryPaths(repoRoot, files) {
  return files.map((file) => path.relative(repoRoot, file).split(path.sep).join('/'));
}
