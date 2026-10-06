import { join } from 'node:path';

/** Agent lane worktrees, each a full checkout, live under these directories of the primary repo. */
const WORKTREE_DIRECTORIES = ['.worktrees', join('.claude', 'worktrees')];

/**
 * The watcher globs that keep a lab served from the primary checkout from watching every lane's
 * full checkout. They are anchored at `repoRoot`, never `**`-wild: a lab served FROM a worktree
 * has no worktrees of its own, but its own path sits under `.worktrees/`, so an unanchored
 * `**\/.worktrees/**` would ignore the very tree being served and it would never reload.
 *
 * @param {string} repoRoot Absolute root of the tree being served.
 * @returns {string[]} Forward-slash globs, as the watcher's matcher requires on Windows.
 */
export function worktreeWatchIgnores(repoRoot) {
  return WORKTREE_DIRECTORIES.map((directory) =>
    join(repoRoot, directory, '**').replaceAll(String.fromCharCode(92), '/')
  );
}
