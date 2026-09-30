/**
 * The lint and format gates, compared with the base commit the merge-base ratchets use. A changed
 * file fails on a `(file, rule)` count above its base content's, linted with the same config;
 * `no-undef` and parse errors fail at any count. A file Prettier-clean at base, or new, stays clean.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { ESLint } from 'eslint';
// The Node build: under `--conditions=browser` the bare specifier resolves to the standalone
// bundle, which has no `resolveConfig`.
import * as prettier from 'prettier/index.mjs';

import {
  REPO_ROOT,
  basePathOf,
  changedPaths,
  parseMarkers,
  readBaseFiles,
  resolveRatchetBase,
  siteMarker,
} from '../../tests/helpers/mergeBaseRatchet.js';

/** The marker family: `ratchet-exempt(lint): <reason>` at a finding's line excuses it. */
export const LINT_FAMILY = 'lint';

/** Rules no base count excuses, because a report is a runtime `ReferenceError`. */
export const ABSOLUTE_RULES = Object.freeze(['no-undef']);

/** What the format gate asks Prettier's CLI, so it expands `.` exactly as `prettier --check .`. */
export const PRETTIER_GATE_ARGS = Object.freeze(['--list-different', '.']);

const PRETTIER_BIN = path.join(REPO_ROOT, 'node_modules/prettier/bin/prettier.cjs');
const CLI_BUFFER = 64 * 1024 * 1024;

const posix = (file) => file.split(path.sep).join('/');
const ruleOf = (message) =>
  message.ruleId ?? (message.fatal ? 'parse-error' : 'unused-disable-directive');
const isAbsolute = (message) => message.fatal || ABSOLUTE_RULES.includes(message.ruleId);

function absoluteFailures(file, messages) {
  return messages
    .filter((message) => isAbsolute(message))
    .map((m) => `${file}:${m.line}:${m.column} ${ruleOf(m)} (fails at any count): ${m.message}`);
}

/** Findings per rule, with those a reasoned marker at their line excuses set apart. */
function tallyRules(file, text, messages) {
  const rules = new Map();
  for (const message of messages) {
    if (isAbsolute(message)) continue;
    const rule = ruleOf(message);
    if (!rules.has(rule)) rules.set(rule, { count: 0, exempt: [], lines: [] });
    const entry = rules.get(rule);
    entry.count += 1;
    const marker = text === undefined ? null : siteMarker(file, text, LINT_FAMILY, message.line);
    if (marker) entry.exempt.push(`${file}:${message.line} ${rule}: ${marker.reason}`);
    else entry.lines.push(message.line);
  }
  return rules;
}

/**
 * One changed file's head findings against its base findings. A rule regresses when its count,
 * less the findings a reasoned marker excuses, is above the base count.
 *
 * @returns {{failures: string[], exempted: string[], shrank: string[], regressed: string[]}}
 */
export function compareFileFindings({ file, text, headMessages, baseMessages }) {
  const base = tallyRules(file, undefined, baseMessages);
  const head = tallyRules(file, text, headMessages);
  const failures = absoluteFailures(file, headMessages);
  const outcome = { failures, exempted: [], shrank: [], regressed: [] };
  for (const [rule, entry] of head) {
    const was = base.get(rule)?.count ?? 0;
    const counted = entry.count - entry.exempt.length;
    if (counted > was) {
      outcome.regressed.push(rule);
      const where = `line ${entry.lines.join(', ')}`;
      outcome.failures.push(`${file}: ${rule} rose from ${was} to ${counted} (${where})`);
    } else if (entry.count > was) {
      outcome.exempted.push(...entry.exempt);
    }
  }
  for (const [rule, entry] of base) {
    const now = head.get(rule)?.count ?? 0;
    if (now < entry.count)
      outcome.shrank.push(`${file}: ${rule} fell from ${entry.count} to ${now}`);
  }
  if (text !== undefined) outcome.failures.push(...emptyMarkers(file, text));
  return outcome;
}

function emptyMarkers(file, text) {
  return parseMarkers(file, text)
    .filter((marker) => marker.family === LINT_FAMILY && marker.reason === '')
    .map(
      (marker) =>
        `${file}:${marker.line} has a ratchet-exempt(lint) marker with no reason; write why the ` +
        'finding is legitimate after the colon'
    );
}

