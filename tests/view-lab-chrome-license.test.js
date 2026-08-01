/**
 * The View Lab draws real Foundry window chrome, harvested from the maintainer's own licensed
 * installation. Those bytes are proprietary — Foundry's own, plus Font Awesome 6 Pro and Modesto
 * Condensed, which Foundry licenses from third parties. This repository is public.
 *
 * So the rule is deliberately absolute and mechanically checked: NOTHING harvested is ever
 * tracked. Not "nothing except the OFL faces" — Signika, Amiri, and Bruno Ace are open-licensed
 * and technically redistributable, but they arrive through the same code path from the same tree,
 * and one rule is auditable where a per-file licence exception matrix is not.
 *
 * What IS fine, and must stay fine: the captured PNGs. A screenshot of an application for review
 * is normal, and the live smoke already publishes exactly such frames to S3. Nobody should
 * "solve" the licensing question by deleting the publish path.
 *
 * This test never skips. It is the enforcement, so it has to be red on a machine that has never
 * run a harvest.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { CHROME_CACHE_DIRNAME, PROVENANCE_PATH } from '../scripts/lib/foundryChromeCache.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Paths that may never be tracked. Written as patterns over the whole repo rather than as a list
 * of expected cache paths, so a harvested file copied ANYWHERE — including a well-meaning
 * "let's just commit the stylesheet so CI works" — is caught, not only one left in the cache.
 */
const FORBIDDEN_TRACKED_PATTERNS = [
  { pattern: /(^|\/)foundry2(\.min)?\.css$/i, why: "Foundry core stylesheet" },
  { pattern: /(^|\/)fa-[a-z0-9-]+\.(woff2?|ttf|eot|otf)$/i, why: 'Font Awesome 6 Pro webfont' },
  { pattern: /(^|\/)signika[a-z0-9-]*\.(woff2?|ttf|otf)$/i, why: 'Foundry-bundled Signika' },
  { pattern: /(^|\/)modesto-condensed[a-z0-9-]*\.(woff2?|ttf|otf)$/i, why: 'Modesto Condensed' },
  { pattern: /(^|\/)(amiri|bruno-ace)[a-z0-9-]*\.(woff2?|ttf|otf)$/i, why: 'Foundry-bundled face' },
  { pattern: /^\.foundry-chrome\//, why: 'the harvested chrome cache' },
  // Both harvested client modules, named individually rather than by a directory glob so that
  // adding a third is a deliberate act. `application.mjs` supplies the window frame and
  // `dialog.mjs` the DialogV2 frame; both are transcribed into `foundryChromeSpec.js` and neither
  // may be committed. The `.foundry-chrome/` rule above already covers the cache location — these
  // catch a copy taken anywhere else in the tree, which is how licensed source usually escapes.
  { pattern: /(^|\/)client\/applications\/api\/application\.mjs$/, why: 'Foundry client source' },
  { pattern: /(^|\/)client\/applications\/api\/dialog\.mjs$/, why: 'Foundry client source' },
];

/**
 * The previous View Lab attempt committed Font Awesome FREE plus OFL Signika under `assets/fonts/`,
 * believing that was the same artifact Foundry serves. It is not: Foundry ships Font Awesome PRO,
 * a different glyph set, so those files would silently render the wrong icons while looking
 * legitimate. They must not come back with a cherry-pick.
 */
const FORBIDDEN_TRACKED_PREFIXES = [
  { prefix: 'assets/fonts/fontawesome/', why: 'Font Awesome is harvested, never vendored' },
  { prefix: 'assets/fonts/signika', why: 'Signika is harvested, never vendored' },
];

function trackedFiles() {
  return execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
}

test('no harvested Foundry asset is tracked in the repository', () => {
  const offenders = [];
  for (const file of trackedFiles()) {
    for (const { pattern, why } of FORBIDDEN_TRACKED_PATTERNS) {
      if (pattern.test(file)) offenders.push(`${file} (${why})`);
    }
    for (const { prefix, why } of FORBIDDEN_TRACKED_PREFIXES) {
      if (file.startsWith(prefix)) offenders.push(`${file} (${why})`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `Proprietary Foundry assets must never be committed. Untrack these and re-run the harvest ` +
      `locally instead (npm run viewlab:chrome:harvest):\n  ${offenders.join('\n  ')}`
  );
});

test('the chrome cache stays gitignored', () => {
  const gitignore = readFileSync(resolve(ROOT, '.gitignore'), 'utf8');
  assert.ok(
    gitignore.split(/\r?\n/).some((line) => line.trim() === `/${CHROME_CACHE_DIRNAME}/`),
    `.gitignore must contain "/${CHROME_CACHE_DIRNAME}/" — without it the next harvest shows up ` +
      'as ~40 untracked proprietary files, one "git add ." away from being published.'
  );
});

test('the tracked provenance record carries metadata only, never licensed bytes', () => {
  const path = resolve(ROOT, PROVENANCE_PATH);
  const raw = readFileSync(path, 'utf8');
  // A record of ~40 asset digests is a few KB. Anything approaching this ceiling is not metadata.
  assert.ok(
    statSync(path).size < 64 * 1024,
    `${PROVENANCE_PATH} is ${statSync(path).size} bytes; a provenance record is metadata and should ` +
      'be a few KB. Something is being embedded that should not be.'
  );

  const provenance = JSON.parse(raw);
  assert.deepEqual(
    Object.keys(provenance).sort(),
    ['assets', 'chromeMarkup', 'foundryVersion', 'harvestedAt', 'schemaVersion', 'source', 'trees'],
    `${PROVENANCE_PATH} has unexpected top-level keys; the shape is pinned so a new one cannot ` +
      'quietly become a payload.'
  );
  // `harvestedAt` is null on purpose: a real timestamp would churn a tracked file on every harvest.
  assert.equal(provenance.harvestedAt, null);
  assert.ok(Array.isArray(provenance.assets) && provenance.assets.length > 0);

  const forbiddenKeys = new Set(['data', 'content', 'base64', 'bytes64', 'body', 'text']);
  const walk = (value, path_) => {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, `${path_}[${index}]`));
      return;
    }
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        assert.ok(
          !forbiddenKeys.has(key),
          `${PROVENANCE_PATH} contains a "${key}" key at ${path_} — provenance records digests, ` +
            'never file contents.'
        );
        walk(child, `${path_}.${key}`);
      }
      return;
    }
    assert.ok(
      value === null || ['string', 'number', 'boolean'].includes(typeof value),
      `${PROVENANCE_PATH} has a non-scalar leaf at ${path_}`
    );
  };
  walk(provenance, '$');
});
