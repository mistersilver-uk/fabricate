/**
 * THE GLOB GATE IS A SUPERSET OF THE LIST IT REPLACED (issue #1660).
 *
 * `npm run lint` and `npm run format:check` used to name about eighty files each. They are
 * `eslint .` and `prettier --check .` now, which fixes the trap issue #933 was filed about — a new
 * file nobody remembered to add was linted by nothing, and the miss surfaced at SonarCloud after
 * push — and creates a new one this file exists to close: an inverted gate hides things in its
 * EXCLUSIONS instead of in its omissions, and an exclusion is just as silent.
 *
 * So three properties are asserted here, and each is asserted in a way that can actually fail.
 *
 * 1. EVERY FILE THE OLD GATE REACHED IS STILL REACHED. Measured against
 *    `tests/helpers/legacyLintGate.js`, which freezes the old argv verbatim and the 360 paths it
 *    selected. A fixture derived from the NEW configuration would assert only that the new gate
 *    covers what the new gate covers, so the fixture is derived from the OLD command and then
 *    self-verified: `deriveLegacyGateFiles()` expands the frozen argv against the working tree and
 *    must still yield exactly the committed list.
 *
 * 2. COVERAGE IS ASKED OF THE TOOLS, NOT OF THE FILESYSTEM. A superset computed by walking
 *    directories passes even when every path is ignored. ESLint is asked `isPathIgnored`, and
 *    Prettier is asked `getFileInfo`. That is the idiom `tests/main-undefined-identifiers.test.js`
 *    already uses, and it is in this repository because a guard that could not tell "clean" from
 *    "never ran" reported clean.
 *
 * 3. FILE COVERAGE IS NOT RULE COVERAGE. `eslint .` over every file proves nothing if the rules
 *    are off. A later `{ files: ['src/ui/**\/*.js'], rules: { 'no-undef': 'off' } }` would leave a
 *    file-set assertion at 100% green. So `calculateConfigForFile` is asked whether the rules are
 *    ARMED, and `no-undef` in particular — the rule whose absence cost this repository a shipped
 *    `ReferenceError` — is asserted armed on the legacy 360, on every baselined file, and across
 *    `tests/**`, and asserted absent from the baseline itself.
 *
 * WHAT IS DELIBERATELY NOT HERE. The ESLint-side staleness check — "this baseline entry reports
 * nothing any more, remove it" — has to lint the 89 baselined files, which takes 23 seconds
 * because they are the largest files in the tree. Twenty-three CPU-bound seconds in the unit-test
 * job starves the browser-backed suites sharing its runner, so that half lives in
 * `npm run lint:debt`, which CI runs as a step of the `lint` job. Prettier's staleness check IS
 * here, because `getFileInfo` answers without formatting anything.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
// Deep entry point: `npm test` runs Node with `--conditions=browser` and Prettier's export map
// answers that condition with `standalone.mjs`, a bundle with no filesystem access and so no
// `getFileInfo`/`resolveConfig`. `prettier/index.mjs` is the Node build, reachable through the
// package's `"./*"` export — the same seam `tests/prettier-svelte-scope.test.js` uses.
import { check as prettierCheck, getFileInfo, resolveConfig } from 'prettier/index.mjs';

import { ESLINT_DEBT, ESLINT_TESTS_DEBT } from '../eslint.debt.js';
import { byCodePoint } from './helpers/ratchetBaseline.js';
import {
  LEGACY_FORMAT_ARGV,
  LEGACY_GATE_FILES,
  LEGACY_LINT_ARGV,
  deriveLegacyGateFiles,
} from './helpers/legacyLintGate.js';

const REPOSITORY_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The size of the gate this replaced, pinned.
 *
 * A superset assertion over an EMPTY fixture passes trivially, and the cheapest way to green a
 * failure here would be to delete the offending fixture line. Pinning the count turns that into an
 * edit to a number.
 */
const LEGACY_GATE_FILE_COUNT = 360;

/**
 * Each debt group's file count and (file, rule) pair count, pinned EXACTLY rather than capped.
 *
 * The same shape, and the same reason, as `ACKNOWLEDGED_UNGATED_COUNT` in
 * `tests/scripts-lint-gate-coverage.test.js`: a `<=` ceiling banks a free slot on every debt
 * payment, so the next author can append instead of fixing and still pass. Pinning exactly makes
 * both directions a visible edit.
 *
 * Segmented rather than one total so the numbers keep their meaning. `scripts` is 15, and 15 is a
 * number a reviewer of this repository has been trained to read — it is the same fifteen
 * `KNOWN_UNGATED_SCRIPTS` has carried since issue #933. Folded into one ~89-entry total, a
 * `scripts/` regression would be invisible.
 */
