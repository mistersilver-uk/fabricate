/**
 * WHAT STILL POLICES `scripts/` NOW THAT THE GATE IS A GLOB. 2. THE `LINTED_EXTENSIONS` MIRROR
 * (issue 933).
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
 * The extensions this enumeration considers lintable. Must cover every extension the `scripts/**`
 * glob in `eslint.config.js` block 6 configures.
 */
const LINTED_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);

/** The `files` glob of `eslint.config.js` block 6, captured for its extension list. */
const ESLINT_SCRIPTS_GLOB = /files:\s*\[\s*'scripts\/\*\*\/\*\.\{([^}]+)}'/;

/**
 * The `.sh` files under `scripts/`, pinned as a list. So shell gets its own two-part ratchet: this
 * pinned list, which a new `.sh` cannot join by accident, and the `bash -n` parse below.
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
  // The inversion's own failure mode (issue #1660).
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

  // The enumeration half is the load-bearing one: it is what would carry `lib\zip.js` on Windows if
  // the normalisation above were dropped.
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
  // path.
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
  // Guarding the guard, in the style every anti-vacuity check here follows.
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
