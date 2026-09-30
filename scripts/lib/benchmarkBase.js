/**
 * Measuring class-1 counts at a base commit: the base's `BASE_PATHS` are extracted with `git
 * archive` into the gitignored `.benchmarks/base/<sha>/`, and the base's own harness measures the
 * base's own code there, in a child process.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { envWithoutGitLocation } from '../../tests/helpers/temp-git-repo.js';

import { resolveExecutable } from './resolveExecutable.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const GIT = resolveExecutable('git');

/**
 * The base paths a class-1 measurement imports; head's `node_modules` serves the rest. A path absent
 * at the base is left out, so a path can be retired from this list only once no base imports it.
 */
export const BASE_PATHS = Object.freeze([
  'src',
  'tests/helpers',
  'tests/view-lab/foundry',
  'scripts/lib',
]);

/** Written last into a staged tree, so a tree without it is never trusted. */
export const COMPLETE_MARKER = '.complete';

const CACHE_FILE = 'class1.json';
const KEEP_TREES = 3;
const STALE_STAGING_MS = 60 * 60 * 1000;
const WORKER_PATH = 'scripts/lib/benchmarkBaseWorker.js';
const WORKER = join(dirname(fileURLToPath(import.meta.url)), 'benchmarkBaseWorker.js');

/** The tree's own worker, so a base measures as that base's code expects; else head's. */
export function workerFor(treeDir) {
  const own = join(treeDir, WORKER_PATH);
  return existsSync(own) ? own : WORKER;
}

/** Where extracted base trees and their measured counts are cached. Gitignored. */
export function baseCacheRoot(repoRoot = REPO_ROOT) {
  return join(repoRoot, '.benchmarks', 'base');
}

function git(repoRoot, args) {
  if (!GIT) throw new Error('git is not on an absolute PATH entry');
  try {
    return execFileSync(GIT, ['-C', repoRoot, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: envWithoutGitLocation(),
    }).trim();
  } catch (error) {
    const detail = String(error.stderr ?? error.message).trim();
    throw new Error(`git ${args.join(' ')} failed in ${repoRoot}: ${detail}`, { cause: error });
  }
}

/** The commit `ref` names in `repoRoot`; throws when it names none. */
export function resolveCommit(ref, repoRoot = REPO_ROOT) {
  // eslint-disable-next-line unicorn/no-incorrect-template-string-interpolation -- git's peel suffix
  return git(repoRoot, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]);
}

/** True when `package-lock.json` at `sha` differs from the working tree's. */
export function lockfileDiffers(sha, repoRoot = REPO_ROOT) {
  const atBase = spawnSync(
    GIT,
    ['-C', repoRoot, 'rev-parse', '--verify', '--quiet', `${sha}:package-lock.json`],
    { encoding: 'utf8', env: envWithoutGitLocation() }
  );
  const baseBlob = atBase.status === 0 ? atBase.stdout.trim() : null;
  const headBlob = existsSync(join(repoRoot, 'package-lock.json'))
    ? git(repoRoot, ['hash-object', '--', 'package-lock.json'])
    : null;
  return baseBlob !== headBlob;
}

/** Remove all but the newest complete trees, and any staging directory a crash left behind. */
function prune(cacheRoot, keep) {
  const entries = readdirSync(cacheRoot, { withFileTypes: true }).filter((e) => e.isDirectory());
  const now = Date.now();
  const trees = [];
  for (const { name } of entries) {
    const path = join(cacheRoot, name);
    if (name.startsWith('.staging-')) {
      if (now - statSync(path).mtimeMs > STALE_STAGING_MS)
        rmSync(path, { recursive: true, force: true });
    } else if (name !== keep) {
      trees.push({ path, mtime: statSync(path).mtimeMs });
    }
  }
  trees.sort((left, right) => right.mtime - left.mtime);
  for (const { path } of trees.slice(KEEP_TREES - 1))
    rmSync(path, { recursive: true, force: true });
}