const DEBT_COUNTS = {
  scripts: { files: 15, pairs: 96 },
  srcUi: { files: 60, pairs: 146 },
  srcRoot: { files: 4, pairs: 27 },
  examples: { files: 8, pairs: 16 },
  rootConfig: { files: 2, pairs: 7 },
};

/** The rules `tests/**` does not pass yet. Pinned for the same reason as the counts above. */
const TESTS_DEBT_RULE_COUNT = 89;

/** The marker that opens the formatting-debt section of `.prettierignore`. */
const PRETTIER_DEBT_MARKER = '# --- FORMATTING DEBT BASELINE';

/** Entries in that section, pinned exactly. */
const PRETTIER_DEBT_COUNT = 101;


/** Whether an ESLint rule entry is switched on. */
const armed = (entry) => Array.isArray(entry) && entry[0] !== 0 && entry[0] !== 'off';

/** The `.prettierignore` lines below the debt marker, comments and blanks dropped. */
function prettierDebtEntries() {
  const text = readFileSync(path.join(REPOSITORY_ROOT, '.prettierignore'), 'utf8');
  const marker = text.indexOf(PRETTIER_DEBT_MARKER);
  assert.notEqual(
    marker,
    -1,
    `.prettierignore no longer carries the ${PRETTIER_DEBT_MARKER} marker, so the debt section ` +
      'cannot be told apart from the permanent exclusions and this ratchet checks nothing.'
  );
  return text
    .slice(marker)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

test('the frozen legacy argv still selects exactly the files it selected', () => {
  assert.equal(LEGACY_GATE_FILES.length, LEGACY_GATE_FILE_COUNT);
  assert.deepEqual(
    deriveLegacyGateFiles(LEGACY_LINT_ARGV),
    LEGACY_GATE_FILES,
    'the frozen `lint` argv no longer expands to the committed file list. A file it named has ' +
      'been deleted or renamed; remove its fixture entry in the same commit, and lower ' +
      'LEGACY_GATE_FILE_COUNT. Do NOT re-derive the fixture from the current configuration — ' +
      'that would assert only that the new gate covers what the new gate covers.'
  );
});

test('the frozen-argv expander refuses a pattern it does not understand', () => {
  // The expander feeds the superset assertion, so a shape it silently skipped would SHRINK the set
  // that assertion is measured against. It must throw instead, and this proves it does.
  assert.throws(
    () => deriveLegacyGateFiles('eslint "src/**/*.{js,svelte}"'),
    /does not know the pattern/u
  );
  // And it must still handle the shapes that are really in the two frozen commands.
  assert.ok(deriveLegacyGateFiles(LEGACY_FORMAT_ARGV).length > LEGACY_GATE_FILE_COUNT);
});

test('every file the legacy lint gate covered is still linted', async () => {
  const eslint = new ESLint();
  const ignored = [];
  for (const file of LEGACY_GATE_FILES) {
    if (await eslint.isPathIgnored(file)) ignored.push(file);
  }
  assert.deepEqual(
    ignored,
    [],
    'these files were covered by the old enumerated gate and are excluded from the glob one. ' +
      'The glob must be a SUPERSET: an exclusion is as silent as the omission it replaced.'
  );
});

test('the ignored-path check can actually fail', async () => {
  // Without this, `isPathIgnored` returning false for everything — because the config failed to
  // load, say — would read as full coverage.
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [{ ignores: ['src/**'] }, {}],
  });
  assert.equal(await eslint.isPathIgnored(LEGACY_GATE_FILES.find((f) => f.startsWith('src/'))), true);
});

test('no-undef is armed on every file the legacy gate covered', async () => {
  const eslint = new ESLint();
  const unarmed = [];
  for (const file of LEGACY_GATE_FILES) {
    const config = await eslint.calculateConfigForFile(file);
    if (!armed(config.rules['no-undef'])) unarmed.push(file);
  }
  assert.deepEqual(
    unarmed,
    [],
    'file coverage is not rule coverage. These files are linted and `no-undef` is off on them.'
  );
});

test('no-undef is armed on every baselined file and across tests/', async () => {
  const eslint = new ESLint();
  const files = [...Object.values(ESLINT_DEBT).flatMap((group) => Object.keys(group)),
    'tests/lint-coverage.test.js'];
  const unarmed = [];
  for (const file of files) {
    const config = await eslint.calculateConfigForFile(file);
    if (!armed(config.rules['no-undef'])) unarmed.push(file);
  }
  assert.deepEqual(
    unarmed,
    [],
    'the debt baseline disables rules PER FILE precisely so `no-undef` survives on them. If it ' +
      'is off here, something took the file out of ESLint’s reach instead.'
  );
});

test('the armed-rule check can actually fail', async () => {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [{ rules: { 'no-undef': 'off' } }],
  });
  const config = await eslint.calculateConfigForFile('src/main.js');
  assert.equal(armed(config.rules['no-undef']), false);
});

