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
import { keyByAlignment, netOfSiteMarkers, siteText } from '../../tests/helpers/siteMarkers.js';

/** The marker family: `ratchet-exempt(lint): <reason>` at a finding's line excuses it. */
export const LINT_FAMILY = 'lint';

/**
 * Rules no base count excuses: `no-undef` is a runtime `ReferenceError`, and the cross-file import
 * rules report in a file the change did not touch, where no count is compared.
 */
export const ABSOLUTE_RULES = Object.freeze([
  'no-undef',
  'import-x/named',
  'import-x/no-unresolved',
  'import-x/namespace',
  'import-x/default',
  'import-x/export',
  'import-x/no-cycle',
]);

/** What the format gate asks Prettier's CLI, so it expands `.` exactly as `prettier --check .`. */
export const PRETTIER_GATE_ARGS = Object.freeze(['--list-different', '.']);

const PRETTIER_BIN = path.join(REPO_ROOT, 'node_modules/prettier/bin/prettier.cjs');
const CLI_BUFFER = 64 * 1024 * 1024;

const GLOB = /[*?[{]/u;
const posix = (file) => file.split(path.sep).join('/');
const ruleOf = (message) =>
  message.ruleId ?? (message.fatal ? 'parse-error' : 'unused-disable-directive');
const isAbsolute = (message) => message.fatal || ABSOLUTE_RULES.includes(message.ruleId);

function absoluteFailures(file, messages) {
  return messages
    .filter((message) => isAbsolute(message))
    .map((m) => `${file}:${m.line}:${m.column} ${ruleOf(m)} (fails at any count): ${m.message}`);
}

/** One side's counted findings, each keyed on its rule and its line's marker-free text. */
function findingsOf(file, text, messages) {
  const lines = text === undefined ? [] : text.split('\n');
  const marked = text?.includes('ratchet-exempt(') ?? false;
  return messages
    .filter((message) => !isAbsolute(message))
    .map((message) => {
      const rule = ruleOf(message);
      const marker = marked ? siteMarker(file, text, LINT_FAMILY, message.line) : null;
      const key = `${rule}\u{0}${siteText(lines[message.line - 1])}`;
      return { rule, line: message.line, key, marker };
    });
}

function linesByRule(findings) {
  const rules = new Map();
  for (const { rule, line } of findings) rules.set(rule, [...(rules.get(rule) ?? []), line]);
  return rules;
}

/**
 * One changed file's head findings against its base findings, each net of the reasoned markers
 * at their lines. A marker excuses a head finding only when it is new to base, so marking one
 * already there buys no room (`siteMarkers.js`); a rule regresses when its count rises.
 *
 * @returns {{failures: string[], exempted: string[], shrank: string[], regressed: string[]}}
 */
export function compareFileFindings({ file, text, baseText, headMessages, baseMessages }) {
  const keyed = keyByAlignment(
    baseText,
    text,
    findingsOf(file, baseText, baseMessages),
    findingsOf(file, text, headMessages)
  );
  const net = netOfSiteMarkers(keyed.base, keyed.head);
  const base = linesByRule(net.base);
  const head = linesByRule(net.head);
  const outcome = {
    failures: absoluteFailures(file, headMessages),
    exempted: net.fresh.map((f) => `${file}:${f.line} ${f.rule}: ${f.marker.reason}`),
    shrank: [],
    regressed: [],
  };
  for (const [rule, lines] of head) {
    const was = base.get(rule)?.length ?? 0;
    if (lines.length <= was) continue;
    outcome.regressed.push(rule);
    outcome.failures.push(
      `${file}: ${rule} rose from ${was} to ${lines.length} (line ${lines.join(', ')})`
    );
  }
  for (const [rule, lines] of base) {
    const now = head.get(rule)?.length ?? 0;
    if (now < lines.length)
      outcome.shrank.push(`${file}: ${rule} fell from ${lines.length} to ${now}`);
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

/** A changed file's base text and its findings there, linted as if at its head path. */
async function baseSideOf(eslint, scope, file, filePath, baseTexts) {
  const basePath = basePathOf(scope.changes, file);
  const text = basePath === null ? undefined : baseTexts.get(basePath);
  if (text === undefined) return { text, messages: [] };
  const [result] = await eslint.lintText(text, { filePath });
  return { text, messages: result?.messages ?? [] };
}

/**
 * The linter for base contents: the head config, running only the rules a changed file reports,
 * since no other rule's count is compared. ESLint reports no directive for a rule it filtered out,
 * so a changed file reporting an unused directive has its base linted with every rule.
 */
function baseLinter({ cwd, eslintOptions, results, changed }) {
  const rules = new Set();
  for (const result of results) {
    if (!changed.has(posix(path.relative(cwd, result.filePath)))) continue;
    for (const message of result.messages) rules.add(message.ruleId);
  }
  if (rules.has(null) || rules.has(undefined)) return new ESLint({ cwd, ...eslintOptions });
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
    const base =
      result.messages.length === 0
        ? { text: undefined, messages: [] }
        : await baseSideOf(eslint, scope, file, result.filePath, baseTexts);
    const outcome = compareFileFindings({
      file,
      text: readFileSync(result.filePath, 'utf8'),
      baseText: base.text,
      headMessages: result.messages,
      baseMessages: base.messages,
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
    const fixer = new ESLint({ cwd, ...eslintOptions, fix: (m) => rules.includes(ruleOf(m)) });
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
  const scope = comparisonScope(cwd, env, base);
  const eslint = new ESLint({ cwd, ...eslintOptions });
  // A path from a diff can name a file the change deleted or renamed away, and ESLint throws on
  // it. Drop those while another path or glob remains; only missing paths is a typo and throws.
  const existing = patterns.filter(
    (pattern) => GLOB.test(pattern) || existsSync(path.resolve(cwd, pattern))
  );
  const present = existing.length > 0 ? existing : patterns;
  let results = await eslint.lintFiles(present);
  if (results.length === 0) throw new Error(`ESLint linted no file for ${patterns.join(' ')}`);
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
  unformatted: listed,
} = {}) {
  const scope = comparisonScope(cwd, env, base);
  const unformatted = listed ?? listUnformatted({ cwd });
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

const passed = (outcome) => !outcome.skipped && outcome.failures.length === 0;

/** `scripts/lint.mjs`: lint `args` (paths, globs, `--fix`) against the base; the exit code. */
export async function runLintCli(
  args,
  { cwd = REPO_ROOT, env = process.env, log = console.log, error = console.error } = {}
) {
  const unknown = args.filter((arg) => arg.startsWith('-') && arg !== '--fix');
  if (unknown.length > 0) {
    error(`lint: unknown option ${unknown.join(' ')}; the only option is --fix`);
    return 2;
  }
  const patterns = args.filter((arg) => arg !== '--fix');
  const outcome = await lintAgainstBase({
    patterns: patterns.length > 0 ? patterns : ['.'],
    fix: args.includes('--fix'),
    cwd,
    env,
  });
  if (passed(outcome)) {
    log(
      `lint: ${outcome.linted} file(s) linted; ${outcome.findings} finding(s) in ${outcome.files} ` +
        'file(s) are held at their base counts.'
    );
  }
  return reportGate('lint', outcome, { log, error });
}

/** `scripts/format-check.mjs`: check, or with `--write` format, what regressed; the exit code. */
export async function runFormatCli(
  args,
  { cwd = REPO_ROOT, env = process.env, log = console.log, error = console.error } = {}
) {
  if (args.some((arg) => arg !== '--write')) {
    error(`format-check: unknown argument ${args.join(' ')}; the only option is --write`);
    return 2;
  }
  const outcome = await formatAgainstBase({ cwd, env });
  if (args.includes('--write') && outcome.offenders.length > 0) {
    listUnformatted({ cwd, args: ['--write', ...outcome.offenders] });
    log(`format: wrote ${outcome.offenders.join(', ')}`);
    return 0;
  }
  if (passed(outcome)) {
    log(`format:check: ${outcome.unformatted} unformatted file(s) are held as they were at base.`);
  }
  return reportGate('format:check', outcome, {
    guidance: 'Run `npm run format` to format exactly these files.',
    log,
    error,
  });
}
