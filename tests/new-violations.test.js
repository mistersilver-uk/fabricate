/**
 * `npm run lint` and `npm run format:check` compare with the base commit
 * (`scripts/lib/newViolations.js`), proved here against a temporary git repository.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import unicorn from 'eslint-plugin-unicorn';

import {
  compareFileFindings,
  formatAgainstBase,
  lintAgainstBase,
  reportGate,
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
  const write = (entries) => {
    for (const [file, text] of Object.entries(entries)) {
      writeFileSync(path.join(repo.dir, file), text);
    }
  };
  write(files);
  repo.git('add', '-A');
  const base = repo.commit('base');
  const env = { RATCHET_BASE: base };
  const lint = (options = {}) =>
    lintAgainstBase({
      cwd: repo.dir,
      env,
      eslintOptions: { overrideConfigFile: true, overrideConfig: CONFIG },
      ...options,
    });
  const format = () => formatAgainstBase({ cwd: repo.dir, env });
  return { ...repo, base, write, lint, format };
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
