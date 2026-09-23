/** Completing a conflicted forward-port, EXECUTED (issue #1439). */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  OVERRIDE_HINT,
  buildConflictedForwardPort,
  createGateHarness,
  fileWith,
  resolveConflictInto,
} from './helpers/forward-port-gate-harness.js';

/**
 * The state the completion script is invoked in: the workflow's merge has just conflicted, and the
 * index carries unmerged entries.
 *
 * @param {ReturnType<typeof createGateHarness>} harness The repository.
 * @param {{mainTip: string}} topology From `buildConflictedForwardPort`.
 */
function conflictTheMerge(harness, topology) {
  harness.git('reset', '--hard', '-q', topology.mainTip);
  const attempt = harness.gitAllowingFailure(
    'merge',
    '--no-ff',
    'origin/release',
    '-m',
    'chore: forward-port release into main (a test run)'
  );
  assert.notEqual(attempt.status, 0, 'the workflow step reaches this script by conflicting');
  assert.notEqual(harness.git('ls-files', '--unmerged'), '', 'the index carries unmerged entries');
}

/** A repository whose `origin` points nowhere, so any fetch or push fails loudly rather than working. */
function withUnreachableOrigin(harness) {
  harness.git('remote', 'add', 'origin', 'https://example.invalid/nothing/here.git');
}

// ── 1 ───────────────────────────────────────────────────────────────────────────────────────────

test('a CONFLICT is reported as one, names the paths, aborts the merge, and refuses without a resolution', (t) => {
  const harness = createGateHarness(t);
  const { git } = harness;
  const topology = buildConflictedForwardPort(harness);
  withUnreachableOrigin(harness);
  conflictTheMerge(harness, topology);

  const { status, output } = harness.completeMerge({ REASON: 'a test run' });
  assert.equal(status, 1, output);

  // A conflict is reported AS a conflict, distinguishably from any other merge failure, and the
  // content that could not be combined is named — which is the whole of what a reader needs before
  // they can produce a resolution.
  assert.match(output, /merge of origin\/release into main CONFLICTED/);
  assert.match(output, /::error:: {2}f\.txt/, 'the conflicting path is named');
  assert.ok(
    !/::error:: {2}mainonly\.txt/.test(output),
    'a path the merge settled on its own is not a conflicting path'
  );

  // The remedy is actionable and says what the resolution is NOT.
  assert.match(output, /no resolution was supplied/);
  assert.match(output, /push it as a BRANCH — never to main/);
  assert.match(output, /A resolution is not an override/);

  // Nothing is left half-merged, and nothing was written.
  assert.equal(git('ls-files', '--unmerged'), '', 'the merge was aborted');
  assert.equal(git('rev-parse', 'HEAD'), topology.mainTip, 'nothing was committed');
  assert.equal(git('status', '--porcelain'), '', 'the working tree is clean');
});

// ── 2 ───────────────────────────────────────────────────────────────────────────────────────────

test('resolution_effect supplied WITHOUT resolution_ref refuses on the reachable path', (t) => {
  const harness = createGateHarness(t);
  const topology = buildConflictedForwardPort(harness);
  withUnreachableOrigin(harness);
  conflictTheMerge(harness, topology);

  // The two inputs are required together.
  const { status, output } = harness.completeMerge({
    RESOLUTION_EFFECT: 'content-onto-main',
    REASON: 'a test run',
  });
  assert.equal(status, 1, output);
  assert.match(output, /no resolution was supplied/);
  assert.equal(harness.git('rev-parse', 'HEAD'), topology.mainTip, 'nothing was committed');
});

// ── 3 ───────────────────────────────────────────────────────────────────────────────────────────

