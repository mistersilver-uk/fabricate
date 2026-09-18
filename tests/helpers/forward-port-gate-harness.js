/** The throwaway-repository harness the forward-port's EXECUTED tests run against (issue 1418). */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveExecutable } from '../../scripts/lib/resolveExecutable.js';

export const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** POSIX-separated, because these are handed to bash rather than to a Windows program. */
function posixScript(name) {
  return path.join(REPO_ROOT, 'scripts', name).split(path.sep).join('/');
}

export const GATE_SCRIPT = posixScript('forward-port-content-gate.sh');
export const COMPLETE_MERGE_SCRIPT = posixScript('forward-port-complete-merge.sh');

export const REPOSITORY = 'mistersilver-uk/fabricate';

/** Recognisable in the gate's output, so "the hint was printed" is never a coincidence. */
export const OVERRIDE_HINT = 'OVERRIDE-HINT-SENTINEL';

/** Written to stderr by every `gh` stub, so "no API call was made" is provable. */
export const GH_CALLED = 'GH-STUB-WAS-CALLED';

// A literal seven-character marker run at column 0 in this file would be a marker as far as the
// gate's own A6 check is concerned, and `CONTRIBUTING.md`'s forward-port runbook is under the same
// rule — the region most likely to conflict next is the one that documents conflicts.

/** The real `git`, resolved ONCE and by absolute path, before any stub directory exists. */
export const REAL_GIT = resolveExecutable('git') ?? '';

const BASE_LINES = Array.from({ length: 10 }, (_, index) => `line ${index + 1}`);

/**
 * The fixture file with some of its lines replaced.
 *
 * @param {Record<number, string>} edits One-based line number to replacement text.
 * @returns {string} The file's contents.
 */
export function fileWith(edits) {
  const lines = [...BASE_LINES];
  for (const [number, text] of Object.entries(edits)) lines[Number(number) - 1] = text;
  return `${lines.join('\n')}\n`;
}

/**
 * A verbatim-shaped REST association payload for the `gh` stub to answer with.
 *
 * @param {{baseRef?: string, mergedAt?: string|null}} [overrides] What to vary.
 * @returns {string} The JSON body.
 */
export function associationPayload({ baseRef = 'release', mergedAt = '2026-09-01T07:48:19Z' } = {}) {
  return JSON.stringify([
    {
      number: 1421,
      state: 'closed',
      merged_at: mergedAt,
      base: { ref: baseRef, repo: { full_name: REPOSITORY } },
    },
  ]);
}

/** A `gh` stub body that answers every association read with one payload. */
export function answering(payload) {
  return `echo "${GH_CALLED} $*" >&2\ncat <<'PAYLOAD'\n${payload}\nPAYLOAD`;
}

/** A `gh` stub body that FAILS, leaving `payload` behind exactly as a real failure would. */
export function failingWith(payload) {
  return `${answering(payload)}\nexit 1`;
}

/**
 * A throwaway git repository, the stub `PATH` the scripts resolve `gh` through, and ways to run them.
 *
 * @param {import('node:test').TestContext} t The test, whose `after` hook removes the repository.
 * @returns {object} `git`, `write`, `remove`, `stub`, `runScript`, `runGate`, plus the directory.
 */
