import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

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
  nestedEntries,
  parseJobs,
  scalars,
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
    'lint-debt',
    'unit-tests',
    'validate-bindings',
  ]);

  const edited = renderGroup(workflow.group, 'edited');
  const ready = renderGroup(workflow.group, 'ready_for_review');
  assert.notEqual(edited, ready);
  assert.match(edited, /metadata/);
  assert.match(ready, /code/);
});

test('a red unit-tests job re-prints its failing tests at the END of the job log', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');

  // `node --test`'s TAP reporter emits ~119,000 lines, so every `not ok` on a red run sits past
  // the bounded tail the log APIs serve. The end-of-job re-print is the only thing that makes a
  // red run readable, and a green run never exercises it (issue 1654).
  assert.match(
    workflow,
    /npm test 2>&1 \| tee "\$RUNNER_TEMP\/unit-tests\.tap"/,
    'the unit-tests run must tee its output, or the failure re-print below has nothing to read'
  );
  assert.match(
    workflow,
    /set -o pipefail/,
    'without pipefail the step takes tee\u2019s exit status and a failing suite reports GREEN'
  );
  assert.match(
    workflow,
    /- name: Report failing tests\n\s+if: failure\(\)/,
    'the failing-test re-print must exist and run only on failure'
  );
  assert.match(
    workflow,
    /grep -E '\^\[\[:space:\]\]\*not ok '/,
    'the re-print must match INDENTED not-ok lines too, since a subtest failure is indented'
  );

  // RUNNER_TEMP, not the workspace: several suites scan the repository tree, so a stray file
  // appearing there while the suite runs is a test input.
  assert.equal(
    /tee "?\$?\{?\{? ?runner\.temp|tee "\$RUNNER_TEMP/i.test(workflow),
    true,
    'the TAP must be written outside the checkout'
  );
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

// ────────────────────────────────────────────────────────────────────────────────────────────────
// The release config and the workflows that carry its secrets (issue #1761).
//
// `release.s3.config.json` names the environment variable each channel's tester segment arrives in,
// and the workflows forward a secret of that name. Nothing read the two against each other, so a
// half-done rename shipped green and failed at publish time — the one moment it cannot be retried
// safely, because a refused early-access publish leaves the channel head behind its tag.
// ────────────────────────────────────────────────────────────────────────────────────────────────

const REPOSITORY_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOWS = path.join(REPOSITORY_ROOT, '.github', 'workflows');
const RELEASE_S3_WORKFLOW = './.github/workflows/release-s3.yml';
const PATH_SECRET_NAME = /\bS3_[A-Z0-9_]*_PATH_SECRET\b/g;

/** The shipped release config, and the two derived facts every assertion below is written against. */
function shippedConfig() {
  const config = JSON.parse(
    readFileSync(path.join(REPOSITORY_ROOT, 'release.s3.config.json'), 'utf8')
  );
  const channels = Object.entries(config.channels);
  return {
    declared: [...new Set(channels.map(([, c]) => c.testerSecretEnv).filter(Boolean))],
    testerFree: new Set(
      channels.filter(([, c]) => (c.testerGroups ?? []).length === 0).map(([name]) => name)
    ),
  };
}

/** Every workflow file, as `{ file, source }`. */
function workflowSources() {
  return readdirSync(WORKFLOWS)
    .filter((entry) => entry.endsWith('.yml') || entry.endsWith('.yaml'))
    .map((entry) => ({ file: entry, source: readFileSync(path.join(WORKFLOWS, entry), 'utf8') }));
}

/**
 * The `--channel` argument of a `release-s3.js` invocation when it is a LITERAL, else null. A
 * workflow input (`"$CHANNEL"`) could be any channel, so only a literal can excuse a step from
 * forwarding a secret.
 */
function literalChannel(run) {
  const match = /--channel\s+["']?([$\w.-]+)/.exec(run);
  const raw = match?.[1] ?? '';
  return raw && !raw.includes('$') ? raw : null;
}

/**
 * Whether a shell body INVOKES `release-s3.js`, as opposed to naming it. `promote-to-public.yml`'s
 * dry run echoes the command it would have run, and a substring match reads that as a publish with
 * no secrets — a false failure whose obvious fix is to weaken the rule this test exists to state.
 */
const invokesReleaseS3 = (run) => /^\s*node\s+scripts\/release-s3\.js/m.test(run);

test('no workflow forwards a tester-path secret the release config does not declare', () => {
  const { declared } = shippedConfig();
  assert.ok(declared.length >= 2, 'the config declares fewer secrets than the channels that need one');

  const strays = [];
  for (const { file, source } of workflowSources()) {
    for (const name of source.match(PATH_SECRET_NAME) ?? []) {
      if (!declared.includes(name)) strays.push(`${file}: ${name}`);
    }
  }

  // Raw text, comments and `description:` included: a renamed secret whose explanatory comment
  // still names the old one is a half-done rename that reads as complete.
  assert.deepEqual(
    [...new Set(strays)].sort(),
    [],
    'these workflows name a tester-path secret release.s3.config.json does not declare, so the ' +
      'value they forward reaches no channel and the channel that needs one publishes to a ' +
      'guessable path — or refuses'
  );
});

test('every declared tester-path secret reaches release-s3.js through every workflow that runs it', () => {
  const { declared, testerFree } = shippedConfig();
  const publishers = [];
  const callers = [];
  let declaredByReusable = null;

  for (const { file, source } of workflowSources()) {
    if (file === 'release-s3.yml') {
      const on = section(entries(source), 'on');
      const call = nestedEntries(on, 'workflow_call');
      declaredByReusable = Object.keys(scalars(nestedEntries(call, 'secrets')));
    }
    for (const [name, job] of Object.entries(parseJobs(source))) {
      if (job.uses === RELEASE_S3_WORKFLOW) callers.push({ file, name, job });
      for (const step of job.steps ?? []) {
        if (!invokesReleaseS3(step.run)) continue;
        publishers.push({ file, step, channel: literalChannel(step.run) });
      }
    }
  }

  // Non-vacuity: every assertion below is a loop, and an empty one passes.
  assert.ok(publishers.length >= 2, `found ${publishers.length} release-s3.js invocations`);
  assert.ok(callers.length >= 2, `found ${callers.length} callers of ${RELEASE_S3_WORKFLOW}`);
  assert.ok(declaredByReusable, 'release-s3.yml declares no workflow_call secrets');

  for (const secret of declared) {
    assert.ok(
      declaredByReusable.includes(secret),
      `release-s3.yml does not declare ${secret} under workflow_call.secrets, so no caller can ` +
        'pass it and the channel that needs it refuses to publish'
    );
    for (const { file, name, job } of callers) {
      assert.ok(
        secret in job.secrets,
        `${file} job "${name}" calls release-s3.yml without passing ${secret}; a reusable ` +
          'workflow inherits no repository secret, so the segment arrives empty'
      );
    }
    for (const { file, step, channel } of publishers) {
      // A step pinned to a channel that declares no tester group needs no segment at all.
      if (channel && testerFree.has(channel)) continue;
      assert.ok(
        secret in step.env,
        `${file} step "${step.name}" runs release-s3.js for channel ${channel ?? '(an input)'} ` +
          `without ${secret} in its env:`
      );
    }
  }
});
