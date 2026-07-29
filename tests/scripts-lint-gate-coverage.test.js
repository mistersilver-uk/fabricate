/**
 * The `scripts/` lint gate is a hand-written file list. This makes it self-policing.
 *
 * `npm run lint` and `npm run format:check` enumerate the `scripts/` files they cover one by one,
 * and `eslint.config.js` block 6 explains why that stays narrow rather than becoming a glob. The
 * cost of the enumeration is that adding a script is not enough to get it linted: someone has to
 * remember the list too. Issue #933 exists because nobody did, and the miss was announced by
 * SonarCloud after push rather than by any local gate.
 *
 * So the list is compared here, at `npm test` speed, against what is actually on disk. Anything
 * ungated must appear in the committed KNOWN_UNGATED_SCRIPTS baseline; anything in the baseline
 * that has since been gated or deleted must come out of it. The baseline therefore only shrinks,
 * and a new script fails immediately instead of quietly shipping unlinted.
 *
 * WHY THE GATE LIST IS PARSED RATHER THAN RESTATED
 * ------------------------------------------------
 * Copying the paths into a constant here would create a second source of truth that can drift from
 * the gate it claims to describe — which is the very failure being fixed. So `package.json` stays
 * the one list, and this reads it.
 *
 * The parse is a string heuristic over a shell command, and its two error directions are NOT
 * symmetric. Under-counting is safe: a gated file the parser misses lands in the remainder, is
 * absent from the baseline, and this goes red. Over-counting is NOT: the remainder shrinks and the
 * ratchet silently stops protecting anything. `parseGatedScriptPaths` is written to fail in the
 * safe direction only — see its own contract.
 *
 * WHY PATHS ARE NORMALISED TO POSIX
 * ---------------------------------
 * `readdirSync(…, { recursive: true })` yields `lib\zip.js` on a Windows dev machine and
 * `lib/zip.js` on the `ubuntu-latest` runner, while the list parsed out of `package.json` is
 * forward-slash on both. Without normalisation this test is red locally and green in CI, and
 * "fixing" it by writing backslash entries into the baseline merely inverts that.
 *
 * NON-VACUITY. A guard that stops looking at anything must not keep reporting success, so the
 * inputs are asserted alive: the enumeration is non-empty AND still reaches a two-level-deep file
 * (which a `readdirSync` that lost `{ recursive: true }` would not), and the parsed gate list is
 * non-empty. `parseGatedScriptPaths` is additionally exercised against hand-written `lint`-like
 * commands below, since the real command only ever exercises the happy path.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { KNOWN_UNGATED_SCRIPTS } from './scripts-known-ungated.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS_DIRECTORY = 'scripts';
const LINTED_EXTENSIONS = new Set(['.js', '.mjs']);

/**
 * A file the enumeration must find, two levels deep. A `readdirSync` that lost its `recursive`
 * option still returns the top-level `.mjs` scripts, so an emptiness check alone would not notice.
 */
const NESTED_CANARY = 'scripts/foundry/create-mythwright-dnd5e.js';

