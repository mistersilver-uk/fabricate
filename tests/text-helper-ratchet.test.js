/**
 * Local `text` helpers (issue 1521): `src/ui/svelte/util/localizeOr.js` is the one implementation,
 * so no design-system member defines its own and the `src/` count holds at its ceiling.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { DESIGN_SYSTEM_PRIMITIVES } from '../scripts/lib/designSystemPrimitives.js';

import { collectSources, repoRoot } from './helpers/sourceScan.js';

const TEXT_HELPER = /\b(function\s+text\s*\(|(const|let)\s+text\s*=)/;

/** The most files under `src/` that may define one: the exact count, lowered as files convert. */
const CEILING = 201;

const sources = collectSources(`${repoRoot}/src`);

test('the pattern matches each helper shape and nothing that merely reads a `text`', () => {
  for (const shape of ['function text(key) {}', 'const text = (k) => k;', 'let text= input;']) {
    assert.ok(TEXT_HELPER.test(shape), shape);
  }
  for (const shape of ['const textual = 1;', 'node.text(k);', '{ text: copy }', 'subtext = 1']) {
    assert.ok(!TEXT_HELPER.test(shape), shape);
  }
  assert.ok(Object.keys(sources).length > 900, 'the scan reaches the whole src/ tree');
});

test('no more src/ files define a local text helper than the ceiling', () => {
  const defining = Object.keys(sources).filter((file) => TEXT_HELPER.test(sources[file]));
  assert.ok(
    defining.length <= CEILING,
    `${defining.length} files define a local \`text\` helper against a ceiling of ${CEILING}; ` +
      'import `localizeOr` from `src/ui/svelte/util/localizeOr.js` instead'
  );
});

test('no design-system member defines a local text helper', () => {
  const members = DESIGN_SYSTEM_PRIMITIVES.map((row) => row.path);
  assert.ok(members.length > 50, 'the manifest still lists its members');
  assert.deepEqual(
    members.filter((file) => TEXT_HELPER.test(sources[file] ?? '')),
    [],
    'a member localizes through `localizeOr`'
  );
});
