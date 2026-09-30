/**
 * Proves the merge-base ratchet engine (`tests/helpers/mergeBaseRatchet.js`) against throwaway git
 * repositories.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';

import { resolveExecutable } from '../scripts/lib/resolveExecutable.js';

import { byCodePoint } from './helpers/codePointOrder.js';
import {
  basePathOf,
  changedPaths,
  compareToBase,
  headMarker,
  parseMarkers,
  readBaseCorpus,
  readBaseFiles,
  reportComparison,
  resolveRatchetBase,
} from './helpers/mergeBaseRatchet.js';
import { createTempGitRepo, envWithoutGitLocation } from './helpers/temp-git-repo.js';

const GIT = resolveExecutable('git');
const LOCAL = Object.freeze({});
const repos = [];
after(() => {
  for (const repo of repos) repo.dispose();
});

/** A repository on `main` whose first commit holds `files`, with helpers to edit and commit. */
function repoWith(files) {
  const repo = createTempGitRepo('merge-base-ratchet-');
  repos.push(repo);
  repo.git('checkout', '-q', '-b', 'main');
  repo.write(files);
  const first = repo.commitAll('first');
  return { ...repo, first, remove: (file) => unlinkSync(join(repo.dir, file)) };
}

/** `git clone` into a fresh directory, returning its path; `file://` makes `--depth` apply. */
function cloneOf(repo, ...args) {
  const target = mkdtempSync(join(tmpdir(), 'merge-base-ratchet-clone-'));
  repos.push({ dispose: () => rmSync(target, { recursive: true, force: true }) });
  execFileSync(GIT, ['clone', '-q', ...args, `file://${repo.dir}`, target], {
    env: envWithoutGitLocation(),
  });
  return target;
}

const lines = (...rows) => `${rows.join('\n')}\n`;

/** Ten distinct lines, so a rename's similarity is set by how many of them change. */
const TEN = Array.from({ length: 10 }, (_, index) => `line ${index} of a file long enough to diff`);

/**
 * A toy family over `corpus/**`: every `<unit> <value> [<size>]` line is an entry with id
 * `<unit> <value>`, amount `<size>` (default 1), netting on `<value>`.
 */
function toyMeasure(readFile, listFiles) {
  return listFiles().flatMap((file) =>
    readFile(file)
      .split('\n')
      .map((text, index) => ({ match: /^(\w+) (\w+)(?: (\d+))?/u.exec(text), line: index + 1 }))
      .filter(({ match }) => match)
      .map(({ match, line }) => ({
        file,
        id: `${match[1]} ${match[2]}`,
        value: match[2],
        amount: match[3] === undefined ? 1 : Number(match[3]),
        lines: [line],
      }))
  );
}

const compareToy = (repo, overrides = {}) =>
  compareToBase({
    family: 'toy',
    corpusRoot: 'corpus',
    measure: toyMeasure,
    cwd: repo.dir,
    env: { RATCHET_BASE: repo.first },
    ...overrides,
  });

test('RATCHET_BASE names the base, and an unresolvable one fails closed', () => {
  const repo = repoWith({ 'a.txt': 'a\n' });
  const second = repo.commit('second');
  const named = resolveRatchetBase({ cwd: repo.dir, env: { RATCHET_BASE: 'HEAD^1' } });
  assert.deepEqual(named, {
    sha: repo.first,
    head: second,
    source: 'RATCHET_BASE',
    equalsHead: false,
  });
  for (const ref of ['0000000', 'no-such-branch']) {
    assert.throws(() => resolveRatchetBase({ cwd: repo.dir, env: { RATCHET_BASE: ref } }), {
      message: new RegExp(
        String.raw`RATCHET_BASE=${ref} does not resolve[\s\S]*fails rather than passing`
      ),
    });
  }
});

