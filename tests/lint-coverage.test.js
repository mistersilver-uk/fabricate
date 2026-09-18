/**
 * THE GLOB GATE IS A SUPERSET OF THE LIST IT REPLACED (issue #1660). 1. EVERY FILE THE OLD GATE
 * REACHED IS STILL REACHED.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
// Deep entry point: `npm test` runs Node with `--conditions=browser` and Prettier's export map
// answers that condition with `standalone.mjs`, a bundle with no filesystem access and so no
// `getFileInfo`/`resolveConfig`.
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

/** The size of the gate this replaced, pinned. */
const LEGACY_GATE_FILE_COUNT = 329;

/**
 * Each debt group's file count and (file, rule) pair count, pinned EXACTLY rather than capped
 * (issue 933).
 */
const DEBT_COUNTS = {
  scripts: { files: 15, pairs: 96 },
  srcUi: { files: 58, pairs: 141 },
  // `srcRoot` GREW at issue 1677, which is the direction this pin exists to make expensive, so the
  // reason is recorded here rather than in a commit message.
  srcRoot: { files: 17, pairs: 40 },
  examples: { files: 8, pairs: 16 },
  rootConfig: { files: 2, pairs: 7 },
};

/** The rules `tests/**` does not pass yet. Pinned for the same reason as the counts above. */
const TESTS_DEBT_RULE_COUNT = 82;

/** The marker that opens the formatting-debt section of `.prettierignore`. */
const PRETTIER_DEBT_MARKER = '# --- FORMATTING DEBT BASELINE';

/** Entries in that section, pinned exactly. */
const PRETTIER_DEBT_COUNT = 99;


/** Whether an ESLint rule entry is switched on. */
const armed = (entry) => Array.isArray(entry) && entry[0] !== 0 && entry[0] !== 'off';

/** `.prettierignore`, split at the debt marker into its permanent half and its debt half. */
function prettierIgnoreSections() {
  const text = readFileSync(path.join(REPOSITORY_ROOT, '.prettierignore'), 'utf8');
  const marker = text.indexOf(PRETTIER_DEBT_MARKER);
  assert.notEqual(
    marker,
    -1,
    `.prettierignore no longer carries the ${PRETTIER_DEBT_MARKER} marker, so the debt section ` +
      'cannot be told apart from the permanent exclusions and this ratchet checks nothing.'
  );
  const patterns = (block) =>
    block
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'));
  return { permanent: patterns(text.slice(0, marker)), debt: patterns(text.slice(marker)) };
}

test('every file the frozen legacy argv named is still where it named it', () => {
  assert.equal(LEGACY_GATE_FILES.length, LEGACY_GATE_FILE_COUNT);

  // A SUBSET CHECK, NOT AN EQUALITY ONE, and the asymmetry is the whole point.
  const selectable = new Set(deriveLegacyGateFiles(LEGACY_LINT_ARGV));
  const gone = LEGACY_GATE_FILES.filter((file) => !selectable.has(file));
  assert.deepEqual(
    gone,
    [],
    'the frozen `lint` argv no longer selects these files. Each was deleted, renamed, or moved ' +
      'out of the directories that argv named — remove its entry from tests/legacy-lint-gate.txt ' +
      'and lower LEGACY_GATE_FILE_COUNT, in the same commit that moved the file. Do NOT re-derive ' +
      'the fixture from the current configuration: that would assert only that the new gate ' +
      'covers what the new gate covers.'
  );

  // And the expansion must be alive. An expander that returned nothing would make the subset
  // check above pass for every possible fixture.
  assert.ok(
    selectable.size >= LEGACY_GATE_FILE_COUNT,
    `the frozen argv expanded to ${selectable.size} file(s), fewer than the ${LEGACY_GATE_FILE_COUNT} ` +
      'it selected when it was frozen. It cannot have shrunk below the committed list without ' +
      'the check above firing, so the expander itself has stopped working.'
  );
});

