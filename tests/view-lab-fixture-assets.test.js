/**
 * Every asset path the lab world names must RESOLVE in the harvested Foundry chrome. The gap this
 * closes, in the words of the fixture that paid for it: `labContent.js` once carried
 * `icons/commodities/tree/…`, a path Foundry does not serve (issue 1371).
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
    // The positive control for the check itself: `commodities/tree` is the directory the original
    // defect invented, and it must still be absent for the assertions above to mean anything.
    assert.deepEqual(unresolved([`${MOUNT}icons/commodities/tree/tree-oak-green.webp`]).length, 1);
    assert.equal(unresolved([`${MOUNT}icons/commodities/gems/gem-amber-insect-orange.webp`]).length, 0);
  });
});
