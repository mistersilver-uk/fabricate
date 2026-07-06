/**
 * Q5 — fixture completeness guard. Fails if the shared multi-feature fixture is
 * missing any feature the issue's acceptance checklist requires, so the fixture
 * cannot silently drift below required coverage.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const { buildFullAuthoringFixture, REQUIRED_FIXTURE_FEATURES } = await import(
  './helpers/fullAuthoringFixture.js'
);

test('fixture: covers every required authoring feature', () => {
  const fixture = buildFullAuthoringFixture();
  const missing = REQUIRED_FIXTURE_FEATURES.filter(([, predicate]) => !predicate(fixture)).map(
    ([label]) => label
  );
  assert.deepEqual(missing, [], `fixture is missing required features: ${missing.join(', ')}`);
});

test('fixture: is a fresh deep copy on each call (no shared mutable state)', () => {
  const a = buildFullAuthoringFixture();
  const b = buildFullAuthoringFixture();
  a.system.name = 'mutated';
  assert.notEqual(b.system.name, 'mutated');
});
