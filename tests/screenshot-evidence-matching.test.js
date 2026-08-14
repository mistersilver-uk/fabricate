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
 * Each of the 45 mutations below must flip the named test to FAIL. A test that passes under its
 * mutation is not evidence of the behaviour it claims to cover. The delta's map named 24; the rest
 * are decision points post-implementation review found unpinned, and are listed here so a later
 * revision that removes one without removing its test is visible.
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
 *   `>=` -> `<=` in the recency reduce                      -> (i4)
 *   `candidates[0]` instead of the recency reduce           -> (i4)
 *   drop the head_branch fallback                           -> (x1)
 *   reject a run when headRepository is empty               -> (x2)
 *   gate-start deadline anchor                              -> (j)
 *   collapse capture-run-failed into capture-published-nothing   -> (l)
 *   collapse capture-run-not-found into no-screenshots-section   -> (k2)
 *   delete step 1 (the exempt label)                        -> (r)
 *   delete step 2 (the changed-files guard)                 -> (s)
 *   always-unarmed step 3                                   -> (a)
 *   always-armed step 3                                     -> (t)
 *   outsideBlock collects every image in the body           -> (u)
 *   adapter: drop the exit-code application                 -> (p)
 *   adapter: restate a bound literal                        -> (p)
 *   adapter: map the base SHA into headSha                  -> (p)
 *   adapter: never forward --await-capture                  -> (p)
 *   adapter: forward the wrong repo                         -> (p)
 *   adapter: forward the wrong capture workflow             -> (p)
 *   adapter: validate --capture-timeout-minutes and discard it   -> (p2)
 *   adapter: forward headBranch empty                       -> (p3)
 *   adapter: forward headRepository empty                   -> (p3)
 *   adapter: forward patches as undefined                   -> (p4)
 *   parseArgs: treat an empty flag value as missing         -> (p5)
 *   maxPolls * pollIntervalMs < maxWaitMs                   -> tests/ci-workflow-semantics.test.js
 *   judge staleness with no head SHA to judge against       -> (v)
 *   skip the staleness rule when a head SHA IS available    -> (v2)
 *   name a managed block the body does not contain          -> (w)
 *   blame the producer for a run list never read            -> (k3)
 *   htmlImageSrc returns ''                                 -> the image-parser test
 *   htmlImageSrc takes the LEFTMOST src                     -> the image-parser test
 *   markdownImageUrl keeps the CommonMark title             -> the image-parser test
 *   drop imageUrlsIn's .filter(Boolean)                     -> the image-parser test
 *   accept a URL the evidence predicate rejects             -> the image-predicate drift test
 *
 * WHY `# cancelled` IS THE RISK HERE AND `# fail` IS NOT ALWAYS ENOUGH
 * --------------------------------------------------------------------
 * Test (g2) freezes the injected clock and lets the producer run never conclude. If the iteration
 * cap were deleted, that loop would spin under a `sleep` that resolves immediately until node:test's
 * `--test-timeout` fires — which reports the file's remaining tests as `# cancelled`, never as
 * `# fail`. Read both counts.
 */

import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
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
  parseScreenshotEvidenceImages,
} from '../scripts/lib/screenshotEvidenceMatching.js';
import {
  FALLBACK_CASE_ID,
  VIEW_LAB_CASES,
  hasUiChanges as labHasUiChanges,
  mapChangedFilesToCases,
} from '../scripts/lib/viewLabCases.js';
import {
  VIEW_RECIPES,
  explainScreenshotEvidenceFailure,
  hasScreenshotEvidence,
  hasUiChanges,
  isExemptByLabel,
  main,
  validateChangedFilesForCheck,
} from '../scripts/ui-pr-screenshot-evidence.mjs';
import {
  DEFAULT_HEAD_BRANCH,
  atClock,
  captureConsole,
  gateCheckArgv,
  makeGateClock,
  makeGhFake,
  managedScreenshotBlock,
  runPreservingExitCode,
  workflowRun,
  writeGateCliInputs,
} from './helpers/screenshot-gate-fakes.js';