/** The resolved base and the working tree's changes against it, or the reason there are none. */
function comparisonScope(cwd, env, base) {
  const resolved = base ?? resolveRatchetBase({ cwd, env });
  if (resolved.skipped) return { skipped: resolved.skipped, reason: resolved.reason };
  return { base: resolved, changes: changedPaths(resolved, { cwd }) };
}

function emptyTally() {
  return { failures: [], exempted: [], shrank: [], regressed: new Map(), findings: 0, files: 0 };
}

async function baseMessagesFor(eslint, scope, file, filePath, baseTexts) {
  const basePath = basePathOf(scope.changes, file);
  const text = basePath === null ? undefined : baseTexts.get(basePath);
  if (text === undefined) return [];
  const [result] = await eslint.lintText(text, { filePath });
  return result?.messages ?? [];
}

/**
 * The linter for base contents: the head config, running only the rules a changed file reports,
 * since no other rule's count is compared. ESLint reports no directive for a rule it filtered out.
 */
function baseLinter({ cwd, eslintOptions, results, changed }) {
  const rules = new Set();
  for (const result of results) {
    if (!changed.has(posix(path.relative(cwd, result.filePath)))) continue;
    for (const message of result.messages) rules.add(message.ruleId);
  }
  return new ESLint({ cwd, ...eslintOptions, ruleFilter: ({ ruleId }) => rules.has(ruleId) });
}

/** Compare every linted file: absolute rules everywhere, counts in the files the change touched. */
async function compareResults({ eslintOptions, results, scope, cwd }) {
  const tally = emptyTally();
  const changed = new Set(scope.changes ? scope.changes.changed : []);
  const touched = results
    .map((result) => posix(path.relative(cwd, result.filePath)))
    .filter((file) => changed.has(file));
  const basePaths = touched
    .map((file) => basePathOf(scope.changes, file))
    .filter((file) => file !== null);
  const baseTexts = readBaseFiles(scope.base, basePaths, { cwd });
  const eslint = baseLinter({ cwd, eslintOptions, results, changed });
  for (const result of results) {
    const file = posix(path.relative(cwd, result.filePath));
    tally.findings += result.messages.length;
    if (result.messages.length > 0) tally.files += 1;
    if (!changed.has(file)) {
      tally.failures.push(...absoluteFailures(file, result.messages));
      continue;
    }
    const outcome = compareFileFindings({
      file,
      text: readFileSync(result.filePath, 'utf8'),
      headMessages: result.messages,
      baseMessages:
        result.messages.length === 0
          ? []
          : await baseMessagesFor(eslint, scope, file, result.filePath, baseTexts),
    });
    tally.failures.push(...outcome.failures);
    tally.exempted.push(...outcome.exempted);
    tally.shrank.push(...outcome.shrank);
    if (outcome.regressed.length > 0) tally.regressed.set(result.filePath, outcome.regressed);
  }
  return tally;
}

/** Apply ESLint's fixes for the regressed rules only, so a fix never rewrites untouched debt. */
async function fixRegressions({ cwd, eslintOptions, regressed, results }) {
  const byPath = new Map(results.map((result) => [result.filePath, result]));
  for (const [filePath, rules] of regressed) {
    const fixer = new ESLint({ cwd, ...eslintOptions, fix: (m) => rules.includes(m.ruleId) });
    const [fixed] = await fixer.lintFiles([filePath]);
    await ESLint.outputFixes([fixed]);
    byPath.set(filePath, fixed);
  }
  return [...byPath.values()];
}

/**
 * `npm run lint`: ESLint over `patterns` with the repository's own config, compared with the base.
 * `fix` applies ESLint's fixes to the rules that regressed, then compares again.
 *
 * @returns {Promise<{base: string|null, skipped?: string, reason?: string, failures: string[],
 *   exempted: string[], shrank: string[], findings: number, files: number, linted: number}>}
 */
