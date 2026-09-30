/**
 * WHAT `npm run lint` AND `npm run format:check` REACH (issue 1660). Both cover the repository;
 * `scripts/lib/newViolations.js` compares each with the base commit and is proved by
 * `tests/new-violations.test.js`.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';

import { ABSOLUTE_RULES } from '../scripts/lib/newViolations.js';

const REPOSITORY_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Whether an ESLint rule entry is switched on. */
const armed = (entry) => Array.isArray(entry) && entry[0] !== 0 && entry[0] !== 'off';

/** `.prettierignore`'s patterns, comments and blank lines dropped. */
function prettierIgnorePatterns() {
  return readFileSync(path.join(REPOSITORY_ROOT, '.prettierignore'), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

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

test('no-undef is armed in every part of the tree, and fails at any count', async () => {
  // One file from each part that used to carry per-file debt, which switched rules off per file.
  const eslint = new ESLint();
  const unarmed = [];
  for (const file of [
    'eslint.config.js',
    'examples/macros/01-list-recipes.js',
    'scripts/release.js',
    'src/main.js',
    'src/systems/CraftingEngine.js',
    'src/ui/svelte/stores/adminStore.js',
    'tests/lint-coverage.test.js',
  ]) {
    const config = await eslint.calculateConfigForFile(file);
    if (!armed(config.rules['no-undef'])) unarmed.push(file);
  }
  assert.deepEqual(unarmed, [], 'file coverage is not rule coverage: `no-undef` is off here');
  assert.ok(
    ABSOLUTE_RULES.includes('no-undef'),
    'a `no-undef` report is a ReferenceError the moment its function runs (issue 1370), so the ' +
      'lint gate fails it whatever the base count'
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

test('the Prettier exclusions are pinned, so a new one is a visible edit', () => {
  // Formatting debt needs no entry here: `npm run format:check` holds an unformatted file as it
  // was at base, so every line of `.prettierignore` is a format Prettier must not own.
  assert.deepEqual(prettierIgnorePatterns(), [
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
    .filter((line) => line.endsWith('/') || line === 'node_modules')
    .map((line) => line.endsWith('/') ? line : `${line}/`);

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

test('the lint job runs both gates against a base, and no debt job is left', () => {
  const workflow = readFileSync(path.join(REPOSITORY_ROOT, '.github/workflows/ci.yml'), 'utf8');
  const start = workflow.indexOf('\n  lint:\n');
  const end = workflow.indexOf('\n  validate-bindings:');
  assert.ok(start !== -1 && end > start, 'could not locate the lint job in ci.yml');
  const job = workflow.slice(start, end);
  for (const gate of ['lint', 'format:check']) {
    const step = new RegExp(String.raw`^\s*run: npm run ${gate}$`, 'mu');
    assert.match(job, step, `the lint job runs ${gate}`);
  }
  assert.match(job, /^\s*RATCHET_BASE:/mu, 'without a base both gates would fail closed in CI');
  assert.doesNotMatch(workflow, /lint[-:]debt/u, 'the debt list and its job are gone');
});

test('the npm scripts cover the repository, and are short enough to read', () => {
  const { scripts } = JSON.parse(readFileSync(path.join(REPOSITORY_ROOT, 'package.json'), 'utf8'));
  // Issue #1660's acceptance criterion.
  for (const key of ['lint', 'format', 'format:check', 'lint:svelte', 'test']) {
    assert.ok(
      scripts[key].length < 80,
      `the \`${key}\` script is ${scripts[key].length} characters; the point of issue #1660 is ` +
        'that it stops enumerating files.'
    );
  }
  assert.equal(scripts.lint, 'node scripts/lint.mjs');
  assert.equal(scripts['format:check'], 'node scripts/format-check.mjs');
  assert.deepEqual(
    Object.keys(scripts).filter((key) => key.includes('debt')),
    [],
    'the base comparison replaced the debt list'
  );
  assert.ok(
    scripts.test.includes('"tests/**/*.test.js"'),
    'the `test` script must use one recursive glob so a new tests/ subdirectory runs without a ' +
      'package.json edit. Keep it QUOTED: unquoted, bash without globstar expands `**` as a ' +
      'single `*` and the nested suites stop running silently.'
  );
  assert.equal(scripts['lint:all'], undefined, '`lint:all` was `eslint .`, which `lint` covers.');
});
