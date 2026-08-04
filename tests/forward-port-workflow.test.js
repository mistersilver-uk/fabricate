/**
 * Source contract for the decoupled forward-port (issue #1001).
 *
 * The forward-port merges `release` back into `main` so the prerelease line's next version is
 * numbered above the stable version the release line just published. It is the one operation that
 * can unjam a prerelease line that has fallen below a published stable version, and it pushes to
 * `main` through a ruleset-bypass App token — the repository's highest-consequence automated write.
 *
 * Every assertion here is structural rather than textual wherever a textual match would pass for
 * code that is wrong in the exact way the assertion exists to catch: the `enabled` gate is
 * EVALUATED, the guard ordering is asserted by STEP INDEX, and the reusable-workflow seam is read by
 * walking into `on.workflow_call.secrets` rather than by grepping the file.
 *
 * Built on the shared tests/helpers/workflow-source.js primitives (no re-inlined parsing:
 * `sonar.cpd.exclusions` is inert under SonarCloud Automatic Analysis and `tests/**` duplication
 * counts against the gate).
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

import {
  entries,
  evaluate,
  nestedEntries,
  parseJobs,
  scalars,
  section,
  unwrap,
} from './helpers/workflow-source.js';

const WORKFLOW_DIR = '.github/workflows';
const FORWARD_PORT = `${WORKFLOW_DIR}/forward-port.yml`;
const RELEASE = `${WORKFLOW_DIR}/release.yml`;
const PROMOTE_TO_PUBLIC = `${WORKFLOW_DIR}/promote-to-public.yml`;

// The load-bearing tokens of the merge, tolerant of quoting and intervening whitespace. NOT a
// literal substring: the point is to find every implementation of the merge, however it is written.
const MERGE_IMPLEMENTATION = /git\s+merge\s+--no-ff\s+['"]?origin\/release['"]?/;

const INPUT_NAMES = [
  'enabled',
  'skip_reason',
  'dry_run',
  'reason',
  'expected_tag',
  'allow_content',
  'override_hint',
];

function read(file) {
  return readFileSync(file, 'utf8');
}

/** The named job of a workflow, asserted to exist. */
function jobOf(file, name) {
  const job = parseJobs(read(file))[name];
  assert.ok(job, `${file} declares a '${name}' job`);
  return job;
}

/** The `on.<trigger>` block of a workflow, asserted to exist. */
function triggerOf(source, name) {
  const on = section(entries(source), 'on');
  const block = nestedEntries(on, name);
  assert.ok(block.length > 0, `on.${name} is declared`);
  return block;
}

/** A `needs:` inline list parsed into names (`needs: [a, b]` and `needs: a` both). */
function needsOf(job) {
  const raw = job.needs.trim();
  const inner = raw.startsWith('[') ? raw.slice(1, -1) : raw;
  return inner
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
}

