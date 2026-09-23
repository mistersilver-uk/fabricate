/** Shared fakes for the `check-screenshots` gate suites (issue 1133). */

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** The managed screenshot block's delimiters, as `upsertScreenshotsBlock` writes them. */
export const BLOCK_START = '<!-- fabricate:screenshots:start -->';
export const BLOCK_END = '<!-- fabricate:screenshots:end -->';

/** The head branch both suites use, and the one {@link workflowRun} reports by default. */
export const DEFAULT_HEAD_BRANCH = 'agent/1133-screenshot-gate';

/**
 * The `check` command's three (optionally four) file inputs, in a fresh temp directory. The caller
 * owns `root` and must remove it; every one of these directories used to leak, one per adapter case
 * per run.
 *
 * @param {object} [inputs] The files to write.
 * @param {string} [inputs.prefix] The temp directory's name prefix.
 * @param {string[]} [inputs.changedFiles] The changed-file list.
 * @param {string} [inputs.body] The pull request body.
 * @param {string[]} [inputs.labels] The label list.
 * @param {Record<string, string>} [inputs.patches] Unified diffs by path, written as the JSONL
 * `{filename, patch}` stream `gh api …/pulls/{n}/files --jq '… | @json'` emits.
 * @returns {{root: string, changedFiles: string, body: string, labels: string, patchesFile:
 * string}} The directory and the absolute paths of the files in it.
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
 * @param {object} [fixture] The scripted responses.
 * @param {object[]|Function} [fixture.runs] The `workflow_runs` array per poll.
 * @param {string|Function} [fixture.body] The live body per read.
 * @param {string|Function} [fixture.headOid] The live head SHA.
 * @returns {{runGh: Function, calls: string[][], state: {runListCalls: number, bodyReads: number}}}
 * The runner, its call log, and its counters.
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