export function createGateHarness(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'forward-port-gate-'));
  t.after(() => rmSync(directory, { recursive: true, force: true, maxRetries: 3 }));

  // `timeout` is not optional here.
  const run = (command, args, options = {}) =>
    spawnSync(command, args, { cwd: directory, encoding: 'utf8', timeout: 60000, ...options });

  const git = (...args) => {
    const result = run('git', args);
    assert.equal(
      result.status,
      0,
      `git ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`
    );
    return result.stdout.trim();
  };
  const gitAllowingFailure = (...args) => run('git', args);

  const write = (name, contents) => writeFileSync(path.join(directory, name), contents);
  const remove = (name) => unlinkSync(path.join(directory, name));

  const stubDirectory = path.join(directory, '.stub');
  mkdirSync(stubDirectory, { recursive: true });
  const stub = (name, body) => {
    const file = path.join(stubDirectory, name);
    writeFileSync(file, `#!/usr/bin/env bash\n${body}\n`);
    chmodSync(file, 0o755);
  };

  git('init', '-q', '-b', 'main', '.');
  for (const [key, value] of [
    ['user.email', 'release-bot@example.invalid'],
    ['user.name', 'fabricate-release-bot'],
    // The fixture's line endings and merge results must not depend on the host's global git config.
    ['core.autocrlf', 'false'],
    ['commit.gpgsign', 'false'],
  ]) {
    git('config', key, value);
  }

  /**
   * Run one of the scripts exactly as a workflow step does: from the repository's root, with `gh`
   * resolved through `PATH`.
   */
  const runScript = (script, environment = {}) => {
    const result = run(
      'bash',
      ['-c', 'export PATH="$PWD/.stub:$PATH"; exec bash "$1"', 'forward-port', script],
      {
        env: {
          ...process.env,
          GITHUB_REPOSITORY: REPOSITORY,
          GH_TOKEN: 'stub-installation-token',
          OVERRIDE_HINT,
          ...environment,
        },
      }
    );
    assert.ok(
      !result.error,
      `${script} could not be launched (${result.error?.message}). These tests execute the real ` +
        'scripts and do not skip: bash comes with the git installation this repository requires.'
    );
    return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
  };

  return {
    directory,
    git,
    gitAllowingFailure,
    write,
    remove,
    stub,
    runScript,
    runGate: (environment = {}) => runScript(GATE_SCRIPT, environment),
    completeMerge: (environment = {}) => runScript(COMPLETE_MERGE_SCRIPT, environment),
  };
}

/**
 * Build the shape a forward-port with something to do actually has: `main` and `release` diverged,
 * each edited a DIFFERENT REGION of one shared file, and `--no-ff` merges them with no conflict.
 *
 * @param {ReturnType<typeof createGateHarness>} harness The repository.
 * @returns {{base: string, mainTip: string, releaseTip: string, merge: string}} The topology.
 */
export function buildDivergentForwardPort(harness) {
  const { git, write } = harness;

  write('f.txt', fileWith({}));
  git('add', '-A');
  git('commit', '-qm', 'chore: the shared base');
  const base = git('rev-parse', 'HEAD');

  write('f.txt', fileWith({ 1: 'edited on main' }));
  git('commit', '-qam', 'feat: something on main');
  const mainTip = git('rev-parse', 'HEAD');

  git('checkout', '-q', '-b', 'release', base);
  write('f.txt', fileWith({ 10: 'edited on release' }));
  git('commit', '-qam', 'fix: the hotfix brought back into release');
  const releaseTip = git('rev-parse', 'HEAD');

  git('checkout', '-q', 'main');
  git('update-ref', 'refs/remotes/origin/main', mainTip);
  git('update-ref', 'refs/remotes/origin/release', releaseTip);
  git('merge', '--no-ff', '-q', 'origin/release', '-m', 'chore: forward-port release into main');

  return { base, mainTip, releaseTip, merge: git('rev-parse', 'HEAD') };
}

/**
 * The shape a CONFLICTED forward-port has, with all four path classes the resolution checks
 * distinguish present at once. The merge is NOT performed; `main` is left at its own tip.
 *
 * @param {ReturnType<typeof createGateHarness>} harness The repository.
 * @returns {{base: string, mainTip: string, releaseTip: string}} The topology.
 */
