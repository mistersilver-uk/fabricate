import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
  parseActionSteps,
  parseJobs,
  scalars,
  section,
  unwrap,
  value,
} from './helpers/workflow-source.js';
import { createTempGitRepo, envWithoutGitLocation } from './helpers/temp-git-repo.js';
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

function contextFor(action, draft = false) {
  return {
    github: {
      event_name: 'pull_request',
      event: { action, pull_request: { number: 874, draft } },
      sha: 'abc1234',
    },
  };
}

function jobsFor(workflow, action, draft = false) {
  const context = contextFor(action, draft);
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

test('CI runs full gates for source events in either draft state and isolates metadata edits', () => {
  const workflow = parseWorkflow(readFileSync('.github/workflows/ci.yml', 'utf8'));
  const fullGateJobs = [
    'check-screenshots',
    'lint',
    'lint-commits',
    'lint-debt',
    'unit-tests',
    'validate-bindings',
  ];

  assert.deepEqual(workflow.types, ['opened', 'synchronize', 'reopened', 'edited']);
  assert.deepEqual(jobsFor(workflow, 'edited'), ['check-screenshots', 'lint-commits']);
  for (const action of ['opened', 'synchronize', 'reopened']) {
    for (const draft of [true, false]) {
      assert.deepEqual(
        jobsFor(workflow, action, draft),
        fullGateJobs,
        `${action} must run every full gate when draft=${draft}`
      );
    }
  }

  const edited = renderGroup(workflow.group, 'edited');
  const source = renderGroup(workflow.group, 'synchronize');
  assert.notEqual(edited, source);
  assert.match(edited, /metadata/);
  assert.match(source, /code/);
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
  /** The secrets a channel's tester feeds derive their paths from: one per tester group. */
  const secretsFor = (channel) =>
    resolveChannelConfig(config, channel).testers.map(({ group, testerSecretEnv }) => {
      // Asserted, not filtered: a `''` or absent name would drop out of `declared` and mute both
      // bindings below for the one group that needs them.
      assert.ok(
        typeof testerSecretEnv === 'string' && testerSecretEnv.trim() !== '',
        `tester group "${group}" on channel "${channel}" declares no testerSecretEnv, so its feed ` +
          'has no segment to derive a path from'
      );
      return testerSecretEnv;
    });

  const names = [...new Set([...Object.keys(config.channels ?? {}), config.channel].filter(Boolean))];
  const declared = [...new Set(names.flatMap(secretsFor))];
  return { declared, secretsFor };
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
  assert.ok(declared.length >= 3, 'the config declares fewer secrets than the tester groups that need one');

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
  const { declared, secretsFor } = shippedConfig();
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
  assert.ok(publishers.length >= 7, `found ${publishers.length} release-s3.js references`);
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
      : [...new Set(channels.flatMap(secretsFor))];
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
  assert.ok(bindings >= 10, `only ${bindings} publisher/secret bindings were asserted`);
});

// The mint gate and the deployment-configuration source (issues 1864, 1872).

/** Evaluate a real `if:`, neutralising `always()` exactly as forward-port-workflow.test.js does. */
function gateValue(raw, context) {
  return Boolean(evaluate(unwrap(raw).replaceAll('always()', "'x' == 'x'"), context));
}

/** The job's `outputs:` mapping, which `parseJobs` folds to an empty scalar. */
function jobOutputs(source, jobName) {
  const jobEntries = section(entries(source), 'jobs');
  return scalars(nestedEntries(nestedEntries(jobEntries, jobName), 'outputs'));
}

/** A `needs` context for a semantic-release publisher, given what the run minted. */
function mintedContext({ nextVersion, tag = '', verify = 'skipped' }) {
  return {
    inputs: { tag },
    github: { ref_name: 'release' },
    needs: {
      guard: { result: 'success' },
      'semantic-release': { outputs: { next_version: nextVersion, next_tag: nextVersion && `v${nextVersion}` } },
      'publish-s3': { result: verify },
      'verify-publish': { result: verify },
    },
  };
}

const SNAPSHOT_REDIRECT = /git tag --list\s*>\s*"([^"]+)"/;