const PR = 1133;
const REPO = 'misterpotts/fabricate';
/** The same branch {@link workflowRun} reports, so the `head_branch` fallback is reachable. */
const HEAD_BRANCH = DEFAULT_HEAD_BRANCH;
const HEAD = 'a'.repeat(40);
const PREVIOUS_HEAD = 'b'.repeat(40);
const NEXT_HEAD = 'c'.repeat(40);
const CAPTURE_WORKFLOW = 'pr-screenshots.yml';
const MS_PER_MINUTE = 60_000;

/** A render change that selects a small, stable case set — small enough to name a proper subset. */
const CHANGED_FILES = ['src/ui/svelte/apps/manager/ToolsBrowserView.svelte'];
const EXPECTED_CASE_IDS = mapChangedFilesToCases(CHANGED_FILES).map((viewCase) => viewCase.id);

/** The View Lab case registry, which is both a lab input and a patch-attributable one. */
const REGISTRY_PATH = 'scripts/lib/viewLabCases.js';

/**
 * The 1-based line on which the registry declares the fallback case's id, asserted present so a
 * rename fails loudly instead of quietly turning the patch below into an assertion about line 0.
 *
 * @returns {number} The line number.
 */
function fallbackCaseIdLine() {
  const source = readFileSync(REGISTRY_PATH, 'utf8').split('\n');
  const index = source.indexOf(`    id: '${FALLBACK_CASE_ID}',`);
  assert.notEqual(index, -1, `${REGISTRY_PATH} no longer declares ${FALLBACK_CASE_ID} inline`);
  return index + 1;
}

/**
 * A unified diff claiming one line of the registry was just added, with the three lines of context
 * either side that `git` emits.
 *
 * The `+` line carries the file's CURRENT text because case attribution anchors on the window's
 * CONTENT rather than on the hunk header's line numbers — a patch built from invented text would
 * fail to anchor and widen back to the whole corpus, which is the answer this fixture must not get.
 *
 * @param {number} line The 1-based line to mark as added.
 * @returns {string} The patch.
 */
