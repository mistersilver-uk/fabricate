/**
 * The forward-port's content gate, EXECUTED (issue #1418).
 *
 * `tests/forward-port-workflow.test.js` asserts this script's source text, and
 * `tests/forward-port-provenance.test.js` drives the verifier it delegates to. Neither of them ever
 * runs the thing. That gap is not theoretical: the gate's original "did this merge introduce content
 * present in none of its parents" predicate was `git diff-tree --cc -r --no-commit-id --name-only`
 * being empty, which cannot express that question at all — and every assertion about it was a regex
 * over the script's own text or a hand-written filename string handed to the verifier, so the defect
 * was invisible to the entire suite and to review by reading.
 *
 * So this file runs the real script, with the real `git`, over real constructed merges, and stubs
 * only `gh` — the one collaborator that would otherwise reach the network.
 *
 * ── THE FIXTURE THAT MATTERS IS THE DIVERGENT CLEAN AUTO-MERGE ──────────────────────────────────
 * Two commits editing DIFFERENT REGIONS OF THE SAME FILE, merged with no conflict. It is the only
 * shape that tells a working predicate from a broken one:
 *
 *   * `git diff-tree --cc -r --no-commit-id --name-only` lists that file, because the merged blob
 *     differs from both parents' blobs — and lists exactly the same file for a genuine EVIL merge of
 *     the same two parents. The two are indistinguishable.
 *   * re-merging the two parents and comparing trees separates them exactly.
 *
 * It is also the ORDINARY shape of a forward-port that has anything to do — both lines touched a
 * common file, which is why the forward-port exists. Neither the shipped fixtures (a linear,
 * fast-forwardable topology) nor either review lane's harness contained it, and on the topologies
 * they did contain, the broken predicate answers correctly. The first test below pins that
 * indistinguishability as a fact rather than a claim.
 *
 * ── WHY BASH IS SPAWNED ─────────────────────────────────────────────────────────────────────────
 * The gate runs on `ubuntu-latest` under bash, and Windows development hosts get bash from the git
 * installation this repository already requires. A missing bash FAILS here rather than skipping: a
 * silently skipped execution test is the state this file exists to leave behind.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** POSIX-separated, because it is handed to bash rather than to a Windows program. */
const GATE_SCRIPT = path
  .join(REPO_ROOT, 'scripts', 'forward-port-content-gate.sh')
  .split(path.sep)
  .join('/');

const REPOSITORY = 'mistersilver-uk/fabricate';

/** Recognisable in the gate's output, so "the hint was printed" is never a coincidence. */
const OVERRIDE_HINT = 'OVERRIDE-HINT-SENTINEL';

/** Written to stderr by every `gh` stub, so "no API call was made" is provable. */
const GH_CALLED = 'GH-STUB-WAS-CALLED';

/**
 * The real `git`, resolved ONCE and by absolute path, before any stub directory exists.
 *
 * The version-assertion test below stubs `git` to claim an old version and pass everything else
 * through. A passthrough written as a bare `exec git "$@"` re-resolves through `PATH` — which the
 * gate is running with the stub directory PREFIXED — so the stub execs itself, forever. That is not
 * a hypothetical: it hung this suite, silently, the first time it was written, and a hang is
 * reported as `# cancelled` rather than `# fail`.
 */
