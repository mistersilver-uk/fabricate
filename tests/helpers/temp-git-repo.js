/**
 * A throwaway git repository for tests that run real git, independent of the host's identity,
 * signing, and line-ending config, and of any `GIT_*` variable a hook leaves in the environment.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { resolveExecutable } from '../../scripts/lib/resolveExecutable.js';

// Resolved once to an absolute path, so no later `PATH` entry can substitute another binary.
const GIT = resolveExecutable('git');

const ISOLATED_CONFIG = [
  ['user.name', 'fabricate-test'],
  ['user.email', 'test@example.invalid'],
  ['commit.gpgSign', 'false'],
  ['tag.gpgSign', 'false'],
  ['core.autocrlf', 'false'],
].flatMap(([name, value]) => ['-c', `${name}=${value}`]);

/** The current environment without the variables that point git at another repository. */
export function envWithoutGitLocation(base = process.env) {
  const env = { ...base };
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR']) delete env[name];
  return env;
}

/**
 * @returns {{dir: string, git: (...args: string[]) => string, commit: (message: string) => string,
 *   write: (files: Record<string, string>) => void, commitAll: (message: string) => string,
 *   dispose: () => void}} The repository, a git runner returning trimmed stdout, an empty-commit
 *   helper and a commit-everything helper each returning the new sha, a writer of repo-relative
 *   files, and a cleanup.
 */
export function createTempGitRepo(prefix = 'fab-git-') {
  if (!GIT) throw new Error('git is not on an absolute PATH entry');
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  const env = envWithoutGitLocation();
  const git = (...args) =>
    execFileSync(GIT, [...ISOLATED_CONFIG, '-C', dir, ...args], { encoding: 'utf8', env }).trim();
  git('init', '-q');
  const commit = (message) => {
    git('commit', '-q', '--allow-empty', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  const write = (files) => {
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      writeFileSync(path.join(dir, file), text);
    }
  };
  const commitAll = (message) => {
    git('add', '-A');
    return commit(message);
  };
  const dispose = () => rmSync(dir, { recursive: true, force: true });
  return { dir, git, commit, write, commitAll, dispose };
}
