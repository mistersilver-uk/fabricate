/**
 * WHAT STILL POLICES `scripts/` NOW THAT THE GATE IS A GLOB.
 *
 * `npm run lint` and `npm run format:check` used to enumerate the `scripts/` files they covered
 * one by one, and this file existed to compare that list against what was on disk: issue #933 was
 * filed because adding a script was not enough to get it linted, someone had to remember the list
 * too, and the miss was announced by SonarCloud after push rather than by any local gate.
 *
 * Issue #1660 removed the list. Both scripts are globs, so a new `scripts/` file is linted the
 * moment it lands and the omission this file was written to catch cannot happen any more. What it
 * keeps are the three checks the glob does NOT subsume:
 *
 * 1. NOTHING UNDER `scripts/` IS IGNORED. The inversion moves the hiding place rather than
 *    removing it: a file goes unlinted now by being excluded, not by being left off a list, and an
 *    exclusion is exactly as silent. `eslint.debt.js` is the sanctioned way to carry a not-yet-
 *    clean file, and it disables only the rules that file fails — an `ignores` entry would take it
 *    out of ESLint's reach entirely. So `isPathIgnored` is asked about every enumerated file.
 *
 * 2. THE `LINTED_EXTENSIONS` MIRROR. `eslint.config.js` block 6 gives `scripts/**` its Node
 *    globals through a `files: ['scripts/**\/*.{js,mjs,cjs}']` glob. An extension that glob names
 *    and this enumeration does not is a file invisible to every check here; an extension this
 *    names and the glob does not is a file linted without `require` or `process` declared. The
 *    two lists are held equal by reading the glob back out of the config.
 *
 * 3. THE SHELL RATCHET, which has nothing to do with either gate. `.sh` is parsed by no linter and
 *    formatted by no formatter in this repository, and the measurement is in `SHELL_SCRIPTS`
 *    below: a syntax error introduced into `forward-port-content-gate.sh` gave `bash -n` exit 2
 *    while `lint`, `format:check`, `lint:md` and both forward-port suites passed.
 *
 * WHERE THE REST OF THE RATCHET WENT. The `scripts/` debt is `ESLINT_DEBT.scripts` now, one of
 * five groups in `eslint.debt.js`. Its exact count is pinned by `DEBT_COUNTS.scripts` in
 * `tests/lint-coverage.test.js` — still pinned EXACTLY rather than capped, because a `<=` ceiling
 * loosens by one slot every time debt is paid down. Staleness ("this entry reports nothing any
 * more") is `npm run lint:debt`, a step of the `lint` CI job, because answering it means linting
 * the largest files in the tree and twenty-three CPU-bound seconds do not belong in the unit-test
 * job.
 *
 * WHY PATHS ARE NORMALISED TO POSIX. `readdirSync(…, { recursive: true })` yields `lib\zip.js` on
 * a Windows dev machine and `lib/zip.js` on the `ubuntu-latest` runner, while `eslint.debt.js`
 * stores forward slashes on both. Enumerated paths are normalised before any comparison.
 *
 * NON-VACUITY. A guard that stops looking at anything must not keep reporting success, so the
 * inputs are asserted alive: the enumeration is non-empty AND still reaches at least one file in a
 * SUBDIRECTORY (which a `readdirSync` that lost `{ recursive: true }` would not), and the baseline
 * is non-empty. The subdirectory check is structural rather than a named file on purpose —
 * pinning one path would turn that file's deletion into a false report of broken recursion, whose
 * obvious "fix" is to repoint the constant at a top-level script and silently disable the check.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';

import { ESLINT_DEBT } from '../eslint.debt.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS_DIRECTORY = 'scripts';

/**
 * The extensions this enumeration considers lintable.
 *
 * Must cover every extension the `scripts/**` glob in `eslint.config.js` block 6 configures.
 * Anything ESLint is set up for but this does not enumerate is a hole the ratchet cannot see: such
 * a file would be ungated, unacknowledged, and invisible here all at once. That invariant is a
 * hand-maintained mirror, so it is not left to a comment — `eslintConfiguredScriptExtensions`
 * reads the glob back out of the config and a test compares the two.
 */
const LINTED_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);

/**
 * The `files` glob of `eslint.config.js` block 6, captured for its extension list.
 *
 * Anchored on `files:` and not on the bare glob text, because the same literal appears in that
 * block's prose comment; matching the comment would let the real glob drift behind it.
 */
