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
 * that has since been gated or deleted must come out of it.
 *
 * WHY THE BASELINE LENGTH IS PINNED AS WELL AS LISTED
 * ---------------------------------------------------
 * "The baseline only shrinks" is a property, and a property nothing enforces is a wish. Without
 * ACKNOWLEDGED_UNGATED_COUNT, the cheapest way to make this test green after adding an unlinted
 * script is to append one line to the baseline — a smaller edit than gating the file properly in
 * three `package.json` entries, and therefore the one that would actually get made. Pinning the
 * count turns that into an edit to a NUMBER, which a reviewer sees and has to accept, instead of
 * one more line in a fifteen-line array that reads as noise in a diff.
 *
 * Pinned exactly rather than capped, which is the less obvious half. A `<=` ceiling loosens by one
 * slot every time debt is paid down: gate a file, drop its baseline entry, and the list sits one
 * under the ceiling with nothing requiring the ceiling to follow it. The next author can then
 * append instead of gating and still pass — a hand-maintained number that has quietly stopped
 * protecting anything, which is the exact defect class this file was written to attack.
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
 * forward-slash on both. Enumerated paths are therefore normalised before any comparison, and the
 * baseline stores POSIX paths only. Without that this test disagrees with itself across platforms.
 *
 * NON-VACUITY. A guard that stops looking at anything must not keep reporting success, so the
 * inputs are asserted alive: the enumeration is non-empty AND still reaches at least one file in a
 * SUBDIRECTORY (which a `readdirSync` that lost `{ recursive: true }` would not), and the parsed
 * gate list is non-empty. The subdirectory check is structural rather than a named file on purpose
 * — pinning one path would turn that file's deletion into a false report of broken recursion,
 * whose obvious "fix" is to repoint the constant at a top-level script and silently disable the
 * check. `parseGatedScriptPaths` is additionally exercised against hand-written `lint`-like
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
 * The exact number of acknowledged-ungated scripts this repository carries.
 *
 * Pinned, not a ceiling. A ceiling loosens by one slot on every debt payment — gate a file, drop
 * its baseline entry, and the next author can append instead of gating and still pass. Pinning
 * makes BOTH directions a visible edit: growth fails until the file is gated properly, and a
 * shrink fails until this number is lowered to bank it. Yes, that makes this constant a mirror of
 * the array's length; that is the point, exactly as a golden file restates its expected value.
 */
const ACKNOWLEDGED_UNGATED_COUNT = 15;

