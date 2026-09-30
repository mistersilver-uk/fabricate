/**
 * `npm run lint` and `npm run format:check` compare with the base commit
 * (`scripts/lib/newViolations.js`), proved here against a temporary git repository.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { createNodeResolver, importX } from 'eslint-plugin-import-x';
import unicorn from 'eslint-plugin-unicorn';

import {
  compareFileFindings,
  formatAgainstBase,
  lintAgainstBase,
  reportGate,
  runFormatCli,
  runLintCli,
} from '../scripts/lib/newViolations.js';

import { createTempGitRepo } from './helpers/temp-git-repo.js';

const CONFIG = [
  {
    files: ['**/*.js'],
    plugins: { unicorn },
    languageOptions: { ecmaVersion: 2025, sourceType: 'module' },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      'no-undef': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      'prefer-const': 'error',
      'unicorn/no-for-each': 'error',
    },
  },
];

const EACH = 'export function each(list) {\n  list.forEach((item) => item);\n}\n';
const TWICE = `${EACH}export function again(list) {\n  list.forEach((item) => item);\n}\n`;
const CLEAN = 'export const a = 1;\n';

/** A repository whose first commit holds `files`, and helpers to edit and gate its tree. */
function fixture(files) {
  const repo = createTempGitRepo('fab-new-violations-');
  repo.write(files);
  const base = repo.commitAll('base');
  const env = { RATCHET_BASE: base };
  const lint = (options = {}) =>
    lintAgainstBase({
      cwd: repo.dir,
      env,
      eslintOptions: { overrideConfigFile: true, overrideConfig: CONFIG },
      ...options,
    });
  const format = () => formatAgainstBase({ cwd: repo.dir, env });
  return { ...repo, base, lint, format };
}

async function withFixture(files, run) {
  const repo = fixture(files);
  try {
    return await run(repo);
  } finally {
    repo.dispose();
  }
}

test('a brand-new rule hit in a clean file fails, naming the rule and its base count', () =>
  withFixture({ 'clean.js': CLEAN }, async (repo) => {
    repo.write({ 'clean.js': `${CLEAN}var b = 2;\nexport { b };\n` });
    const outcome = await repo.lint();
    assert.equal(outcome.base, repo.base, 'the gate compared with the named base');
    assert.deepEqual(outcome.failures, ['clean.js: no-var rose from 0 to 1 (line 2)']);
  }));

test('a debted rule getting worse fails, while untouched debt is held at its count', () =>
  withFixture({ 'debted.js': EACH, 'untouched.js': EACH }, async (repo) => {
    repo.write({ 'debted.js': TWICE });
    const outcome = await repo.lint();
    assert.deepEqual(outcome.failures, [
      'debted.js: unicorn/no-for-each rose from 1 to 2 (line 2, 5)',
    ]);
    assert.equal(outcome.findings, 3, 'both files still report, and only the worse one fails');
  }));

test('the same or fewer findings pass, and a fall is reported', () =>
  withFixture({ 'debted.js': TWICE }, async (repo) => {
    repo.write({ 'debted.js': `// reworded\n${EACH}` });
    const outcome = await repo.lint();
    assert.deepEqual(outcome.failures, []);
    assert.deepEqual(outcome.shrank, ['debted.js: unicorn/no-for-each fell from 2 to 1']);
  }));

test('a new file fails on any finding, and a renamed one is compared with its base path', () =>
  withFixture({ 'debted.js': EACH }, async (repo) => {
    repo.git('mv', 'debted.js', 'moved.js');
    repo.write({ 'fresh.js': EACH });
    const outcome = await repo.lint();
    assert.deepEqual(outcome.failures, ['fresh.js: unicorn/no-for-each rose from 0 to 1 (line 2)']);
  }));

test('no-undef and a parse error fail at any count, in an untouched file too', () =>
  withFixture({ 'undef.js': 'export const a = missing;\n', 'clean.js': CLEAN }, async (repo) => {
    repo.write({ 'clean.js': 'export const = ;\n' });
    const failures = (await repo.lint()).failures;
    assert.equal(failures.length, 2, failures.join('\n'));
    assert.match(failures[0], /^clean\.js:1:\d+ parse-error \(fails at any count\)/u);
    assert.match(failures[1], /^undef\.js:1:18 no-undef \(fails at any count\)/u);
  }));