test('RATCHET_BASE=none opts out, in CI too, and the gate reports a skip rather than a pass', () => {
  const repo = repoWith({ 'corpus/a.js': 'alpha x\n' });
  const env = { RATCHET_BASE: 'none', CI: 'true' };
  assert.equal(resolveRatchetBase({ cwd: repo.dir, env }).skipped, 'opted-out');
  const result = compareToy(repo, { env });
  assert.deepEqual(Object.keys(result).sort(byCodePoint), [
    'changedCount',
    'corpusRoot',
    'reason',
    'skipped',
  ]);
  assert.equal(result.skipped, 'opted-out');
  assert.equal(result.corpusRoot, 'corpus');
});

test('with no RATCHET_BASE the base is the merge base with origin/main, from a detached HEAD too', () => {
  const repo = repoWith({ 'a.txt': 'a\n' });
  const forked = repo.commit('main moves on');
  repo.git('update-ref', 'refs/remotes/origin/main', forked);
  repo.git('checkout', '-q', '--detach', repo.first);
  const ahead = repo.commit('detached work');
  assert.deepEqual(resolveRatchetBase({ cwd: repo.dir, env: LOCAL }), {
    sha: repo.first,
    head: ahead,
    source: 'merge-base',
    equalsHead: false,
  });
});

test('no base skips locally with the fix named, and fails closed in CI', () => {
  const repo = repoWith({ 'a.txt': 'a\n' });
  const local = resolveRatchetBase({ cwd: repo.dir, env: LOCAL });
  assert.equal(local.skipped, 'no-base');
  assert.match(
    local.reason,
    /origin\/main does not resolve[\s\S]*git fetch origin main[\s\S]*RATCHET_BASE/
  );
  for (const env of [{ CI: 'true' }, { GITHUB_ACTIONS: 'true' }]) {
    assert.throws(() => resolveRatchetBase({ cwd: repo.dir, env }), {
      message: /never skips a ratchet[\s\S]*RATCHET_BASE=none/,
    });
    assert.throws(() => compareToy(repo, { env }), { message: /never skips a ratchet/ });
  }
  assert.equal(resolveRatchetBase({ cwd: repo.dir, env: { CI: 'false' } }).skipped, 'no-base');
});

test('a merge base that is HEAD itself fails closed in CI and compares the working tree locally', () => {
  const repo = repoWith({ 'a.txt': 'a\n' });
  repo.git('update-ref', 'refs/remotes/origin/main', repo.first);
  assert.throws(() => resolveRatchetBase({ cwd: repo.dir, env: { CI: 'true' } }), {
    message: /merge base with origin\/main is HEAD itself[\s\S]*RATCHET_BASE=none/,
  });
  assert.deepEqual(resolveRatchetBase({ cwd: repo.dir, env: LOCAL }), {
    sha: repo.first,
    head: repo.first,
    source: 'merge-base',
    equalsHead: true,
  });
});

test('a git error after the base resolves throws instead of reading as no change', () => {
  const repo = repoWith({ 'a.txt': 'a\n' });
  assert.throws(() => changedPaths('f'.repeat(40), { cwd: repo.dir }), {
    message: /git diff .* failed/,
  });
});

test('the working tree is compared: a dirty file, a staged one and an untracked one', () => {
  const repo = repoWith({ 'a.txt': 'a\n', 'b.txt': 'b\n', '.gitignore': 'ignored.txt\n' });
  repo.write({
    'a.txt': 'dirty\n',
    'c.txt': 'staged\n',
    'd.txt': 'untracked\n',
    'ignored.txt': 'x',
  });
  repo.git('add', 'c.txt');
  repo.remove('b.txt');
  const changes = changedPaths(repo.first, { cwd: repo.dir });
  assert.deepEqual(changes.changed, ['a.txt', 'c.txt', 'd.txt']);
  assert.deepEqual(changes.added, ['c.txt', 'd.txt']);
  assert.deepEqual(changes.removed, ['b.txt']);
  assert.equal(basePathOf(changes, 'a.txt'), 'a.txt');
  assert.equal(basePathOf(changes, 'd.txt'), null);
});

