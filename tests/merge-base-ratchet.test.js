/**
 * Proves the merge-base ratchet engine (`tests/helpers/mergeBaseRatchet.js`) against throwaway git
 * repositories, and the ledger engine (`tests/helpers/ratchetBaseline.js`) the families not yet
 * moved to it still use.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test, { after } from 'node:test';

import { resolveExecutable } from '../scripts/lib/resolveExecutable.js';
import { tallyByKey } from './helpers/codePointOrder.js';
import {
  basePathOf,
  changedPaths,
  compareToBase,
  parseMarkers,
  readBaseCorpus,
  readBaseFiles,
  reportComparison,
  resolveRatchetBase,
} from './helpers/mergeBaseRatchet.js';
import {
  assertRatchet,
  ceilingLedgerGate,
  formatLedger,
  parseLedger,
  ratchetFindings,
} from './helpers/ratchetBaseline.js';
import { createTempGitRepo, envWithoutGitLocation } from './helpers/temp-git-repo.js';

const GIT = resolveExecutable('git');
const LOCAL = Object.freeze({});
const repos = [];
after(() => repos.forEach((repo) => repo.dispose()));

/** A repository on `main` whose first commit holds `files`, with helpers to edit and commit. */
function repoWith(files) {
  const repo = createTempGitRepo('merge-base-ratchet-');
  repos.push(repo);
  repo.git('checkout', '-q', '-b', 'main');
  const write = (entries) => {
    for (const [file, text] of Object.entries(entries)) {
      mkdirSync(dirname(join(repo.dir, file)), { recursive: true });
      writeFileSync(join(repo.dir, file), text);
    }
  };
  const commitAll = (message) => {
    repo.git('add', '-A');
    return repo.commit(message);
  };
  write(files);
  const first = commitAll('first');
  return { ...repo, write, commitAll, first, remove: (file) => unlinkSync(join(repo.dir, file)) };
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
      message: new RegExp(`RATCHET_BASE=${ref} does not resolve[\\s\\S]*fails rather than passing`),
    });
  }
});

test('RATCHET_BASE=none opts out, in CI too, and the gate reports a skip rather than a pass', () => {
  const repo = repoWith({ 'corpus/a.js': 'alpha x\n' });
  const env = { RATCHET_BASE: 'none', CI: 'true' };
  assert.equal(resolveRatchetBase({ cwd: repo.dir, env }).skipped, 'opted-out');
  const result = compareToy(repo, { env });
  assert.deepEqual(Object.keys(result).sort(), ['changedCount', 'corpusRoot', 'reason', 'skipped']);
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
  assert.deepEqual([...changes.renames].sort(), [
    ['edited-renamed.txt', 'edited.txt'],
    ['kept-renamed.txt', 'kept.txt'],
  ]);
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
  const text = 'caf\u00e9 \u{1F600}\nsecond line\n';
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
    seen.push(...base.filter(moved).map((entry) => `base ${entry.file}: ${entry.id}`));
    seen.push(...head.filter(moved).map((entry) => `head ${entry.file}: ${entry.id}`));
    return { base, head: head.map((entry) => (moved(entry) ? { ...entry, id: 'alpha x' } : entry)) };
  };
  const result = compareToy(repo, { pair });
  assert.deepEqual(seen, ['base corpus/moved.js: alpha x', 'head corpus/moved.js: beta x']);
  assert.deepEqual(result.failures, ['corpus/moved.js: alpha x rose from 5 to 6']);
});