test('a reasoned marker at the finding exempts it, and an empty one fails', () =>
  withFixture({ 'debted.js': EACH }, async (repo) => {
    const marked = (reason) =>
      `${EACH}export function again(list) {\n  // ratchet-exempt(lint):${reason}\n` +
      '  list.forEach((item) => item);\n}\n';
    repo.write({ 'debted.js': marked(' the fixture needs a second loop') });
    const exempt = await repo.lint();
    assert.deepEqual(exempt.failures, []);
    assert.deepEqual(exempt.exempted, [
      'debted.js:6 unicorn/no-for-each: the fixture needs a second loop',
    ]);

    repo.write({ 'debted.js': marked('') });
    const failures = (await repo.lint()).failures;
    assert.equal(failures.length, 2, failures.join('\n'));
    assert.match(failures[0], /rose from 1 to 2/u);
    assert.match(failures[1], /^debted\.js:5 has a ratchet-exempt\(lint\) marker with no reason/u);
  }));

test('a marker on a finding already at base buys no room for a new unmarked one', () =>
  withFixture({ 'debted.js': EACH }, async (repo) => {
    const again = 'export function again(list) {\n  list.forEach((entry) => entry);\n}\n';
    const markedOld = EACH.replace(
      '  list',
      '  // ratchet-exempt(lint): marked the old one\n  list'
    );
    repo.write({ 'debted.js': `${markedOld}${again}` });
    const outcome = await repo.lint();
    assert.deepEqual(outcome.failures, [
      'debted.js: unicorn/no-for-each rose from 1 to 2 (line 3, 6)',
    ]);
    assert.deepEqual(outcome.exempted, []);
  }));

test('a marker already excusing a base finding keeps excusing it, and no other', () => {
  const markedOld = EACH.replace('  list', '  // ratchet-exempt(lint): marked at base\n  list');
  return withFixture({ 'debted.js': markedOld }, async (repo) => {
    repo.write({
      'debted.js': `${markedOld}export function again(list) {\n  list.forEach((entry) => entry);\n}\n`,
    });
    assert.deepEqual((await repo.lint()).failures, [
      'debted.js: unicorn/no-for-each rose from 0 to 1 (line 6)',
    ]);
  });
});

test('the gate compares once a file changes, and skips only when the base is opted out', () =>
  withFixture({ 'undef.js': 'export const a = missing;\n', 'debted.js': EACH }, async (repo) => {
    repo.write({ 'debted.js': TWICE });
    const compared = await repo.lint();
    assert.equal(compared.skipped, undefined);
    assert.equal(compared.failures.length, 2, 'a comparison, not a skip');

    const skipped = await repo.lint({ env: { RATCHET_BASE: 'none' } });
    assert.equal(skipped.skipped, 'opted-out');
    assert.deepEqual(
      skipped.failures,
      [compared.failures.find((line) => line.includes('no-undef'))],
      'without a base only the rules that fail at any count still fail'
    );
    await assert.rejects(() => repo.lint({ patterns: ['nothing-here'] }), /No files matching/u);
  }));

test('a new unused disable directive fails against a base that had none', () =>
  withFixture(
    { 'used.js': '// eslint-disable-next-line no-var\nvar a = 1;\nexport { a };\n' },
    async (repo) => {
      const unused = '// eslint-disable-next-line no-var\nexport const b = 2;\n';
      repo.write({
        'used.js': `// eslint-disable-next-line no-var\nvar a = 1;\nexport { a };\n${unused}`,
      });
      assert.deepEqual((await repo.lint()).failures, [
        'used.js: unused-disable-directive rose from 0 to 1 (line 4)',
      ]);
    }
  ));

test('a directive already unused at base is not reported as new', () =>
  withFixture(
    { 'stale.js': '// eslint-disable-next-line no-var\nexport const a = 1;\n' },
    async (repo) => {
      repo.write({
        'stale.js': '// reworded\n// eslint-disable-next-line no-var\nexport const a = 1;\n',
      });
      assert.deepEqual((await repo.lint()).failures, []);
    }
  ));

