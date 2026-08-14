/**
 * The `check-screenshots` gate's composed decision (issue 1133).
 *
 * Every case here drives the REAL `decideScreenshotGate` — ONE call per case, with the ordering, the
 * post-conclusion re-read and the verdict all performed by the product and merely asserted by the
 * test. That is the point rather than a style choice: a suite that itself awaited, itself evaluated
 * and then asserted would prove only that its own fakes returned what they were told, and would stay
 * green with the await deleted from the product.
 *
 * WHAT IS FAKED, AND WHAT IS NOT
 * ------------------------------
 * `runGh`, `sleep` and `now` are faked. The `evaluate` bundle is NOT: it carries the real
 * `isExemptByLabel`, `validateChangedFilesForCheck`, `hasUiChanges` and
 * `explainScreenshotEvidenceFailure` from `scripts/ui-pr-screenshot-evidence.mjs`. That bundle exists
 * to break an ESM cycle, not to be a seam for stubs — stubbing it would make the delegated verdicts
 * a test asserting its own stubs. Importing both the script and the lib here creates no cycle,
 * because the lib imports nothing from the script.
 *
 * THE MUTATION MAP IS THE ACCEPTANCE BAR
 * --------------------------------------
 * Each of the 24 mutations below must flip the named test to FAIL. A test that passes under its
 * mutation is not evidence of the behaviour it claims to cover.
 *
 *   delete the await                                        -> (a)
 *   invert the failure branch                               -> (a), (c), (d)
 *   skip the post-conclusion re-read                        -> (b)
 *   delete the fast path                                    -> (n), (n2)
 *   `Boolean(...)` on --capture-eligible                    -> (q)
 *   graceMs = 0 / locate once                               -> (k)
 *   intersection -> equality                                -> (o)
 *   delete the deadline                                     -> (g1)
 *   delete maxPolls                                         -> (g2)
 *   most-recent-only run selection                          -> (i3)
 *   oldest-run selection                                    -> (i)
 *   drop the pull_requests[].number filter                  -> (i2)
 *   gate-start deadline anchor                              -> (j)
 *   collapse capture-run-failed into capture-published-nothing   -> (l)
 *   collapse capture-run-not-found into no-screenshots-section   -> (k2)
 *   delete step 1 (the exempt label)                        -> (r)
 *   delete step 2 (the changed-files guard)                 -> (s)
 *   always-armed step 3                                     -> (a)
 *   outsideBlock collects every image in the body           -> (u)
 *   adapter: drop the exit-code application                 -> (p)
 *   adapter: restate a bound literal                        -> (p)
 *   adapter: map the base SHA into headSha                  -> (p)
 *   adapter: never forward --await-capture                  -> (p)
 *   maxPolls * pollIntervalMs < maxWaitMs                   -> tests/ci-workflow-semantics.test.js
 *
 * WHY `# cancelled` IS THE RISK HERE AND `# fail` IS NOT ALWAYS ENOUGH
 * --------------------------------------------------------------------
 * Test (g2) freezes the injected clock and lets the producer run never conclude. If the iteration
 * cap were deleted, that loop would spin under a `sleep` that resolves immediately until node:test's
 * `--test-timeout` fires — which reports the file's remaining tests as `# cancelled`, never as
 * `# fail`. Read both counts.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { describe, it } from 'node:test';

import {
  CAPTURE_TIMEOUT_MS,
  GATE_CODES,
  GRACE_MS,
  MAX_POLLS,
  MAX_WAIT_MS,
  POLL_INTERVAL_MS,
  SLACK_MS,
  classifyPublishedFrameUrl,
  decideScreenshotGate,
} from '../scripts/lib/screenshotEvidenceMatching.js';
import {
  VIEW_LAB_CASES,
  hasUiChanges as labHasUiChanges,
  mapChangedFilesToCases,
} from '../scripts/lib/viewLabCases.js';
import {
  VIEW_RECIPES,
  explainScreenshotEvidenceFailure,
  hasUiChanges,
  isExemptByLabel,
  main,
  validateChangedFilesForCheck,
} from '../scripts/ui-pr-screenshot-evidence.mjs';
import {
  atClock,
  captureConsole,
  makeGateClock,
  makeGhFake,
  managedScreenshotBlock,
  runPreservingExitCode,
  workflowRun,
} from './helpers/screenshot-gate-fakes.js';

const PR = 1133;
const REPO = 'misterpotts/fabricate';
const HEAD_BRANCH = 'agent/1133-screenshot-gate';
const HEAD = 'a'.repeat(40);
const PREVIOUS_HEAD = 'b'.repeat(40);
const NEXT_HEAD = 'c'.repeat(40);

/** A render change that selects a small, stable case set — small enough to name a proper subset. */
const CHANGED_FILES = ['src/ui/svelte/apps/manager/ToolsBrowserView.svelte'];
const EXPECTED_CASE_IDS = mapChangedFilesToCases(CHANGED_FILES).map((viewCase) => viewCase.id);