test('a merge failure that is NOT a conflict never consults the resolution inputs', (t) => {
  const harness = createGateHarness(t);
  const { git, write } = harness;
  const topology = buildConflictedForwardPort(harness);
  const resolution = resolveConflictInto(harness, () =>
    write('f.txt', fileWith({ 5: 'release took the same line' }))
  );
  git('reset', '--hard', '-q', topology.mainTip);
  withUnreachableOrigin(harness);

  // No merge is in progress, so the index carries no unmerged entries — the shape every
  // non-conflict merge failure has (an unreachable ref, a working tree the merge refused to
  // overwrite, an unreadable repository).
  const { status, output } = harness.completeMerge({
    RESOLUTION_REF: resolution,
    RESOLUTION_EFFECT: 'content-onto-main',
    REASON: 'a test run',
  });
  assert.equal(status, 1, output);
  assert.match(output, /left no conflicting paths behind/);
  assert.match(output, /A resolution is not the remedy here/);
  assert.ok(!/completed from conflict resolution/.test(output), 'no commit was built');
  assert.equal(git('rev-parse', 'HEAD'), topology.mainTip, 'HEAD was not moved');
});

// ── 4 ───────────────────────────────────────────────────────────────────────────────────────────

test('the completed merge takes the tree VERBATIM, both parents in order, under a `chore:` subject', (t) => {
  const harness = createGateHarness(t);
  const { git, write } = harness;
  const topology = buildConflictedForwardPort(harness);
  const resolution = resolveConflictInto(harness, () =>
    write('f.txt', fileWith({ 5: 'release took the same line' }))
  );
  withUnreachableOrigin(harness);
  conflictTheMerge(harness, topology);

  const { status, output } = harness.completeMerge({
    RESOLUTION_REF: resolution,
    RESOLUTION_EFFECT: 'content-onto-main',
    REASON: 'a test run',
  });
  assert.equal(status, 0, output);

  const head = git('rev-parse', 'HEAD');

  // BOTH PARENTS, IN ORDER. The order is what records origin/main as the first parent, which is what
  // makes the pushed commit an ordinary merge into main rather than one into the release line.
  assert.equal(
    git('rev-list', '--parents', '-n', '1', 'HEAD'),
    `${head} ${topology.mainTip} ${topology.releaseTip}`
  );

  // THE TREE, VERBATIM. Taking the tree object wholesale is what lets a resolution express a
  // DELETION, which driving the conflicted index path-by-path cannot.
  assert.equal(git('rev-parse', 'HEAD^{tree}'), git('rev-parse', `${resolution}^{tree}`));

  // A NON-RELEASING SUBJECT, under the workflow's control rather than the human's.
  const subject = git('log', '-1', '--format=%s', 'HEAD');
  assert.match(subject, /^chore: forward-port release into main \(a test run\)/);
  assert.ok(subject.includes(resolution), 'the pushed commit says where its tree came from');
  assert.ok(
    !/^(feat|fix|perf)\b/.test(subject),
    'a releasing Conventional Commit type here would mint a version off a no-op commit'
  );

  // And it did not reach the network on any of it: `origin` points nowhere.
  assert.ok(!/example\.invalid/.test(output), 'a resolvable resolution needs no fetch');
});

// ── 5 ───────────────────────────────────────────────────────────────────────────────────────────

test('a resolution that does not resolve is UNVERIFIABLE, and no override is offered for it', (t) => {
  const harness = createGateHarness(t);
  const { git } = harness;
  const topology = buildConflictedForwardPort(harness);
  withUnreachableOrigin(harness);
  conflictTheMerge(harness, topology);

  // Exit 2, not 1. Nothing about the resolution was established, so there is no refusal for an
  // operator to vouch for — and `allow_content` must not even appear to apply, on the path a
  // mistyped sha reaches most often.
  const { status, output } = harness.completeMerge({
    RESOLUTION_REF: '0'.repeat(40),
    RESOLUTION_EFFECT: 'content-onto-main',
    ALLOW_CONTENT: 'true',
    REASON: 'a test run',
  });
  assert.equal(status, 2, output);
  assert.match(output, /does not resolve to a commit in this repository/);
  assert.match(output, /UNVERIFIABLE rather than refused/);
  assert.ok(!new RegExp(OVERRIDE_HINT).test(output), 'an unverifiable state is never offered a hint');
  assert.equal(git('rev-parse', 'HEAD'), topology.mainTip, 'nothing was committed');
  assert.equal(git('ls-files', '--unmerged'), '', 'the merge was still aborted');
});
