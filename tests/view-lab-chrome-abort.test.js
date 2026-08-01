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
    assert.match(message, /viewlab:chrome:harvest/);
    assert.match(message, /never downloads them for you/);
    assert.ok(message.includes(CHROME_CACHE_DIRNAME), 'should name where it looked');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
