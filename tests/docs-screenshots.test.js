import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { collectDocSourceFiles } from '../scripts/lib/docsScreenshotMap.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const docsDir = join(root, 'docs');
const screenshotsDir = join(docsDir, 'img', 'screenshots');

// Directories under docs/ that are generated or vendored, never authored — they
// must not count as references (otherwise a stale build artefact could keep a
// deleted screenshot "alive").
//
// `_includes`, `_layouts` and `_data` are skipped for a second reason. Jekyll's
// template machinery lives there in .html and .json files, and this test scans
// authored pages for literal screenshot file names. An image template under
// `_includes` mentioning one would be a reference no page actually makes — a
// phantom that keeps a deleted screenshot alive forever, which is exactly the
// failure the orphan assertion below exists to catch.
const IGNORED_DOCS_DIRS = new Set([
  '_site',
  'vendor',
  '.jekyll-cache',
  'node_modules',
  '_includes',
  '_layouts',
  '_data',
]);

// This test owns the FLAT `docs/img/screenshots/` directory and the hand-curated
// frames in it — one, now that every curated frame a view case can reach has been
// replaced by a generated one. `docs/img/screenshots/lab/` holds generated frames
// and belongs to `tests/docs-screenshot-map.test.js`. Two facts keep those
// populations apart, and both are load-bearing rather than incidental:
//
//   1. the readdir below is NOT recursive, so `lab/` is never enumerated here;
//   2. the reference pattern's character class contains no `/`, so it cannot
//      match a `screenshots/lab/<name>.webp` path either.
//
// Change either one and this test starts claiming frames it does not own, while
// the map test still claims them too — and a file both tests believe the other
// is checking is a file neither is.
const screenshotFiles = (await readdir(screenshotsDir))
  .filter(file => extname(file).toLowerCase() === '.webp')
  .sort((a, b) => a.localeCompare(b, 'en'));

const docFiles = await collectDocSourceFiles(docsDir, IGNORED_DOCS_DIRS);
const referenced = new Set();
for (const file of docFiles) {
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/screenshots\/([a-zA-Z0-9_-]+\.webp)/g)) {
    referenced.add(match[1]);
  }
}

// Guard against deleted documentation screenshots silently creeping back in.
// Every committed screenshot must earn its place by being referenced from an
// authored docs page; an orphaned .webp (e.g. one re-added from a smoke run
// after its docs reference was removed) fails this test. The smoke harness only
// writes frames to the transient test-results/ directory, so a screenshot
// reaching docs/img/screenshots/ is always a deliberate curation — this keeps
// that set honest. See CONTRIBUTING.md for the curation workflow.
test('every committed docs screenshot is referenced by an authored docs page', () => {
  const orphans = screenshotFiles.filter(file => !referenced.has(file));
  assert.deepEqual(
    orphans,
    [],
    `Unreferenced docs screenshot(s) in docs/img/screenshots/ — reference them from a docs page or delete the file(s): ${orphans.join(', ')}`
  );
});

test('every docs screenshot reference resolves to a committed file', () => {
  const present = new Set(screenshotFiles);
  const dangling = [...referenced].filter(file => !present.has(file)).sort((a, b) => a.localeCompare(b, 'en'));
  assert.deepEqual(
    dangling,
    [],
    `Docs reference screenshot file(s) missing from docs/img/screenshots/: ${dangling.join(', ')}`
  );
});
