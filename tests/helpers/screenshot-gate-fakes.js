/**
 * Shared fakes for the `check-screenshots` gate suites (issue 1133).
 *
 * `decideScreenshotGate` injects exactly three collaborators — `runGh`, `sleep` and `now` — and its
 * two suites (`tests/screenshot-evidence-matching.test.js` and
 * `tests/ui-pr-screenshot-evidence.test.js`) both need all three plus a console capture. They live
 * here once rather than per test file: `sonar.cpd.exclusions` is inert under SonarCloud Automatic
 * Analysis while `tests/**` duplication counts against the new-code gate, so per-suite copies of
 * this fixture would fail the quality gate on otherwise correct code.
 *
 * This file is deliberately NOT collected by `npm test`: its glob lists the top-level
 * `tests/*.test.js` plus a fixed set of subdirectories, and `tests/helpers/` is not among them.
 *
 * The EVALUATION bundle is not faked anywhere. It is a cycle-avoidance seam, not a test double: the
 * suites pass the real `isExemptByLabel`, `validateChangedFilesForCheck`, `hasUiChanges` and
 * `explainScreenshotEvidenceFailure`, because stubbing them would make the delegated verdicts a test
 * asserting its own stubs.
 */

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** The managed screenshot block's delimiters, as `upsertScreenshotsBlock` writes them. */
export const BLOCK_START = '<!-- fabricate:screenshots:start -->';
export const BLOCK_END = '<!-- fabricate:screenshots:end -->';

/**
 * The head branch both suites use, and the one {@link workflowRun} reports by default.
 *
 * ONE constant rather than two, because they have to agree for the `head_branch` fallback in
 * `runBelongsToPullRequest` to be exercised at all: while the fixture's branch differed from the
 * suite's, every run matched on `pull_requests[].number` first and deleting that fallback outright
 * left the suite green.
 */
export const DEFAULT_HEAD_BRANCH = 'agent/1133-screenshot-gate';

/**
 * The `check` command's three (optionally four) file inputs, in a fresh temp directory.
 *
 * Shared rather than written per suite: both `tests/screenshot-evidence-matching.test.js` and
 * `tests/ui-pr-screenshot-evidence.test.js` drive the real `main(['check', …])`, which reads its
 * changed-file list, body, labels and patch map from disk — and `tests/**` duplication counts
 * against the SonarCloud new-code gate, so two copies of this would fail the gate on correct code.
 *
 * The caller owns `root` and must remove it; every one of these directories used to leak, one per
 * adapter case per run.
 *
 * @param {object} [inputs] The files to write.
 * @param {string} [inputs.prefix] The temp directory's name prefix.
 * @param {string[]} [inputs.changedFiles] The changed-file list.
 * @param {string} [inputs.body] The pull request body.
 * @param {string[]} [inputs.labels] The label list.
 * @param {Record<string, string>} [inputs.patches] Unified diffs by path, written as the JSONL
 *   `{filename, patch}` stream `gh api …/pulls/{n}/files --jq '… | @json'` emits.
 * @returns {{root: string, changedFiles: string, body: string, labels: string, patchesFile: string}}
 *   The directory and the absolute paths of the files in it.
 */
export function writeGateCliInputs({
  prefix = 'fabricate-screenshot-gate-',
  changedFiles = [],
  body = '',
  labels = [],
  patches = {},
} = {}) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const paths = {
    root,
    changedFiles: join(root, 'changed-files.txt'),
    body: join(root, 'pr-body.md'),
    labels: join(root, 'labels.txt'),
    patchesFile: join(root, 'changed-files.jsonl'),
  };
  writeFileSync(paths.changedFiles, changedFiles.join('\n'));
  writeFileSync(paths.body, body);
  writeFileSync(paths.labels, labels.join('\n'));
  writeFileSync(
    paths.patchesFile,
    Object.entries(patches)
      .map(([filename, patch]) => JSON.stringify({ filename, patch }))
      .join('\n')
  );
  return paths;
}

/**
 * Resolve a fixture that may be a value or a function of the fake's call state.
 *
 * @param {unknown} source The value or factory.
 * @param {object} state The fake's call counters.
 * @returns {unknown} The resolved value.
 */
function resolveFixture(source, state) {
  return typeof source === 'function' ? source(state) : source;
}

