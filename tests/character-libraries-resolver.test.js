// The read side of the WORLD character libraries (issue 1308): `resolveModifierLibrary` and
// `resolveCharacterPrerequisiteLibrary`.
//
// WHY THIS SUITE EXISTS, AND WHY IT IS NOT REDUNDANT. Every runtime reader of these two libraries
// goes through this module, and the five older suites that exercise those readers all hand-build
// systems carrying the LEGACY in-system keys. So they stay green through the world arm being
// deleted outright: they prove the fallback works and say nothing about the relocation. This
// suite drives the world arm directly, and pins the union that keeps an unmigrated client working.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveCharacterLibrariesStore,
  resolveCharacterPrerequisiteLibrary,
  resolveModifierLibrary,
} from '../src/systems/characterLibraries.js';

const WORLD_MOD = { id: 'world-med', label: 'Medicine', expression: '@abilities.med.mod' };
const LEGACY_MOD = { id: 'legacy-nature', label: 'Nature', expression: '@abilities.nat.mod' };
const WORLD_PRE = { id: 'world-smith', name: "Smith's", path: 'a', op: 'gte', value: 1 };
const LEGACY_PRE = { id: 'legacy-arcana', name: 'Arcana', path: 'b', op: 'gte', value: 1 };

function store({ seeded = true, modifiers = [], prerequisites = [] } = {}) {
  return {
    isSeeded: () => seeded,
    listModifiers: () => modifiers,
    listCharacterPrerequisites: () => prerequisites,
  };
}

test('reads the WORLD library when the setting has been written', () => {
  const seam = store({ modifiers: [WORLD_MOD], prerequisites: [WORLD_PRE] });
  assert.deepEqual(resolveModifierLibrary(null, seam), [WORLD_MOD]);
  assert.deepEqual(resolveCharacterPrerequisiteLibrary(null, seam), [WORLD_PRE]);
});

// The window this union exists for: migrations run on the ACTIVE GM alone, so every player and
// every assistant GM reads an unwritten setting for at least one session. Without the fallback
// their tools, books and checks resolve nothing at all.
test('falls back to the system’s surviving legacy copy while the setting is UNWRITTEN', () => {
  const seam = store({ seeded: false });
  const system = { modifiers: [LEGACY_MOD], characterPrerequisites: [LEGACY_PRE] };
  assert.deepEqual(resolveModifierLibrary(system, seam), [LEGACY_MOD]);
  assert.deepEqual(resolveCharacterPrerequisiteLibrary(system, seam), [LEGACY_PRE]);
});

test('UNIONS the two while a world is half migrated, world entries first', () => {
  const seam = store({ modifiers: [WORLD_MOD], prerequisites: [WORLD_PRE] });
  const system = { modifiers: [LEGACY_MOD], characterPrerequisites: [LEGACY_PRE] };
  assert.deepEqual(
    resolveModifierLibrary(system, seam).map((entry) => entry.id),
    ['world-med', 'legacy-nature']
  );
  assert.deepEqual(
    resolveCharacterPrerequisiteLibrary(system, seam).map((entry) => entry.id),
    ['world-smith', 'legacy-arcana']
  );
});

// The world wins an id collision, matching the migration's first-wins merge — otherwise a GM's
// edit to a lifted entry would be shadowed by the stale system copy it was lifted from.
test('the WORLD entry wins an id collision, so an edit is never shadowed by the legacy copy', () => {
  const edited = { ...WORLD_MOD, label: 'Edited' };
  const seam = store({ modifiers: [edited] });
  const resolved = resolveModifierLibrary({ modifiers: [WORLD_MOD] }, seam);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].label, 'Edited');
});

test('answers with an empty list, never undefined, when nothing can be resolved', () => {
  assert.deepEqual(resolveModifierLibrary(null, store({ seeded: false })), []);
  assert.deepEqual(resolveCharacterPrerequisiteLibrary(undefined, null), []);
  assert.deepEqual(resolveModifierLibrary({ modifiers: 'junk' }, store({ seeded: false })), []);
});

test('a seam that THROWS degrades to the legacy copy rather than propagating', () => {
  const thrower = () => {
    throw new Error('not registered yet');
  };
  assert.equal(resolveCharacterLibrariesStore(thrower), null);
  assert.deepEqual(resolveModifierLibrary({ modifiers: [LEGACY_MOD] }, thrower), [LEGACY_MOD]);
});

// The seam is a store OR a getter for one, because production resolves it lazily —
// `game.fabricate` is not populated when the readers' owners are constructed.
test('accepts the store itself or a getter for it', () => {
  const seam = store({ modifiers: [WORLD_MOD] });
  assert.deepEqual(resolveModifierLibrary(null, seam), [WORLD_MOD]);
  assert.deepEqual(resolveModifierLibrary(null, () => seam), [WORLD_MOD]);
});

// The module registry is the production path: no call site passes a seam, so a broken global
// lookup would leave every runtime reader on the legacy arm and nothing would say so.
test('falls back to the game.fabricate accessor when no seam is passed', () => {
  const previous = globalThis.game;
  globalThis.game = {
    fabricate: { getCharacterLibrariesStore: () => store({ modifiers: [WORLD_MOD] }) },
  };
  try {
    assert.deepEqual(resolveModifierLibrary(null), [WORLD_MOD]);
  } finally {
    globalThis.game = previous;
  }
});
