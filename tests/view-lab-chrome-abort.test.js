/**
 * The fail-closed path.
 *
 * "Fails closed rather than approximating" is the property the whole View Lab rests on — a frame
 * drawn without the real cascade is worse than no frame, because it looks authoritative. That
 * property was documented in three places and asserted in none: `foundryChromeCache.js` had zero
 * behavioural coverage, so a regression making `resolveChromeCache` return a partial cache instead
 * of `null` would ship green and the lab would quietly draw half-chrome.
 *
 * These run against TEMPORARY directories rather than the real cache, so they neither need a
 * harvest nor can be fooled by one being present — which is what lets them run everywhere, unlike
 * the drift test that necessarily skips without harvested material.
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  CHROME_CACHE_DIRNAME,
  PROVENANCE_PATH,
  assertProvenanceWritable,
  missingChromeMessage,
  resolveChromeCache,
  verifyChromeCache,
} from '../scripts/lib/foundryChromeCache.js';

/** A throwaway repo root, cleaned up by the caller. */
function scratchRoot() {
  return mkdtempSync(join(tmpdir(), 'view-lab-abort-'));
}

test('no cache directory at all resolves to null', () => {
  const root = scratchRoot();
  try {
    assert.equal(resolveChromeCache(root), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a version directory with no manifest resolves to null, not to a half-cache', () => {
  // An interrupted harvest leaves the directory behind. Returning it would let the driver mount a
  // partial cache and draw frames missing whatever had not been written yet.
  const root = scratchRoot();
  try {
    mkdirSync(join(root, CHROME_CACHE_DIRNAME, '13.351'), { recursive: true });
    assert.equal(resolveChromeCache(root), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a truncated manifest resolves to null rather than throwing or half-trusting', () => {
  const root = scratchRoot();
  try {
    const dir = join(root, CHROME_CACHE_DIRNAME, '13.351');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'harvest-manifest.json'), '{"assets": [');
    assert.equal(resolveChromeCache(root), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an explicit version that is not harvested resolves to null even when another is', () => {
  // The CI job pins the version from committed provenance. If a DIFFERENT build is present, the
  // pin must miss rather than silently falling back to whatever was harvested — a newer stylesheet
  // rendered through markup transcribed from an older build gives genuine CSS around a stale DOM.
  const root = scratchRoot();
  try {
    const dir = join(root, CHROME_CACHE_DIRNAME, '13.351');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'harvest-manifest.json'), JSON.stringify({ assets: [] }));

    assert.ok(resolveChromeCache(root, '13.351'), 'the harvested version should resolve');
    assert.equal(resolveChromeCache(root, '13.352'), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('verifyChromeCache reports a missing asset rather than passing it', () => {
  const root = scratchRoot();
  try {
    const dir = join(root, CHROME_CACHE_DIRNAME, '13.351');
    mkdirSync(dir, { recursive: true });
    const manifest = { assets: [{ path: 'css/foundry2.css', sha256: 'x'.repeat(64) }] };
    writeFileSync(join(dir, 'harvest-manifest.json'), JSON.stringify(manifest));

    const result = verifyChromeCache({ dir, manifest });
    assert.equal(result.ok, false);
    assert.ok(
      result.problems.some((problem) => problem.includes('css/foundry2.css')),
      `expected the missing asset to be named, got: ${result.problems.join(', ')}`
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the missing-chrome message tells the operator what to do', () => {
  // The message IS the fail-closed behaviour as far as a human is concerned. An abort that does not
  // say how to proceed gets worked around rather than fixed.
  const root = scratchRoot();
  try {
    const message = missingChromeMessage(root);
    // Collapsed, because the message is hard-wrapped for a terminal and a promise that happens to
    // straddle a line break is still the promise. Pinning the wrapping instead makes an editorial
    // reflow look like a lost guarantee.
    const flowed = message.replaceAll(/\s+/g, ' ');
    assert.match(flowed, /viewlab:chrome:harvest/);
    assert.match(flowed, /never downloads them for you/);
    // Both sources must be named. The message used to claim it read the operator's desktop install
    // while only ever reading the release archive; now it reads both, and says which is which.
    assert.match(flowed, /release archive/);
    assert.match(flowed, /--from-dir/);
    assert.ok(message.includes(CHROME_CACHE_DIRNAME), 'should name where it looked');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/* -------------------------------------------------------------------------- */
/*  Provenance may only be recorded from the source CI can reproduce           */
/* -------------------------------------------------------------------------- */

test('provenance may be written from a release-archive harvest', () => {
  assertProvenanceWritable({ manifest: { source: { kind: 'release-archive' }, foundryVersion: '14.365' } });
});

test('provenance is refused for a local-install harvest, and says why', () => {
  // The two sources hold the same Foundry and different bytes: the Windows installer ships
  // `application.mjs` with CRLF where the release archive uses LF (verified against 14.365 — 87904
  // bytes with 2258 CRLF versus 85646 with none). CI harvests the archive and checks the recorded
  // digests on the runner that draws, so an install-derived record would fail the drift gate on
  // every later pull request, for a reason the failure message would not explain.
  assert.throws(
    () =>
      assertProvenanceWritable({
        manifest: { source: { kind: 'local-install' }, foundryVersion: '14.365' },
      }),
    (error) => {
      const flowed = error.message.replaceAll(/\s+/g, ' ');
      assert.match(flowed, /refusing to write/);
      assert.ok(flowed.includes(PROVENANCE_PATH), 'names the file it refused to write');
      assert.match(flowed, /line endings/, 'explains WHY, not just that it refused');
      assert.match(flowed, /--force --write-provenance/, 'names the command that would work');
      assert.match(flowed, /--from-dir remains fine for rendering/, 'does not overstate the limit');
      return true;
    }
  );
});

test('an unrecognised harvest source is refused rather than assumed safe', () => {
  // Fail closed on a kind nobody has thought about yet: a future source that turned out to be
  // byte-divergent would otherwise quietly poison the record.
  assert.throws(() =>
    assertProvenanceWritable({ manifest: { source: { kind: 'container' }, foundryVersion: '14.365' } })
  );
});