/**
 * The REAL predicates. This is a cycle-avoidance seam, not a test double — see the file header.
 */
const REAL_EVALUATE = Object.freeze({
  isExempt: isExemptByLabel,
  validateChangedFiles: validateChangedFilesForCheck,
  isArmed: hasUiChanges,
  explainMissingEvidence: explainScreenshotEvidenceFailure,
});

/** Small bounds so a poll loop is a handful of iterations rather than an hour of fake clock. */
const FAST_BOUNDS = Object.freeze({
  captureTimeoutMs: 60_000,
  graceMs: 10_000,
  slackMs: 5_000,
  maxWaitMs: 100_000,
  maxPolls: 240,
  pollIntervalMs: 1_000,
});

/** The module's own exported defaults, for the cases whose point is the production arithmetic. */
const PRODUCTION_BOUNDS = Object.freeze({
  captureTimeoutMs: CAPTURE_TIMEOUT_MS,
  graceMs: GRACE_MS,
  slackMs: SLACK_MS,
  maxWaitMs: MAX_WAIT_MS,
  maxPolls: MAX_POLLS,
  pollIntervalMs: POLL_INTERVAL_MS,
});

/**
 * One `decideScreenshotGate` call with this suite's standing pull request, its collaborators, and
 * whatever the case overrides.
 *
 * @param {object} options The case's fakes and overrides.
 * @returns {Promise<object>} The verdict.
 */
function decide({ gh, clock, bounds = FAST_BOUNDS, ...overrides }) {
  return decideScreenshotGate({
    runGh: gh.runGh,
    sleep: clock.sleep,
    now: clock.now,
    evaluate: REAL_EVALUATE,
    changedFiles: CHANGED_FILES,
    changedFilesRequired: true,
    body: '',
    headSha: HEAD,
    prNumber: PR,
    repo: REPO,
    headBranch: HEAD_BRANCH,
    headRepository: REPO,
    captureWorkflow: 'pr-screenshots.yml',
    awaitCapture: true,
    captureEligible: true,
    exemptLabel: 'screenshots-exempt',
    labels: [],
    ...bounds,
    ...overrides,
  });
}

/**
 * A body carrying only the managed block, for a head and a case set.
 *
 * @param {object} options The block's shape.
 * @returns {string} The body.
 */
function bodyWithBlock({ headSha = HEAD, caseIds = EXPECTED_CASE_IDS } = {}) {
  return `Some description.\n\n${managedScreenshotBlock({ prNumber: PR, caseIds, headSha })}\n`;
}

/** A body whose Screenshots section holds a drag-and-dropped GitHub attachment. */
const HUMAN_PASTED_BODY = '## Screenshots\n\n![a screenshot](https://github.test/attachments/9f3a)\n';

/**
 * Assert a verdict failed with a given code, quoting the message when it did not.
 *
 * @param {object} decision The verdict.
 * @param {string} code The expected code.
 * @returns {void}
 */
function assertFailedWith(decision, code) {
  assert.equal(decision.exitCode, 1, `expected a failing gate, got: ${decision.message}`);
  assert.equal(decision.code, code, `expected ${code}, got ${decision.code}: ${decision.message}`);
}

