import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { findDeadAlternatives, splitTopLevelAlternatives } from '../scripts/lib/patternLiveness.js';

const CLI = fileURLToPath(new URL('../scripts/assert-pattern-live.mjs', import.meta.url));
const TEXTS = ['alpha one\nbeta two\n', 'a|b literal\n(group) here\n'];

test('an all-live pattern has no dead alternatives', () => {
  assert.deepEqual(findDeadAlternatives('alpha|beta', TEXTS), []);
});

test('a dead alternative is named', () => {
  assert.deepEqual(findDeadAlternatives('alpha|gamma|beta|delta', TEXTS), ['gamma', 'delta']);
});

test('only top-level pipes split, including nested groups', () => {
  assert.deepEqual(splitTopLevelAlternatives('x(a|b(c|d))y|z'), ['x(a|b(c|d))y', 'z']);
  assert.deepEqual(findDeadAlternatives('(alpha|nope)|(beta|(two|zzz))', TEXTS), []);
  assert.deepEqual(findDeadAlternatives('(nope|never)|beta', TEXTS), ['(nope|never)']);
});

test('an escaped pipe is not a separator', () => {
  assert.deepEqual(splitTopLevelAlternatives(String.raw`a\|b|c`), [String.raw`a\|b`, 'c']);
  assert.deepEqual(findDeadAlternatives(String.raw`a\|b|missing`, TEXTS), ['missing']);
  assert.deepEqual(splitTopLevelAlternatives(String.raw`a\\|b`), [String.raw`a\\`, 'b']);
});

test('a pipe inside a character class is not a separator', () => {
  assert.deepEqual(splitTopLevelAlternatives('a[|]b|c'), ['a[|]b', 'c']);
  assert.deepEqual(splitTopLevelAlternatives('[^]|]x|y'), ['[^]|]x', 'y']);
  assert.deepEqual(findDeadAlternatives('a[|]b|missing', TEXTS), ['missing']);
});

test('the CLI fails with no files, names a dead alternative, and passes when live', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pattern-live-'));
  try {
    const file = path.join(dir, 'sample.txt');
    writeFileSync(file, 'foo here\n');
    const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

    const none = run('foo');
    assert.equal(none.status, 1);
    assert.match(none.stderr, /no files given/);

    const dead = run('foo|bar', file);
    assert.equal(dead.status, 1);
    assert.match(dead.stderr, /: bar\n/);
    assert.doesNotMatch(dead.stderr, /: foo/);

    assert.equal(run('foo|here', file).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
