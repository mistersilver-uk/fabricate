/** The documentation screenshot map, gated in both directions. */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  LAB_SCREENSHOT_DIRECTORY,
  SOURCE_DIGEST_PATTERN,
  collectSlotReferences,
  expectedProvenance,
  labAssetPath,
  listLabAssets,
  readDocsScreenshotMap,
} from '../scripts/lib/docsScreenshotMap.js';
import { VIEW_LAB_CASES } from '../scripts/lib/viewLabCases.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const docsDir = join(root, 'docs');

/** Directories under `docs/` that are generated or vendored, and so cannot declare a slot. */
const IGNORED_DOCS_DIRS = new Set(['_site', 'vendor', '.jekyll-cache', 'node_modules']);

const map = await readDocsScreenshotMap(root);
const { referenced, unreadable } = await collectSlotReferences(docsDir, IGNORED_DOCS_DIRS);
const committed = await listLabAssets(root);
const registry = new Map(VIEW_LAB_CASES.map((viewCase) => [viewCase.id, viewCase]));
const mapped = new Set(map.screenshots.map((entry) => entry.case));

/** A repository-relative page path, so a failure message reads the same on every host. */
function relativePage(file) {
  return file.slice(root.length + 1).replaceAll('\\', '/');
}

test('the map, the committed images and the declared slots are all alive', () => {
  assert.ok(map.screenshots.length > 0, 'the map names no cases at all — every gate below is vacuous');
  assert.ok(
    committed.length > 0,
    `no images were enumerated in ${LAB_SCREENSHOT_DIRECTORY}, so the reverse gate is vacuous`
  );
  assert.ok(
    referenced.size > 0,
    'no documentation page declares an image slot, so the orphan gate below is vacuous — repair' +
      ' the slot pattern in scripts/lib/docsScreenshotMap.js rather than deleting the assertion'
  );
  assert.ok(registry.size > 0, 'the View Lab case registry is empty');
});

test('every mapped case is a publishable View Lab case that reaches the state it names', () => {
  const unknown = map.screenshots.filter((entry) => !registry.has(entry.case));
  assert.deepEqual(
    unknown.map((entry) => entry.case),
    [],
    'these mapped cases are not in the View Lab case registry — a case id was renamed or removed' +
      ' without the map following it'
  );

  const unpublishable = map.screenshots.filter((entry) => !registry.get(entry.case).publish);
  assert.deepEqual(
    unpublishable.map((entry) => entry.case),
    [],
    'these mapped cases do not publish, so the documentation site would carry a frame the View Lab' +
      ' itself declines to hand out'
  );

  const shortfall = map.screenshots.filter(
    (entry) => registry.get(entry.case).reaches === 'window'
  );
  assert.deepEqual(
    shortfall.map((entry) => entry.case),
    [],
    'these mapped cases reach the right application window but not the state their name implies,' +
      ' so publishing one as a documentation reference would illustrate the wrong thing'
  );
});

test('every mapped case has its generated image committed', () => {
  const missing = map.screenshots
    .map((entry) => entry.case)
    .filter((caseId) => !existsSync(join(root, labAssetPath(caseId))));
  assert.deepEqual(
    missing,
    [],
    'these mapped cases have no committed image, so their slot would render a hole — run' +
      ' `npm run docs:screenshots` to generate them'
  );
});

test('every mapped case is referenced by an image slot on an authored page', () => {
  const orphans = map.screenshots
    .map((entry) => entry.case)
    .filter((caseId) => !referenced.has(caseId));
  assert.deepEqual(
    orphans,
    [],
    'these cases are mapped and committed but no page shows them — declare a slot for each, or' +
      ' drop the entry and its image'
  );
});

test('every image in the generated directory is named by the map', () => {
  const unmapped = committed.filter((file) => !mapped.has(file.replace(/\.webp$/, '')));
  assert.deepEqual(
    unmapped,
    [],
    `these files sit in ${LAB_SCREENSHOT_DIRECTORY} without a map entry, so nothing says where they` +
      ' came from. Every image here is generated from a named case: map it, or delete it'
  );
});

test('every declared image slot names a mapped case', () => {
  assert.deepEqual(
    unreadable,
    [],
    'these image slots do not name a case that can be read, so they cannot be gated at all'
  );

  const dangling = [...referenced]
    .filter(([caseId]) => !mapped.has(caseId))
    .map(([caseId, pages]) => `${caseId} (${pages.map(relativePage).join(', ')})`)
    .sort((left, right) => left.localeCompare(right, 'en'));
  assert.deepEqual(
    dangling,
    [],
    'these pages declare a slot for a case the map does not carry, so the page would render a hole'
  );
});

test('every mapped case describes what its frame shows', () => {
  const undescribed = map.screenshots
    .filter((entry) => typeof entry.alt !== 'string' || entry.alt.trim() === '')
    .map((entry) => entry.case);
  assert.deepEqual(
    undescribed,
    [],
    'these mapped cases record no description, so every page showing them presents the frame to a' +
      ' screen reader as nothing at all. The description lives beside the case id so one frame is' +
      ' described once however many pages use it — write one there rather than at each slot'
  );
});

test('every recorded digest is a distinct lowercase SHA-256', () => {
  const malformed = map.screenshots
    .filter((entry) => !SOURCE_DIGEST_PATTERN.test(entry.sha256 ?? ''))
    .map((entry) => `${entry.case}: ${entry.sha256}`);
  assert.deepEqual(
    malformed,
    [],
    'a digest must be the source frame’s SHA-256 in 64 lowercase hex characters'
  );

  const byDigest = new Map();
  for (const entry of map.screenshots) {
    byDigest.set(entry.sha256, [...(byDigest.get(entry.sha256) ?? []), entry.case]);
  }
  const collisions = [...byDigest.values()]
    .filter((cases) => cases.length > 1)
    .map((cases) => cases.join(' = '));
  assert.deepEqual(
    collisions,
    [],
    'these cases render byte-identical frames, so one of them is publishing the other’s picture' +
      ' under a name that promises something else. Map only one of them, and let both pages point' +
      ' at it'
  );
});

test('the map records the provenance that produced its frames', async () => {
  assert.deepEqual(
    map.provenance,
    await expectedProvenance(root),
    'the recorded provenance no longer describes this checkout. A Foundry chrome rotation or a' +
      ' Playwright resolution change rewrites every frame with no visual change to review, so it' +
      ' lands as its own commit — regenerate the set rather than editing this header by hand'
  );
});