describe('decideScreenshotGate', () => {
  it('(a) still fails a frame-less UI PR after waiting for the capture run to conclude', async () => {
    const gh = makeGhFake({
      runs: (state) => [
        workflowRun({ status: state.runListCalls === 0 ? 'in_progress' : 'completed' }),
      ],
      body: '',
    });
    const clock = makeGateClock({ start: 0, step: 1_000 });

    const decision = await decide({ gh, clock });

    assertFailedWith(decision, GATE_CODES.CAPTURE_PUBLISHED_NOTHING);
    assert.equal(decision.waited, true, 'the gate must have actually waited');
    assert.equal(decision.runConclusion, 'success');
    assert.ok(clock.sleepCalls > 0, 'the gate must have slept at least once');
  });

  it('(b) passes within one run once the capture concludes and republishes the body', async () => {
    const published = bodyWithBlock();
    const gh = makeGhFake({
      runs: (state) => [
        workflowRun({ status: state.runListCalls === 0 ? 'in_progress' : 'completed' }),
      ],
      // The block appears only AFTER the second poll, i.e. only after the run completed. A gate that
      // decided on the pre-fetch copy, or that skipped the post-conclusion re-read, sees ''.
      body: (state) => (state.runListCalls >= 2 ? published : ''),
    });
    const clock = makeGateClock({ start: 0, step: 1_000 });

    const decision = await decide({ gh, clock });

    assert.equal(decision.exitCode, 0, decision.message);
    assert.equal(decision.waited, true);
    assert.equal(clock.sleepCalls, 1, 'exactly one wait cycle, and no manual re-run');
  });

  it('(c) reds on frames published for the previous head', async () => {
    const stale = bodyWithBlock({ headSha: PREVIOUS_HEAD });
    const gh = makeGhFake({ runs: [workflowRun({})], body: stale });
    const clock = makeGateClock({ start: 0, step: 1_000 });

    const decision = await decide({ gh, clock, body: stale });

    assertFailedWith(decision, GATE_CODES.NO_FRAMES_FOR_THIS_HEAD);
    assert.match(decision.message, new RegExp(PREVIOUS_HEAD));
  });

  it('(d) reds when this head’s frames depict none of the selected views', async () => {
    const wrong = bodyWithBlock({ caseIds: ['player-gathering-environments'] });
    const gh = makeGhFake({ runs: [workflowRun({})], body: wrong });
    const clock = makeGateClock({ start: 0, step: 1_000 });

    const decision = await decide({ gh, clock, body: wrong });

    assertFailedWith(decision, GATE_CODES.NO_FRAMES_FOR_CHANGED_VIEWS);
  });

  it('(e1) decides a fork immediately, calling neither the API nor sleep, and still fails', async () => {
    const gh = makeGhFake({});
    const clock = makeGateClock({});

    const decision = await decide({ gh, clock, captureEligible: false });

    assertFailedWith(decision, GATE_CODES.NO_SCREENSHOTS_SECTION);
    assert.equal(gh.calls.length, 0, 'a fork has no producer run to look for');
    assert.equal(clock.sleepCalls, 0);
    assert.equal(decision.waited, false);
  });

  it('(e2) fails an already-terminal capture that published nothing, without waiting', async () => {
    const gh = makeGhFake({ runs: [workflowRun({})], body: '' });
    const clock = makeGateClock({ start: 0, step: 1_000 });

    const decision = await decide({ gh, clock });

    assertFailedWith(decision, GATE_CODES.CAPTURE_PUBLISHED_NOTHING);
    assert.equal(decision.waited, false);
    assert.equal(decision.polls, 1, 'a run that is already terminal needs exactly one poll');
  });

  it('(f1) passes a head whose capture was cancelled because a newer head superseded it', async () => {
    const gh = makeGhFake({
      runs: [workflowRun({ conclusion: 'cancelled' })],
      headOid: NEXT_HEAD,
      body: '',
    });
    const clock = makeGateClock({ start: 0, step: 1_000 });

    const decision = await decide({ gh, clock });

    assert.equal(decision.exitCode, 0, decision.message);
    assert.equal(decision.code, GATE_CODES.SUPERSEDED);
    assert.match(decision.message, new RegExp(NEXT_HEAD));
  });

  it('(f2) fails a cancelled capture whose head has not moved', async () => {
    const gh = makeGhFake({
      runs: [workflowRun({ conclusion: 'cancelled' })],
      headOid: HEAD,
      body: '',
    });
    const clock = makeGateClock({ start: 0, step: 1_000 });

    const decision = await decide({ gh, clock });

    assertFailedWith(decision, GATE_CODES.CAPTURE_CANCELLED);
  });

  it('(g1) fails on the deadline when the capture never concludes and the clock advances', async () => {
    const gh = makeGhFake({ runs: [workflowRun({ status: 'in_progress', conclusion: null })] });
    const clock = makeGateClock({ start: 0, step: 10_000 });

    const decision = await decide({ gh, clock });

    assertFailedWith(decision, GATE_CODES.CAPTURE_DID_NOT_CONCLUDE);
    // The DEADLINE ended this, not the iteration cap. Without this assertion the two are
    // indistinguishable and deleting the deadline would leave the case green.
    assert.ok(
      decision.polls < FAST_BOUNDS.maxPolls,
      `expected the deadline to end the wait well before the ${FAST_BOUNDS.maxPolls}-poll cap, but it took ${decision.polls} polls`
    );
  });

  it('(g2) terminates on the iteration cap when the clock is frozen', async () => {
    const gh = makeGhFake({ runs: [workflowRun({ status: 'in_progress', conclusion: null })] });
    const clock = makeGateClock({ start: 0, step: 0 });

    const decision = await decide({ gh, clock, maxPolls: 5 });

    assertFailedWith(decision, GATE_CODES.CAPTURE_DID_NOT_CONCLUDE);
    assert.equal(decision.polls, 5, 'the cap, not the clock, is what ended this loop');
  });

  it('(h) passes on a human-pasted attachment even beside a stale managed block', async () => {
    const gh = makeGhFake({});
    const clock = makeGateClock({});
    const body = `${HUMAN_PASTED_BODY}\n${managedScreenshotBlock({ prNumber: PR, caseIds: EXPECTED_CASE_IDS, headSha: PREVIOUS_HEAD })}\n`;

    const decision = await decide({ gh, clock, body });

    assert.equal(decision.exitCode, 0, decision.message);
    assert.equal(gh.calls.length, 0, 'maintainer-supplied evidence needs no producer run');
  });

  it('(i) awaits the newer in-flight run rather than reading the older finished one', async () => {
    const older = workflowRun({
      id: 1,
      createdAt: atClock(0),
      htmlUrl: 'https://github.test/run/older',
    });
    const newer = (status) =>
      workflowRun({
        id: 2,
        status,
        createdAt: atClock(5_000),
        htmlUrl: 'https://github.test/run/newer',
      });
    const published = bodyWithBlock();
    const gh = makeGhFake({
      runs: (state) => [older, newer(state.runListCalls === 0 ? 'in_progress' : 'completed')],
      body: (state) => (state.runListCalls >= 2 ? published : ''),
    });
    const clock = makeGateClock({ start: 0, step: 1_000 });

    const decision = await decide({ gh, clock });

    assert.equal(decision.exitCode, 0, decision.message);
    assert.equal(decision.runUrl, 'https://github.test/run/newer');
  });

  it('(i2) ignores a run for the same head SHA that belongs to a different pull request', async () => {
    const gh = makeGhFake({ runs: [workflowRun({ prNumber: 999 })], body: bodyWithBlock() });
    const clock = makeGateClock({ start: 0, step: 10_000 });

    const decision = await decide({ gh, clock });

    assertFailedWith(decision, GATE_CODES.CAPTURE_RUN_NOT_FOUND);
  });

  it('(i3) prefers the in-flight run even when a later-created run has already finished', async () => {
    // A RE-RUN KEEPS ITS ORIGINAL `created_at`, so "most recently created" is not the same rule as
    // "prefer the unfinished one" — this fixture is the one that tells them apart.
    const inFlight = (status) =>
      workflowRun({
        id: 1,
        status,
        createdAt: atClock(0),
        htmlUrl: 'https://github.test/run/rerun',
      });
    const finished = workflowRun({
      id: 2,
      createdAt: atClock(9_000),
      htmlUrl: 'https://github.test/run/finished',
    });
    const published = bodyWithBlock();
    const gh = makeGhFake({
      runs: (state) => [
        inFlight(state.runListCalls === 0 ? 'in_progress' : 'completed'),
        finished,
      ],
      body: (state) => (state.runListCalls >= 2 ? published : ''),
    });
    const clock = makeGateClock({ start: 0, step: 1_000 });

    const decision = await decide({ gh, clock });

    assert.equal(decision.exitCode, 0, decision.message);
    assert.equal(decision.runUrl, 'https://github.test/run/rerun');
  });

  it('(j) tolerates a queue longer than the capture timeout, because the anchor is job start', async () => {
    // Against a gate-start anchor this is a guaranteed fail, and against a `run_started_at` anchor
    // populated DURING the queued phase it is too — which is what makes it discriminate rather than
    // pass under either reading.
    const queuedFor = 5;
    const gh = makeGhFake({
      runs: (state) => {
        if (state.runListCalls < queuedFor) {
          return [workflowRun({ status: 'queued', conclusion: null, runStartedAt: atClock(60_000) })];
        }
        if (state.runListCalls === queuedFor) {
          return [
            workflowRun({ status: 'in_progress', conclusion: null, runStartedAt: atClock(60_000) }),
          ];
        }
        return [workflowRun({ runStartedAt: atClock(60_000) })];
      },
      body: bodyWithBlock(),
    });
    const clock = makeGateClock({ start: 0, step: 10 * 60_000 });

    const decision = await decide({ gh, clock, bounds: PRODUCTION_BOUNDS });

    assert.equal(decision.exitCode, 0, decision.message);
    assert.ok(
      clock.now() > CAPTURE_TIMEOUT_MS,
      'the fixture must actually spend longer queued than the capture timeout'
    );
  });

  it('(k) keeps looking for the producer run through the grace window', async () => {
    const gh = makeGhFake({
      runs: (state) => (state.runListCalls < 3 ? [] : [workflowRun({})]),
      body: bodyWithBlock(),
    });
    const clock = makeGateClock({ start: 0, step: 1_000 });

    const decision = await decide({ gh, clock });

    assert.equal(decision.exitCode, 0, decision.message);
    assert.equal(decision.polls, 4, 'three empty polls then the run');
  });

  it('(k2) reports an expected producer that never appeared as such, never as missing evidence', async () => {
    const gh = makeGhFake({ runs: [], body: '' });
    const clock = makeGateClock({ start: 0, step: 4_000 });

    const decision = await decide({ gh, clock });

    assertFailedWith(decision, GATE_CODES.CAPTURE_RUN_NOT_FOUND);
    assert.notEqual(
      decision.code,
      GATE_CODES.NO_SCREENSHOTS_SECTION,
      'blaming the author for the producer not having appeared is the red this change removes'
    );
  });

  it('(l) names a failed capture run distinctly from an infrastructure gap', async () => {
    const gh = makeGhFake({
      runs: [workflowRun({ conclusion: 'failure', htmlUrl: 'https://github.test/run/failed' })],
      body: '',
    });
    const clock = makeGateClock({ start: 0, step: 1_000 });

    const decision = await decide({ gh, clock });

    assertFailedWith(decision, GATE_CODES.CAPTURE_RUN_FAILED);
    assert.match(decision.message, /failure/);
    assert.match(decision.message, /https:\/\/github\.test\/run\/failed/);
    assert.equal(decision.runUrl, 'https://github.test/run/failed');
  });

  it('(m) blames the stale frames, not the failed run, when the previous head’s block survives', async () => {
    const stale = bodyWithBlock({ headSha: PREVIOUS_HEAD });
    const gh = makeGhFake({ runs: [workflowRun({ conclusion: 'failure' })], body: stale });
    const clock = makeGateClock({ start: 0, step: 1_000 });

    const decision = await decide({ gh, clock, body: stale });

    assertFailedWith(decision, GATE_CODES.NO_FRAMES_FOR_THIS_HEAD);
  });

  it('(n) takes the fast path when the body already carries this head’s matched block', async () => {
    const gh = makeGhFake({});
    const clock = makeGateClock({});

    const decision = await decide({ gh, clock, body: bodyWithBlock() });

    assert.equal(decision.exitCode, 0, decision.message);
    assert.equal(decision.waited, false);
    assert.equal(gh.calls.length, 0, 'the fast path costs zero API calls');
    assert.equal(clock.sleepCalls, 0);
  });

  it('(n2) takes the fast path on a human-pasted image too', async () => {
    const gh = makeGhFake({});
    const clock = makeGateClock({});

    const decision = await decide({ gh, clock, body: HUMAN_PASTED_BODY });

    assert.equal(decision.exitCode, 0, decision.message);
    assert.equal(decision.waited, false);
    assert.equal(gh.calls.length, 0);
    assert.equal(clock.sleepCalls, 0);
  });

  it('(o) accepts a proper non-empty subset of the selected views — intersection, not equality', async () => {
    assert.ok(
      EXPECTED_CASE_IDS.length > 1,
      'this case needs a selection with more than one member to be a PROPER subset'
    );
    const gh = makeGhFake({});
    const clock = makeGateClock({});

    const decision = await decide({
      gh,
      clock,
      body: bodyWithBlock({ caseIds: EXPECTED_CASE_IDS.slice(0, 1) }),
    });

    assert.equal(decision.exitCode, 0, decision.message);
    assert.equal(gh.calls.length, 0);
  });

  it('(r) honours the screenshots-exempt label before anything else', async () => {
    const gh = makeGhFake({});
    const clock = makeGateClock({});

    const decision = await decide({ gh, clock, labels: ['screenshots-exempt'] });

    assert.equal(decision.exitCode, 0, decision.message);
    assert.equal(gh.calls.length, 0, 'an exempted PR must not wait out the producer first');
    assert.equal(clock.sleepCalls, 0);
  });

  it('(s) fails closed on an empty required changed-file input, with no API call', async () => {
    const gh = makeGhFake({});
    const clock = makeGateClock({});

    const decision = await decide({ gh, clock, changedFiles: [], changedFilesRequired: true });

    assert.equal(decision.exitCode, 1);
    assert.match(decision.message, /Changed-files input is empty/);
    assert.equal(gh.calls.length, 0);
  });

  it('(t) passes an unarmed, non-UI changed set with no API call', async () => {
    const gh = makeGhFake({});
    const clock = makeGateClock({});

    const decision = await decide({ gh, clock, changedFiles: ['docs/README.md', 'lang/en.json'] });

    assert.equal(decision.exitCode, 0, decision.message);
    assert.equal(gh.calls.length, 0);
  });

  it('(u) does not accept an image outside a Screenshots section', async () => {
    const gh = makeGhFake({});
    const clock = makeGateClock({});
    const body = 'A description with an inline diagram.\n\n![diagram](https://example.test/d.png)\n';

    const decision = await decide({ gh, clock, body, captureEligible: false });

    assertFailedWith(decision, GATE_CODES.NO_SCREENSHOTS_SECTION);
    assert.equal(gh.calls.length, 0);
  });
});