const ESLINT_SCRIPTS_GLOB = /files:\s*\[\s*'scripts\/\*\*\/\*\.\{([^}]+)}'/;

/**
 * The `.sh` files under `scripts/`, pinned as a list.
 *
 * SHELL IS NOT COVERED BY THE MACHINERY ABOVE, AND CANNOT BE.
 * ----------------------------------------------------------
 * `LINTED_EXTENSIONS` mirrors the `scripts/**` glob in `eslint.config.js` block 6 and is asserted
 * against it, so adding `.sh` there is not an option: it would immediately fail that mirror test,
 * and ESLint cannot parse shell anyway. Prettier has no shell parser either. So a `.sh` file under
 * `scripts/` is invisible to every gate this repository runs — not linted, not formatted, not in
 * `KNOWN_UNGATED_SCRIPTS`, and not visible to the ratchet, which stays green with nothing
 * acknowledged.
 *
 * That was demonstrated rather than assumed: a syntax error introduced into
 * `scripts/forward-port-content-gate.sh` gave `bash -n` exit 2 while `lint`, `format:check`,
 * `lint:md` and both forward-port suites passed. It would have surfaced for the first time
 * mid-release, on the highest-consequence automated write this repository performs.
 *
 * So shell gets its own two-part ratchet: this pinned list, which a new `.sh` cannot join by
 * accident, and the `bash -n` parse below. The list is pinned rather than derived for the same
 * reason `DEBT_COUNTS` is pinned exactly in `tests/lint-coverage.test.js` — a derived list would
 * grow silently, and
 * growth here means a new unlinted shell script on the release path.
 */
const SHELL_SCRIPTS = [
  'scripts/forward-port-complete-merge.sh',
  'scripts/forward-port-content-gate.sh',
];

/** Whether a repository-relative POSIX path names a real file in this checkout. */
function existsInRepository(relativePath) {
  return existsSync(path.join(REPO_ROOT, relativePath));
}

/** Codepoint path order, so a comparison and its failure listing read alike on every host. */
function byPath(a, b) {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/** Every file under `scripts/` with one of `extensions`, as repository-relative POSIX paths. */
function enumerateScriptFilesWith(extensions) {
  const entries = readdirSync(path.join(REPO_ROOT, SCRIPTS_DIRECTORY), { recursive: true });
  return entries
    .filter((entry) => extensions.has(path.extname(entry)))
    .map((entry) => `${SCRIPTS_DIRECTORY}/${entry.split(path.sep).join('/')}`);
}

/** Every lintable file under `scripts/`, as repository-relative POSIX paths. */
function enumerateScriptFiles() {
  return enumerateScriptFilesWith(LINTED_EXTENSIONS);
}

/**
 * `bash -n` over one file: parse it, run nothing.
 *
 * The path is POSIX-separated because it is handed to bash, not to a Windows program.
 *
 * @param {string} file A repository-relative POSIX path.
 * @returns {{status: number|null, stderr: string, error?: Error}} What bash reported.
 */
function parseWithBash(file) {
  const absolute = path.join(REPO_ROOT, file).split(path.sep).join('/');
  const result = spawnSync('bash', ['-n', absolute], { encoding: 'utf8' });
  return { status: result.status, stderr: result.stderr ?? '', error: result.error };
}

/** The `scripts/` files `eslint.debt.js` records as not yet clean. */
function baselinedScriptFiles() {
  return Object.keys(ESLINT_DEBT.scripts);
}

/**
 * The extensions `eslint.config.js` block 6 configures for `scripts/**`, read back from the config.
 *
 * Returns `null` when the glob cannot be found, so the caller can fail as VACUOUS rather than pass
 * on an empty match — a reformat that moved the glob out of this pattern's reach would otherwise
 * silently disarm the comparison, which is the failure mode this whole file exists to prevent.
 */
function eslintConfiguredScriptExtensions() {
  const config = readFileSync(path.join(REPO_ROOT, 'eslint.config.js'), 'utf8');
  const match = ESLINT_SCRIPTS_GLOB.exec(config);
  if (!match) return null;
  return match[1].split(',').map((extension) => `.${extension.trim()}`);
}

test('the scripts/ enumeration and the parsed gate list are both alive', () => {
  const enumerated = enumerateScriptFiles();
  assert.ok(enumerated.length > 0, 'enumerated no scripts/ files at all — the guard is vacuous');

  const nested = enumerated.filter((file) =>
    file.slice(`${SCRIPTS_DIRECTORY}/`.length).includes('/')
  );
  assert.ok(
    nested.length > 0,
    `enumerated ${enumerated.length} file(s) under ${SCRIPTS_DIRECTORY}/ but not one in a` +
      ' subdirectory, so the walk is no longer recursive and every nested script is invisible here'
  );

  assert.ok(
    baselinedScriptFiles().length > 0,
    'eslint.debt.js records no scripts/ debt at all. If that is real, delete this guard along' +
      ' with the baseline; while it is not, the assertions below are measuring nothing.'
  );
});

test('LINTED_EXTENSIONS covers every extension the ESLint scripts/ glob configures', () => {
  const configured = eslintConfiguredScriptExtensions();

  assert.ok(
    configured,
    "could not find the `files: ['scripts/**/*.{…}']` glob in eslint.config.js, so this guard is" +
      ' VACUOUS and would pass whatever the config said. Repair ESLINT_SCRIPTS_GLOB against the' +
      ' config as it now reads — do not delete this assertion.'
  );
  assert.ok(configured.length > 0, 'the ESLint scripts/ glob names no extensions at all');

  const unenumerated = configured.filter((extension) => !LINTED_EXTENSIONS.has(extension));
  assert.ok(
    unenumerated.length === 0,
    `eslint.config.js configures ${unenumerated.join(', ')} under scripts/ but LINTED_EXTENSIONS` +
      ' does not enumerate it, so a file with that extension would be ungated, unacknowledged and' +
      ' invisible to this ratchet at once. Add it to LINTED_EXTENSIONS.'
  );
});

test('every scripts/ file ESLint configures is a file ESLint actually reaches', async () => {
  // The inversion's own failure mode (issue #1660). The gate is `eslint .` now, so a `scripts/`
  // file goes unlinted by being IGNORED rather than by being left off a list — and an `ignores`
  // entry is every bit as silent as the omission it replaced. `eslint.debt.js` is the sanctioned
  // way to carry a not-yet-clean file, and it keeps the file linted for every rule it does pass;
  // an `ignores` entry would not.
  const eslint = new ESLint();
  const unreachable = [];
  for (const file of enumerateScriptFiles()) {
    if (await eslint.isPathIgnored(file)) unreachable.push(file);
  }
  assert.deepEqual(
    unreachable,
    [],
    'these scripts/ files are excluded from `npm run lint` entirely. Record the file in' +
      ' ESLINT_DEBT instead, which disables only the rules it fails.'
  );
});

test('every baselined scripts/ entry names a file this enumeration can see', () => {
  // Two ways an entry goes invisible, both silent: a path that is not on disk any more, and a
  // path whose extension LINTED_EXTENSIONS does not carry — the second would be ungated,
  // unacknowledged and outside this guard all at once, which is the hole the mirror test below
  // exists to keep shut.
  const enumerated = new Set(enumerateScriptFiles());
  const invisible = baselinedScriptFiles().filter((file) => !enumerated.has(file));
  assert.deepEqual(
    invisible,
    [],
    'these ESLINT_DEBT.scripts entries are not in the scripts/ enumeration. Either the file is' +
      ' gone — remove the entry and lower DEBT_COUNTS.scripts in tests/lint-coverage.test.js in' +
      ' the same commit — or its extension is missing from LINTED_EXTENSIONS.'
  );
});

test('the baselined scripts/ list is distinct and POSIX-separated', () => {
  const baselined = baselinedScriptFiles();
  assert.equal(new Set(baselined).size, baselined.length, 'ESLINT_DEBT.scripts has a duplicate');

  // The enumeration half is the load-bearing one: it is what would carry `lib\zip.js` on Windows
  // if the normalisation above were dropped. The baseline half is close to unreachable by
  // accident, since a lone `\` in a JS string literal is an escape and only a written `\\` trips
  // it — it is asserted anyway so the two sides are held to one rule.
  const backslashed = [...baselined, ...enumerateScriptFiles()].filter((file) =>
    file.includes(String.fromCodePoint(92))
  );
  assert.deepEqual(
    backslashed,
    [],
    'paths must be POSIX-separated so this test agrees on Windows and on the CI runner'
  );
});

test('no shell script under scripts/ arrives without joining the shell ratchet', () => {
  // The only assertion standing between this repository and a second unlinted `.sh` on the release
  // path. `SHELL_SCRIPTS` is not derived from disk on purpose: derived, it would absorb a new file
  // silently, which is exactly what happened to the npm gate list this whole file exists to police.
  assert.deepEqual(
    enumerateScriptFilesWith(new Set(['.sh'])).sort(byPath),
    [...SHELL_SCRIPTS].sort(byPath),
    'a shell script under scripts/ is not in SHELL_SCRIPTS, so nothing parses it and nothing ever' +
      ' will. Add it to SHELL_SCRIPTS in this file — no other gate in this repository can see it.'
  );
});

test('every shell script under scripts/ PARSES, so a syntax error cannot wait for a release', () => {
  assert.ok(SHELL_SCRIPTS.length > 0, 'SHELL_SCRIPTS is empty — this guard is vacuous');

  for (const file of SHELL_SCRIPTS) {
    assert.ok(existsInRepository(file), `SHELL_SCRIPTS names "${file}", which is not on disk`);
    const { status, stderr, error } = parseWithBash(file);
    assert.ok(
      !error,
      `bash could not be launched (${error?.message}), so this guard checked nothing. bash comes` +
        ' with the git installation this repository already requires, and the CI runner is Linux.'
    );
    assert.equal(status, 0, `${file} is not valid bash:\n${stderr}`);
  }
});

test('the bash parse check can actually fail', () => {
  // Guarding the guard, in the style of parseGatedScriptPaths' own fixtures above. A `bash -n` that
  // silently exits 0 on everything — a wrong path, a bash that ignores its argument — would report
  // success forever, which is the failure mode this file was written to attack.
  const directory = mkdtempSync(path.join(os.tmpdir(), 'shell-ratchet-'));
  try {
    const broken = path.join(directory, 'broken.sh');
    writeFileSync(broken, '#!/usr/bin/env bash\nif [ -z "$X" ]; then\n  echo unterminated\n');
    const result = spawnSync('bash', ['-n', broken.split(path.sep).join('/')], {
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0, 'bash -n must reject an unterminated `if`');
    assert.match(result.stderr, /unexpected end of file|syntax error/);
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
  }
});
