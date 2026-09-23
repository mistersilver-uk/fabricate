/** The forward-port's content gate, EXECUTED (issues #1418 and #1439). */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GH_CALLED,
  OVERRIDE_HINT,
  REAL_GIT,
  answering,
  associationPayload,
  buildConflictedForwardPort,
  buildDivergentForwardPort,
  buildRedundantConflictedForwardPort,
  completeMergeAs,
  createGateHarness,
  failingWith,
  fileWith,
  resolveConflictInto,
} from './helpers/forward-port-gate-harness.js';

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
  write(
    'f.txt',
    `${fileWith({ 1: 'edited on main', 10: 'edited on release' })}invented by nobody\n`
  );
  git('add', '-A');
  git('commit', '-q', '--amend', '--no-edit');
  const evil = git('rev-parse', 'HEAD');
  assert.notEqual(evil, merge, 'the amend produced a different commit');
  assert.equal(
    git('rev-list', '--parents', '-n', '1', evil).split(/\s+/).length,
    3,
    'still a merge'
  );

  // THE FINDING. `--name-only` follows the `-c` FILE selection ("files modified from all parents");
  // `--cc`'s hunk compression only ever affects PATCH output, so it never reaches the name list.
  assert.equal(cleanNames, 'f.txt', 'the clean auto-merge lists the shared file');
  assert.equal(
    combinedDiffNames(harness, evil),
    cleanNames,
    'the combined diff of an evil merge is IDENTICAL to that of the clean auto-merge it was made ' +
      'from, so a gate deciding from it refuses both or accepts both'
  );

  assert.equal(
    remergeReproducesTree(harness, merge),
    true,
    'the clean auto-merge invented nothing'
  );
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
  // against `main`.
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
  // unreviewed content can either.
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

  write(
    'f.txt',
    `${fileWith({ 1: 'edited on main', 10: 'edited on release' })}invented by nobody\n`
  );
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

test('a merge whose parents CONFLICT is refused when NO resolution was supplied', (t) => {
  const harness = createGateHarness(t);
  const { write } = harness;

  buildConflictedForwardPort(harness);
  resolveConflictInto(harness, () =>
    write('f.txt', fileWith({ 5: 'a resolution neither side wrote' }))
  );

  harness.stub('gh', answering(associationPayload()));

  // This is the seam the pre-resolved-merge recovery path attaches to (issue #1439).
  for (const environment of [{}, { ALLOW_CONTENT: 'true' }]) {
    const { status, output } = harness.runGate(environment);
    assert.equal(status, 1, output);
    assert.match(output, /cannot be established to introduce nothing of its own/);
    assert.match(output, /allow_content does NOT override this/);
    assert.match(output, /completed by SUPPLYING that resolution/, 'the recovery path is named');
  }
});

// ── 6 ───────────────────────────────────────────────────────────────────────────────────────────