/**
 * Resolve a fixture that stands in for `gh` STDOUT, and refuse anything that is not text.
 *
 * `gh` answers bytes, so every one of these fixtures is a string; `String(resolved)` would instead
 * render a stray object as `'[object Object]'` and hand the gate a body that parses to no evidence
 * at all. The suite would then read a green `no-screenshots-section` verdict as the product's
 * answer when it is really the fixture's — so this refuses rather than coerces. `null` and
 * `undefined` still mean "the field is empty", which is what `gh --jq` prints for an absent field.
 *
 * @param {unknown} source The value or factory.
 * @param {object} state The fake's call counters.
 * @param {string} field The fixture's name, for the diagnostic.
 * @returns {string} The resolved text.
 * @throws {TypeError} when the fixture resolves to anything but a string.
 */
function resolveTextFixture(source, state, field) {
  const resolved = resolveFixture(source, state) ?? '';
  if (typeof resolved !== 'string') {
    throw new TypeError(
      `makeGhFake: the '${field}' fixture must resolve to a string, not ${typeof resolved}.`
    );
  }
  return resolved;
}

/**
 * A fake `gh` runner covering the three calls the gate makes: the workflow-runs list, the live body
 * read, and the live head read.
 *
 * `runs`, `body` and `headOid` may each be a value or a function of `{ runListCalls, bodyReads }`,
 * so a fixture can script a run that transitions and a body that gains its block only once the
 * right run has completed.
 *
 * @param {object} [fixture] The scripted responses.
 * @param {object[]|Function} [fixture.runs] The `workflow_runs` array per poll.
 * @param {string|Function} [fixture.body] The live body per read.
 * @param {string|Function} [fixture.headOid] The live head SHA.
 * @returns {{runGh: Function, calls: string[][], state: {runListCalls: number, bodyReads: number}}}
 *   The runner, its call log, and its counters.
 */
export function makeGhFake({ runs = [], body = '', headOid = '' } = {}) {
  const calls = [];
  const state = { runListCalls: 0, bodyReads: 0 };
  const ok = (stdout) => ({ status: 0, stdout, stderr: '' });

  const runGh = (args) => {
    calls.push([...args]);
    if (args[0] === 'api') {
      const workflowRuns = resolveFixture(runs, state) ?? [];
      state.runListCalls += 1;
      return ok(JSON.stringify({ total_count: workflowRuns.length, workflow_runs: workflowRuns }));
    }
    if (args.includes('headRefOid')) return ok(resolveTextFixture(headOid, state, 'headOid'));
    if (args.includes('body')) {
      const value = resolveTextFixture(body, state, 'body');
      state.bodyReads += 1;
      return ok(value);
    }
    return { status: 1, stdout: '', stderr: `unexpected gh call: ${args.join(' ')}` };
  };

  return { runGh, calls, state };
}

/**
 * A fake clock and sleep pair.
 *
 * `step` may be a number of milliseconds or a function of the sleep index, so a fixture can hold the
 * clock still (which is what proves the iteration cap terminates the loop) or advance it in
 * minute-scale jumps (which is what proves the deadline anchor tolerates a long runner queue).
 *
 * @param {object} [options] The clock's shape.
 * @param {number} [options.start] The starting instant.
 * @param {number|Function} [options.step] How far each sleep advances the clock.
 * @returns {{now: Function, sleep: Function, sleeps: number[], sleepCalls: number}} The pair.
 */
export function makeGateClock({ start = 0, step = 0 } = {}) {
  let current = start;
  const sleeps = [];
  return {
    now: () => current,
    sleep: async (ms) => {
      const advance = typeof step === 'function' ? step(sleeps.length) : step;
      sleeps.push(ms);
      current += advance;
    },
    sleeps,
    get sleepCalls() {
      return sleeps.length;
    },
  };
}

/**
 * The `check` command's argument vector: the four file/label flags every invocation carries, the
 * pull request number, then whatever the case is about.
 *
 * Shared with the same duplication argument as {@link writeGateCliInputs}, and it travels with it:
 * a flag renamed on one side and not the other is then one edit, not two files' worth.
 *
 * @param {{changedFiles: string, body: string, labels: string}} paths The written inputs.
 * @param {object} [options] The invocation's shape.
 * @param {string|number} [options.prNumber] The pull request number.
 * @param {string[]} [options.extra] The case's own flags, appended.
 * @returns {string[]} The argument vector.
 */
export function gateCheckArgv(paths, { prNumber = 1133, extra = [] } = {}) {
  return [
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
    String(prNumber),
    ...extra,
  ];
}

