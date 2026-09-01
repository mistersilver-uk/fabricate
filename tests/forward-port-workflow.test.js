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

/**
 * The content gate's shared shell (issue #1418).
 *
 * The gate is needed at the first pass AND inside the push retry, which re-performs the merge
 * against a freshly fetched `main` and is therefore a second merge no gate has seen. GitHub Actions
 * offers neither YAML anchors nor reuse of a step from inside another step's `run:`, so writing it
 * once means a script both bodies invoke — and the contract below is asserted against that script,
 * not against a copy of its text in either `run:` body.
 */
const GATE_SCRIPT = 'scripts/forward-port-content-gate.sh';

/** How the gate resolves the verifier it delegates its decision to. */
const VERIFIER_RESOLUTION = 'VERIFIER="${GATE_DIR}/forward-port-provenance.mjs"';

/** How the gate invokes it. Distinct from the resolution above, which also names the file. */
const VERIFIER_INVOCATION = 'node "$VERIFIER"';

/**
 * The four `--flag=` arguments the verifier's every decision depends on.
 *
 * `--repository=` and `--accepted-bases=` are the two the verifier refuses to default: without a
 * repository an association naming a DIFFERENT repository qualifies, and without an accepted-base
 * list nothing could ever qualify. Dropping either from the invocation is silent here otherwise —
 * the parameters are proven honoured by `tests/forward-port-provenance.test.js`, but nothing else
 * pins what production actually passes.
 */
const VERIFIER_FLAGS = ['--repository=', '--accepted-bases=', '--per-page=', '--max-commits='];

/** How both `run:` bodies invoke the shared gate. */
const GATE_INVOCATION = /bash scripts\/forward-port-content-gate\.sh/;