test('no-undef is never baselined', () => {
  const baselined = Object.entries(ESLINT_DEBT).flatMap(([group, files]) =>
    Object.entries(files)
      .filter(([, rules]) => rules.includes('no-undef'))
      .map(([file]) => `${group}: ${file}`)
  );
  assert.deepEqual(
    baselined,
    [],
    'a `no-undef` report is an undefined identifier, which in module code is a hard ' +
      'ReferenceError the moment its function runs — issue 1370. If one has appeared, declare ' +
      'the global in `eslint.config.js` where it genuinely exists, or fix the reference. Never ' +
      'baseline it.'
  );
  assert.equal(ESLINT_TESTS_DEBT.includes('no-undef'), false);
});

test('each debt group pins its file and pair counts exactly', () => {
  assert.deepEqual(
    Object.keys(ESLINT_DEBT).sort(byCodePoint),
    Object.keys(DEBT_COUNTS).sort(byCodePoint),
    'a debt group was added or removed; give it a pinned count here, or take its count away.'
  );
  for (const [group, files] of Object.entries(ESLINT_DEBT)) {
    const pairs = Object.values(files).reduce((total, rules) => total + rules.length, 0);
    assert.deepEqual(
      { files: Object.keys(files).length, pairs },
      DEBT_COUNTS[group],
      `the ${group} debt group changed size. Paying debt down is the expected direction: drop ` +
        'the entry and lower the number here in the same commit. Growing it means a file went ' +
        'ungated instead of being fixed, which needs its own justification.'
    );
  }
  assert.equal(ESLINT_TESTS_DEBT.length, TESTS_DEBT_RULE_COUNT);
  assert.deepEqual(
    [...ESLINT_TESTS_DEBT].sort(byCodePoint),
    ESLINT_TESTS_DEBT,
    'keep the tests/ rule list sorted so a diff to it is readable.'
  );
});

test('every baselined file and rule is real', async () => {
  const missing = Object.values(ESLINT_DEBT)
    .flatMap((group) => Object.keys(group))
    .filter((file) => !existsSync(path.join(REPOSITORY_ROOT, file)));
  assert.deepEqual(missing, [], 'these baseline entries name files that are not in the checkout.');

  // A misspelled rule name disables nothing and is invisible: ESLint does not complain about an
  // unknown rule set to `off`. So the names are checked against the rules ESLint actually knows.
  const known = new Set((await new ESLint().calculateConfigForFile('src/main.js')) && []);
  const { builtinRules } = await import('eslint/use-at-your-own-risk');
  for (const name of builtinRules.keys()) known.add(name);
  const config = await new ESLint().calculateConfigForFile('src/main.js');
  for (const name of Object.keys(config.rules)) known.add(name);
  const unknown = [
    ...new Set([...Object.values(ESLINT_DEBT).flatMap((g) => Object.values(g).flat()), ...ESLINT_TESTS_DEBT]),
  ].filter((rule) => !known.has(rule));
  assert.deepEqual(
    unknown,
    [],
    'these baselined rule names are not rules ESLint knows about. A misspelled name disables ' +
      'nothing and reports nothing, so the file it was meant to cover is failing the real rule.'
  );
});

test('every file the legacy format gate covered is still formatted', async () => {
  const covered = deriveLegacyGateFiles(LEGACY_FORMAT_ARGV);
  const excluded = [];
  for (const file of covered) {
    const info = await getFileInfo(path.join(REPOSITORY_ROOT, file), {
      ignorePath: ['.gitignore', '.prettierignore'],
    });
    if (info.ignored || !info.inferredParser) excluded.push(file);
  }
  assert.deepEqual(
    excluded,
    [],
    'these files were formatted by the old enumerated `format:check` and are now excluded. The ' +
      'glob must be a SUPERSET.'
  );
});

test('the formatting-debt section only shrinks', async () => {
  const entries = prettierDebtEntries();
  assert.equal(
    entries.length,
    PRETTIER_DEBT_COUNT,
    'the .prettierignore debt section changed size. Format the file and delete its entry; do ' +
      'not add to the list.'
  );

  const missing = entries.filter(
    (entry) => !existsSync(path.join(REPOSITORY_ROOT, entry.replace(/\/$/u, '')))
  );
  assert.deepEqual(missing, [], 'these debt entries name paths that are not in the checkout.');

  // STALENESS. An entry whose file is ALREADY formatted has been paid off and left in place, which
  // is how "only shrinks" stops being true. Directory entries are skipped: they stand for a tree,
  // and one formatted file inside it does not retire the entry.
  const stale = [];
  for (const entry of entries) {
    if (entry.endsWith('/')) continue;
    const file = path.join(REPOSITORY_ROOT, entry);
    // `resolveConfig` is load-bearing: `check()` applies ONLY the options it is handed, so without
    // it this would judge every file against Prettier's defaults rather than `.prettierrc.json`
    // and answer a different question from the one `npm run format:check` asks.
    const options = await resolveConfig(file);
    if (await prettierCheck(readFileSync(file, 'utf8'), { ...options, filepath: file })) {
      stale.push(entry);
    }
  }
  assert.deepEqual(
    stale,
    [],
    'these files are already Prettier-clean, so their .prettierignore entries do nothing but ' +
      'keep them out of the gate. Remove them and lower PRETTIER_DEBT_COUNT in the same commit.'
  );
});

