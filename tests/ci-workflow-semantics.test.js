import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// The workflow-source walkers and the `if:` tokenizer/evaluator this file used to inline now live
// in tests/helpers/workflow-source.js, shared with tests/forward-port-workflow.test.js (issue
// #1001). The extraction is behaviour-preserving, and the proof is that the `test(...)` body below
// is byte-identical to its pre-extraction form while `npm test` stays green: `parseJobs` still
// indexes jobs by indentation, so a walker that stopped filtering comments would give ci.yml a
// spurious job key and fail the `deepEqual` assertions loudly, and every `if:` in ci.yml is
// single-line while its only block scalars are `run:` bodies this file never reads.
//
// `section` is imported rather than re-implemented as a local closure for the same duplication
// reason. `parseWorkflow` sits OUTSIDE the `test(...)` body, so this does not touch the identity
// that proves the extraction behaviour-preserving.
import {
  children,
  entries,
  evaluate,
  key,
  parseJobs,
  section,
  unwrap,
  value,
} from './helpers/workflow-source.js';
// The gate's bound defaults are READ, not restated (issue 1133). Restating them here would create a
// second source of truth for the arithmetic this file exists to check, which is the failure the
// check itself is about.
import {
  GRACE_MS,
  MAX_POLLS,
  MAX_WAIT_MS,
  POLL_INTERVAL_MS,
  SLACK_MS,
} from '../scripts/lib/screenshotEvidenceMatching.js';

function parseWorkflow(source) {
  const all = entries(source);
  const on = section(all, 'on');
  const pullRequestIndex = on.findIndex(
    (entry) => entry.indent === 2 && key(entry.text) === 'pull_request'
  );
  const pullRequest = children(on, pullRequestIndex);
  const types = value(pullRequest.find((entry) => key(entry.text) === 'types').text)
    .slice(1, -1)
    .split(',')
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ''));

  const concurrency = section(all, 'concurrency');
  const group = value(concurrency.find((entry) => key(entry.text) === 'group').text);

  return { types, group, jobs: parseJobs(source) };
}

function contextFor(action) {
  return {
    github: {
      event_name: 'pull_request',
      event: { action, pull_request: { number: 874 } },
      sha: 'abc1234',
    },
  };
}

function jobsFor(workflow, action) {
  const context = contextFor(action);
  return Object.entries(workflow.jobs)
    .filter(([, job]) => !job.if || evaluate(job.if, context))
    .map(([name]) => name)
    .sort();
}

function renderGroup(template, action) {
  const context = contextFor(action);
  return template.replace(/\$\{\{\s*(.*?)\s*\}\}/g, (_, expression) =>
    String(evaluate(expression, context))
  );
}

