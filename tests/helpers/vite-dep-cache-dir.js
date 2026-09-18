/** A dep-optimizer cache directory no other test process can invalidate (issue 1654). */
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