/** Characters that make a `scripts/…` token something other than one literal path. */
const NOT_A_LITERAL_PATH = /["'*?{]/;

/** The three npm scripts that must agree on which `scripts/` files they cover. */
const PARALLEL_SCRIPT_KEYS = ['lint', 'format', 'format:check'];

function packageScripts() {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')).scripts;
}

/** Whether a repository-relative POSIX path names a real file in this checkout. */
function existsInRepository(relativePath) {
  return existsSync(path.join(REPO_ROOT, relativePath));
}

/**
 * The literal `scripts/…` paths one npm script command passes to its tool.
 *
 * Deliberately narrow, and it refuses rather than guesses, because over-counting is the silent
 * failure. The contract, in full:
 *
 *   1. Only whitespace-separated tokens beginning `scripts/` are candidates. A quoted token starts
 *      with its quote, so it is not one — which reads as ungated, the safe direction.
 *   2. A candidate whose PRECEDING token starts with `-` is dropped: it is an option's value, not a
 *      target. `--ignore-pattern scripts/foundry-test-run.mjs` EXCLUDES that file, and counting it
 *      as covered would be exactly backwards.
 *   3. A candidate carrying `*`, `?`, `{` or a quote throws. Such a token is a glob, and treating
 *      it as one literal path would credit a file that does not exist under that name — or, worse,
 *      silently credit nothing at all.
 *   4. A candidate naming a path absent from the checkout throws, so a rename that half-lands is
 *      reported here rather than shrinking the remainder.
 *
 * `exists` is injected so the contract fixtures can drive clauses 3 and 4 with paths that are not
 * in this repository.
 *
 * @param {string} command the npm script's command text
 * @param {(relativePath: string) => boolean} [exists] existence check for a parsed path
 * @returns {Set<string>} the POSIX paths the command covers
 */
function parseGatedScriptPaths(command, exists = existsInRepository) {
  const tokens = command.split(/\s+/).filter(Boolean);
  const covered = new Set();

  for (const [position, token] of tokens.entries()) {
    if (!token.startsWith(`${SCRIPTS_DIRECTORY}/`)) continue;
    if ((tokens[position - 1] ?? '').startsWith('-')) continue;
    if (NOT_A_LITERAL_PATH.test(token)) {
      throw new Error(
        `"${token}" is not one literal path. The gate-coverage parser refuses to guess at a glob` +
          ' or a quoted token — give the tool literal paths, or teach the parser this shape.'
      );
    }
    if (!exists(token)) {
      throw new Error(`the gate list names "${token}", which does not exist in this checkout`);
    }
    covered.add(token);
  }

  return covered;
}

/** Codepoint path order, so a comparison and its failure listing read alike on every host. */
function byPath(a, b) {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/** Every `.js`/`.mjs` file under `scripts/`, as repository-relative POSIX paths. */
function enumerateScriptFiles() {
  const entries = readdirSync(path.join(REPO_ROOT, SCRIPTS_DIRECTORY), { recursive: true });
  return entries
    .filter((entry) => LINTED_EXTENSIONS.has(path.extname(entry)))
    .map((entry) => `${SCRIPTS_DIRECTORY}/${entry.split(path.sep).join('/')}`);
}

/** The enumerated files the `lint` script does not name. */
function ungatedScriptFiles() {
  const gated = parseGatedScriptPaths(packageScripts().lint);
  return enumerateScriptFiles().filter((file) => !gated.has(file));
}

test('the scripts/ enumeration and the parsed gate list are both alive', () => {
  const enumerated = enumerateScriptFiles();
  assert.ok(enumerated.length > 0, 'enumerated no scripts/ files at all — the guard is vacuous');
  assert.ok(
    enumerated.includes(NESTED_CANARY),
    `enumeration missed ${NESTED_CANARY}, so it is no longer descending into subdirectories`
  );

  const gated = parseGatedScriptPaths(packageScripts().lint);
  assert.ok(
    gated.size > 0,
    'parsed no scripts/ paths out of the lint script — the guard is vacuous'
  );
});

test('lint, format and format:check cover the same scripts/ files', () => {
  const scripts = packageScripts();
  // Scoped to `scripts/`-prefixed tokens on purpose: `format` and `format:check` also carry
  // `src/**/*.svelte` and `eslint.config.js`, which `lint` does not, so comparing whole token sets
  // would false-fail on a correct configuration.
  const [reference, ...others] = PARALLEL_SCRIPT_KEYS.map((key) => ({
    key,
    paths: [...parseGatedScriptPaths(scripts[key])].sort(byPath),
  }));

  for (const other of others) {
    assert.deepEqual(
      other.paths,
      reference.paths,
      `the "${reference.key}" and "${other.key}" npm scripts disagree on which scripts/ files` +
        ' they cover — add every newly gated path to all three, in the same order'
    );
  }
});

test('every ungated scripts/ file is acknowledged in KNOWN_UNGATED_SCRIPTS', () => {
  const acknowledged = new Set(KNOWN_UNGATED_SCRIPTS);
  const unacknowledged = ungatedScriptFiles().filter((file) => !acknowledged.has(file));

  assert.ok(
    unacknowledged.length === 0,
    'these scripts/ files are linted by nothing and are not acknowledged debt — add them to the' +
      ' lint, format and format:check scripts in package.json, or (deliberately) to' +
      ` KNOWN_UNGATED_SCRIPTS in tests/scripts-known-ungated.js:\n${unacknowledged.join('\n')}`
  );
});

test('KNOWN_UNGATED_SCRIPTS carries no stale entry', () => {
  const stillUngated = new Set(ungatedScriptFiles());
  const stale = KNOWN_UNGATED_SCRIPTS.filter((file) => !stillUngated.has(file));

  assert.ok(
    stale.length === 0,
    'these KNOWN_UNGATED_SCRIPTS entries are now gated, or no longer exist on disk — the baseline' +
      ' only shrinks, so remove them from tests/scripts-known-ungated.js:\n' +
      stale.join('\n')
  );
});

test('KNOWN_UNGATED_SCRIPTS is a distinct, POSIX-separated list', () => {
  assert.equal(
    new Set(KNOWN_UNGATED_SCRIPTS).size,
    KNOWN_UNGATED_SCRIPTS.length,
    'KNOWN_UNGATED_SCRIPTS contains a duplicate entry'
  );

  const backslashed = [...KNOWN_UNGATED_SCRIPTS, ...enumerateScriptFiles()].filter((file) =>
    file.includes('\\')
  );
  assert.ok(
    backslashed.length === 0,
    'paths must be POSIX-separated so this test agrees on Windows and on the CI runner:\n' +
      backslashed.join('\n')
  );
});

test('parseGatedScriptPaths reads targets and ignores option values', () => {
  const covered = parseGatedScriptPaths(
    'eslint scripts/a.js --ignore-pattern scripts/b.js scripts/c.mjs --max-warnings=0',
    () => true
  );
  assert.deepEqual([...covered].sort(byPath), ['scripts/a.js', 'scripts/c.mjs']);

  assert.deepEqual(
    [...parseGatedScriptPaths('prettier --check "src/**/*.svelte" eslint.config.js', () => true)],
    [],
    'a command naming no scripts/ path must parse to nothing rather than to a guess'
  );
});

test('parseGatedScriptPaths refuses a glob and an absent path rather than guessing', () => {
  for (const command of [
    'eslint scripts/**/*.js',
    'eslint scripts/lib/*.js',
    'eslint scripts/foundry-test-?.mjs',
    'eslint scripts/{a,b}.js',
  ]) {
    assert.throws(
      () => parseGatedScriptPaths(command, () => true),
      /is not one literal path/,
      `expected "${command}" to be refused rather than counted as one literal path`
    );
  }

  assert.throws(
    () => parseGatedScriptPaths('eslint scripts/gone.js', () => false),
    /does not exist in this checkout/
  );
});