test('CI semantically isolates edited metadata runs and fully gates ready_for_review', () => {
  const workflow = parseWorkflow(readFileSync('.github/workflows/ci.yml', 'utf8'));

  assert.ok(workflow.types.includes('edited'));
  assert.ok(workflow.types.includes('ready_for_review'));
  assert.deepEqual(jobsFor(workflow, 'edited'), ['check-screenshots', 'lint-commits']);
  assert.deepEqual(jobsFor(workflow, 'ready_for_review'), [
    'check-screenshots',
    'lint',
    'lint-commits',
    'unit-tests',
    'validate-bindings',
  ]);

  const edited = renderGroup(workflow.group, 'edited');
  const ready = renderGroup(workflow.group, 'ready_for_review');
  assert.notEqual(edited, ready);
  assert.match(edited, /metadata/);
  assert.match(ready, /code/);
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// The screenshot gate's sequencing contract (issue 1133).
//
// A SECOND `test(...)`, deliberately, rather than additions inside the one above: that test's header
// argues its byte-identical body is the proof the helper extraction was behaviour-preserving, and
// appending to it would destroy that argument for nothing.
//
// What this pins is VALUE ORDERING — that the script's own `capture-did-not-conclude` diagnosis
// fires before GitHub kills the job, and that the poll product can actually reach the wall-clock
// ceiling. That is a diagnostic-quality property. TERMINATION itself is proven by
// `tests/screenshot-evidence-matching.test.js` case (g2) and the iteration cap, not by an
// inequality.
// ────────────────────────────────────────────────────────────────────────────────────────────────

const MS_PER_MINUTE = 60_000;

/**
 * The value a long-form CLI flag carries in a shell body, or null when the flag is absent.
 *
 * @param {string} body The shell body.
 * @param {string} flag The flag, `--like-this`.
 * @returns {string|null} The value.
 */
function flagValue(body, flag) {
  const match = new RegExp(`${flag}\\s+"?([^"\\s\\\\]+)"?`).exec(body);
  return match ? match[1] : null;
}

/**
 * A context in which the fork-eligibility question has a known answer.
 *
 * @param {boolean} sameRepo Whether the head branch lives in this repository.
 * @returns {object} The evaluation context.
 */
function forkContext(sameRepo) {
  return {
    github: {
      repository: 'misterpotts/fabricate',
      event: {
        pull_request: {
          head: { repo: { full_name: sameRepo ? 'misterpotts/fabricate' : 'forker/fabricate' } },
        },
      },
    },
  };
}

test('the screenshot gate awaits the capture run for its own head, within pinned bounds', () => {
  const ciSource = readFileSync('.github/workflows/ci.yml', 'utf8');
  const captureSource = readFileSync('.github/workflows/pr-screenshots.yml', 'utf8');
  const gate = parseJobs(ciSource)['check-screenshots'];
  const capture = parseJobs(captureSource).capture;
  const gateStep = gate.steps.find((step) =>
    step.run.includes('ui-pr-screenshot-evidence.mjs check')
  );
  assert.ok(gateStep, 'check-screenshots no longer runs the evidence script');

  // SonarCloud S8264. Job-level permissions REPLACE the workflow-level block rather than merging
  // with it, so all three have to be restated; `actions: read` is what lets the gate list the
  // producer's workflow runs at all.
  assert.deepEqual(gate.permissions, {
    contents: 'read',
    'pull-requests': 'read',
    actions: 'read',
  });

  // SonarCloud S7630: a `${{ }}` inside `run:` is substituted before the shell parses the line.
  assert.ok(
    !/\$\{\{/.test(gateStep.run),
    'the gate step interpolates a workflow expression into its shell body; pass it through env: instead'
  );

  // EVERY shell variable reaching the CLI is double-quoted. An unquoted one that renders EMPTY
  // vanishes from the argument list entirely, so the flag before it swallows the flag after it and
  // argument parsing fails before the gate's first step runs — a red the `screenshots-exempt` label
  // cannot clear, because parsing precedes the label check. This is not hypothetical:
  // `$PR_HEAD_REPO` is empty whenever a contributor deletes their fork while the pull request is
  // open, since `github.event.pull_request.head.repo` is then null. The CLI's half of that contract
  // — an empty string is a VALUE, and the gate degrades on it — is case (p5) in
  // tests/screenshot-evidence-matching.test.js.
  const quotedFlagValues = gateStep.run.match(/--[a-z-]+ "\$[A-Za-z_]+"/g) ?? [];
  assert.ok(
    quotedFlagValues.length >= 5,
    `expected the gate step to pass several shell variables as flag values, found ${quotedFlagValues.length}`
  );
  assert.ok(
    quotedFlagValues.includes('--head-repository "$PR_HEAD_REPO"'),
    'the head repository must reach the CLI from env:, quoted'
  );
  assert.doesNotMatch(
    gateStep.run,
    /--[a-z-]+ \$[A-Za-z_]/,
    'an unquoted shell variable disappears from the argument list when it renders empty'
  );

  // The producer's own selection inputs, requested identically, so the two selections are the same
  // by construction rather than by coincidence. ONE paginated call feeds both the filename list and
  // the patch map — two calls could snapshot different heads.
  assert.match(gateStep.run, /patch: \(\.patch \/\/ ""\)/);
  assert.match(gateStep.run, /@json/);
  assert.match(gateStep.run, /--await-capture/);
  assert.match(gateStep.run, /--patches-file/);

  // The GATE's own `--head-sha`, which nothing pinned: the assertion below covers the producer's
  // publish step only, and the two are separate flags on separate jobs. It stopped being loud when
  // the matcher learned to read an absent head as "cannot judge head" rather than as "every frame is
  // stale" — the right degradation for `npm run screenshots:ui:check`, but it means deleting this
  // flag now disables the staleness rule SILENTLY and passes the previous head's frames on every UI
  // pull request. Case (p10) in tests/screenshot-evidence-matching.test.js pins the CLI half of that
  // composition; this is the half that says CI always supplies a head to judge against.
  assert.match(gateStep.run, /--head-sha "\$HEAD_SHA"/);
  assert.equal(gateStep.env.HEAD_SHA, '${{ github.event.pull_request.head.sha }}');

  // The capture deadline is READ from the producer, never restated.
  const declaredCaptureMinutes = Number(flagValue(gateStep.run, '--capture-timeout-minutes'));
  assert.equal(
    declaredCaptureMinutes,
    Number(capture['timeout-minutes']),
    "the gate's --capture-timeout-minutes must equal capture's real timeout-minutes"
  );
  assert.equal(flagValue(gateStep.run, '--capture-workflow'), 'pr-screenshots.yml');

  // The four bounds, read from the module rather than restated here.
  const captureTimeoutMs = declaredCaptureMinutes * MS_PER_MINUTE;
  const jobCeilingMs = Number(gate['timeout-minutes']) * MS_PER_MINUTE;
  assert.ok(
    GRACE_MS + captureTimeoutMs + SLACK_MS <= MAX_WAIT_MS,
    `grace (${GRACE_MS}) + capture (${captureTimeoutMs}) + slack (${SLACK_MS}) exceeds maxWait (${MAX_WAIT_MS}), so a capture that uses its whole budget is abandoned before it can finish`
  );
  assert.ok(
    MAX_WAIT_MS <= MAX_POLLS * POLL_INTERVAL_MS,
    `maxPolls * pollInterval (${MAX_POLLS * POLL_INTERVAL_MS}) is below maxWait (${MAX_WAIT_MS}), so every UI PR would red at that product with capture-did-not-conclude`
  );
  assert.ok(
    MAX_WAIT_MS < jobCeilingMs,
    `maxWait (${MAX_WAIT_MS}) is not below the job ceiling (${jobCeilingMs}), so GitHub kills the job before the script can say why it gave up`
  );

  // The fork-eligibility expression is compared SEMANTICALLY, over a truth table. A string
  // comparison would pass for `!=` written as `==` and vice versa, which are exactly the mutations
  // that matter; and the helper's `evaluate` throws on function calls by design, so this must be
  // an evaluation rather than a parse-and-diff.
  const eligibility = unwrap(gateStep.env.CAPTURE_ELIGIBLE);
  const captureIf = unwrap(capture.if);
  for (const sameRepo of [true, false]) {
    const context = forkContext(sameRepo);
    assert.equal(
      Boolean(evaluate(eligibility, context)),
      Boolean(evaluate(captureIf, context)),
      `the gate and the producer disagree about fork eligibility for sameRepo=${sameRepo}`
    );
  }
  // Non-vacuity: a constant expression would satisfy the equality above for free.
  assert.equal(evaluate(eligibility, forkContext(true)), true);
  assert.equal(evaluate(eligibility, forkContext(false)), false);

  // The producer's revision-addressed publish is what makes a frame identifiable at all; without
  // `--head-sha` every key is legacy and head matching degrades to today's behaviour.
  const publishStep = capture.steps.find((step) =>
    step.run.includes('ui-pr-screenshot-evidence.mjs publish')
  );
  assert.ok(publishStep, 'capture no longer publishes screenshot evidence');
  assert.match(publishStep.run, /--head-sha "\$HEAD_SHA"/);
  assert.equal(publishStep.env.HEAD_SHA, '${{ github.event.pull_request.head.sha }}');
});
