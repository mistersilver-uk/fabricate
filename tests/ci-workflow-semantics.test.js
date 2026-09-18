import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// The workflow-source walkers and the `if:` tokenizer/evaluator this file used to inline now live
// in tests/helpers/workflow-source.js, shared with tests/forward-port-workflow.test.js (issue
// #1001).
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
// The gate's bound defaults are READ, not restated (issue 1133).
import {
  GRACE_MS,
  MAX_POLLS,
  MAX_WAIT_MS,
  POLL_INTERVAL_MS,
  SLACK_MS,
} from '../scripts/lib/screenshotEvidenceMatching.js';
// The channel resolver the publishers themselves import, so a channel declared by the scalar
// back-compat shape is not invisible to this file's second reading of the same config.
import { resolveChannelConfig } from '../scripts/release-s3.js';

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

  // `node --test`'s TAP reporter emits ~119,000 lines, so every `not ok` on a red run sits past the
  // bounded tail the log APIs serve (issue 1654).
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

// The screenshot gate's sequencing contract (issue 1133).

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

  // EVERY shell variable reaching the CLI is double-quoted.
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
  // by construction rather than by coincidence.
  assert.match(gateStep.run, /patch: \(\.patch \/\/ ""\)/);
  assert.match(gateStep.run, /@json/);
  assert.match(gateStep.run, /--await-capture/);
  assert.match(gateStep.run, /--patches-file/);

  // The GATE's own `--head-sha`, which nothing pinned: the assertion below covers the producer's
  // publish step only, and the two are separate flags on separate jobs.
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

  // The fork-eligibility expression is compared SEMANTICALLY, over a truth table.
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

// The release config and the workflows that carry its secrets (issue #1761).

const REPOSITORY_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOWS = path.join(REPOSITORY_ROOT, '.github', 'workflows');
const RELEASE_S3_WORKFLOW = './.github/workflows/release-s3.yml';
const PATH_SECRET_NAME = /\bS3_[A-Z0-9_]*_PATH_SECRET\b/g;

/**
 * The shipped release config, read through the publisher's own resolver so a channel declared by
 * the scalar back-compat shape is not invisible to the assertions below.
 */
function shippedConfig() {
  const config = JSON.parse(
    readFileSync(path.join(REPOSITORY_ROOT, 'release.s3.config.json'), 'utf8')
  );
  /** The secret a channel's own feed derives its path from, or null when it has no tester group. */
  const secretFor = (channel) => {
    const { testerGroups, testerSecretEnv } = resolveChannelConfig(config, channel);
    if (testerGroups.length === 0) return null;
    // Asserted, not filtered: a `''` or absent name would drop out of `declared` and mute both
    // bindings below for the one channel that needs them.
    assert.ok(
      typeof testerSecretEnv === 'string' && testerSecretEnv.trim() !== '',
      `channel "${channel}" declares tester groups with no testerSecretEnv, so its feed has no ` +
        'segment to derive a path from'
    );
    return testerSecretEnv;
  };

  const names = [...new Set([...Object.keys(config.channels ?? {}), config.channel].filter(Boolean))];
  const declared = [];
  for (const secret of names.map(secretFor)) {
    if (secret && !declared.includes(secret)) declared.push(secret);
  }
  return { declared, secretFor };
}

/** Every workflow file, as `{ file, source }`. */
function workflowSources() {
  return readdirSync(WORKFLOWS)
    .filter((entry) => entry.endsWith('.yml') || entry.endsWith('.yaml'))
    .map((entry) => ({ file: entry, source: readFileSync(path.join(WORKFLOWS, entry), 'utf8') }));
}

