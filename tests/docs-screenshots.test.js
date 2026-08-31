import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  collectDocSourceFiles,
  readDocsScreenshotMap,
} from '../scripts/lib/docsScreenshotMap.js';
import { VIEW_LAB_CASES } from '../scripts/lib/viewLabCases.js';

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
const screenshotEntries = await readdir(screenshotsDir, { withFileTypes: true });
const isGeneratedFrame = entry => entry.isFile() && extname(entry.name).toLowerCase() === '.webp';
const screenshotFiles = screenshotEntries
  .filter(isGeneratedFrame)
  .map(entry => entry.name)
  .sort((a, b) => a.localeCompare(b, 'en'));

// Everything in the flat directory that the `.webp` filter above drops.
//
// Without this the exemption gate is an equality over `.webp` ALONE, so a curated `.png` or
// `.jpg` dropped in here is invisible to all four tests in this file: it is not in
// `screenshotFiles`, so it cannot be an orphan, cannot be missing, and cannot break the
// equality with the enumerated set. Asserting the residue is empty apart from the one
// subdirectory that belongs to another test closes that off at the source, and keeps the
// filter's meaning ("a generated frame is a .webp file") rather than widening it.
const OTHER_TESTS_OWN = ['lab/'];
const unownedEntries = screenshotEntries
  .filter(entry => !isGeneratedFrame(entry))
  .map(entry => (entry.isDirectory() ? `${entry.name}/` : entry.name))
  .sort((a, b) => a.localeCompare(b, 'en'));

const screenshotMap = await readDocsScreenshotMap(root);
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

// The whole of what is left in the flat directory, each entry saying why no view case can
// reach it. This is the exemption the documentation screenshot provenance requirement grants,
// and it is written down HERE rather than inferred from what happens to be on disk, because an
// inferred exemption is not one: "it is exempt because nobody generated it" would license every
// future hand-curated frame, which is the rule this file exists to hold.
//
// The test below asserts EQUALITY with the directory, in both directions. So dropping a curated
// frame means deleting its entry, and adding one means writing a reason next to it in a diff a
// reviewer reads — which is what "adding to it is a visible act" has to mean to be worth saying.
//
// What no test here can decide is whether a given artifact IS an application view — that is a
// reviewer's judgement, and the enumeration exists to force it into a diff someone reads rather
// than to automate it. The mechanical checks below are narrower than the name of the set: they
// refuse an exempt frame that collides with a generated case id or with the generated map.
const NOT_AN_APPLICATION_VIEW = new Map([
  [
    'fabricate-themes.webp',
    'a palette reference board assembled from the stylesheet — theme cards, background swatches, ' +
      'state pills and an essence ramp. The View Lab renders application routes, and no route ' +
      'draws a palette, so no case can reach it and none ever will',
  ],
]);

test('the hand-curated population is exactly the enumerated non-view set', () => {
  assert.ok(
    NOT_AN_APPLICATION_VIEW.size > 0,
    'an empty exempt set makes both directions below vacuous — if the last curated frame is gone, ' +
      'delete this gate and the exemption scenario it holds, rather than leaving a check that ' +
      'cannot fail'
  );

  assert.deepEqual(
    unownedEntries,
    OTHER_TESTS_OWN,
    'docs/img/screenshots/ holds an entry that is neither a .webp frame nor the lab/ subdirectory. ' +
      'The equality below covers .webp only, so a curated .png or .jpg parked here would be ' +
      'exempt from every check in this file: publish it as a generated .webp frame, or delete it'
  );

  const enumerated = [...NOT_AN_APPLICATION_VIEW.keys()].sort((a, b) => a.localeCompare(b, 'en'));
  assert.deepEqual(
    screenshotFiles,
    enumerated,
    'docs/img/screenshots/ no longer holds exactly the frames enumerated as not being application ' +
      'views. A frame here is exempt from generation, so a new one is a hand-curated documentation ' +
      'screenshot: generate it from a named View Lab case instead, or — if it genuinely depicts ' +
      'something the renderer has no route for — add it to NOT_AN_APPLICATION_VIEW with the reason'
  );

  const unexplained = enumerated.filter(file => (NOT_AN_APPLICATION_VIEW.get(file) ?? '').trim().length < 40);
  assert.deepEqual(
    unexplained,
    [],
    'these exempt frames record no reason worth reading. The exemption turns on WHAT THE ARTIFACT ' +
      'IS, so an entry that does not say what it is has not claimed it'
  );
});

test('no exempt frame collides with a generated case or the generated map', () => {
  const caseIds = new Set(VIEW_LAB_CASES.map(viewCase => viewCase.id));
  const namesACase = [...NOT_AN_APPLICATION_VIEW.keys()]
    .map(file => basename(file, '.webp'))
    .filter(stem => caseIds.has(stem));
  assert.deepEqual(
    namesACase,
    [],
    'these exempt frames are named after a registered View Lab case id, so a case reaches that ' +
      'name and the exemption does not apply to it: publish them through an image slot like ' +
      'every other generated frame'
  );

  const mapped = new Set(screenshotMap.screenshots.map(entry => entry.case));
  const alsoGenerated = [...NOT_AN_APPLICATION_VIEW.keys()]
    .map(file => basename(file, '.webp'))
    .filter(stem => mapped.has(stem));
  assert.deepEqual(
    alsoGenerated,
    [],
    'these frames are exempt from generation AND named by the generated map, which cannot both be ' +
      'true of one image'
  );
});