export async function lintAgainstBase({
  patterns = ['.'],
  cwd = REPO_ROOT,
  env = process.env,
  eslintOptions = {},
  fix = false,
  base,
} = {}) {
  const eslint = new ESLint({ cwd, ...eslintOptions });
  // A path from a diff can name a file the change deleted or renamed away, and ESLint throws on
  // it. Drop those while another path remains; a list of only missing paths is a typo and throws.
  const existing = patterns.filter((pattern) => existsSync(path.resolve(cwd, pattern)));
  const present = existing.length > 0 ? existing : patterns;
  let results = await eslint.lintFiles(present);
  if (results.length === 0) throw new Error(`ESLint linted no file for ${patterns.join(' ')}`);
  const scope = comparisonScope(cwd, env, base);
  let tally = await compareResults({ eslintOptions, results, scope, cwd });
  if (fix && tally.regressed.size > 0) {
    results = await fixRegressions({ cwd, eslintOptions, regressed: tally.regressed, results });
    tally = await compareResults({ eslintOptions, results, scope, cwd });
  }
  const { regressed: _regressed, ...counts } = tally;
  return { ...counts, base: scope.base?.sha ?? null, ...skipOf(scope), linted: results.length };
}

function skipOf(scope) {
  return scope.skipped ? { skipped: scope.skipped, reason: scope.reason } : {};
}

/** The files Prettier's CLI lists as unformatted under `args`; an operational error throws. */
export function listUnformatted({ cwd = REPO_ROOT, args = PRETTIER_GATE_ARGS } = {}) {
  const result = spawnSync(process.execPath, [PRETTIER_BIN, ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: CLI_BUFFER,
  });
  if (result.status !== 0 && result.status !== 1) {
    const detail = result.error?.message ?? `${result.stdout}${result.stderr}`.trim();
    throw new Error(`prettier ${args.join(' ')} exited ${result.status}: ${detail}`);
  }
  return result.stdout
    .split('\n')
    .map((line) => posix(line.trim()))
    .filter((line) => line !== '');
}

async function isFormatted(text, filepath) {
  const options = await prettier.resolveConfig(filepath);
  return prettier.check(text, { ...options, filepath });
}

/**
 * `npm run format:check`: of the files Prettier lists as unformatted, those new or changed from a
 * base that was formatted fail; the rest are debt the change did not add.
 *
 * @returns {Promise<{base: string|null, skipped?: string, reason?: string, failures: string[],
 *   offenders: string[], unformatted: number}>}
 */
export async function formatAgainstBase({
  cwd = REPO_ROOT,
  env = process.env,
  base,
  unformatted = listUnformatted({ cwd }),
} = {}) {
  const scope = comparisonScope(cwd, env, base);
  const outcome = {
    base: scope.base?.sha ?? null,
    ...skipOf(scope),
    failures: [],
    offenders: [],
    unformatted: unformatted.length,
  };
  if (scope.skipped) return outcome;
  const changed = new Set(scope.changes.changed);
  const touched = unformatted.filter((file) => changed.has(file));
  const basePaths = touched.map((file) => basePathOf(scope.changes, file)).filter(Boolean);
  const baseTexts = readBaseFiles(scope.base, basePaths, { cwd });
  for (const file of touched) {
    const basePath = basePathOf(scope.changes, file);
    const text = basePath === null ? undefined : baseTexts.get(basePath);
    let failure = null;
    if (text === undefined) failure = `${file} is new and not Prettier-formatted`;
    else if (await isFormatted(text, path.join(cwd, file))) {
      failure = `${file} was Prettier-formatted at base and is not any more`;
    }
    if (failure) {
      outcome.failures.push(failure);
      outcome.offenders.push(file);
    }
  }
  return outcome;
}

const LINT_GUIDANCE =
  'Fix them. A lint finding that is legitimate can carry a `ratchet-exempt(lint): <reason>` ' +
  'comment on its line or the comment lines right above it; `no-undef` and parse errors cannot.';

/** Print a gate's outcome and return its exit code. */
export function reportGate(
  name,
  outcome,
  { guidance = LINT_GUIDANCE, log = console.log, error = console.error } = {}
) {
  if (outcome.skipped) log(`${name}: no base comparison (${outcome.skipped}): ${outcome.reason}`);
  for (const line of outcome.shrank ?? []) log(`shrank: ${line}`);
  for (const line of outcome.exempted ?? []) log(`exempt: ${line}`);
  if (outcome.failures.length === 0) {
    log(`${name}: no new violation against base ${outcome.base?.slice(0, 12) ?? '(none)'}.`);
    return 0;
  }
  error(
    `${name}: ${outcome.failures.length} new violation(s) against base ` +
      `${outcome.base?.slice(0, 12) ?? '(none)'}:\n  ${outcome.failures.join('\n  ')}\n\n` +
      `${guidance} If this names code you did not touch, origin/main may be stale: run ` +
      '`git fetch origin main`, or set RATCHET_BASE.'
  );
  return 1;
}