test('base equal to HEAD compares the working tree with HEAD', () => {
  const repo = repoWith({ 'corpus/a.js': 'alpha x\n' });
  const env = { RATCHET_BASE: 'HEAD' };
  assert.equal(resolveRatchetBase({ cwd: repo.dir, env }).equalsHead, true);
  const clean = compareToy(repo, { env });
  assert.equal(clean.skipped, 'corpus-unchanged');
  assert.equal(clean.changedCount, 0);
  repo.write({ 'corpus/a.js': 'alpha x\nbeta y\n' });
  const dirty = compareToy(repo, { env });
  assert.equal(dirty.compared, true);
  assert.deepEqual(dirty.failures, ['corpus/a.js: beta y is new (1)']);
});

test('a rename is detected at 40% similarity, rewritten or not, and not below it', () => {
  const tenOf = (name) => TEN.map((text) => `${name} ${text}`);
  const names = ['kept', 'edited', 'gone'];
  const repo = repoWith(
    Object.fromEntries(names.map((name) => [`${name}.txt`, lines(...tenOf(name))]))
  );
  for (const name of names) repo.git('mv', `${name}.txt`, `${name}-renamed.txt`);
  const rewrite = (name, count) =>
    lines(...tenOf(name).map((text, index) => (index < count ? `rewritten ${index}` : text)));
  repo.write({
    'edited-renamed.txt': rewrite('edited', 3),
    'gone-renamed.txt': rewrite('gone', 8),
  });
  const changes = changedPaths(repo.first, { cwd: repo.dir });
  assert.deepEqual(
    [...changes.renames].sort(([left], [right]) => byCodePoint(left, right)),
    [
      ['edited-renamed.txt', 'edited.txt'],
      ['kept-renamed.txt', 'kept.txt'],
    ]
  );
  assert.deepEqual(changes.added, ['gone-renamed.txt']);
  assert.deepEqual(changes.removed, ['gone.txt']);
});

test('a merge ref in a depth-2 clone compares HEAD^1 with the branch and HEAD^2 with main', () => {
  const repo = repoWith({ 'main.txt': 'm\n', 'branch.txt': 'b\n' });
  repo.git('checkout', '-q', '-b', 'feature');
  repo.write({ 'branch.txt': 'feature\n' });
  const feature = repo.commitAll('feature work');
  repo.git('checkout', '-q', 'main');
  repo.write({ 'main.txt': 'moved\n' });
  const main = repo.commitAll('main work');
  repo.git('merge', '-q', '--no-ff', '--no-edit', 'feature');
  const clone = cloneOf(repo, '--depth=2');
  const git = (...args) => execFileSync(GIT, ['-C', clone, ...args], { encoding: 'utf8' }).trim();
  assert.equal(git('rev-parse', '--is-shallow-repository'), 'true');
  assert.equal(git('rev-parse', 'HEAD^1'), main);
  assert.equal(git('rev-parse', 'HEAD^2'), feature);
  for (const [ref, sha, changed] of [
    ['HEAD^1', main, ['branch.txt']],
    ['HEAD^2', feature, ['main.txt']],
  ]) {
    const base = resolveRatchetBase({ cwd: clone, env: { RATCHET_BASE: ref, CI: 'true' } });
    assert.equal(base.sha, sha);
    assert.deepEqual(changedPaths(base, { cwd: clone }).changed, changed, ref);
  }
});

test('a linear depth-2 clone resolves HEAD^1, and HEAD^2 fails closed', () => {
  const repo = repoWith({ 'a.txt': 'a\n' });
  const second = repo.commit('second');
  repo.commit('third');
  const clone = cloneOf(repo, '--depth=2');
  assert.equal(resolveRatchetBase({ cwd: clone, env: { RATCHET_BASE: 'HEAD^1' } }).sha, second);
  assert.throws(() => resolveRatchetBase({ cwd: clone, env: { RATCHET_BASE: 'HEAD^2' } }), {
    message: /RATCHET_BASE=HEAD\^2 does not resolve/,
  });
});

