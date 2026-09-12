/**
 * A dep-optimizer cache directory that no OTHER TEST PROCESS can invalidate.
 *
 * `node --test` runs test FILES in separate processes, several at a time. Five of them boot a real
 * Vite server (`extension-composition-harness.js` and `vite-fixture-server.js`), every one of them
 * rooted at the repository — so by default every one of them optimizes its bare imports into the
 * SAME `<root>/node_modules/.vite` directory. Vite's optimizer is not built for that: when one
 * process discovers a dep the current pre-bundle lacks it rewrites the bundle under a new hash, and
 * every request another process already has in flight against the old hash is failed with
 * `ERR_OUTDATED_OPTIMIZED_DEP`. The symptom is a window-lifecycle assertion reporting a Vite
 * pre-bundle error it has nothing to do with — measured as
 * `not ok - a forced close never consults the companion, however dirty it is`, carrying
 * `There is a new version of the pre-bundle for ".../deps_ssr/svelte_store.js?v=..."`.
 *
 * IT IS A COLD-CACHE FAILURE, which is why it reads as intermittent and why it hits CI hardest: a
 * warm `node_modules/.vite` already holds every dep all five files ask for, so nothing is
 * discovered and nothing is rewritten. CI checks out fresh and starts cold every run, so the only
 * thing deciding whether the race lands there is how the files happen to interleave — and that
 * shifts whenever the suite's shape changes. Isolating the directory removes the contention
 * instead of re-tuning the timing.
 *
 * ONE DIRECTORY PER PROCESS, not per server: two servers inside one file are sequential, so they
 * can safely share an optimized bundle, and sharing it keeps the second boot warm.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let cacheDir = null;

/**
 * The calling process's own Vite dep-optimizer cache directory, created on first use.
 *
 * @returns {string} An absolute path to pass as `createServer({ cacheDir })`.
 */
export function viteDepCacheDir() {
  if (cacheDir !== null) return cacheDir;
  cacheDir = mkdtempSync(join(tmpdir(), 'fabricate-vite-deps-'));
  // `exit` rather than an explicit teardown in each harness: the directory belongs to the PROCESS,
  // and a test that throws past its own `finally` must not leave it behind.
  process.on('exit', () => {
    try {
      rmSync(cacheDir, { recursive: true, force: true });
    } catch {
      // A temp directory that outlives the run is noise, never a test failure.
    }
  });
  return cacheDir;
}