test('reporting throws the failures with the marker and stale-base guidance, and notes the rest', () => {
  const notes = [];
  const t = { diagnostic: (line) => notes.push(line) };
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

// The ledger engine, until the last family moves off it.

/** A three-row baseline totalling six, small enough to reason about by eye. */
const BASELINE = Object.freeze([
  Object.freeze({ key: 'a.css height 40', count: 3 }),
  Object.freeze({ key: 'b.svelte height 36', count: 2 }),
  Object.freeze({ key: 'c.svelte min-height 32', count: 1 }),
]);

/** The clean observation: exactly the baseline. */
const clean = () =>
  new Map([
    ['a.css height 40', 3],
    ['b.svelte height 36', 2],
    ['c.svelte min-height 32', 1],
  ]);

/** Run the ratchet over `observed`, with everything else healthy. */
const run = (observed, overrides = {}) =>
  assertRatchet({
    label: 'retired heights',
    baseline: BASELINE,
    pinnedTotal: 6,
    observed,
    scanned: 900,
    floor: 800,
    guidance: 'pick a rung from the published ladder',
    ...overrides,
  });

test('a baseline that matches the tree passes and reports its total', () => {
  assert.deepEqual(run(clean()), { total: 6 });
});

test('a new key fails as new debt', () => {
  const observed = clean().set('d.svelte height 40', 1);
  assert.throws(() => run(observed), {
    message: /APPEARED[\s\S]*d\.svelte height 40 \(1x, not in the baseline\)/,
  });
  // The guidance travels with the failure: a gate that only says "no" makes the reader guess.
  assert.throws(() => run(observed), { message: /pick a rung from the published ladder/ });
});

test('an existing key that grows fails, which a per-file total would absorb', () => {
  assert.throws(() => run(clean().set('a.css height 40', 4)), {
    message: /GREW[\s\S]*a\.css height 40 \(3x pinned, 4x found\)/,
  });
});

test('paying debt down without banking it fails, and says so in the other direction', () => {
  assert.throws(() => run(clean().set('a.css height 40', 2)), {
    message: /SHRANK[\s\S]*Bank it[\s\S]*a\.css height 40 \(3x pinned, 2x found\)/,
  });
});

test('a baseline row that no longer exists fails as a stale permission', () => {
  const observed = clean();
  observed.delete('c.svelte min-height 32');
  assert.throws(() => run(observed), {
    message: /VANISHED[\s\S]*c\.svelte min-height 32 \(1x pinned, none found\)/,
  });
});

test('every discrepancy is reported at once, not one run at a time', () => {
  const observed = clean();
  observed.set('a.css height 40', 4);
  observed.set('d.svelte height 32', 1);
  observed.delete('c.svelte min-height 32');

  // A ratchet is edited in bulk. Reporting the first finding turns one fix into three runs, and
  // hides from the reader that the third change is a payment they were entitled to bank.
  assert.throws(() => run(observed), {
    message: /APPEARED[\s\S]*GREW[\s\S]*VANISHED/,
  });
});

test('a pinned total that disagrees with the sum fails before anything is compared', () => {
  // Deliberately with a CLEAN observation: this must fail on the baseline's own arithmetic, so a
  // row edited without updating the headline cannot ride along on a green tree.
  assert.throws(() => run(clean(), { pinnedTotal: 7 }), {
    message: /holds 6 across 3 keys but the pinned total says 7/,
  });
});

test('a scan that looked at almost nothing fails instead of reporting a clean tree', () => {
  assert.throws(() => run(clean(), { scanned: 12 }), {
    message:
      /only 12 candidates, below the floor of 800[\s\S]*broken scan reported as a clean tree/,
  });
});

test('a malformed or duplicated baseline row is rejected rather than half-counted', () => {
  const duplicated = [...BASELINE, { key: 'a.css height 40', count: 1 }];
  assert.throws(() => run(clean(), { baseline: duplicated }), {
    message: /"a\.css height 40" appears twice/,
  });
  assert.throws(() => run(clean(), { baseline: [{ key: '', count: 1 }] }), {
    message: /non-empty string `key`/,
  });
  assert.throws(() => run(clean(), { baseline: [{ key: 'a', count: 0 }] }), {
    message: /needs a positive integer `count`/,
  });
});

test('the four categories are separable without parsing a message', () => {
  const found = ratchetFindings(
    new Map([
      ['kept', 1],
      ['grown', 1],
      ['shrunk', 2],
      ['gone', 1],
    ]),
    new Map([
      ['kept', 1],
      ['grown', 2],
      ['shrunk', 1],
      ['new', 1],
    ])
  );

  assert.deepEqual(found.appeared, ['new (1x, not in the baseline)']);
  assert.deepEqual(found.grew, ['grown (1x pinned, 2x found)']);
  assert.deepEqual(found.shrank, ['shrunk (2x pinned, 1x found)']);
  assert.deepEqual(found.vanished, ['gone (1x pinned, none found)']);
});

test('tallying counts repeats rather than collapsing them', () => {
  // Counted, not set-valued, for the reason `manager-button-source-contract.test.js` gives:
  // deleting one of two identical probes must not be silently absorbed.
  const counts = tallyByKey([{ file: 'a' }, { file: 'b' }, { file: 'a' }], (entry) => entry.file);
  assert.deepEqual(
    [...counts],
    [
      ['a', 2],
      ['b', 1],
    ]
  );
});

const TEMP_LEDGERS = mkdtempSync(join(tmpdir(), 'ceiling-ledger-'));
after(() => rmSync(TEMP_LEDGERS, { recursive: true, force: true }));

let probeSequence = 0;

/**
 * A ceiling gate over a throwaway ledger, with its own env names so no two probes can collide.
 * The default rule gives every observation one unit of headroom.
 */
function ceilingProbe({ rows, observed, scanned = 10, detail, ceiling, shrink = 'fail' }) {
  probeSequence += 1;
  const ledgerPath = join(TEMP_LEDGERS, `probe-${probeSequence}.txt`);
  writeFileSync(ledgerPath, formatLedger(rows));
  const updateEnv = `UPDATE_PROBE_${probeSequence}_LEDGER`;
  const tightenEnv = `TIGHTEN_PROBE_${probeSequence}_LEDGER`;
  let registered;
  const gate = ceilingLedgerGate({
    test: (_title, fn) => {
      registered = fn;
    },
    assert,
    title: 'the probe ledger',
    ledgerPath,
    updateEnv,
    tightenEnv,
    build: () => ({ observed, scanned, detail }),
    ceiling: ceiling ?? ((key, value) => Math.ceil(value) + 1),
    shrink,
    floor: 5,
    wording: {
      subject: 'probe counts',
      update: `${updateEnv}=1 npm test`,
      tighten: `${tightenEnv}=1 npm test`,
      addedHint: 'A probe appears when it is written.',
      staleHint: 'A probe vanishes when it is deleted.',
    },
  });
  const withEnv = (name, run) => {
    process.env[name] = '1';
    try {
      return run();
    } finally {
      delete process.env[name];
    }
  };
  const underUpdate = (run) => withEnv(updateEnv, run);
  const underTighten = (run) => withEnv(tightenEnv, run);
  return {
    gate,
    run: (t) => registered(t),
    underUpdate,
    underTighten,
    update: (t) => underUpdate(() => registered(t)),
    tighten: (t) => underTighten(() => registered(t)),
    both: (t) => underUpdate(() => underTighten(() => registered(t))),
    text: () => readFileSync(ledgerPath, 'utf8'),
    read: () => parseLedger(readFileSync(ledgerPath, 'utf8')),
    ledgerPath,
  };
}

/** A stand-in for the `node:test` context, so a diagnostic is observable rather than printed. */
function diagnosticSpy() {
  const lines = [];
  return { context: { diagnostic: (line) => lines.push(line) }, lines };
}

test('a key with no row fails as new debt, naming the ceiling an update would write', () => {
  const probe = ceilingProbe({ rows: { a: 5 }, observed: { a: 4, b: 7 } });
  assert.throws(() => probe.run(), {
    message: /NO ROW[\s\S]*b \(7, would be pinned 8\)[\s\S]*UPDATE_PROBE/,
  });
});

test('a key that grew past its ceiling fails, naming both numbers', () => {
  const probe = ceilingProbe({ rows: { a: 5 }, observed: { a: 6 } });
  assert.throws(() => probe.run(), {
    message: /OVER CEILING[\s\S]*a \(ceiling 5, found 6, would be pinned 7\)/,
  });
});

test('an observation at its ceiling passes, and one below it passes without a rewrite', () => {
  const atCeiling = ceilingProbe({ rows: { a: 5 }, observed: { a: 5 } });
  atCeiling.run();
  assert.equal(atCeiling.text(), 'a\t5\n', 'a passing run never writes');

  const below = ceilingProbe({ rows: { a: 50 }, observed: { a: 5 }, shrink: 'allow' });
  const spy = diagnosticSpy();
  below.run(spy.context);
  assert.equal(below.text(), 'a\t50\n');
  assert.match(spy.lines.join('\n'), /1 row\(s\)[\s\S]*a \(50 -> 6\)/);
});

test('a row left above its unit is a diagnostic under `allow` and a failure under `fail`', () => {
  // A ledger with no headroom rule cannot distinguish "shrank" from "about to be spent back", so
  // there the win is banked at once rather than left standing as a row nobody is using.
  const failed = ceilingProbe({ rows: { a: 50 }, observed: { a: 5 }, shrink: 'fail' });
  assert.throws(() => failed.run(), {
    message: /SLACK[\s\S]*a \(ceiling 50, found 5, would be pinned 6\)[\s\S]*TIGHTEN_PROBE/,
  });
  assert.equal(failed.text(), 'a\t50\n', 'a failing run never writes');
});

test('a stale row passes with a diagnostic under `allow` and fails under `fail`', () => {
  const allowed = ceilingProbe({ rows: { a: 5, gone: 3 }, observed: { a: 5 }, shrink: 'allow' });
  const spy = diagnosticSpy();
  allowed.run(spy.context);
  assert.match(spy.lines.join('\n'), /1 stale row\(s\)[\s\S]*gone \(3\)/);

  const failed = ceilingProbe({ rows: { a: 5, gone: 3 }, observed: { a: 5 }, shrink: 'fail' });
  assert.throws(() => failed.run(), {
    message: /STALE[\s\S]*gone \(ceiling 3, nothing found\)[\s\S]*TIGHTEN_PROBE/,
  });
});

test('an empty observation fails on the floor in every mode, not only when asserting', () => {
  // The failure a ceiling gate is uniquely exposed to: it bounds only what it observes, so a
  // corpus that read nothing meets every ceiling it was given. The regenerate modes are the
  // dangerous half — a broken scan there rewrites the ledger down to nothing on disk.
  const probe = ceilingProbe({ rows: { a: 5 }, observed: {}, scanned: 0, shrink: 'allow' });
  const message = /only 0 candidates, below the floor of 5[\s\S]*every ceiling met/;
  assert.throws(() => probe.run(), { message });
  assert.throws(() => probe.tighten(), { message });
  assert.throws(() => probe.update(), { message });
  assert.equal(probe.text(), 'a\t5\n', 'no mode wrote past the floor');
});

test('a gate reports whether this run rewrote the ledger, which two gates skip a figure on', () => {
  const probe = ceilingProbe({ rows: { a: 5 }, observed: { a: 5 } });
  assert.equal(probe.gate.regenerated(), false);
  assert.equal(
    probe.underUpdate(() => probe.gate.regenerated()),
    true
  );
  assert.equal(
    probe.underTighten(() => probe.gate.regenerated()),
    true
  );
  assert.equal(probe.gate.regenerated(), false, 'it reads the env per call, not once at build');
});

test('setting both regenerate modes at once is rejected instead of picking one', () => {
  const probe = ceilingProbe({ rows: { a: 5 }, observed: { a: 9 } });
  assert.throws(() => probe.both(), { message: /are both set, and they write different files/ });
});

test('the update mode rewrites only the failing rows', () => {
  const probe = ceilingProbe({
    rows: { grown: 5, slack: 90, gone: 4 },
    observed: { grown: 9, slack: 5, fresh: 2 },
    shrink: 'allow',
  });
  probe.update();
  assert.deepEqual(probe.read(), { fresh: 3, gone: 4, grown: 10, slack: 90 });
});

test('the tighten mode rewrites every row, drops stale rows, and is idempotent', () => {
  const probe = ceilingProbe({
    rows: { grown: 5, slack: 90, gone: 4 },
    observed: { grown: 9, slack: 5, fresh: 2 },
    shrink: 'allow',
  });
  probe.tighten();
  assert.deepEqual(probe.read(), { fresh: 3, grown: 10, slack: 6 });
  const once = probe.text();
  probe.tighten();
  assert.equal(probe.text(), once, 'a second tighten run is byte-identical');
  probe.run();
});

test('the ceiling rule sees the key, so a file row and a function row take different steps', () => {
  const probe = ceilingProbe({
    rows: {},
    observed: { 'a.js': 100, 'a.js::fn': 100 },
    ceiling: (key, value) => (key.includes('::') ? value + 10 : value + 50),
  });
  probe.update();
  assert.deepEqual(probe.read(), { 'a.js': 150, 'a.js::fn': 110 });
});

test('the ceiling rule reads the detail the scan carried, not only the observation', () => {
  const probe = ceilingProbe({
    rows: {},
    observed: { dir: 20 },
    detail: { dir: { commentLines: 20, totalLines: 100 } },
    ceiling: (key, _value, detail) =>
      Math.ceil((100 * (detail[key].commentLines + 25)) / (detail[key].totalLines + 25)),
  });
  probe.update();
  assert.deepEqual(probe.read(), { dir: 36 });
});

test('a zero or malformed row is rejected rather than read as a satisfied ceiling', () => {
  const zeroed = ceilingProbe({ rows: { a: 5 }, observed: { a: 5 } });
  writeFileSync(zeroed.ledgerPath, 'a\t0\n');
  assert.throws(() => zeroed.run(), { message: /row "a" holds 0[\s\S]*positive integer/ });

  const malformed = ceilingProbe({ rows: { a: 5 }, observed: { a: 5 } });
  writeFileSync(malformed.ledgerPath, 'a\tmany\n');
  assert.throws(() => malformed.run(), { message: /row "a" holds NaN/ });
});

test('the tighten mode repairs a malformed row instead of being blocked by it', () => {
  // Row validation runs before the mode branch, so a gate that validated for tighten too would
  // reject the only run that can write the row back.
  const probe = ceilingProbe({ rows: { a: 5 }, observed: { a: 5 } });
  writeFileSync(probe.ledgerPath, 'a\t0\n');
  assert.throws(() => probe.run(), { message: /row "a" holds 0/ });
  probe.tighten();
  assert.deepEqual(probe.read(), { a: 6 });
  probe.run();
});

test('a duplicated row is rejected rather than collapsed to whichever came last', () => {
  // `parseLedger` keeps the last of two rows, so an unnoticed duplicate would silently pick a
  // ceiling that is not the one either row states.
  const probe = ceilingProbe({ rows: { a: 5 }, observed: { a: 5 } });
  writeFileSync(probe.ledgerPath, 'a\t5\na\t900\n');
  assert.throws(() => probe.run(), { message: /row "a" appears twice[\s\S]*merge them into one/ });
});