/** The shell form: `--channel <name>`, tolerant of the trailing punctuation an `echo` adds. */
const shellChannels = (run) => [...run.matchAll(/--channel\s+["']?([$\w.-]+)/g)].map((m) => m[1]);

/** The inline-import forms: `resolveChannelConfig(config, …)` and a `deriveS3Layout` channel key. */
const inlineChannels = (run) => [
  ...[...run.matchAll(/resolveChannelConfig\(\s*[\w.]+\s*,\s*([^)]*)\)/g)].map((m) => m[1]),
  ...[...run.matchAll(/\bchannel:\s*([^,\n}]+)/g)].map((m) => m[1]),
];

/** Every channel a shell body pins itself to, and whether any reference resolves at run time. */
function pinnedChannels(run) {
  const source = String(run ?? '');
  const channels = new Set();
  let unresolved = false;
  const take = (raw, literal) => {
    const name = literal.exec(raw.trim())?.[1];
    if (name) channels.add(name);
    else unresolved = true;
  };
  for (const raw of shellChannels(source)) take(raw, /^([\w.-]+)$/);
  for (const raw of inlineChannels(source)) take(raw, /^["']([\w.-]+)["']$/);
  return { channels: [...channels], unresolved };
}

/**
 * Whether a shell body reaches `release-s3.js` at all — running it, or inline-importing the layout
 * helpers that derive the same tester manifest keys from the same secret.
 */
const referencesReleaseS3 = (run) => /scripts\/release-s3\.js/.test(String(run ?? ''));

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
  const { declared, secretFor } = shippedConfig();
  const publishers = [];
  const callers = [];
  let declaredByReusable = null;

  for (const { file, source } of workflowSources()) {
    const jobEntries = section(entries(source), 'jobs');
    if (file === 'release-s3.yml') {
      const on = section(entries(source), 'on');
      const call = nestedEntries(on, 'workflow_call');
      declaredByReusable = Object.keys(scalars(nestedEntries(call, 'secrets')));
    }
    for (const [name, job] of Object.entries(parseJobs(source))) {
      if (job.uses === RELEASE_S3_WORKFLOW) {
        // `job.secrets` holds nested keys, which `secrets: inherit` has none of, so it reads as an
        // empty map. Only the scalar form tells the two apart.
        const inherits = scalars(nestedEntries(jobEntries, name)).secrets === 'inherit';
        callers.push({ file, name, job, inherits });
      }
      for (const step of job.steps ?? []) {
        if (!referencesReleaseS3(step.run)) continue;
        publishers.push({ file, step, ...pinnedChannels(step.run) });
      }
    }
  }

  // Non-vacuity: every assertion below is a loop, and an empty one passes.
  assert.ok(publishers.length >= 6, `found ${publishers.length} release-s3.js references`);
  assert.ok(callers.length >= 2, `found ${callers.length} callers of ${RELEASE_S3_WORKFLOW}`);
  assert.ok(declaredByReusable, 'release-s3.yml declares no workflow_call secrets');

  for (const { file, name, inherits } of callers) {
    assert.ok(
      !inherits,
      `${file} job "${name}" passes "secrets: inherit" to release-s3.yml. Inherit would satisfy ` +
        'every binding below without naming a single cohort, so a publisher that lost its secret ' +
        'would read as correct here; name each tester-path secret explicitly instead'
    );
  }

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
  }

  // A step pinned to literal channels needs exactly those channels' secrets; one that resolves a
  // channel at run time could be publishing to any of them, so it needs every declared secret.
  let bindings = 0;
  for (const { file, step, channels, unresolved } of publishers) {
    const needed = unresolved
      ? declared
      : [...new Set(channels.map(secretFor).filter(Boolean))];
    for (const secret of needed) {
      bindings += 1;
      assert.ok(
        secret in step.env,
        `${file} step "${step.name}" reaches release-s3.js for ` +
          `${unresolved ? 'a channel resolved at run time' : channels.join(', ')} without ` +
          `${secret} in its env:`
      );
    }
  }
  // Non-vacuity: a reader that found no channel at all would excuse every step above.
  assert.ok(bindings >= 6, `only ${bindings} publisher/secret bindings were asserted`);
});