test('--fix removes a new unused disable directive', () =>
  withFixture({ 'fresh.js': CLEAN }, async (repo) => {
    repo.write({ 'fresh.js': `// eslint-disable-next-line no-var\n${CLEAN}` });
    assert.deepEqual((await repo.lint({ fix: true })).failures, []);
    assert.doesNotMatch(readFileSync(path.join(repo.dir, 'fresh.js'), 'utf8'), /eslint-disable/u);
  }));

test('--fix applies the fixes of the regressed rule only, leaving untouched debt alone', () =>
  withFixture({ 'fix.js': 'let kept = 1;\nexport { kept };\n' }, async (repo) => {
    repo.write({
      'fix.js': 'let kept = 1;\nconst x = 2;\nexport const o = { x: x };\nexport { kept };\n',
    });
    const outcome = await repo.lint({ fix: true });
    assert.deepEqual(outcome.failures, []);
    assert.equal(
      readFileSync(path.join(repo.dir, 'fix.js'), 'utf8'),
      'let kept = 1;\nconst x = 2;\nexport const o = { x };\nexport { kept };\n',
      'object-shorthand was fixed and the prefer-const debt was not'
    );
  }));

test('a file formatted at base, or new, must stay formatted; format debt is held', () =>
  withFixture(
    { 'clean.js': CLEAN, 'messy.js': 'export const a   =  1\n', 'held.js': 'let  b\n' },
    async (repo) => {
      repo.write({ 'messy.js': 'export const a   =  2\n' });
      assert.deepEqual((await repo.format()).failures, [], 'unformatted at base, and still debt');

      repo.write({ 'clean.js': 'export const a   =  1\n', 'fresh.js': 'export const c   =  3\n' });
      const outcome = await repo.format();
      assert.deepEqual(outcome.offenders, ['clean.js', 'fresh.js']);
      assert.deepEqual(outcome.failures, [
        'clean.js was Prettier-formatted at base and is not any more',
        'fresh.js is new and not Prettier-formatted',
      ]);
      assert.equal(outcome.unformatted, 4, 'the untouched and the changed debt are both listed');
    }
  ));

test('a per-file comparison counts per rule, not per file', () => {
  const at = (ruleId, line) => ({ ruleId, line, column: 1, message: ruleId, severity: 2 });
  const outcome = compareFileFindings({
    file: 'x.js',
    text: '\n'.repeat(3),
    headMessages: [at('no-var', 1), at('prefer-const', 2)],
    baseMessages: [at('no-var', 1), at('no-var', 3)],
  });
  assert.deepEqual(outcome.failures, ['x.js: prefer-const rose from 0 to 1 (line 2)']);
  assert.deepEqual(outcome.shrank, ['x.js: no-var fell from 2 to 1']);
});

test('the report returns the exit code and says how to exempt or refresh the base', () => {
  const lines = [];
  const record = (line) => {
    lines.push(line);
  };
  const sink = { log: record, error: record };
  const passing = { base: 'a'.repeat(40), failures: [], shrank: ['x fell'], exempted: [] };
  assert.equal(reportGate('lint', passing, sink), 0);
  assert.equal(reportGate('lint', { ...passing, failures: ['x rose'] }, sink), 1);
  assert.match(lines.at(-1), /ratchet-exempt\(lint\): <reason>/u);
  assert.match(lines.at(-1), /git fetch origin main/u);
});

test('a path a change deleted is dropped beside one that exists, and only-missing paths still throw', () =>
  withFixture({ 'debted.js': EACH, 'kept.js': CLEAN, 'glob.js': CLEAN }, async (repo) => {
    repo.git('mv', 'debted.js', 'moved.js');
    const outcome = await repo.lint({ patterns: ['debted.js', 'kept.js'] });
    assert.deepEqual(outcome.failures, []);
    assert.equal(outcome.linted, 1, 'only the path that still exists is linted');
    await assert.rejects(() => repo.lint({ patterns: ['debted.js'] }), /No files matching/u);
    const globbed = await repo.lint({ patterns: ['kept.js', 'g*.js'] });
    assert.equal(globbed.linted, 2, 'a glob beside a real path is kept');
  }));

