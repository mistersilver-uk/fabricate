/**
 * Every asset path the lab world names must RESOLVE in the harvested Foundry chrome.
 *
 * The gap this closes, in the words of the fixture that paid for it: `labContent.js` once
 * carried `icons/commodities/tree/…`, a path Foundry does not serve. Nothing saw it. The
 * lab renders a broken image as an empty box, `npm test` never opens the cache, and the only
 * gate that noticed was `manager-components-world-cohort`'s console-error check — which fires
 * during a CAPTURE run, where one miss aborts the whole run and publishes no frame for ANY
 * case. So the cheapest possible defect (a typo in a path) had the most expensive possible
 * failure mode (no screenshot evidence at all, for every case), and it was invisible until a
 * case happened to render the medallion that used it.
 *
 * The check is exact-file, not prefix: a path resolves when the FILE exists under the cache
 * the lab's Vite config mounts at `/@foundry-chrome/` (`tests/view-lab/vite.config.js`), which
 * is the same resolution the browser performs.
 *
 * SKIP POLICY, matching `view-lab-chrome-drift.test.js`: it skips when no chrome has been
 * harvested, because `npm test` must stay runnable without a Foundry licence, and
 * `VIEWLAB_REQUIRE_CHROME=1` turns that skip into a failure on a machine that is supposed to
 * have the cache.
 *
 * AND WHERE IT RUNS IN CI, because a skip policy without one is a test that runs NOWHERE.
 * `ci.yml`'s `npm test` runner harvests no chrome — the cache is a licensed local artefact — so
 * this file skips there on every run, which is one skipped test and zero assertions. The runner
 * that DOES hold a cache is `pr-screenshots.yml`'s capture job, and this suite is named on its
 * "Run every chrome-dependent suite, where a missing harvest fails instead of skipping" step,
 * beside `view-lab-chrome-drift.test.js` and the three rendered component suites, under that
 * step's `VIEWLAB_REQUIRE_CHROME=1`. That is the only place in CI where the skip cannot be taken,
 * and it is the same job whose capture run a missing path would abort. Moving or renaming that
 * step without moving this file leaves the guard executing nowhere again (issue 1371, quality
 * review r9 F2).
 * THIS QUOTE IS THE LAST HAND-HELD ONE, and it is deliberate (issue 1371 r20-entry3). The three
 * rendered component suites read the step's name from `CHROME_STEP_NAME` in
 * `tests/helpers/harvestedFoundryChrome.js` and assert their own presence on it; this is a ROOT
 * suite that mounts nothing, so importing that helper would drag Playwright and the mounted-shell
 * machinery into `npm test`'s cheapest tier for a sentence. The rename in r20 moved four
 * transcriptions to one constant plus this quotation.
 *
 * ONE THING IT DOES NOT COVER, and it is worth knowing before trusting a green run:
 * `resolveChromeCache` selects the NEWEST harvest (`scripts/lib/foundryChromeCache.js`), so with
 * both declared builds on disk this asserts against 14.365 alone and a path present there but
 * absent under the 13.351 minimum stays invisible. Two are known absent under 13.351 today —
 * `tools/smithing/crucible-steel.webp` and `furnace-boiler-steel.webp` — and they are pre-existing
 * rather than introduced here. Widening this to every harvested build is a separate change; the
 * caveat is recorded so a reader does not read "0 missing" as "0 missing on both builds".
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { resolveChromeCache } from '../scripts/lib/foundryChromeCache.js';

import { buildLabActors } from './view-lab/world/labActors.js';
import { buildLabContent } from './view-lab/world/labContent.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MOUNT = '/@foundry-chrome/';
const HARVEST_HINT = 'run: npm run viewlab:chrome:harvest';

const cache = resolveChromeCache(ROOT);
const skip = cache ? false : `no harvested Foundry chrome; ${HARVEST_HINT}`;

if (!cache && process.env.VIEWLAB_REQUIRE_CHROME === '1') {
  test('harvested Foundry chrome is present (VIEWLAB_REQUIRE_CHROME=1)', () => {
    assert.fail(`no cache under .foundry-chrome/, but VIEWLAB_REQUIRE_CHROME=1; ${HARVEST_HINT}`);
  });
}

/**
 * Every mounted asset path reachable from a fixture tree, wherever it sits in it.
 *
 * A deep walk rather than a list of known keys: an image path can be an `img`, a `texture`, a
 * portrait, or a field some future document type introduces, and a walk that only knew today's
 * keys would stop guarding the moment one was added.
 *
 * @param {unknown} node Fixture value to walk.
 * @param {Set<string>} found Accumulator.
 * @param {Set<object>} seen Cycle guard.
 * @returns {Set<string>} Mounted paths.
 */
function assetPaths(node, found = new Set(), seen = new Set()) {
  if (typeof node === 'string') {
    if (node.startsWith(MOUNT)) found.add(node);
    return found;
  }
  if (!node || typeof node !== 'object' || seen.has(node)) return found;
  seen.add(node);
  for (const value of Object.values(node)) assetPaths(value, found, seen);
  return found;
}

/** The paths that do NOT resolve to a file in the cache, with the resolved location. */
function unresolved(paths) {
  return [...paths]
    .filter((path) => !existsSync(join(cache.dir, path.slice(MOUNT.length))))
    .map((path) => `${path} → ${join(cache.dir, path.slice(MOUNT.length))}`);
}

test('every lab asset path resolves in the harvested chrome', { skip }, async (subtests) => {
  const content = buildLabContent();

  await subtests.test('the world content names only paths Foundry serves', () => {
    const paths = assetPaths(content);
    // NON-VACUITY FIRST. A walk that found nothing would report "0 missing" and read exactly
    // like a clean run — which is how a mirror gate stops asserting without saying so.
    assert.ok(paths.size >= 50, `expected the lab world to name assets, found ${paths.size}`);
    assert.deepEqual(unresolved(paths), [], 'a lab asset path 404s in the browser too');
  });

  await subtests.test('the actor portraits resolve too, from the same mount', () => {
    const paths = assetPaths(buildLabActors(content));
    assert.ok(paths.size >= 10, `expected lab actors to carry portraits, found ${paths.size}`);
    assert.deepEqual(unresolved(paths), [], 'an actor portrait 404s in the browser too');
  });

  await subtests.test('a path the cache does not hold IS reported', () => {
    // The positive control for the check itself: `commodities/tree` is the directory the
    // original defect invented, and it must still be absent for the assertions above to mean
    // anything. Without this, a cache that had grown every path would pass vacuously.
    assert.deepEqual(unresolved([`${MOUNT}icons/commodities/tree/tree-oak-green.webp`]).length, 1);
    assert.equal(unresolved([`${MOUNT}icons/commodities/gems/gem-amber-insect-orange.webp`]).length, 0);
  });
});