/**
 * Extract `BASE_PATHS` at `sha` into `<cacheRoot>/<sha>/`, or reuse a complete earlier extraction.
 * The tree is staged in a sibling directory, marked complete, then renamed into place.
 *
 * @returns {{dir: string, cached: boolean}}
 */
export function materialiseBase(
  sha,
  { repoRoot = REPO_ROOT, cacheRoot = baseCacheRoot(repoRoot) } = {}
) {
  const dir = join(cacheRoot, sha);
  if (existsSync(join(dir, COMPLETE_MARKER))) return { dir, cached: true };
  const tar = resolveExecutable('tar');
  if (!tar)
    throw new Error('tar is not on an absolute PATH entry, so the base cannot be extracted');
  mkdirSync(cacheRoot, { recursive: true });
  const staging = mkdtempSync(join(cacheRoot, `.staging-${sha.slice(0, 12)}-`));
  try {
    const present = git(repoRoot, ['ls-tree', '--name-only', sha, '--', ...BASE_PATHS]).split('\n');
    git(repoRoot, [
      'archive',
      '--format=tar',
      '-o',
      join(staging, 'base.tar'),
      sha,
      '--',
      ...present,
    ]);
    // Relative paths and a cwd: GNU tar on Windows reads `C:` in an absolute path as a remote host.
    execFileSync(tar, ['-xf', 'base.tar'], { cwd: staging, stdio: 'pipe' });
    rmSync(join(staging, 'base.tar'));
    writeFileSync(join(staging, COMPLETE_MARKER), `${sha}\n`);
    if (existsSync(dir) && !existsSync(join(dir, COMPLETE_MARKER))) {
      rmSync(dir, { recursive: true, force: true });
    }
    try {
      renameSync(staging, dir);
    } catch (error) {
      // Another run completed the same tree first; theirs is as good as ours.
      if (!existsSync(join(dir, COMPLETE_MARKER))) throw error;
    }
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  prune(cacheRoot, sha);
  return { dir, cached: false };
}

/**
 * Measure the class-1 counts of the tree at `treeDir` with that tree's own harness, in a child
 * process, so neither side's globals or module cache can reach the other.
 *
 * @param {string[]} [profiles] Defaults to the tree's own swept profiles.
 * @returns {object} `class1ByProfile`.
 */
export function measureTree(treeDir, { profiles } = {}) {
  const scratch = mkdtempSync(join(tmpdir(), 'fabricate-class1-'));
  try {
    const out = join(scratch, CACHE_FILE);
    // The caller's module conditions, so both sides of a comparison resolve packages alike.
    const conditions = process.execArgv.filter((arg) => arg.startsWith('--conditions='));
    const worker = workerFor(treeDir);
    const args = [...conditions, worker, treeDir, out, ...(profiles ? [profiles.join(',')] : [])];
    const run = spawnSync(process.execPath, args, { encoding: 'utf8', stdio: 'pipe' });
    if (run.status !== 0) {
      const detail = (run.error?.message ?? run.stderr).trim();
      throw new Error(`measuring class-1 counts in ${treeDir} failed: ${detail}`);
    }
    return JSON.parse(readFileSync(out, 'utf8'));
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * The class-1 counts of every swept profile at `sha`, cached beside the extracted tree.
 *
 * @returns {{class1ByProfile: object, dir: string, cached: boolean}}
 */
export function measureBase(
  sha,
  { repoRoot = REPO_ROOT, cacheRoot = baseCacheRoot(repoRoot) } = {}
) {
  const { dir } = materialiseBase(sha, { repoRoot, cacheRoot });
  const cache = join(dir, CACHE_FILE);
  if (existsSync(cache)) {
    return { class1ByProfile: JSON.parse(readFileSync(cache, 'utf8')), dir, cached: true };
  }
  const class1ByProfile = measureTree(dir);
  const staged = `${cache}.${process.pid}.tmp`;
  writeFileSync(staged, JSON.stringify(class1ByProfile));
  renameSync(staged, cache);
  return { class1ByProfile, dir, cached: false };
}