// Named sentinels from each group the old gate covered, so an emptied or truncated fixture cannot
// pass the assertions above by describing a smaller gate than the one that existed.
test('the frozen fixture still describes the whole of the old gate', () => {
  for (const sentinel of [
    'src/systems/CraftingEngine.js',
    'src/toolBreakageRuntime.js',
    'src/migration/MigrationRunner.js',
    'scripts/lib/semver.js',
    'scripts/visual-parity/extract.mjs',
  ]) {
    assert.ok(
      LEGACY_GATE_FILES.includes(sentinel),
      `${sentinel} was covered by the old enumerated gate and is missing from the fixture`
    );
  }
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

test('the config still SELECTS .svelte, which is not selected by default', async () => {
  // `isPathIgnored` answers "is this path excluded", which is NOT the question `eslint .` asks.
  // `.js`, `.mjs` and `.cjs` are selected with NO `files` pattern naming them.
  const componentDirectory = 'src/ui/svelte/apps/gathering';
  const results = await new ESLint().lintFiles([componentDirectory]);
  const components = results.filter((result) => result.filePath.endsWith('.svelte'));
  assert.ok(
    components.length > 0,
    `expanding ${componentDirectory}/ the way \`eslint .\` does yielded no .svelte file, so no ` +
      '`files` pattern selects that extension any more. Components are not ignored — they are ' +
      'never visited, which no ignore or armed-rule check here can see.'
  );

  // And the probe directory must still hold components, or the assertion above is measuring an
  // empty tree rather than the config.
  assert.ok(
    readdirSync(path.join(REPOSITORY_ROOT, componentDirectory)).some((entry) =>
      entry.endsWith('.svelte')
    ),
    `${componentDirectory}/ holds no components any more; point this probe at a directory that does`
  );
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
  const known = new Set();
  const { builtinRules } = await import('eslint/use-at-your-own-risk');
  for (const name of builtinRules.keys()) known.add(name);
  // `src/systems/CraftingEngine.js` was this seed until issue 1677 armed `no-restricted-globals` on
  // the domain layer and gave that file a debt entry for its 44 bare `game` reads.
  const clean = 'src/systems/GatheringEngine.js';
  assert.equal(
    Object.values(ESLINT_DEBT).some((group) => clean in group),
    false,
    `${clean} now carries a debt entry, so seeding from it would let a typo certify itself`
  );
  const config = await new ESLint().calculateConfigForFile(clean);
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
  const entries = prettierIgnoreSections().debt;
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
  // is how "only shrinks" stops being true.
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

test('the permanent Prettier exclusions are pinned, so a new one is a visible edit', () => {
  // The debt section below the marker is counted, staleness-checked and pinned. The superset
  // assertion does not catch it either.
  assert.deepEqual(prettierIgnoreSections().permanent, [
    'dist/',
    'node_modules/',
    'coverage/',
    'docs/_site/',
    'docs/vendor/',
    'docs/.jekyll-cache/',
    'package-lock.json',
    '**/*.min.js',
    '**/*.min.css',
    '*.md',
    '.github/',
    'openspec/',
    'docs/',
    'benchmarks/baselines/',
    'styles/fabricate.css',
  ]);
});

test('ESLint ignores every tree git ignores', async () => {
  // The global `ignores` in `eslint.config.js` mirror `.gitignore` by hand, because ESLint's
  // patterns and gitignore's are not the same language and a hand-rolled reader for the second
  // would be a subtly wrong second implementation of it.
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
  // `block.ignores && Object.keys(block).length === 1` would miss `{ name, ignores }`, which
  // ESLint also treats as a global ignore — so a named block could park a whole tree outside the
  // gate while the pin below still saw exactly one ignores block and passed.
  const globalIgnores = config.filter(
    (block) => block.ignores && !block.files && !block.rules && !block.languageOptions
  );
  assert.equal(globalIgnores.length, 1, 'there should be exactly one global-ignores block');
  assert.deepEqual(globalIgnores[0].ignores, [
    'dist/',
    'build/',
    'node_modules/',
    'docs/',
    'coverage/',
    '.worktrees/',
    '.claude/worktrees/',
    '.foundry-e2e/',
    '.foundry-chrome/',
    '.foundry-perf/',
    '.benchmarks/',
    'test-results/',
    'tmp/',
    'ui-screenshot-artifact/',
    'content-packs/',
    '.air/',
    '**/*.min.js',
    'package-lock.json',
  ]);
});

test('tests/helpers/ still holds no suite, which seventeen files reason from', () => {
  // THE OLD GLOB EXCLUDED `tests/helpers/` BY CONSTRUCTION. `npm test` named the top-level
  // `tests/*.test.js` plus a fixed set of subdirectories, and `helpers` was not among them.
  const suites = readdirSync(path.join(REPOSITORY_ROOT, 'tests/helpers'), { recursive: true })
    .map((entry) => String(entry).split(String.fromCodePoint(92)).join('/'))
    .filter((entry) => entry.endsWith('.test.js'));
  assert.deepEqual(
    suites,
    [],
    'a suite under tests/helpers/ is collected by `npm test` now that the glob is recursive, and ' +
      'about seventeen files state that it cannot be. Name it `*.test.js` under tests/ proper, ' +
      'or drop the `.test` from the filename.'
  );
});

test('the staleness ratchet is actually wired into CI', () => {
  // `npm run lint:debt` is the ONLY thing that enforces "the baseline only shrinks" — this file
  // deliberately holds the cheap half and not that one.
  const workflow = readFileSync(path.join(REPOSITORY_ROOT, '.github/workflows/ci.yml'), 'utf8');
  assert.match(
    workflow,
    /^\s*lint-debt:$/mu,
    'ci.yml no longer defines the `lint-debt` job, so nothing checks the baseline for stale entries'
  );
  assert.match(
    workflow,
    /run: npm run lint:debt$/mu,
    'ci.yml no longer invokes `npm run lint:debt`, so the baseline can grow stale unnoticed'
  );
});

test('the npm scripts are globs, and short enough to read', () => {
  const { scripts } = JSON.parse(readFileSync(path.join(REPOSITORY_ROOT, 'package.json'), 'utf8'));
  // Issue #1660's acceptance criterion.
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
