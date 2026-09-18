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

// Directories under docs/ that are generated or vendored, never authored — they must not count as
// references (otherwise a stale build artefact could keep a deleted screenshot "alive").
const IGNORED_DOCS_DIRS = new Set([
  '_site',
  'vendor',
  '.jekyll-cache',
  'node_modules',
  '_includes',
  '_layouts',
  '_data',
]);

// This test owns the FLAT `docs/img/screenshots/` directory and the hand-curated frames in it —
// one, now that every curated frame a view case can reach has been replaced by a generated one.
const screenshotEntries = await readdir(screenshotsDir, { withFileTypes: true });
const isGeneratedFrame = entry => entry.isFile() && extname(entry.name).toLowerCase() === '.webp';
const screenshotFiles = screenshotEntries
  .filter(isGeneratedFrame)
  .map(entry => entry.name)
  .sort((a, b) => a.localeCompare(b, 'en'));

// Everything in the flat directory that the `.webp` filter above drops.
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

// The whole of what is left in the flat directory, each entry saying why no view case can reach it.
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
