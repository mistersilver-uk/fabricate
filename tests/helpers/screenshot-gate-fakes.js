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

/** The managed screenshot block's delimiters, as `upsertScreenshotsBlock` writes them. */
export const BLOCK_START = '<!-- fabricate:screenshots:start -->';
export const BLOCK_END = '<!-- fabricate:screenshots:end -->';

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
    if (args.includes('headRefOid')) return ok(String(resolveFixture(headOid, state) ?? ''));
    if (args.includes('body')) {
      const value = resolveFixture(body, state) ?? '';
      state.bodyReads += 1;
      return ok(String(value));
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
  headBranch = 'agent/1133',
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
    pull_requests: [{ number: prNumber }],
  };
}
