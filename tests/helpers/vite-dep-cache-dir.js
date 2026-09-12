/**
 * A dep-optimizer cache directory no other test process can invalidate.
 *
 * `node --test` runs test files in parallel processes; five of them boot a Vite server rooted at
 * the repository, so Vite's default `cacheDir` has them share one `<root>/node_modules/.vite` and
 * fail each other's in-flight requests with `ERR_OUTDATED_OPTIMIZED_DEP` whenever one rewrites the
 * pre-bundle. The race is cold-cache only, which is why it reads as intermittent (issue 1654).
 *
 * One directory per process rather than per server: two servers inside one file are sequential, so
 * sharing an optimized bundle is safe and keeps the second boot warm.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let cacheDir = null;

/** The calling process's own cache directory, to pass as `createServer({ cacheDir })`. */
export function viteDepCacheDir() {
  if (cacheDir !== null) return cacheDir;
  cacheDir = mkdtempSync(join(tmpdir(), 'fabricate-vite-deps-'));
  // `exit` rather than a teardown per harness: the directory belongs to the process, and a test
  // that throws past its own `finally` must not leave it behind.
  process.on('exit', () => {
    try {
      rmSync(cacheDir, { recursive: true, force: true });
    } catch {
      // A temp directory that outlives the run is noise, never a test failure.
    }
  });
  return cacheDir;
}