function registryPatchAddingLine(line) {
  const source = readFileSync(REGISTRY_PATH, 'utf8').split('\n');
  const from = Math.max(1, line - 3);
  const to = Math.min(source.length, line + 3);
  const body = [];
  for (let number = from; number <= to; number += 1) {
    body.push(`${number === line ? '+' : ' '}${source[number - 1]}`);
  }
  return [`@@ -${from},${body.length - 1} +${from},${body.length} @@`, ...body].join('\n');
}

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
    captureWorkflow: CAPTURE_WORKFLOW,
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

  it('(i4) reports the newer of two equally-classed runs, not the one the list happens to lead with', async () => {
    // THE TIE-BREAK ITSELF, which (i) and (i3) do not reach: both of those put their two runs in
    // DIFFERENT terminality classes, so `pending` narrows to a single candidate and the recency
    // reduce never compares a pair. Two completed runs for one head is the ordinary shape — `opened`
    // then `reopened`, or a synchronize landing on the same SHA — and there the reduce is the only
    // thing choosing. Picking the older reports a stale conclusion and points the reader at the
    // wrong log, which is a wrong-problem red of exactly the kind this issue exists to remove.
    const older = workflowRun({
      id: 1,
      conclusion: 'failure',
      createdAt: atClock(0),
      htmlUrl: 'https://github.test/run/first-attempt',
    });
    const newer = workflowRun({
      id: 2,
      conclusion: 'success',
      createdAt: atClock(5_000),
      htmlUrl: 'https://github.test/run/second-attempt',
    });
    const gh = makeGhFake({ runs: [older, newer], body: bodyWithBlock() });
    const clock = makeGateClock({ start: 0, step: 1_000 });

    const decision = await decide({ gh, clock });

    assert.equal(decision.exitCode, 0, decision.message);
    assert.equal(decision.runUrl, 'https://github.test/run/second-attempt');
    assert.equal(decision.runConclusion, 'success');
  });

  it('(x1) narrows an unattached run by head branch, and keeps the one that matches', async () => {
    // The API leaves `pull_requests` empty often enough that the head-branch fallback is load-
    // bearing, and every other fixture here carries an attached number — so the fallback was dead
    // code as far as this suite could see, and deleting it outright left the suite green. Two runs,
    // one for this branch and one for somebody else's, on the same head SHA.
    const mine = workflowRun({ id: 1, prNumber: null, htmlUrl: 'https://github.test/run/mine' });
    const theirs = workflowRun({
      id: 2,
      prNumber: null,
      headBranch: 'agent/9999-someone-else',
      createdAt: atClock(9_000),
      htmlUrl: 'https://github.test/run/theirs',
    });
    const gh = makeGhFake({ runs: [mine, theirs], body: bodyWithBlock() });
    const clock = makeGateClock({ start: 0, step: 1_000 });

    const decision = await decide({ gh, clock });

    assert.equal(decision.exitCode, 0, decision.message);
    assert.equal(
      decision.runUrl,
      'https://github.test/run/mine',
      "the newer run is on another branch; matching it would report another pull request's capture"
    );
  });

  it('(x2) still finds the run when the head repository is unknown, as a deleted fork makes it', async () => {
    // `ci.yml` renders `--head-repository ''` when a contributor deletes their fork while the pull
    // request is open (`head.repo` is then null). An absent narrowing input must narrow NOTHING —
    // rejecting every run instead would answer `capture-run-not-found` on a pull request whose
    // producer ran, which is an unskippable red for a reason outside the author's control.
    const gh = makeGhFake({
      runs: [workflowRun({ prNumber: null, headRepository: 'deleted-fork/fabricate' })],
      body: bodyWithBlock(),
    });
    const clock = makeGateClock({ start: 0, step: 1_000 });

    const decision = await decide({ gh, clock, headRepository: '' });

    assert.equal(decision.exitCode, 0, decision.message);
    assert.equal(decision.runUrl, 'https://github.test/run/1');
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
    assert.equal(clock.sleepCalls, 0, 'a guard that fails closed must not wait first');
  });

  it('(t) passes an unarmed, non-UI changed set with no API call', async () => {
    const gh = makeGhFake({});
    const clock = makeGateClock({});

    const decision = await decide({ gh, clock, changedFiles: ['docs/README.md', 'lang/en.json'] });

    assert.equal(decision.exitCode, 0, decision.message);
    assert.equal(gh.calls.length, 0);
    assert.equal(clock.sleepCalls, 0, 'an unarmed gate must not wait out a producer either');
  });

  it('(u) does not accept an image outside a Screenshots section', async () => {
    const gh = makeGhFake({});
    const clock = makeGateClock({});
    const body = 'A description with an inline diagram.\n\n![diagram](https://example.test/d.png)\n';

    const decision = await decide({ gh, clock, body, captureEligible: false });

    assertFailedWith(decision, GATE_CODES.NO_SCREENSHOTS_SECTION);
    assert.equal(gh.calls.length, 0);
  });

  it('(v) does not call a published block stale when no head SHA was supplied to judge it against', async () => {
    // THE PRE-CHANGE DEFAULT INVOCATION, exactly: no `awaitCapture` and no `headSha`, which is how
    // `npm run screenshots:ui:check` and every other non-CI caller reach the gate. `headSha` defaults
    // to `''`, and a published key's SHA segment is never `''`, so a plain equality test classes
    // EVERY identified frame stale here — turning a body carrying a perfectly good block into
    // `no-frames-for-this-head`, with an empty SHA interpolated into the prose. Cases (n) and (n2)
    // cannot see that: one carries a no-evidence body and the other a human-pasted image, and neither
    // reaches the matcher's head rule at all.
    const gh = makeGhFake({});
    const clock = makeGateClock({});

    const decision = await decide({
      gh,
      clock,
      body: bodyWithBlock({ headSha: PREVIOUS_HEAD }),
      headSha: '',
      awaitCapture: false,
      captureEligible: false,
    });

    assert.equal(decision.exitCode, 0, decision.message);
    assert.equal(decision.code, null);
    assert.match(decision.message, new RegExp(EXPECTED_CASE_IDS[0]));
    assert.equal(gh.calls.length, 0, 'the default path must make no API call at all');
    assert.equal(clock.sleepCalls, 0);
  });

  it('(v2) still reds on the previous head’s frames the moment a head SHA IS available', async () => {
    // The control for (v). The degradation above is scoped to "cannot judge head" and must not have
    // relaxed the staleness rule anywhere a head SHA exists — including on the same default,
    // non-await path (v) exercises, which is where (c) and (m) do not reach.
    const gh = makeGhFake({});
    const clock = makeGateClock({});

    const decision = await decide({
      gh,
      clock,
      body: bodyWithBlock({ headSha: PREVIOUS_HEAD }),
      awaitCapture: false,
      captureEligible: false,
    });

    assertFailedWith(decision, GATE_CODES.NO_FRAMES_FOR_THIS_HEAD);
    assert.match(decision.message, new RegExp(`head ${HEAD}\\b`), 'the head must be named, not empty');
    assert.equal(gh.calls.length, 0);
  });

  it('(w) does not name a managed screenshot block the body does not contain', async () => {
    // `containsImage` in the evaluation bundle accepts an `<img>` with an empty `src`, while
    // `imageUrlsIn` reads no URL out of it — so the gate arrives at the matcher with no missing-
    // evidence explanation AND no frames, having never seen a managed block. Sending the reader to
    // look inside a block that is not there is the wrong-problem red this whole issue is about.
    const gh = makeGhFake({});
    const clock = makeGateClock({});

    const decision = await decide({
      gh,
      clock,
      body: '## Screenshots\n\n<img src="">\n',
      awaitCapture: false,
      captureEligible: false,
    });

    assert.equal(decision.exitCode, 1);
    assert.doesNotMatch(
      decision.message,
      /The managed screenshot block carries/,
      'no managed block exists in this body, so the message must not describe one'
    );
    assert.match(decision.message, /no managed screenshot block/);
    assert.equal(gh.calls.length, 0);
  });

  it('(k3) does not blame the producer for a run list it never managed to read', async () => {
    // A sustained API outage or a rate-limit 403 makes `listCaptureRuns` answer `[]`, which is
    // byte-identical to "the producer never dispatched". Telling the reader to check whether
    // pr-screenshots.yml dispatches at all is then the wrong place to look. Still fails closed.
    const gh = makeGhFake({ runs: [], body: '' });
    const runGh = (args) => {
      if (args[0] !== 'api') return gh.runGh(args);
      gh.calls.push([...args]);
      return { status: 1, stdout: '', stderr: 'HTTP 403: API rate limit exceeded' };
    };
    const clock = makeGateClock({ start: 0, step: 4_000 });

    let decision;
    const captured = await captureConsole(async () => {
      decision = await decide({ gh: { runGh, calls: gh.calls }, clock });
    });

    assertFailedWith(decision, GATE_CODES.CAPTURE_RUN_NOT_FOUND);
    assert.ok(gh.calls.length > 1, 'the grace window must have been polled more than once');
    assert.match(decision.message, /could not be read/);
    assert.match(decision.message, new RegExp(`all ${gh.calls.length} attempt`));
    assert.doesNotMatch(
      decision.message,
      /is dispatching for this pull request at all/,
      'an unread run list is no evidence about whether the producer dispatched'
    );
    assert.ok(captured.warn.length > 0, 'each failed list call is still warned about');
  });
});