test('base files are read in one batch, byte-exact, with an absent path omitted', () => {
  const text = 'caf\u{E9} \u{1F600}\nsecond line\n';
  const repo = repoWith({ 'corpus/a b.js': text, 'corpus/c.js': 'c\n', 'other/d.js': 'd\n' });
  repo.write({ 'corpus/a b.js': 'changed at head\n' });
  const read = readBaseFiles(repo.first, ['corpus/a b.js', 'missing.js', 'corpus/c.js', 'corpus'], {
    cwd: repo.dir,
  });
  assert.deepEqual(
    [...read],
    [
      ['corpus/a b.js', text],
      ['corpus/c.js', 'c\n'],
    ]
  );
  const corpus = readBaseCorpus(repo.first, 'corpus', { cwd: repo.dir });
  assert.deepEqual([...corpus.keys()], ['corpus/a b.js', 'corpus/c.js']);
});

test('the marker grammar is per file type, and a marker without a reason is read as empty', () => {
  const found = (file, text) =>
    parseMarkers(file, text).map(({ line, family, reason }) => [line, family, reason]);
  assert.deepEqual(
    found('a.js', 'x(); // ratchet-exempt(toy): a banked row\n/* ratchet-exempt(toy): no */'),
    [[1, 'toy', 'a banked row']]
  );
  assert.deepEqual(
    found('a.css', '/* ratchet-exempt(toy): tokens pending */\n// ratchet-exempt(toy): no'),
    [[1, 'toy', 'tokens pending']]
  );
  assert.deepEqual(
    found('a.svelte', '<!-- ratchet-exempt(toy): native select -->\n  // ratchet-exempt(toy): js'),
    [
      [1, 'toy', 'native select'],
      [2, 'toy', 'js'],
    ]
  );
  assert.deepEqual(found('a.js', '// ratchet-exempt(toy):   \n// ratchet-exempt(toy)'), [
    [1, 'toy', ''],
    [2, 'toy', ''],
  ]);
  assert.deepEqual(found('a.json', '// ratchet-exempt(toy): no comments in JSON'), []);
});

test('the file head runs through blank, comment, shebang and script or style tag lines', () => {
  const at = (file, rows) => headMarker(file, `${rows.join('\n')}\n`, 'toy')?.line ?? null;
  const js = '// ratchet-exempt(toy): generated';
  assert.equal(at('a.mjs', ['#!/usr/bin/env node', '// a', '', js, 'const x = 1;']), 4);
  assert.equal(at('a.mjs', ['#!/usr/bin/env node', '// a', 'const x = 1;', js]), null);
  assert.equal(at('a.svelte', ['<!-- a -->', '<script>', `  ${js}`, '  import x from "y";']), 3);
  assert.equal(at('a.svelte', ['<script>', '  import x from "y";', `  ${js}`]), null);
  const css = '/* ratchet-exempt(toy): tokens */';
  assert.equal(at('a.css', ['/* a', ' b */', css, '.x {}']), 3);
  assert.equal(at('a.css', ['/* a', ' b */', '.x {}', css]), null);
  assert.equal(at('a.js', ['// ratchet-exempt(toy):', '// ratchet-exempt(other): x', 'y;']), null);
});

test('an appeared entry fails naming it, a worse one names its base value, and a shrink passes', () => {
  const repo = repoWith({
    'corpus/a.js': lines('alpha x', 'beta y 5', 'gamma z 9'),
    'else/b.js': 'n\n',
  });
  repo.write({ 'corpus/a.js': lines('alpha x', 'beta y 7', 'gamma z 4', 'delta w') });
  const result = compareToy(repo);
  assert.equal(result.compared, true);
  assert.equal(result.base, repo.first);
  assert.deepEqual(result.failures, [
    'corpus/a.js: beta y rose from 5 to 7',
    'corpus/a.js: delta w is new (1)',
  ]);
  assert.deepEqual(result.shrank, ['corpus/a.js: gamma z fell from 9 to 4']);
});

