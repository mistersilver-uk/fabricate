/**
 * Every reader of the module sheet goes through the loader (issue 1711): the preloaded guard
 * refuses any other open of the sheet or a partial, reaches node:test's child processes, and a
 * static rule refuses the reads it cannot see, a Vite `?raw`/`?inline` import or `addStyleTag`.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { STYLESHEET_ENTRY, stylesheetSources } from '../scripts/lib/stylesheetSource.js';

import { collectWorkingTreeSources, repoRoot } from './helpers/sourceScan.js';
import { stylesFileFor } from './helpers/vite-fixture-server.js';

const GUARD = './tests/helpers/stylesheetReadGuard.js';
const SHEET = path.join(repoRoot, 'styles', 'fabricate.css');
const LOADER = pathToFileURL(path.join(repoRoot, 'scripts/lib/stylesheetSource.js')).href;
const REFUSED = /styles\/fabricate\.css was opened .* outside the stylesheet loader/u;

function childEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_OPTIONS;
  return env;
}

/** Run `args` in a fresh node from the repo root, with the guard preloaded unless `bare`. */
function node(args, { bare = false, env = {} } = {}) {
  const preload = bare ? [] : ['--import', GUARD];
  return spawnSync(process.execPath, [...preload, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: childEnv(env),
  });
}

const OPENS = `
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
const sheet = ${JSON.stringify(SHEET)};
const attempts = {
  readFileSync: () => fs.readFileSync(sheet, 'utf8'),
  readFile: () => fs.readFile(sheet, () => {}),
  promisesReadFile: () => readFile(sheet).catch(() => {}),
  createReadStream: () => fs.createReadStream(sheet).destroy(),
  openSync: () => fs.closeSync(fs.openSync(sheet, 'r')),
};
const refused = Object.entries(attempts).filter(([, open]) => {
  try { open(); return false; } catch { return true; }
});
console.log(JSON.stringify(refused.map(([name]) => name)));
`;

test('the guard refuses every patched open of the sheet outside the loader', () => {
  const guarded = node(['--input-type=module', '-e', OPENS]);
  assert.equal(guarded.status, 0, guarded.stderr);
  assert.deepEqual(JSON.parse(guarded.stdout), [
    'readFileSync',
    'readFile',
    'promisesReadFile',
    'createReadStream',
    'openSync',
  ]);
  const bare = node(['--input-type=module', '-e', OPENS], { bare: true });
  assert.deepEqual(JSON.parse(bare.stdout), [], 'unguarded, every open succeeds');
});

test('the guard admits the loader and names the reader it refuses', () => {
  const viaLoader = `import { readStylesheet } from ${JSON.stringify(LOADER)};
console.log(readStylesheet().length > 0);`;
  const loaded = node(['--input-type=module', '-e', viaLoader]);
  assert.equal(loaded.stdout.trim(), 'true', loaded.stderr);
  const direct = `import { readFileSync } from 'node:fs';
readFileSync(${JSON.stringify(SHEET)}, 'utf8');`;
  const refused = node(['--input-type=module', '-e', direct]);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, REFUSED);
});

test('the guard resolves a file: URL even where a DOM shim has replaced the URL global', () => {
  const script = `import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const sheetUrl = pathToFileURL(${JSON.stringify(SHEET)});
delete globalThis.URL;
readFileSync(${JSON.stringify(path.join(repoRoot, 'package.json'))}, 'utf8');
readFileSync(sheetUrl, 'utf8');`;
  const run = node(['--input-type=module', '-e', script]);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, REFUSED);
});

test('the guard refuses a partial by name, before the filesystem is asked', () => {
  const probe = path.join(repoRoot, 'styles', 'fabricate-probe.css');
  const run = node([
    '--input-type=module',
    '-e',
    `import { readFileSync } from 'node:fs';
readFileSync(${JSON.stringify(probe)}, 'utf8');`,
  ]);
  assert.notEqual(run.status, 0);
  assert.match(
    run.stderr,
    /styles\/fabricate-probe\.css was opened .* outside the stylesheet loader/u
  );
  assert.doesNotMatch(run.stderr, /ENOENT/u);
});