test('a run whose merge created NOTHING is not treated as a merge that invented everything', (t) => {
  const harness = createGateHarness(t);
  const { git, write } = harness;

  // The retry path re-fetches `main` and re-merges.
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
  // installation not holding `Pull requests: Read`.
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
  // `--version`.
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

// ── THE RESOLUTION CHECKS (issue #1439) ─────────────────────────────────────────────────────────

/** Rebuild the merge `scripts/forward-port-complete-merge.sh` builds, and move `main` onto it. */
function completeFrom(harness, resolution, parents) {
  return completeMergeAs(harness, {
    tree: harness.git('rev-parse', `${resolution}^{tree}`),
    parents,
    message: `chore: forward-port release into main (test), completed from ${resolution}`,
  });
}

/** A conflicted forward-port, resolved, and completed from that resolution. */
function conflictedAndCompleted(harness, resolve) {
  const topology = buildConflictedForwardPort(harness);
  const resolution = resolveConflictInto(harness, resolve);
  harness.git('reset', '--hard', '-q', topology.mainTip);
  completeFrom(harness, resolution, [topology.mainTip, topology.releaseTip]);
  return { ...topology, resolution };
}

/** Resolve the fixture's conflict by taking the release line's version of the conflicted line. */
function takeReleasesLine(harness) {
  return () => harness.write('f.txt', fileWith({ 5: 'release took the same line' }));
}

// ── 10 ──────────────────────────────────────────────────────────────────────────────────────────

test('a valid resolution completes the merge and is still decided on its change PROVENANCE', (t) => {
  const harness = createGateHarness(t);
  const { resolution } = conflictedAndCompleted(harness, takeReleasesLine(harness));

  // The hotfix bring-back: `release` carries content `main` lacks, so the completed forward-port
  // changes `main` — and a resolution accounts for the CONFLICT and for nothing else, so the
  // provenance gate still has to account for everything it carries.
  harness.stub('gh', answering(associationPayload()));
  const accepted = harness.runGate({
    RESOLUTION_REF: resolution,
    RESOLUTION_EFFECT: 'content-onto-main',
  });
  assert.equal(accepted.status, 0, accepted.output);
  assert.match(accepted.output, /the supplied resolution .* is accounted for/);
  assert.match(accepted.output, new RegExp(GH_CALLED), 'the association read really happened');
  assert.match(accepted.output, /every commit this forward-port carries is attributable/);

  // ...and a resolution is NOT an override of that. Same resolution, same merge, no pull request
  // behind the content: refused on provenance, exactly as an unresolved forward-port would be.
  harness.stub('gh', answering('[]'));
  const unaccounted = harness.runGate({
    RESOLUTION_REF: resolution,
    RESOLUTION_EFFECT: 'content-onto-main',
  });
  assert.equal(unaccounted.status, 1, unaccounted.output);
  assert.match(unaccounted.output, /could not attribute to a reviewed pull request/);
});

// ── 11 ──────────────────────────────────────────────────────────────────────────────────────────

test('a REDUNDANT resolution takes the content fast path and makes no API call', (t) => {
  const harness = createGateHarness(t);
  const { git, write } = harness;
  const { mainTip, releaseTip, mainVersion } = buildRedundantConflictedForwardPort(harness);

  // The squash-collision: `main` already carries the fix, so the completed forward-port must leave
  // main's content exactly as it is.
  const resolution = resolveConflictInto(harness, () => write('f.txt', mainVersion));
  git('reset', '--hard', '-q', mainTip);
  completeFrom(harness, resolution, [mainTip, releaseTip]);
  harness.stub(
    'gh',
    failingWith('{"message":"a redundant resolution must not read associations"}')
  );

  const { status, output } = harness.runGate({
    RESOLUTION_REF: resolution,
    RESOLUTION_EFFECT: 'no-content-onto-main',
  });
  assert.equal(status, 0, output);
  assert.match(output, /carries no file changes onto main/);
  assert.ok(
    !new RegExp(GH_CALLED).test(output),
    'a redundant resolution needs no association read'
  );

  // A8, first direction: the tree IS main's, so declaring that it carries content is false.
  const misdeclared = harness.runGate({
    RESOLUTION_REF: resolution,
    RESOLUTION_EFFECT: 'content-onto-main',
    ALLOW_CONTENT: 'true',
  });
  assert.equal(misdeclared.status, 1, misdeclared.output);
  assert.match(misdeclared.output, /it would carry nothing at all/);
  assert.ok(!new RegExp(OVERRIDE_HINT).test(misdeclared.output), 'no override applies to it');
});

// ── 12 ──────────────────────────────────────────────────────────────────────────────────────────

test('A8: a resolution whose DECLARED OUTCOME does not hold is refused, naming the difference', (t) => {
  const harness = createGateHarness(t);
  const { resolution } = conflictedAndCompleted(harness, takeReleasesLine(harness));
  harness.stub('gh', answering(associationPayload()));

  // The other direction from assertion 11's: this tree is NOT main's, and the operator said it was.
  for (const environment of [{}, { ALLOW_CONTENT: 'true' }]) {
    const { status, output } = harness.runGate({
      RESOLUTION_REF: resolution,
      RESOLUTION_EFFECT: 'no-content-onto-main',
      ...environment,
    });
    assert.equal(status, 1, output);
    assert.match(output, /it WOULD change main's content/);
    assert.match(output, /f\.txt\s+\|/, 'the refusal shows the difference it would carry');
    assert.ok(!new RegExp(OVERRIDE_HINT).test(output), 'a resolution refusal is not overridable');
  }
});

// ── 13 ──────────────────────────────────────────────────────────────────────────────────────────

test('A0: a resolution_effect that is not one of the two tokens refuses, empty included', (t) => {
  const harness = createGateHarness(t);
  const { resolution } = conflictedAndCompleted(harness, takeReleasesLine(harness));
  harness.stub('gh', answering(associationPayload()));

  // Nothing else in the set establishes that this value is one of the two things it may be, and A8
  // is a two-arm `case` on it: a typo matching neither arm would skip A8 entirely and leave the
  // resolution unconstrained on the one check that reads the operator's declaration.
  for (const effect of ['', 'no-content', 'NO-CONTENT-ONTO-MAIN', 'no-content-onto-main-ish']) {
    const { status, output } = harness.runGate({
      RESOLUTION_REF: resolution,
      RESOLUTION_EFFECT: effect,
      ALLOW_CONTENT: 'true',
    });
    assert.equal(status, 1, `resolution_effect '${effect}' must refuse:\n${output}`);
    assert.match(output, /names no outcome this can establish/);
    assert.ok(!new RegExp(OVERRIDE_HINT).test(output), 'no override applies to it');
  }

  // ...and the run that omits the variable ENTIRELY, rather than passing it empty, refuses the same
  // way: `set -u` must not turn a missing declaration into an unbound-variable crash.
  const omitted = harness.runGate({ RESOLUTION_REF: resolution });
  assert.equal(omitted.status, 1, omitted.output);
  assert.match(omitted.output, /names no outcome this can establish/);
});

// ── 14 ──────────────────────────────────────────────────────────────────────────────────────────

test('A2: a resolution produced against a main that has since MOVED is refused, not reapplied', (t) => {
  const harness = createGateHarness(t);
  const { git, write } = harness;
  const { mainTip, releaseTip } = buildConflictedForwardPort(harness);
  const resolution = resolveConflictInto(harness, takeReleasesLine(harness));

  // `main` really moves, exactly as it does between a rejected push and the retry that follows it.
  git('reset', '--hard', '-q', mainTip);
  write('afterwards.txt', 'main gained this while the resolution was being produced\n');
  git('add', '-A');
  git('commit', '-qm', 'feat: main moved under the running forward-port');
  const movedMain = git('rev-parse', 'HEAD');
  git('update-ref', 'refs/remotes/origin/main', movedMain);

  // THE DANGER THIS CHECK REMOVES, stated as a fact rather than a claim: the stale resolution's tree
  // does not contain what main gained, so applying it verbatim would DELETE it — on the one push
  // that bypasses pull-request review.
  assert.ok(
    !harness.git('ls-tree', '--name-only', `${resolution}^{tree}`).includes('afterwards.txt'),
    "the stale resolution's tree really does lack what main gained"
  );

  completeFrom(harness, resolution, [movedMain, releaseTip]);
  harness.stub('gh', answering(associationPayload()));

  for (const environment of [{}, { ALLOW_CONTENT: 'true' }]) {
    const { status, output } = harness.runGate({
      RESOLUTION_REF: resolution,
      RESOLUTION_EFFECT: 'content-onto-main',
      ...environment,
    });
    assert.equal(status, 1, output);
    assert.match(output, /not produced against the state this run is merging/);
    assert.match(output, /recompute the resolution against the CURRENT origin\/main/);
    assert.match(output, /a conflicted forward-port has no retry at all/);
    assert.ok(!new RegExp(OVERRIDE_HINT).test(output), 'a resolution refusal is not overridable');
  }
});

// ── 15 ──────────────────────────────────────────────────────────────────────────────────────────

test('A3: a HEAD whose parents are not origin/main then origin/release is refused', (t) => {
  const harness = createGateHarness(t);
  const { git } = harness;
  const { mainTip, releaseTip } = buildConflictedForwardPort(harness);
  const resolution = resolveConflictInto(harness, takeReleasesLine(harness));
  git('reset', '--hard', '-q', mainTip);

  // The resolution itself stays VALID — that is what makes this A3's own fixture rather than a
  // second way of failing A2.
  completeFrom(harness, resolution, [releaseTip, mainTip]);
  harness.stub('gh', answering(associationPayload()));

  const { status, output } = harness.runGate({
    RESOLUTION_REF: resolution,
    RESOLUTION_EFFECT: 'content-onto-main',
    ALLOW_CONTENT: 'true',
  });
  assert.equal(status, 1, output);
  assert.match(output, /HEAD is not the merge this run is supposed to be pushing/);
  assert.ok(!new RegExp(OVERRIDE_HINT).test(output), 'a resolution refusal is not overridable');
});

// ── 16 ──────────────────────────────────────────────────────────────────────────────────────────

test(`A4: a pushed tree that is not the resolution's tree is refused, naming the difference`, (t) => {
  const harness = createGateHarness(t);
  const { git, write } = harness;
  const { mainTip, releaseTip } = buildConflictedForwardPort(harness);
  const resolution = resolveConflictInto(harness, takeReleasesLine(harness));

  // Something the RUNNER produced rides along with the reviewed tree. The resolution is unchanged
  // and still resolves, so only the tree comparison can catch this.
  git('checkout', '-q', '--force', 'resolution');
  write('smuggled.txt', 'content that was never in the reviewed resolution\n');
  git('add', '-A');
  const tamperedTree = git('write-tree');
  git('checkout', '-q', '--force', 'main');
  git('reset', '--hard', '-q', mainTip);
  completeMergeAs(harness, { tree: tamperedTree, parents: [mainTip, releaseTip] });
  harness.stub('gh', answering(associationPayload()));

  const { status, output } = harness.runGate({
    RESOLUTION_REF: resolution,
    RESOLUTION_EFFECT: 'content-onto-main',
    ALLOW_CONTENT: 'true',
  });
  assert.equal(status, 1, output);
  assert.match(output, /is not the resolution's tree/);
  assert.match(output, /smuggled\.txt \|/, 'the refusal shows what the runner added');
});

// ── 17 ──────────────────────────────────────────────────────────────────────────────────────────

test('A5: a resolution may correct a COMPOSED path, and may not touch one copied verbatim', (t) => {
  const harness = createGateHarness(t);
  const { write } = harness;

  // THE POSITIVE HALF, and the reason the permitted set is not the conflicted set.
  const composed = conflictedAndCompleted(harness, () => {
    write('f.txt', fileWith({ 5: 'release took the same line' }));
    write('shared.txt', fileWith({ 1: 'shared, edited near the top on main' }));
  });
  harness.stub('gh', answering(associationPayload()));
  const corrected = harness.runGate({
    RESOLUTION_REF: composed.resolution,
    RESOLUTION_EFFECT: 'content-onto-main',
  });
  assert.equal(corrected.status, 0, corrected.output);

  // THE NEGATIVE HALF. `mainonly.txt` and `releaseonly.txt` were changed on ONE side only, so the
  // automatic merge copied a side's blob verbatim and settled them without a human.
  for (const reached of ['mainonly.txt', 'releaseonly.txt']) {
    const overreaching = createGateHarness(t);
    const { resolution } = conflictedAndCompleted(overreaching, () => {
      overreaching.write('f.txt', fileWith({ 5: 'release took the same line' }));
      overreaching.write(reached, fileWith({}));
    });
    overreaching.stub('gh', answering(associationPayload()));

    const { status, output } = overreaching.runGate({
      RESOLUTION_REF: resolution,
      RESOLUTION_EFFECT: 'content-onto-main',
      ALLOW_CONTENT: 'true',
    });
    assert.equal(status, 1, output);
    assert.match(output, /alters content the two lines could be combined on automatically/);
    assert.match(output, new RegExp(`::error::  ${reached.replace('.', '\\.')}`));
    assert.ok(!new RegExp(OVERRIDE_HINT).test(output), 'a resolution refusal is not overridable');
  }
});

// ── 18 ──────────────────────────────────────────────────────────────────────────────────────────

test('A5: a modify/delete conflict can be resolved by ACCEPTING the deletion', (t) => {
  const harness = createGateHarness(t);
  const { git, write, remove } = harness;

  // The second half of the permitted set, and the one no composed-blob rule can reach.
  write('g.txt', fileWith({}));
  write('h.txt', fileWith({}));
  git('add', '-A');
  git('commit', '-qm', 'chore: the shared base');
  const base = git('rev-parse', 'HEAD');

  write('g.txt', fileWith({ 4: 'main kept working on this file' }));
  git('commit', '-qam', 'feat: main modified g.txt');
  const mainTip = git('rev-parse', 'HEAD');

  git('checkout', '-q', '-b', 'release', base);
  remove('g.txt');
  write('h.txt', fileWith({ 8: 'the hotfix, brought back into release' }));
  git('add', '-A');
  git('commit', '-qm', 'fix: release deleted g.txt and landed a hotfix');
  const releaseTip = git('rev-parse', 'HEAD');

  git('checkout', '-q', 'main');
  git('update-ref', 'refs/remotes/origin/main', mainTip);
  git('update-ref', 'refs/remotes/origin/release', releaseTip);

  const resolution = resolveConflictInto(harness, () => remove('g.txt'));
  git('reset', '--hard', '-q', mainTip);
  completeFrom(harness, resolution, [mainTip, releaseTip]);
  harness.stub('gh', answering(associationPayload()));

  const { status, output } = harness.runGate({
    RESOLUTION_REF: resolution,
    RESOLUTION_EFFECT: 'content-onto-main',
  });
  assert.equal(status, 0, output);
  assert.ok(
    !harness.git('ls-tree', '--name-only', 'HEAD^{tree}').includes('g.txt'),
    'the completed merge really records the deletion'
  );
});

// ── 19 ──────────────────────────────────────────────────────────────────────────────────────────

test('A6: a conflict marker left behind is refused, and a DELETED path is not an error', (t) => {
  const harness = createGateHarness(t);

  // Resolving NOTHING: `git add -A` stages the marker file exactly as a half-finished resolution
  // would, and the path is unchanged from the re-merged tree, so A5 has nothing to say about it.
  const abandoned = conflictedAndCompleted(harness, () => {});
  harness.stub('gh', answering(associationPayload()));
  const { status, output } = harness.runGate({
    RESOLUTION_REF: abandoned.resolution,
    RESOLUTION_EFFECT: 'content-onto-main',
    ALLOW_CONTENT: 'true',
  });
  assert.equal(status, 1, output);
  assert.match(output, /marking a difference that was never resolved/);
  assert.match(output, /f\.txt still carries/);

  // ...and the counter-case that keeps the check usable: a resolution may DELETE a conflicted path.
  const deleting = createGateHarness(t);
  const deleted = conflictedAndCompleted(deleting, () => {
    deleting.remove('f.txt');
    deleting.write('shared.txt', fileWith({ 1: 'shared, edited near the top on main' }));
  });
  deleting.stub('gh', answering(associationPayload()));
  const removal = deleting.runGate({
    RESOLUTION_REF: deleted.resolution,
    RESOLUTION_EFFECT: 'content-onto-main',
  });
  assert.equal(removal.status, 0, removal.output);
  assert.match(removal.output, /the supplied resolution .* is accounted for/);
});

// ── 20 ──────────────────────────────────────────────────────────────────────────────────────────

test('A7: a line neither line contains is refused, and choosing a side is not', (t) => {
  const harness = createGateHarness(t);
  const { write } = harness;

  const invented = conflictedAndCompleted(harness, () =>
    write('f.txt', fileWith({ 5: 'a resolution neither side wrote' }))
  );
  harness.stub('gh', answering(associationPayload()));

  // What it establishes is exactly "no line was typed that neither side contains" — and its refusal
  // has to name the residual cost, because a resolution that genuinely needs a new line cannot be
  // completed by this path at all.
  for (const environment of [{}, { ALLOW_CONTENT: 'true' }]) {
    const { status, output } = harness.runGate({
      RESOLUTION_REF: invented.resolution,
      RESOLUTION_EFFECT: 'content-onto-main',
      ...environment,
    });
    assert.equal(status, 1, output);
    assert.match(output, /present in neither origin\/main's nor origin\/release's version/);
    assert.match(
      output,
      /::error:: {2}a resolution neither side wrote/,
      'the invented line is named'
    );
    assert.match(output, /this path cannot complete it/, 'the residual cost is named');
    assert.ok(!new RegExp(OVERRIDE_HINT).test(output), 'a resolution refusal is not overridable');
  }
});

// ── 21 ──────────────────────────────────────────────────────────────────────────────────────────

test('A1: a resolution_ref that does not resolve is UNVERIFIABLE, never a refusal', (t) => {
  const harness = createGateHarness(t);
  conflictedAndCompleted(harness, takeReleasesLine(harness));
  harness.stub('gh', answering(associationPayload()));

  // An absent ref establishes NOTHING about the resolution, so there is no refusal for an operator
  // to vouch for — and printing the override hint under it would be the documented remedy for the
  // wrong diagnosis, which is how an absence of evidence gets accepted as an absence of unreviewed
  // content.
  for (const ref of ['0'.repeat(40), 'refs/heads/no-such-branch']) {
    for (const environment of [{}, { ALLOW_CONTENT: 'true' }]) {
      const { status, output } = harness.runGate({
        RESOLUTION_REF: ref,
        RESOLUTION_EFFECT: 'content-onto-main',
        ...environment,
      });
      assert.equal(status, 2, output);
      assert.match(output, /does not resolve to a commit in this repository/);
      assert.match(output, /UNVERIFIABLE rather than refused/);
      assert.ok(!new RegExp(OVERRIDE_HINT).test(output), 'no remedy tells the reader to override');
    }
  }
});

// ── 22 ──────────────────────────────────────────────────────────────────────────────────────────

test('the completion script and the gate CHAIN: the merge one builds is the merge the other checks', (t) => {
  const harness = createGateHarness(t);
  const { git, gitAllowingFailure } = harness;
  const { mainTip, releaseTip } = buildConflictedForwardPort(harness);
  const resolution = resolveConflictInto(harness, takeReleasesLine(harness));
  git('reset', '--hard', '-q', mainTip);

  // A3 and A4 assert the PREVIOUS script's output, so they mean nothing unless one fixture runs the
  // completion script and then the gate, in one repository, the way the workflow step does.
  const attempt = gitAllowingFailure(
    'merge',
    '--no-ff',
    'origin/release',
    '-m',
    'chore: forward-port'
  );
  assert.notEqual(
    attempt.status,
    0,
    'the workflow step reaches the completion script by conflicting'
  );

  const completion = harness.completeMerge({ RESOLUTION_REF: resolution, REASON: 'a chained run' });
  assert.equal(completion.status, 0, completion.output);

  // Deleting the completion script's `git reset --hard` leaves HEAD at main's own tip, which the
  // gate reads as "this run created no merge" and passes on the fast path — green, and having
  // pushed nothing. So the topology is asserted here rather than inferred from the gate's verdict.
  const head = git('rev-parse', 'HEAD');
  assert.equal(
    git('rev-list', '--parents', '-n', '1', 'HEAD'),
    `${head} ${mainTip} ${releaseTip}`,
    'the completion script moved HEAD onto the merge it built'
  );

  harness.stub('gh', answering(associationPayload()));
  const gate = harness.runGate({
    RESOLUTION_REF: resolution,
    RESOLUTION_EFFECT: 'content-onto-main',
  });
  assert.equal(gate.status, 0, gate.output);
  assert.match(gate.output, /the supplied resolution .* is accounted for/);
  assert.ok(
    !/this run created no merge of its own to guard/.test(gate.output),
    'a gate that saw no merge at all has checked nothing about the resolution'
  );
});

// ── 23 ──────────────────────────────────────────────────────────────────────────────────────────

test('A6 checks a NON-ASCII conflicted path rather than silently skipping it', (t) => {
  const harness = createGateHarness(t);
  const { git, write } = harness;

  // `core.quotePath` defaults to true, so git NAMES this path as `"caf\303\251.txt"` — a form that
  // matches nothing when handed back as a pathspec, because no real path contains a quote.
  const name = 'caf\u00e9.txt';
  write(name, fileWith({}));
  git('add', '-A');
  git('commit', '-qm', 'chore: the shared base');
  const base = git('rev-parse', 'HEAD');

  write(name, fileWith({ 5: 'main took this line' }));
  git('commit', '-qam', 'feat: something on main');
  const mainTip = git('rev-parse', 'HEAD');

  git('checkout', '-q', '-b', 'release', base);
  write(name, fileWith({ 5: 'release took the same line' }));
  git('commit', '-qam', 'fix: the same line, differently');
  const releaseTip = git('rev-parse', 'HEAD');

  git('checkout', '-q', 'main');
  git('update-ref', 'refs/remotes/origin/main', mainTip);
  git('update-ref', 'refs/remotes/origin/release', releaseTip);

  // Resolve NOTHING, so git's own markers are staged verbatim.
  const resolution = resolveConflictInto(harness, () => {});
  git('reset', '--hard', '-q', mainTip);
  completeMergeAs(harness, {
    tree: git('rev-parse', `${resolution}^{tree}`),
    parents: [mainTip, releaseTip],
  });

  harness.stub('gh', answering(associationPayload()));
  const { status, output } = harness.runGate({
    RESOLUTION_REF: resolution,
    RESOLUTION_EFFECT: 'content-onto-main',
    ALLOW_CONTENT: 'true',
  });

  assert.equal(status, 1, output);
  assert.match(output, /marking a difference that was never resolved/);
  assert.match(output, /caf\u00e9\.txt/, 'the path must be named unquoted, as git records it');
});

// ── 24 ──────────────────────────────────────────────────────────────────────────────────────────

test('A5 decides composed paths on BLOBS, so a mode-only change does not open a settled path', (t) => {
  const harness = createGateHarness(t);
  const { git, write } = harness;
  // fileMode OFF, deliberately. Windows has no execute bit, so with it ON git reads a phantom mode
  // change on every checkout and the fixture's merge aborts with "local changes would be
  // overwritten" — a non-conflict failure, not the conflict this test needs.
  git('config', 'core.fileMode', 'false');

  // `git diff --name-only` compares whole tree ENTRIES — mode as well as oid.
  write('f.txt', fileWith({}));
  write('run.sh', '#!/bin/sh\necho hi\n');
  git('add', '-A');
  git('commit', '-qm', 'chore: the shared base');
  const base = git('rev-parse', 'HEAD');

  write('f.txt', fileWith({ 5: 'main took this line' }));
  git('add', 'f.txt');
  git('update-index', '--chmod=+x', 'run.sh'); // MODE only: main never touches its content.
  git('commit', '-qm', 'feat: something on main');
  const mainTip = git('rev-parse', 'HEAD');

  git('checkout', '-q', '--force', '-b', 'release', base);
  write('f.txt', fileWith({ 5: 'release took the same line' }));
  write('run.sh', '#!/bin/sh\necho hi\necho THE_HOTFIX\n'); // CONTENT only.
  git('add', '-A');
  git('commit', '-qm', 'fix: the same line, differently');
  const releaseTip = git('rev-parse', 'HEAD');

  git('checkout', '-q', '--force', 'main');
  git('update-ref', 'refs/remotes/origin/main', mainTip);
  git('update-ref', 'refs/remotes/origin/release', releaseTip);

  // Resolve the genuine conflict honestly, then ALSO revert run.sh to main's content — dropping the
  // hotfix line git had already merged in cleanly. That second edit is what must be refused.
  const resolution = resolveConflictInto(harness, () => {
    write('f.txt', fileWith({ 5: 'release took the same line' }));
    write('run.sh', '#!/bin/sh\necho hi\n');
  });
  git('reset', '--hard', '-q', mainTip);
  completeMergeAs(harness, {
    tree: git('rev-parse', `${resolution}^{tree}`),
    parents: [mainTip, releaseTip],
  });

  harness.stub('gh', answering(associationPayload()));
  const { status, output } = harness.runGate({
    RESOLUTION_REF: resolution,
    RESOLUTION_EFFECT: 'content-onto-main',
    ALLOW_CONTENT: 'true',
  });

  assert.equal(status, 1, output);
  assert.match(output, /alters content the two lines could be combined on automatically/);
  assert.match(output, /run\.sh/);
});