test('a vanished entry nets an appeared one with the same file and value, and only that', () => {
  const repo = repoWith({
    'corpus/a.js': lines('alpha x', 'beta y'),
    'corpus/b.js': lines('gamma y'),
  });
  repo.write({ 'corpus/a.js': lines('renamed x', 'beta y'), 'corpus/b.js': lines('other q') });
  repo.write({ 'corpus/c.js': lines('fresh y') });
  const result = compareToy(repo);
  assert.deepEqual(result.netted, [
    'corpus/a.js: renamed x is new (1), offset by a fall of x in the same file',
  ]);
  assert.deepEqual(result.failures, [
    'corpus/b.js: other q is new (1)',
    'corpus/c.js: fresh y is new (1)',
  ]);
  assert.deepEqual(result.shrank, ['corpus/b.js: gamma y is gone (was 1)']);
});

test('an entry in a renamed file is compared with its base path, not reported as new', () => {
  const repo = repoWith({ 'corpus/a.js': lines(...TEN, 'alpha x 5') });
  repo.git('mv', 'corpus/a.js', 'corpus/moved.js');
  repo.write({ 'corpus/moved.js': lines(...TEN, 'alpha x 6') });
  assert.deepEqual(compareToy(repo).failures, ['corpus/moved.js: alpha x rose from 5 to 6']);
});

test('a reasoned marker at the line, above it or at the file head exempts; an empty one fails', () => {
  const repo = repoWith({
    'corpus/a.js': 'alpha x\n',
    'corpus/b.js': 'alpha x\n',
    'corpus/c.js': 'k\n',
  });
  repo.write({
    'corpus/a.js': lines(
      'alpha x',
      'beta y // ratchet-exempt(toy): the spec banks it',
      '// unrelated',
      'far z'
    ),
    'corpus/b.js': lines('// ratchet-exempt(toy): generated fixture', 'alpha x', 'beta y 3'),
    'corpus/c.js': lines(
      'k',
      '// ratchet-exempt(toy):',
      'gamma q',
      '// ratchet-exempt(other): not this family',
      'kappa r'
    ),
  });
  const result = compareToy(repo);
  assert.deepEqual(result.exempted, [
    'corpus/a.js: beta y is new (1): the spec banks it',
    'corpus/b.js: beta y is new (3): generated fixture',
  ]);
  assert.deepEqual(result.failures, [
    'corpus/a.js: far z is new (1)',
    'corpus/c.js: gamma q is new (1); its ratchet-exempt marker gives no reason',
    'corpus/c.js: kappa r is new (1)',
    'corpus/c.js:2 has a ratchet-exempt(toy) marker with no reason; write why the regression is legitimate after the colon',
  ]);
  const siteOnly = compareToy(repo, { headMarkers: false });
  assert.deepEqual(siteOnly.exempted, ['corpus/a.js: beta y is new (1): the spec banks it']);
  assert.ok(siteOnly.failures.includes('corpus/b.js: beta y is new (3)'));
});

test('a gate skips without reading base when its corpus is untouched, and compares when it is', () => {
  const repo = repoWith({ 'corpus/a.js': 'alpha x\n', 'else/b.js': 'b\n' });
  repo.write({ 'else/b.js': 'changed\n' });
  let measured = 0;
  const counting = (readFile, listFiles) => {
    measured += 1;
    return toyMeasure(readFile, listFiles);
  };
  const untouched = compareToy(repo, { measure: counting });
  assert.deepEqual(untouched, {
    skipped: 'corpus-unchanged',
    reason: 'none of the 1 changed path(s) is in the toy corpus',
    corpusRoot: 'corpus',
    changedCount: 1,
  });
  assert.equal(measured, 0);
  repo.remove('corpus/a.js');
  const removed = compareToy(repo, { measure: counting });
  assert.equal(removed.compared, true);
  assert.deepEqual(removed.shrank, ['corpus/a.js: alpha x is gone (was 1)']);
});