test('with a log named, the guard records each refused read and lets it through', (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'fabricate-guard-log-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const log = path.join(dir, 'guard.jsonl');
  const direct = `import { readFileSync } from 'node:fs';
readFileSync(${JSON.stringify(SHEET)}, 'utf8');`;
  const run = node(['--input-type=module', '-e', direct], {
    env: { FABRICATE_STYLESHEET_GUARD_LOG: log },
  });
  assert.equal(run.status, 0, run.stderr);
  const [entry] = readFileSync(log, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.equal(entry.file, 'styles/fabricate.css');
});

test('the --import preload reaches the child process node:test runs a test file in', (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'fabricate-guard-probe-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const probe = path.join(dir, 'probe.test.mjs');
  writeFileSync(
    probe,
    `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
test('a direct read of the sheet is refused here', () => {
  assert.throws(() => readFileSync(${JSON.stringify(SHEET)}, 'utf8'), /outside the stylesheet loader/);
});
`
  );
  const guarded = node(['--test', probe]);
  assert.equal(guarded.status, 0, guarded.stdout + guarded.stderr);
  const bare = node(['--test', probe], { bare: true });
  assert.notEqual(bare.status, 0, 'without the preload the probe fails, so it can fail');
});

test('npm test and every CI shard preload the guard', () => {
  const { scripts } = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  for (const name of ['test', 'test:shard']) {
    const args = scripts[name].split(/\s+/u);
    assert.equal(args[args.indexOf('--import') + 1], GUARD, `${name} preloads ${GUARD}`);
    assert.ok(args.indexOf('--import') < args.indexOf('--test'), `${name} preloads before --test`);
  }
});

const SELF = 'tests/stylesheet-read-guard.test.js';
const RAW_IMPORT = /styles\/[\w.-]+\.css\?(?:raw|inline)\b/u;
const PATH_STYLE_TAG = /addStyleTag\(\s*\{[^}]*\bpath\b\s*[:,}]/u;

/** The reads the guard cannot see: Vite inlines a `?raw` import, Playwright an `addStyleTag` path. */
function unguardedReads(sources) {
  return Object.entries(sources)
    .filter(([file, text]) => file !== SELF && (RAW_IMPORT.test(text) || PATH_STYLE_TAG.test(text)))
    .map(([file]) => file);
}

test('no script or test reads a stylesheet through a ?raw import or an addStyleTag path', () => {
  const sources = collectWorkingTreeSources(
    ['scripts', 'tests'],
    ['.js', '.mjs', '.svelte', '.html']
  );
  assert.ok(Object.keys(sources).length > 1000, 'the scan reached scripts/ and tests/');
  assert.deepEqual(unguardedReads(sources), []);
  const offenders = {
    'tests/a.js': `import css from '../styles/fabricate.css?raw';`,
    'tests/b.js': `await page.addStyleTag({ path: sheetPath });`,
    'tests/c.js': `await page.addStyleTag({ content: css });`,
    'tests/d.js': `await page.addStyleTag({ path });`,
  };
  assert.deepEqual(unguardedReads(offenders), ['tests/a.js', 'tests/b.js', 'tests/d.js']);
});

test('the fixture raw mount serves a styles/ basename and nothing outside styles/', () => {
  assert.equal(stylesFileFor('fabricate.css?v=1'), SHEET);
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

/** Every file the module sheet is served as: the entry, then each partial it imports. */
function servedSheetFiles() {
  const { entry, parts } = stylesheetSources();
  return [{ file: STYLESHEET_ENTRY, text: entry }, ...parts];
}

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

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
  const run = node(['--conditions=browser', '--input-type=module', '-e', boot]);
  const [line] = run.stdout.trim().split('\n');
  assert.deepEqual(
    JSON.parse(line ?? '[]'),
    files.map(({ text }) => ({ status: 200, sha256: sha256(text) })),
    run.stdout + run.stderr
  );
});