test('a semantic-release publisher only publishes a version THIS run minted', () => {
  // semantic-release's addChannel phase fires `success` for an already-released version, so the
  // raw successCmd outputs cannot tell a mint from a re-add. The discriminator is the tag set
  // captured before the run; the job's outputs must come from the step that applies it.
  let assetPins = 0;

  for (const file of ['release.yml', 'beta.yml']) {
    const source = readFileSync(path.join(WORKFLOWS, file), 'utf8');
    const jobs = parseJobs(source);
    const steps = jobs['semantic-release'].steps;

    const snapshotIndex = steps.findIndex((step) => SNAPSHOT_REDIRECT.test(step.run));
    const semrelIndex = steps.findIndex((step) => step.id === 'semrel');
    const classifierIndex = steps.findIndex((step) => step.id === 'minted');
    assert.notEqual(snapshotIndex, -1, `${file} takes no pre-run tag snapshot`);
    assert.notEqual(semrelIndex, -1, `${file} has no semantic-release step`);
    assert.notEqual(classifierIndex, -1, `${file} has no mint classifier step`);

    // The snapshot is worthless taken after the run: semantic-release pushes a real release's tag
    // before its success lifecycle fires, so the tag exists by the time the classifier looks.
    assert.ok(
      snapshotIndex < semrelIndex && semrelIndex < classifierIndex,
      `${file} must snapshot the tags, THEN run semantic-release, THEN classify what it minted`
    );

    const outputs = jobOutputs(source, 'semantic-release');
    for (const name of ['next_version', 'next_tag']) {
      assert.equal(
        outputs[name],
        `\${{ steps.minted.outputs.${name} }}`,
        `${file}'s semantic-release job must publish ${name} from the classifier, not from semrel — ` +
          'the raw semrel output is populated by the addChannel phase too'
      );
    }

    const classifier = steps[classifierIndex];
    const snapshotFile = SNAPSHOT_REDIRECT.exec(steps[snapshotIndex].run)[1];
    assert.ok(
      classifier.run.includes(`grep -Fxq -- "$NEXT_TAG" "${snapshotFile}"`),
      `${file}'s classifier must compare the tag against ${snapshotFile} by EXACT LINE (grep -Fxq); ` +
        'a substring match would treat v1.9.60 as already present because v1.9.6 is'
    );
    // SonarCloud S7630: a `${{ }}` inside `run:` is substituted before the shell parses the line.
    assert.ok(
      !/\$\{\{/.test(classifier.run),
      `${file}'s classifier interpolates a workflow expression into its shell body; use env:`
    );
    assert.equal(classifier.env.NEXT_TAG, '${{ steps.semrel.outputs.next_tag }}');
    assert.equal(classifier.env.NEXT_VERSION, '${{ steps.semrel.outputs.next_version }}');
    // The no-mint case must say so, naming the phase that produced it; a silent skip reads as a
    // publish that simply did not log.
    assert.match(
      classifier.run,
      /::notice::\$NEXT_TAG existed before this run — semantic-release's addChannel phase/,
      `${file}'s classifier must name the addChannel re-add as the reason nothing is published`
    );

    // Where the publisher asserts its draft's assets, that assertion is about the minted draft.
    const assets = steps.find((step) => /gh release view/.test(step.run));
    if (assets) {
      assetPins += 1;
      assert.equal(assets.if, "${{ steps.minted.outputs.next_tag != '' }}");
      assert.equal(assets.env.RELEASE_TAG, '${{ steps.minted.outputs.next_tag }}');
    }

    // The real `if:` text, evaluated. A run that minted nothing publishes nothing and verifies
    // nothing — and release.yml's forward-port, which gates on verify-publish, does not fire.
    const nothing = mintedContext({ nextVersion: '' });
    assert.equal(gateValue(jobs['publish-s3'].if, nothing), false, `${file} publishes on a no-mint run`);
    assert.equal(gateValue(jobs['verify-publish'].if, nothing), false, `${file} verifies a publish that did not happen`);
    if (jobs['forward-port']) {
      assert.equal(gateValue(jobs['forward-port'].if, nothing), false, `${file} forward-ports on a no-mint run`);
    }

    // Non-vacuity: a gate that is false for everything would satisfy the three assertions above.
    const minted = mintedContext({ nextVersion: '1.9.7', verify: 'success' });
    assert.equal(gateValue(jobs['publish-s3'].if, minted), true, `${file} skips a genuinely minted version`);
    assert.equal(gateValue(jobs['verify-publish'].if, minted), true, `${file} skips verifying a real publish`);
    if (jobs['forward-port']) {
      assert.equal(gateValue(jobs['forward-port'].if, minted), true, `${file} skips the forward-port for a minted version`);
      // The workflow_dispatch(tag) re-entry is unaffected: it publishes the tag it was given.
      const reentry = mintedContext({ nextVersion: '', tag: 'v1.9.6', verify: 'success' });
      assert.equal(gateValue(jobs['publish-s3'].if, reentry), true, `${file}'s re-entry path no longer publishes`);
    }
  }

  // Non-vacuity: the draft-asset assertions live behind an `if`, so a renamed step would skip them.
  assert.ok(assetPins >= 1, 'no semantic-release job was found asserting its drafted release assets');
});

/** The env var a classifier step binds to one semantic-release output. */
function inputNameFor(step, output) {
  return Object.entries(step.env).find(([, expr]) => expr.includes(`outputs.${output}`))?.[0];
}

/** Run a classifier's own `run:` body against a synthetic pre-run tag snapshot. */
function runClassifier(step, { tag, version, snapshot }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'mint-classifier-'));
  try {
    writeFileSync(path.join(dir, 'pre-release-tags.txt'), snapshot);
    const outputFile = path.join(dir, 'github-output');
    writeFileSync(outputFile, '');
    const env = { PATH: process.env.PATH, RUNNER_TEMP: dir, GITHUB_OUTPUT: outputFile };
    env[inputNameFor(step, 'next_tag')] = tag;
    env[inputNameFor(step, 'next_version')] = version;
    const result = spawnSync('bash', ['-e'], { input: step.run, env, encoding: 'utf8' });
    return { ...result, outputs: readFileSync(outputFile, 'utf8') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("the classifier's shell body mints only a tag absent from the pre-run snapshot", () => {
  // The workflow-level assertions above read the gate; this one runs it. A tag already in the
  // snapshot is an addChannel re-add and populates no output, so nothing downstream publishes.
  for (const file of ['release.yml', 'beta.yml']) {
    const source = readFileSync(path.join(WORKFLOWS, file), 'utf8');
    const step = parseJobs(source)['semantic-release'].steps.find((one) => one.id === 'minted');
    const snapshot = 'v1.9.6\n';

    const readd = runClassifier(step, { tag: 'v1.9.6', version: '1.9.6', snapshot });
    assert.equal(readd.status, 0, `${file}'s classifier failed on a re-add: ${readd.stderr}`);
    assert.equal(readd.outputs, '', `${file} published v1.9.6 again after an addChannel re-add`);
    assert.match(readd.stdout, /::notice::v1\.9\.6 existed before this run/);

    const mint = runClassifier(step, { tag: 'v1.9.7', version: '1.9.7', snapshot });
    assert.equal(mint.status, 0, `${file}'s classifier failed on a mint: ${mint.stderr}`);
    assert.equal(mint.outputs, 'next_version=1.9.7\nnext_tag=v1.9.7\n', `${file} minted nothing`);

    // Exactness: v1.9.6 is a prefix of v1.9.60, and a substring match would swallow the mint.
    const longer = runClassifier(step, { tag: 'v1.9.60', version: '1.9.60', snapshot });
    assert.equal(longer.outputs, 'next_version=1.9.60\nnext_tag=v1.9.60\n', `${file} lost v1.9.60`);

    const nothing = runClassifier(step, { tag: '', version: '', snapshot });
    assert.equal(nothing.status, 0, `${file}'s classifier failed when semrel minted nothing`);
    assert.equal(nothing.outputs, '', `${file} published a version semantic-release never named`);
    assert.match(nothing.stdout, /::notice::semantic-release minted nothing/);
  }
});

/**
 * An invocation of the publisher — `node [./]scripts/release-s3.js` or one of its `npm run
 * release:s3` scripts — as distinct from a dry-run plan that echoes its command line.
 */
const INVOKES_RELEASE_S3 = /^\s*(?:node\s+(?:\.\/)?scripts\/release-s3\.js|npm\s+run\s+release:s3\b)/m;
/** The composite that checks a release tag out beside the workflow ref's own checkout. */
const RELEASE_SOURCE_ACTION = './.github/actions/release-source';
const RELEASE_SOURCE_ACTION_FILE = path.join(REPOSITORY_ROOT, '.github', 'actions', 'release-source', 'action.yml');
/** The tag each publishing workflow hands release-source: the tag it was called with, or its version's. */
const RELEASE_SOURCE_TAG = {
  'release-s3.yml': '${{ inputs.tag }}',
  'promote-to-public.yml': 'v${{ inputs.version }}',
};
/** A shell step that moves the checked-out tree to another commit. */
const MOVES_THE_TREE = /\bgit\s+(?:checkout|switch)\b/;

/** `{ id, output }` of a `${{ steps.<id>.outputs.<output> }}` expression, or null for anything else. */
function stepOutputReference(expression) {
  const reference = /^\$\{\{\s*steps\.([\w-]+)\.outputs\.(\w+)\s*\}\}$/.exec(expression ?? '');
  return reference ? { id: reference[1], output: reference[2] } : null;
}

/**
 * The step a publisher flag's value comes from: `--flag "$VAR"`, `VAR` bound in the step's env: to
 * `${{ steps.<id>.outputs.<output> }}`. Null when any link of that chain is missing.
 */
function flagSource(step, flag) {
  const variable = new RegExp(`${flag}\\s+"\\$([A-Z_]+)"`).exec(step.run)?.[1];
  return stepOutputReference(step.env[variable]);
}

test('the publisher-invocation matcher sees every spelling of a release-s3 run, and no echoed plan', () => {
  for (const run of [
    'node scripts/release-s3.js --version "$VERSION"',
    'node ./scripts/release-s3.js --version "$VERSION"',
    'npm run release:s3 -- --version "$VERSION"',
    'npm run release:s3:dry-run -- --version "$VERSION"',
  ]) {
    assert.match(run, INVOKES_RELEASE_S3);
  }
  assert.doesNotMatch('echo "Would publish (node scripts/release-s3.js --version 1.0.0)"', INVOKES_RELEASE_S3);
});

test('every job that builds a tag runs the workflow ref publisher over a release-source tree', () => {
  // The tag supplies the built bytes; the publisher tooling runs from the workflow ref (issue 1988).
  // A tag's own publisher cannot read a configuration shape introduced after it, so no job may move
  // its tree to the tag and run the publisher it finds there.
  const visited = [];

  for (const { file, source } of workflowSources()) {
    for (const [name, job] of Object.entries(parseJobs(source))) {
      const steps = job.steps ?? [];
      const builds = steps
        .map((step, index) => ({ step, index }))
        .filter(({ step }) => INVOKES_RELEASE_S3.test(step.run) && !step.run.includes('--backfill-provenance'));
      if (builds.length === 0) continue;

      const label = `${file} job "${name}"`;
      visited.push(label);

      for (const { step, index } of builds) {
        for (const [flag, output] of [['--source-root', 'path'], ['--source-sha', 'sha']]) {
          const origin = flagSource(step, flag);
          assert.ok(origin, `${label} step "${step.name}" does not pass ${flag} from a step output`);
          assert.equal(origin.output, output, `${label} passes ${flag} from outputs.${origin.output}`);
          const sourceIndex = steps.findIndex((candidate) => candidate.id === origin.id);
          assert.ok(
            sourceIndex !== -1 && sourceIndex < index,
            `${label} takes ${flag} from step "${origin.id}", which does not run before the publish`
          );
          assert.equal(
            steps[sourceIndex].uses,
            RELEASE_SOURCE_ACTION,
            `${label} takes ${flag} from a step that is not ${RELEASE_SOURCE_ACTION}`
          );
          // The tree built is the tag this workflow publishes, not whatever release-source is handed.
          assert.equal(
            steps[sourceIndex].with.tag,
            RELEASE_SOURCE_TAG[file],
            `${label} hands release-source the tag ${steps[sourceIndex].with.tag}`
          );
        }
      }

      for (const step of steps) {
        assert.ok(!MOVES_THE_TREE.test(step.run), `${label} step "${step.name}" moves its tree to another commit`);
        assert.ok(
          !(step.uses.startsWith('actions/checkout') && step.with.ref),
          `${label} checks out ref ${step.with.ref} instead of the workflow ref`
        );
      }
    }
  }

  // Non-vacuity: the walk must reach both shapes — the dedicated publisher and the promotion's
  // re-stage — or one of them could run a tag's publisher unobserved.
  assert.ok(visited.includes('release-s3.yml job "release-s3"'), `release-s3.yml was not visited (saw ${visited.join('; ') || 'nothing'})`);
  assert.ok(visited.includes('promote-to-public.yml job "publish"'), `the public re-stage was not visited (saw ${visited.join('; ') || 'nothing'})`);
});

test('the release-source action builds the tag in its own worktree with its full toolchain', () => {
  const source = readFileSync(RELEASE_SOURCE_ACTION_FILE, 'utf8');
  const steps = parseActionSteps(source);
  const outputs = Object.fromEntries(
    ['path', 'sha'].map((name) => [
      name,
      scalars(nestedEntries(section(entries(source), 'outputs'), name)).value,
    ])
  );

  const worktree = steps.find((step) => /\bgit worktree add --detach\b/.test(step.run));
  assert.ok(worktree, 'the tag is not checked out with `git worktree add --detach`');
  assert.equal(worktree.env.TAG, '${{ inputs.tag }}', 'the tag must reach the shell through env:');

  // The worktree is created at the tag it was given, and both outputs name that same worktree.
  const target = /git worktree add --detach "\$(\w+)" "\$TAG"/.exec(worktree.run)?.[1];
  assert.ok(target, 'the worktree is not created from "$TAG"');
  assert.match(worktree.run, new RegExp(`echo "path=\\$${target}" >> "\\$GITHUB_OUTPUT"`), 'path is not the worktree');
  assert.match(worktree.run, new RegExp(`sha=\\$\\(git -C "\\$${target}" rev-parse HEAD\\)`), 'sha is not the worktree HEAD');

  // Each output is written by the step it names, so a renamed id cannot leave it empty.
  for (const [name, expression] of Object.entries(outputs)) {
    const reference = stepOutputReference(expression);
    assert.ok(reference?.output === name, `output ${name} is ${expression}`);
    const writer = steps.find((step) => step.id === reference.id);
    assert.ok(writer, `output ${name} names step "${reference.id}", which does not exist`);
    assert.match(writer.run, new RegExp(`echo "${name}=[^\\n]*>> "\\$GITHUB_OUTPUT"`), `step "${writer.id}" never writes ${name}`);
  }
  assert.equal(outputs.path, '${{ steps.' + worktree.id + '.outputs.path }}');

  // The tag's build needs its dev dependencies (Vite), installed in the worktree, not the checkout.
  const install = steps.find((step) => /\bnpm ci\b/.test(step.run));
  assert.ok(install, 'the tag tree gets no dependency install');
  assert.equal(install['working-directory'], '${{ steps.' + worktree.id + '.outputs.path }}');
  assert.match(install.run, /npm ci --ignore-scripts/);
  assert.doesNotMatch(install.run, /--omit=dev|--production|NODE_ENV=production/);
  assert.ok(!('NODE_ENV' in install.env), 'NODE_ENV in the install env would drop dev dependencies');

  // SonarCloud S7630: a `${{ }}` inside `run:` is substituted before the shell parses the line.
  for (const step of steps) {
    assert.ok(!/\$\{\{/.test(step.run), `step "${step.name}" interpolates an expression into run:`);
  }
});

/** The `name=value` lines a step appended to `$GITHUB_OUTPUT`. */
function readStepOutputs(outputFile) {
  const lines = readFileSync(outputFile, 'utf8').split('\n').filter(Boolean);
  return Object.fromEntries(lines.map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
}

test("release-source's worktree step checks out the tag it is given, not the caller's HEAD", () => {
  // Only the worktree step runs, in bash as the runner runs it: the install step's `npm ci` would
  // need a registry, and the test above pins it to this step's `path` output.
  const step = parseActionSteps(readFileSync(RELEASE_SOURCE_ACTION_FILE, 'utf8')).find((one) => one.id === 'worktree');
  const repo = createTempGitRepo('release-source-repo-');
  const runnerTemp = mkdtempSync(path.join(tmpdir(), 'release-source-runner-'));
  try {
    const tagged = repo.commit('the release');
    repo.git('tag', '-a', 'v9.9.9', '-m', 'an annotated tag, whose object is not the commit');
    const head = repo.commit('after the release');
    assert.notEqual(repo.git('rev-parse', 'v9.9.9'), tagged, 'the fixture tag is not annotated');

    const outputFile = path.join(runnerTemp, 'github-output');
    writeFileSync(outputFile, '');
    const result = spawnSync('bash', ['-e'], {
      input: step.run,
      cwd: repo.dir,
      env: { ...envWithoutGitLocation(), RUNNER_TEMP: runnerTemp, GITHUB_OUTPUT: outputFile, TAG: 'v9.9.9' },
      encoding: 'utf8',
      timeout: 60000,
    });
    assert.equal(result.status, 0, `the worktree step failed: ${result.stderr}`);

    const outputs = readStepOutputs(outputFile);
    assert.equal(path.resolve(outputs.path), path.join(runnerTemp, 'release-source'));
    const checkedOut = repo.git('-C', outputs.path, 'rev-parse', 'HEAD');
    assert.equal(checkedOut, repo.git('rev-parse', 'v9.9.9^{commit}'), 'the worktree does not hold the tag');
    assert.notEqual(checkedOut, head, "the worktree holds the caller's HEAD");
    assert.equal(outputs.sha, tagged, 'sha is not the commit the tag names');
  } finally {
    repo.dispose();
    rmSync(runnerTemp, { recursive: true, force: true });
  }
});

/** A step that runs one of this repository's scripts, by path or by import. */
const RUNS_REPOSITORY_SCRIPTS = /\bnode\s+(?:\.\/)?scripts\/|\bfrom\s+'\.\/scripts\//;
/** A step that runs node at all: a script by path, or an inline `--input-type` program. */
const RUNS_NODE = /\bnode\s+(?:--|(?:\.\/)?scripts\/)/;

test('promote-to-early-access runs its scripts from the workflow ref and moves to release only to merge', () => {
  // The workflow text comes from the dispatch ref and names exports an older `release` could lack
  // (issue 1988), so the job checks out the workflow ref and only the merge step leaves it.
  const source = readFileSync(path.join(WORKFLOWS, 'promote-to-early-access.yml'), 'utf8');
  const { steps } = parseJobs(source).promote;

  const checkouts = steps.filter((step) => step.uses.startsWith('actions/checkout'));
  assert.equal(checkouts.length, 1, 'the promote job should check out exactly once');
  assert.ok(!checkouts[0].with.ref, `the promote job checks out ${checkouts[0].with.ref} instead of the workflow ref`);

  const lastNode = steps.findLastIndex((step) => RUNS_NODE.test(step.run));
  assert.ok(lastNode !== -1, 'the promote job runs no node step');
  for (const step of steps.slice(0, lastNode + 1)) {
    assert.ok(!MOVES_THE_TREE.test(step.run), `step "${step.name}" moves the tree before the last node step`);
  }

  const merge = steps.findIndex((step) => /\bgit checkout -B release\b/.test(step.run));
  assert.ok(merge !== -1, 'no step moves to release to merge');
  const readers = steps.flatMap((step, index) => (RUNS_REPOSITORY_SCRIPTS.test(step.run) ? [index] : []));
  assert.ok(readers.length >= 2, `only ${readers.length} step(s) run the repository's scripts`);
  for (const index of readers) {
    assert.ok(index < merge, `step "${steps[index].name}" runs the repository's scripts after the move to release`);
  }
});

test('every inline tester-segment resolution words its refusal through describeMissingTesterSecrets', () => {
  let resolutions = 0;
  for (const { file, source } of workflowSources()) {
    for (const [name, job] of Object.entries(parseJobs(source))) {
      for (const step of job.steps ?? []) {
        if (!/\bresolveTesterSegments\(/.test(step.run)) continue;
        resolutions += 1;
        assert.match(
          step.run,
          /\bdescribeMissingTesterSecrets\(missing\)/,
          `${file} job "${name}" step "${step.name}" words its own missing-secret refusal`
        );
      }
    }
  }
  assert.ok(resolutions >= 2, `only ${resolutions} inline tester-segment resolution(s) were found`);
});