describe('the check command adapter', () => {
  /**
   * Write the CLI's file inputs into a fresh temp dir.
   *
   * @param {object} files The inputs.
   * @returns {Record<string, string>} Their absolute paths.
   */
  function writeCliInputs({ changedFiles = CHANGED_FILES, body = '', labels = [] } = {}) {
    const root = mkdtempSync(join(tmpdir(), 'fabricate-screenshot-gate-'));
    const paths = {
      changedFiles: join(root, 'changed-files.txt'),
      body: join(root, 'pr-body.md'),
      labels: join(root, 'labels.txt'),
    };
    writeFileSync(paths.changedFiles, changedFiles.join('\n'));
    writeFileSync(paths.body, body);
    writeFileSync(paths.labels, labels.join('\n'));
    return paths;
  }

  it('(p) forwards the head SHA, the await flag and the module’s own bounds, and applies the exit code', async () => {
    const paths = writeCliInputs({});
    const gh = makeGhFake({
      runs: [workflowRun({ status: 'in_progress', conclusion: null })],
      body: '',
    });
    // Frozen, so the iteration cap is what ends the wait — which is how this case observes the
    // module's exported `MAX_POLLS` through the adapter rather than restating a bound.
    const clock = makeGateClock({ start: 0, step: 0 });

    let exitCode;
    const captured = await captureConsole(async () => {
      exitCode = await runPreservingExitCode(() =>
        main(
          [
            'check',
            '--changed-files',
            paths.changedFiles,
            '--body-file',
            paths.body,
            '--labels',
            paths.labels,
            '--exempt-label',
            'screenshots-exempt',
            '--pr',
            String(PR),
            '--repo',
            REPO,
            '--head-sha',
            HEAD,
            '--head-branch',
            HEAD_BRANCH,
            '--head-repository',
            REPO,
            '--await-capture',
            '--capture-eligible',
            'true',
            '--capture-workflow',
            'pr-screenshots.yml',
            '--capture-timeout-minutes',
            '40',
          ],
          { runGh: gh.runGh, sleep: clock.sleep, now: clock.now }
        )
      );
    });

    assert.equal(exitCode, 1, 'the adapter must apply the returned exit code');
    assert.ok(
      captured.error.some((line) =>
        line.startsWith(`::error::${GATE_CODES.CAPTURE_DID_NOT_CONCLUDE}: `)
      ),
      `expected a ::error::${GATE_CODES.CAPTURE_DID_NOT_CONCLUDE} line, got ${JSON.stringify(captured.error)}`
    );

    // --await-capture reached the call: without it this decides on the body alone and never polls.
    const runListCalls = gh.calls.filter((args) => args[0] === 'api');
    assert.ok(runListCalls.length > 0, '--await-capture must be forwarded into the call');
    assert.ok(clock.sleepCalls > 0, 'waited === true when --await-capture is passed');

    // --head-sha reached the call as the HEAD sha, not some other revision.
    assert.ok(
      runListCalls.every((args) => args[1].includes(`head_sha=${HEAD}`)),
      `expected every runs query to carry head_sha=${HEAD}, got ${JSON.stringify(runListCalls)}`
    );

    // The bounds the module observed are the module's exported defaults, not adapter literals.
    assert.equal(runListCalls.length, MAX_POLLS);
    assert.ok(
      clock.sleeps.every((ms) => ms === POLL_INTERVAL_MS),
      `expected every sleep to be POLL_INTERVAL_MS (${POLL_INTERVAL_MS}), got ${JSON.stringify([...new Set(clock.sleeps)])}`
    );
  });

  it('(q) parses --capture-eligible as a literal string, so a fork never enters the wait loop', async () => {
    const paths = writeCliInputs({});
    const gh = makeGhFake({ runs: [workflowRun({})], body: bodyWithBlock() });
    const clock = makeGateClock({ start: 0, step: 1_000 });

    let exitCode;
    await captureConsole(async () => {
      exitCode = await runPreservingExitCode(() =>
        main(
          [
            'check',
            '--changed-files',
            paths.changedFiles,
            '--body-file',
            paths.body,
            '--labels',
            paths.labels,
            '--pr',
            String(PR),
            '--repo',
            REPO,
            '--head-sha',
            HEAD,
            '--await-capture',
            '--capture-eligible',
            'false',
          ],
          { runGh: gh.runGh, sleep: clock.sleep, now: clock.now }
        )
      );
    });

    assert.equal(exitCode, 1);
    assert.equal(
      gh.calls.length,
      0,
      "Boolean('false') is true — a coerced flag would put every fork into the wait loop"
    );
    assert.equal(clock.sleepCalls, 0);
  });
});

