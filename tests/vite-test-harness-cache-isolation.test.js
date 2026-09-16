/**
 * Every test Vite factory must use the per-process optimizer cache to prevent cold-cache races.
 * Warm-cache runs cannot prove isolation, so the factory count and cache wiring are pinned.
 * The composition boots share one factory; the fixture server owns the other (issue 1648).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const HARNESSES = [
  'tests/helpers/extension-composition-harness.js',
  'tests/helpers/vite-fixture-server.js',
];
const EXPECTED_SERVERS = 2;

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
