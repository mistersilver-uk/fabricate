/**
 * EVERY Vite server a test boots MUST own its dep-optimizer cache directory.
 *
 * `node --test` runs test FILES in separate processes, several at a time, and five of them boot a
 * real Vite server through the two helpers this file reads. Every one of those servers is rooted at
 * the repository, so on Vite's default `cacheDir` they all optimize into the SAME
 * `<root>/node_modules/.vite`. When one process discovers a bare import the current pre-bundle
 * lacks, Vite rewrites that bundle under a new hash and fails every request another process has in
 * flight against the old hash with `ERR_OUTDATED_OPTIMIZED_DEP`.
 *
 * WHY THIS IS PINNED BY SOURCE TEXT rather than by reproducing the race. The race is a cold-cache
 * one: a warm `node_modules/.vite` already holds every dep all five files ask for, so a test that
 * tried to observe it would pass for the wrong reason on every developer machine and every second
 * run. CI checks out fresh and is cold every time, which is where it actually bites — at issue 1654
 * it failed `unit-tests` deterministically, twice, reporting
 * `not ok - a forced close never consults the companion, however dirty it is` with a pre-bundle
 * error that assertion has nothing to do with. A grep for the option is the only guard that holds
 * regardless of cache warmth.
 *
 * It also pins the COUNT, so a fourth `createServer` call added to these helpers without the option
 * fails here rather than reintroducing the race for whoever next changes the suite's shape.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const HARNESSES = [
  'tests/helpers/extension-composition-harness.js',
  'tests/helpers/vite-fixture-server.js',
];
const EXPECTED_SERVERS = 3;

/**
 * @param {string} relativePath Repository-relative path to read.
 * @returns {string} The file's contents.
 */
function sourceOf(relativePath) {
  return readFileSync(resolve(import.meta.dirname, '..', relativePath), 'utf8');
}

test('every Vite server a test helper boots passes a per-process cacheDir', () => {
  let servers = 0;
  for (const relativePath of HARNESSES) {
    const source = sourceOf(relativePath);
    const calls = source.match(/createServer\(\{/g) ?? [];
    assert.ok(
      calls.length > 0,
      `${relativePath}: this guard is about createServer call sites, and found none — if the helper` +
        ' stopped booting Vite, drop its entry rather than leaving a clause that quantifies over' +
        ' nothing'
    );
    servers += calls.length;
    assert.equal(
      source.match(/cacheDir: viteDepCacheDir\(\),/g)?.length ?? 0,
      calls.length,
      `${relativePath}: every createServer call must pass cacheDir: viteDepCacheDir(), or its` +
        ' process shares node_modules/.vite with every other test process and races them'
    );
    assert.match(
      source,
      /import \{ viteDepCacheDir \} from '\.\/vite-dep-cache-dir\.js';/,
      `${relativePath}: the cacheDir must come from the shared per-process helper, not a local path`
    );
  }
  assert.equal(
    servers,
    EXPECTED_SERVERS,
    'the count is pinned so a new Vite server added to these helpers must come past this guard'
  );
});

test('the helper hands every caller in one process the SAME directory, and nobody else it', async () => {
  const { viteDepCacheDir } = await import('./helpers/vite-dep-cache-dir.js');
  const first = viteDepCacheDir();
  assert.equal(
    viteDepCacheDir(),
    first,
    'two servers in one process must share one optimized bundle'
  );
  assert.ok(
    !first.includes('node_modules'),
    'the directory must sit outside the repository tree every test process has in common'
  );
  assert.match(first, /fabricate-vite-deps-/, 'the directory must be identifiable as this run');
});
