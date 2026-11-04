import assert from 'node:assert/strict';
import test from 'node:test';

import { hotfixPreflight, nextPatchTag, run } from '../scripts/lib/hotfixPreflight.js';

// Build a realistic `git ls-remote --tags origin` listing from a set of tags: each line is
// `<object-id>\trefs/tags/<tag>`, exactly what the piped command emits.
const lsRemote = (...tags) =>
  `${tags.map((tag) => `0123456789abcdef0123456789abcdef01234567\trefs/tags/${tag}`).join('\n')}\n`;
const silentIo = { log() {}, error() {} };

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

test('hotfixPreflight refuses when the computed patch tag is present on stdin (soaking patch)', () => {
  const result = hotfixPreflight('v1.5.0', lsRemote('v1.4.0', 'v1.5.0', 'v1.5.1'));
  assert.equal(result.ok, false);
  assert.equal(result.code, 1);
  assert.equal(result.nextTag, 'v1.5.1');
  assert.match(result.message, /already exists/);
  assert.match(result.message, /promote it to public first/);
});

test('hotfixPreflight passes when the patch tag is absent and a newer minor is soaking', () => {
  const result = hotfixPreflight('v1.5.0', lsRemote('v1.4.0', 'v1.5.0', 'v1.6.0'));
  assert.equal(result.ok, true);
  assert.equal(result.code, 0);
  assert.equal(result.nextTag, 'v1.5.1');
});

test('hotfixPreflight matches the WHOLE ref, so a longer superstring never counts', () => {
  // A soaking v1.5.10 must not satisfy a lookup for v1.5.1 — the match keys on the full
  // `refs/tags/<tag>` boundary, not a substring of the ref line.
  assert.equal(hotfixPreflight('v1.5.0', lsRemote('v1.5.0', 'v1.5.10')).ok, true);
});

test('hotfixPreflight also matches an annotated tag deref (^{}) ref', () => {
  const result = hotfixPreflight('v1.5.0', lsRemote('v1.5.1', 'v1.5.1^{}'));
  assert.equal(result.ok, false);
  assert.equal(result.code, 1);
});

test('hotfixPreflight fails closed on empty stdin — the unfiltered listing is never empty', () => {
  assert.throws(() => hotfixPreflight('v1.5.0', ''), /unverifiable/i);
});

test('hotfixPreflight fails closed on malformed stdin (not a git ls-remote listing)', () => {
  assert.throws(() => hotfixPreflight('v1.5.0', 'this is not a ref listing\n'), /unverifiable/i);
});

test('run exits 1 on a collision', () => {
  assert.equal(run(['v1.5.0'], lsRemote('v1.5.0', 'v1.5.1'), silentIo), 1);
});

test('run exits 0 when the next patch tag is clear and a newer minor is soaking', () => {
  assert.equal(run(['v1.5.0'], lsRemote('v1.5.0', 'v1.6.0'), silentIo), 0);
});

test('hotfixPreflight refuses when no stable version above the base exists — nothing is soaking', () => {
  // Semantic-release would give the line the empty range >=1.5.0 <1.5.0.
  const result = hotfixPreflight('v1.5.0', lsRemote('v1.4.0', 'v1.5.0', 'v1.6.0-beta.3'));
  assert.equal(result.ok, false);
  assert.equal(result.code, 1);
  assert.equal(result.nextTag, 'v1.5.1');
  assert.match(result.message, /no stable version above v1\.5\.0 exists/);
  assert.match(result.message, /reviewed pull request/);
});

test('hotfixPreflight reads annotated tags through their ^{} deref names', () => {
  assert.equal(hotfixPreflight('v1.5.0', lsRemote('v1.5.0^{}', 'v1.6.0^{}')).ok, true);
});

test('hotfixPreflight fails closed when the base tag is not on origin', () => {
  assert.throws(() => hotfixPreflight('v1.5.0', lsRemote('v1.4.0', 'v1.6.0')), /not on origin/);
});

test('run exits 1 with nothing soaking, and 2 for a base tag not on origin', () => {
  assert.equal(run(['v1.5.0'], lsRemote('v1.5.0'), silentIo), 1);
  assert.equal(run(['v1.5.0'], lsRemote('v1.6.0'), silentIo), 2);
});

test('run exits 2 on a non-stable base tag — a usage error, not a collision', () => {
  assert.equal(run(['v1.5.0-beta.3'], lsRemote('v1.5.0'), silentIo), 2);
});

test('run exits 2 on a garbage base tag', () => {
  assert.equal(run(['nonsense'], lsRemote('v1.5.0'), silentIo), 2);
});

test('run exits 2 with no argument at all', () => {
  assert.equal(run([], lsRemote('v1.5.0'), silentIo), 2);
});

test('run exits 2 on empty/malformed stdin (fail closed on an unverifiable listing)', () => {
  assert.equal(run(['v1.5.0'], '', silentIo), 2);
  assert.equal(run(['v1.5.0'], 'garbage\n', silentIo), 2);
});