/** Characters that make a `scripts/…` token something other than one literal path. */
const NOT_A_LITERAL_PATH = /["'*?{]/;

/**
 * Shell composition: `&&`, `||`, `;`, a pipe, a newline, or a bare `&`.
 *
 * The `(?<![>])` on the bare `&` is LOAD-BEARING, not defensive — do not simplify it away. A
 * redirection like `2>&1` contains an `&` that composes nothing, and without the lookbehind this
 * would refuse a perfectly ordinary command. The brace glob `src/{models,…}/**` is safe for a
 * different reason: `{`, `,` and `}` are deliberately absent from this pattern.
 */
const SHELL_COMPOSITION = /&&|\|\||[;|]|\n|(?<![>])&/;

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
 *   1. The command must be ONE command. `&&`, `||`, `;`, `|`, a newline and a bare `&` are all
 *      refused outright, because the positional rules below reason about a single tool
 *      invocation: in `eslint … && node scripts/x.mjs`, the token before `scripts/x.mjs` is
 *      `node`, which starts with no `-`, so clause 3 would not fire and a file nothing lints would
 *      be credited as gated. That is precisely the silent direction, so it is refused rather than
 *      handled. See SHELL_COMPOSITION for why `2>&1` is not caught by the bare-`&` alternative.
 *   2. Only whitespace-separated tokens beginning `scripts/` are candidates. A quoted token starts
 *      with its quote, so it is not one — which reads as ungated, the safe direction.
 *   3. A candidate whose PRECEDING token is an option EXPECTING a value is dropped: it is that
 *      value, not a target. `--ignore-pattern scripts/foundry-test-run.mjs` EXCLUDES that file, and
 *      counting it as covered would be exactly backwards. "Expecting a value" means starting with
 *      `-` and carrying no `=`: an `--opt=value` token is self-contained and consumes nothing after
 *      it, so `--ignore-pattern=scripts/b.js scripts/a.js` gates `scripts/a.js` — while
 *      `scripts/b.js` is skipped by clause 2 anyway, being mid-token rather than at its start.
 *      The `--` end-of-options separator is exempt: it consumes nothing, and everything after it
 *      is positional by definition. The heuristic's known rough edge is a BOOLEAN flag directly
 *      before a target — `prettier --write scripts/lib/foo.js` reads `foo.js` as `--write`'s
 *      value and drops it. That under-counts, so it fails loud rather than silent, and the
 *      unacknowledged-file message below names this cause explicitly.
 *   4. A candidate carrying `*`, `?`, `{` or a quote throws. Such a token is a glob, and treating
 *      it as one literal path would credit a file that does not exist under that name — or, worse,
 *      silently credit nothing at all.
 *   5. A candidate naming a path absent from the checkout throws, so a rename that half-lands is
 *      reported here rather than shrinking the remainder.
 *
 * `exists` is injected so the contract fixtures can drive clauses 4 and 5 with paths that are not
 * in this repository.
 *
 * @param {string} command the npm script's command text
 * @param {(relativePath: string) => boolean} [exists] existence check for a parsed path
 * @returns {Set<string>} the POSIX paths the command covers
 */
function parseGatedScriptPaths(command, exists = existsInRepository) {
  if (SHELL_COMPOSITION.test(command)) {
    throw new Error(
      'the gate-coverage parser reads ONE command and this one is composed with &&, ||, ;, a' +
        ` pipe, a newline or a bare &: ${command}\nSplit it into its own npm script, or teach the` +
        ' parser this shape — guessing here would silently credit a file that nothing lints.'
    );
  }

  const tokens = command.split(/\s+/).filter(Boolean);
  const covered = new Set();

  for (const [position, token] of tokens.entries()) {
    if (!token.startsWith(`${SCRIPTS_DIRECTORY}/`)) continue;
    const preceding = tokens[position - 1] ?? '';
    if (preceding.startsWith('-') && !preceding.includes('=') && preceding !== '--') continue;
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

/** Every lintable file under `scripts/`, as repository-relative POSIX paths. */
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

  const gated = parseGatedScriptPaths(packageScripts().lint);
  assert.ok(
    gated.size > 0,
    'parsed no scripts/ paths out of the lint script — the guard is vacuous'
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

test('lint, format and format:check cover the same scripts/ files', () => {
  const scripts = packageScripts();
  // Scoped to `scripts/`-prefixed tokens on purpose: `format` and `format:check` also carry
  // `src/**/*.svelte` and `eslint.config.js`, which `lint` does not, so comparing whole token sets
  // would false-fail on a correct configuration. Compared as SETS, because none of the three tools
  // cares in what order it is handed its files.
  const [reference, ...others] = PARALLEL_SCRIPT_KEYS.map((key) => ({
    key,
    paths: [...parseGatedScriptPaths(scripts[key])].sort(byPath),
  }));

  for (const other of others) {
    assert.deepEqual(
      other.paths,
      reference.paths,
      `the "${reference.key}" and "${other.key}" npm scripts disagree on which scripts/ files` +
        ' they cover — a newly gated path has to be added to all three'
    );
  }
});

test('every ungated scripts/ file is acknowledged in KNOWN_UNGATED_SCRIPTS', () => {
  const acknowledged = new Set(KNOWN_UNGATED_SCRIPTS);
  const unacknowledged = ungatedScriptFiles().filter((file) => !acknowledged.has(file));

  assert.ok(
    unacknowledged.length === 0,
    'these scripts/ files are linted by nothing — add them to the lint, format and format:check' +
      ' scripts in package.json:\n' +
      `${unacknowledged.join('\n')}\n` +
      'If a file above IS already named in the lint script, check whether it directly follows a' +
      ' bare boolean flag such as --write or --check: this parser treats an option carrying no' +
      ' "=" as consuming the next token, so it reads that path as the flag\'s value and misses' +
      ' it. Reorder the list, or teach parseGatedScriptPaths about the flag.\n' +
      'Recording a file as debt in tests/scripts-known-ungated.js instead means changing the' +
      ' pinned ACKNOWLEDGED_UNGATED_COUNT in this file, which needs its own justification in' +
      ' review.'
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

test('KNOWN_UNGATED_SCRIPTS matches its pinned count', () => {
  const actual = KNOWN_UNGATED_SCRIPTS.length;
  const preamble =
    `KNOWN_UNGATED_SCRIPTS holds ${actual} entries but ACKNOWLEDGED_UNGATED_COUNT pins` +
    ` ${ACKNOWLEDGED_UNGATED_COUNT}. `;
  const grew =
    'The debt GREW: a script was acknowledged instead of gated. Add it to the lint, format and' +
    ' format:check scripts in package.json rather than raising this number — raising it means' +
    ' deliberately shipping another unlinted script, and needs its own justification in review.';
  const shrank =
    `The debt was PAID DOWN. Lower ACKNOWLEDGED_UNGATED_COUNT to ${actual} to bank it. The count` +
    ' is pinned exactly, not capped, because a ceiling would silently grant a free slot on every' +
    ' payment — the next author could then append instead of gating and still pass.';

  assert.equal(
    actual,
    ACKNOWLEDGED_UNGATED_COUNT,
    preamble + (actual > ACKNOWLEDGED_UNGATED_COUNT ? grew : shrank)
  );
});

test('KNOWN_UNGATED_SCRIPTS is a distinct, POSIX-separated list', () => {
  assert.equal(
    new Set(KNOWN_UNGATED_SCRIPTS).size,
    KNOWN_UNGATED_SCRIPTS.length,
    'KNOWN_UNGATED_SCRIPTS contains a duplicate entry'
  );

  // The enumeration half is the load-bearing one: it is what would carry `lib\zip.js` on Windows
  // if the normalisation above were dropped. The baseline half is close to unreachable by
  // accident, since a lone `\` in a JS string literal is an escape and only a written `\\` trips
  // it — it is asserted anyway so the two sides are held to one rule.
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
    [...parseGatedScriptPaths('eslint --ignore-pattern=scripts/b.js scripts/a.js', () => true)],
    ['scripts/a.js'],
    'the --opt=value form must not credit its own value, and must not swallow the next token either'
  );

  assert.deepEqual(
    [...parseGatedScriptPaths('prettier --check "src/**/*.svelte" eslint.config.js', () => true)],
    [],
    'a command naming no scripts/ path must parse to nothing rather than to a guess'
  );

  assert.deepEqual(
    [...parseGatedScriptPaths('eslint "scripts/**/*.js"', () => true)],
    [],
    'a QUOTED glob starts with its quote, so it reads as ungated — the safe direction, no throw'
  );

  assert.deepEqual(
    [...parseGatedScriptPaths('eslint -- scripts/a.js', () => true)],
    ['scripts/a.js'],
    'the -- end-of-options separator consumes nothing, so the path after it is a target'
  );
});

test('parseGatedScriptPaths accepts the shapes the real npm scripts already use', () => {
  // Guarding the guard: a SHELL_COMPOSITION that false-positives here would break the gate for an
  // innocent edit, which is worse than the hole it closes. Both of these must parse without
  // throwing — `2>&1` because of the lookbehind, the brace glob because `{`/`,`/`}` are not in it.
  assert.doesNotThrow(
    () => parseGatedScriptPaths('eslint scripts/a.js 2>&1', () => true),
    'a 2>&1 redirection composes nothing and must not be refused'
  );

  assert.deepEqual(
    [
      ...parseGatedScriptPaths(
        'eslint "src/{models,utils,integrations}/**/*.js" scripts/a.js --max-warnings=0',
        () => true
      ),
    ],
    ['scripts/a.js'],
    "the real lint script's brace glob must parse cleanly and credit only the literal path"
  );

  for (const key of PARALLEL_SCRIPT_KEYS) {
    assert.doesNotThrow(
      () => parseGatedScriptPaths(packageScripts()[key]),
      `the real "${key}" script must parse without the parser refusing it`
    );
  }
});

test('parseGatedScriptPaths refuses what it cannot read literally', () => {
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

  // A composed command would credit `scripts/x.mjs` via the token `node`, which starts with no
  // dash — the silent over-count the whole parser exists to avoid.
  for (const command of [
    'eslint scripts/a.js --max-warnings=0 && node scripts/x.mjs',
    'eslint scripts/a.js || node scripts/x.mjs',
    'eslint scripts/a.js; node scripts/x.mjs',
    'eslint scripts/a.js | tee scripts/x.mjs',
    'eslint scripts/a.js & node scripts/x.mjs',
    'eslint scripts/a.js\nnode scripts/x.mjs',
  ]) {
    assert.throws(
      () => parseGatedScriptPaths(command, () => true),
      /parser reads ONE command/,
      `expected "${command}" to be refused as a composed command`
    );
  }

  assert.throws(
    () => parseGatedScriptPaths('eslint scripts/gone.js', () => false),
    /does not exist in this checkout/
  );
});