function unquote(text) {
  return text.replace(/^['"]|['"]$/g, '');
}

/** The forward-port job's ordered steps. */
function forwardPortSteps() {
  return jobOf(FORWARD_PORT, 'forward-port').steps;
}

/** The index of the first step whose SHELL BODY matches, asserted to exist. */
function stepIndex(steps, pattern, description, from = 0) {
  const index = steps.findIndex((step, position) => position >= from && pattern.test(step.run));
  assert.notEqual(index, -1, `forward-port.yml has a step whose body ${description}`);
  return index;
}

function stepLabel(step, index) {
  return `step ${index + 1} (${step.name || step.uses || '(unnamed)'})`;
}

// ── 1 ───────────────────────────────────────────────────────────────────────────────────────────

test('forward-port.yml is reusable AND dispatchable, and declares RELEASE_BOT_KEY as a workflow_call secret', () => {
  const source = read(FORWARD_PORT);

  assert.ok(triggerOf(source, 'workflow_call').length > 0, 'workflow_call is declared');
  assert.ok(triggerOf(source, 'workflow_dispatch').length > 0, 'workflow_dispatch is declared');

  // WALKED, never substring-matched: `RELEASE_BOT_KEY` also legitimately appears in the token-mint
  // step, so a bare substring check passes even when the declaration is deleted — and deleting it
  // breaks every caller, because a reusable workflow inherits no repository secret.
  const declared = scalars(nestedEntries(triggerOf(source, 'workflow_call'), 'secrets'));
  assert.ok(
    Object.hasOwn(declared, 'RELEASE_BOT_KEY'),
    'on.workflow_call.secrets declares RELEASE_BOT_KEY'
  );
});

// ── 2 ───────────────────────────────────────────────────────────────────────────────────────────

test('forward-port.yml declares every input on BOTH entry points, and bounds its job', () => {
  const source = read(FORWARD_PORT);

  for (const trigger of ['workflow_call', 'workflow_dispatch']) {
    const declared = scalars(nestedEntries(triggerOf(source, trigger), 'inputs'));
    for (const name of INPUT_NAMES) {
      assert.ok(Object.hasOwn(declared, name), `on.${trigger}.inputs declares '${name}'`);
    }
  }

  // A `uses:` job cannot carry timeout-minutes, so promote-to-public.yml job 2's 10-minute bound is
  // lost when it becomes a call and must be re-established here — otherwise the callee inherits the
  // 360-minute default while holding the never-cancelling concurrency group that gates pushes to
  // main, and one hung fetch parks that group for six hours.
  const job = jobOf(FORWARD_PORT, 'forward-port');
  assert.ok(job['timeout-minutes'], 'the forward-port job declares a job-level timeout-minutes');
});

// ── 3 ───────────────────────────────────────────────────────────────────────────────────────────

test('every step after the skip notice is gated by `enabled`, proven by EVALUATION', () => {
  const steps = forwardPortSteps();
  assert.ok(steps.length >= 10, 'the forward-port job carries the full step decomposition');

  // Evaluated under BOTH values of dry_run with a permissive `steps` stub, so only `enabled` is
  // isolated. An exact-string match on `if: ${{ inputs.enabled }}` would fail on CORRECT code
  // (steps 9 and 10 legitimately also read dry_run), and a substring match would PASS for
  // `${{ inputs.enabled || github.event_name == 'workflow_dispatch' }}`, which is not a gate at all.
  for (const dryRun of [true, false]) {
    const context = {
      inputs: { enabled: false, dry_run: dryRun },
      steps: {
        ancestry: { outputs: { already: '' } },
        tipguard: { outputs: { mismatch: '' } },
      },
    };

    assert.equal(
      Boolean(evaluate(unwrap(steps[0].if), context)),
      true,
      `the skip-notice step must RUN when enabled is false (dry_run: ${dryRun})`
    );

    for (let index = 1; index < steps.length; index += 1) {
      const step = steps[index];
      assert.ok(step.if, `${stepLabel(step, index)} declares an if:`);
      assert.equal(
        Boolean(evaluate(unwrap(step.if), context)),
        false,
        `${stepLabel(step, index)} must not run when enabled is false (dry_run: ${dryRun}) — ` +
          'without this gate a hotfix promotion silently merges release into main'
      );
    }
  }
});

// ── 4 ───────────────────────────────────────────────────────────────────────────────────────────

test('release.yml calls the reusable forward-port only after a VERIFIED publish, on the release line', () => {
  const job = jobOf(RELEASE, 'forward-port');

  assert.equal(job.uses, './.github/workflows/forward-port.yml');
  assert.ok(needsOf(job).includes('verify-publish'), 'the job needs verify-publish');

  // `always()` disables the implicit `success()` wrapping entirely (it is required because
  // semantic-release is SKIPPED on the workflow_dispatch(tag) re-entry path), so the
  // verify-publish conjunct is the ONLY thing preventing a forward-port after a failed publish.
  for (const conjunct of [
    'always()',
    "github.ref_name == 'release'",
    "needs.verify-publish.result == 'success'",
  ]) {
    assert.ok(job.if.includes(conjunct), `release.yml's forward-port if: contains \`${conjunct}\``);
  }

  assert.equal(job.secrets.RELEASE_BOT_KEY, '${{ secrets.RELEASE_BOT_KEY }}');
  assert.equal(unquote(job.with.dry_run), 'false');
});

// ── 5 ───────────────────────────────────────────────────────────────────────────────────────────

test('release.yml passes the tag it actually verified as expected_tag', () => {
  const expected = jobOf(RELEASE, 'forward-port').with.expected_tag ?? '';

  assert.notEqual(unquote(expected).trim(), '', 'release.yml passes a non-empty expected_tag');
  assert.ok(expected.includes('inputs.tag'), 'expected_tag covers the re-entry path');
  assert.ok(
    expected.includes('needs.semantic-release.outputs.next_tag'),
    'expected_tag covers the push path'
  );
});

// ── 6 ───────────────────────────────────────────────────────────────────────────────────────────

test('promote-to-public.yml job 2 delegates, never skips, and names a REACHABLE override remedy', () => {
  const job = jobOf(PROMOTE_TO_PUBLIC, 'forward-port');

  assert.equal(job.uses, './.github/workflows/forward-port.yml');

  // NO job-level `if:`. A *skipped* job leaves `result == 'skipped'`, and job 4's strict `if:`
  // requires `needs.forward-port.result == 'success'` — so a job-level `if:` here would break every
  // hotfix promotion. The hotfix no-op runs through the callee's `enabled` input instead.
  assert.equal(job.if, '', 'promote-to-public.yml job 2 carries no job-level if:');
  assert.equal(job.with.enabled, "${{ inputs.source_channel == 'early-access' }}");

  // The single most fragile line in this change: workflow_call's dry_run default is FALSE, so if
  // this line is ever dropped a promotion run with dry_run: true would really push to main.
  assert.equal(job.with.dry_run, '${{ inputs.dry_run }}');

  const hint = unquote(job.with.override_hint ?? '');
  assert.match(hint, /forward-port\.yml/, 'the override hint names the workflow to dispatch');
  assert.match(hint, /allow_content: true/, 'the override hint names the override input');
  assert.match(hint, /re-run this promotion/, 'the override hint names the follow-up step');
  // `allow_content` is settable only from forward-port.yml's dispatch path. A hint telling a
  // maintainer mid-promotion to "re-run with allow_content: true" would name an input that does not
  // exist on the workflow they are running — the same impossible-remedy defect this issue exists to
  // eliminate.
  for (const promotionInput of ['version', 'source_channel', 'dry_run']) {
    assert.ok(
      !new RegExp(`\\b${promotionInput}\\b`).test(hint),
      `the override hint must not name promote-to-public.yml's own '${promotionInput}' input`
    );
  }

  const dispatchInputs = scalars(
    nestedEntries(triggerOf(read(PROMOTE_TO_PUBLIC), 'workflow_dispatch'), 'inputs')
  );
  assert.ok(
    !Object.hasOwn(dispatchInputs, 'allow_content'),
    'promote-to-public.yml must not grow a content override of its own'
  );
});

// ── 7 ───────────────────────────────────────────────────────────────────────────────────────────

test('promote-to-public.yml still orders the forward-port before the publish and the un-draft', () => {
  const jobs = parseJobs(read(PROMOTE_TO_PUBLIC));

  assert.deepEqual(needsOf(jobs.publish), ['guard', 'forward-port']);

  // Job 4's `if:` is a FOLDED block spanning five lines; the single-line reader would return only
  // the block indicator for it, so this also proves the helper folds block scalars.
  const gate = jobs['readback-preflight-undraft-register'].if;
  assert.ok(!/^[|>]/.test(gate), "job 4's folded if: was read as an expression, not a block header");
  for (const conjunct of [
    'always()',
    "needs.guard.result == 'success'",
    "needs.forward-port.result == 'success'",
    "needs.publish.result == 'success'",
  ]) {
    assert.ok(gate.includes(conjunct), `job 4's if: still requires \`${conjunct}\``);
  }
});

// ── 8 ───────────────────────────────────────────────────────────────────────────────────────────

test('exactly ONE workflow implements the release-into-main merge', () => {
  const implementers = readdirSync(WORKFLOW_DIR)
    .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
    .filter((file) => MERGE_IMPLEMENTATION.test(read(`${WORKFLOW_DIR}/${file}`)));

  // Two is the regression this change exists to prevent (a second copy of the App-token push to
  // main, which is how the two entry points drifted apart in the first place). Zero would make
  // every other assertion here vacuous.
  assert.deepEqual(implementers, ['forward-port.yml']);
});

// ── 9 ───────────────────────────────────────────────────────────────────────────────────────────

test('the forward-port pushes as the App installation token, never as GITHUB_TOKEN', () => {
  const source = read(FORWARD_PORT);
  const steps = forwardPortSteps();

  const remoteIndex = stepIndex(
    steps,
    /git remote set-url origin ["']?https:\/\/x-access-token:\$\{GH_TOKEN\}@/,
    'points origin at the App-token remote URL'
  );
  assert.equal(steps[remoteIndex].env.GH_TOKEN, '${{ steps.apptoken.outputs.token }}');

  const pushIndex = stepIndex(steps, /git push origin HEAD:main/, 'pushes to main');
  assert.ok(remoteIndex < pushIndex, 'the App-token remote is set before the push');

  // The literal EXPRESSION syntax, not a bare `GITHUB_TOKEN` substring: this repository's workflow
  // comments routinely discuss GITHUB_TOKEN in prose (and forward-port.yml's own comments explain
  // exactly why it is not used). A GITHUB_TOKEN push is not the ruleset bypass actor and does not
  // trigger the downstream beta.yml run.
  assert.ok(
    !/\$\{\{\s*secrets\.GITHUB_TOKEN\s*\}\}/.test(source),
    'forward-port.yml never resolves ${{ secrets.GITHUB_TOKEN }}'
  );
  assert.ok(
    !/\$\{\{\s*github\.token\s*\}\}/.test(source),
    'forward-port.yml never resolves ${{ github.token }}'
  );
});

// ── 10 ──────────────────────────────────────────────────────────────────────────────────────────

test('no inputs or github context expression reaches a shell body (githubactions:S7630)', () => {
  for (const step of forwardPortSteps()) {
    for (const forbidden of ['${{ inputs.', '${{ github.']) {
      assert.ok(
        !step.run.includes(forbidden),
        `'${step.name || step.uses}' passes \`${forbidden}\` into its shell body; cross into the ` +
          'shell through env: instead'
      );
    }
  }

  // The same values ARE present in `env:`, which is the legitimate form — so this is a check on
  // shell bodies specifically, not a ban on the contexts.
  const steps = forwardPortSteps();
  assert.ok(
    steps.some((step) => step.env.REASON === '${{ inputs.reason }}'),
    'the merge subject still reaches the shell, through env:'
  );
});

// ── 11 ──────────────────────────────────────────────────────────────────────────────────────────

test('the content gate FAILS the job on a non-empty diff and names the caller-composed remedy', () => {
  const steps = forwardPortSteps();
  const mergeIndex = stepIndex(steps, MERGE_IMPLEMENTATION, 'merges origin/release');
  const gate = steps[stepIndex(steps, /git diff --stat origin\/main/, 'gates on content', mergeIndex + 1)];

  assert.ok(/\bALLOW_CONTENT\b/.test(gate.run), 'the content gate reads the allow_content override');
  assert.equal(gate.env.ALLOW_CONTENT, '${{ inputs.allow_content }}');

  // Printing the diff and continuing detects nothing: a stray direct commit on `release`, or a
  // future @semantic-release/git plugin, would turn this ruleset-bypassing push into an unreviewed
  // code path onto the default branch.
  assert.ok(/\bexit 1\b/.test(gate.run), 'the content gate exits non-zero');

  assert.ok(
    /\$\{?OVERRIDE_HINT\}?/.test(gate.run),
    'the failure message interpolates the caller-composed override hint'
  );
  assert.equal(gate.env.OVERRIDE_HINT, '${{ inputs.override_hint }}');
  assert.match(
    gate.run,
    /reviewed pull request/,
    'the failure message says what to CHECK, not only how to override'
  );
});

// ── 12 ──────────────────────────────────────────────────────────────────────────────────────────

test('both guards are present, ordered before the push, consumed, and never fail the job', () => {
  const steps = forwardPortSteps();

  // Asserted by STEP INDEX, never by substring position in the file.
  const ancestryIndex = stepIndex(
    steps,
    /git merge-base --is-ancestor origin\/release origin\/main/,
    'is the already-forward-ported no-op'
  );
  const tipguardIndex = stepIndex(steps, /git tag --points-at/, 'is the expected-tag guard');
  const mergeIndex = stepIndex(steps, MERGE_IMPLEMENTATION, 'merges origin/release');
  const gateIndex = stepIndex(
    steps,
    /git diff --stat origin\/main/,
    'is the content gate',
    mergeIndex + 1
  );
  const pushIndex = stepIndex(steps, /git push origin HEAD:main/, 'pushes to main');

  assert.ok(
    ancestryIndex < tipguardIndex &&
      tipguardIndex < mergeIndex &&
      mergeIndex < gateIndex &&
      gateIndex < pushIndex,
    `expected ancestry < tipguard < merge < content gate < push, got ${ancestryIndex}, ` +
      `${tipguardIndex}, ${mergeIndex}, ${gateIndex}, ${pushIndex}`
  );

  // The tipguard's condition is read from its `env:` and tested as a SHELL variable. Asserting a
  // literal `inputs.expected_tag` inside the body would contradict assertion 10.
  const tipguard = steps[tipguardIndex];
  assert.equal(tipguard.env.EXPECTED_TAG, '${{ inputs.expected_tag }}');
  assert.match(
    tipguard.run,
    /\[\s+-[zn]\s+"\$\{?EXPECTED_TAG/,
    'the tipguard only applies when expected_tag is non-empty'
  );

  // A guard that runs but is consumed by nothing is the way the remedy ships INERT. Each consumer
  // must re-test BOTH outputs: a skipped step's outputs are the empty string, so chaining off one
  // of them would leave the other unread.
  const ancestryOutput = `steps.${steps[ancestryIndex].id}.outputs.already`;
  const tipguardOutput = `steps.${tipguard.id}.outputs.mismatch`;
  const dryRunIndex = steps.findIndex((step) => /&&\s*inputs\.dry_run\b/.test(step.if));
  assert.notEqual(dryRunIndex, -1, 'forward-port.yml has a dry-run report step');

  for (const index of [mergeIndex, gateIndex, dryRunIndex, pushIndex]) {
    for (const output of [ancestryOutput, tipguardOutput]) {
      assert.ok(
        steps[index].if.includes(output),
        `${stepLabel(steps[index], index)} must re-test \`${output}\` in its own if:`
      );
    }
  }

  // Neither guard may fail the job: a guard that turns a legitimate no-op into a RED release run is
  // the failure mode the whole enabled/no-op design exists to avoid.
  for (const index of [ancestryIndex, tipguardIndex]) {
    assert.ok(
      !/\bexit 1\b/.test(steps[index].run),
      `${stepLabel(steps[index], index)} is a guard and must never exit non-zero`
    );
  }
});