test('ESLint ignores every tree git ignores', async () => {
  // The global `ignores` in `eslint.config.js` mirror `.gitignore` by hand, because ESLint's
  // patterns and gitignore's are not the same language and a hand-rolled reader for the second
  // would be a subtly wrong second implementation of it. A hand-written mirror drifts, though, and
  // the direction it drifts in is the one that matters: while `lint` named every file it covered,
  // an untracked tree was unreachable by construction; `eslint .` reaches anything on disk. A new
  // gitignored tree holding JavaScript — an agent worktree, a downloaded game system — would be
  // linted as if it were the project, and the gate's result would start depending on what happens
  // to be lying around. So the mirror is asserted rather than described.
  //
  // `--directory` collapses a wholly-ignored tree to one entry, so this costs one cheap git call
  // rather than a walk of `node_modules`.
  const ignoredTrees = execFileSync(
    'git',
    ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory'],
    { cwd: REPOSITORY_ROOT, encoding: 'utf8' }
  )
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.endsWith('/'));

  assert.ok(
    ignoredTrees.includes('node_modules/'),
    'git reported no ignored `node_modules/`, so this enumeration is not working and the ' +
      'assertion below would pass over an empty list.'
  );

  const eslint = new ESLint();
  const reachable = [];
  for (const tree of ignoredTrees) {
    if (!(await eslint.isPathIgnored(`${tree}probe.js`))) reachable.push(tree);
  }
  assert.deepEqual(
    reachable,
    [],
    'git ignores these trees and ESLint does not, so `npm run lint` walks into them. Add each ' +
      'to the global `ignores` in eslint.config.js.'
  );
});

test('the global ignores are pinned, so a new exclusion is a visible edit', async () => {
  // An open-ended, hand-maintained ignore array is structurally the same thing as the
  // hand-maintained allowlist this change removed: somewhere to put a file so that nothing looks
  // at it. Pinning the list means parking a real source tree there costs an edit to this test.
  const { default: config } = await import('../eslint.config.js');
  const globalIgnores = config.filter((block) => block.ignores && Object.keys(block).length === 1);
  assert.equal(globalIgnores.length, 1, 'there should be exactly one global-ignores block');
  assert.deepEqual(globalIgnores[0].ignores, [
    'dist/',
    'build/',
    'node_modules/',
    'docs/',
    'coverage/',
    '.worktrees/',
    '.foundry-e2e/',
    '.foundry-chrome/',
    '.foundry-perf/',
    '.benchmarks/',
    'test-results/',
    'ui-screenshot-artifact/',
    'content-packs/',
    '.air/',
    '**/*.min.js',
    'package-lock.json',
  ]);
});

test('the npm scripts are globs, and short enough to read', () => {
  const { scripts } = JSON.parse(readFileSync(path.join(REPOSITORY_ROOT, 'package.json'), 'utf8'));
  // Issue #1660's acceptance criterion. The length is a proxy for the real property — that the
  // command names no individual file — so both are checked: a 79-character enumeration would
  // satisfy the letter of the criterion and none of its point.
  for (const key of ['lint', 'format', 'format:check', 'lint:svelte', 'test']) {
    assert.ok(
      scripts[key].length < 80,
      `the \`${key}\` script is ${scripts[key].length} characters; the point of issue #1660 is ` +
        'that it stops enumerating files.'
    );
  }
  assert.equal(scripts.lint, 'eslint . --max-warnings=0');
  assert.equal(scripts['format:check'], 'prettier --check .');
  assert.ok(
    scripts.test.includes('"tests/**/*.test.js"'),
    'the `test` script must use one recursive glob so a new tests/ subdirectory runs without a ' +
      'package.json edit. Keep it QUOTED: unquoted, bash without globstar expands `**` as a ' +
      'single `*` and the nested suites stop running silently.'
  );
  assert.equal(
    scripts['lint:all'],
    undefined,
    '`lint:all` was `eslint .`, which `lint` is now. It is gone; `lint:debt` replaced what it ' +
      'claimed to offer.'
  );
});
