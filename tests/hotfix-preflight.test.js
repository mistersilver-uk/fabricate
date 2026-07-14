import assert from 'node:assert/strict';
import test from 'node:test';

import { hotfixPreflight, nextPatchTag, run } from '../scripts/lib/hotfixPreflight.js';

// Injectable listers standing in for `git ls-remote --tags origin <tag>`: `present` returns a
// realistic ref line for the looked-up tag (the tag is soaking), `absent` returns empty stdout.
const present = (tag) => `0123456789abcdef0123456789abcdef01234567\trefs/tags/${tag}\n`;
const absent = () => '';
const silentIo = (listRemoteTags) => ({ listRemoteTags, log() {}, error() {} });

test('nextPatchTag computes the next patch of a public tag', () => {
  assert.deepEqual(nextPatchTag('v1.5.0'), {
    baseTag: 'v1.5.0',
    baseVersion: '1.5.0',
    nextVersion: '1.5.1',
    nextTag: 'v1.5.1',
  });
  assert.equal(nextPatchTag('v1.4.9').nextTag, 'v1.4.10');
});

test('nextPatchTag refuses a non-stable base — a hotfix line cuts from a PUBLIC tag', () => {
  assert.throws(() => nextPatchTag('v1.5.0-beta.3'), /public/i);
  assert.throws(() => nextPatchTag('v1.5.0-rc.85'), /public/i);
  assert.throws(() => nextPatchTag('not-a-tag'), /stable public tag/i);
});

test('hotfixPreflight refuses when the computed patch tag already exists (soaking patch)', () => {
  const result = hotfixPreflight('v1.5.0', present);
  assert.equal(result.ok, false);
  assert.equal(result.code, 1);
  assert.equal(result.nextTag, 'v1.5.1');
  assert.match(result.message, /already exists/);
  assert.match(result.message, /promote it to public first/);
});

test('hotfixPreflight passes when the computed patch tag is absent', () => {
  const result = hotfixPreflight('v1.5.0', absent);
  assert.equal(result.ok, true);
  assert.equal(result.code, 0);
  assert.equal(result.nextTag, 'v1.5.1');
});

test('hotfixPreflight matches only the exact tag, not a longer superstring', () => {
  // A lister that returns v1.5.10 must not satisfy a lookup for v1.5.1 — the ref line carries the
  // full `refs/tags/<tag>` boundary, so the includes-check keys on that, not a bare prefix.
  const onlyTen = (tag) => (tag === 'v1.5.1' ? present('v1.5.10') : '');
  assert.equal(hotfixPreflight('v1.5.0', onlyTen).ok, true);
});

test('run exits 1 on a collision', () => {
  assert.equal(run(['v1.5.0'], silentIo(present)), 1);
});

test('run exits 0 when the next patch tag is clear', () => {
  assert.equal(run(['v1.5.0'], silentIo(absent)), 0);
});

test('run exits 2 on a non-stable base tag — a usage error, not a collision', () => {
  assert.equal(run(['v1.5.0-beta.3'], silentIo(absent)), 2);
});

test('run exits 2 on a garbage base tag', () => {
  assert.equal(run(['nonsense'], silentIo(absent)), 2);
});

test('run exits 2 with no argument at all', () => {
  assert.equal(run([], silentIo(absent)), 2);
});

test('run surfaces a lister failure as a usage error (fail closed on an unverifiable remote)', () => {
  const throwing = () => {
    throw new Error('network down');
  };
  assert.equal(run(['v1.5.0'], silentIo(throwing)), 2);
});
