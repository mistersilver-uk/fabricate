import assert from 'node:assert/strict';
import test from 'node:test';

import { hotfixPreflight, nextPatchTag, run } from '../scripts/lib/hotfixPreflight.js';

const TAG_COMMIT = '0123456789abcdef0123456789abcdef01234567';
const MOVED_RELEASE = 'fedcba9876543210fedcba9876543210fedcba98';

/** One `git ls-remote` line: `<object-id>\t<ref>`, exactly what the piped command emits. */
const refLine = (objectId, ref) => `${objectId}\t${ref}`;

// A realistic `git ls-remote --tags --heads origin` listing: every tag on one commit, and the
// release line moved past it, which is the shape a hotfix line can mint from.
const lsRemote = (...tags) =>
  `${[
    ...tags.map((tag) => refLine(TAG_COMMIT, `refs/tags/${tag}`)),
    refLine(MOVED_RELEASE, 'refs/heads/release'),
  ].join('\n')}\n`;
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

test('hotfixPreflight passes when the computed patch tag is absent from stdin', () => {
  const result = hotfixPreflight('v1.5.0', lsRemote('v1.4.0', 'v1.5.0'));
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

test('hotfixPreflight refuses while the release line still sits on the base tag', () => {
  const listing = `${[
    refLine(TAG_COMMIT, 'refs/tags/v1.5.0'),
    refLine(TAG_COMMIT, 'refs/heads/release'),
  ].join('\n')}\n`;
  const result = hotfixPreflight('v1.5.0', listing);
  assert.equal(result.ok, false);
  assert.equal(result.code, 1);
  assert.equal(result.nextTag, 'v1.5.1');
  assert.match(result.message, /release line still sits on v1\.5\.0/);
  assert.match(result.message, /reviewed pull request/);
});

test('hotfixPreflight reads an annotated base tag through its ^{} deref, not the tag object', () => {
  const tagObject = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const listing = `${[
    refLine(tagObject, 'refs/tags/v1.5.0'),
    refLine(TAG_COMMIT, 'refs/tags/v1.5.0^{}'),
    refLine(TAG_COMMIT, 'refs/heads/release'),
  ].join('\n')}\n`;
  assert.equal(hotfixPreflight('v1.5.0', listing).ok, false);
});

test('hotfixPreflight fails closed when the listing carries no release head (tags only)', () => {
  const tagsOnly = `${refLine(TAG_COMMIT, 'refs/tags/v1.5.0')}\n`;
  assert.throws(() => hotfixPreflight('v1.5.0', tagsOnly), /refs\/heads\/release.*unverifiable/s);
});

test('hotfixPreflight fails closed when the base tag is not on origin', () => {
  assert.throws(() => hotfixPreflight('v1.5.0', lsRemote('v1.4.0')), /not on origin/);
});

test('run exits 2 — unverifiable, not a collision — without the release head or the base tag', () => {
  assert.equal(run(['v1.5.0'], `${refLine(TAG_COMMIT, 'refs/tags/v1.5.0')}\n`, silentIo), 2);
  assert.equal(run(['v1.5.0'], lsRemote('v1.4.0'), silentIo), 2);
});

test('hotfixPreflight compares object ids case-insensitively', () => {
  const listing = `${[
    refLine(TAG_COMMIT, 'refs/tags/v1.5.0'),
    refLine(TAG_COMMIT.toUpperCase(), 'refs/heads/release'),
  ].join('\n')}\n`;
  assert.equal(hotfixPreflight('v1.5.0', listing).ok, false);
});

test('run exits 1 while the release line still sits on the base tag', () => {
  const listing = `${[
    refLine(TAG_COMMIT, 'refs/tags/v1.5.0'),
    refLine(TAG_COMMIT, 'refs/heads/release'),
  ].join('\n')}\n`;
  assert.equal(run(['v1.5.0'], listing, silentIo), 1);
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

test('run exits 0 when the next patch tag is clear', () => {
  assert.equal(run(['v1.5.0'], lsRemote('v1.5.0'), silentIo), 0);
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