test('the published key discriminator anchors on the PR number, not on a hex-looking segment', () => {
  assert.deepEqual(
    classifyPublishedFrameUrl('https://cdn.test/pr-screenshots/1133/deadbeef/manager-tools.png', 1133),
    { caseId: 'manager-tools', headSha: 'deadbeef' }
  );
  assert.deepEqual(
    classifyPublishedFrameUrl('https://cdn.test/pr-screenshots/1133/manager-tools.png', 1133),
    { caseId: 'manager-tools', headSha: null },
    'a legacy key carries no head segment and must degrade to the case-id rule, not hard-fail'
  );
  assert.equal(
    classifyPublishedFrameUrl('https://github.test/user-attachments/assets/9f3a', 1133),
    null,
    'a drag-and-dropped attachment carries no identity at all'
  );
  assert.equal(
    classifyPublishedFrameUrl('https://cdn.test/pr-screenshots/999/abc/manager-tools.png', 1133),
    null,
    "another pull request's frame is not this one's"
  );
});

/**
 * The producer and this gate arm on two hand-maintained mirrors of one predicate — `hasUiChanges` in
 * `scripts/lib/viewLabCases.js` for `capture`, and `hasUiChanges` in
 * `scripts/ui-pr-screenshot-evidence.mjs` for `check-screenshots` — despite a workflow comment
 * asserting they are "exactly the same predicate". When they drift, this gate arms, capture skips
 * publishing, and the resulting `capture-published-nothing` message points the reader at IAM and
 * Foundry credentials for what is really a predicate-drift bug. This is the drift detector.
 *
 * It ALSO pins the degenerate-set guard in `matchPublishedFrames` as unreachable: an armed gate
 * implies a non-empty publishable selection today, because selection falls back to a publishable
 * default case.
 *
 * The domain is a fixed enumeration, not random strings: every `matches` source in `VIEW_RECIPES`,
 * every `sourceMatches` source in the View Lab case registry, plus the `lang/`-only and
 * `tests/view-lab/*.css` boundary cases the two predicates are most likely to disagree about.
 */