describe('the check command adapter', () => {
  /** The flags the CI step passes for a same-repository pull request, minus the case's own. */
  const AWAIT_FLAGS = Object.freeze([
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
    CAPTURE_WORKFLOW,
  ]);

  /**
   * The CLI's file inputs, removed when the case ends.
   *
   * @param {object} t The running test, whose `after` hook owns the cleanup.
   * @param {object} [inputs] Overrides for the written files.
   * @returns {Record<string, string>} Their absolute paths.
   */
  function cliInputs(t, inputs = {}) {
    const paths = writeGateCliInputs({ changedFiles: CHANGED_FILES, ...inputs });
    t.after(() => rmSync(paths.root, { recursive: true, force: true }));
    return paths;
  }

  /**
   * Drive the real `main(['check', …])` with faked collaborators and captured output.
   *
   * @param {string[]} argv The argument vector.
   * @param {object} collaborators The `gh` fake and the fake clock.
   * @returns {Promise<{exitCode: number, captured: object}>} The exit code and console output.
   */
  async function runCheck(argv, { gh, clock }) {
    let exitCode;
    const captured = await captureConsole(async () => {
      exitCode = await runPreservingExitCode(() =>
        main(argv, { runGh: gh.runGh, sleep: clock.sleep, now: clock.now })
      );
    });
    return { exitCode, captured };
  }

  /**
   * The runs-list queries a case's `gh` fake was asked for.
   *
   * @param {object} gh The `gh` fake.
   * @returns {string[]} The query paths.
   */
  function runsQueries(gh) {
    return gh.calls.filter((args) => args[0] === 'api').map((args) => args[1]);
  }

  /**
   * Assert the adapter annotated its verdict with one gate code, rather than printing prose or
   * nothing at all — the annotation being what puts the diagnosis on the pull request.
   *
   * @param {object} captured The captured console output.
   * @param {string} code The expected gate code.
   * @param {string} [names] Text the diagnostic must also carry.
   * @returns {void}
   */
  function assertAnnotated(captured, code, names = '') {
    assert.ok(
      captured.error.some((line) => line.startsWith(`::error::${code}: `) && line.includes(names)),
      `expected a ::error::${code} line${names ? ` naming ${names}` : ''}, got ${JSON.stringify(captured.error)}`
    );
  }

  it('(p) forwards the head SHA, the repo, the workflow, the await flag and the module’s own bounds, and applies the exit code', async (t) => {
    const paths = cliInputs(t);
    const gh = makeGhFake({
      runs: [workflowRun({ status: 'in_progress', conclusion: null })],
      body: '',
    });
    // Frozen, so the iteration cap is what ends the wait — which is how this case observes the
    // module's exported `MAX_POLLS` through the adapter rather than restating a bound.
    const clock = makeGateClock({ start: 0, step: 0 });

    const { exitCode, captured } = await runCheck(
      gateCheckArgv(paths, {
        prNumber: PR,
        extra: [...AWAIT_FLAGS, '--capture-timeout-minutes', '40'],
      }),
      { gh, clock }
    );

    assert.equal(exitCode, 1, 'the adapter must apply the returned exit code');
    assertAnnotated(captured, GATE_CODES.CAPTURE_DID_NOT_CONCLUDE);

    // --await-capture reached the call: without it this decides on the body alone and never polls.
    const queries = runsQueries(gh);
    assert.ok(queries.length > 0, '--await-capture must be forwarded into the call');
    assert.ok(clock.sleepCalls > 0, 'waited === true when --await-capture is passed');

    // --repo and --capture-workflow reached the call too. The runs query is the ONLY place either
    // is observable, and asserting the head SHA alone left both free: a gate polling the wrong
    // repository, or another workflow, waits out its whole budget and reds a pull request whose
    // producer succeeded — with the same `capture-did-not-conclude` code this case already saw.
    assert.ok(
      queries.every((query) =>
        query.startsWith(`repos/${REPO}/actions/workflows/${CAPTURE_WORKFLOW}/runs`)
      ),
      `expected every runs query under repos/${REPO}/actions/workflows/${CAPTURE_WORKFLOW}, got ${JSON.stringify([...new Set(queries)])}`
    );

    // --head-sha reached the call as the HEAD sha, not some other revision.
    assert.ok(
      queries.every((query) => query.includes(`head_sha=${HEAD}`)),
      `expected every runs query to carry head_sha=${HEAD}, got ${JSON.stringify([...new Set(queries)])}`
    );

    // The bounds the module observed are the module's exported defaults, not adapter literals.
    assert.equal(queries.length, MAX_POLLS);
    assert.ok(
      clock.sleeps.every((ms) => ms === POLL_INTERVAL_MS),
      `expected every sleep to be POLL_INTERVAL_MS (${POLL_INTERVAL_MS}), got ${JSON.stringify([...new Set(clock.sleeps)])}`
    );
  });

  it('(p2) forwards --capture-timeout-minutes as the producer deadline, not merely validating it', async (t) => {
    // The flag was VALIDATED by a test and its value pinned by nothing: an adapter that parsed it
    // and then passed `undefined` left the whole suite green. The latent failure is exact — raise
    // `capture`'s own `timeout-minutes` to 60, and `tests/ci-workflow-semantics.test.js` follows the
    // YAML while the module keeps waiting 40, so every capture past 40 minutes reds
    // `capture-did-not-conclude`: this issue's symptom under a new code, suite green.
    const paths = cliInputs(t);
    const gh = makeGhFake({
      runs: [workflowRun({ status: 'in_progress', conclusion: null })],
      body: '',
    });
    // Advancing, so the DEADLINE ends this wait rather than the iteration cap — the deadline being
    // the only thing the forwarded value can be observed through.
    const clock = makeGateClock({ start: 0, step: POLL_INTERVAL_MS });

    const { exitCode, captured } = await runCheck(
      gateCheckArgv(paths, {
        prNumber: PR,
        extra: [...AWAIT_FLAGS, '--capture-timeout-minutes', '1'],
      }),
      { gh, clock }
    );

    assert.equal(exitCode, 1);
    assertAnnotated(captured, GATE_CODES.CAPTURE_DID_NOT_CONCLUDE);

    // One minute plus the module's own slack, observed on the injected clock: the wait ended at the
    // first poll at or after that deadline, so it lands inside one poll interval of it.
    const deadline = MS_PER_MINUTE + SLACK_MS;
    assert.ok(
      clock.now() >= deadline && clock.now() < deadline + POLL_INTERVAL_MS,
      `expected the wait to end at the 1-minute deadline (${deadline}ms + slack), but the clock read ${clock.now()}ms`
    );
    assert.ok(
      clock.now() < CAPTURE_TIMEOUT_MS,
      `a discarded --capture-timeout-minutes falls back to the module's ${CAPTURE_TIMEOUT_MS}ms default, which this clock reading (${clock.now()}ms) must be nowhere near`
    );
  });

  it('(p3) forwards --head-branch and --head-repository, so another PR’s run is not adopted', async (t) => {
    // Both are pure run-selection inputs, invisible in the runs query, and each degrades to "narrow
    // on nothing" when empty — so forwarding either as `''` is silent. Two unattached runs on this
    // head, one on somebody else's branch and one from a different head repository: forwarding both
    // flags rejects both runs, and dropping EITHER adopts the run that flag was rejecting.
    const paths = cliInputs(t);
    const gh = makeGhFake({
      runs: [
        workflowRun({ id: 1, prNumber: null, headBranch: 'agent/9999-someone-else' }),
        workflowRun({ id: 2, prNumber: null, headRepository: 'someone-else/fabricate' }),
      ],
      body: '',
    });
    const clock = makeGateClock({ start: 0, step: MS_PER_MINUTE });

    const { exitCode, captured } = await runCheck(
      gateCheckArgv(paths, { prNumber: PR, extra: [...AWAIT_FLAGS] }),
      { gh, clock }
    );

    assert.equal(exitCode, 1);
    assertAnnotated(captured, GATE_CODES.CAPTURE_RUN_NOT_FOUND);
    assert.ok(runsQueries(gh).length > 1, 'the grace window must have been polled more than once');
  });

  it('(p4) forwards --patches-file, so the narrowed case selection actually narrows', async (t) => {
    // `--patches-file` is the only input that changes WHICH frames count as evidence, and an
    // adapter that read the file and passed `undefined` was invisible: every other case here
    // changes files whose selection is patch-independent. A registry change with a patch confined
    // to one case selects that case; without the patch it selects the whole corpus, which
    // accepts any frame at all.
    const patches = { [REGISTRY_PATH]: registryPatchAddingLine(fallbackCaseIdLine()) };
    // The registry ships BESIDE a render file, because the registry alone does not arm this gate —
    // and that is the realistic shape anyway: a case is added in the same push as the view it draws.
    const changedFiles = [...CHANGED_FILES, REGISTRY_PATH];
    const publishedCaseId = 'player-gathering-environments';
    // The fixture's own preconditions, stated rather than assumed: a patch that stopped narrowing
    // would make the assertions below pass for the wrong reason.
    const narrowed = mapChangedFilesToCases(changedFiles, { patches }).map(
      (viewCase) => viewCase.id
    );
    assert.ok(
      narrowed.includes(FALLBACK_CASE_ID) && !narrowed.includes(publishedCaseId),
      `the patch must narrow the registry onto ${FALLBACK_CASE_ID} and off ${publishedCaseId}, but selected ${JSON.stringify(narrowed)}`
    );
    assert.ok(
      mapChangedFilesToCases(changedFiles)
        .map((viewCase) => viewCase.id)
        .includes(publishedCaseId),
      'and the same change with no patch must select it, or this case cannot see the difference'
    );

    const paths = cliInputs(t, {
      changedFiles,
      body: bodyWithBlock({ caseIds: [publishedCaseId] }),
      patches,
    });
    const gh = makeGhFake({});
    const clock = makeGateClock({});

    const { exitCode, captured } = await runCheck(
      gateCheckArgv(paths, {
        prNumber: PR,
        extra: ['--repo', REPO, '--head-sha', HEAD, '--patches-file', paths.patchesFile],
      }),
      { gh, clock }
    );

    assert.equal(exitCode, 1, 'a frame for a case the patch does not touch is not evidence for it');
    assertAnnotated(captured, GATE_CODES.NO_FRAMES_FOR_CHANGED_VIEWS, FALLBACK_CASE_ID);
    assert.equal(gh.calls.length, 0, 'this decision needs no producer run');
  });

  it('(p5) reaches a coded verdict on an EMPTY --head-repository, and the exempt label still clears it', async (t) => {
    // `ci.yml` passes `--head-repository "$PR_HEAD_REPO"`, and that variable renders EMPTY when a
    // contributor deletes their fork while the pull request is open (`head.repo` is then null).
    // Argument parsing treated an empty next token as a MISSING value and threw, so the required
    // check died with a bare message and no `::error::<code>` — and, because parsing precedes step
    // 1, not even a maintainer-applied `screenshots-exempt` label could clear it. An unskippable
    // red for a reason outside the author's control is the failure class this whole issue is about.
    const paths = cliInputs(t, { body: 'No evidence here.' });
    const emptyHeadRepository = ['--repo', REPO, '--head-sha', HEAD, '--head-repository', ''];
    const gh = makeGhFake({});
    const clock = makeGateClock({});

    const failing = await runCheck(
      gateCheckArgv(paths, { prNumber: PR, extra: emptyHeadRepository }),
      { gh, clock }
    );

    assert.equal(failing.exitCode, 1);
    assert.ok(
      failing.captured.error.every((line) => line.startsWith('::error::')),
      `a verdict is annotated, never bare; got ${JSON.stringify(failing.captured.error)}`
    );
    assertAnnotated(failing.captured, GATE_CODES.NO_SCREENSHOTS_SECTION);

    const exempt = cliInputs(t, { body: 'No evidence here.', labels: ['screenshots-exempt'] });
    const exempted = await runCheck(
      gateCheckArgv(exempt, { prNumber: PR, extra: emptyHeadRepository }),
      { gh, clock }
    );

    assert.equal(exempted.exitCode, 0, exempted.captured.error.join('\n'));
    assert.ok(
      exempted.captured.log.some((line) => line.includes('screenshots-exempt')),
      'the maintainer label must still be readable on this path'
    );
  });

  it('(q) parses --capture-eligible as a literal string, so a fork never enters the wait loop', async (t) => {
    const paths = cliInputs(t);
    const gh = makeGhFake({ runs: [workflowRun({})], body: bodyWithBlock() });
    const clock = makeGateClock({ start: 0, step: 1_000 });

    const { exitCode } = await runCheck(
      gateCheckArgv(paths, {
        prNumber: PR,
        extra: [
          '--repo',
          REPO,
          '--head-sha',
          HEAD,
          '--await-capture',
          '--capture-eligible',
          'false',
        ],
      }),
      { gh, clock }
    );

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
 * The image URLs a body's Screenshots section carries, for the two tests below.
 *
 * @param {string} markup The section's markup.
 * @returns {string[]} The URLs.
 */
function screenshotSectionUrls(markup) {
  return parseScreenshotEvidenceImages(`## Screenshots\n\n${markup}\n`).outsideBlock;
}

test('the image parser reads a URL out of each markup form, and none out of the empty ones', () => {
  // The single-regex forms these rules were extracted from were AMBIGUOUS and backtracked
  // super-linearly (SonarCloud S5852), so the narrowing moved into plain code — where it is
  // testable, and where it was untested: no fixture in either suite carried an `<img>` tag, a
  // titled Markdown target or an empty target, so four mutations of that code survived the suite.
  assert.deepEqual(screenshotSectionUrls('<img alt="a shot" src="https://cdn.test/one.png">'), [
    'https://cdn.test/one.png',
  ]);
  assert.deepEqual(
    screenshotSectionUrls('<img src=one.png src="two.png">'),
    ['two.png'],
    'the RIGHTMOST src wins, as the greedy single-regex form it replaced did'
  );
  assert.deepEqual(
    screenshotSectionUrls('![a shot](https://cdn.test/three.png "A title")'),
    ['https://cdn.test/three.png'],
    "CommonMark's optional title is not part of the destination"
  );
  assert.deepEqual(
    screenshotSectionUrls('![a]()\n\n<img src="">\n\n![b](   )'),
    [],
    'markup with no destination is markup without an image; counting it would satisfy the gate on nothing'
  );
});

/**
 * The markup forms the two hand-maintained "what counts as an image" implementations are most
 * likely to disagree about: both syntaxes, both quoting styles, an unquoted value, a repeated
 * attribute, a tag broken over lines, and every empty-destination shape.
 */
const IMAGE_MARKUP_SAMPLES = Object.freeze([
  '![a shot](https://cdn.test/a.png)',
  '![a shot](https://cdn.test/a.png "A title")',
  '![](https://cdn.test/a.png)',
  'Some prose ![a shot](https://cdn.test/a.png) around it.',
  '![a shot](<https://cdn.test/a.png>)',
  '<img src="https://cdn.test/a.png">',
  "<IMG SRC='https://cdn.test/a.png'>",
  '<img alt="a shot" src=https://cdn.test/a.png>',
  '<img src="a.png" src="b.png">',
  '<img\n  alt="a shot"\n  src="https://cdn.test/a.png"\n>',
  '![a]()',
  '![a](   )',
  '<img src="">',
  '<img alt="no source at all">',
]);

test('the image parser never claims a URL the evidence predicate would not call evidence', () => {
  // `containsImage`/`hasScreenshotEvidence` in `scripts/ui-pr-screenshot-evidence.mjs` and
  // `imageUrlsIn`/`screenshotSections` here are two hand-maintained mirrors of one rule, and the
  // ESM cycle described in this module's header is why they cannot be one. This is the drift
  // detector for the direction that would WEAKEN the gate: a URL the parser accepts satisfies the
  // gate outright through the human-pasted precedence rule, without the predicate being consulted
  // at all, so a parser that read images the predicate rejects would quietly widen what passes.
  let withUrls = 0;
  for (const markup of IMAGE_MARKUP_SAMPLES) {
    const body = `## Screenshots\n\n${markup}\n`;
    if (parseScreenshotEvidenceImages(body).outsideBlock.length === 0) continue;
    withUrls += 1;
    assert.ok(
      hasScreenshotEvidence(body),
      `the parser reads an image URL out of markup the evidence predicate rejects: ${JSON.stringify(markup)}`
    );
  }
  // NON-VACUITY. A parser that read nothing at all would satisfy the loop above for free.
  assert.ok(
    withUrls >= 10,
    `only ${withUrls} sample(s) produced a URL, so this check is near-vacuous`
  );

  // The OTHER direction is a KNOWN, one-way gap rather than an oversight: the predicate accepts an
  // empty `src` and an empty target as images while the parser reads no URL out of either. That is
  // the case (w) diagnostic's whole reason for existing, and it is asserted here so a change that
  // closes it in either implementation has to come past this test.
  const emptySource = '## Screenshots\n\n<img src="">\n';
  assert.equal(hasScreenshotEvidence(emptySource), true);
  assert.deepEqual(parseScreenshotEvidenceImages(emptySource).outsideBlock, []);
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