test('a corpus-scoped gate measures the whole corpus on each side once any file of it changes', () => {
  const repo = repoWith({
    'corpus/a.js': 'alpha x\n',
    'corpus/b.js': 'beta y\n',
    'else/c.js': 'c\n',
  });
  repo.write({ 'corpus/b.js': 'beta y\ngamma z\n' });
  const seen = [];
  const spy = (readFile, listFiles) => {
    seen.push(listFiles());
    return toyMeasure(readFile, listFiles);
  };
  compareToy(repo, { measure: spy });
  compareToy(repo, { measure: spy, scope: 'corpus' });
  assert.deepEqual(seen, [
    ['corpus/b.js'],
    ['corpus/b.js'],
    ['corpus/a.js', 'corpus/b.js'],
    ['corpus/a.js', 'corpus/b.js'],
  ]);
});

test('a family ceiling allows headroom over the base value', () => {
  const repo = repoWith({ 'corpus/a.js': 'alpha x 10\n' });
  repo.write({ 'corpus/a.js': 'alpha x 12\n' });
  const ceiling = (was) => was.amount + 2;
  assert.deepEqual(compareToy(repo, { ceiling }).failures, []);
  repo.write({ 'corpus/a.js': 'alpha x 13\n' });
  assert.deepEqual(compareToy(repo, { ceiling }).failures, [
    'corpus/a.js: alpha x rose from 10 to 13',
  ]);
});

test('a family pair hook sees both sides, base paths renamed, before they are compared', () => {
  const repo = repoWith({ 'corpus/a.js': lines(...TEN, 'alpha x 5') });
  repo.git('mv', 'corpus/a.js', 'corpus/moved.js');
  repo.write({ 'corpus/moved.js': lines(...TEN, 'beta x 6') });
  const seen = [];
  const pair = (base, head) => {
    const moved = (entry) => entry.value === 'x';
    seen.push(
      ...base.filter(moved).map((entry) => `base ${entry.file}: ${entry.id}`),
      ...head.filter(moved).map((entry) => `head ${entry.file}: ${entry.id}`)
    );
    return {
      base,
      head: head.map((entry) => (moved(entry) ? { ...entry, id: 'alpha x' } : entry)),
    };
  };
  const result = compareToy(repo, { pair });
  assert.deepEqual(seen, ['base corpus/moved.js: alpha x', 'head corpus/moved.js: beta x']);
  assert.deepEqual(result.failures, ['corpus/moved.js: alpha x rose from 5 to 6']);
});

test('reporting throws the failures with the marker and stale-base guidance, and notes the rest', () => {
  const notes = [];
  const t = {
    diagnostic: (line) => {
      notes.push(line);
    },
  };
  const passing = {
    compared: true,
    family: 'toy',
    base: 'a'.repeat(40),
    failures: [],
    shrank: ['s'],
    netted: ['n'],
    exempted: ['e'],
  };
  reportComparison(t, passing);
  assert.deepEqual(notes, ['shrank: s', 'moved: n', 'exempt: e']);
  assert.throws(
    () =>
      reportComparison(t, { ...passing, failures: ['corpus/a.js: x is new (1)'] }, 'use a token'),
    {
      message:
        /toy: 1 regression\(s\) against base a{12}:\n {2}corpus\/a\.js: x is new \(1\)\n\nuse a token[\s\S]*ratchet-exempt\(toy\): <reason>[\s\S]*git fetch origin main/,
    }
  );
  reportComparison(t, {
    skipped: 'no-base',
    reason: 'why',
    corpusRoot: 'corpus',
    changedCount: null,
  });
  assert.equal(notes.at(-1), 'skipped (no-base): why');
});

test('a malformed family name or entry is rejected rather than compared', () => {
  const repo = repoWith({ 'corpus/a.js': 'alpha x\n' });
  repo.write({ 'corpus/a.js': 'alpha y\n' });
  assert.throws(() => compareToy(repo, { family: 'Bad Name' }), {
    message: /invalid ratchet family name/,
  });
  assert.throws(() => compareToy(repo, { measure: () => [{ file: 'corpus/a.js' }] }), {
    message: /malformed entry/,
  });
});