/**
 * Run `fn` with `console.log` and `console.error` captured.
 *
 * The error half is why this exists rather than reusing the `captureLog` already in
 * `tests/ui-pr-screenshot-evidence.test.js`: that one sets `console.error = () => {}`, which
 * discards exactly the `::error::<code>` lines these suites assert on.
 *
 * @param {Function} fn The body to run.
 * @returns {Promise<{log: string[], error: string[], warn: string[]}>} The captured lines.
 */
export async function captureConsole(fn) {
  const captured = { log: [], error: [], warn: [] };
  const real = { log: console.log, error: console.error, warn: console.warn };
  console.log = (...args) => captured.log.push(args.join(' '));
  console.error = (...args) => captured.error.push(args.join(' '));
  console.warn = (...args) => captured.warn.push(args.join(' '));
  try {
    await fn();
  } finally {
    console.log = real.log;
    console.error = real.error;
    console.warn = real.warn;
  }
  return captured;
}

/**
 * Run `fn` and answer the `process.exitCode` it set, restoring whatever was there before.
 *
 * `main`'s `check` branch signals failure by assigning `process.exitCode` rather than by throwing,
 * so without this one failing-path test would make the WHOLE test file exit 1 with every test
 * reported as passing.
 *
 * @param {Function} fn The body to run.
 * @returns {Promise<number>} The exit code `fn` left behind.
 */
export async function runPreservingExitCode(fn) {
  const previous = process.exitCode;
  process.exitCode = 0;
  try {
    await fn();
    return process.exitCode ?? 0;
  } finally {
    process.exitCode = previous;
  }
}

/**
 * A managed screenshot block, exactly as `upsertScreenshotsBlock` + `buildScreenshotMarkdown` emit
 * one: a `## Screenshots` heading and one `![pr-<n> <label>](<url>)` per frame.
 *
 * @param {object} frame The block's shape.
 * @param {string|number} frame.prNumber The pull request number.
 * @param {string[]} frame.caseIds The View Lab case ids published.
 * @param {string|null} [frame.headSha] The head SHA segment, or null for a legacy key.
 * @param {string} [frame.baseUrl] The public object base URL.
 * @param {string} [frame.prefix] The S3 screenshot prefix.
 * @returns {string} The block.
 */
export function managedScreenshotBlock({
  prNumber,
  caseIds,
  headSha = null,
  baseUrl = 'https://cdn.example.test',
  prefix = 'pr-screenshots',
}) {
  const scope = headSha ? `${prefix}/${prNumber}/${headSha}` : `${prefix}/${prNumber}`;
  const images = caseIds
    .map((id) => `![pr-${prNumber} ${id}](${baseUrl}/${scope}/${id}.png)`)
    .join('\n\n');
  return `${BLOCK_START}\n## Screenshots\n\n${images}\n${BLOCK_END}`;
}

/**
 * An epoch-relative ISO timestamp.
 *
 * The fake clock counts from 0, and the deadline anchor compares `Date.parse(run_started_at)`
 * against it — so a fixture whose timestamps sit in 2026 while its clock sits at 0 would make the
 * anchored deadline unreachable and quietly test only the wall-clock ceiling. Timestamps are
 * therefore written on the clock's own origin.
 *
 * @param {number} ms Milliseconds on the fake clock.
 * @returns {string} The ISO timestamp.
 */
export function atClock(ms) {
  return new Date(ms).toISOString();
}

/**
 * A workflow run as the runs LIST resource reports it.
 *
 * `prNumber: null` is the run the API reports with an EMPTY `pull_requests` array — a real and
 * undocumented answer from that endpoint, and the only shape under which `runBelongsToPullRequest`
 * consults `head_branch` and `head_repository` at all.
 *
 * @param {object} run The run's shape.
 * @returns {object} The run.
 */
export function workflowRun({
  id = 1,
  status = 'completed',
  conclusion = 'success',
  createdAt = atClock(0),
  runStartedAt = atClock(0),
  prNumber = 1133,
  headBranch = DEFAULT_HEAD_BRANCH,
  headRepository = 'misterpotts/fabricate',
  htmlUrl = 'https://github.test/run/1',
} = {}) {
  return {
    id,
    status,
    conclusion,
    created_at: createdAt,
    run_started_at: runStartedAt,
    html_url: htmlUrl,
    head_branch: headBranch,
    head_repository: { full_name: headRepository },
    pull_requests: prNumber === null ? [] : [{ number: prNumber }],
  };
}
