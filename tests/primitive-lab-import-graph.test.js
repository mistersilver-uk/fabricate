/**
 * The library capture's import graphs (issue 2413): its selection loads with no packages
 * installed, and every repository file the capture, the lab's Vite config and the page's own
 * modules reach selects library coverage when it changes.
 */
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { selectLibraryTargets } from '../scripts/lib/primitiveLabSelection.js';
import { COVERAGE_KEY } from '../scripts/lib/primitiveLabUnits.js';

import { walkStaticImports } from './helpers/staticImportGraph.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE_DIRECTORY = 'tests/view-lab/primitives';

test('the selection and the catalogue reader reach only node: built-ins', () => {
  const { files, bare } = walkStaticImports(ROOT, [
    'scripts/lib/primitiveLabSelection.js',
    'scripts/lib/primitiveLabCatalogue.js',
    'scripts/lib/primitiveLabUnits.js',
  ]);
  assert.ok(files.includes('scripts/lib/viewLabCases.js'), 'the walk follows the hunk helpers');
  assert.deepEqual(
    bare.filter(({ specifier }) => !specifier.startsWith('node:')),
    [],
    'the select job runs these with no packages installed'
  );
});

test("every repository file the capture, the lab's config and its page import selects coverage", () => {
  const excluded = (file) =>
    file.startsWith('src/') ||
    /^tests\/view-lab\/primitives\/(?:catalogue\/[^/]+\.json|fixtures\/)/.test(file);
  const pageModules = readdirSync(path.join(ROOT, PAGE_DIRECTORY))
    .filter((name) => name.endsWith('.js'))
    .map((name) => `${PAGE_DIRECTORY}/${name}`);
  const { files } = walkStaticImports(
    ROOT,
    ['scripts/primitive-lab-capture.mjs', 'tests/view-lab/vite.config.js', ...pageModules],
    { follows: (file) => !excluded(file) }
  );
  const reached = files.filter((file) => !excluded(file));
  for (const file of [
    'scripts/lib/primitiveLabSmoke.js',
    'tests/view-lab/foundryFrame.js',
    'tests/view-lab/foundry/installFoundryShim.js',
    'tests/view-lab/chrome-provenance.json',
    'scripts/lib/viewLabRenderPool.js',
  ]) {
    assert.ok(reached.includes(file), `the walk no longer reaches ${file}: ${reached.join(', ')}`);
  }
  assert.ok(
    !reached.includes('scripts/lib/viewLabCases.js'),
    'the app case registry is not machinery'
  );
  for (const file of reached) {
    const keys = selectLibraryTargets([file]).map((record) => record.key);
    assert.deepEqual(keys, [COVERAGE_KEY], `${file} is lab machinery and must select coverage`);
  }
});