const REAL_GIT = spawnSync('bash', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();

const BASE_LINES = Array.from({ length: 10 }, (_, index) => `line ${index + 1}`);

/**
 * The fixture file with some of its lines replaced.
 *
 * @param {Record<number, string>} edits One-based line number to replacement text.
 * @returns {string} The file's contents.
 */
function fileWith(edits) {
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
function associationPayload({ baseRef = 'release', mergedAt = '2026-09-01T07:48:19Z' } = {}) {
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
function answering(payload) {
  return `echo "${GH_CALLED} $*" >&2\ncat <<'PAYLOAD'\n${payload}\nPAYLOAD`;
}

/** A `gh` stub body that FAILS, leaving `payload` behind exactly as a real failure would. */
function failingWith(payload) {
  return `${answering(payload)}\nexit 1`;
}

/**
 * A throwaway git repository, the stub `PATH` the gate resolves `gh` through, and a way to run it.
 *
 * @param {import('node:test').TestContext} t The test, whose `after` hook removes the repository.
 * @returns {object} `git`, `write`, `stub` and `runGate`, plus the directory.
 */
function createGateHarness(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'forward-port-gate-'));
  t.after(() => rmSync(directory, { recursive: true, force: true, maxRetries: 3 }));

  const run = (command, args, options = {}) =>
    spawnSync(command, args, { cwd: directory, encoding: 'utf8', ...options });

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
   * Run the gate exactly as a workflow step does: from the repository's root, with `gh` resolved
   * through `PATH`. The stub directory is prefixed from INSIDE bash, off `$PWD`, so no Windows path
   * has to be translated into whatever form this host's bash wants in `PATH`.
   */
  const runGate = (environment = {}) => {
    const result = run(
      'bash',
      ['-c', 'export PATH="$PWD/.stub:$PATH"; exec bash "$1"', 'content-gate', GATE_SCRIPT],
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
      `the gate could not be launched (${result.error?.message}). This test executes the real ` +
        'script and does not skip: bash comes with the git installation this repository requires.'
    );
    return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
  };

  return { directory, git, gitAllowingFailure, write, stub, runGate };
}

/**
 * Build the shape a forward-port with something to do actually has: `main` and `release` diverged,
 * each edited a DIFFERENT REGION of one shared file, and `--no-ff` merges them with no conflict.
 *
 * @param {ReturnType<typeof createGateHarness>} harness The repository.
 * @returns {{base: string, mainTip: string, releaseTip: string, merge: string}} The topology.
 */
function buildDivergentForwardPort(harness) {
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

/** The re-merge predicate, run directly, so a test can state what it concludes. */
function remergeReproducesTree(harness, commit) {
  const remerged = harness
    .git('merge-tree', '--write-tree', `${commit}^1`, `${commit}^2`)
    .split('\n')[0];
  return remerged === harness.git('rev-parse', `${commit}^{tree}`);
}

/** The predicate this change replaced, run directly, so its blind spot is a fact and not a claim. */
function combinedDiffNames(harness, commit) {
  return harness.git('diff-tree', '--cc', '-r', '--no-commit-id', '--name-only', commit);
}

// ── 1 ───────────────────────────────────────────────────────────────────────────────────────────

test('the combined diff CANNOT tell a clean auto-merge from an evil merge; the re-merge can', (t) => {
  const harness = createGateHarness(t);
  const { git, write } = harness;
  const { merge } = buildDivergentForwardPort(harness);

  const cleanNames = combinedDiffNames(harness, merge);

  // Amending the merge preserves both parents, so this is a genuine evil merge of the SAME two
  // commits: one line present in neither of them, reviewed nowhere.
  write('f.txt', `${fileWith({ 1: 'edited on main', 10: 'edited on release' })}invented by nobody\n`);
  git('add', '-A');
  git('commit', '-q', '--amend', '--no-edit');
  const evil = git('rev-parse', 'HEAD');
  assert.notEqual(evil, merge, 'the amend produced a different commit');
  assert.equal(git('rev-list', '--parents', '-n', '1', evil).split(/\s+/).length, 3, 'still a merge');

  // THE FINDING. `--name-only` follows the `-c` FILE selection ("files modified from all parents");
  // `--cc`'s hunk compression only ever affects PATCH output, so it never reaches the name list.
  assert.equal(cleanNames, 'f.txt', 'the clean auto-merge lists the shared file');
  assert.equal(
    combinedDiffNames(harness, evil),
    cleanNames,
    'the combined diff of an evil merge is IDENTICAL to that of the clean auto-merge it was made ' +
      'from, so a gate deciding from it refuses both or accepts both'
  );

  assert.equal(remergeReproducesTree(harness, merge), true, 'the clean auto-merge invented nothing');
  assert.equal(remergeReproducesTree(harness, evil), false, 'the evil merge invented a line');
});

// ── 2 ───────────────────────────────────────────────────────────────────────────────────────────

test('a divergent clean auto-merge passes the own-merge guard and is decided on its PROVENANCE', (t) => {
  const harness = createGateHarness(t);
  const { releaseTip } = buildDivergentForwardPort(harness);

  // The whole reason the old predicate jammed the release line: this merge invented nothing, but
  // both lines had touched one file, so the combined diff was non-empty and the guard — which is
  // deliberately not overridable, on a branch that forbids landing the merge by pull request —
  // refused it with no operator lever anywhere.
  harness.stub('gh', answering(associationPayload()));
  const accounted = harness.runGate();
  assert.equal(accounted.status, 0, accounted.output);
  assert.match(accounted.output, /every commit this forward-port carries is attributable/);

  // ...and it did NOT get there by the fast path. The fast path would have skipped the verifier
  // entirely, which is what inverting its test does: green, silent, and carrying the content.
  assert.ok(
    !/carries no file changes onto main/.test(accounted.output),
    'a merge that carries content must not report itself as carrying none'
  );
  assert.match(accounted.output, new RegExp(GH_CALLED), 'the association read really happened');

  harness.stub('gh', answering('[]'));
  const unaccounted = harness.runGate();
  assert.equal(unaccounted.status, 1, unaccounted.output);
  assert.match(unaccounted.output, new RegExp(`REFUSED ${releaseTip}`));
  assert.match(unaccounted.output, new RegExp(OVERRIDE_HINT), 'a refusal names the remedy');

  // The counter-example the whole issue is built on: pull request #1414 was merged and reviewed —
  // against `main`. Reviewing a change against a different line is not reviewing it for landing on
  // this one, and widening the shell's ACCEPTED_BASES default is what would silently accept it.
  harness.stub('gh', answering(associationPayload({ baseRef: 'main' })));
  const wrongLine = harness.runGate();
  assert.equal(wrongLine.status, 1, wrongLine.output);
  assert.match(wrongLine.output, /reviewed against 'main', not 'release'/);

  // ...and it is a PARAMETER, not a hardcoding: the same run with `main` accepted passes.
  harness.stub('gh', answering(associationPayload({ baseRef: 'main' })));
  const widened = harness.runGate({ ACCEPTED_BASES: 'release,main' });
  assert.equal(widened.status, 0, widened.output);
});

// ── 3 ───────────────────────────────────────────────────────────────────────────────────────────

test('the fast path is taken when the merge carries no content, and skips the API entirely', (t) => {
  const harness = createGateHarness(t);
  buildDivergentForwardPort(harness);

  // `origin/main` already at the merge is the routine forward-port: nothing new reaches main, so no
  // unreviewed content can either. The stub FAILS if it is reached, so "no API call was needed" is
  // proved by the run passing rather than merely by the absence of a log line.
  harness.git('update-ref', 'refs/remotes/origin/main', harness.git('rev-parse', 'HEAD'));
  harness.stub('gh', failingWith('{"message":"the fast path must not read associations"}'));

  const { status, output } = harness.runGate();
  assert.equal(status, 0, output);
  assert.match(output, /carries no file changes onto main/);
  assert.ok(!new RegExp(GH_CALLED).test(output), 'the fast path must make no API call');
});

// ── 4 ───────────────────────────────────────────────────────────────────────────────────────────

test('an EVIL own merge is refused, and allow_content does not override it', (t) => {
  const harness = createGateHarness(t);
  const { git, write } = harness;
  buildDivergentForwardPort(harness);

  write('f.txt', `${fileWith({ 1: 'edited on main', 10: 'edited on release' })}invented by nobody\n`);
  git('add', '-A');
  git('commit', '-q', '--amend', '--no-edit');

  harness.stub('gh', answering(associationPayload()));

  for (const environment of [{}, { ALLOW_CONTENT: 'true' }]) {
    const { status, output } = harness.runGate(environment);
    assert.equal(status, 1, output);
    assert.match(output, /introduces content present in none of its parents/);
    assert.match(output, /allow_content does NOT override this/);
    // The diagnosis is the invented content itself, not a list of files that merely took hunks from
    // both sides — which is all the old predicate could ever have named.
    assert.match(output, /f\.txt \|/, 'the refusal shows what the merge invented');
  }
});

// ── 5 ───────────────────────────────────────────────────────────────────────────────────────────

test('a merge whose parents CONFLICT is refused: its resolution is content neither parent has', (t) => {
  const harness = createGateHarness(t);
  const { git, gitAllowingFailure, write } = harness;

  write('f.txt', fileWith({}));
  git('add', '-A');
  git('commit', '-qm', 'chore: the shared base');
  const base = git('rev-parse', 'HEAD');

  write('f.txt', fileWith({ 5: 'main took this line' }));
  git('commit', '-qam', 'feat: something on main');
  const mainTip = git('rev-parse', 'HEAD');

  git('checkout', '-q', '-b', 'release', base);
  write('f.txt', fileWith({ 5: 'release took the same line' }));
  git('commit', '-qam', 'fix: the same line, differently');
  git('checkout', '-q', 'main');
  git('update-ref', 'refs/remotes/origin/main', mainTip);
  git('update-ref', 'refs/remotes/origin/release', git('rev-parse', 'release'));

  const merge = gitAllowingFailure('merge', '--no-ff', 'origin/release');
  assert.notEqual(merge.status, 0, 'the fixture must genuinely conflict');
  write('f.txt', fileWith({ 5: 'a resolution neither side wrote' }));
  git('add', '-A');
  git('commit', '-q', '--no-edit');

  harness.stub('gh', answering(associationPayload()));

  // This is the seam a pre-resolved-merge recovery path attaches to. Rule 1 must not wave the
  // resolution through; a resolution is verified by a post-merge assertion of its own or not at all.
  for (const environment of [{}, { ALLOW_CONTENT: 'true' }]) {
    const { status, output } = harness.runGate(environment);
    assert.equal(status, 1, output);
    assert.match(output, /cannot be established to introduce nothing of its own/);
    assert.match(output, /allow_content does NOT override this/);
  }
});

// ── 6 ───────────────────────────────────────────────────────────────────────────────────────────

test('a run whose merge created NOTHING is not treated as a merge that invented everything', (t) => {
  const harness = createGateHarness(t);
  const { git, write } = harness;

  // The retry path re-fetches `main` and re-merges. If the freshly fetched `origin/main` already
  // contains `origin/release`, `git merge --no-ff` reports "Already up to date." and creates NO
  // commit — so HEAD is single-parent. Reading a single-parent HEAD's "combined diff" silently
  // degrades to an ordinary diff, which is never empty for a commit that changed anything, and the
  // guard would then fail the job non-overridably on a run that had nothing to do at all.
  write('f.txt', fileWith({}));
  git('add', '-A');
  git('commit', '-qm', 'chore: the shared base');
  const base = git('rev-parse', 'HEAD');
  write('f.txt', fileWith({ 1: 'already carried by main' }));
  git('commit', '-qam', 'feat: something already on main');

  git('update-ref', 'refs/remotes/origin/main', git('rev-parse', 'HEAD'));
  git('update-ref', 'refs/remotes/origin/release', base);
  harness.stub('gh', failingWith('{"message":"nothing here needs an association read"}'));

  const { status, output } = harness.runGate();
  assert.equal(status, 0, output);
  assert.match(output, /HEAD is not a merge commit \(parent-count 1\)/);
  assert.match(output, /carries no file changes onto main/);
});

// ── 7 ───────────────────────────────────────────────────────────────────────────────────────────

test('an UNVERIFIABLE read is not overridable, and is never offered the override hint', (t) => {
  const harness = createGateHarness(t);
  buildDivergentForwardPort(harness);

  // The single most likely first-run failure of this whole feature is the release-bot App
  // installation not holding `Pull requests: Read`. That is a 403, and a 403 establishes nothing:
  // treating it like a refusal would let an operator "vouch for" content nothing has described to
  // them, which is an absence of evidence accepted as an absence of unreviewed content.
  harness.stub('gh', failingWith('{"message":"Resource not accessible by integration"}'));

  for (const environment of [{}, { ALLOW_CONTENT: 'true' }]) {
    const { status, output } = harness.runGate(environment);
    assert.equal(status, 2, output);
    assert.match(output, /Pull requests: Read/, 'the permissions case is named, and named apart');
    assert.match(output, /could not COMPLETE its verification/);
    assert.ok(
      !new RegExp(OVERRIDE_HINT).test(output),
      'an unverifiable state must not print a remedy that tells the reader to override it'
    );
  }

  // A failed read that leaves NO error payload behind must not read as "no pull request is
  // associated with it at all" — that is a false diagnosis, and it invites exactly the override the
  // case above refuses.
  harness.stub('gh', failingWith('[]'));
  const emptied = harness.runGate();
  assert.equal(emptied.status, 2, emptied.output);
  assert.match(emptied.output, /exited non-zero and left no error payload behind/);
  assert.ok(
    !/no pull request is associated with it at all/.test(emptied.output),
    'a failed read is unverifiable, not an absence of association'
  );
});

// ── 8 ───────────────────────────────────────────────────────────────────────────────────────────

test('a PER_PAGE GitHub would not honour is refused rather than silently served as 100', (t) => {
  const harness = createGateHarness(t);
  buildDivergentForwardPort(harness);
  harness.stub('gh', answering(associationPayload()));

  // GitHub caps `per_page` at 100. Above it the collector asks for N, is served 100, and the
  // verifier then looks for an N-entry page to recognise a possibly-truncated read — so truncation
  // becomes undetectable and a commit whose pull request is on page 2 is REFUSED rather than
  // reported incomplete. Fail-closed-with-a-lie is worse than fail-closed.
  for (const perPage of ['101', '0', 'lots']) {
    const { status, output } = harness.runGate({ PER_PAGE: perPage });
    assert.equal(status, 2, output);
    assert.match(output, /it must be a whole number from 1 to 100/);
  }

  const accepted = harness.runGate({ PER_PAGE: '100' });
  assert.equal(accepted.status, 0, accepted.output);
});

// ── 9 ───────────────────────────────────────────────────────────────────────────────────────────

test('a git with no `merge-tree --write-tree` refuses, and never falls back to the broken predicate', (t) => {
  const harness = createGateHarness(t);
  buildDivergentForwardPort(harness);
  harness.stub('gh', answering(associationPayload()));

  assert.ok(REAL_GIT, 'the real git must be resolvable, or the passthrough below would recurse');

  // The version assertion is the FIRST thing the gate does, so this stub only has to answer
  // `--version`. The passthrough is there so that a gate which SKIPPED the assertion would carry on
  // and report a normal verdict — a visible pass where a refusal was required — rather than
  // crashing in a way that could be mistaken for the refusal itself.
  const claimingVersion = (version) =>
    `if [ "$1" = "--version" ]; then echo "${version}"; exit 0; fi\nexec "${REAL_GIT}" "$@"`;

  for (const [version, pattern] of [
    ['git version 2.30.2', /older than 2\.38/],
    ['git version banana', /could not read a version number/],
  ]) {
    harness.stub('git', claimingVersion(version));
    const { status, output } = harness.runGate();
    assert.equal(status, 2, output);
    assert.match(output, pattern);
    assert.ok(
      !/carries no file changes onto main/.test(output),
      'an unusable git must refuse, not fall through to a check it cannot perform'
    );
  }
});