export function buildConflictedForwardPort(harness) {
  const { git, write } = harness;

  for (const name of ['f.txt', 'shared.txt', 'mainonly.txt', 'releaseonly.txt']) {
    write(name, fileWith({}));
  }
  git('add', '-A');
  git('commit', '-qm', 'chore: the shared base');
  const base = git('rev-parse', 'HEAD');

  write('f.txt', fileWith({ 5: 'main took this line' }));
  write('shared.txt', fileWith({ 1: 'shared, edited near the top on main' }));
  write('mainonly.txt', fileWith({ 3: 'only main touched this file' }));
  git('commit', '-qam', 'feat: something on main');
  const mainTip = git('rev-parse', 'HEAD');

  git('checkout', '-q', '-b', 'release', base);
  write('f.txt', fileWith({ 5: 'release took the same line' }));
  write('shared.txt', fileWith({ 10: 'shared, edited near the bottom on release' }));
  write('releaseonly.txt', fileWith({ 7: 'only release touched this file' }));
  git('commit', '-qam', 'fix: the same line, differently');
  const releaseTip = git('rev-parse', 'HEAD');

  git('checkout', '-q', 'main');
  git('update-ref', 'refs/remotes/origin/main', mainTip);
  git('update-ref', 'refs/remotes/origin/release', releaseTip);

  return { base, mainTip, releaseTip };
}

/**
 * The squash-collision shape, in miniature: `main` already carries the release line's fix (it
 * reached `main` first, as a squash under a different sha), so a completed forward-port must leave
 * `main`'s content EXACTLY as it is — and the two lines still conflict, on a different region of the
 * same file. This is the fixture for the `no-content-onto-main` declaration.
 *
 * @param {ReturnType<typeof createGateHarness>} harness The repository.
 * @returns {{base: string, mainTip: string, releaseTip: string, mainVersion: string}} The topology.
 */
export function buildRedundantConflictedForwardPort(harness) {
  const { git, write } = harness;

  write('f.txt', fileWith({}));
  git('add', '-A');
  git('commit', '-qm', 'chore: the shared base');
  const base = git('rev-parse', 'HEAD');

  const mainVersion = fileWith({ 1: 'reworded on main', 5: 'the fix, byte for byte' });
  write('f.txt', mainVersion);
  git('commit', '-qam', 'feat: the fix, squashed onto main, plus a rewording');
  const mainTip = git('rev-parse', 'HEAD');

  git('checkout', '-q', '-b', 'release', base);
  write('f.txt', fileWith({ 1: 'reworded on release', 5: 'the fix, byte for byte' }));
  git('commit', '-qam', 'fix: the same fix, landed on release, plus its own rewording');
  const releaseTip = git('rev-parse', 'HEAD');

  git('checkout', '-q', 'main');
  git('update-ref', 'refs/remotes/origin/main', mainTip);
  git('update-ref', 'refs/remotes/origin/release', releaseTip);

  return { base, mainTip, releaseTip, mainVersion };
}

/**
 * Produce a resolution commit exactly as a maintainer does: run the merge, let it conflict, resolve
 * the working tree, and commit.
 *
 * @param {ReturnType<typeof createGateHarness>} harness The repository.
 * @param {() => void} resolve Writes and deletions that resolve the conflict.
 * @returns {string} The resolution commit's sha, also reachable as the `resolution` branch.
 */
export function resolveConflictInto(harness, resolve) {
  const { git, gitAllowingFailure } = harness;

  const attempt = gitAllowingFailure('merge', '--no-ff', 'origin/release', '-m', 'wip: resolving');
  assert.notEqual(attempt.status, 0, 'the fixture must genuinely conflict');

  resolve();
  git('add', '-A');
  git('commit', '-q', '--no-edit');
  const resolution = git('rev-parse', 'HEAD');

  git('update-ref', 'refs/heads/resolution', resolution);
  return resolution;
}

/**
 * Build the merge the completion script builds, and move `main` onto it.
 *
 * @param {ReturnType<typeof createGateHarness>} harness The repository.
 * @param {{tree: string, parents: string[], message?: string}} shape What to build.
 * @returns {string} The completed merge commit's sha.
 */
export function completeMergeAs(harness, { tree, parents, message = 'chore: forward-port' }) {
  const { git } = harness;
  const args = ['commit-tree', tree, ...parents.flatMap((parent) => ['-p', parent]), '-m', message];
  const completed = git(...args);
  git('reset', '--hard', '-q', completed);
  return completed;
}