// The load-bearing tokens of the merge, tolerant of quoting and intervening whitespace. NOT a
// literal substring: the point is to find every implementation of the merge, however it is written.
// Deliberately does NOT require the `chore:` subject, so that a duplicate implementation written
// with any other message is still COUNTED by the single-implementation assertion.
const MERGE_TOKENS = /git\s+merge\s+--no-ff\s+['"]?origin\/release['"]?/;

// The full merge contract: the same tokens PLUS the non-releasing Conventional Commit subject. A
// releasing type here would make the beta.yml run this push triggers mint an unjustified bump off a
// commit that carries no file change at all.
const MERGE_IMPLEMENTATION = new RegExp(`${MERGE_TOKENS.source}\\s+-m\\s+["']?chore:`);

const INPUT_NAMES = [
  'enabled',
  'skip_reason',
  'dry_run',
  'reason',
  'expected_tag',
  'allow_content',
  'override_hint',
];

// The defaults each entry point must declare. `dry_run` diverges ON PURPOSE (see assertion 2).
const EXPECTED_DEFAULTS = {
  workflow_call: { enabled: 'true', dry_run: 'false', allow_content: 'false', expected_tag: '' },
  workflow_dispatch: { enabled: 'true', dry_run: 'true', allow_content: 'false', expected_tag: '' },
};

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

/**
 * The shared gate script's executable lines: comments and blank lines removed, each trimmed.
 *
 * Comments are stripped because this file's header documents the very environment variables and
 * commands the assertions below look for, and matching the prose would let the code drift behind
 * its own explanation — the failure mode every structural assertion in this file exists to avoid.
 *
 * @returns {string[]} The statements, in order.
 */
function gateScriptStatements() {
  return read(GATE_SCRIPT)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

/** The index of the first statement containing `token`, asserted to exist. */
function statementIndex(statements, token, description) {
  const index = statements.findIndex((statement) => statement.includes(token));
  assert.notEqual(index, -1, `${GATE_SCRIPT} has a statement that ${description}`);
  return index;
}

/**
 * The statements of the `if` block opened by the statement containing `token`, exclusive of its
 * opener and its matching `fi`.
 *
 * Nesting-aware, because the assertion it exists for — that a branch is REACHABLE ONLY from inside
 * another — is otherwise unwriteable as a text match. `if …; then` and `fi` are counted, so an inner
 * `if` inside the block does not close it early and moving a statement out of the block is caught.
 *
 * @param {string[]} statements The gate script's statements.
 * @param {string} token A substring of the opening `if`.
 * @param {string} description What that `if` guards, for the failure message.
 * @returns {string[]} The block's own statements.
 */
function ifBlockStatements(statements, token, description) {
  const opener = statementIndex(statements, token, description);
  assert.match(statements[opener], /^if .*; then$/, `'${statements[opener]}' opens an if block`);

  let depth = 1;
  const block = [];
  for (let index = opener + 1; index < statements.length; index += 1) {
    const statement = statements[index];
    if (/^if .*; then$/.test(statement)) depth += 1;
    if (statement === 'fi') {
      depth -= 1;
      if (depth === 0) return block;
    }
    block.push(statement);
  }
  throw new Error(`the if block opened by '${statements[opener]}' is never closed`);
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

/**
 * Evaluate a JOB-level `if:` that opens with `always()`.
 *
 * The shared evaluator implements no function calls and THROWS on one (see the helper's header), so
 * `always()` is substituted with a tautology, which models its meaning exactly: it disables the
 * implicit `success()` wrapping and contributes nothing else. Evaluating rather than
 * substring-matching is the whole point — `&&` -> `||` leaves every conjunct present in the string.
 */
function gateValue(raw, context) {
  return Boolean(evaluate(unwrap(raw).replaceAll('always()', "'x' == 'x'"), context));
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
    const inputs = nestedEntries(triggerOf(source, trigger), 'inputs');
    const declared = scalars(inputs);
    // Read the raw `default:` entry, NOT a `?? ''` fallback: an absent `default:` and a declared
    // `default: ""` both resolve to the empty string, so the two `expected_tag: ''` rows below
    // would pass against a file whose `default: ""` had been deleted — a row that cannot fail, in
    // a suite whose whole standard is that every assertion must.
    const defaultEntry = (name) => scalars(nestedEntries(inputs, name));
    const defaultOf = (name) => unquote(defaultEntry(name).default ?? '');

    for (const name of INPUT_NAMES) {
      assert.ok(Object.hasOwn(declared, name), `on.${trigger}.inputs declares '${name}'`);
    }

    // The DEFAULT VALUES are load-bearing, and each of these three flips silently:
    //   * `enabled: false` would make every automated forward-port a permanent, success-reporting
    //     no-op — the exact defect this change exists to remove, shipped inert and green.
    //   * `allow_content: true` would degrade the content gate to a warning on BOTH entry points,
    //     letting an unreviewed file change ride the one push that bypasses pull-request review.
    //   * the workflow_dispatch `dry_run: true` is what makes the hand-run recovery lever safe to
    //     point at `main`; flipped to false, a maintainer probing the workflow pushes for real. The
    //     workflow_call default is deliberately the opposite: a caller states its own intent.
    for (const [name, expected] of Object.entries(EXPECTED_DEFAULTS[trigger])) {
      assert.ok(
        Object.hasOwn(defaultEntry(name), 'default'),
        `on.${trigger}.inputs.${name} declares an explicit default:`
      );
      assert.equal(
        defaultOf(name),
        expected,
        `on.${trigger}.inputs.${name} defaults to ${expected}`
      );
    }
  }

  // A `uses:` job cannot carry timeout-minutes, so promote-to-public.yml job 2's 10-minute bound is
  // lost when it becomes a call and must be re-established here — otherwise the callee inherits the
  // 360-minute default while holding the never-cancelling concurrency group that gates pushes to
  // main, and one hung fetch parks that group for six hours.
  const job = jobOf(FORWARD_PORT, 'forward-port');
  assert.ok(job['timeout-minutes'], 'the forward-port job declares a job-level timeout-minutes');

  // BOUNDED, not merely present: `360` is exactly the value the comment above exists to exclude, so
  // a truthy check passes for the very setting it is supposed to catch.
  const timeout = Number(job['timeout-minutes']);
  assert.ok(
    Number.isFinite(timeout) && timeout > 0 && timeout <= 30,
    `the forward-port job's timeout-minutes must be a small bound, got ${job['timeout-minutes']}`
  );

  // The concurrency group gates pushes to `main` and must NEVER cancel: a cancelled forward-port is
  // abandoned mid-merge. It sits at JOB level (not workflow level) so it survives `workflow_call`.
  assert.equal(job.concurrency.group, 'forward-port-main');
  assert.equal(job.concurrency['cancel-in-progress'], 'false');
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

  // ...and EVALUATED, because the presence check above is a substring match and `&&` -> `||`
  // survives it intact — while turning this gate into "forward-port on a HOTFIX line, and after a
  // FAILED publish", which is exactly the ordering this design forbids.
  const ran = (refName, verifyPublish) =>
    gateValue(job.if, {
      github: { ref_name: refName },
      needs: { 'verify-publish': { result: verifyPublish } },
    });

  assert.equal(ran('release', 'success'), true, 'the forward-port runs after a VERIFIED publish');
  assert.equal(ran('1.4.x', 'success'), false, 'a hotfix line never forward-ports');
  assert.equal(ran('release', 'failure'), false, 'a FAILED publish never forward-ports');
  assert.equal(ran('release', 'skipped'), false, 'nothing minted means nothing to forward-port');

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

  // Reusable workflows inherit NO repository secret, so a deleted `secrets:` block here does not
  // fail at parse time — it fails at the callee's token mint, mid-promotion, on the one job the
  // promotion's own job 4 requires to have succeeded.
  assert.equal(job.secrets.RELEASE_BOT_KEY, '${{ secrets.RELEASE_BOT_KEY }}');

  // Deliberately UNGUARDED: the `guard` job has already established, against the real channel
  // heads, exactly what is being promoted. It must be present and EMPTY — a wrong-shaped value here
  // would make the tipguard mismatch forever, skipping the backstop while reporting success.
  assert.ok(Object.hasOwn(job.with, 'expected_tag'), 'job 2 passes an explicit expected_tag');
  assert.equal(unquote(job.with.expected_tag), '');

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
  assert.ok(
    !/^[|>]/.test(gate),
    "job 4's folded if: was read as an expression, not a block header"
  );
  for (const conjunct of [
    'always()',
    "needs.guard.result == 'success'",
    "needs.forward-port.result == 'success'",
    "needs.publish.result == 'success'",
  ]) {
    assert.ok(gate.includes(conjunct), `job 4's if: still requires \`${conjunct}\``);
  }

  // ...and EVALUATED. Job 4 performs the two IRREVERSIBLE steps — `gh release edit --draft=false`
  // and the registry POST. `&&` -> `||` keeps all four conjuncts in the string while making the
  // un-draft reachable after a failed guard, a failed forward-port, or a failed publish; no
  // substring check can tell the two apart.
  const upstream = ['guard', 'forward-port', 'publish'];
  const ran = (results) =>
    gateValue(gate, {
      needs: Object.fromEntries(upstream.map((name, index) => [name, { result: results[index] }])),
    });

  assert.equal(ran(['success', 'success', 'success']), true, 'job 4 runs when all three succeed');
  for (let index = 0; index < upstream.length; index += 1) {
    for (const result of ['failure', 'skipped', 'cancelled']) {
      const results = ['success', 'success', 'success'];
      results[index] = result;
      assert.equal(
        ran(results),
        false,
        `job 4 must NOT reach the un-draft when ${upstream[index]} is '${result}'`
      );
    }
  }
});

// ── 8 ───────────────────────────────────────────────────────────────────────────────────────────

test('exactly ONE workflow implements the release-into-main merge', () => {
  const implementers = readdirSync(WORKFLOW_DIR)
    .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
    .filter((file) => MERGE_TOKENS.test(read(`${WORKFLOW_DIR}/${file}`)));

  // Two is the regression this change exists to prevent (a second copy of the App-token push to
  // main, which is how the two entry points drifted apart in the first place). Zero would make
  // every other assertion here vacuous.
  assert.deepEqual(implementers, ['forward-port.yml']);
});

// ── 8b ──────────────────────────────────────────────────────────────────────────────────────────

test('EVERY merge in forward-port.yml carries the non-releasing `chore:` subject', () => {
  const source = read(FORWARD_PORT);
  const found = source.match(new RegExp(MERGE_TOKENS.source, 'g')) ?? [];
  const withSubject = source.match(new RegExp(MERGE_IMPLEMENTATION.source, 'g')) ?? [];

  // The merge is written TWICE — at the merge step and again in the push retry, which re-performs
  // it against the freshly fetched tip. Both copies must carry the subject or they drift.
  assert.ok(
    found.length >= 2,
    `expected the merge at the merge step AND in the push retry, found ${found.length}`
  );
  assert.equal(
    withSubject.length,
    found.length,
    'a releasing Conventional Commit type here would make the beta.yml run this push triggers mint ' +
      'an unjustified version bump off a commit that carries no file change at all'
  );
});

// ── 9 ───────────────────────────────────────────────────────────────────────────────────────────

test('the forward-port pushes as the App installation token, never as GITHUB_TOKEN', () => {
  const source = read(FORWARD_PORT);
  const steps = forwardPortSteps();

  // checkout stores its own credential as an `http.extraheader` in a TEMP config file, and an
  // Authorization header beats the credential in a remote URL — so a persisted credential silently
  // wins over the App token, and no later `git config --unset-all` can reach it. The usual "it
  // fails loudly at push time" reasoning is only half true: it holds while the ruleset rejects the
  // github-actions[bot] merge commit, but if the ruleset ever permits that push, the merge LANDS
  // and beta.yml never fires (a GITHUB_TOKEN push triggers no downstream workflow) — the run is
  // green, the merge is in, and no prerelease is minted above the released version. Which is the
  // defect, silently restored.
  const checkoutIndex = steps.findIndex((step) => step.uses.startsWith('actions/checkout@'));
  assert.notEqual(checkoutIndex, -1, 'forward-port.yml checks out main');
  assert.equal(steps[checkoutIndex].with['persist-credentials'], 'false');

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

test('the content gate DELEGATES to the shared script and fails the job on its refusal', () => {
  const steps = forwardPortSteps();
  const mergeIndex = stepIndex(steps, MERGE_IMPLEMENTATION, 'merges origin/release');
  const gate = steps[stepIndex(steps, GATE_INVOCATION, 'gates on content', mergeIndex + 1)];

  // The gate no longer ASKS a human to confirm authorship; it establishes provenance itself. The
  // decision therefore lives in one script both call sites invoke, and this asserts the wiring —
  // the script's own contract is asserted against the script, below.
  assert.match(gate.run, GATE_INVOCATION, 'the content gate invokes the shared gate script');

  // Printing the diff and continuing detects nothing: a commit landed straight on `release` would
  // turn this ruleset-bypassing push into an unreviewed code path onto the default branch. The
  // script's refusal must therefore END the job, not annotate it.
  assert.ok(/\bexit 1\b/.test(gate.run), 'the content gate exits non-zero');
  assert.match(
    gate.run,
    new RegExp(`${GATE_INVOCATION.source}[^\\n]*\\|\\|\\s*exit 1`),
    "a refusal from the shared gate must fail the step, not merely be printed after it"
  );

  // ALLOW_CONTENT and OVERRIDE_HINT reach the script through the step's environment, which is also
  // the only legitimate way for an `inputs.` value to reach a shell (githubactions:S7630).
  assert.equal(gate.env.ALLOW_CONTENT, '${{ inputs.allow_content }}');
  assert.equal(gate.env.OVERRIDE_HINT, '${{ inputs.override_hint }}');

  const script = read(GATE_SCRIPT);
  assert.match(script, /\$\{?ALLOW_CONTENT/, 'the shared gate reads the allow_content override');
  assert.match(script, /\$\{?OVERRIDE_HINT/, 'the refusal names the caller-composed remedy');
  assert.match(
    script,
    /reviewed pull request/,
    'the refusal says what could not be established, not only how to override it'
  );
});

// ── 11c ─────────────────────────────────────────────────────────────────────────────────────────

test('exactly ONE implementation of the content gate exists, invoked from both paths', () => {
  const steps = forwardPortSteps();
  const invocations = steps.filter((step) => GATE_INVOCATION.test(step.run));

  // Two: the first-pass gate and the push retry. A third would mean a path acquired its own copy;
  // one would mean a path lost the gate entirely, which is the silent direction.
  assert.equal(
    invocations.length,
    2,
    `expected the shared gate at the first-pass gate AND in the push retry, found ` +
      `${invocations.map((step) => step.name).join(', ') || 'none'}`
  );
  assert.ok(
    invocations.some((step) => /git push origin HEAD:main/.test(step.run)),
    'the push retry is one of the two call sites'
  );

  // No other workflow may reach for it: this gate is meaningful only after the forward-port's own
  // merge, and a second caller would be reading a HEAD it does not own.
  const callers = readdirSync(WORKFLOW_DIR)
    .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
    .filter((file) => read(`${WORKFLOW_DIR}/${file}`).includes(GATE_SCRIPT));
  assert.deepEqual(callers, ['forward-port.yml']);
});

// ── 11d ─────────────────────────────────────────────────────────────────────────────────────────

test('the gate verifies `origin/main..origin/release`, never `origin/main..HEAD`', () => {
  // Statements only: the script's own header explains why `origin/main..HEAD` is wrong, and reading
  // the raw file would match that explanation and pass while the code did the opposite.
  const body = gateScriptStatements().join('\n');

  assert.match(
    body,
    /RANGE="origin\/main\.\.origin\/release"/,
    'the range is origin/main..origin/release'
  );

  // LOAD-BEARING. By the time this runs, HEAD is the bot's own merge commit, which is by definition
  // associated with no pull request; verifying `origin/main..HEAD` would include it and guarantee a
  // refusal on every single forward-port that carries content — a gate that always says no.
  assert.ok(
    !/origin\/main\.\.HEAD/.test(body),
    "the verified range must not include the bot's own merge commit"
  );

  // The range is recomputed rather than captured, so the retry path — which re-merges against a
  // freshly fetched origin/main — verifies the range it will actually push.
  assert.ok(
    body.includes(`git log --format='%H %P%x09%an%x09%s' "$RANGE" >"$WORK/commits.txt"`),
    'the commit listing the verifier decides is written from the range'
  );
  assert.match(body, /git rev-list --count "\$RANGE"/, 'the range size is measured');
});

// ── 11e ─────────────────────────────────────────────────────────────────────────────────────────

test('"this merge introduced nothing" is decided by a RE-MERGE, never by a combined diff', () => {
  const statements = gateScriptStatements();
  const body = statements.join('\n');

  // THE FINDING THIS REPLACED. `git diff-tree --cc -r --no-commit-id --name-only <merge>` being
  // empty cannot express the question: `--name-only` follows the `-c` FILE selection ("files
  // modified from all parents") and `--cc`'s hunk compression only ever affects PATCH output, so it
  // never reaches the name list. A clean auto-merge in which one file took hunks from both sides
  // and a genuine EVIL merge of the same two parents print exactly the same thing. Measured against
  // this repository's own history, 5 of the last 38 merges reachable from origin/main have a
  // non-empty combined diff and every one of them invented nothing — two of them on CHANGELOG.md,
  // which is the release path itself. `tests/forward-port-content-gate.test.js` demonstrates the
  // indistinguishability against real constructed merges; this keeps the predicate from coming back.
  assert.ok(
    !/git diff-tree\s+--cc/.test(body),
    'the gate decides merge content from a combined diff again. It cannot: the command answers ' +
      '"which files took hunks from more than one parent", not "what did this merge invent".'
  );

  assert.match(
    body,
    /git merge-tree --write-tree "\$\{commit\}\^1" "\$\{commit\}\^2"/,
    'the two parents are re-merged'
  );
  assert.match(body, /git rev-parse "\$\{commit\}\^\{tree\}"/, "the merge's own tree is read");
  assert.match(
    body,
    /\[ "\$remerged_tree" = "\$actual_tree" \]/,
    'the verdict is tree IDENTITY between the re-merge and the recorded merge'
  );

  // Fails CLOSED on every shape the comparison cannot be made for, each named apart because each
  // means something different: a conflicting re-merge embeds a human resolution, and a parent count
  // other than two has no two-parent re-merge at all.
  for (const verdict of ['content-free', 'carries-content', 'remerge-conflicted', 'parent-count']) {
    assert.ok(body.includes(verdict), `the merge-content verdict '${verdict}' is emitted`);
  }
});

// ── 11e2 ────────────────────────────────────────────────────────────────────────────────────────

test('a git that cannot run the predicate REFUSES rather than falling back to the broken one', () => {
  const body = gateScriptStatements().join('\n');

  // `git merge-tree --write-tree` arrived in git 2.38. The only fallback available is the combined
  // diff above, which answers the wrong question — so an older git must be an explicit, loud
  // refusal. A silent fallback would restore the defect on the one push that bypasses review, on a
  // runner nobody was looking at.
  assert.match(body, /GIT_VERSION="\$\(git --version\)"/, "git's version is read");
  assert.match(
    body,
    /\[ "\$GIT_MAJOR" -eq 2 \] && \[ "\$GIT_MINOR" -lt 38 \]/,
    'the 2.38 floor is asserted explicitly'
  );

  // The version test must precede the first use, or it guards nothing. Anchored on the INVOCATION
  // and not on the bare command name: the refusal messages above name `git merge-tree --write-tree`
  // in prose, and an index taken over those would compare the check against its own explanation.
  const statements = gateScriptStatements();
  assert.ok(
    statementIndex(statements, 'GIT_MINOR" -lt 38', 'asserts the git floor') <
      statementIndex(
        statements,
        'git merge-tree --write-tree "${commit}^1"',
        'runs the re-merge'
      ),
    'the git version floor must be asserted before the predicate that needs it runs'
  );
});

// ── 11f ─────────────────────────────────────────────────────────────────────────────────────────

test('the gate refuses an unexpected range shape before it reads a single association', () => {
  const statements = gateScriptStatements();
  const capIndex = statementIndex(statements, 'MAX_COMMITS', 'bounds the range');
  const apiIndex = statementIndex(statements, 'gh api', 'reads pull-request associations');

  assert.match(
    statements.join('\n'),
    /\[ "\$RANGE_SIZE" -gt "\$MAX_COMMITS" \]/,
    'the range size is compared against the cap'
  );
  assert.ok(
    capIndex < apiIndex,
    'the cap must bound the API loop, not be checked after it has already run'
  );
});

// ── 11g ─────────────────────────────────────────────────────────────────────────────────────────

test("the verifier's EXIT STATUS decides the job, and cannot be swallowed", () => {
  const statements = gateScriptStatements();
  const index = statementIndex(statements, VERIFIER_INVOCATION, 'invokes the verifier');
  const invocation = statements[index];

  // Resolved from the script's OWN location, not from the caller's working directory: the workflow
  // runs it from the repository root and the executed integration test runs it from a throwaway
  // repository elsewhere, and a relative `node scripts/…` would silently find neither there.
  assert.ok(
    statements.includes(VERIFIER_RESOLUTION),
    `${GATE_SCRIPT} must resolve the verifier from its own directory: ${VERIFIER_RESOLUTION}`
  );

  // Every flag the decision depends on is PASSED, not merely accepted. Dropping `--accepted-bases=`
  // would silently fall back to the library default, and dropping `--repository=` would make the
  // verifier refuse everything for the wrong reason — neither is visible in any other assertion.
  for (const flag of VERIFIER_FLAGS) {
    assert.ok(invocation.includes(flag), `the verifier invocation passes ${flag}: ${invocation}`);
  }

  // The mutation this exists to kill is `… || true`, `… ; echo done`, or a backgrounded call: each
  // leaves the invocation visibly present while making its verdict unreadable, and the literal
  // `exit 1` elsewhere in the file survives every one of them.
  for (const swallow of ['||', ';', '&']) {
    assert.ok(
      !invocation.includes(swallow),
      `the verifier invocation carries '${swallow}', which discards its exit status: ${invocation}`
    );
  }

  // `set +e` around it is load-bearing: under `set -e` a refusal aborts the script before its
  // status can be read, and the override branch becomes unreachable.
  assert.equal(statements[index - 1], 'set +e', 'the refusal must not abort before it is read');
  assert.equal(
    statements[index + 1],
    'VERDICT=$?',
    "the verifier's exit status must be captured on the line immediately after the invocation"
  );

  const body = statements.join('\n');
  assert.match(body, /\[ "\$VERDICT" -eq 0 \]/, 'a zero verdict is what passes the gate');
  assert.match(body, /exit "\$VERDICT"/, "a refusal exits with the verifier's own status");
});

// ── 11h ─────────────────────────────────────────────────────────────────────────────────────────

test('the own-merge guard fails the job and is NOT overridable', () => {
  const script = read(GATE_SCRIPT);
  const start = script.indexOf('OWN_MERGE="$(');
  assert.notEqual(start, -1, `${GATE_SCRIPT} guards the forward-port's own merge commit`);
  const guard = script.slice(start, script.indexOf('\nesac\n', start));

  assert.match(
    guard,
    /OWN_MERGE="\$\(merge_content_status HEAD\)"/,
    'the guard runs the re-merge predicate against the merge the push actually lands'
  );

  // The ONLY accepting verdict, and the guard's polarity in one. Accepting any other token — or
  // inverting the case so `content-free` is the one that fails — turns the guard into one that
  // fires precisely when the merge is clean, which no other assertion here would notice.
  assert.match(guard, /^content-free\) ;;$/m, 'only `content-free` passes the guard');
  assert.match(guard, /"carries-content "\*\)/, 'an invented-content merge has its own branch');
  assert.match(guard, /\bexit 1\b/, 'the own-merge guard fails the job');

  // A single-parent HEAD is NOT a refusal. `git merge --no-ff` reports "Already up to date." and
  // creates no commit when the freshly fetched origin/main already contains origin/release, which
  // the retry path genuinely reaches — and this guard is non-overridable, so failing there would
  // fail a run, with no operator lever, for having had nothing to do.
  assert.match(
    guard,
    /"parent-count 0" \| "parent-count 1"\)/,
    'a run that created no merge must not be refused as one that invented everything'
  );
  const skipBranch = guard.slice(guard.indexOf('"parent-count 0"'));
  assert.ok(
    !/\bexit 1\b/.test(skipBranch.slice(0, skipBranch.indexOf(';;'))),
    'the no-merge-created branch must not fail the job'
  );

  // allow_content lets an operator vouch for content that exists somewhere to be reviewed. Content
  // invented by a conflict resolution exists nowhere else, so it has been reviewed nowhere and no
  // override applies to it.
  assert.ok(
    !/ALLOW_CONTENT/.test(guard),
    'the own-merge guard must not consult the allow_content override'
  );

  // It runs BEFORE the content fast path, so it sees every merge this workflow lands rather than
  // only the ones that happen to carry content.
  const statements = gateScriptStatements();
  assert.ok(
    statementIndex(statements, 'OWN_MERGE="$(', 'guards its own merge') <
      statementIndex(statements, 'CONTENT=$(', 'takes the content fast path'),
    'the own-merge guard must precede the fast path, or an empty diff would skip it'
  );
});

// ── 11h2 ────────────────────────────────────────────────────────────────────────────────────────

test('the content fast path fires on an EMPTY diff, not a non-empty one', () => {
  const statements = gateScriptStatements();
  const index = statementIndex(statements, 'CONTENT=$(', 'takes the content fast path');

  assert.equal(statements[index], 'CONTENT=$(git diff --stat origin/main)');

  // `-z`, not `-n`. The identical reasoning as the own-merge guard's polarity one section above,
  // one statement later — and the consequence is worse: inverted, the gate prints "this forward-port
  // carries no file changes onto main" and exits 0 WHILE THE MERGE CARRIES CONTENT, the verifier is
  // never invoked, and the unreviewed content rides the one push that bypasses review. Green,
  // silent, and exactly the failure this whole change exists to remove.
  assert.equal(
    statements[index + 1],
    'if [ -z "$CONTENT" ]; then',
    'the fast path must be taken when the diff is EMPTY'
  );
});

// ── 11h3 ────────────────────────────────────────────────────────────────────────────────────────

test('the gate PASSES the verification parameters production depends on, at their real defaults', () => {
  const statements = gateScriptStatements();

  // Each of these three is one string that defines the meaning of the whole gate, each defaulted in
  // the shell rather than in the verifier, and each invisible to every other assertion in this file.
  //
  //   * ACCEPTED_BASES is what "reviewed against the release line" MEANS. Widened to `release,main`
  //     the gate accepts the exact counter-example this issue is built on — pull request #1414,
  //     merged and reviewed, against `main`.
  //   * MAX_COMMITS is the safety bound on the range shape the design will decide at all.
  //   * PER_PAGE is what makes a possibly-truncated association page recognisable. GitHub caps
  //     `per_page` at 100, so a default above it can never be reached and the truncation guard can
  //     never fire — turning "this may be incomplete" into a confident refusal of a commit whose
  //     pull request is on page 2. Fail-closed-with-a-lie, which is worse than fail-closed.
  for (const declaration of [
    'ACCEPTED_BASES="${ACCEPTED_BASES:-release}"',
    'PER_PAGE="${PER_PAGE:-100}"',
    'MAX_COMMITS="${MAX_COMMITS:-200}"',
  ]) {
    assert.ok(statements.includes(declaration), `${GATE_SCRIPT} declares ${declaration}`);
  }

  // ...and PER_PAGE is refused rather than merely defaulted, because it can also arrive from the
  // environment. The bound is asserted at the parse site, before any read uses it.
  assert.match(
    statements.join('\n'),
    /\[ "\$PER_PAGE" -gt 100 \]/,
    'a PER_PAGE above what GitHub honours must be refused, not sent'
  );
  assert.ok(
    statementIndex(statements, '"$PER_PAGE" -gt 100', 'bounds the page size') <
      statementIndex(statements, 'gh api', 'reads pull-request associations'),
    'the page-size bound must be checked before the reads it describes'
  );
});

// ── 11h4 ────────────────────────────────────────────────────────────────────────────────────────

test('the allow_content override is reachable ONLY from a refusal, never from an unverifiable state', () => {
  const statements = gateScriptStatements();
  const refusal = ifBlockStatements(statements, '[ "$VERDICT" -eq 1 ]', 'branches on a refusal');

  // The override fires on a REFUSAL — a verdict in which the verifier established what the content
  // is and could not attribute it. Fired on ANY non-zero verdict it swallows the whole unverifiable
  // class: a rate-limited read, a 403 from the App installation missing `Pull requests: Read` (the
  // single most likely first-run failure of this feature), an unreadable evidence file, a
  // possibly-truncated page, an association naming another repository, a range above the cap, or
  // `node` missing altogether (127). Every one of those would be waved through identically to a
  // genuine refusal — an absence of evidence accepted as an absence of unreviewed content, which is
  // the one substitution this change exists to remove.
  const overrides = statements.filter((statement) => statement.includes('ALLOW_CONTENT'));
  assert.ok(overrides.length > 0, `${GATE_SCRIPT} implements the allow_content override at all`);
  for (const statement of overrides) {
    assert.ok(
      refusal.includes(statement),
      `'${statement}' consults allow_content from outside the verdict-1 branch, so the override ` +
        'would also fire for a state in which nothing was established'
    );
  }

  // And the HINT with it. Printing "re-run with allow_content: true" beneath a 403 is worse than
  // useless: it is the documented remedy for the wrong diagnosis, on the run most likely to hit it.
  const hints = statements.filter((statement) => statement.includes('OVERRIDE_HINT'));
  assert.ok(hints.length > 0, `${GATE_SCRIPT} names the caller-composed remedy at all`);
  for (const statement of hints) {
    assert.ok(
      refusal.includes(statement),
      `'${statement}' prints the override hint from outside the verdict-1 branch`
    );
  }
});

// ── 11h5 ────────────────────────────────────────────────────────────────────────────────────────

test('the decided set and the collected set are ONE list, not two git invocations', () => {
  const statements = gateScriptStatements();

  // `git log … >commits.txt` decides the range; the evidence loop must be driven by that same file.
  // Driven by a SECOND `git rev-list` over the same range they agree today, and their failure
  // directions are not symmetric: a commit in commits.txt with no evidence fails closed, but a
  // commit produced only by the second listing is never handed to the verifier and is silently
  // never decided at all — a fail-open the verifier cannot see, because it never learns the commit
  // existed.
  assert.match(
    statements.join('\n'),
    /done <"\$WORK\/commits\.txt"/,
    'the evidence loop reads the same commit listing the verifier is given'
  );
  assert.ok(
    !statements.some((statement) => statement.startsWith('done < <(')),
    'the evidence loop must not come from a second git invocation over the same range'
  );
});

// ── 11i ─────────────────────────────────────────────────────────────────────────────────────────

test('the association read authenticates as the App installation, on both paths', () => {
  const steps = forwardPortSteps();
  const script = read(GATE_SCRIPT);

  assert.match(
    script,
    /gh api "repos\/\$\{GITHUB_REPOSITORY\}\/commits\/\$\{SHA\}\/pulls/,
    'the gate reads each commit\'s associated pull requests from this repository'
  );

  // The job holds only `contents: read`, and a called workflow can never exceed its caller's grant,
  // so the read MUST use the App installation token minted in this job. Assertion 9 already forbids
  // the GITHUB_TOKEN expressions in the workflow; this pins the positive half at both call sites.
  for (const step of steps.filter((candidate) => GATE_INVOCATION.test(candidate.run))) {
    assert.equal(
      step.env.GH_TOKEN,
      '${{ steps.apptoken.outputs.token }}',
      `'${step.name}' must hand the shared gate the App installation token`
    );
  }
});

// ── 11j ─────────────────────────────────────────────────────────────────────────────────────────

test('Node is provisioned before the gate, gated like the rest of the chain, without an install', () => {
  const steps = forwardPortSteps();
  const setupIndex = steps.findIndex((step) => step.uses.startsWith('actions/setup-node@'));
  assert.notEqual(setupIndex, -1, 'forward-port.yml provisions Node for the verifier');

  const gateIndex = stepIndex(steps, GATE_INVOCATION, 'invokes the shared gate');
  assert.ok(setupIndex < gateIndex, 'Node must be available before the gate runs the verifier');

  // The verifier and its library are zero-dependency by design, so this job stays a git merge plus
  // one `node` invocation. An `npm ci` here would put the whole dependency tree — and its failure
  // modes — on the path that pushes to `main`.
  assert.ok(
    !steps.some((step) => /\bnpm ci\b/.test(step.run)),
    'the forward-port job must not install dependencies'
  );

  // A skipped step's outputs are the empty string, so both guards are re-tested here exactly as the
  // merge/gate/dry-run/push chain re-tests them.
  for (const output of ['steps.ancestry.outputs.already', 'steps.tipguard.outputs.mismatch']) {
    assert.ok(
      steps[setupIndex].if.includes(output),
      `${stepLabel(steps[setupIndex], setupIndex)} must re-test \`${output}\` in its own if:`
    );
  }
});

// ── 11b ─────────────────────────────────────────────────────────────────────────────────────────

test('the push retry RE-GATES on content and never re-fetches origin/release', () => {
  const steps = forwardPortSteps();
  const push = steps[stepIndex(steps, /git push origin HEAD:main/, 'pushes to main')];

  // The retry re-performs the merge against the freshly fetched tip (a bare re-push of the stale
  // merge commit fails identically and would make the "retry" a no-op), so the retry is a SECOND
  // merge that no gate has seen. "An advanced main can only make an empty diff more true" holds
  // only when `theirs` equals the merge base; an empty diff can also come from a three-way
  // RESOLUTION that landed on `ours`, and in that regime an advanced main can flip the resolution
  // and carry content onto the one code path that bypasses pull-request review.
  // Comment lines are stripped first: this step's own comments quote the merge and the fetch it is
  // reasoning about, and an index taken over the prose would not be an index into the code.
  const body = push.run
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');

  const remergeAt = body.indexOf('git merge --no-ff');
  assert.notEqual(remergeAt, -1, 'the push retry re-performs the merge against the fresh tip');
  const afterRemerge = body.slice(remergeAt);
  const rePushAt = afterRemerge.indexOf('git push origin HEAD:main');
  assert.notEqual(rePushAt, -1, 'the retry re-pushes after re-gating');
  const beforeRePush = afterRemerge.slice(0, rePushAt);

  // The WHOLE gate is re-run. The re-merge is a NEW merge commit, so the own-merge guard has to see
  // it; the range is recomputed against the freshly fetched origin/main, so the provenance
  // verification has to be redone against it; and re-running it through the same script is what
  // stops the two paths drifting apart, which is how they diverged before.
  assert.match(
    beforeRePush,
    GATE_INVOCATION,
    'the retry must re-run the full provenance gate, not only re-print the diff'
  );

  // Retained: a bare presence check on `exit 1` anywhere in the window.
  assert.match(
    beforeRePush,
    /\bexit 1\b/,
    'the retry content gate must FAIL the job, not print and push anyway'
  );

  // ...and ANCHORED to the gate, exactly as assertion 11 anchors the first pass. A decoy that
  // swallows the gate's status while leaving an unrelated `exit 1` nearby survives the presence
  // check above — and this is the path that runs when `main` moved mid-run: a second merge no gate
  // has otherwise seen, about to be pushed with the ruleset-bypass token.
  assert.match(
    beforeRePush,
    new RegExp(`${GATE_INVOCATION.source}[^\\n]*\\|\\|\\s*exit 1`),
    "a refusal from the retry's gate must fail the step, not merely be printed before the re-push"
  );

  // Freezing the `theirs` side to the ref the first gate validated is load-bearing: re-fetching
  // origin/release would import a tip nothing gated. Shell COMMENT lines are stripped first —
  // step 10's own comment quotes step 4's `git fetch origin main release --force --tags` precisely
  // to say "do not copy this here", and matching that would fail on correct code.
  const fetches = push.run
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .filter((line) => /\bgit fetch\b/.test(line));
  assert.ok(fetches.length > 0, 'the retry re-fetches the advanced main');
  for (const line of fetches) {
    assert.ok(
      !/\brelease\b/.test(line),
      `the retry must not re-fetch origin/release, got: ${line.trim()}`
    );
  }
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
  const gateIndex = stepIndex(steps, GATE_INVOCATION, 'is the content gate', mergeIndex + 1);
  const dryRunIndex = stepIndex(
    steps,
    /git log --oneline origin\/main\.\.HEAD/,
    'is the dry-run report',
    gateIndex + 1
  );
  const pushIndex = stepIndex(steps, /git push origin HEAD:main/, 'pushes to main');

  assert.ok(
    ancestryIndex < tipguardIndex &&
      tipguardIndex < mergeIndex &&
      mergeIndex < gateIndex &&
      gateIndex < dryRunIndex &&
      dryRunIndex < pushIndex,
    `expected ancestry < tipguard < merge < content gate < dry run < push, got ${ancestryIndex}, ` +
      `${tipguardIndex}, ${mergeIndex}, ${gateIndex}, ${dryRunIndex}, ${pushIndex}`
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

  for (const index of [mergeIndex, gateIndex, dryRunIndex, pushIndex]) {
    for (const output of [ancestryOutput, tipguardOutput]) {
      assert.ok(
        steps[index].if.includes(output),
        `${stepLabel(steps[index], index)} must re-test \`${output}\` in its own if:`
      );
    }
  }

  // ...but PRESENCE is not CONSUMPTION. `steps.ancestry.outputs.already` reads identically in
  // `!= 'true'` and in `== 'true'`, and the inverted form makes the merge run ONLY when the
  // forward-port has already happened and never when it is needed — the remedy ships inert, every
  // assertion green. `!= 'false'` inverts it the same way. So the guards' MEANING is evaluated as a
  // truth table, and the dry-run/push pair is pinned by `dry_run` polarity in both directions:
  // step 9 must run only on a dry run, step 10 only on a real one. (`!inputs.dry_run` ->
  // `inputs.dry_run` on step 10 makes a `dry_run: true` public promotion really push to `main`.)
  const context = (already, mismatch, dryRun) => ({
    inputs: { enabled: true, dry_run: dryRun },
    steps: { ancestry: { outputs: { already } }, tipguard: { outputs: { mismatch } } },
  });
  const ran = (index, ctx) => Boolean(evaluate(unwrap(steps[index].if), ctx));

  for (const dryRun of [true, false]) {
    for (const index of [mergeIndex, gateIndex]) {
      assert.equal(
        ran(index, context('false', 'false', dryRun)),
        true,
        `${stepLabel(steps[index], index)} must RUN when both guards are clear (dry_run: ${dryRun})`
      );
    }
  }
  assert.equal(
    ran(pushIndex, context('false', 'false', false)),
    true,
    'the push must RUN when both guards are clear and this is not a dry run'
  );
  assert.equal(
    ran(pushIndex, context('false', 'false', true)),
    false,
    'the push must NOT run on a dry run — this is the line that makes a dry run honest'
  );
  assert.equal(
    ran(dryRunIndex, context('false', 'false', true)),
    true,
    'the dry-run report must RUN when both guards are clear and this is a dry run'
  );
  assert.equal(
    ran(dryRunIndex, context('false', 'false', false)),
    false,
    'the dry-run report must NOT run on a real run'
  );

  // A blocked guard blocks EVERY consumer, under either dry_run value. `mismatch` is the empty
  // string in the `already=true` row because the tipguard step is itself skipped there.
  for (const [already, mismatch] of [
    ['true', ''],
    ['false', 'true'],
    ['true', 'true'],
  ]) {
    for (const dryRun of [true, false]) {
      for (const index of [mergeIndex, gateIndex, dryRunIndex, pushIndex]) {
        assert.equal(
          ran(index, context(already, mismatch, dryRun)),
          false,
          `${stepLabel(steps[index], index)} must NOT run ` +
            `(already=${already} mismatch=${mismatch} dry_run=${dryRun})`
        );
      }
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