test('a base that does not resolve fails before anything is linted', () =>
  withFixture({ 'clean.js': CLEAN }, async (repo) => {
    await assert.rejects(
      () => repo.lint({ env: { RATCHET_BASE: 'no-such-ref' }, patterns: ['nothing-here'] }),
      /RATCHET_BASE=no-such-ref does not resolve/u
    );
  }));

const IMPORT_CONFIG = [
  {
    files: ['**/*.js'],
    plugins: { 'import-x': importX },
    settings: { 'import-x/resolver-next': [createNodeResolver()] },
    languageOptions: { ecmaVersion: 2025, sourceType: 'module' },
    rules: { 'import-x/named': 'error' },
  },
];

test('renaming an export fails the unchanged file importing it, at any count', () =>
  withFixture(
    {
      'a.js': 'export const alpha = 1;\n',
      'b.js': "import { alpha } from './a.js';\nexport const b = alpha;\n",
    },
    async (repo) => {
      repo.write({ 'a.js': 'export const gamma = 1;\n' });
      const outcome = await repo.lint({
        eslintOptions: { overrideConfigFile: true, overrideConfig: IMPORT_CONFIG },
      });
      assert.equal(outcome.failures.length, 1, outcome.failures.join('\n'));
      assert.match(outcome.failures[0], /^b\.js:1:\d+ import-x\/named \(fails at any count\)/u);
    }
  ));

/** A repository whose own `eslint.config.js` the CLI reads, and a sink for what it prints. */
function cliFixture(files) {
  const config =
    "export default [{ files: ['**/*.js'], rules: { 'no-var': 'error', 'object-shorthand': 'error' } }];\n";
  const repo = fixture({ 'eslint.config.mjs': config, ...files });
  const printed = [];
  const io = {
    cwd: repo.dir,
    env: { RATCHET_BASE: repo.base },
    log: (line) => {
      printed.push(line);
    },
    error: (line) => {
      printed.push(line);
    },
  };
  return { repo, printed, io };
}

test('the lint CLI returns its exit code, applies --fix and rejects an unknown option', async () => {
  const { repo, printed, io } = cliFixture({ 'a.js': CLEAN });
  try {
    assert.equal(await runLintCli(['a.js'], io), 0);
    assert.match(printed.join('\n'), /held at their base counts/u, 'a pass says what was held');
    repo.write({ 'a.js': `${CLEAN}var b = 2;\nexport { b };\n` });
    printed.length = 0;
    assert.equal(await runLintCli([], io), 1);
    assert.doesNotMatch(printed.join('\n'), /held at their base counts/u, 'only a pass says so');
    repo.write({ 'a.js': `${CLEAN}const x = 2;\nexport const o = { x: x };\n` });
    assert.equal(await runLintCli(['--fix'], io), 0);
    assert.match(readFileSync(path.join(repo.dir, 'a.js'), 'utf8'), /\{ x \}/u, '--fix reached');
    assert.equal(await runLintCli(['--bogus'], io), 2);
    printed.length = 0;
    assert.equal(await runLintCli([], { ...io, env: { RATCHET_BASE: 'none' } }), 0);
    assert.doesNotMatch(
      printed.join('\n'),
      /held at their base counts/u,
      'a skip compared nothing'
    );
  } finally {
    repo.dispose();
  }
});

test('the format CLI returns its exit code, writes only what regressed and rejects an unknown option', async () => {
  const { repo, printed, io } = cliFixture({ 'a.js': CLEAN, 'held.js': 'let  b\n' });
  try {
    assert.equal(await runFormatCli([], io), 0);
    assert.match(printed.join('\n'), /held as they were at base/u);
    repo.write({ 'fresh.js': 'export const c   =  3\n' });
    printed.length = 0;
    assert.equal(await runFormatCli([], io), 1);
    assert.doesNotMatch(printed.join('\n'), /held as they were at base/u);
    assert.equal(await runFormatCli(['--write'], io), 0);
    assert.equal(readFileSync(path.join(repo.dir, 'fresh.js'), 'utf8'), 'export const c = 3;\n');
    assert.equal(readFileSync(path.join(repo.dir, 'held.js'), 'utf8'), 'let  b\n');
    assert.equal(await runFormatCli(['--check'], io), 2);
  } finally {
    repo.dispose();
  }
});
