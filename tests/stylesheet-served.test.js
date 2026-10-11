/**
 * The fixture server and the View Lab serve the module sheet's entry and each partial raw from
 * `styles/`, and nothing outside it (issue 1711).
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer as createNetServer } from 'node:net';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { STYLESHEET_ENTRY, stylesheetSources } from '../scripts/lib/stylesheetSource.js';

import { repoRoot } from './helpers/sourceScan.js';
import { stylesFileFor } from './helpers/vite-fixture-server.js';

test('the fixture raw mount serves a styles/ basename and nothing outside styles/', () => {
  assert.equal(stylesFileFor('fabricate.css?v=1'), path.join(repoRoot, STYLESHEET_ENTRY));
  for (const request of [
    '../module.json',
    '..%2Fmodule.json',
    'sub/fabricate.css',
    '%E0%A4%A',
    'absent.css',
  ]) {
    assert.equal(stylesFileFor(request), null, request);
  }
});

/** An OS-assigned free port, because Vite reads `port: 0` as its own default. */
function freePort() {
  return new Promise((done) => {
    const probe = createNetServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => done(port));
    });
  });
}

const VITE = import.meta.resolve('vite');
const DEP_CACHE = pathToFileURL(path.join(repoRoot, 'tests/helpers/vite-dep-cache-dir.js')).href;
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

/** Every file the module sheet is served as: the entry, then each partial it imports. */
function servedSheetFiles() {
  const { entry, parts } = stylesheetSources();
  return [{ file: STYLESHEET_ENTRY, text: entry }, ...parts];
}

// A child process, because Node 22 can crash on exit after Vite has bundled a config; the digests
// are printed before then.
test('the View Lab serves the module sheet and its partials raw from its bundled config', async () => {
  const port = await freePort();
  const files = servedSheetFiles();
  const boot = `import { createHash } from 'node:crypto';
import { createServer } from ${JSON.stringify(VITE)};
import { viteDepCacheDir } from ${JSON.stringify(DEP_CACHE)};
const server = await createServer({
  configFile: ${JSON.stringify(path.join(repoRoot, 'tests/view-lab/vite.config.js'))},
  cacheDir: viteDepCacheDir(),
  server: { port: ${port}, watch: null },
  logLevel: 'silent',
});
await server.listen();
const served = [];
for (const file of ${JSON.stringify(files.map(({ file }) => path.basename(file)))}) {
  const response = await fetch('http://127.0.0.1:${port}/@fabricate-styles/' + file);
  const body = await response.text();
  served.push({ status: response.status, sha256: createHash('sha256').update(body).digest('hex') });
}
console.log(JSON.stringify(served));
await server.close();`;
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_OPTIONS;
  const run = spawnSync(
    process.execPath,
    ['--conditions=browser', '--input-type=module', '-e', boot],
    { cwd: repoRoot, encoding: 'utf8', env }
  );
  const [line] = run.stdout.trim().split('\n');
  assert.deepEqual(
    JSON.parse(line ?? '[]'),
    files.map(({ text }) => ({ status: 200, sha256: sha256(text) })),
    run.stdout + run.stderr
  );
});