/** Regex metacharacters this reducer does not handle; a source still carrying one is skipped. */
const UNREDUCED_METACHARACTER = /[\\[\]()|*+?{}^$]/;

/**
 * A concrete repository path a `matches` / `sourceMatches` pattern would select, or null when the
 * pattern cannot be reduced to one literally.
 *
 * Returning null rather than guessing is the safe direction: a skipped pattern shrinks the domain,
 * which the non-vacuity floor below then catches if too many are skipped.
 *
 * @param {RegExp} pattern The trigger pattern.
 * @returns {string|null} A path, or null.
 */
function samplePathFor(pattern) {
  let source = pattern.source;
  if (!source.startsWith('^')) return null;
  source = source.slice(1);
  const anchoredEnd = source.endsWith('$');
  if (anchoredEnd) source = source.slice(0, -1);
  source = source.replace(/\(\?![^)]*\)/g, '');
  source = source.replace(/\(\?:([^)|]*)(?:\|[^)]*)*\)/g, '$1');
  source = source.replace(/\.[+*]/g, 'Sample');
  source = source.replace(/\\([./])/g, '$1');
  if (UNREDUCED_METACHARACTER.test(source)) return null;
  if (!anchoredEnd) source += 'Sample.svelte';
  return source;
}

test('the gate and the producer arm on the same predicate, and an armed gate selects frames', () => {
  const derived = [
    ...VIEW_RECIPES.flatMap((recipe) => recipe.matches),
    ...VIEW_LAB_CASES.flatMap((viewCase) => viewCase.sourceMatches),
  ]
    .map(samplePathFor)
    .filter(Boolean);

  // NON-VACUITY. A reducer that silently stopped reducing anything would leave this test asserting
  // over the boundary cases alone and reporting success — the exact failure mode a drift detector
  // must not have.
  assert.ok(
    derived.length >= 50,
    `derived only ${derived.length} sample paths from the two registries, so this drift detector is close to vacuous`
  );

  const boundary = [
    'lang/en.json',
    'lang/de.json',
    'tests/view-lab/cascade.css',
    'tests/view-lab/world/labContent.js',
    'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte',
    'styles/fabricate.css',
    'src/utils/componentBrowserModel.js',
    'scripts/lib/viewLabCases.js',
    'docs/README.md',
    'main.js',
  ];

  for (const path of [...new Set([...derived, ...boundary])]) {
    assert.equal(
      hasUiChanges([path]),
      labHasUiChanges([path]),
      `the gate and the producer disagree about whether "${path}" needs screenshot evidence`
    );
    if (!hasUiChanges([path])) continue;
    assert.ok(
      mapChangedFilesToCases([path]).length > 0,
      `"${path}" arms the gate but selects no publishable View Lab case, so the gate would wait for frames the producer will never render`
    );
  }

  // The MIXED case the two predicates exist to get right: a localization file alone is not
  // evidence-worthy, but shipped beside a render file it is.
  assert.equal(hasUiChanges(['lang/en.json']), false);
  assert.equal(labHasUiChanges(['lang/en.json']), false);
  const mixed = ['lang/en.json', 'src/ui/svelte/apps/manager/ToolsBrowserView.svelte'];
  assert.equal(hasUiChanges(mixed), true);
  assert.equal(labHasUiChanges(mixed), true);
  assert.ok(mapChangedFilesToCases(mixed).length > 0);
});
