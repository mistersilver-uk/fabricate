/**
 * Every `BROAD_SIGNAL_CASE_OVERRIDES` entry names a frame that draws its component (issues 1572,
 * 1603).
 *
 * The existing clauses prove an override's case ids EXIST and publish; none proves the case renders
 * the component, so re-pointing an entry at a frame that draws none of it stayed green. A frame
 * draws a component when the case is also selected by a change to one of the component's
 * transitive `.svelte` importers (or the `.svelte.js` seam adapter), which is how `mapChangedFilesToCases` already attributes a
 * screen to the files that render it.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { measureImporters } from '../scripts/lib/componentImporters.js';
import {
  BROAD_SIGNAL_CASE_OVERRIDES,
  mapChangedFilesToCases,
} from '../scripts/lib/viewLabCases.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const GRAPH = measureImporters(REPO_ROOT);

/** Every `.svelte` file that imports `file`, directly or through other components. */
function transitiveSvelteImporters(file, graph = GRAPH) {
  const seen = new Set();
  const queue = [file];
  while (queue.length > 0) {
    for (const importer of graph.importersOf(queue.shift())) {
      if (!/\.svelte(?:\.js)?$/u.test(importer) || seen.has(importer)) continue;
      seen.add(importer);
      queue.push(importer);
    }
  }
  return [...seen].sort((left, right) => left.localeCompare(right));
}

/** The override case ids no importer's own change selects, by file. */
function unreachedOverrides(overrides, graph = GRAPH, select = mapChangedFilesToCases) {
  return Object.entries(overrides)
    .filter(([file]) => file.endsWith('.svelte'))
    .flatMap(([file, caseIds]) => {
      const reached = new Set(
        transitiveSvelteImporters(file, graph).flatMap((importer) =>
          select([importer]).map((viewCase) => viewCase.id)
        )
      );
      return caseIds.filter((id) => !reached.has(id)).map((id) => `${file} -> ${id}`);
    });
}

test('the override scan walks a populated table and a populated import graph', () => {
  assert.ok(Object.keys(BROAD_SIGNAL_CASE_OVERRIDES).length >= 40, 'the override table is thin');
  assert.ok(
    transitiveSvelteImporters('src/ui/svelte/components/Chip.svelte').length > 100,
    'the importer walk is not reaching the tree'
  );
});

test('a case no importer of the component selects is refused', () => {
  const graph = { importersOf: (file) => (file === 'Leaf.svelte' ? ['Screen.svelte'] : []) };
  const select = (files) => (files[0] === 'Screen.svelte' ? [{ id: 'drawn' }] : []);
  assert.deepEqual(unreachedOverrides({ 'Leaf.svelte': ['drawn', 'elsewhere'] }, graph, select), [
    'Leaf.svelte -> elsewhere',
  ]);
});

/**
 * The entries no importer's own change selects. Removal-only: an entry that starts to be reached
 * must leave the list, and a new one may not join it. Each of the five that were here named a frame
 * the importer's `sourceMatches` did not spell. Each is now proven by naming the importer that draws
 * it (issue 1603 part (a)), or repointed at a frame the importer already selects. A stylesheet key
 * has no importers, so it is outside this property.
 */
// tracked: issue 1603
const UNPROVEN_BY_IMPORTERS = [];

test('every override names only frames that draw its component, bar the recorded baseline', () => {
  assert.deepEqual(
    unreachedOverrides(BROAD_SIGNAL_CASE_OVERRIDES).sort((left, right) =>
      left.localeCompare(right)
    ),
    UNPROVEN_BY_IMPORTERS,
    'an override names a case that no change to a transitive importer of the component selects, ' +
      'so the frame may not draw it and the primitive keeps publishing a frame that cannot show ' +
      'it. Name a case that renders the component; or, if the frame now draws it, remove the ' +
      'entry from UNPROVEN_BY_IMPORTERS.'
  );
});
